export const DRAFT_SEASON = 2026;
export const DEFAULT_TEAMS = ['MB', 'AS', 'SL', 'DD', 'Len', 'Brandon', 'John B', 'BJ'];
export const normalizeTeam = (team) => ({ 'M/B': 'MB', 'A/S': 'AS', 'D/D': 'DD' }[team] || team);

export function draftOrders(rows = []) {
  if (!rows.length) return { snake: DEFAULT_TEAMS, franchise: DEFAULT_TEAMS };
  if (rows.length !== 8) throw new Error('Configure all eight league teams.');
  if (new Set(rows.map((row) => row.slot)).size !== 8 || rows.some((row) => !Number.isInteger(row.slot) || row.slot < 1 || row.slot > 8)) throw new Error('Snake slots must contain 1 through 8 exactly once.');
  const ranks = rows.map((row) => Number(row.franchiseOrder || row.slot));
  if (new Set(ranks).size !== 8 || ranks.some((rank) => !Number.isInteger(rank) || rank < 1 || rank > 8)) throw new Error('Franchise order must contain 1 through 8 exactly once.');
  const sorted = rows.slice().sort((a, b) => a.slot - b.slot);
  const snake = sorted.map((row) => normalizeTeam(row.team));
  const franchise = sorted.slice().sort((a, b) => (a.franchiseOrder || a.slot) - (b.franchiseOrder || b.slot)).map((row) => normalizeTeam(row.team));
  if (new Set(snake).size !== 8 || snake.some((team) => !DEFAULT_TEAMS.includes(team))) throw new Error('Configure all eight league teams exactly once.');
  return { snake, franchise };
}

export function nextPick(picks, snake, franchise = snake) {
  const completed = new Set(picks.filter((p) => Number(p.round_number) === 0).map((p) => normalizeTeam(p.team_code)));
  const remaining = franchise.find((team) => !completed.has(team));
  const number = picks.length + 1;
  if (remaining) return { pickNumber: number, roundNumber: 0, teamCode: remaining };
  if (number > snake.length * 18) return null;
  const round = Math.floor((number - snake.length - 1) / snake.length) + 1;
  const slot = (number - snake.length - 1) % snake.length;
  return { pickNumber: number, roundNumber: round, teamCode: round % 2 ? snake[slot] : snake[snake.length - slot - 1] };
}

export function blockingOwner(playerId, picks, owners) {
  const owner = normalizeTeam(owners[playerId]);
  return owner && !picks.some((p) => Number(p.round_number) === 0 && normalizeTeam(p.team_code) === owner) ? owner : null;
}

export function validateSelection(pick, picks, snake, franchise, owners) {
  const next = nextPick(picks, snake, franchise);
  if (!next || pick.pick_number !== next.pickNumber || pick.round_number !== next.roundNumber) throw new Error('The draft has moved. Refresh and use the current pick.');
  const initiator = pick.initiated_by || pick.team_code;
  if (initiator !== next.teamCode) throw new Error(`It is ${next.teamCode}'s turn.`);
  if (!['C', 'F', 'G'].includes(pick.drafted_position)) throw new Error('Choose Center, Forward, or Guard.');
  if (picks.some((p) => Number(p.player_id) === Number(pick.player_id))) throw new Error('That player has already been drafted.');
  if (pick.blocked_team_code) {
    if (next.roundNumber !== 0 || pick.blocked_team_code !== initiator || pick.team_code === initiator || blockingOwner(pick.player_id, picks, owners) !== pick.team_code) throw new Error('Only the previous owner with an unused franchise pick can block.');
  } else if (pick.team_code !== initiator) throw new Error('The receiving team must match the current picker.');
  if (next.roundNumber <= 12) {
    const count = picks.filter((p) => p.team_code === pick.team_code && Number(p.round_number) <= 12 && p.drafted_position === pick.drafted_position).length;
    if (count >= (pick.drafted_position === 'C' ? 3 : 5)) throw new Error(`The ${pick.drafted_position} roster slots are full.`);
  }
}
