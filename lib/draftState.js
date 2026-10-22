import { supabase } from './supabase';
import { DRAFT_SEASON, draftOrders, normalizeTeam } from './draftRules.mjs';
import { getDraftHistory } from './draftHistory';

export async function getDraftState() {
  if (!supabase) throw new Error('Draft storage is not configured.');
  const [picksResult, configResult, rosterResult, teamsResult] = await Promise.all([
    supabase.from('draft_selections').select('*').eq('season', DRAFT_SEASON).order('pick_number'),
    supabase.from('draft_configurations').select('snake_order').eq('season', DRAFT_SEASON).maybeSingle(),
    supabase.from('fantasy_rosters').select('player_id, fantasy_team_id').eq('season', DRAFT_SEASON - 1).limit(1000),
    supabase.from('fantasy_teams').select('fantasy_team_id, short_code')
  ]);
  if ([picksResult, configResult, rosterResult, teamsResult].some((result) => result.error)) throw new Error('Unable to load draft order or previous-season rosters.');
  const teams = new Map(teamsResult.data.map((row) => [row.fantasy_team_id, normalizeTeam(row.short_code)]));
  const owners = {};
  for (const row of rosterResult.data) {
    const owner = teams.get(row.fantasy_team_id);
    if (!owner || (owners[row.player_id] && owners[row.player_id] !== owner)) throw new Error('Resolve conflicting previous-season roster ownership before drafting.');
    owners[row.player_id] = owner;
  }
  // Andrew confirmed Draft.csv is the end-of-2025 ownership snapshot for this draft.
  if (!rosterResult.data.length && DRAFT_SEASON === 2026) {
    for (const player of Object.values(getDraftHistory('2025')?.draftSlots || {})) {
      const owner = normalizeTeam(player.teamCode);
      if (owners[player.playerId] && owners[player.playerId] !== owner) throw new Error('Conflicting ownership in Draft.csv.');
      owners[player.playerId] = owner;
    }
  }
  return { picks: picksResult.data, owners, ...draftOrders(configResult.data?.snake_order) };
}
