// Pure helpers for matching Rotowire's injury table to the draft pool.

export const ROTOWIRE_INJURY_URL = 'https://www.rotowire.com/cbasketball/tables/injury-report.php?team=ALL&pos=ALL';

export function normalizeName(name) {
  return (name ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.'’-]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
}

// Name must match. The Rotowire team breaks ties, and a listing under a different known team is another player.
export function matchInjuries(feed, roster) {
  const byName = new Map();
  const knownTeams = new Set();
  for (const player of roster) {
    const key = normalizeName(player.name);
    byName.set(key, [...(byName.get(key) || []), player]);
    player.teamNames.forEach((name) => knownTeams.add(normalizeName(name)));
  }
  const matches = [];
  for (const row of feed || []) {
    const candidates = byName.get(normalizeName(row.player || `${row.firstname} ${row.lastname}`)) || [];
    const team = normalizeName(row.team);
    const onTeam = candidates.find((p) => p.teamNames.some((n) => normalizeName(n) === team));
    const player = onTeam || (candidates.length === 1 && !knownTeams.has(team) ? candidates[0] : null);
    if (!player) continue;
    matches.push({ player_id: player.player_id, status: row.status || null, injury: row.injury || null, source_player: row.player || null, source_team: row.team || null });
  }
  return matches;
}

// Compares stored Rotowire rows with the latest matches: new listings, status changes, and clears.
export function diffInjuries(stored, matches) {
  const previous = new Map(stored.filter((row) => row.source === 'rotowire' && !row.cleared_at).map((row) => [row.player_id, row]));
  const current = new Map(matches.map((row) => [row.player_id, row]));
  const changes = [];
  for (const row of matches) {
    const before = previous.get(row.player_id);
    if (!before) changes.push({ type: 'new', ...row });
    else if (before.status !== row.status || before.injury !== row.injury) changes.push({ type: 'changed', from: before.status, ...row });
  }
  for (const row of previous.values()) {
    if (!current.has(row.player_id)) changes.push({ type: 'cleared', player_id: row.player_id, status: row.status, injury: row.injury });
  }
  return changes;
}
