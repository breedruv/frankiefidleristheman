const reported = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const metricKeys = ["ppg", "mpg", "fgm", "fga", "tpm", "tpa", "three_pct", "ft_pct", "shots_per_game", "last5_ppg", "stats_season"];
const average = (rows, key) => {
  const values = rows.filter((row) => reported(row[key]));
  return values.length ? values.reduce((sum, row) => sum + Number(row[key]), 0) / values.length : null;
};
const percentage = (rows, made, attempts) => {
  const values = rows.filter((row) => reported(row[made]) && reported(row[attempts]));
  const totalAttempts = values.reduce((sum, row) => sum + Number(row[attempts]), 0);
  return totalAttempts ? values.reduce((sum, row) => sum + Number(row[made]), 0) / totalAttempts * 100 : null;
};

export function summarizeExhibitionStats(rows, games) {
  const gamesById = new Map(games.map((game) => [Number(game.game_id), game]));
  const byPlayer = new Map();
  for (const row of rows) {
    const game = gamesById.get(Number(row.game_id));
    const season = Number(row.season ?? game?.season);
    if (!game || !Number.isInteger(season) || (reported(row.minutes) && Number(row.minutes) === 0)) continue;
    const playerId = Number(row.player_id);
    const current = byPlayer.get(playerId);
    if (!current || season > current.season) byPlayer.set(playerId, { season, rows: [{ ...row, game_date: row.game_date || game.game_date }] });
    else if (season === current.season) current.rows.push({ ...row, game_date: row.game_date || game.game_date });
  }
  return Object.fromEntries([...byPlayer].map(([playerId, { season, rows: playerGames }]) => {
    const lastFive = playerGames.slice().sort((a, b) => String(b.game_date).localeCompare(String(a.game_date)) || Number(b.game_id) - Number(a.game_id)).slice(0, 5);
    return [playerId, {
      games: playerGames.length,
      stats_season: season,
      ppg: average(playerGames, "pts"),
      mpg: average(playerGames, "minutes"),
      fgm: average(playerGames, "fgm"),
      fga: average(playerGames, "fga"),
      tpm: average(playerGames, "tpm"),
      tpa: average(playerGames, "tpa"),
      three_pct: percentage(playerGames, "tpm", "tpa"),
      ft_pct: percentage(playerGames, "ftm", "fta"),
      shots_per_game: average(playerGames, "fga"),
      last5_ppg: average(lastFive, "pts")
    }];
  }));
}

export function overlayExhibitionStats(player, summary) {
  return { ...player, ...Object.fromEntries(metricKeys.map((key) => [key, null])), ...(summary || {}), games: summary?.games || 0 };
}

export function currentSeasonStats(player, sourceSeason) {
  return Number(player.stats_season) === sourceSeason ? player : overlayExhibitionStats(player, null);
}
