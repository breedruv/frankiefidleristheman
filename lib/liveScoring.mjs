// Pure helpers for live game scoring; network and database access live in lib/liveStats.js.

export const ESPN_CBB_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';

const ET_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});

function easternParts(date) {
  const parts = Object.fromEntries(ET_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return { ymd: `${parts.year}${parts.month}${parts.day}`, iso: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// ESPN files games under their ET start date; late games run past midnight, so check yesterday until 4am ET.
export function scoreboardDates(now = new Date()) {
  const today = easternParts(now);
  const days = today.hour < 4 ? [easternParts(new Date(now.getTime() - 24 * 60 * 60 * 1000)), today] : [today];
  return { dates: days.map((day) => day.ymd), isoDates: days.map((day) => day.iso) };
}

// Poll every minute while a lineup game is live or about to tip, otherwise back off.
export function nextCheckSeconds(relevantEvents, now = new Date()) {
  const soon = now.getTime() + 30 * 60 * 1000;
  const active = relevantEvents.some((event) => event.state === 'in' ||
    (event.state === 'pre' && event.game_datetime && Date.parse(event.game_datetime) <= soon));
  return active ? 60 : 300;
}

// UTC bounds of the current ET game day, which runs until 4am ET so late games stay on the right day.
export function easternGameDay(now = new Date()) {
  const { iso } = easternParts(new Date(now.getTime() - 4 * 60 * 60 * 1000));
  const [year, month, date] = iso.split('-').map(Number);
  const offsetHours = 12 - easternParts(new Date(Date.UTC(year, month - 1, date, 12))).hour; // 5 in EST, 4 in EDT
  const start = Date.UTC(year, month - 1, date, 4 + offsetHours);
  return { iso, start: new Date(start).toISOString(), end: new Date(start + 24 * 60 * 60 * 1000).toISOString() };
}

// Games the PC loop still has to cover: not final, and not stuck (tipped over 6 hours ago without a final).
export function pendingGames(games, now = new Date()) {
  const stale = now.getTime() - 6 * 60 * 60 * 1000;
  return games.filter((game) => !isFinalStatus(game.status) && game.game_datetime && Date.parse(game.game_datetime) >= stale)
    .sort((a, b) => Date.parse(a.game_datetime) - Date.parse(b.game_datetime));
}

export function isFinalStatus(status) {
  return (status ?? '').toString().toLowerCase().includes('final');
}

export function parseScoreboardEvents(payload) {
  return (payload?.events || []).map((event) => {
    const competition = event.competitions?.[0] || {};
    const statusType = (competition.status || event.status || {}).type || {};
    const competitors = competition.competitors || [];
    const home = competitors.find((c) => c.homeAway === 'home') || {};
    const away = competitors.find((c) => c.homeAway === 'away') || {};
    return {
      game_id: Number(event.id),
      state: statusType.state || null,
      status: statusType.shortDetail || statusType.description || null,
      game_datetime: competition.date || event.date || null,
      home_team_id: Number(home.team?.id) || null,
      home_team_name: home.team?.displayName || null,
      away_team_id: Number(away.team?.id) || null,
      away_team_name: away.team?.displayName || null
    };
  }).filter((event) => Number.isInteger(event.game_id));
}

// A summary header competition has the same shape as a scoreboard competition.
export function parseSummaryEvent(summary, gameId) {
  const competition = summary?.header?.competitions?.[0];
  return competition ? parseScoreboardEvents({ events: [{ id: gameId, competitions: [competition] }] })[0] || null : null;
}

// Scheduled lineup games that have tipped but are missing from the daily scoreboard.
export function missingStartedGames(scheduled, eventIds, { teamIds, gameIds }, now = new Date()) {
  return scheduled.filter((game) =>
    !eventIds.has(Number(game.game_id)) &&
    !isFinalStatus(game.status) &&
    game.game_datetime && Date.parse(game.game_datetime) <= now.getTime() &&
    (gameIds.has(Number(game.game_id)) || teamIds.has(Number(game.home_team_id)) || teamIds.has(Number(game.away_team_id))));
}

// in -> live rows for lineup players; post -> one final write unless the stored game is already final.
export function planGameFetches(events, { teamIds, gameIds, finalGameIds }) {
  const relevant = events.filter((event) =>
    gameIds.has(event.game_id) || teamIds.has(event.home_team_id) || teamIds.has(event.away_team_id));
  return {
    relevant,
    live: relevant.filter((event) => event.state === 'in'),
    finalize: relevant.filter((event) => event.state === 'post' && !finalGameIds.has(event.game_id))
  };
}

function toInt(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : 0;
}

function madeAttempts(value) {
  const [made, attempts] = (value ?? '').toString().split('-');
  return [toInt(made), toInt(attempts)];
}

function minutes(value) {
  const text = (value ?? '').toString();
  if (text.includes(':')) {
    const [mins, secs] = text.split(':');
    return toInt(mins) + toInt(secs) / 60;
  }
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : 0;
}

// Mirrors extract_stats_rows in python/espn_ingest.py so live and final rows share column meaning.
export function extractSummaryStats(summary, gameId, { season, gameDate }) {
  const rows = [];
  for (const teamEntry of summary?.boxscore?.players || []) {
    const teamId = Number(teamEntry.team?.id);
    if (!Number.isInteger(teamId)) continue;
    for (const group of teamEntry.statistics || []) {
      const labels = group.labels || [];
      if (!labels.length) continue;
      for (const entry of group.athletes || []) {
        const playerId = Number(entry.athlete?.id);
        if (!Number.isInteger(playerId)) continue;
        const values = entry.stats || [];
        const stat = Object.fromEntries(labels.map((label, index) => [label, values[index]]));
        const [fgm, fga] = madeAttempts(stat.FG);
        const [tpm, tpa] = madeAttempts(stat['3PT']);
        const [ftm, fta] = madeAttempts(stat.FT);
        const oreb = toInt(stat.OREB);
        const dreb = toInt(stat.DREB);
        const reb = toInt(stat.REB) || oreb + dreb;
        rows.push({
          game_id: gameId, player_id: playerId, game_date: gameDate, team_id: teamId, season,
          pts: toInt(stat.PTS), fgm, fga, tpm, tpa, ftm, fta, reb,
          ast: toInt(stat.AST), turnovers: toInt(stat.TO), stl: toInt(stat.STL), blocks: toInt(stat.BLK),
          oreb, dreb, pf: toInt(stat.PF), minutes: minutes(stat.MIN)
        });
      }
    }
  }
  return rows;
}
