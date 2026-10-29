import { supabase } from '../../../lib/supabase';
import { currentMember } from '../../../lib/auth';
import { getDraftState } from '../../../lib/draftState';
import { DRAFT_SEASON, nextPick, validateSelection, normalizeTeam } from '../../../lib/draftRules.mjs';
import { searchDraftRoster } from '../../../lib/draftRoster';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!supabase) return Response.json({ picks: [] });
  const { data, error } = await supabase.from('draft_selections').select('*').eq('season', DRAFT_SEASON).order('pick_number');
  if (error) return Response.json({ error: 'Unable to load draft picks.' }, { status: 503 });
  return Response.json({ picks: data || [] });
}

async function mutate(request, action) {
  if (!await currentMember()) return Response.json({ error: 'Sign in to record draft picks.' }, { status: 401 });
  try {
    const body = await request.json();
    const { picks, owners, snake, franchise } = await getDraftState();
    const number = Number(body.pickNumber);
    const existing = picks.find((p) => p.pick_number === number);
    let pick;
    if (action === 'DELETE') {
      if (!existing) throw new Error('Pick not found.');
      // Earlier removal would change downstream turns and blocking rights.
      if (number !== picks.length) throw new Error('Undo later picks first to preserve draft order and blocking rights.');
      pick = existing;
    } else {
      const player = (await searchDraftRoster('', Number(body.playerId))).find((p) => p.position === body.draftedPosition);
      if (!player) throw new Error('Choose a player and eligible position from the current pool.');
      if (action === 'PATCH' && !existing) throw new Error('Pick not found.');
      const next = action === 'POST' ? nextPick(picks, snake, franchise) : null;
      const initiator = normalizeTeam(action === 'PATCH' ? existing.initiated_by || existing.team_code : body.teamCode);
      const block = body.block === true;
      const owner = normalizeTeam(owners[player.playerId]);
      pick = {
        pick_number: number,
        round_number: action === 'PATCH' ? existing.round_number : Number(body.roundNumber),
        team_code: block ? owner : initiator,
        initiated_by: initiator,
        blocked_team_code: block ? initiator : null,
        player_id: player.playerId, player_name: player.name, drafted_position: player.position,
        college_team_name: player.college, headshot: player.headshot
      };
      if (action === 'POST' && (!next || next.pickNumber !== number)) throw new Error('Use the current pick. Refresh the draft board.');
      const replay = action === 'POST' ? [...picks, pick] : picks.map((p) => p.pick_number === number ? pick : p);
      const previous = [];
      for (const entry of replay) { validateSelection(entry, previous, snake, franchise, owners); previous.push(entry); }
      if (pick.round_number === 0 && !Object.keys(owners).length) throw new Error('Load the previous-season fantasy rosters before recording franchise picks.');
    }
    const { data, error } = await supabase.rpc('commit_draft_selection', { p_season: DRAFT_SEASON, p_expected: picks, p_action: action, p_pick: pick });
    if (error) {
      const conflict = error.message.includes('Draft changed') || error.code === '23505';
      return Response.json({ error: conflict ? 'Another pick was saved. Refresh and try again.' : 'Unable to save the draft. Check the workspace migration and retry.' }, { status: conflict ? 409 : 503 });
    }
    return Response.json(action === 'DELETE' ? { deleted: true, pickNumber: number } : { pick: data });
  } catch (error) { return Response.json({ error: error instanceof SyntaxError ? 'Invalid request.' : error.message }, { status: 400 }); }
}
export const POST = (request) => mutate(request, 'POST');
export const PATCH = (request) => mutate(request, 'PATCH');
export const DELETE = (request) => mutate(request, 'DELETE');
