import assert from "node:assert/strict";
import test from "node:test";
import { chooseCurrentMatchup } from "../lib/currentMatchup.mjs";

const weeks = [
  { season_type: "christmas", week: 4, start_date: "2026-12-21", end_date: "2026-12-31" },
  { season_type: "regular", week: 1, start_date: "2026-12-21", end_date: "2026-12-31" },
  { season_type: "regular", week: 2, start_date: "2027-01-01", end_date: "2027-01-03" }
];

test("prioritizes an active Christmas matchup while A/S remains alive", () => {
  const selected = chooseCurrentMatchup({ weeks, now: "2026-12-24T17:00:00-05:00", tournamentLosses: 1 });
  assert.deepEqual([selected.season_type, selected.week], ["christmas", 4]);
});

test("falls back to the active regular-season matchup after tournament elimination", () => {
  const selected = chooseCurrentMatchup({ weeks, now: "2026-12-24T17:00:00-05:00", tournamentLosses: 2 });
  assert.deepEqual([selected.season_type, selected.week], ["regular", 1]);
});

test("selects the next upcoming window outside an active range", () => {
  const selected = chooseCurrentMatchup({ weeks, now: "2026-12-20T17:00:00-05:00", tournamentLosses: 0 });
  assert.deepEqual([selected.season_type, selected.week], ["christmas", 4]);
});
