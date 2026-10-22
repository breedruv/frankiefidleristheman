import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { hasSupabase, supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
const shotsPath = path.join(process.cwd(), "player shots.csv");
let cachedShots = null;

function getShots() {
  if (cachedShots) return cachedShots;
  if (!fs.existsSync(shotsPath)) return [];
  cachedShots = parse(fs.readFileSync(shotsPath, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  return cachedShots;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const playerId = Number(params.get("playerId"));
  if (!Number.isInteger(playerId)) return Response.json({ error: "A valid playerId is required." }, { status: 400 });
  if (hasSupabase && supabase) {
    // ESPN play IDs exceed JavaScript's safe integer range; keep their identity as text.
    const { data, error } = await supabase.from("player_shots").select("play_id::text,game_id,player_id,assist_player_id,team_id,period,clock,shot_type,result,points_attempted,coord_x,coord_y,shot_text,game_date,season,updated_at").eq("player_id", playerId).order("game_date", { ascending: false });
    if (!error && data?.length) return Response.json({ playerId, shots: data });
  }
  const shots = getShots().filter((shot) => Number(shot.player_id) === playerId);
  return Response.json({ playerId, shots });
}
