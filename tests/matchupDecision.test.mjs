import assert from "node:assert/strict";
import test from "node:test";
import { decideMatchup, resolveMatchup } from "../lib/matchupDecision.mjs";

const complete = (points) => ({ points, complete: true });

test("advances the starting-five winner without waiting for T1 or T2", () => {
  const result = decideMatchup({
    home: { teamId: 1, starters: complete(110), t1: { points: 0, complete: false }, t2: { points: 0, complete: false } },
    away: { teamId: 2, starters: complete(104), t1: { points: 0, complete: false }, t2: { points: 0, complete: false } }
  });
  assert.deepEqual(result, { status: "decided", winnerTeamId: 1, decidedBy: "starters" });
});

test("waits for both starting fives before deciding a matchup", () => {
  const result = decideMatchup({
    home: { teamId: 1, starters: complete(110) },
    away: { teamId: 2, starters: { points: 104, complete: false } }
  });
  assert.deepEqual(result, { status: "pending", waitingFor: "starters" });
});

test("uses T1 only when the starting fives are tied", () => {
  const result = decideMatchup({
    home: { teamId: 1, starters: complete(105), t1: complete(18) },
    away: { teamId: 2, starters: complete(105), t1: complete(15) }
  });
  assert.deepEqual(result, { status: "decided", winnerTeamId: 1, decidedBy: "t1" });
});

test("uses T2 only when starters and T1 are tied", () => {
  const result = decideMatchup({
    home: { teamId: 1, starters: complete(105), t1: complete(18), t2: complete(10) },
    away: { teamId: 2, starters: complete(105), t1: complete(18), t2: complete(12) }
  });
  assert.deepEqual(result, { status: "decided", winnerTeamId: 2, decidedBy: "t2" });
});

test("requires a manual review after a complete tie through T2", () => {
  const result = decideMatchup({
    home: { teamId: 1, starters: complete(105), t1: complete(18), t2: complete(10) },
    away: { teamId: 2, starters: complete(105), t1: complete(18), t2: complete(10) }
  });
  assert.deepEqual(result, { status: "review", waitingFor: "manual_decision" });
});

test("keeps the computed result available when an administrator overrides it", () => {
  const result = resolveMatchup({
    home: { teamId: 1, starters: complete(110) },
    away: { teamId: 2, starters: complete(104) },
    overrideWinnerTeamId: 2
  });
  assert.deepEqual(result, {
    status: "decided",
    winnerTeamId: 2,
    decidedBy: "manual",
    computed: { status: "decided", winnerTeamId: 1, decidedBy: "starters" }
  });
});

test("reopening clears only the override and recalculates from the same lineups", () => {
  const result = resolveMatchup({
    home: { teamId: 1, starters: complete(110) },
    away: { teamId: 2, starters: complete(104) }
  });
  assert.deepEqual(result, {
    status: "decided",
    winnerTeamId: 1,
    decidedBy: "starters",
    computed: { status: "decided", winnerTeamId: 1, decidedBy: "starters" }
  });
});
