-- Run in Supabase SQL Editor before enabling the Include exhibitions switch.
CREATE OR REPLACE FUNCTION combined_player_stats(source_season INTEGER)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH eligible AS (
    SELECT pg.*
    FROM player_games pg
    LEFT JOIN games g ON g.game_id = pg.game_id
    WHERE pg.season = source_season
      AND (pg.minutes > 0 OR (COALESCE(g.is_exhibition, FALSE) AND pg.minutes IS NULL))
  ),
  averages AS (
    SELECT player_id, COUNT(*) AS games, AVG(pts) AS ppg, AVG(minutes) AS mpg,
      AVG(fgm) AS fgm, AVG(fga) AS fga, AVG(tpm) AS tpm, AVG(tpa) AS tpa,
      SUM(tpm)::NUMERIC / NULLIF(SUM(tpa), 0) * 100 AS three_pct,
      SUM(ftm)::NUMERIC / NULLIF(SUM(fta), 0) * 100 AS ft_pct,
      AVG(fga) AS shots_per_game
    FROM eligible GROUP BY player_id
  ),
  recent AS (
    SELECT player_id, AVG(pts) AS last5_ppg
    FROM (
      SELECT player_id, pts,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY game_date DESC NULLS LAST, game_id DESC) AS rn
      FROM eligible
    ) ranked
    WHERE rn <= 5 GROUP BY player_id
  )
  SELECT COALESCE(jsonb_object_agg(a.player_id, to_jsonb(a) || jsonb_build_object(
    'stats_season', source_season, 'last5_ppg', r.last5_ppg
  )), '{}'::jsonb)
  FROM averages a LEFT JOIN recent r USING (player_id);
$$;

REVOKE ALL ON FUNCTION combined_player_stats(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION combined_player_stats(INTEGER) TO service_role;
