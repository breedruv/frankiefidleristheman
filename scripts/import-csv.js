// Legacy CSV importer. The current pipeline uses python/espn_ingest.py.
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { Pool } = require("pg");

const ROOT = process.cwd();
const envPath = path.join(ROOT, ".env.local");

if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  require("dotenv").config();
}

const FILES = {
  roster: path.join(ROOT, "roster.csv"),
  playerStats: path.join(ROOT, "player stats.csv"),
  plays: path.join(ROOT, "2026_cbb_plays.csv")
};

const SEASON_OVERRIDE = (() => {
  const flagIndex = process.argv.indexOf("--season");
  if (flagIndex !== -1) {
    const value = Number(process.argv[flagIndex + 1]);
    return Number.isFinite(value) ? value : null;
  }
  return null;
})();

function mustHaveEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local before running this script.");
  }
}

function loadCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

function toInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function toBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  return ["true", "1", "yes", "y"].includes(normalized);
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function applySchema(pool) {
  const schemaPath = path.join(ROOT, "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
}

async function importRoster(pool) {
  const rows = loadCsv(FILES.roster);
  if (rows.length === 0) {
    console.log("No roster.csv found or file is empty.");
    return;
  }

  for (const row of rows) {
    const teamId = toText(row["teamID"]);
    const teamName = toText(row["Team Name"]);
    if (teamId) {
      await pool.query(
        `
        INSERT INTO teams (team_id, team_name)
        VALUES ($1, $2)
        ON CONFLICT (team_id) DO UPDATE SET team_name = EXCLUDED.team_name;
        `,
        [teamId, teamName]
      );
    }

    const playerId = toText(row["playerID"]);
    if (!playerId) continue;

    await pool.query(
      `
      INSERT INTO players (
        player_id,
        team_id,
        player_number,
        headshot,
        first_name,
        last_name,
        short_name,
        short_name_abbr,
        height,
        display_height,
        weight,
        position,
        experience,
        is_active
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      ON CONFLICT (player_id) DO UPDATE SET
        team_id = EXCLUDED.team_id,
        player_number = EXCLUDED.player_number,
        headshot = EXCLUDED.headshot,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        short_name = EXCLUDED.short_name,
        short_name_abbr = EXCLUDED.short_name_abbr,
        height = EXCLUDED.height,
        display_height = EXCLUDED.display_height,
        weight = EXCLUDED.weight,
        position = EXCLUDED.position,
        experience = EXCLUDED.experience,
        is_active = EXCLUDED.is_active;
      `,
      [
        playerId,
        teamId,
        toText(row["Player Number"]),
        toText(row["headshot"]),
        toText(row["playerFirstName"]),
        toText(row["playerLastName"]),
        toText(row["playerShortName"]),
        toText(row["Short Name and abbr"]),
        toText(row["playerHeight"]),
        toText(row["playerDisplayHeight"]),
        toText(row["playerWeight"]),
        toText(row["playerPosition"]),
        toText(row["playerExperienceDisplayValue"]),
        toBoolean(row["is Active"])
      ]
    );
  }

  console.log(`Imported roster rows: ${rows.length}`);
}

async function importPlayerStats(pool) {
  const rows = loadCsv(FILES.playerStats);
  if (rows.length === 0) {
    console.log("No player stats.csv found or file is empty.");
    return;
  }

  for (const row of rows) {
    const gameId = toText(row["Game ID"]);
    const playerId = toText(row["Player ID"]);
    if (!gameId || !playerId) continue;

    const gameDate = toDate(row["Date"]);
    const derivedSeason = gameDate ? gameDate.getFullYear() : null;
    const season = SEASON_OVERRIDE || derivedSeason;

    await pool.query(
      `
      INSERT INTO player_games (
        game_id,
        player_id,
        game_date,
        team_id,
        pts,
        fgm,
        fga,
        tpm,
        tpa,
        ftm,
        fta,
        reb,
        ast,
        turnovers,
        stl,
        blocks,
        oreb,
        dreb,
        pf,
        minutes,
        season
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      )
      ON CONFLICT (game_id, player_id) DO UPDATE SET
        game_date = EXCLUDED.game_date,
        team_id = EXCLUDED.team_id,
        pts = EXCLUDED.pts,
        fgm = EXCLUDED.fgm,
        fga = EXCLUDED.fga,
        tpm = EXCLUDED.tpm,
        tpa = EXCLUDED.tpa,
        ftm = EXCLUDED.ftm,
        fta = EXCLUDED.fta,
        reb = EXCLUDED.reb,
        ast = EXCLUDED.ast,
        turnovers = EXCLUDED.turnovers,
        stl = EXCLUDED.stl,
        blocks = EXCLUDED.blocks,
        oreb = EXCLUDED.oreb,
        dreb = EXCLUDED.dreb,
        pf = EXCLUDED.pf,
        minutes = EXCLUDED.minutes,
        season = EXCLUDED.season;
      `,
      [
        gameId,
        playerId,
        gameDate,
        toText(row["TEAM ID"]),
        toInt(row["PTS"]),
        toInt(row["FGM"]),
        toInt(row["FGA"]),
        toInt(row["3PTM"]),
        toInt(row["3PTA"]),
        toInt(row["FTM"]),
        toInt(row["FTA"]),
        toInt(row["REB"]),
        toInt(row["AST"]),
        toInt(row["TO"]),
        toInt(row["STL"]),
        toInt(row["Blocks"]),
        toInt(row["OREB"]),
        toInt(row["DREB"]),
        toInt(row["PF"]),
        toNumber(row["MIN"]),
        season
      ]
    );
  }

  console.log(`Imported player stats rows: ${rows.length}`);
}

async function importPlays(pool) {
  const rows = loadCsv(FILES.plays);
  if (rows.length === 0) {
    console.log("No 2026_cbb_plays.csv found or file is empty.");
    return;
  }

  for (const row of rows) {
    const gameId = toText(row["Game ID"]);
    const playIndex = toInt(row["Play Index"]);
    if (!gameId || playIndex === null) continue;

    await pool.query(
      `
      INSERT INTO plays (
        game_id,
        play_index,
        play_id,
        type_id,
        type_text,
        play_text,
        away_score,
        home_score,
        period,
        period_display,
        clock,
        team_id,
        player_ids,
        coord_x,
        coord_y
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      )
      ON CONFLICT (game_id, play_index) DO UPDATE SET
        play_id = EXCLUDED.play_id,
        type_id = EXCLUDED.type_id,
        type_text = EXCLUDED.type_text,
        play_text = EXCLUDED.play_text,
        away_score = EXCLUDED.away_score,
        home_score = EXCLUDED.home_score,
        period = EXCLUDED.period,
        period_display = EXCLUDED.period_display,
        clock = EXCLUDED.clock,
        team_id = EXCLUDED.team_id,
        player_ids = EXCLUDED.player_ids,
        coord_x = EXCLUDED.coord_x,
        coord_y = EXCLUDED.coord_y;
      `,
      [
        gameId,
        playIndex,
        toText(row["Play ID"]),
        toInt(row["Type ID"]),
        toText(row["Type Text"]),
        toText(row["Play Text"]),
        toInt(row["Away Score"]),
        toInt(row["Home Score"]),
        toInt(row["Period"]),
        toText(row["Period Display"]),
        toText(row["Clock"]),
        toText(row["Team ID"]),
        toText(row["Player IDs"]),
        toNumber(row["Coord X"]),
        toNumber(row["Coord Y"])
      ]
    );
  }

  console.log(`Imported play rows: ${rows.length}`);
}

async function main() {
  mustHaveEnv();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await applySchema(pool);
    await importRoster(pool);
    await importPlayerStats(pool);

    if (!process.argv.includes("--skip-plays")) {
      await importPlays(pool);
    } else {
      console.log("Skipping plays import (--skip-plays).\n");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
