import { currentMember } from "../../../lib/auth";
import { getDraftState } from "../../../lib/draftState";
import { getDraftHistory } from "../../../lib/draftHistory";
import { DRAFT_SEASON } from "../../../lib/draftRules.mjs";
import { supabase } from "../../../lib/supabase";
import { getExhibitionStats } from "../../../lib/exhibitionStats";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await currentMember()) return Response.json({ error: "Sign in to view draft research." }, { status: 401 });
  if (!supabase) return Response.json({ error: "Draft research is unavailable." }, { status: 503 });
  try {
    const [state, shortlistResult] = await Promise.all([
      getDraftState(),
      supabase.from("draft_shortlists").select("owner_name,player_ids").eq("season", DRAFT_SEASON)
    ]);
    if (shortlistResult.error) throw shortlistResult.error;
    const lists = ["Andrew", "Sam"].map((owner) => shortlistResult.data.find((row) => row.owner_name === owner) || { owner_name: owner, player_ids: [] });
    const ids = [...new Set([...Object.keys(state.owners), ...lists.flatMap((list) => list.player_ids)].map(Number).filter(Number.isInteger))];
    const [{ data: players, error }, allExhibitionStats] = await Promise.all([
      supabase.rpc("roster_snapshot", { include_dnp: false, row_limit: 5000 }).in("player_id", ids),
      getExhibitionStats()
    ]);
    if (error) throw error;
    if (!Array.isArray(players)) throw new Error("Invalid roster snapshot.");
    const currentIds = new Set(players.map((player) => Number(player.player_id)));
    const history = new Map(Object.values(getDraftHistory("2025")?.draftSlots || {}).map((player) => [Number(player.playerId), player]));
    return Response.json({
      lists,
      players: players.map((player) => ({ ...player, previous_owner: state.owners[player.player_id] || null })),
      exhibitionStats: Object.fromEntries(ids.filter((id) => allExhibitionStats[id]).map((id) => [id, allExhibitionStats[id]])),
      excludedCount: Object.keys(state.owners).filter((id) => !currentIds.has(Number(id))).length,
      missingNames: Object.fromEntries(lists.flatMap((list) => list.player_ids).filter((id) => !currentIds.has(Number(id))).map((id) => [id, history.get(Number(id))?.name || `Player ${id}`]))
    });
  } catch {
    return Response.json({ error: "Unable to load draft research. Try again." }, { status: 503 });
  }
}
