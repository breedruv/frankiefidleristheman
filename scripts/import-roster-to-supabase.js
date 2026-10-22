import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), ".env.local") });

const csvPath = path.join(process.cwd(), "roster.csv");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const season = Number(process.argv[2] || 2025);

if (!supabaseUrl || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
if (!fs.existsSync(csvPath)) throw new Error("roster.csv was not found.");

const rows = parse(fs.readFileSync(csvPath, "utf8"), { columns: true, skip_empty_lines: true, trim: true, bom: true });
const asNumber = (value) => value === undefined || value === "" ? null : Number(value);
const asBoolean = (value) => ["active", "true", "1", "yes"].includes(String(value || "").toLowerCase());
const unique = (items, key) => [...new Map(items.map((item) => [item[key], item])).values()];

async function upsert(table, data, onConflict) {
  if (!data.length) return;
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(`${table} import failed (${response.status}): ${await response.text()}`);
}

const teams = unique(rows.filter((row) => row.teamID).map((row) => ({
  team_id: asNumber(row.teamID), name: row["Team Name"] || null, display_name: row["Team Name"] || null
})), "team_id");
const players = rows.filter((row) => row.playerID).map((row) => ({
  player_id: asNumber(row.playerID), team_id: asNumber(row.teamID), player_number: row["Player Number"] || null,
  headshot: row.headshot || null, first_name: row.playerFirstName || null, last_name: row.playerLastName || null,
  short_name: row.playerShortName || null, short_name_abbr: row["Short Name and abbr"] || null,
  height: asNumber(row.playerHeight), display_height: row.playerDisplayHeight || null, weight: asNumber(row.playerWeight),
  position: row.playerPosition || null, experience: row.playerExperienceDisplayValue || null
}));
const rosters = rows.filter((row) => row.teamID && row.playerID).map((row) => ({
  team_id: asNumber(row.teamID), player_id: asNumber(row.playerID), season, is_active: asBoolean(row["is Active"])
}));

await upsert("teams", teams, "team_id");
await upsert("players", players, "player_id");
await upsert("team_rosters", rosters, "team_id,player_id,season");
console.log(`Imported ${players.length} players across ${teams.length} teams for season ${season}.`);
