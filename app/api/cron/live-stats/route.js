import { timingSafeEqual } from "node:crypto";
import { refreshLiveStats } from "../../../../lib/liveStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Failover for live scores only: Supabase pg_cron calls this when the 24/7 PC collector stops sending heartbeats.
export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return Response.json(await refreshLiveStats({ source: "failover" }));
  } catch (error) {
    console.error("Failover live stats refresh failed", error);
    return Response.json({ error: "Live stats refresh failed." }, { status: 500 });
  }
}
