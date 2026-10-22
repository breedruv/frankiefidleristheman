import path from "node:path";
import { config } from "dotenv";
import fs from "node:fs";
import { parse } from "csv-parse/sync";

config({ path: path.join(process.cwd(), ".env.local") });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schedulePath = process.env.SCHEDULE_CSV_PATH || path.resolve(process.cwd(), "..", "College basketball", "College-Basketball", "2026", "2026_cbb_available_games.csv");
if (!supabaseUrl || !serviceKey) throw new Error("Supabase URL and service role key are required.");

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
const teamsResponse = await fetch(`${supabaseUrl}/rest/v1/teams?select=team_id,name,display_name&limit=10000`, { headers });
if (!teamsResponse.ok) throw new Error(`Could not read teams (${teamsResponse.status}): ${await teamsResponse.text()}`);
const teams = await teamsResponse.json();
const gamesResponse = await fetch(`${supabaseUrl}/rest/v1/games?select=home_team_id,home_team_name,away_team_id,away_team_name&limit=10000`, { headers });
if (!gamesResponse.ok) throw new Error(`Could not read games (${gamesResponse.status}): ${await gamesResponse.text()}`);
const games = await gamesResponse.json();
const csvGames = fs.existsSync(schedulePath) ? parse(fs.readFileSync(schedulePath, "utf8"), { columns: true, skip_empty_lines: true, bom: true }) : [];
const scheduleRows = csvGames.map((game) => ({ game_id: Number(game["Game ID"]), game_date: game["Game Date"]?.replaceAll("/", "-"), season: 2025, home_team_id: Number(game["Home Team ID"]), home_team_name: game["Home Team Name"], away_team_id: Number(game["Away Team ID"]), away_team_name: game["Away Team Name"], status: "scheduled" })).filter((game) => Number.isInteger(game.game_id));
if (scheduleRows.length) {
  const scheduleUpsert = await fetch(`${supabaseUrl}/rest/v1/games?on_conflict=game_id`, { method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(scheduleRows) });
  if (!scheduleUpsert.ok) throw new Error(`Schedule import failed (${scheduleUpsert.status}): ${await scheduleUpsert.text()}`);
}
const scheduleTeams = [...games, ...scheduleRows].flatMap((game) => [
  { team_id: game.home_team_id, name: game.home_team_name },
  { team_id: game.away_team_id, name: game.away_team_name }
]).filter((team) => Number.isInteger(Number(team.team_id)));
const allTeams = [...new Map([...teams, ...scheduleTeams].map((team) => [Number(team.team_id), { team_id: Number(team.team_id), name: team.name || team.display_name || null, display_name: team.display_name || team.name || null }])).values()];
const updates = allTeams.map((team) => ({ ...team, logo_url: `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.team_id}.png` }));

const response = await fetch(`${supabaseUrl}/rest/v1/teams?on_conflict=team_id`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(updates)
});
if (!response.ok) throw new Error(`Team logo update failed (${response.status}): ${await response.text()}`);
console.log(`Imported ${scheduleRows.length} schedule games and updated ESPN logo links for ${updates.length} teams, including ${scheduleTeams.length ? new Set(scheduleTeams.map((team) => Number(team.team_id))).size : 0} schedule teams.`);
