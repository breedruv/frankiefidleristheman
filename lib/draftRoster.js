import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const rosterFile = path.join(process.cwd(), "roster.csv");
const useCsvRosterBackup = process.env.USE_CSV_ROSTER_BACKUP !== "false";
function eligiblePositions(row) {
  const listed = row.playerPosition === "F-C" ? ["F", "C"] : row.playerPosition === "G-F" ? ["G", "F"] : [row.playerPosition];
  const height = Number(row.playerHeight);
  // Keep the source-listed position, but make players 82 inches or taller
  // eligible for Center as an additional draft position.
  if (height >= 82) listed.push("C");
  return [...new Set(listed.filter(Boolean))];
}

export function searchDraftRoster(query = "", playerId = null) {
  if (!fs.existsSync(rosterFile)) return [];
  const normalized = query.trim().toLowerCase();
  const rows = parse(fs.readFileSync(rosterFile, "utf8"), { columns: true, skip_empty_lines: true, bom: true }).filter((row) => playerId === null || Number(row.playerID) === playerId);
  return rows.flatMap((row) => eligiblePositions(row).map((position) => ({ playerId: Number(row.playerID), name: `${row.playerFirstName} ${row.playerLastName}`.trim(), searchName: row.playerShortName, college: row["Team Name"], position, listedPosition: row.playerPosition, height: Number(row.playerHeight) || null, headshot: row.headshot || `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${row.playerID}.png` }))).filter((player) => !normalized || `${player.name} ${player.searchName} ${player.college} ${player.position}`.toLowerCase().includes(normalized)).slice(0, 30);
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

