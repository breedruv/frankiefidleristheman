-- Draft players come from roster.csv and may not exist in the season players table yet.
-- Run this once in Supabase for an existing database.
ALTER TABLE draft_selections DROP CONSTRAINT IF EXISTS draft_selections_player_id_fkey;
