-- Injury listings per player and source. Safe to re-run; db/collector.sql includes the same table.
-- 'rotowire' rows come from the collector (whole draft pool); 'manual' rows are flags Andrew or Sam set in the app.
CREATE TABLE IF NOT EXISTS player_injuries (
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  source TEXT NOT NULL CHECK (source IN ('rotowire', 'manual')),
  status TEXT,
  injury TEXT,
  source_player TEXT,
  source_team TEXT,
  updated_by TEXT,
  first_reported_at TIMESTAMPTZ DEFAULT NOW(),
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  cleared_at TIMESTAMPTZ,
  PRIMARY KEY (player_id, source)
);
ALTER TABLE player_injuries ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE player_injuries ENABLE ROW LEVEL SECURITY;
