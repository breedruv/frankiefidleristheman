const starterSlots = ["C", "F1", "F2", "G1", "G2"];
const starterPositions = ["C", "F", "F", "G", "G"];
const sampleStates = [[
  [18, "Final"], [14, "Final"], [8, "Final"], [11, "Live · 2nd"], [0, "Tonight"], [0, "Tonight"], [0, "Tomorrow"]
], [
  [12, "Final"], [9, "Final"], [17, "Final"], [6, "Live · 2nd"], [0, "Tonight"], [0, "Tonight"], [0, "Tomorrow"]
]];

export function buildSampleLineup(roster = [], variant = 0) {
  const remaining = roster.slice();
  const take = (position) => {
    const index = remaining.findIndex((player) => player.drafted_position === position);
    return index === -1 ? null : remaining.splice(index, 1)[0];
  };
  const starters = starterPositions.map(take);
  const players = [...starters, remaining[0] || null, remaining[1] || null];
  const states = sampleStates[variant % sampleStates.length];
  return players.map((player, index) => ({
    slot: index < 5 ? starterSlots[index] : `T${index - 4}`,
    name: player?.name || "Open slot",
    points: states[index][0],
    status: states[index][1]
  }));
}
