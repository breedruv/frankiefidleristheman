-- Apply once to the existing Supabase project. Service-role access only.
BEGIN;
ALTER TABLE public.draft_selections ADD COLUMN IF NOT EXISTS initiated_by text;
ALTER TABLE public.draft_selections ADD COLUMN IF NOT EXISTS blocked_team_code text;
UPDATE public.draft_selections SET initiated_by = team_code WHERE initiated_by IS NULL;
ALTER TABLE public.draft_selections DROP CONSTRAINT IF EXISTS draft_selections_player_id_fkey;

CREATE TABLE IF NOT EXISTS public.draft_shortlists (
  season integer NOT NULL,
  owner_name text NOT NULL CHECK (owner_name IN ('Andrew', 'Sam')),
  player_ids bigint[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 0,
  PRIMARY KEY (season, owner_name),
  CHECK (cardinality(player_ids) <= 10)
);
ALTER TABLE public.draft_shortlists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.draft_shortlists FROM anon, authenticated;
GRANT ALL ON public.draft_shortlists TO service_role;

CREATE OR REPLACE FUNCTION public.save_draft_shortlist(p_season integer, p_owner text, p_players bigint[], p_revision integer)
RETURNS public.draft_shortlists LANGUAGE plpgsql SET search_path = public AS $$
DECLARE saved public.draft_shortlists;
BEGIN
  PERFORM pg_advisory_xact_lock(731001, p_season);
  IF p_owner NOT IN ('Andrew','Sam') OR p_players IS NULL OR cardinality(p_players) > 10
     OR cardinality(p_players) <> (SELECT count(DISTINCT x) FROM unnest(p_players) x)
     OR EXISTS (SELECT 1 FROM unnest(p_players) x WHERE x IS NULL OR x <= 0) THEN
    RAISE EXCEPTION 'Invalid shortlist';
  END IF;
  INSERT INTO draft_shortlists(season,owner_name) VALUES(p_season,p_owner) ON CONFLICT DO NOTHING;
  UPDATE draft_shortlists SET player_ids=p_players, revision=revision+1
    WHERE season=p_season AND owner_name=p_owner AND revision=p_revision RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'List changed. Refresh and try again.'; END IF;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_draft_shortlist(integer,text,bigint[],integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_draft_shortlist(integer,text,bigint[],integer) TO service_role;

-- All app draft mutations share a lock and compare the snapshot validated by the server.
CREATE OR REPLACE FUNCTION public.commit_draft_selection(p_season integer, p_expected jsonb, p_action text, p_pick jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE actual jsonb; saved draft_selections;
BEGIN
  PERFORM pg_advisory_xact_lock(731002, p_season);
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY pick_number),'[]'::jsonb) INTO actual FROM draft_selections d WHERE season=p_season;
  IF actual <> p_expected THEN RAISE EXCEPTION 'Draft changed. Refresh and try again.'; END IF;
  IF p_action='POST' THEN
    INSERT INTO draft_selections(season,pick_number,round_number,team_code,player_id,player_name,drafted_position,college_team_name,headshot,initiated_by,blocked_team_code)
    VALUES(p_season,(p_pick->>'pick_number')::integer,(p_pick->>'round_number')::integer,p_pick->>'team_code',(p_pick->>'player_id')::integer,p_pick->>'player_name',p_pick->>'drafted_position',p_pick->>'college_team_name',p_pick->>'headshot',p_pick->>'initiated_by',p_pick->>'blocked_team_code') RETURNING * INTO saved;
  ELSIF p_action='PATCH' THEN
    UPDATE draft_selections SET player_id=(p_pick->>'player_id')::integer,player_name=p_pick->>'player_name',drafted_position=p_pick->>'drafted_position',college_team_name=p_pick->>'college_team_name',headshot=p_pick->>'headshot',team_code=p_pick->>'team_code',initiated_by=p_pick->>'initiated_by',blocked_team_code=p_pick->>'blocked_team_code'
    WHERE season=p_season AND pick_number=(p_pick->>'pick_number')::integer RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pick not found'; END IF;
  ELSIF p_action='DELETE' THEN
    DELETE FROM draft_selections WHERE season=p_season AND pick_number=(p_pick->>'pick_number')::integer RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pick not found'; END IF;
  ELSE RAISE EXCEPTION 'Invalid draft action';
  END IF;
  RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.commit_draft_selection(integer,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_draft_selection(integer,jsonb,text,jsonb) TO service_role;
COMMIT;
