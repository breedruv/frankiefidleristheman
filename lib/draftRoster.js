import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const rosterFile = path.join(process.cwd(), "roster.csv");
function eligiblePositions(row) {
  const listed = row.playerPosition === "F-C" ? ["F", "C"] : row.playerPosition === "G-F" ? ["G", "F"] : [row.playerPosition];
  const height = Number(row.playerHeight);
  // Keep the source-listed position, but make players 82 inches or taller
  // eligible for Center as an additional draft position.
  if (height >= 82) listed.push("C");
  return [...new Set(listed.filter(Boolean))];
}

export function searchDraftRoster(query = "") {
  if (!fs.existsSync(rosterFile)) return [];
  const normalized = query.trim().toLowerCase();
  const rows = parse(fs.readFileSync(rosterFile, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  return rows.flatMap((row) => eligiblePositions(row).map((position) => ({ playerId: Number(row.playerID), name: `${row.playerFirstName} ${row.playerLastName}`.trim(), searchName: row.playerShortName, college: row["Team Name"], position, listedPosition: row.playerPosition, height: Number(row.playerHeight) || null, headshot: row.headshot || `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${row.playerID}.png` }))).filter((player) => !normalized || `${player.name} ${player.searchName} ${player.college} ${player.position}`.toLowerCase().includes(normalized)).slice(0, 30);
}

