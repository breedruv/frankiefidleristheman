import assert from "node:assert/strict";
import test from "node:test";
import { formatFocusedGame } from "../lib/scoreboardFocus.mjs";

test("formats a final focused-game row with matchup score and player points", () => {
  assert.deepEqual(formatFocusedGame({
    status: "Final",
    team_abbr: "TEX",
    opponent_abbr: "DUKE",
    team_score: 74,
    opponent_score: 71,
    points: 18
  }), {
    state: "final",
    game: "Final · TEX 74–71 DUKE",
    points: "18 pts"
  });
});

test("formats a live focused-game row", () => {
  assert.deepEqual(formatFocusedGame({
    status: "In Progress",
    team_abbr: "TEX",
    opponent_abbr: "DUKE",
    team_score: 42,
    opponent_score: 38,
    points: 7
  }), {
    state: "live",
    game: "Live · TEX 42–38 DUKE",
    points: "7 pts"
  });
});
