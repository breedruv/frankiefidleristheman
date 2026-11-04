import { supabase } from "./supabase";
import { summarizeExhibitionStats } from "./exhibitionStats.mjs";

let cache;
let expiresAt = 0;
let pending;

export async function getExhibitionStats() {
  if (!supabase) throw new Error("Exhibition storage is unavailable.");
  if (cache && Date.now() < expiresAt) return cache;
  if (pending) return pending;
  pending = (async () => {
    const { data: games, error } = await supabase.from("games").select("game_id,game_date,season").eq("is_exhibition", true).limit(10000);
    if (error || !Array.isArray(games)) throw new Error("Unable to load exhibition games.");
    if (!games.length) return {};
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error: statsError } = await supabase.from("player_games")
        .select("game_id,player_id,game_date,season,minutes,pts,fgm,fga,tpm,tpa,ftm,fta")
        .in("game_id", games.map((game) => game.game_id))
        .order("game_date", { ascending: false }).order("game_id", { ascending: false }).order("player_id")
        .range(offset, offset + 999);
      if (statsError || !Array.isArray(data)) throw new Error("Unable to load exhibition player stats.");
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return summarizeExhibitionStats(rows, games);
  })();
  try {
    cache = await pending;
    // shortcut: newly imported exhibitions may take up to one minute to appear; invalidate on import if immediate updates become necessary.
    expiresAt = Date.now() + 60_000;
    return cache;
  } finally {
    pending = null;
  }
}
