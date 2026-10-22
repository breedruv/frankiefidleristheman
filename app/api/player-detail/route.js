import { getPlayerGameLog } from "../../../lib/queries";
import { hasSupabase, supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const playerId = Number(new URL(request.url).searchParams.get("playerId"));
  if (!Number.isInteger(playerId)) return Response.json({ error: "A valid playerId is required." }, { status: 400 });
  let games = await getPlayerGameLog(playerId, 5);
  if (hasSupabase && supabase && games.length) {
    const gameIds = games.map((game) => Number(game.game_id));
    const { data: shooting } = await supabase.from("player_games").select("game_id,ftm,fta").eq("player_id", playerId).in("game_id", gameIds);
    const shootingByGame = new Map((shooting || []).map((row) => [Number(row.game_id), row]));
    games = games.map((game) => ({ ...game, ...(shootingByGame.get(Number(game.game_id)) || {}) }));
    const opponentIds = [...new Set(games.map((game) => Number(game.opponent_id)).filter(Number.isInteger))];
    const { data: teams } = await supabase.from("teams").select("team_id,logo_url").in("team_id", opponentIds);
    const logos = new Map((teams || []).map((team) => [Number(team.team_id), team.logo_url]));
    games = games.map((game) => ({ ...game, opponent_logo: logos.get(Number(game.opponent_id)) || `https://a.espncdn.com/i/teamlogos/ncaa/500/${game.opponent_id}.png` }));
  }
  return Response.json({ games });
}
