const id = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const name = (value) => String(value || "").trim().toLowerCase();

export function resolveGameOpponent(game, matchup, teams) {
  const byId = new Map(teams.map((team) => [id(team.id), team]));
  const byName = new Map(teams.map((team) => [name(team.location), team]));
  const findTeam = (teamId, teamName) => byId.get(id(teamId)) || byName.get(name(teamName));
  const home = matchup && findTeam(matchup.home_team_id, matchup.home_team_name);
  const away = matchup && findTeam(matchup.away_team_id, matchup.away_team_name);
  const ownId = id(game.team_id);
  const isHome = ownId && matchup && (id(matchup.home_team_id) === ownId || id(home?.id) === ownId);
  const isAway = ownId && matchup && (id(matchup.away_team_id) === ownId || id(away?.id) === ownId);
  const opponent = isHome ? away : isAway ? home : byId.get(id(game.opponent_id));
  const opponentId = id(opponent?.id) || (isHome ? id(matchup.away_team_id) : isAway ? id(matchup.home_team_id) : id(game.opponent_id));
  return {
    ...game,
    opponent_id: opponentId,
    opponent_name: isHome ? matchup.away_team_name : isAway ? matchup.home_team_name : game.opponent_name,
    opponent_logo: opponent?.logos?.[0]?.href || (opponentId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${opponentId}.png` : null)
  };
}
