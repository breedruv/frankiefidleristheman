const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { parse } = require("csv-parse/sync");
const { Pool } = require("pg");
const ROOT = process.cwd();
let FANTASY_CSV_TABLES = [];

function mustHaveEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local before running this script.");
  }
}

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  require("dotenv").config({ path: envPath });
}

function toNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function toInt(value) {
  const cleaned = toNull(value);
  if (cleaned === null) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toBool(value) {
  const cleaned = toNull(value);
  if (cleaned === null) return null;
  return ["1", "true", "yes", "y"].includes(cleaned.toLowerCase());
}

function mapRows(tableKey, rows) {
  return rows.map((row) => {
    switch (tableKey) {
      case "fantasyTeams":
        return {
          fantasy_team_id: toInt(row.fantasy_team_id),
          name: toNull(row.name),
          short_code: toNull(row.short_code),
          logo_url: toNull(row.logo_url)
        };
      case "fantasyTeamSeasons":
        return {
          season: toInt(row.season),
          fantasy_team_id: toInt(row.fantasy_team_id),
          draft_order: toInt(row.draft_order)
        };
      case "fantasyRosters":
        return {
          season: toInt(row.season),
          fantasy_team_id: toInt(row.fantasy_team_id),
          player_id: toInt(row.player_id),
          player_position: toNull(row.player_position)
        };
      case "fantasyRosterMoves":
        return {
          season: toInt(row.season),
          player_id: toInt(row.player_id),
          from_team_id: toInt(row.from_team_id),
          to_team_id: toInt(row.to_team_id),
          move_date: toNull(row.move_date),
          note: toNull(row.note)
        };
      case "fantasyMatchups":
        return {
          season: toInt(row.season),
          season_type: toNull(row.season_type) || "regular",
          week: toInt(row.week),
          fantasy_team_id: toInt(row.fantasy_team_id),
          opponent_fantasy_team_id: toInt(row.opponent_fantasy_team_id)
        };
      case "fantasyLineups":
        return {
          season: toInt(row.season),
          season_type: toNull(row.season_type) || "regular",
          week: toInt(row.week),
          fantasy_team_id: toInt(row.fantasy_team_id),
          center_id: toInt(row.center_id),
          center_game_id: toInt(row.center_game_id),
          forward1_id: toInt(row.forward1_id),
          forward1_game_id: toInt(row.forward1_game_id),
          forward2_id: toInt(row.forward2_id),
          forward2_game_id: toInt(row.forward2_game_id),
          guard1_id: toInt(row.guard1_id),
          guard1_game_id: toInt(row.guard1_game_id),
          guard2_id: toInt(row.guard2_id),
          guard2_game_id: toInt(row.guard2_game_id),
          t1_id: toInt(row.t1_id),
          t1_game_id: toInt(row.t1_game_id),
          t2_id: toInt(row.t2_id),
          t2_game_id: toInt(row.t2_game_id)
        };
      case "fantasyWeeks":
        return {
          season: toInt(row.season),
          season_type: toNull(row.season_type) || "regular",
          week: toInt(row.week),
          label: toNull(row.label),
          start_date: toNull(row.start_date),
          end_date: toNull(row.end_date),
          is_dynamic: toBool(row.is_dynamic),
          notes: toNull(row.notes)
        };
      default:
        return row;
    }
  });
}

function parseCsvText(text) {
  const normalized = text.replace(/^\uFEFF/, "");
  return parse(normalized, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

async function readInputFiles(options) {
  const entries = [];
  if (options.zipPath) {
    const zip = await JSZip.loadAsync(fs.readFileSync(options.zipPath));
    for (const table of FANTASY_CSV_TABLES) {
      const zipEntry = zip.file(table.filename);
      if (!zipEntry) continue;
      const text = await zipEntry.async("string");
      entries.push({ table, text, source: `ZIP:${table.filename}` });
    }
  } else if (options.dirPath) {
    for (const table of FANTASY_CSV_TABLES) {
      const filePath = path.join(options.dirPath, table.filename);
      if (!fs.existsSync(filePath)) continue;
      entries.push({ table, text: fs.readFileSync(filePath, "utf8"), source: filePath });
    }
  } else {
    for (const table of FANTASY_CSV_TABLES) {
      const filePath = path.join(ROOT, table.filename);
      if (!fs.existsSync(filePath)) continue;
      entries.push({ table, text: fs.readFileSync(filePath, "utf8"), source: filePath });
    }
  }
  return entries;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    zipPath: args[0] === "--zip" ? args[1] : null,
    dirPath: args[0] === "--dir" ? args[1] : null
  };
}

async function main() {
  loadEnvLocal();
  mustHaveEnv();
  const fantasyCsv = await import("../lib/fantasyCsv.js");
  FANTASY_CSV_TABLES = fantasyCsv.FANTASY_CSV_TABLES;
  const opts = parseArgs();
  const entries = await readInputFiles(opts);
  if (!entries.length) {
    console.log("No fantasy CSV files found.");
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const entry of entries) {
      const rows = parseCsvText(entry.text);
      const payload = mapRows(entry.table.key, rows).filter((row) =>
        Object.values(row).some((value) => value !== null && value !== undefined && value !== "")
      );
      if (!payload.length) {
        console.log(`${entry.table.label}: no valid rows`);
        continue;
      }
      const columns = Object.keys(payload[0]);
      const conflictColumns = entry.table.conflict;
      const updates = columns
        .filter((col) => !conflictColumns.split(",").includes(col))
        .map((col) => `${col} = EXCLUDED.${col}`)
        .join(", ");
      const valuesSql = payload
        .map((row, rowIndex) => {
          const offset = rowIndex * columns.length;
          const placeholders = columns.map((_, index) => `$${offset + index + 1}`).join(", ");
          return `(${placeholders})`;
        })
        .join(", ");
      const values = payload.flatMap((row) => columns.map((col) => row[col]));

      if (entry.table.table === "fantasy_roster_moves") {
        for (const row of payload) {
          await pool.query(
            `
            INSERT INTO fantasy_roster_moves (${columns.join(", ")})
            VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")});
            `,
            columns.map((col) => row[col])
          );
        }
      } else {
        await pool.query(
          `
          INSERT INTO ${entry.table.table} (${columns.join(", ")})
          VALUES ${valuesSql}
          ON CONFLICT (${conflictColumns}) DO UPDATE SET ${updates || columns[0] + " = EXCLUDED." + columns[0]};
          `,
          values
        );
      }

      console.log(`${entry.table.label}: ${payload.length} rows imported`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
