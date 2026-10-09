require("dotenv").config({ path: ".env.local" });
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");

const source = path.join("College Basketball", "outputs", "human_feedback", "player_comparisons.csv");
const numberOrValue = (value) => value === "" || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : value;
const side = (row, prefix) => ({ playerId: numberOrValue(row[`${prefix} Player ID`]), name: row[`${prefix} Player Name`], team: row[`${prefix} Team Name`], rosterClass: row[`${prefix} Roster Class`], rank: numberOrValue(row[`${prefix} Rank`]), projectedTotal: numberOrValue(row[`${prefix} Projected Total PTS`]), actualRemainder: numberOrValue(row[`${prefix} Actual Remainder PTS`]), ppg: numberOrValue(row[`${prefix} Prior PPG`]), mpg: numberOrValue(row[`${prefix} Prior MPG`]), games: numberOrValue(row[`${prefix} Prior Games`]), roll10: numberOrValue(row[`${prefix} Roll 10 PPG`]), career: numberOrValue(row[`${prefix} Career Best PPG`]), share: numberOrValue(row[`${prefix} Player Team PTS Share`]), risk: numberOrValue(row[`${prefix} Role Fragility Score`]), opportunity: numberOrValue(row[`${prefix} Team Scoring Opportunity`]), recruit: numberOrValue(row[`${prefix} Recruiting Rank`]), schedule: numberOrValue(row[`${prefix} Schedule Net Difficulty`]) });

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  if (!fs.existsSync(source)) throw new Error(`Missing ${source}`);
  const rows = parse(fs.readFileSync(source, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  const records = rows.map((row) => ({ pair_id: row["Pair ID"], season: 2026, pair_type: row["Pair Type"], reason: row.Reason, projected_winner: row["Projected Winner"] || null, actual_winner: row["Actual Winner"] || null, player_a: side(row, "A"), player_b: side(row, "B") }));
  for (let index = 0; index < records.length; index += 100) {
    const response = await fetch(`${baseUrl}/rest/v1/pairwise_comparisons`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(records.slice(index, index + 100)) });
    if (!response.ok) throw new Error(`Supabase REST import failed (${response.status}): ${await response.text()}`);
    process.stdout.write(`Imported ${Math.min(index + 100, records.length)} / ${records.length}\r`);
  }
  console.log(`\nImported ${records.length} pairwise comparisons into Supabase REST.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

