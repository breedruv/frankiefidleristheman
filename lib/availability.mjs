// Pure helpers for player availability: injury listings plus games missed from loaded box scores.

export const MANUAL_STATUSES = ['Out for season', 'Out', 'Game Time Decision'];

// Per player: team games with a box score, games played (minutes > 0), consecutive most-recent games missed, last game played.
// rows: player_games rows ({ player_id, game_id, team_id, minutes, game_date }); playerTeams: Map player_id -> current team_id.
export function gamesMissed(rows, playerTeams, excludeGameIds = new Set()) {
  const teamGames = new Map();
  const played = new Map();
  for (const row of rows) {
    if (excludeGameIds.has(Number(row.game_id))) continue;
    const games = teamGames.get(Number(row.team_id)) || new Map();
    games.set(Number(row.game_id), row.game_date || '');
    teamGames.set(Number(row.team_id), games);
    if (Number(row.minutes) > 0) played.set(`${row.player_id}:${row.game_id}`, row.game_date || '');
  }
  const result = new Map();
  for (const [playerId, teamId] of playerTeams) {
    const games = [...(teamGames.get(Number(teamId)) || new Map())].sort((a, b) => b[1].localeCompare(a[1]) || b[0] - a[0]);
    let count = 0;
    let recentMissed = 0;
    let lastPlayed = null;
    for (const [gameId, date] of games) {
      if (played.has(`${playerId}:${gameId}`)) { count += 1; lastPlayed ||= date || null; }
      else if (!lastPlayed) recentMissed += 1;
    }
    result.set(Number(playerId), { team_games: games.length, played: count, recent_missed: recentMissed, last_played: lastPlayed });
  }
  return result;
}

function injuryLevel(status) {
  const text = (status || '').toLowerCase();
  if (/season/.test(text)) return 'out';
  if (/\bout\b|doubtful|suspend|inactive/.test(text)) return 'out';
  return 'gtd';
}

// One badge per player. A manual flag outranks Rotowire; with no listing, missing every game (or the last two) is flagged.
export function availabilityFlag(injuries = [], games = null) {
  const active = injuries.filter((row) => !row.cleared_at);
  const injury = active.find((row) => row.source === 'manual') || active.find((row) => row.source === 'rotowire') || null;
  const gamesText = games?.team_games ? `Played ${games.played} of ${games.team_games} team games${games.last_played ? `, last on ${games.last_played}` : ''}.` : '';
  if (injury) {
    const source = injury.source === 'manual' ? `Flagged by ${injury.updated_by || 'Andrew/Sam'}` : 'Rotowire';
    return {
      level: injuryLevel(injury.status), label: injury.status || 'Injured', source: injury.source,
      detail: [`${injury.status || 'Injured'}${injury.injury ? ` (${injury.injury})` : ''}. ${source}.`, gamesText].filter(Boolean).join(' '),
      injury: injury.injury || null, games
    };
  }
  if (games?.team_games && (games.played === 0 || games.recent_missed >= 2)) {
    const label = games.played === 0 ? `Hasn't played (0/${games.team_games})` : `Missed last ${games.recent_missed}`;
    return { level: 'missing', label, source: 'box_scores', detail: `No injury listing. ${gamesText}`, injury: null, games };
  }
  return games ? { level: null, label: null, source: null, detail: gamesText, injury: null, games } : null;
}
