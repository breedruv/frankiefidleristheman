import { supabase } from "./supabase.js";
import { availabilityFlag, gamesMissed } from "./availability.mjs";

const CACHE_MS = 5 * 60_000;
let cache = null;

async function pages(build) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build().range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function load() {
  const latest = await supabase.from("team_rosters").select("season").order("season", { ascending: false }).limit(1);
  if (latest.error) throw latest.error;
  const season = latest.data?.[0]?.season;
  if (!season) return new Map();
  const [rosters, boxScores, exhibitions, injuries] = await Promise.all([
    pages(() => supabase.from("team_rosters").select("player_id,team_id").eq("season", season)),
    pages(() => supabase.from("player_games").select("player_id,game_id,team_id,minutes,game_date").eq("season", season)),
    pages(() => supabase.from("games").select("game_id").eq("is_exhibition", true)),
    // Injuries are optional: until db/player-injuries.sql is applied, games missed still works.
    pages(() => supabase.from("player_injuries").select("*").is("cleared_at", null)).catch((error) => { console.warn("player_injuries unavailable", error.message); return []; })
  ]);
  const teams = new Map(rosters.map((row) => [Number(row.player_id), Number(row.team_id)]));
  const games = gamesMissed(boxScores, teams, new Set(exhibitions.map((row) => Number(row.game_id))));
  const byPlayer = new Map();
  injuries.forEach((row) => byPlayer.set(Number(row.player_id), [...(byPlayer.get(Number(row.player_id)) || []), row]));
  const result = new Map();
  for (const id of new Set([...teams.keys(), ...byPlayer.keys()])) {
    const flag = availabilityFlag(byPlayer.get(id), games.get(id) || null);
    if (flag) result.set(id, flag);
  }
  return result;
}

// Map player_id -> availability flag for the current pool, cached briefly. Returns an empty map when unavailable.
export async function getAvailability() {
  if (!supabase) return new Map();
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const promise = load();
    cache = { at: Date.now(), promise };
    promise.catch(() => { if (cache?.promise === promise) cache = null; });
  }
  try { return await cache.promise; } catch (error) { console.warn("Availability lookup error", error.message); return new Map(); }
}

export function clearAvailabilityCache() { cache = null; }

export async function withAvailability(players, idKey = "player_id") {
  const availability = await getAvailability();
  return players.map((player) => ({ ...player, availability: availability.get(Number(player[idKey])) || null }));
}
