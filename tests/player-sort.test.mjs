import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPlayers } from '../lib/playerSort.mjs';
test('stats sort across the full pool, preserve zero, and put missing values last', () => {
  const rows = [{ ppg: null }, { ppg: 0 }, { ppg: 20 }, { ppg: 5 }];
  assert.deepEqual(sortPlayers(rows, 'ppg', 'desc').map((p) => p.ppg), [20, 5, 0, null]);
  assert.deepEqual(sortPlayers(rows, 'ppg', 'asc').map((p) => p.ppg), [0, 5, 20, null]);
  assert.equal(rows[0].ppg, null);
});
test('year sorts by class order and treats the "--" placeholder as missing', () => {
  const rows = [{ year: 'Senior' }, { year: '--' }, { year: 'Freshman' }, { year: 'Junior' }, { year: 'Sophomore' }, { year: null }];
  assert.deepEqual(sortPlayers(rows, 'year', 'asc').map((p) => p.year), ['Freshman', 'Sophomore', 'Junior', 'Senior', '--', null]);
  assert.deepEqual(sortPlayers(rows, 'year', 'desc').map((p) => p.year), ['Senior', 'Junior', 'Sophomore', 'Freshman', '--', null]);
});
