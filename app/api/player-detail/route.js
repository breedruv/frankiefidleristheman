import { getPlayerGameLog } from "../../../lib/queries";
import { hasSupabase, supabase } from "../../../lib/supabase";
import { resolveGameOpponent } from "../../../lib/gameOpponent.mjs";
import { DRAFT_SEASON } from "../../../lib/draftRules.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const playerId = Number(new URL(request.url).searchParams.get("playerId"));
  if (!Number.isInteger(playerId)) return Response.json({ error: "A valid playerId is required." }, { status: 400 });
  const exhibition = new URL(request.url).searchParams.get("stats") === "exhibition";
  const sourceSeason = DRAFT_SEASON + 1;
  const played = (game) => game.minutes == null ? exhibition : Number(game.minutes) > 0;
  let games = await getPlayerGameLog(playerId, 250);
  if (hasSupabase && supabase && games.length) {
    const { data: matchups, error: matchupError } = await supabase.from("games").select("game_id,season,is_exhibition,home_team_id,away_team_id,home_team_name,away_team_name").in("game_id", games.map((game) => Number(game.game_id)));
    if (matchupError) return Response.json({ error: "Unable to load game seasons." }, { status: 503 });
    const matchupByGame = new Map((matchups || []).map((row) => [Number(row.game_id), row]));
    games = games.filter((game) => Boolean(matchupByGame.get(Number(game.game_id))?.is_exhibition) === exhibition && Number(matchupByGame.get(Number(game.game_id))?.season) === sourceSeason && played(game)).slice(0, 5);
    if (!games.length) return Response.json({ games: [] });
    const gameIds = games.map((game) => Number(game.game_id));
    const [{ data: shooting }, directory] = await Promise.all([
      supabase.from("player_games").select("game_id,ftm,fta").eq("player_id", playerId).in("game_id", gameIds),
      fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500", { next: { revalidate: 86400 } })
        .then((response) => response.ok ? response.json() : null).catch(() => null)
    ]);
    const shootingByGame = new Map((shooting || []).map((row) => [Number(row.game_id), row]));
    const teams = directory?.sports?.[0]?.leagues?.[0]?.teams?.map((entry) => entry.team) || [];
    games = games.map((game) => resolveGameOpponent({ ...game, is_exhibition: exhibition, ...(shootingByGame.get(Number(game.game_id)) || {}) }, matchupByGame.get(Number(game.game_id)), teams));
  } else games = games.filter((game) => Boolean(game.is_exhibition) === exhibition && Number(game.season) === sourceSeason && played(game)).slice(0, 5);
  return Response.json({ games });
}
