import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { getDraftPool } from "./queries";
import { getSourceProfiles } from "./sourceProfiles";
import { buildSourceProfile } from "./sourceProfiles.mjs";

const rosterFile = path.join(process.cwd(), "roster.csv");
const useCsvRosterBackup = process.env.USE_CSV_ROSTER_BACKUP !== "false";
let searchPool;
let searchPoolExpires = 0;
export async function searchDraftRoster(query = "", playerId = null) {
  const normalized = query.trim().toLowerCase();
  if (playerId === null && !normalized) return [];
  // shortcut: roster search can lag a sync by one minute; invalidate on sync if immediate updates become necessary.
  if (!searchPool || Date.now() >= searchPoolExpires) {
    searchPool = getDraftPool(5000);
    searchPoolExpires = Date.now() + 60_000;
  }
  let pool;
  try { pool = await searchPool; } catch (error) { searchPool = null; throw error; }
  if (!pool.length) searchPool = null;
  const rows = pool.filter((row) => playerId === null
    ? `${row.first_name || ""} ${row.last_name || ""} ${row.team_name || ""} ${row.position || ""}`.toLowerCase().includes(normalized)
    : Number(row.player_id) === playerId).slice(0, 30);
  if (!rows.length) return [];
  // Eligible positions combine every source (ESPN, CBS, Yahoo, Lindy's); the tallest listing at 82"+ adds C.
  const profiles = await getSourceProfiles();
  return rows.flatMap((row) => {
    const profile = profiles.get(Number(row.player_id)) || buildSourceProfile({ position: row.position, height: row.height });
    return profile.positions.map((position) => ({
      playerId: Number(row.player_id), name: `${row.first_name || ""} ${row.last_name || ""}`.trim(), searchName: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
      college: row.team_name, position, listedPosition: row.position, height: profile.height, positionSummary: profile.positionSummary,
      headshot: row.headshot || null
    }));
  }).slice(0, 30);
}

export function getDraftRosterPool(limit = 500) {
  if (!useCsvRosterBackup) return [];
  if (!fs.existsSync(rosterFile)) return [];
  const rows = parse(fs.readFileSync(rosterFile, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  return rows.slice(0, limit).map((row) => ({
    player_id: Number(row.playerID), first_name: row.playerFirstName, last_name: row.playerLastName,
    team_name: row["Team Name"], conference_name: "--", position: row.playerPosition, year: row.playerExperienceDisplayValue || "--",
    headshot: row.headshot || `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${row.playerID}.png`,
    ppg: null, mpg: null, last5_ppg: null, height: row.playerHeight, display_height: row.playerDisplayHeight
  }));
}

