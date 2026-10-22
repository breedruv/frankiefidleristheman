import { getPlayerStatAverages } from "../../../lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const season = Number(params.get("season") || 2025);
  if (!Number.isInteger(season)) return Response.json({ error: "Invalid season." }, { status: 400 });
  const rows = await getPlayerStatAverages(season);
  return Response.json({ rows });
}
