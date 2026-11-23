import assert from "node:assert/strict";
import test from "node:test";
import { rosterRowsForTeams } from "../lib/rosterView.mjs";

test("roster view expands each position for drafted supplemental players", () => {
  const rows = rosterRowsForTeams({ AS: { C: 3, F: 8, G: 7 } }, ["AS"]);

  assert.deepEqual(rows.map(({ short, count }) => [short, count]), [["C", 3], ["F", 8], ["G", 7]]);
});

test("roster view retains the normal empty roster slots", () => {
  const rows = rosterRowsForTeams({ AS: { C: 1, F: 2, G: 4 } }, ["AS"]);

  assert.deepEqual(rows.map(({ short, count }) => [short, count]), [["C", 3], ["F", 5], ["G", 5]]);
});
