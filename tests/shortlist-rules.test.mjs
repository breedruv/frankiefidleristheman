import test from 'node:test';
import assert from 'node:assert/strict';
import { validateShortlist } from '../lib/shortlistRules.mjs';
const pool = new Set(Array.from({ length: 12 }, (_, i) => i + 1));
test('each member can edit only their own list', () => {
  assert.throws(() => validateShortlist('Andrew', { owner: 'Sam', playerIds: [1], revision: 0 }, pool));
  assert.throws(() => validateShortlist(null, { owner: 'Andrew', playerIds: [1], revision: 0 }, pool));
});
test('manual ordering is preserved, with no duplicates or more than ten entries', () => {
  assert.deepEqual(validateShortlist('Andrew', { owner: 'Andrew', playerIds: [3, 1, 2], revision: 2 }, pool), [3, 1, 2]);
  for (const ids of [[1, 1], [99], [...pool]]) assert.throws(() => validateShortlist('Andrew', { owner: 'Andrew', playerIds: ids, revision: 0 }, pool));
  assert.deepEqual(validateShortlist('Sam', { owner: 'Sam', playerIds: [], revision: 0 }, pool), []);
});
