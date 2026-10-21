import { DEFAULT_TEAMS, draftOrders } from "../../../lib/draftRules.mjs";
import { hasSupabase, supabase } from "../../../lib/supabase";

const season = 2026;
const defaultConfig = {
  season,
  franchisePicks: Array.from({ length: 8 }, (_, index) => ({ pick: index + 1, team: "", player: "" })),
  snakeOrder: Array.from({ length: 8 }, (_, index) => ({ slot: index + 1, team: DEFAULT_TEAMS[index], franchiseOrder: index + 1 }))
};

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabase || !supabase) return Response.json(defaultConfig);
  const { data, error } = await supabase.from("draft_configurations").select("season, franchise_picks, snake_order, updated_at").eq("season", season).maybeSingle();
  if (error || !data) return Response.json(defaultConfig);
  return Response.json({ season: data.season, franchisePicks: data.franchise_picks, snakeOrder: data.snake_order, updatedAt: data.updated_at });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid configuration." }, { status: 400 }); }
  const franchisePicks = Array.isArray(body.franchisePicks) ? body.franchisePicks.slice(0, 8).map((pick, index) => ({ pick: index + 1, team: String(pick.team || "").trim(), player: String(pick.player || "").trim() })) : defaultConfig.franchisePicks;
  const snakeOrder = Array.isArray(body.snakeOrder) ? body.snakeOrder.slice(0, 8).map((slot, index) => ({ slot: index + 1, team: String(slot.team || `Team ${index + 1}`).trim(), franchiseOrder: Number(slot.franchiseOrder) || index + 1 })) : defaultConfig.snakeOrder;
  if (snakeOrder.length !== 8) return Response.json({ error: "Configure all eight teams." }, { status: 400 });
  try { draftOrders(snakeOrder); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
  if (hasSupabase && supabase) {
    const { data: existingPicks, error: picksError } = await supabase.from("draft_selections").select("pick_number").eq("season", season).limit(1);
    if (picksError) return Response.json({ error: "Unable to verify draft status." }, { status: 503 });
    if (existingPicks.length) return Response.json({ error: "Draft order is locked once picks are recorded. Undo the picks before changing the order." }, { status: 409 });
    const { data, error } = await supabase.from("draft_configurations").upsert({ season, franchise_picks: franchisePicks, snake_order: snakeOrder, updated_at: new Date().toISOString() }).select("season, franchise_picks, snake_order, updated_at").single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ season: data.season, franchisePicks: data.franchise_picks, snakeOrder: data.snake_order, updatedAt: data.updated_at });
  }
  return Response.json({ season, franchisePicks, snakeOrder, updatedAt: new Date().toISOString(), localOnly: true });
}

