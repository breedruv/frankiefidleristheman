import { hasSupabase, supabase } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

const FIELD_MAP = {
  points: "pts", pts: "pts", minutes: "minutes", min: "minutes", fgm: "fgm", fga: "fga",
  tpm: "tpm", tpa: "tpa", ftm: "ftm", fta: "fta", reb: "reb", ast: "ast",
  turnovers: "turnovers", to: "turnovers", stl: "stl", blocks: "blocks", oreb: "oreb", dreb: "dreb", pf: "pf"
};

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function authorized(request) {
  const expected = process.env.LIVE_SYNC_TOKEN;
  return expected && request.headers.get("x-live-sync-token") === expected;
}

export async function POST(request) {
  if (!hasSupabase || !supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Invalid live sync token." }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const games = Array.isArray(body.games) ? body.games : [];
  const playerGames = Array.isArray(body.player_games || body.playerStats) ? (body.player_games || body.playerStats) : [];
  if (games.length > 500 || playerGames.length > 2000) return Response.json({ error: "Batch is too large." }, { status: 413 });
  if (!games.length && !playerGames.length) return Response.json({ error: "No games or player stats supplied." }, { status: 400 });

  const gameRows = games.map((game) => ({
    game_id: Number(game.game_id ?? game.gameId), game_date: game.game_date ?? game.date ?? null,
    game_datetime: game.game_datetime ?? game.datetime ?? null, season: numberOrNull(game.season ?? body.season),
    home_team_id: numberOrNull(game.home_team_id), home_team_name: game.home_team_name ?? null,
    away_team_id: numberOrNull(game.away_team_id), away_team_name: game.away_team_name ?? null,
    status: game.status ?? null
  })).filter((game) => Number.isInteger(game.game_id));
  if (gameRows.length) {
    const { error } = await supabase.from("games").upsert(gameRows, { onConflict: "game_id" });
    if (error) return Response.json({ error: `Games upsert failed: ${error.message}` }, { status: 400 });
  }

  const keys = playerGames.map((row) => ({ game_id: Number(row.game_id ?? row.gameId), player_id: Number(row.player_id ?? row.playerId) }))
    .filter((key) => Number.isInteger(key.game_id) && Number.isInteger(key.player_id));
  const gameIds = [...new Set(keys.map((key) => key.game_id))];
  const playerIds = [...new Set(keys.map((key) => key.player_id))];
  const { data: existing, error: existingError } = gameIds.length && playerIds.length
    ? await supabase.from("player_games").select("*").in("game_id", gameIds).in("player_id", playerIds)
    : { data: [], error: null };
  if (existingError) return Response.json({ error: `Existing stats lookup failed: ${existingError.message}` }, { status: 400 });
  const existingByKey = new Map((existing || []).map((row) => [`${row.game_id}:${row.player_id}`, row]));
  const statRows = playerGames.map((source) => {
    const gameId = Number(source.game_id ?? source.gameId);
    const playerId = Number(source.player_id ?? source.playerId);
    const prior = existingByKey.get(`${gameId}:${playerId}`) || {};
    const row = { ...prior, game_id: gameId, player_id: playerId, game_date: source.game_date ?? source.date ?? prior.game_date ?? null, team_id: numberOrNull(source.team_id ?? prior.team_id), season: numberOrNull(source.season ?? body.season ?? prior.season) };
    for (const [key, value] of Object.entries(source)) if (FIELD_MAP[key] && value !== undefined && value !== null && value !== "") row[FIELD_MAP[key]] = numberOrNull(value);
    return row;
  }).filter((row) => Number.isInteger(row.game_id) && Number.isInteger(row.player_id));
  if (statRows.length) {
    const { error } = await supabase.from("player_games").upsert(statRows, { onConflict: "game_id,player_id" });
    if (error) return Response.json({ error: `Player stats upsert failed: ${error.message}` }, { status: 400 });
  }

  let averagesRefreshed = false;
  if (body.refresh_averages === true || gameRows.some((game) => String(game.status).toLowerCase() === "final")) {
    const { error } = await supabase.rpc("refresh_player_stat_averages", { season_param: numberOrNull(body.season) });
    if (!error) averagesRefreshed = true;
  }
  return Response.json({ games_upserted: gameRows.length, player_games_upserted: statRows.length, averages_refreshed: averagesRefreshed });
}
