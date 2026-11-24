-- Adds exhibition metadata without changing existing games or stats.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS is_exhibition BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS source_game_label TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_games_source_game_label
  ON games (source_game_label)
  WHERE source_game_label IS NOT NULL;
