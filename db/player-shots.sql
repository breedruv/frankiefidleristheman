CREATE TABLE IF NOT EXISTS player_shots (
  play_id BIGINT PRIMARY KEY,
  game_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  assist_player_id INTEGER,
  team_id INTEGER,
  period INTEGER,
  clock TEXT,
  shot_type TEXT,
  result TEXT,
  points_attempted INTEGER,
  coord_x NUMERIC,
  coord_y NUMERIC,
  shot_text TEXT,
  game_date DATE,
  season INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_shots_player_date ON player_shots (player_id, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_shots_game ON player_shots (game_id);
