import { currentMember } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { MANUAL_STATUSES } from '../../../lib/availability.mjs';
import { clearAvailabilityCache, getAvailability } from '../../../lib/availability';
export const dynamic = 'force-dynamic';

// Manual Out/GTD flags set by Andrew or Sam. They outrank Rotowire and stay until cleared.
export async function PUT(request) {
  const member = await currentMember();
  if (!member) return Response.json({ error: 'Sign in to flag injuries.' }, { status: 401 });
  if (!supabase) return Response.json({ error: 'Injury storage is unavailable.' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const playerId = Number(body.playerId);
  if (!Number.isInteger(playerId)) return Response.json({ error: 'Choose a player.' }, { status: 400 });
  const now = new Date().toISOString();
  let result;
  if (body.status == null) {
    result = await supabase.from('player_injuries').update({ cleared_at: now, checked_at: now, updated_by: member }).eq('player_id', playerId).eq('source', 'manual');
  } else {
    if (!MANUAL_STATUSES.includes(body.status)) return Response.json({ error: 'Choose Out for season, Out, or Game Time Decision.' }, { status: 400 });
    const note = typeof body.injury === 'string' ? body.injury.trim().slice(0, 120) : '';
    result = await supabase.from('player_injuries').upsert({
      player_id: playerId, source: 'manual', status: body.status, injury: note || null, updated_by: member,
      first_reported_at: now, checked_at: now, cleared_at: null
    }, { onConflict: 'player_id,source' });
  }
  if (result.error) return Response.json({ error: result.error.code === 'PGRST205' ? 'Injury storage is not set up yet. Run db/player-injuries.sql in Supabase.' : 'Unable to save the injury flag. Please try again.' }, { status: 503 });
  clearAvailabilityCache();
  return Response.json({ availability: (await getAvailability()).get(playerId) || null });
}
