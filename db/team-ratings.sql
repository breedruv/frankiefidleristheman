-- Dated team rating snapshots (KenPom via python/import_kenpom.py). team_id is NULL for teams not in `teams`.
CREATE TABLE IF NOT EXISTS team_ratings (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  rating_date DATE NOT NULL,
  source_team TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(team_id),
  rank INTEGER,
  conference TEXT,
  wins INTEGER,
  losses INTEGER,
  net_rtg NUMERIC,
  ortg NUMERIC,
  ortg_rank INTEGER,
  drtg NUMERIC,
  drtg_rank INTEGER,
  adj_tempo NUMERIC,
  adj_tempo_rank INTEGER,
  luck NUMERIC,
  luck_rank INTEGER,
  sos_net NUMERIC,
  sos_net_rank INTEGER,
  sos_ortg NUMERIC,
  sos_ortg_rank INTEGER,
  sos_drtg NUMERIC,
  sos_drtg_rank INTEGER,
  ncsos_net NUMERIC,
  ncsos_net_rank INTEGER,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, season, rating_date, source_team)
);

CREATE INDEX IF NOT EXISTS team_ratings_team_idx ON team_ratings (team_id, source, rating_date DESC);

ALTER TABLE team_ratings ENABLE ROW LEVEL SECURITY;
