const OPPONENT_SLOTS = [
  [3, 7, 5, 6, 4, 8, 2, 4, 7, 2, 6, 3, 8, 5],
  [6, 5, 3, 7, 8, 4, 1, 5, 3, 1, 8, 4, 6, 7],
  [1, 8, 2, 4, 6, 7, 5, 6, 2, 4, 7, 1, 5, 8],
  [5, 6, 7, 3, 1, 2, 8, 1, 8, 3, 5, 2, 7, 6],
  [4, 2, 1, 8, 7, 6, 3, 2, 6, 7, 4, 8, 3, 1],
  [2, 4, 8, 1, 3, 5, 7, 3, 5, 8, 1, 7, 2, 4],
  [8, 1, 4, 2, 5, 3, 6, 8, 1, 5, 3, 6, 4, 2],
  [7, 3, 6, 5, 2, 1, 4, 7, 4, 6, 2, 5, 1, 3]
];

export function buildRegularSeasonMatchups(snakeOrder = []) {
  if (snakeOrder.length !== 8 || new Set(snakeOrder).size !== 8) {
    throw new Error("Configure all eight league teams before generating matchups.");
  }
  return OPPONENT_SLOTS.flatMap((opponents, teamIndex) => opponents.map((opponentSlot, weekIndex) => ({
    week: weekIndex + 1,
    team_code: snakeOrder[teamIndex],
    opponent_team_code: snakeOrder[opponentSlot - 1]
  })));
}

export function buildOpeningTournamentMatchups(snakeOrder = []) {
  if (snakeOrder.length !== 8 || new Set(snakeOrder).size !== 8) {
    throw new Error("Configure all eight league teams before generating matchups.");
  }
  return [[0, 1], [2, 3], [4, 5], [6, 7]].flatMap(([one, two]) => [
    { week: 1, team_code: snakeOrder[one], opponent_team_code: snakeOrder[two] },
    { week: 1, team_code: snakeOrder[two], opponent_team_code: snakeOrder[one] }
  ]);
}
