import { latestLiveStatus } from "../../../lib/liveStats";

export const dynamic = "force-dynamic";

// Read-only: the PC collector (or the Supabase failover) refreshes live stats; page visits never contact ESPN.
export async function GET() {
  try {
    return Response.json(await latestLiveStatus());
  } catch (error) {
    console.error("Live stats status failed", error);
    return Response.json({ error: "Live stats status failed." }, { status: 500 });
  }
}
