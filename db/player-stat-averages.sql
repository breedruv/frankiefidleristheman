-- Fast Player Focus summaries.
-- Run this after player_games has been imported or refreshed.

CREATE TABLE IF NOT EXISTS player_stat_averages (
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  season INTEGER NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  ppg NUMERIC,
  mpg NUMERIC,
  three_pt_percentage NUMERIC,
  free_throw_percentage NUMERIC,
  shots_per_game NUMERIC,
  last5_games INTEGER NOT NULL DEFAULT 0,
  last5_ppg NUMERIC,
  last5_mpg NUMERIC,
  last5_three_pt_percentage NUMERIC,
  last5_free_throw_percentage NUMERIC,
  last5_shots_per_game NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_player_stat_averages_season_ppg
  ON player_stat_averages (season, ppg DESC);

CREATE INDEX IF NOT EXISTS idx_player_stat_averages_player
  ON player_stat_averages (player_id);

CREATE OR REPLACE FUNCTION refresh_player_stat_averages(season_param INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  refreshed_count INTEGER;
BEGIN
  DELETE FROM player_stat_averages
  WHERE season_param IS NULL OR season = season_param;

  WITH source_games AS (
    SELECT *
    FROM player_games
    WHERE minutes > 0
      AND (season_param IS NULL OR season = season_param)
  ),
  ranked_games AS (
    SELECT source_games.*,
      ROW_NUMBER() OVER (
        PARTITION BY player_id, season
        ORDER BY game_date DESC NULLS LAST, game_id DESC
      ) AS recent_rank
    FROM source_games
  ),
  summary AS (
    SELECT
      player_id,
      season,
      COUNT(*)::INTEGER AS games_played,
      AVG(pts) AS ppg,
      AVG(minutes) AS mpg,
      CASE WHEN SUM(tpa) > 0 THEN SUM(tpm)::NUMERIC / SUM(tpa) * 100 END AS three_pt_percentage,
      CASE WHEN SUM(fta) > 0 THEN SUM(ftm)::NUMERIC / SUM(fta) * 100 END AS free_throw_percentage,
      AVG(fga) AS shots_per_game
    FROM source_games
    GROUP BY player_id, season
  ),
  last_five AS (
    SELECT
      player_id,
      season,
      COUNT(*)::INTEGER AS last5_games,
      AVG(pts) AS last5_ppg,
      AVG(minutes) AS last5_mpg,
      CASE WHEN SUM(tpa) > 0 THEN SUM(tpm)::NUMERIC / SUM(tpa) * 100 END AS last5_three_pt_percentage,
      CASE WHEN SUM(fta) > 0 THEN SUM(ftm)::NUMERIC / SUM(fta) * 100 END AS last5_free_throw_percentage,
      AVG(fga) AS last5_shots_per_game
    FROM ranked_games
    WHERE recent_rank <= 5
    GROUP BY player_id, season
  )
  INSERT INTO player_stat_averages (
    player_id, season, games_played, ppg, mpg, three_pt_percentage,
    free_throw_percentage, shots_per_game, last5_games, last5_ppg, last5_mpg,
    last5_three_pt_percentage, last5_free_throw_percentage, last5_shots_per_game
  )
  SELECT
    summary.player_id, summary.season, summary.games_played, summary.ppg, summary.mpg,
    summary.three_pt_percentage, summary.free_throw_percentage, summary.shots_per_game,
    last_five.last5_games, last_five.last5_ppg, last_five.last5_mpg,
    last_five.last5_three_pt_percentage, last_five.last5_free_throw_percentage,
    last_five.last5_shots_per_game
  FROM summary
  JOIN last_five USING (player_id, season);

  GET DIAGNOSTICS refreshed_count = ROW_COUNT;
  RETURN refreshed_count;
END;
$$;

COMMENT ON FUNCTION refresh_player_stat_averages(INTEGER) IS
  'Rebuilds fast season and last-five player averages from player_games. Pass NULL to rebuild all seasons.';

-- Example:
-- SELECT refresh_player_stat_averages(2025);
-- SELECT refresh_player_stat_averages(NULL);
