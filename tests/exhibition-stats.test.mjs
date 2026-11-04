import test from "node:test";
import assert from "node:assert/strict";
import { overlayExhibitionStats, summarizeExhibitionStats } from "../lib/exhibitionStats.mjs";

test("exhibition averages keep reported scores with missing minutes and use the latest source season", () => {
  const games = [
    { game_id: 1, season: 2027, game_date: "2026-10-20" },
    { game_id: 2, season: 2027, game_date: "2026-10-25" },
    { game_id: 3, season: 2026, game_date: "2025-10-20" },
    { game_id: 4, season: 2027, game_date: "2026-10-27" }
  ];
  const rows = [
    { game_id: 1, player_id: 10, minutes: null, pts: 10, fgm: 4, fga: 10, tpm: 2, tpa: 5, ftm: 0, fta: 0 },
    { game_id: 2, player_id: 10, minutes: 20, pts: 20, fgm: 8, fga: 15, tpm: 1, tpa: 5, ftm: 3, fta: 4 },
    { game_id: 3, player_id: 10, minutes: 30, pts: 40, fgm: 12, fga: 20, tpm: 4, tpa: 8 },
    { game_id: 4, player_id: 10, minutes: 0, pts: null, fgm: null, fga: null }
  ];
  assert.deepEqual(summarizeExhibitionStats(rows, games)[10], {
    games: 2, stats_season: 2027, ppg: 15, mpg: 20, fgm: 6, fga: 12.5,
    tpm: 1.5, tpa: 5, three_pct: 30, ft_pct: 75, shots_per_game: 12.5, last5_ppg: 15
  });
});

test("players without exhibition games never display regular-season averages", () => {
  const player = { player_id: 10, ppg: 25, mpg: 30, three_pct: 45, stats_season: 2026, team_name: "UCLA" };
  const shown = overlayExhibitionStats(player, null);
  assert.equal(shown.ppg, null);
  assert.equal(shown.mpg, null);
  assert.equal(shown.three_pct, null);
  assert.equal(shown.stats_season, null);
  assert.equal(shown.games, 0);
  assert.equal(shown.team_name, "UCLA");
});
