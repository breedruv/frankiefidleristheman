-- Outside roster listings (CBS, Yahoo, Lindy's) combined with ESPN for draft eligibility, plus Lindy's rankings.
-- Run once in the Supabase SQL editor, then load rows with python/import_source_listings.py --apply.
CREATE TABLE IF NOT EXISTS player_source_listings (
  source TEXT NOT NULL CHECK (source IN ('cbs', 'yahoo', 'lindys')),
  season INTEGER NOT NULL,                       -- ESPN source season (2027 = 2026-27)
  source_key TEXT NOT NULL,                      -- source player id, or the file line for Lindy's
  player_id INTEGER REFERENCES players(player_id),  -- ESPN id, or a negative stand-in id; null when unlinked
  team_id INTEGER,
  name TEXT NOT NULL,
  jersey TEXT,
  position TEXT,
  height_in INTEGER,
  weight INTEGER,
  class TEXT,
  hometown TEXT,
  source_url TEXT,
  match TEXT NOT NULL,                           -- exact, name, reviewed, stand_in, espn_id, unlinked
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, season, source_key)
);
CREATE INDEX IF NOT EXISTS player_source_listings_player_idx ON player_source_listings (player_id);
ALTER TABLE player_source_listings ENABLE ROW LEVEL SECURITY;

-- Published rankings (Lindy's top 150 and top 100 freshmen, ESPN 100 recruiting class). player_id is the ESPN id as listed; it can point to a
-- player outside the pool, so it has no foreign key. Rows without an id are kept for reference.
CREATE TABLE IF NOT EXISTS player_rankings (
  source TEXT NOT NULL,                          -- lindys, espn
  list TEXT NOT NULL,                            -- top150, freshmen (lindys); top100 (espn)
  season INTEGER NOT NULL,                       -- ESPN source season (2027 = 2026-27)
  rank INTEGER NOT NULL,
  player_id INTEGER,
  name TEXT NOT NULL,
  team TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, list, season, rank)
);
CREATE INDEX IF NOT EXISTS player_rankings_player_idx ON player_rankings (player_id);
ALTER TABLE player_rankings ENABLE ROW LEVEL SECURITY;
