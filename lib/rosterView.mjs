export const rosterGroups = [
  { label: "Centers", short: "C", count: 3, className: "center" },
  { label: "Forwards", short: "F", count: 5, className: "forward" },
  { label: "Guards", short: "G", count: 5, className: "guard" }
];

export function supplementalRoster(history) {
  const players = {};
  let count = 0;
  for (const [key, player] of Object.entries(history)) {
    const [round, team] = key.split("-");
    const index = Number(round) - 13;
    if (!team || index < 0) continue;
    players[`${team}-${index}`] = player;
    count = Math.max(count, index + 1);
  }
  return { count, players };
}
