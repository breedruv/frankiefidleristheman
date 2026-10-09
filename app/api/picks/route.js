import { getPairById, getPairwiseState, savePick } from "../../../lib/pairwise";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const includePlayed = new URL(request.url).searchParams.get("include_played") === "1";
  return Response.json(await getPairwiseState(includePlayed));
}

export async function POST(request) {
  try {
    const body = await request.json(); const pair = await getPairById(body.pairId);
    if (!pair) return Response.json({ error: "Comparison not found." }, { status: 404 });
    if (!["A", "B"].includes(body.pickSide)) return Response.json({ error: "Choose Player A or Player B." }, { status: 400 });
    const result = await savePick(pair, body.pickSide, body.confidence || "3", body.mode === "collect" ? "collect" : "practice", { browserKey: body.browserKey, displayName: body.displayName });
    const response = { saved: true, summary: result.summary, correct: result.row.Correct };
    if (body.mode !== "collect") { response.actualWinner = pair["Actual Winner"]; response.aActual = Number(pair["A Actual Remainder PTS"]); response.bActual = Number(pair["B Actual Remainder PTS"]); }
    return Response.json(response);
  } catch (error) { return Response.json({ error: error.message || "Unable to save pick." }, { status: 500 }); }
}

