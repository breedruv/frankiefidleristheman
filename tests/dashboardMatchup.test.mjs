import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardMatchup } from "../lib/dashboardMatchup.mjs";

const teams = [
  { fantasy_team_id: 1, short_code: "AS", name: "B Town Sparties" },
  { fantasy_team_id: 2, short_code: "BJ", name: "BJ" }
];

test("selects A/S's upcoming Christmas matchup before the tournament begins", () => {
  const result = resolveDashboardMatchup({
    weeks: [{ season_type: "christmas", week: 1, label: "Jeff Crose Memorial - Round 1", start_date: "2026-11-30", end_date: "2026-12-06" }],
    matchups: [{ season_type: "christmas", week: 1, fantasy_team_id: 1, opponent_fantasy_team_id: 2 }],
    teams,
    now: "2026-11-23T12:00:00-05:00"
  });

  assert.deepEqual(result, {
    window: { season_type: "christmas", week: 1, label: "Jeff Crose Memorial - Round 1", start_date: "2026-11-30", end_date: "2026-12-06" },
    team: teams[0],
    opponent: teams[1]
  });
});

test("returns a window without inventing an opponent when the schedule is not seeded", () => {
  const result = resolveDashboardMatchup({
    weeks: [{ season_type: "regular", week: 1, label: "Week 1", start_date: "2026-12-21", end_date: "2026-12-31" }],
    matchups: [],
    teams,
    now: "2026-12-22T12:00:00-05:00",
    tournamentLosses: 2
  });
  assert.equal(result.window.week, 1);
  assert.equal(result.team.short_code, "AS");
  assert.equal(result.opponent, null);
});
