import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyJobDue, injuryCheckDue, liveWindowOpen } from '../lib/collectorSchedule.mjs';
import { diffInjuries, matchInjuries, normalizeName } from '../lib/injuries.mjs';

test('daily jobs run once per ET game day after their hour', () => {
  const at = (iso) => new Date(iso);
  // 4am ET in November is 09:00 UTC.
  assert.equal(dailyJobDue('2026-11-03T09:05:00Z', at('2026-11-04T08:59:00Z'), 4), false);
  assert.equal(dailyJobDue(null, at('2026-11-04T08:59:00Z'), 4), true);
  assert.equal(dailyJobDue('2026-11-03T09:05:00Z', at('2026-11-04T09:00:00Z'), 4), true);
  assert.equal(dailyJobDue('2026-11-04T09:01:00Z', at('2026-11-04T20:00:00Z'), 4), false);
  // Just after midnight ET still belongs to the previous game day.
  assert.equal(dailyJobDue('2026-11-03T09:05:00Z', at('2026-11-04T05:30:00Z'), 4), false);
  assert.equal(dailyJobDue('2026-11-04T09:01:00Z', at('2026-11-04T15:00:00Z'), 10), true);
});

test('live window opens five minutes before the first tip', () => {
  const now = new Date('2026-11-04T23:56:00Z');
  assert.equal(liveWindowOpen([{ game_datetime: '2026-11-05T00:00:00Z' }], now), true);
  assert.equal(liveWindowOpen([{ game_datetime: '2026-11-05T00:30:00Z' }], now), false);
  assert.equal(liveWindowOpen([], now), false);
});

test('hourly injury checks run only while a roster game is still ahead', () => {
  const now = new Date('2026-11-04T20:00:00Z');
  assert.equal(injuryCheckDue('2026-11-04T18:30:00Z', now, ['2026-11-05T00:00:00Z']), true);
  assert.equal(injuryCheckDue('2026-11-04T19:30:00Z', now, ['2026-11-05T00:00:00Z']), false);
  assert.equal(injuryCheckDue(null, now, ['2026-11-04T19:00:00Z']), false);
});

const roster = [
  { player_id: 1, name: 'Cole Cloer', teamNames: ['Alabama', 'Alabama Crimson Tide'] },
  { player_id: 2, name: "Ja'Kobe Walter Jr.", teamNames: ['Baylor'] },
  { player_id: 3, name: 'Chris Smith', teamNames: ['Duke'] },
  { player_id: 4, name: 'Chris Smith', teamNames: ['Kansas'] }
];

test('Rotowire rows match roster players by name, with team breaking ties', () => {
  assert.equal(normalizeName("Ja'Kobe Walter Jr."), 'jakobe walter');
  const matches = matchInjuries([
    { player: 'Cole Cloer', team: 'Alabama', status: 'Game Time Decision', injury: 'Lower Body' },
    { player: 'JaKobe Walter', team: 'Baylor', status: 'Out', injury: 'Ankle' },
    { player: 'Chris Smith', team: 'Kansas', status: 'Out', injury: 'Knee' },
    { player: 'Chris Smith', team: 'Rhode Island', status: 'Out', injury: 'Knee' },
    { player: 'Justin Begg', team: 'Sam Houston', status: 'Out', injury: 'Undisclosed' },
    // Same name as a pool player but listed under another pool team: a different person.
    { player: 'Cole Cloer', team: 'Kansas', status: 'Out', injury: 'Knee' }
  ], roster);
  assert.deepEqual(matches.map((m) => m.player_id), [1, 2, 4]);
});

test('injury diff reports new, changed and cleared listings and ignores manual rows', () => {
  const stored = [
    { player_id: 1, source: 'rotowire', status: 'Game Time Decision', injury: 'Lower Body', cleared_at: null },
    { player_id: 2, source: 'rotowire', status: 'Out', injury: 'Ankle', cleared_at: null },
    { player_id: 3, source: 'manual', status: 'Out', injury: null, cleared_at: null },
    { player_id: 4, source: 'rotowire', status: 'Out', injury: 'Knee', cleared_at: '2026-11-01T00:00:00Z' }
  ];
  const changes = diffInjuries(stored, [
    { player_id: 1, status: 'Out', injury: 'Lower Body' },
    { player_id: 4, status: 'Out', injury: 'Knee' }
  ]);
  assert.deepEqual(changes.map((c) => [c.type, c.player_id]), [['changed', 1], ['new', 4], ['cleared', 2]]);
  assert.equal(changes[0].from, 'Game Time Decision');
});

test('availability flags injuries first, then players missing games', async () => {
  const { availabilityFlag, gamesMissed } = await import('../lib/availability.mjs');
  const rows = [
    { player_id: 1, game_id: 10, team_id: 5, minutes: 30, game_date: '2026-11-03' },
    { player_id: 2, game_id: 10, team_id: 5, minutes: 0, game_date: '2026-11-03' },
    { player_id: 1, game_id: 11, team_id: 5, minutes: 0, game_date: '2026-11-06' },
    { player_id: 1, game_id: 12, team_id: 5, minutes: 0, game_date: '2026-11-09' },
    { player_id: 1, game_id: 99, team_id: 5, minutes: 25, game_date: '2026-11-10' }
  ];
  const games = gamesMissed(rows, new Map([[1, 5], [2, 5], [3, 7]]), new Set([99]));
  assert.deepEqual(games.get(1), { team_games: 3, played: 1, recent_missed: 2, last_played: '2026-11-03' });
  assert.equal(availabilityFlag([], games.get(1)).label, 'Missed last 2');
  assert.equal(availabilityFlag([], games.get(2)).label, "Hasn't played (0/3)");
  assert.equal(availabilityFlag([], games.get(3)).level, null);
  const injuries = [
    { source: 'rotowire', status: 'Game Time Decision', injury: 'Ankle', cleared_at: null },
    { source: 'manual', status: 'Out for season', injury: 'ACL', updated_by: 'Andrew', cleared_at: null }
  ];
  assert.deepEqual([availabilityFlag(injuries, games.get(2)).level, availabilityFlag(injuries, games.get(2)).label], ['out', 'Out for season']);
  assert.equal(availabilityFlag(injuries.slice(0, 1), null).level, 'gtd');
  assert.equal(availabilityFlag([{ ...injuries[1], cleared_at: '2026-11-10' }], null), null);
});
