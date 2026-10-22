import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPick, validateSelection, normalizeTeam, blockingOwner, draftOrders } from '../lib/draftRules.mjs';
const snake = ['Len', 'John B', 'DD', 'MB', 'AS', 'SL', 'Brandon', 'BJ'];
const owners = { 1: 'DD', 2: 'DD', 3: 'DD', 4: 'Len' };
const pick = (n, team, player, blocked = null) => ({ pick_number: n, round_number: 0, team_code: team, player_id: player, drafted_position: 'G', initiated_by: blocked || team, blocked_team_code: blocked });
test('a block awards first overall to D/D and Len chooses again', () => {
  const first = pick(1, 'DD', 1, 'Len');
  assert.doesNotThrow(() => validateSelection(first, [], snake, snake, owners));
  assert.equal(nextPick([first], snake, snake).teamCode, 'Len');
  assert.doesNotThrow(() => validateSelection(pick(2, 'Len', 2), [first], snake, snake, owners));
  assert.equal(nextPick([first, pick(2, 'Len', 2)], snake, snake).teamCode, 'John B');
});
test('only an unfinished previous owner can block; all pool players may be selected', () => {
  assert.throws(() => validateSelection(pick(1, 'MB', 1, 'Len'), [], snake, snake, owners));
  assert.doesNotThrow(() => validateSelection(pick(1, 'Len', 999), [], snake, snake, owners));
  const picks = [pick(1, 'Len', 4)];
  assert.throws(() => validateSelection(pick(2, 'Len', 4, 'John B'), picks, snake, snake, owners));
});
test('snake order is fixed and completed draft has no next pick', () => {
  const picks = snake.map((team, i) => pick(i + 1, team, i + 20));
  assert.deepEqual(nextPick(picks, snake, snake), { pickNumber: 9, roundNumber: 1, teamCode: 'Len' });
  assert.throws(() => validateSelection({ ...pick(9, 'DD', 55), round_number: 1 }, picks, snake, snake, owners));
  const full = Array.from({ length: 144 }, (_, i) => ({ pick_number: i + 1, round_number: Math.floor(i / 8), team_code: snake[i % 8] }));
  assert.equal(nextPick(full, snake, snake), null);
  assert.equal(normalizeTeam('D/D'), 'DD');
});
test('direct retention and ordinary picks release remaining previous roster', () => {
  const retained = pick(1, 'Len', 4);
  assert.doesNotThrow(() => validateSelection(retained, [], snake, snake, owners));
  assert.equal(blockingOwner(4, [retained], owners), null);
  assert.equal(blockingOwner(2, [pick(1, 'DD', 1, 'Len')], owners), null);
  assert.equal(blockingOwner(2, [pick(1, 'Len', 999)], owners), 'DD');
});
test('all 144 picks follow franchise and alternating snake order', () => {
  const picks = [];
  for (let number = 1; number <= 144; number++) {
    const next = nextPick(picks, snake, snake);
    const teamCount = picks.filter((p) => p.team_code === next.teamCode).length;
    const position = teamCount < 3 ? 'C' : teamCount < 8 ? 'F' : 'G';
    const entry = { ...pick(number, next.teamCode, number + 1000), round_number: next.roundNumber, drafted_position: position };
    assert.doesNotThrow(() => validateSelection(entry, picks, snake, snake, owners));
    if (number === 17) assert.equal(next.teamCode, 'BJ');
    picks.push(entry);
  }
  assert.equal(nextPick(picks, snake, snake), null);
});
test('configuration rejects duplicate teams and franchise positions', () => {
  const rows = snake.map((team, i) => ({ team, slot: i + 1, franchiseOrder: i + 1 }));
  assert.deepEqual(draftOrders(rows).snake, snake);
  assert.throws(() => draftOrders(rows.map((row) => ({ ...row, franchiseOrder: 1 }))));
  assert.throws(() => draftOrders(rows.slice(0, 7)));
});
