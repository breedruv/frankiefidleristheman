import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), ".env.local") });
const csvPath = path.join(process.cwd(), "player stats.csv");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const season = Number(process.argv[2] || 2025);
if (!supabaseUrl || !serviceKey) throw new Error("Supabase URL and service role key are required.");
if (!fs.existsSync(csvPath)) throw new Error("player stats.csv was not found.");

const rows = parse(fs.readFileSync(csvPath, "utf8"), { columns: true, skip_empty_lines: true, trim: true, bom: true });
const numberOrNull = (value) => value === undefined || value === "" ? null : Number(value);
const dateValue = (value) => { const [month, day, year] = String(value || "").split("/"); return month && day && year ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : null; };

async function upsert(rowsToSend) {
  const response = await fetch(`${supabaseUrl}/rest/v1/player_games?on_conflict=game_id%2Cplayer_id`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rowsToSend)
  });
  if (!response.ok) throw new Error(`player_games import failed (${response.status}): ${await response.text()}`);
}

async function existingPlayerIds() {
  const ids = new Set();
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${supabaseUrl}/rest/v1/players?select=player_id&offset=${offset}&limit=1000`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!response.ok) throw new Error(`Could not read players (${response.status}): ${await response.text()}`);
    const page = await response.json();
    page.forEach((row) => ids.add(Number(row.player_id)));
    if (page.length < 1000) break;
  }
  return ids;
}

async function existingTeamIds() {
  const response = await fetch(`${supabaseUrl}/rest/v1/teams?select=team_id&limit=10000`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!response.ok) throw new Error(`Could not read teams (${response.status}): ${await response.text()}`);
  return new Set((await response.json()).map((row) => Number(row.team_id)));
}

const playerIds = await existingPlayerIds();
const teamIds = await existingTeamIds();
const mapped = rows.map((row) => ({
  game_id: numberOrNull(row["Game ID"]), player_id: numberOrNull(row["Player ID"]), game_date: dateValue(row.Date),
  team_id: numberOrNull(row["TEAM ID"]), pts: numberOrNull(row.PTS), fgm: numberOrNull(row.FGM), fga: numberOrNull(row.FGA),
  tpm: numberOrNull(row["3PTM"]), tpa: numberOrNull(row["3PTA"]), ftm: numberOrNull(row.FTM), fta: numberOrNull(row.FTA),
  reb: numberOrNull(row.REB), ast: numberOrNull(row.AST), turnovers: numberOrNull(row.TO), stl: numberOrNull(row.STL),
  blocks: numberOrNull(row.Blocks), oreb: numberOrNull(row.OREB), dreb: numberOrNull(row.DREB), pf: numberOrNull(row.PF),
  minutes: numberOrNull(row.MIN), season
})).filter((row) => Number.isInteger(row.game_id) && Number.isInteger(row.player_id) && playerIds.has(row.player_id)).map((row) => ({ ...row, team_id: teamIds.has(row.team_id) ? row.team_id : null }));
const skippedRows = rows.length - mapped.length;

for (let index = 0; index < mapped.length; index += 500) {
  await upsert(mapped.slice(index, index + 500));
  process.stdout.write(`\rImported ${Math.min(index + 500, mapped.length)} of ${mapped.length} player-game rows`);
}
const refresh = await fetch(`${supabaseUrl}/rest/v1/rpc/refresh_player_stat_averages`, {
  method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ season_param: season })
});
if (!refresh.ok) throw new Error(`Average refresh failed (${refresh.status}): ${await refresh.text()}`);
console.log(`\nImported ${mapped.length} rows and refreshed ${season} averages. Skipped ${skippedRows} rows with missing players or invalid IDs.`);
