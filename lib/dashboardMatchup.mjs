import { normalizeTeam } from "./draftRules.mjs";
import { chooseCurrentMatchup } from "./currentMatchup.mjs";

export function resolveDashboardMatchup({
  weeks = [],
  matchups = [],
  teams = [],
  now = new Date(),
  tournamentLosses = 0
} = {}) {
  const window = chooseCurrentMatchup({ weeks, now, tournamentLosses });
  const team = teams.find((candidate) => normalizeTeam(candidate.short_code) === "AS") || null;
  if (!window || !team) return { window, team, opponent: null };
  const matchup = matchups.find((candidate) =>
    candidate.season_type === window.season_type &&
    Number(candidate.week) === Number(window.week) &&
    Number(candidate.fantasy_team_id) === Number(team.fantasy_team_id)
  );
  const opponent = matchup
    ? teams.find((candidate) => Number(candidate.fantasy_team_id) === Number(matchup.opponent_fantasy_team_id)) || null
    : null;
  return { window, team, opponent };
}
