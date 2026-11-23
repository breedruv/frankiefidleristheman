export const rosterGroups = [
  { label: "Centers", short: "C", count: 3, className: "center" },
  { label: "Forwards", short: "F", count: 5, className: "forward" },
  { label: "Guards", short: "G", count: 5, className: "guard" }
];

export function rosterRowsForTeams(teamCounts, teams) {
  return rosterGroups.map((group) => ({
    ...group,
    count: Math.max(group.count, ...teams.map((team) => teamCounts[team]?.[group.short] || 0))
  }));
}
