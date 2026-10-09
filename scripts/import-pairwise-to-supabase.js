require("dotenv").config({ path: ".env.local" });
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
const { Client } = require("pg");

const source = path.join("College Basketball", "outputs", "human_feedback", "player_comparisons.csv");
const value = (row, key) => row[key] === "" || row[key] == null ? null : Number.isFinite(Number(row[key])) ? Number(row[key]) : row[key];
const side = (row, prefix) => ({
  playerId: value(row, `${prefix} Player ID`), name: row[`${prefix} Player Name`], team: row[`${prefix} Team Name`], rosterClass: row[`${prefix} Roster Class`],
  rank: value(row, `${prefix} Rank`), projectedTotal: value(row, `${prefix} Projected Total PTS`), actualRemainder: value(row, `${prefix} Actual Remainder PTS`),
  ppg: value(row, `${prefix} Prior PPG`), mpg: value(row, `${prefix} Prior MPG`), games: value(row, `${prefix} Prior Games`), roll10: value(row, `${prefix} Roll 10 PPG`),
  career: value(row, `${prefix} Career Best PPG`), share: value(row, `${prefix} Player Team PTS Share`), risk: value(row, `${prefix} Role Fragility Score`),
  opportunity: value(row, `${prefix} Team Scoring Opportunity`), recruit: value(row, `${prefix} Recruiting Rank`), schedule: value(row, `${prefix} Schedule Net Difficulty`)
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in .env.local");
  if (!fs.existsSync(source)) throw new Error(`Missing ${source}`);
  const rows = parse(fs.readFileSync(source, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      await client.query(`INSERT INTO pairwise_comparisons (pair_id, season, pair_type, reason, projected_winner, actual_winner, player_a, player_b) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) ON CONFLICT (pair_id) DO UPDATE SET pair_type = EXCLUDED.pair_type, reason = EXCLUDED.reason, projected_winner = EXCLUDED.projected_winner, actual_winner = EXCLUDED.actual_winner, player_a = EXCLUDED.player_a, player_b = EXCLUDED.player_b`, [row["Pair ID"], 2026, row["Pair Type"], row.Reason, row["Projected Winner"] || null, row["Actual Winner"] || null, JSON.stringify(side(row, "A")), JSON.stringify(side(row, "B"))]);
    }
    await client.query("COMMIT");
    console.log(`Imported ${rows.length} pairwise comparisons into Supabase.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

