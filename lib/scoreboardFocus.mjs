export function formatFocusedGame(row = {}) {
  const status = String(row.status || "").toLowerCase();
  const state = status.includes("final") ? "final" : status.includes("progress") || status.includes("live") ? "live" : "upcoming";
  const matchup = row.team_abbr && row.opponent_abbr && row.team_score !== null && row.team_score !== undefined && row.opponent_score !== null && row.opponent_score !== undefined
    ? `${row.team_abbr} ${row.team_score}–${row.opponent_score} ${row.opponent_abbr}`
    : [row.team_abbr, row.opponent_abbr ? `vs ${row.opponent_abbr}` : ""].filter(Boolean).join(" ");
  const prefix = state === "final" ? "Final" : state === "live" ? "Live" : "Upcoming";

  return {
    state,
    game: matchup ? `${prefix} · ${matchup}` : prefix,
    points: row.points === null || row.points === undefined ? "—" : `${row.points} pts`
  };
}
