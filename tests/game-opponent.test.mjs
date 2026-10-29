import test from "node:test";
import assert from "node:assert/strict";
import { resolveGameOpponent } from "../lib/gameOpponent.mjs";

const teams = [
  { id: "26", location: "UCLA", logos: [{ href: "https://example.com/ucla.png" }] },
  { id: "301", location: "San Diego", logos: [{ href: "https://example.com/san-diego.png" }] }
];

test("resolves an exhibition opponent when the game has no team IDs", () => {
  const game = { team_id: 26, opponent_id: null, opponent_name: "UCLA" };
  const matchup = { home_team_id: null, away_team_id: null, home_team_name: "UCLA", away_team_name: "San Diego" };
  assert.deepEqual(resolveGameOpponent(game, matchup, teams), {
    ...game, opponent_id: 301, opponent_name: "San Diego", opponent_logo: "https://example.com/san-diego.png"
  });
});

test("keeps the opponent name but omits a logo when ESPN has no matching team", () => {
  const game = { team_id: 26, opponent_id: null, opponent_name: "UCLA" };
  const matchup = { home_team_id: null, away_team_id: null, home_team_name: "UCLA", away_team_name: "Saint Leo" };
  const result = resolveGameOpponent(game, matchup, teams);
  assert.equal(result.opponent_name, "Saint Leo");
  assert.equal(result.opponent_logo, null);
});

test("uses the recorded opponent ID for a regular game", () => {
  const game = { team_id: 26, opponent_id: 301, opponent_name: "San Diego" };
  const matchup = { home_team_id: 26, away_team_id: 301, home_team_name: "UCLA", away_team_name: "San Diego" };
  assert.equal(resolveGameOpponent(game, matchup, teams).opponent_logo, "https://example.com/san-diego.png");
});
