import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const sourcePath = path.join(process.cwd(), "2026_cbb_plays.csv");
const outputPath = path.join(process.cwd(), "player shots.csv");
const shotTypes = new Set(["JumpShot", "LayUpShot", "DunkShot", "TipShot", "MadeFreeThrow"]);
const rows = parse(fs.readFileSync(sourcePath, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
const shots = rows.flatMap((row) => {
  if (!shotTypes.has(row["Type Text"]) || !row["Player IDs"] || row["Coord X"] === "" || row["Coord Y"] === "") return [];
  const [playerId] = row["Player IDs"].split(/\s+/);
  const text = row["Play Text"] || "";
  const made = /\bmade\b/i.test(text);
  const shotType = row["Type Text"] === "MadeFreeThrow" ? "Free Throw" : /Three Point/i.test(text) ? "Three" : row["Type Text"].replace("Shot", "");
  return [{ game_id: row["Game ID"], play_id: row["Play ID"], play_index: row["Play Index"], player_id: playerId, team_id: row["Team ID"], period: row.Period, clock: row.Clock, shot_type: shotType, result: made ? "Made" : "Missed", coord_x: row["Coord X"], coord_y: row["Coord Y"] }];
});
const columns = ["game_id", "play_id", "play_index", "player_id", "team_id", "period", "clock", "shot_type", "result", "coord_x", "coord_y"];
const csvCell = (value) => { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
fs.writeFileSync(outputPath, [columns.join(","), ...shots.map((shot) => columns.map((column) => csvCell(shot[column])).join(","))].join("\n"));
console.log(`Created ${path.basename(outputPath)} with ${shots.length} shot records from ${rows.length} plays.`);
