import assert from "node:assert/strict";
import test from "node:test";
import { sortPositionRoster } from "../lib/rosterBoard.mjs";

const guards = [
  { name: "First", positionPick: 2, ppg: 18.4 },
  { name: "Second", positionPick: 1, ppg: 15.2 },
  { name: "Third", positionPick: 3, ppg: 20.1 }
];

test("sorts a positional roster by its own pick order", () => {
  assert.deepEqual(sortPositionRoster(guards, "pick").map((player) => player.name), ["Second", "First", "Third"]);
});

test("sorts a positional roster by PPG without changing position membership", () => {
  assert.deepEqual(sortPositionRoster(guards, "ppg").map((player) => player.name), ["Third", "First", "Second"]);
});
