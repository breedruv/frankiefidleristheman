import { searchDraftRoster } from "../../../lib/draftRoster";
import { getDraftState } from "../../../lib/draftState";
import { blockingOwner } from "../../../lib/draftRules.mjs";

export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const state = await getDraftState();
    const players = (await searchDraftRoster(new URL(request.url).searchParams.get("q") || "")).map((player) => ({ ...player, previousOwner: state.owners[player.playerId] || null, blockingOwner: blockingOwner(player.playerId, state.picks, state.owners), drafted: state.picks.some((p) => Number(p.player_id) === player.playerId) }));
    return Response.json({ players });
  } catch { return Response.json({ error: 'Unable to load draft eligibility. Try again.' }, { status: 503 }); }
}

