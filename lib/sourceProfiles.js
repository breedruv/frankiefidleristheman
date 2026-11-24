import { supabase } from "./supabase";
import { buildSourceProfile } from "./sourceProfiles.mjs";

const TTL = 5 * 60_000;
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
  const profiles = new Map();
  if (!supabase) return profiles;
  const latest = await supabase.from("team_rosters").select("season").order("season", { ascending: false }).limit(1);
  if (latest.error) throw latest.error;
  const season = latest.data?.[0]?.season;
  // Tables from db/player-source-listings.sql; until they exist, profiles are ESPN-only with no rankings.
  const optional = (build) => pages(build).catch((error) => { if (error.code === "PGRST205") return []; throw error; });
  const [listings, rankings, links] = await Promise.all([
    optional(() => supabase.from("player_source_listings").select("player_id,source,position,height_in,source_url").eq("season", season).not("player_id", "is", null)),
    optional(() => supabase.from("player_rankings").select("player_id,source,list,rank").eq("season", season).not("player_id", "is", null)),
    // db/player-links.sql (python/rotowire_players.py).
    optional(() => supabase.from("player_links").select("player_id,url").eq("site", "rotowire").order("player_id"))
  ]);
  const rotowire = new Map(links.map((row) => [Number(row.player_id), row.url]));
  const ranks = new Map();
  for (const row of rankings) {
    const id = Number(row.player_id);
    ranks.set(id, { ...ranks.get(id), [`${row.source}_${row.list}_rank`]: row.rank });
  }
  const ids = new Set(listings.map((row) => Number(row.player_id)));
  const espn = new Map();
  const list = [...ids];
  for (let start = 0; start < list.length; start += 300) {
    const { data, error } = await supabase.from("players").select("player_id,position,height").in("player_id", list.slice(start, start + 300));
    if (error) throw error;
    data.forEach((row) => espn.set(Number(row.player_id), row));
  }
  const byPlayer = new Map();
  for (const row of listings) {
    const id = Number(row.player_id);
    if (!byPlayer.has(id)) byPlayer.set(id, []);
    byPlayer.get(id).push(row);
  }
  for (const id of ids) {
    // Stand-in players (negative ids) are not on ESPN; their players row was copied from CBS/Yahoo.
    profiles.set(id, { ...buildSourceProfile(id > 0 ? espn.get(id) || null : null, byPlayer.get(id) || []), rankings: { ...ranks.get(id), rotowire_url: rotowire.get(id) || null } });
  }
  return profiles;
}

export async function getSourceProfiles() {
  if (!cache || cache.expires < Date.now()) {
    cache = { expires: Date.now() + TTL, promise: load().catch((error) => { cache = null; throw error; }) };
  }
  return cache.promise;
}

// Replace position/height with the combined eligibility, add ranking columns (lindys_top150_rank,
// lindys_freshmen_rank, espn_top100_rank) and rotowire_url, and keep the source detail for display.
export function applySourceProfile(player, profiles, idKey = "player_id") {
  const profile = profiles?.get(Number(player[idKey]));
  if (!profile) return player;
  const ranked = { ...player, ...profile.rankings };
  if (!profile.positions.length) return ranked;
  return { ...ranked, position: profile.position, listed_position: player.position, height: profile.height ?? player.height, source_profile: profile };
}

export async function withSourceProfiles(players, idKey = "player_id") {
  let profiles = null;
  try { profiles = await getSourceProfiles(); } catch (error) { console.warn("Source profiles unavailable", error.message); }
  return players.map((player) => applySourceProfile(player, profiles, idKey));
}
