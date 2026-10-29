import { getPlayerGameLog } from "../../../lib/queries";
import { hasSupabase, supabase } from "../../../lib/supabase";
import { resolveGameOpponent } from "../../../lib/gameOpponent.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const playerId = Number(new URL(request.url).searchParams.get("playerId"));
  if (!Number.isInteger(playerId)) return Response.json({ error: "A valid playerId is required." }, { status: 400 });
  let games = await getPlayerGameLog(playerId, 5);
  if (hasSupabase && supabase && games.length) {
    const gameIds = games.map((game) => Number(game.game_id));
    const [{ data: shooting }, { data: matchups }, directory] = await Promise.all([
      supabase.from("player_games").select("game_id,ftm,fta").eq("player_id", playerId).in("game_id", gameIds),
      supabase.from("games").select("game_id,home_team_id,away_team_id,home_team_name,away_team_name").in("game_id", gameIds),
      fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500", { next: { revalidate: 86400 } })
        .then((response) => response.ok ? response.json() : null).catch(() => null)
    ]);
    const shootingByGame = new Map((shooting || []).map((row) => [Number(row.game_id), row]));
    const matchupByGame = new Map((matchups || []).map((row) => [Number(row.game_id), row]));
    const teams = directory?.sports?.[0]?.leagues?.[0]?.teams?.map((entry) => entry.team) || [];
    games = games.map((game) => resolveGameOpponent({ ...game, ...(shootingByGame.get(Number(game.game_id)) || {}) }, matchupByGame.get(Number(game.game_id)), teams));
  }
  return Response.json({ games });
}
