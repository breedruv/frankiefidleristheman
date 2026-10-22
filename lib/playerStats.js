import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const statsFile = path.join(process.cwd(), "player stats.csv");
let cachedStats;

const average = (total, games) => games ? total / games : null;

function summarizeGames(games) {
  const totals = games.reduce((summary, game) => {
    summary.points += Number(game.PTS) || 0;
    summary.minutes += Number(game.MIN) || 0;
    summary.threeMade += Number(game["3PTM"]) || 0;
    summary.threeAttempts += Number(game["3PTA"]) || 0;
    summary.freeMade += Number(game.FTM) || 0;
    summary.freeAttempts += Number(game.FTA) || 0;
    summary.shots += Number(game.FGA) || 0;
    return summary;
  }, { points: 0, minutes: 0, threeMade: 0, threeAttempts: 0, freeMade: 0, freeAttempts: 0, shots: 0 });
  const count = games.length;
  return {
    games: count,
    ppg: average(totals.points, count),
    mpg: average(totals.minutes, count),
    three_pct: totals.threeAttempts ? (totals.threeMade / totals.threeAttempts) * 100 : null,
    ft_pct: totals.freeAttempts ? (totals.freeMade / totals.freeAttempts) * 100 : null,
    shots_per_game: average(totals.shots, count)
  };
}

function loadStats() {
  if (cachedStats) return cachedStats;
  cachedStats = new Map();
  if (!fs.existsSync(statsFile)) return cachedStats;
  const rows = parse(fs.readFileSync(statsFile, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  const byPlayer = new Map();
  for (const row of rows) {
    const playerId = Number(row["Player ID"]);
    if (!Number.isFinite(playerId)) continue;
    if (!byPlayer.has(playerId)) byPlayer.set(playerId, []);
    byPlayer.get(playerId).push(row);
  }
  for (const [playerId, games] of byPlayer) {
    games.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    cachedStats.set(playerId, { ...summarizeGames(games), last5: summarizeGames(games.slice(0, 5)) });
  }
  return cachedStats;
}

export function mergePlayerStats(players) {
  const stats = loadStats();
  return players.map((player) => ({ ...player, ...(stats.get(Number(player.player_id)) || {}) }));
}
