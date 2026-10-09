import { hasSupabase, supabase } from "../../../lib/supabase";

const season = 2026;
const defaultConfig = {
  season,
  franchisePicks: Array.from({ length: 8 }, (_, index) => ({ pick: index + 1, team: "", player: "" })),
  snakeOrder: Array.from({ length: 8 }, (_, index) => ({ slot: index + 1, team: `Team ${index + 1}` }))
};

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabase || !supabase) return Response.json(defaultConfig);
  const { data, error } = await supabase.from("draft_configurations").select("season, franchise_picks, snake_order, updated_at").eq("season", season).maybeSingle();
  if (error || !data) return Response.json(defaultConfig);
  return Response.json({ season: data.season, franchisePicks: data.franchise_picks, snakeOrder: data.snake_order, updatedAt: data.updated_at });
}

export async function POST(request) {
  const body = await request.json();
  const franchisePicks = Array.isArray(body.franchisePicks) ? body.franchisePicks.slice(0, 8).map((pick, index) => ({ pick: index + 1, team: String(pick.team || "").trim(), player: String(pick.player || "").trim() })) : defaultConfig.franchisePicks;
  const snakeOrder = Array.isArray(body.snakeOrder) ? body.snakeOrder.slice(0, 8).map((slot, index) => ({ slot: index + 1, team: String(slot.team || `Team ${index + 1}`).trim() })) : defaultConfig.snakeOrder;
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("draft_configurations").upsert({ season, franchise_picks: franchisePicks, snake_order: snakeOrder, updated_at: new Date().toISOString() }).select("season, franchise_picks, snake_order, updated_at").single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ season: data.season, franchisePicks: data.franchise_picks, snakeOrder: data.snake_order, updatedAt: data.updated_at });
  }
  return Response.json({ season, franchisePicks, snakeOrder, updatedAt: new Date().toISOString(), localOnly: true });
}

