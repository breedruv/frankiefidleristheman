-- Run in Supabase SQL Editor to show Player Focus shooting metrics from each player's latest ESPN season
-- (exhibitions excluded) and to label exhibition games in player game logs.
BEGIN;
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
  three_pct NUMERIC,
  ft_pct NUMERIC,
  shots_per_game NUMERIC,
  last5_ppg NUMERIC,
  year TEXT,
  stats_season INTEGER
)
LANGUAGE sql AS $$
  WITH eligible AS (
    -- Exhibitions stay out of season averages; they are shown separately in game logs.
    SELECT pg.*
    FROM player_games pg
    LEFT JOIN games g ON g.game_id = pg.game_id
    WHERE (include_dnp OR pg.minutes > 0)
      AND NOT COALESCE(g.is_exhibition, FALSE)
  ),
  latest AS (
    SELECT player_id, MAX(season) AS season FROM eligible GROUP BY player_id
  ),
  filtered AS (
    SELECT e.* FROM eligible e JOIN latest l USING (player_id)
    WHERE e.season IS NOT DISTINCT FROM l.season
  ),
  stats AS (
    SELECT
      player_id,
      MAX(season) AS stats_season,
      AVG(pts) AS ppg,
      AVG(minutes) AS mpg,
      AVG(fgm) AS fgm,
      AVG(fga) AS fga,
      AVG(tpm) AS tpm,
      AVG(tpa) AS tpa,
      SUM(tpm)::NUMERIC / NULLIF(SUM(tpa), 0) * 100 AS three_pct,
      SUM(ftm)::NUMERIC / NULLIF(SUM(fta), 0) * 100 AS ft_pct,
      AVG(fga) AS shots_per_game
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
    s.three_pct,
    s.ft_pct,
    s.shots_per_game,
    l.last5_ppg,
    p.experience,
    s.stats_season
  FROM players p
  LEFT JOIN teams t ON t.team_id = p.team_id
  LEFT JOIN stats s ON s.player_id = p.player_id
  LEFT JOIN last5 l ON l.player_id = p.player_id
  ORDER BY s.ppg DESC NULLS LAST, p.player_id
  LIMIT row_limit;
$$;

-- One JSON value per call, so PostgREST's max-rows cap does not force repeated aggregations when paging.
CREATE OR REPLACE FUNCTION roster_snapshot_json(include_dnp BOOLEAN DEFAULT FALSE, row_limit INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE sql AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.ppg DESC NULLS LAST, r.player_id), '[]'::jsonb)
  FROM roster_snapshot(include_dnp, row_limit) r;
$$;

DROP FUNCTION IF EXISTS player_game_log(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION player_game_log(player_id_param INTEGER, row_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  game_id INTEGER,
  game_date DATE,
  team_id INTEGER,
  team_name TEXT,
  opponent_id INTEGER,
  opponent_name TEXT,
  home_away TEXT,
  is_exhibition BOOLEAN,
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
    COALESCE(g.is_exhibition, FALSE) AS is_exhibition,
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
COMMIT;
