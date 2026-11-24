import assert from "node:assert/strict";
import test from "node:test";
import { buildOpeningTournamentMatchups, buildRegularSeasonMatchups } from "../lib/regularSeasonSchedule.mjs";

const snake = ["AS", "BJ", "SL", "MB", "John B", "DD", "Len", "Brandon"];

test("builds every reciprocal regular-season matchup from the draft-admin order", () => {
  const matchups = buildRegularSeasonMatchups(snake);

  assert.equal(matchups.length, 112);
  assert.deepEqual(
    matchups.filter((matchup) => matchup.week === 1 && matchup.team_code === "AS")[0],
    { week: 1, team_code: "AS", opponent_team_code: "SL" }
  );
  assert.deepEqual(
    matchups.filter((matchup) => matchup.week === 1 && matchup.team_code === "SL")[0],
    { week: 1, team_code: "SL", opponent_team_code: "AS" }
  );
});

test("requires all eight configured teams before generating a schedule", () => {
  assert.throws(() => buildRegularSeasonMatchups(snake.slice(0, 7)), /eight league teams/i);
});

test("builds the confirmed Christmas opening pairings from Draft Admin order", () => {
  assert.deepEqual(buildOpeningTournamentMatchups(snake), [
    { week: 1, team_code: "AS", opponent_team_code: "BJ" },
    { week: 1, team_code: "BJ", opponent_team_code: "AS" },
    { week: 1, team_code: "SL", opponent_team_code: "MB" },
    { week: 1, team_code: "MB", opponent_team_code: "SL" },
    { week: 1, team_code: "John B", opponent_team_code: "DD" },
    { week: 1, team_code: "DD", opponent_team_code: "John B" },
    { week: 1, team_code: "Len", opponent_team_code: "Brandon" },
    { week: 1, team_code: "Brandon", opponent_team_code: "Len" }
  ]);
});
