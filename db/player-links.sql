-- Links from a pool player to his page on an outside site (Rotowire for now). Run once in the Supabase SQL editor,
-- then load rows with python/rotowire_players.py --apply.
CREATE TABLE IF NOT EXISTS player_links (
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  site TEXT NOT NULL,                 -- rotowire
  external_id TEXT NOT NULL,          -- the site's player id
  url TEXT NOT NULL,
  name TEXT,                          -- the player's name on that site
  match TEXT,                         -- name, jersey_last, manual
  team_id INTEGER,                    -- ESPN team the link was matched on
  external_team_id TEXT,              -- the site's team id
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, site)
);
ALTER TABLE player_links ENABLE ROW LEVEL SECURITY;
