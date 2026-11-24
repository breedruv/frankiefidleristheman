-- Live scoring migration (2026-11-01). Copied from db/schema.sql so it can be applied on its own;
-- schema.sql remains the source of truth. Run in the Supabase SQL editor or with: npm run supabase:live-scoring
BEGIN;

-- In-progress stats for lineup players only; rows are deleted once the final box score lands in player_games.
CREATE TABLE IF NOT EXISTS live_player_games (
  game_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  game_date DATE,
  team_id INTEGER,
  pts INTEGER,
  fgm INTEGER,
  fga INTEGER,
  tpm INTEGER,
  tpa INTEGER,
  ftm INTEGER,
  fta INTEGER,
  reb INTEGER,
  ast INTEGER,
  turnovers INTEGER,
  stl INTEGER,
  blocks INTEGER,
  oreb INTEGER,
  dreb INTEGER,
  pf INTEGER,
  minutes NUMERIC,
  season INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, player_id)
);

ALTER TABLE live_player_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS live_player_games_public_read ON live_player_games;
CREATE POLICY live_player_games_public_read ON live_player_games FOR SELECT USING (true);

-- One row per ESPN request from the live refresh, used to measure rate limits by endpoint and source (web vs pc).
CREATE TABLE IF NOT EXISTS espn_request_log (
  id BIGSERIAL PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  game_id INTEGER,
  status INTEGER,
  duration_ms INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_espn_request_log_time ON espn_request_log(requested_at);
ALTER TABLE espn_request_log ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS fantasy_lineup_scores(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS fantasy_lineup_scores(INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION fantasy_lineup_scores(
  season_param INTEGER,
  week_param INTEGER,
  season_type_param TEXT DEFAULT 'regular'
)
RETURNS TABLE (
  season INTEGER,
  season_type TEXT,
  week INTEGER,
  fantasy_team_id INTEGER,
  starter_points INTEGER,
  t1_points INTEGER,
  t2_points INTEGER,
  total_points INTEGER
)
LANGUAGE sql AS $$
  WITH week_range AS (
    SELECT start_date, end_date
    FROM fantasy_weeks
    WHERE season = season_param
      AND season_type = season_type_param
      AND week = week_param
  ),
  lineups AS (
    SELECT *
    FROM fantasy_lineups
    WHERE season = season_param
      AND season_type = season_type_param
      AND week = week_param
  ),
  slots AS (
    SELECT season, season_type, week, fantasy_team_id, center_id AS player_id, center_game_id AS game_id, true AS is_starter, 'C' AS slot
    FROM lineups
    UNION ALL
    SELECT season, season_type, week, fantasy_team_id, forward1_id AS player_id, forward1_game_id AS game_id, true AS is_starter, 'F1' AS slot
    FROM lineups
    UNION ALL
    SELECT season, season_type, week, fantasy_team_id, forward2_id AS player_id, forward2_game_id AS game_id, true AS is_starter, 'F2' AS slot
    FROM lineups
    UNION ALL
    SELECT season, season_type, week, fantasy_team_id, guard1_id AS player_id, guard1_game_id AS game_id, true AS is_starter, 'G1' AS slot
    FROM lineups
    UNION ALL
    SELECT season, season_type, week, fantasy_team_id, guard2_id AS player_id, guard2_game_id AS game_id, true AS is_starter, 'G2' AS slot
    FROM lineups
    UNION ALL
    SELECT season, season_type, week, fantasy_team_id, t1_id AS player_id, t1_game_id AS game_id, false AS is_starter, 'T1' AS slot
    FROM lineups
    UNION ALL
    SELECT season, season_type, week, fantasy_team_id, t2_id AS player_id, t2_game_id AS game_id, false AS is_starter, 'T2' AS slot
    FROM lineups
  ),
  chosen AS (
    SELECT
      s.season,
      s.season_type,
      s.week,
      s.fantasy_team_id,
      s.is_starter,
      s.slot,
      s.player_id,
      COALESCE(
        s.game_id,
        fg.game_id
      ) AS chosen_game_id
    FROM slots s
    LEFT JOIN players p ON p.player_id = s.player_id
    LEFT JOIN LATERAL (
      SELECT g.game_id
      FROM games g
      JOIN week_range w
        ON g.game_date >= w.start_date
       AND g.game_date <= w.end_date
      WHERE p.team_id IS NOT NULL
        AND (g.home_team_id = p.team_id OR g.away_team_id = p.team_id)
      ORDER BY g.game_date ASC NULLS LAST, g.game_id ASC
      LIMIT 1
    ) fg ON true
  ),
  games AS (
    SELECT
      c.season,
      c.season_type,
      c.week,
      c.fantasy_team_id,
      c.is_starter,
      c.slot,
      COALESCE(pg.pts, lpg.pts) AS pts
    FROM chosen c
    LEFT JOIN player_games pg
      ON pg.player_id = c.player_id
     AND pg.game_id = c.chosen_game_id
    LEFT JOIN live_player_games lpg
      ON lpg.player_id = c.player_id
     AND lpg.game_id = c.chosen_game_id
  )
  SELECT
    season,
    season_type,
    week,
    fantasy_team_id,
    COALESCE(SUM(pts) FILTER (WHERE is_starter), 0) AS starter_points,
    COALESCE(SUM(pts) FILTER (WHERE slot = 'T1'), 0) AS t1_points,
    COALESCE(SUM(pts) FILTER (WHERE slot = 'T2'), 0) AS t2_points,
    COALESCE(SUM(pts) FILTER (WHERE is_starter), 0) AS total_points
  FROM games
  GROUP BY season, season_type, week, fantasy_team_id;
$$;

DROP FUNCTION IF EXISTS fantasy_lineup_details(INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS fantasy_lineup_details(INTEGER, INTEGER, TEXT, INTEGER);
DROP FUNCTION IF EXISTS fantasy_lineup_details(INTEGER, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION fantasy_lineup_details(
  season_param INTEGER,
  week_param INTEGER,
  team_param INTEGER,
  season_type_param TEXT DEFAULT 'regular'
)
RETURNS TABLE (
  slot TEXT,
  player_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  team_id INTEGER,
  team_abbr TEXT,
  game_datetime TIMESTAMPTZ,
  game_date DATE,
  points INTEGER,
  status TEXT
)
LANGUAGE sql AS $$
  WITH week_range AS (
    SELECT start_date, end_date
    FROM fantasy_weeks
    WHERE season = season_param
      AND season_type = season_type_param
      AND week = week_param
  ),
  lineup AS (
    SELECT *
    FROM fantasy_lineups
    WHERE season = season_param
      AND season_type = season_type_param
      AND week = week_param
      AND fantasy_team_id = team_param
  ),
  slots AS (
    SELECT 'C'::text AS slot, center_id AS player_id, center_game_id AS game_id FROM lineup
    UNION ALL SELECT 'F1', forward1_id, forward1_game_id FROM lineup
    UNION ALL SELECT 'F2', forward2_id, forward2_game_id FROM lineup
    UNION ALL SELECT 'G1', guard1_id, guard1_game_id FROM lineup
    UNION ALL SELECT 'G2', guard2_id, guard2_game_id FROM lineup
    UNION ALL SELECT 'T1', t1_id, t1_game_id FROM lineup
    UNION ALL SELECT 'T2', t2_id, t2_game_id FROM lineup
  ),
  chosen AS (
    SELECT
      s.slot,
      s.player_id,
      COALESCE(
        s.game_id,
        fg.game_id
      ) AS chosen_game_id
    FROM slots s
    LEFT JOIN players p ON p.player_id = s.player_id
    LEFT JOIN LATERAL (
      SELECT g.game_id
      FROM games g
      JOIN week_range w
        ON g.game_date >= w.start_date
       AND g.game_date <= w.end_date
      WHERE p.team_id IS NOT NULL
        AND (g.home_team_id = p.team_id OR g.away_team_id = p.team_id)
      ORDER BY g.game_date ASC NULLS LAST, g.game_id ASC
      LIMIT 1
    ) fg ON true
  ),
  chosen_games AS (
    SELECT
      c.slot,
      c.player_id,
      g.game_datetime AS game_datetime,
      COALESCE(pg.game_date, g.game_date) AS game_date,
      COALESCE(pg.pts, lpg.pts)::INTEGER AS points,
      g.status
    FROM chosen c
    LEFT JOIN player_games pg
      ON pg.player_id = c.player_id
     AND pg.game_id = c.chosen_game_id
    LEFT JOIN live_player_games lpg
      ON lpg.player_id = c.player_id
     AND lpg.game_id = c.chosen_game_id
    LEFT JOIN games g ON g.game_id = c.chosen_game_id
  )
  SELECT
    s.slot,
    p.player_id,
    p.first_name,
    p.last_name,
    p.team_id,
    t.abbreviation AS team_abbr,
    cg.game_datetime,
    cg.game_date,
    cg.points,
    cg.status
  FROM slots s
  LEFT JOIN players p ON p.player_id = s.player_id
  LEFT JOIN teams t ON t.team_id = p.team_id
  LEFT JOIN chosen_games cg
    ON cg.player_id = s.player_id
   AND cg.slot = s.slot;
$$;

COMMIT;
