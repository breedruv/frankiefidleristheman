import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const historyFile = path.join(process.cwd(), "Draft.csv");
const teamAliases = { "M/B": "MB", "A/S": "AS", "D/D": "DD" };

export function getDraftHistory(season = "2025", limit = null) {
  if (!["2025", "demo"].includes(season) || !fs.existsSync(historyFile)) return null;
  const rows = parse(fs.readFileSync(historyFile, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  const draftSlots = {};
  const rosterCounts = {};
  const rosterSlots = {};
  // Pick Number (column H) is the authoritative draft sequence. The CSV may
  // be grouped by team or round, so never rely on its physical row order.
  const orderedRows = rows
    .map((row, index) => ({ row, index, pickNumber: Number(row["Pick Number"]) }))
    .sort((a, b) => (a.pickNumber - b.pickNumber) || (a.index - b.index))
    .map(({ row }) => row);
  for (const row of orderedRows.slice(0, limit || orderedRows.length)) {
    const team = teamAliases[row.Team] || row.Team;
    const round = Number(row["Round number"]);
    const player = { name: row["Player Name"], position: row.Position, college: row["Team Name"], playerId: row["Player ID"], pickNumber: row["Pick Number"], teamCode: team, round };
    draftSlots[`${round}-${team}`] = player;
    const group = round >= 13 ? "SUP" : row.Position;
    rosterCounts[`${team}-${group}`] = (rosterCounts[`${team}-${group}`] || 0) + 1;
    rosterSlots[`${group}-${team}-${rosterCounts[`${team}-${group}`] - 1}`] = player;
  }
  return { season, draftSlots, rosterSlots };
}

