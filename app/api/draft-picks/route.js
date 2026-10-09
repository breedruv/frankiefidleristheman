import { hasSupabase, supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!hasSupabase || !supabase) return Response.json({ picks: [] });
  const { data, error } = await supabase.from("draft_selections").select("*").eq("season", 2026).order("pick_number");
  if (error) return Response.json({ picks: [], error: error.message }, { status: 500 });
  return Response.json({ picks: data || [] });
}
export async function POST(request) {
  const body = await request.json();
  if (!hasSupabase || !supabase) return Response.json({ error: "Supabase is required to save draft picks." }, { status: 503 });
  const pickNumber = Number(body.pickNumber);
  const roundNumber = Number(body.roundNumber);
  const draftedPosition = String(body.draftedPosition || "").toUpperCase();
  if (!Number.isInteger(pickNumber) || pickNumber < 1 || !Number.isInteger(roundNumber) || roundNumber < 0 || roundNumber > 17) return Response.json({ error: "Invalid draft pick or round." }, { status: 400 });
  if (!["C", "F", "G"].includes(draftedPosition)) return Response.json({ error: "A pick must be drafted as Center, Forward, or Guard." }, { status: 400 });
  const { data: existing, error: existingError } = await supabase.from("draft_selections").select("pick_number, player_id, team_code, round_number, drafted_position").eq("season", 2026);
  if (existingError) return Response.json({ error: existingError.message }, { status: 500 });
  if ((existing || []).some((pick) => Number(pick.pick_number) === pickNumber)) return Response.json({ error: "That draft pick has already been used." }, { status: 400 });
  if ((existing || []).some((pick) => Number(pick.player_id) === Number(body.playerId))) return Response.json({ error: "That player has already been drafted." }, { status: 400 });
  if (roundNumber >= 1 && roundNumber <= 12) {
    const count = (existing || []).filter((pick) => pick.team_code === body.teamCode && Number(pick.round_number) >= 1 && Number(pick.round_number) <= 12 && pick.drafted_position === draftedPosition).length;
    const limit = draftedPosition === "C" ? 3 : 5;
    if (count >= limit) return Response.json({ error: `${body.teamCode} already has the maximum ${limit} ${draftedPosition === "C" ? "Centers" : draftedPosition === "F" ? "Forwards" : "Guards"} before the supplemental rounds.` }, { status: 400 });
  }
  const { data, error } = await supabase.from("draft_selections").insert({ season: 2026, round_number: roundNumber, pick_number: pickNumber, team_code: body.teamCode, player_id: body.playerId, player_name: body.playerName, drafted_position: draftedPosition, college_team_name: body.collegeTeamName, headshot: body.headshot }).select().single();
  if (error) return Response.json({ error: error.code === "23505" ? "This player or pick has already been used." : error.message }, { status: 400 });
  return Response.json({ pick: data });
}

