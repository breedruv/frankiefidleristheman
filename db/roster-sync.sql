-- Roster sync compatibility for projects created before the current schema.
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

ALTER TABLE public.team_rosters
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
