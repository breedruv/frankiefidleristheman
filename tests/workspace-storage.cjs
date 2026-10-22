// Explicit integration check: temporary negative-season rows are removed in finally.
require('dotenv').config({ path: '.env.local' });
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY);
const season = -20261020;
async function main() {
  try {
    const initial = await admin.rpc('save_draft_shortlist', { p_season: season, p_owner: 'Andrew', p_players: [101, 102], p_revision: 0 });
    assert.ifError(initial.error);
    const concurrent = await Promise.all([
      admin.rpc('save_draft_shortlist', { p_season: season, p_owner: 'Andrew', p_players: [102, 101], p_revision: 1 }),
      admin.rpc('save_draft_shortlist', { p_season: season, p_owner: 'Andrew', p_players: [101], p_revision: 1 })
    ]);
    assert.equal(concurrent.filter((r) => !r.error).length, 1, 'stale list edits must not overwrite each other');
    assert.ok((await anon.from('draft_shortlists').select('*')).error, 'anonymous REST cannot read either list');
    assert.ok((await anon.rpc('save_draft_shortlist', { p_season: season, p_owner: 'Sam', p_players: [], p_revision: 0 })).error, 'anonymous RPC cannot edit lists');
    const pick = { pick_number: 1, round_number: 0, team_code: 'DD', initiated_by: 'Len', blocked_team_code: 'Len', player_id: 101, player_name: 'Storage check', drafted_position: 'G' };
    const awards = await Promise.all([
      admin.rpc('commit_draft_selection', { p_season: season, p_expected: [], p_action: 'POST', p_pick: pick }),
      admin.rpc('commit_draft_selection', { p_season: season, p_expected: [], p_action: 'POST', p_pick: { ...pick, player_id: 102 } })
    ]);
    assert.equal(awards.filter((r) => !r.error).length, 1, 'only one concurrent award can use the current pick');
    const snapshot = await admin.from('draft_selections').select('*').eq('season', season).order('pick_number');
    assert.ifError(snapshot.error);
    const second = await admin.rpc('commit_draft_selection', { p_season: season, p_expected: snapshot.data, p_action: 'POST', p_pick: { ...pick, pick_number: 2, player_id: 103, team_code: 'Len', initiated_by: 'Len', blocked_team_code: null } });
    assert.ifError(second.error, 'REST snapshot must match database JSON including timestamps');
    assert.ok((await anon.rpc('commit_draft_selection', { p_season: season, p_expected: [], p_action: 'POST', p_pick: pick })).error, 'anonymous users cannot bypass the draft API');
    console.log('PASS: shortlist revisions, anonymous access, and concurrent draft saves.');
  } finally {
    for (const table of ['draft_shortlists', 'draft_selections']) {
      const { error } = await admin.from(table).delete().eq('season', season);
      assert.ifError(error);
    }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
