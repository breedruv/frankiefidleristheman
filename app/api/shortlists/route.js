import { currentMember } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { DRAFT_SEASON } from '../../../lib/draftRules.mjs';
import { getDraftRosterPool } from '../../../lib/draftRoster';
import { validateShortlist } from '../../../lib/shortlistRules.mjs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const member = await currentMember();
  if (!member) return Response.json({ error: 'Sign in to view your team’s lists.' }, { status: 401 });
  if (!supabase) return Response.json({ error: 'Shortlist storage is not configured.' }, { status: 503 });
  const { data, error } = await supabase.from('draft_shortlists').select('owner_name, player_ids, revision').eq('season', DRAFT_SEASON);
  if (error) return Response.json({ error: 'Shortlist storage is unavailable. Check the workspace migration.' }, { status: 503 });
  return Response.json({ member, lists: ['Andrew', 'Sam'].map((owner) => data.find((row) => row.owner_name === owner) || { owner_name: owner, player_ids: [], revision: 0 }) });
}

export async function PUT(request) {
  const member = await currentMember();
  if (!member) return Response.json({ error: 'Sign in to edit your list.' }, { status: 401 });
  if (!supabase) return Response.json({ error: 'Shortlist storage is unavailable.' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (body.owner !== member) return Response.json({ error: 'You can edit only your own list.' }, { status: 403 });
  const pool = new Set(getDraftRosterPool(10000).map((p) => p.player_id));
  let ids;
  try { ids = validateShortlist(member, body, pool); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
  const { data, error } = await supabase.rpc('save_draft_shortlist', { p_season: DRAFT_SEASON, p_owner: member, p_players: ids, p_revision: body.revision });
  if (error) return Response.json({ error: error.message.includes('List changed') ? 'Your list changed in another window. Reload and try again.' : 'Unable to save your list. Please try again.' }, { status: error.message.includes('List changed') ? 409 : 503 });
  return Response.json({ list: data });
}
