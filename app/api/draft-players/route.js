import { searchDraftRoster } from "../../../lib/draftRoster";

export const dynamic = "force-dynamic";
export async function GET(request) { return Response.json({ players: searchDraftRoster(new URL(request.url).searchParams.get("q") || "") }); }

