CREATE TABLE IF NOT EXISTS teams (
  team_id INTEGER PRIMARY KEY,
  slug TEXT,
  location TEXT,
  name TEXT,
  nickname TEXT,
  abbreviation TEXT,
  display_name TEXT,
  short_display_name TEXT,
  color TEXT,
  alternate_color TEXT,
  logo_url TEXT,
  conference_id TEXT,
  conference_name TEXT
);

CREATE TABLE IF NOT EXISTS players (
  player_id INTEGER PRIMARY KEY,
  team_id INTEGER REFERENCES teams(team_id),
  first_name TEXT,
  last_name TEXT,
  short_name TEXT,
  short_name_abbr TEXT,
  player_number TEXT,
  position TEXT,
  height INTEGER,
  display_height TEXT,
  weight INTEGER,
  experience TEXT,
  headshot TEXT,
  is_active BOOLEAN
);

CREATE TABLE IF NOT EXISTS team_rosters (
  team_id INTEGER NOT NULL REFERENCES teams(team_id),
  player_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  is_active BOOLEAN,
  PRIMARY KEY (team_id, player_id, season)
);

CREATE TABLE IF NOT EXISTS games (
  game_id INTEGER PRIMARY KEY,
  game_date DATE,
  game_datetime TIMESTAMPTZ,
  season INTEGER,
  home_team_id INTEGER,
  home_team_name TEXT,
  away_team_id INTEGER,
  away_team_name TEXT,
  status TEXT
);

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_datetime TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS player_games (
  game_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  game_date DATE,
  team_id INTEGER REFERENCES teams(team_id),
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
  PRIMARY KEY (game_id, player_id)
);

CREATE TABLE IF NOT EXISTS fantasy_teams (
  fantasy_team_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  logo_url TEXT
);

CREATE TABLE IF NOT EXISTS fantasy_team_seasons (
  season INTEGER NOT NULL,
  fantasy_team_id INTEGER NOT NULL REFERENCES fantasy_teams(fantasy_team_id),
  draft_order INTEGER,
  PRIMARY KEY (season, fantasy_team_id)
);

CREATE TABLE IF NOT EXISTS fantasy_rosters (
  season INTEGER NOT NULL,
  fantasy_team_id INTEGER NOT NULL REFERENCES fantasy_teams(fantasy_team_id),
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  player_position TEXT,
  PRIMARY KEY (season, fantasy_team_id, player_id)
);

CREATE TABLE IF NOT EXISTS fantasy_roster_moves (
  id SERIAL PRIMARY KEY,
  season INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  from_team_id INTEGER REFERENCES fantasy_teams(fantasy_team_id),
  to_team_id INTEGER REFERENCES fantasy_teams(fantasy_team_id),
  move_date DATE,
  note TEXT
);

CREATE TABLE IF NOT EXISTS fantasy_matchups (
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL DEFAULT 'regular',
  week INTEGER NOT NULL,
  fantasy_team_id INTEGER NOT NULL REFERENCES fantasy_teams(fantasy_team_id),
  opponent_fantasy_team_id INTEGER NOT NULL REFERENCES fantasy_teams(fantasy_team_id),
  PRIMARY KEY (season, season_type, week, fantasy_team_id)
);

CREATE TABLE IF NOT EXISTS fantasy_lineups (
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL DEFAULT 'regular',
  week INTEGER NOT NULL,
  fantasy_team_id INTEGER NOT NULL REFERENCES fantasy_teams(fantasy_team_id),
  center_id INTEGER REFERENCES players(player_id),
  center_game_id INTEGER REFERENCES games(game_id),
  forward1_id INTEGER REFERENCES players(player_id),
  forward1_game_id INTEGER REFERENCES games(game_id),
  forward2_id INTEGER REFERENCES players(player_id),
  forward2_game_id INTEGER REFERENCES games(game_id),
  guard1_id INTEGER REFERENCES players(player_id),
  guard1_game_id INTEGER REFERENCES games(game_id),
  guard2_id INTEGER REFERENCES players(player_id),
  guard2_game_id INTEGER REFERENCES games(game_id),
  t1_id INTEGER REFERENCES players(player_id),
  t1_game_id INTEGER REFERENCES games(game_id),
  t2_id INTEGER REFERENCES players(player_id),
  t2_game_id INTEGER REFERENCES games(game_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (season, season_type, week, fantasy_team_id)
);

ALTER TABLE fantasy_lineups
  ADD COLUMN IF NOT EXISTS center_game_id INTEGER REFERENCES games(game_id);
ALTER TABLE fantasy_lineups
  ADD COLUMN IF NOT EXISTS forward1_game_id INTEGER REFERENCES games(game_id);
ALTER TABLE fantasy_lineups
  ADD COLUMN IF NOT EXISTS forward2_game_id INTEGER REFERENCES games(game_id);
ALTER TABLE fantasy_lineups
  ADD COLUMN IF NOT EXISTS guard1_game_id INTEGER REFERENCES games(game_id);
ALTER TABLE fantasy_lineups
  ADD COLUMN IF NOT EXISTS guard2_game_id INTEGER REFERENCES games(game_id);
ALTER TABLE fantasy_lineups
  ADD COLUMN IF NOT EXISTS t1_game_id INTEGER REFERENCES games(game_id);
ALTER TABLE fantasy_lineups
  ADD COLUMN IF NOT EXISTS t2_game_id INTEGER REFERENCES games(game_id);

CREATE TABLE IF NOT EXISTS fantasy_weeks (
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL DEFAULT 'regular',
  week INTEGER NOT NULL,
  label TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_dynamic BOOLEAN DEFAULT FALSE,
  notes TEXT,
  PRIMARY KEY (season, season_type, week),
  CHECK (start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  run_type TEXT NOT NULL UNIQUE,
  last_run_at TIMESTAMPTZ,
  details TEXT
);

ALTER TABLE fantasy_weeks
  ADD COLUMN IF NOT EXISTS season_type TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE fantasy_matchups
  ADD COLUMN IF NOT EXISTS season_type TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE fantasy_lineups
  ADD COLUMN IF NOT EXISTS season_type TEXT NOT NULL DEFAULT 'regular';

CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_team_rosters_team ON team_rosters(team_id);
CREATE INDEX IF NOT EXISTS idx_player_games_player ON player_games(player_id);
CREATE INDEX IF NOT EXISTS idx_player_games_date ON player_games(game_date);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_fantasy_weeks_season ON fantasy_weeks(season, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_fantasy_weeks_season_type ON fantasy_weeks(season, season_type, start_date, end_date);

-- Human prediction / pairwise game data. These tables are intentionally separate
-- from fantasy league rosters so the game can be used by any league participant.
CREATE TABLE IF NOT EXISTS pairwise_comparisons (
  pair_id TEXT PRIMARY KEY,
  season INTEGER NOT NULL DEFAULT 2026,
  pair_type TEXT,
  reason TEXT,
  projected_winner TEXT CHECK (projected_winner IN ('A', 'B') OR projected_winner IS NULL),
  actual_winner TEXT CHECK (actual_winner IN ('A', 'B') OR actual_winner IS NULL),
  player_a JSONB NOT NULL,
  player_b JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prediction_users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_key TEXT UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pairwise_picks (
  pick_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id TEXT NOT NULL REFERENCES pairwise_comparisons(pair_id),
  user_id UUID REFERENCES prediction_users(user_id),
  mode TEXT NOT NULL DEFAULT 'practice' CHECK (mode IN ('practice', 'collect')),
  pick_side TEXT NOT NULL CHECK (pick_side IN ('A', 'B')),
  confidence INTEGER NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_predictions (
  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES prediction_users(user_id),
  season INTEGER NOT NULL DEFAULT 2026,
  player_id INTEGER REFERENCES players(player_id),
  prediction_type TEXT NOT NULL DEFAULT 'player_pick',
  predicted_value NUMERIC,
  confidence INTEGER CHECK (confidence BETWEEN 1 AND 5),
  notes TEXT,
  outcome_value NUMERIC,
  correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pairwise_comparisons_season ON pairwise_comparisons(season);
CREATE INDEX IF NOT EXISTS idx_pairwise_picks_user ON pairwise_picks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pairwise_picks_pair ON pairwise_picks(pair_id);
CREATE INDEX IF NOT EXISTS idx_player_predictions_user ON player_predictions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_teams_conference ON teams(conference_name);

CREATE TABLE IF NOT EXISTS draft_configurations (
  season INTEGER PRIMARY KEY,
  franchise_picks JSONB NOT NULL DEFAULT '[]'::jsonb,
  snake_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE draft_configurations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draft_configurations_public_read ON draft_configurations;
CREATE POLICY draft_configurations_public_read ON draft_configurations FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS draft_selections (
  selection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season INTEGER NOT NULL DEFAULT 2026,
  round_number INTEGER NOT NULL CHECK (round_number BETWEEN 0 AND 17),
  pick_number INTEGER NOT NULL,
  team_code TEXT NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  player_name TEXT NOT NULL,
  drafted_position TEXT NOT NULL,
  college_team_name TEXT,
  headshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season, pick_number),
  UNIQUE (season, player_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_selections_season ON draft_selections(season, pick_number);
ALTER TABLE draft_selections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draft_selections_public_read ON draft_selections;
CREATE POLICY draft_selections_public_read ON draft_selections FOR SELECT USING (true);

ALTER TABLE pairwise_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairwise_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pairwise_comparisons_public_read ON pairwise_comparisons;
CREATE POLICY pairwise_comparisons_public_read ON pairwise_comparisons FOR SELECT USING (true);

DROP POLICY IF EXISTS prediction_users_service_only ON prediction_users;
DROP POLICY IF EXISTS pairwise_picks_service_only ON pairwise_picks;
DROP POLICY IF EXISTS player_predictions_service_only ON player_predictions;

DROP FUNCTION IF EXISTS roster_snapshot(BOOLEAN, INTEGER);

CREATE OR REPLACE FUNCTION roster_snapshot(include_dnp BOOLEAN DEFAULT FALSE, row_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  player_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  team_id INTEGER,
  headshot TEXT,
  "position" TEXT,
  team_name TEXT,
  conference_name TEXT,
  ppg NUMERIC,
  mpg NUMERIC,
  fgm NUMERIC,
  fga NUMERIC,
  tpm NUMERIC,
  tpa NUMERIC,
  last5_ppg NUMERIC
)
LANGUAGE sql AS $$
  WITH filtered AS (
    SELECT *
    FROM player_games
    WHERE include_dnp OR minutes > 0
  ),
  stats AS (
    SELECT
      player_id,
      AVG(pts) AS ppg,
      AVG(minutes) AS mpg,
      AVG(fgm) AS fgm,
      AVG(fga) AS fga,
      AVG(tpm) AS tpm,
      AVG(tpa) AS tpa
    FROM filtered
    GROUP BY player_id
  ),
  last5 AS (
    SELECT player_id, AVG(pts) AS last5_ppg
    FROM (
      SELECT
        player_id,
        pts,
        ROW_NUMBER() OVER (
          PARTITION BY player_id
          ORDER BY game_date DESC NULLS LAST, game_id DESC
        ) AS rn
      FROM filtered
    ) ranked
    WHERE rn <= 5
    GROUP BY player_id
  )
  SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    p.team_id,
    p.headshot,
    p.position AS "position",
    COALESCE(t.display_name, t.name, p.team_id::text) AS team_name,
    t.conference_name,
    s.ppg,
    s.mpg,
    s.fgm,
    s.fga,
    s.tpm,
    s.tpa,
    l.last5_ppg
  FROM players p
  LEFT JOIN teams t ON t.team_id = p.team_id
  LEFT JOIN stats s ON s.player_id = p.player_id
  LEFT JOIN last5 l ON l.player_id = p.player_id
  ORDER BY s.ppg DESC NULLS LAST
  LIMIT row_limit;
$$;

CREATE OR REPLACE FUNCTION home_stats(include_dnp BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  total_players INTEGER,
  active_players INTEGER,
  avg_ppg NUMERIC,
  total_games INTEGER
)
LANGUAGE sql AS $$
  WITH filtered AS (
    SELECT *
    FROM player_games
    WHERE include_dnp OR minutes > 0
  )
  SELECT
    (SELECT COUNT(*) FROM players) AS total_players,
    (SELECT COUNT(*) FROM players WHERE is_active IS TRUE) AS active_players,
    (SELECT AVG(pts) FROM filtered) AS avg_ppg,
    (SELECT COUNT(DISTINCT game_id) FROM player_games) AS total_games;
$$;

CREATE OR REPLACE FUNCTION player_options(row_limit INTEGER DEFAULT 200)
RETURNS TABLE (
  player_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  "position" TEXT,
  team_name TEXT
)
LANGUAGE sql AS $$
  SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    p.position AS "position",
    COALESCE(t.display_name, t.name, p.team_id::text) AS team_name
  FROM players p
  LEFT JOIN teams t ON t.team_id = p.team_id
  ORDER BY p.last_name, p.first_name
  LIMIT row_limit;
$$;

CREATE OR REPLACE FUNCTION player_summaries(player_ids INTEGER[], include_dnp BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  player_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  "position" TEXT,
  team_name TEXT,
  ppg NUMERIC,
  mpg NUMERIC,
  fgm NUMERIC,
  fga NUMERIC,
  tpm NUMERIC,
  tpa NUMERIC,
  last5_ppg NUMERIC
)
LANGUAGE sql AS $$
  WITH target AS (
    SELECT UNNEST(player_ids) AS player_id
  ),
  filtered AS (
    SELECT pg.*
    FROM player_games pg
    JOIN target t ON t.player_id = pg.player_id
    WHERE include_dnp OR pg.minutes > 0
  ),
  stats AS (
    SELECT
      player_id,
      AVG(pts) AS ppg,
      AVG(minutes) AS mpg,
      AVG(fgm) AS fgm,
      AVG(fga) AS fga,
      AVG(tpm) AS tpm,
      AVG(tpa) AS tpa
    FROM filtered
    GROUP BY player_id
  ),
  last5 AS (
    SELECT player_id, AVG(pts) AS last5_ppg
    FROM (
      SELECT
        player_id,
        pts,
        ROW_NUMBER() OVER (
          PARTITION BY player_id
          ORDER BY game_date DESC NULLS LAST, game_id DESC
        ) AS rn
      FROM filtered
    ) ranked
    WHERE rn <= 5
    GROUP BY player_id
  )
  SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    p.position AS "position",
    COALESCE(t.display_name, t.name, p.team_id::text) AS team_name,
    s.ppg,
    s.mpg,
    s.fgm,
    s.fga,
    s.tpm,
    s.tpa,
    l.last5_ppg
  FROM players p
  JOIN target t2 ON t2.player_id = p.player_id
  LEFT JOIN teams t ON t.team_id = p.team_id
  LEFT JOIN stats s ON s.player_id = p.player_id
  LEFT JOIN last5 l ON l.player_id = p.player_id
  ORDER BY p.last_name, p.first_name;
$$;

CREATE OR REPLACE FUNCTION week_options(row_limit INTEGER DEFAULT 8)
RETURNS TABLE (week_start DATE)
LANGUAGE sql AS $$
  SELECT DISTINCT date_trunc('week', game_date)::date AS week_start
  FROM player_games
  WHERE game_date IS NOT NULL
  ORDER BY week_start DESC
  LIMIT row_limit;
$$;

DROP FUNCTION IF EXISTS fantasy_week_options(INTEGER);

CREATE OR REPLACE FUNCTION fantasy_week_options(season_param INTEGER)
RETURNS TABLE (
  season INTEGER,
  season_type TEXT,
  week INTEGER,
  label TEXT,
  start_date DATE,
  end_date DATE,
  is_dynamic BOOLEAN,
  notes TEXT
)
LANGUAGE sql AS $$
  SELECT
    season,
    season_type,
    week,
    COALESCE(label, 'Week ' || week::text) AS label,
    start_date,
    end_date,
    is_dynamic,
    notes
  FROM fantasy_weeks
  WHERE season = season_param
  ORDER BY season_type, week;
$$;

CREATE OR REPLACE FUNCTION team_scoreboard_range(start_date DATE, end_date DATE, row_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  team_name TEXT,
  games INTEGER,
  active_players INTEGER,
  total_points INTEGER
)
LANGUAGE sql AS $$
  SELECT
    COALESCE(t.display_name, t.name, pg.team_id::text) AS team_name,
    COUNT(DISTINCT pg.game_id) AS games,
    COUNT(DISTINCT pg.player_id) FILTER (WHERE pg.minutes > 0) AS active_players,
    SUM(pg.pts)::INTEGER AS total_points
  FROM player_games pg
  LEFT JOIN teams t ON t.team_id = pg.team_id
  WHERE pg.game_date >= start_date
    AND pg.game_date <= end_date
  GROUP BY COALESCE(t.display_name, t.name, pg.team_id::text)
  ORDER BY total_points DESC NULLS LAST
  LIMIT row_limit;
$$;

CREATE OR REPLACE FUNCTION team_scoreboard(week_start DATE, row_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  team_name TEXT,
  games INTEGER,
  active_players INTEGER,
  total_points INTEGER
)
LANGUAGE sql AS $$
  SELECT
    COALESCE(t.display_name, t.name, pg.team_id::text) AS team_name,
    COUNT(DISTINCT pg.game_id) AS games,
    COUNT(DISTINCT pg.player_id) FILTER (WHERE pg.minutes > 0) AS active_players,
    SUM(pg.pts)::INTEGER AS total_points
  FROM player_games pg
  LEFT JOIN teams t ON t.team_id = pg.team_id
  WHERE pg.game_date >= week_start
    AND pg.game_date < (week_start + INTERVAL '7 days')
  GROUP BY COALESCE(t.display_name, t.name, pg.team_id::text)
  ORDER BY total_points DESC NULLS LAST
  LIMIT row_limit;
$$;

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
      pg.pts
    FROM chosen c
    LEFT JOIN player_games pg
      ON pg.player_id = c.player_id
     AND pg.game_id = c.chosen_game_id
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
      pg.pts::INTEGER AS points,
      g.status
    FROM chosen c
    LEFT JOIN player_games pg
      ON pg.player_id = c.player_id
     AND pg.game_id = c.chosen_game_id
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

CREATE OR REPLACE FUNCTION fantasy_roster(team_id INTEGER, season INTEGER DEFAULT NULL, include_dnp BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  player_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  "position" TEXT,
  player_position TEXT,
  team_id INTEGER,
  team_abbr TEXT,
  team_name TEXT,
  ppg NUMERIC,
  median_ppg NUMERIC,
  mpg NUMERIC,
  fgm NUMERIC,
  fga NUMERIC,
  tpm NUMERIC,
  tpa NUMERIC,
  last5_ppg NUMERIC,
  last5_median_ppg NUMERIC
)
LANGUAGE sql AS $$
  WITH target_season AS (
    SELECT COALESCE(
      season,
      (SELECT MAX(fr.season) FROM fantasy_rosters fr WHERE fr.fantasy_team_id = team_id)
    ) AS season_val
  ),
  roster AS (
    SELECT fr.player_id, fr.player_position
    FROM fantasy_rosters fr, target_season ts
    WHERE fr.fantasy_team_id = team_id
      AND fr.season = ts.season_val
  ),
  filtered AS (
    SELECT pg.*
    FROM player_games pg
    JOIN roster r ON r.player_id = pg.player_id
    WHERE include_dnp OR pg.minutes > 0
  ),
  stats AS (
    SELECT
      player_id,
      AVG(pts) AS ppg,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY pts) AS median_ppg,
      AVG(minutes) AS mpg,
      AVG(fgm) AS fgm,
      AVG(fga) AS fga,
      AVG(tpm) AS tpm,
      AVG(tpa) AS tpa
    FROM filtered
    GROUP BY player_id
  ),
  last5 AS (
    SELECT
      player_id,
      AVG(pts) AS last5_ppg,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY pts) AS last5_median_ppg
    FROM (
      SELECT
        player_id,
        pts,
        ROW_NUMBER() OVER (
          PARTITION BY player_id
          ORDER BY game_date DESC NULLS LAST, game_id DESC
        ) AS rn
      FROM filtered
    ) ranked
    WHERE rn <= 5
    GROUP BY player_id
  )
  SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    p.position AS "position",
    r.player_position,
    p.team_id,
    t.abbreviation AS team_abbr,
    COALESCE(t.display_name, t.name, p.team_id::text) AS team_name,
    s.ppg,
    s.median_ppg,
    s.mpg,
    s.fgm,
    s.fga,
    s.tpm,
    s.tpa,
    l.last5_ppg,
    l.last5_median_ppg
  FROM roster r
  JOIN players p ON p.player_id = r.player_id
  LEFT JOIN teams t ON t.team_id = p.team_id
  LEFT JOIN stats s ON s.player_id = r.player_id
  LEFT JOIN last5 l ON l.player_id = r.player_id
  ORDER BY s.ppg DESC NULLS LAST, p.last_name, p.first_name;
$$;

CREATE OR REPLACE FUNCTION fantasy_week_player_games(
  team_id INTEGER,
  start_date DATE,
  end_date DATE,
  season INTEGER DEFAULT NULL,
  include_dnp BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  player_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  player_position TEXT,
  game_id INTEGER,
  game_date DATE,
  team_id INTEGER,
  team_name TEXT,
  opponent_id INTEGER,
  opponent_name TEXT,
  home_away TEXT,
  pts INTEGER,
  minutes NUMERIC,
  fgm INTEGER,
  fga INTEGER,
  tpm INTEGER,
  tpa INTEGER,
  reb INTEGER,
  ast INTEGER,
  stl INTEGER,
  blocks INTEGER,
  turnovers INTEGER
)
LANGUAGE sql AS $$
  WITH target_season AS (
    SELECT COALESCE(
      season,
      (SELECT MAX(fr.season) FROM fantasy_rosters fr WHERE fr.fantasy_team_id = team_id)
    ) AS season_val
  ),
  roster AS (
    SELECT fr.player_id, fr.player_position
    FROM fantasy_rosters fr, target_season ts
    WHERE fr.fantasy_team_id = team_id
      AND fr.season = ts.season_val
  ),
  filtered AS (
    SELECT pg.*, r.player_position
    FROM player_games pg
    JOIN roster r ON r.player_id = pg.player_id
    WHERE pg.game_date >= start_date
      AND pg.game_date <= end_date
      AND (include_dnp OR pg.minutes > 0)
  )
  SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    f.player_position,
    f.game_id,
    f.game_date,
    f.team_id,
    COALESCE(t.display_name, t.name, f.team_id::text) AS team_name,
    CASE WHEN g.home_team_id = f.team_id THEN g.away_team_id ELSE g.home_team_id END AS opponent_id,
    CASE WHEN g.home_team_id = f.team_id THEN g.away_team_name ELSE g.home_team_name END AS opponent_name,
    CASE WHEN g.home_team_id = f.team_id THEN 'Home' ELSE 'Away' END AS home_away,
    f.pts,
    f.minutes,
    f.fgm,
    f.fga,
    f.tpm,
    f.tpa,
    f.reb,
    f.ast,
    f.stl,
    f.blocks,
    f.turnovers
  FROM filtered f
  JOIN players p ON p.player_id = f.player_id
  LEFT JOIN games g ON g.game_id = f.game_id
  LEFT JOIN teams t ON t.team_id = f.team_id
  ORDER BY f.game_date DESC NULLS LAST, p.last_name, p.first_name;
$$;

CREATE OR REPLACE FUNCTION fantasy_week_player_schedule(
  team_id INTEGER,
  start_date DATE,
  end_date DATE,
  season INTEGER DEFAULT NULL,
  include_completed BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  player_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  player_position TEXT,
  game_id INTEGER,
  game_date DATE,
  game_datetime TIMESTAMPTZ,
  team_id INTEGER,
  team_name TEXT,
  opponent_id INTEGER,
  opponent_name TEXT,
  home_away TEXT,
  status TEXT
)
LANGUAGE sql AS $$
  WITH target_season AS (
    SELECT COALESCE(
      season,
      (SELECT MAX(fr.season) FROM fantasy_rosters fr WHERE fr.fantasy_team_id = team_id)
    ) AS season_val
  ),
  roster AS (
    SELECT fr.player_id, fr.player_position
    FROM fantasy_rosters fr, target_season ts
    WHERE fr.fantasy_team_id = team_id
      AND fr.season = ts.season_val
  ),
  games_filtered AS (
    SELECT g.*
    FROM games g
    WHERE g.game_date >= start_date
      AND g.game_date <= end_date
      AND (include_completed OR g.status IS NULL OR g.status NOT ILIKE '%final%')
  ),
  joined AS (
    SELECT
      r.player_id,
      r.player_position,
      p.team_id,
      g.game_id,
      g.game_date,
      g.game_datetime,
      g.home_team_id,
      g.home_team_name,
      g.away_team_id,
      g.away_team_name,
      g.status
    FROM roster r
    JOIN players p ON p.player_id = r.player_id
    JOIN games_filtered g
      ON g.home_team_id = p.team_id OR g.away_team_id = p.team_id
  )
  SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    j.player_position,
    j.game_id,
    j.game_date,
    j.game_datetime,
    j.team_id,
    COALESCE(t.display_name, t.name, j.team_id::text) AS team_name,
    CASE WHEN j.home_team_id = j.team_id THEN j.away_team_id ELSE j.home_team_id END AS opponent_id,
    CASE WHEN j.home_team_id = j.team_id THEN j.away_team_name ELSE j.home_team_name END AS opponent_name,
    CASE WHEN j.home_team_id = j.team_id THEN 'Home' ELSE 'Away' END AS home_away,
    j.status
  FROM joined j
  JOIN players p ON p.player_id = j.player_id
  LEFT JOIN teams t ON t.team_id = j.team_id
  ORDER BY j.game_date ASC NULLS LAST, p.last_name, p.first_name;
$$;

CREATE OR REPLACE FUNCTION player_profile(player_id_param INTEGER, team_id_param INTEGER DEFAULT NULL)
RETURNS TABLE (
  player_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  "position" TEXT,
  player_number TEXT,
  height INTEGER,
  display_height TEXT,
  weight INTEGER,
  experience TEXT,
  headshot TEXT,
  team_id INTEGER,
  team_name TEXT,
  player_position TEXT
)
LANGUAGE sql AS $$
  SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    p.position AS "position",
    p.player_number,
    p.height,
    p.display_height,
    p.weight,
    p.experience,
    p.headshot,
    p.team_id,
    COALESCE(t.display_name, t.name, p.team_id::text) AS team_name,
    (
      SELECT fr.player_position
      FROM fantasy_rosters fr
      WHERE fr.player_id = p.player_id
        AND (team_id_param IS NULL OR fr.fantasy_team_id = team_id_param)
      ORDER BY fr.season DESC
      LIMIT 1
    ) AS player_position
  FROM players p
  LEFT JOIN teams t ON t.team_id = p.team_id
  WHERE p.player_id = player_id_param;
$$;

CREATE OR REPLACE FUNCTION player_game_log(player_id_param INTEGER, row_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  game_id INTEGER,
  game_date DATE,
  team_id INTEGER,
  team_name TEXT,
  opponent_id INTEGER,
  opponent_name TEXT,
  home_away TEXT,
  pts INTEGER,
  minutes NUMERIC,
  fgm INTEGER,
  fga INTEGER,
  tpm INTEGER,
  tpa INTEGER,
  reb INTEGER,
  ast INTEGER,
  stl INTEGER,
  blocks INTEGER,
  turnovers INTEGER
)
LANGUAGE sql AS $$
  SELECT
    pg.game_id,
    pg.game_date,
    pg.team_id,
    COALESCE(t.display_name, t.name, pg.team_id::text) AS team_name,
    CASE WHEN g.home_team_id = pg.team_id THEN g.away_team_id ELSE g.home_team_id END AS opponent_id,
    CASE WHEN g.home_team_id = pg.team_id THEN g.away_team_name ELSE g.home_team_name END AS opponent_name,
    CASE WHEN g.home_team_id = pg.team_id THEN 'Home' ELSE 'Away' END AS home_away,
    pg.pts,
    pg.minutes,
    pg.fgm,
    pg.fga,
    pg.tpm,
    pg.tpa,
    pg.reb,
    pg.ast,
    pg.stl,
    pg.blocks,
    pg.turnovers
  FROM player_games pg
  LEFT JOIN games g ON g.game_id = pg.game_id
  LEFT JOIN teams t ON t.team_id = pg.team_id
  WHERE pg.player_id = player_id_param
  ORDER BY pg.game_date DESC NULLS LAST, pg.game_id DESC
  LIMIT row_limit;
$$;
