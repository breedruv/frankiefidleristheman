import test from 'node:test';
import assert from 'node:assert/strict';
import { easternGameDay, extractSummaryStats, missingStartedGames, pendingGames, nextCheckSeconds, parseScoreboardEvents, parseSummaryEvent, planGameFetches, scoreboardDates } from '../lib/liveScoring.mjs';

const event = (id, state, home, away, date = '2026-11-03T23:00Z') => ({
  id: String(id),
  competitions: [{
    date,
    status: { type: { state, shortDetail: state === 'in' ? '2nd - 10:32' : state } },
    competitors: [{ homeAway: 'home', team: { id: String(home), displayName: `H${home}` } }, { homeAway: 'away', team: { id: String(away), displayName: `A${away}` } }]
  }]
});

test('scoreboard dates use Eastern time and include yesterday before 4am', () => {
  assert.deepEqual(scoreboardDates(new Date('2026-11-04T05:30:00Z')).dates, ['20261103', '20261104']);
  assert.deepEqual(scoreboardDates(new Date('2026-11-04T18:00:00Z')), { dates: ['20261104'], isoDates: ['2026-11-04'] });
});

test('only live lineup games and newly final lineup games get summary fetches', () => {
  const events = parseScoreboardEvents({ events: [event(1, 'in', 10, 20), event(2, 'in', 30, 40), event(3, 'post', 50, 10), event(4, 'post', 20, 60), event(5, 'pre', 70, 80), event(6, 'in', 90, 91)] });
  const plan = planGameFetches(events, { teamIds: new Set([10, 20]), gameIds: new Set([6]), finalGameIds: new Set([4]) });
  assert.deepEqual(plan.live.map((e) => e.game_id), [1, 6]);
  assert.deepEqual(plan.finalize.map((e) => e.game_id), [3]);
  assert.equal(plan.relevant.length, 4);
});

test('polling backs off when nothing relevant is live or tipping soon', () => {
  const now = new Date('2026-11-03T22:00:00Z');
  assert.equal(nextCheckSeconds([{ state: 'pre', game_datetime: '2026-11-03T22:20:00Z' }], now), 60);
  assert.equal(nextCheckSeconds([{ state: 'pre', game_datetime: '2026-11-04T00:00:00Z' }, { state: 'post' }], now), 300);
  assert.equal(nextCheckSeconds([{ state: 'in' }], now), 60);
});

test('summary box score parses like the Python ingest, including DNP rows', () => {
  const summary = { boxscore: { players: [{ team: { id: '10' }, statistics: [{
    labels: ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF'],
    athletes: [
      { athlete: { id: '101' }, stats: ['22', '17', '6-11', '2-5', '3-4', '0', '3', '1', '2', '0', '2', '4', '3'] },
      { athlete: { id: '102' }, stats: [] }
    ]
  }] }] } };
  const [starter, dnp] = extractSummaryStats(summary, 1, { season: 2027, gameDate: '2026-11-03' });
  assert.deepEqual(
    { pts: starter.pts, fgm: starter.fgm, fga: starter.fga, tpm: starter.tpm, ftm: starter.ftm, reb: starter.reb, minutes: starter.minutes, team_id: starter.team_id },
    { pts: 17, fgm: 6, fga: 11, tpm: 2, ftm: 3, reb: 6, minutes: 22, team_id: 10 }
  );
  assert.equal(dnp.pts, 0);
  assert.equal(dnp.minutes, 0);
});

test('started lineup games missing from the scoreboard fall back to the schedule', () => {
  const now = new Date('2026-11-04T01:00:00Z');
  const scheduled = [
    { game_id: 1, home_team_id: 10, away_team_id: 99, game_datetime: '2026-11-04T00:00:00Z', status: '11/3 - 7:00 PM EST' },
    { game_id: 2, home_team_id: 10, away_team_id: 98, game_datetime: '2026-11-04T00:00:00Z', status: 'Final' },
    { game_id: 3, home_team_id: 10, away_team_id: 97, game_datetime: '2026-11-04T02:00:00Z', status: null },
    { game_id: 4, home_team_id: 50, away_team_id: 51, game_datetime: '2026-11-04T00:00:00Z', status: null },
    { game_id: 5, home_team_id: 20, away_team_id: 21, game_datetime: '2026-11-04T00:00:00Z', status: null }
  ];
  const missing = missingStartedGames(scheduled, new Set([5]), { teamIds: new Set([10, 20]), gameIds: new Set() }, now);
  assert.deepEqual(missing.map((g) => g.game_id), [1]);
});

test('summary header parses into the same event shape as the scoreboard', () => {
  const parsed = parseSummaryEvent({ header: { competitions: [event(7, 'post', 10, 20).competitions[0]] } }, 7);
  assert.equal(parsed.game_id, 7);
  assert.equal(parsed.state, 'post');
  assert.equal(parsed.home_team_id, 10);
  assert.equal(parseSummaryEvent({}, 7), null);
});

test('ET game day runs 4am to 4am Eastern across EST and EDT', () => {
  assert.deepEqual(easternGameDay(new Date('2026-11-03T02:00:00Z')), { iso: '2026-11-02', start: '2026-11-02T09:00:00.000Z', end: '2026-11-03T09:00:00.000Z' });
  assert.equal(easternGameDay(new Date('2026-11-03T08:59:00Z')).iso, '2026-11-02');
  assert.equal(easternGameDay(new Date('2026-11-03T09:01:00Z')).iso, '2026-11-03');
  assert.equal(easternGameDay(new Date('2027-03-20T18:00:00Z')).start, '2027-03-20T08:00:00.000Z');
});

test('pending games skip finals and stuck games, earliest tip first', () => {
  const now = new Date('2026-11-03T02:00:00Z');
  const games = [
    { game_id: 1, status: '2nd - 4:00', game_datetime: '2026-11-03T00:30:00Z' },
    { game_id: 2, status: 'Final', game_datetime: '2026-11-02T23:00:00Z' },
    { game_id: 3, status: 'Postponed', game_datetime: '2026-11-02T18:00:00Z' },
    { game_id: 4, status: null, game_datetime: '2026-11-02T23:30:00Z' }
  ];
  assert.deepEqual(pendingGames(games, now).map((g) => g.game_id), [4, 1]);
});
