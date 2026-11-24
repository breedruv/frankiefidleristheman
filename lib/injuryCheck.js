import { supabase, hasSupabase } from "./supabase.js";
import { DRAFT_SEASON, normalizeTeam } from "./draftRules.mjs";
import { easternGameDay } from "./liveScoring.mjs";
import { ROTOWIRE_INJURY_URL, diffInjuries, matchInjuries } from "./injuries.mjs";

const STARTER_SLOTS = ["center", "forward1", "forward2", "guard1", "guard2"];

function must({ data, error }, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}

// Andrew/Sam's current roster (trades land in fantasy_rosters; draft picks until then) and this week's starting five.
export async function ourRoster(now = new Date()) {
  if (!hasSupabase || !supabase) throw new Error("Supabase is not configured.");
  const code = process.env.OUR_TEAM_CODE || "AS";
  const team = must(await supabase.from("fantasy_teams").select("fantasy_team_id,short_code"), "fantasy_teams")
    .find((row) => normalizeTeam(row.short_code) === code);
  let ids = team
    ? must(await supabase.from("fantasy_rosters").select("player_id").eq("season", DRAFT_SEASON).eq("fantasy_team_id", team.fantasy_team_id), "fantasy_rosters").map((row) => Number(row.player_id))
    : [];
  if (!ids.length) {
    ids = must(await supabase.from("draft_selections").select("player_id,team_code").eq("season", DRAFT_SEASON), "draft_selections")
      .filter((row) => normalizeTeam(row.team_code) === code).map((row) => Number(row.player_id));
  }

  const starters = new Set();
  if (team) {
    const day = easternGameDay(now).iso;
    const weeks = must(await supabase.from("fantasy_weeks").select("season,season_type,week").lte("start_date", day).gte("end_date", day), "fantasy_weeks");
    for (const week of weeks) {
      const lineups = must(await supabase.from("fantasy_lineups").select("*").eq("season", week.season).eq("season_type", week.season_type)
        .eq("week", week.week).eq("fantasy_team_id", team.fantasy_team_id), "fantasy_lineups");
      lineups.forEach((lineup) => STARTER_SLOTS.forEach((slot) => lineup[`${slot}_id`] && starters.add(Number(lineup[`${slot}_id`]))));
    }
  }

  if (!ids.length) return { players: [], starters };
  const players = must(await supabase.from("players").select("player_id,first_name,last_name,team_id").in("player_id", ids), "players");
  const teamIds = [...new Set(players.map((p) => p.team_id).filter(Boolean))];
  const teams = new Map(must(await supabase.from("teams").select("team_id,location,display_name,short_display_name").in("team_id", teamIds), "teams")
    .map((row) => [row.team_id, [row.location, row.display_name, row.short_display_name].filter(Boolean)]));
  return {
    starters,
    players: players.map((p) => ({ player_id: Number(p.player_id), team_id: p.team_id, name: `${p.first_name || ""} ${p.last_name || ""}`.trim(), teamNames: teams.get(p.team_id) || [] }))
  };
}

// Tip times today for games involving our roster's NCAA teams.
export async function rosterTipsToday(now = new Date()) {
  const { players } = await ourRoster(now);
  const teamIds = [...new Set(players.map((p) => p.team_id).filter(Boolean))];
  if (!teamIds.length) return [];
  const day = easternGameDay(now);
  const list = teamIds.join(",");
  return must(await supabase.from("games").select("game_datetime").eq("is_exhibition", false)
    .gte("game_datetime", day.start).lt("game_datetime", day.end)
    .or(`home_team_id.in.(${list}),away_team_id.in.(${list})`), "games").map((game) => game.game_datetime);
}

async function pages(build, label) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const data = must(await build().range(offset, offset + 999), label);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// Everyone on the latest season's pool rosters, with team names for Rotowire tie-breaks.
export async function poolPlayers() {
  const latest = must(await supabase.from("team_rosters").select("season").order("season", { ascending: false }).limit(1), "team_rosters season");
  if (!latest[0]) return [];
  const [rosters, players, teams] = await Promise.all([
    pages(() => supabase.from("team_rosters").select("player_id,team_id").eq("season", latest[0].season), "team_rosters"),
    pages(() => supabase.from("players").select("player_id,first_name,last_name"), "players"),
    pages(() => supabase.from("teams").select("team_id,location,display_name,short_display_name"), "teams")
  ]);
  const names = new Map(players.map((p) => [Number(p.player_id), `${p.first_name || ""} ${p.last_name || ""}`.trim()]));
  const teamNames = new Map(teams.map((row) => [Number(row.team_id), [row.location, row.display_name, row.short_display_name].filter(Boolean)]));
  return rosters.filter((row) => names.has(Number(row.player_id))).map((row) => ({
    player_id: Number(row.player_id), team_id: row.team_id, name: names.get(Number(row.player_id)), teamNames: teamNames.get(Number(row.team_id)) || []
  }));
}

// Players whose changes are worth a push: our roster plus both top 10 lists.
async function watchedPlayers(roster) {
  const lists = must(await supabase.from("draft_shortlists").select("player_ids").eq("season", DRAFT_SEASON), "draft_shortlists");
  return new Set([...roster.players.map((p) => p.player_id), ...lists.flatMap((list) => list.player_ids || []).map(Number)]);
}

// Pulls Rotowire's injury table, stores listings for the whole draft pool, and returns changes for watched players.
export async function runInjuryCheck({ now = new Date() } = {}) {
  const [roster, pool] = await Promise.all([ourRoster(now), poolPlayers()]);
  const watched = await watchedPlayers(roster);
  const result = { checked_at: now.toISOString(), roster: roster.players.length, pool: pool.length, watched: watched.size, feed_rows: 0, listed: 0, changes: [] };
  if (pool.length) {
    const response = await fetch(ROTOWIRE_INJURY_URL, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Rotowire ${response.status}`);
    const feed = await response.json();
    if (!Array.isArray(feed)) throw new Error("Rotowire returned an unexpected format.");
    const matches = matchInjuries(feed, pool);
    const stored = must(await supabase.from("player_injuries").select("*").eq("source", "rotowire"), "player_injuries read");
    const changes = diffInjuries(stored, matches);
    const firstReported = new Map(stored.filter((row) => !row.cleared_at).map((row) => [row.player_id, row.first_reported_at]));

    if (matches.length) {
      must(await supabase.from("player_injuries").upsert(matches.map((row) => ({
        ...row, source: "rotowire", checked_at: now.toISOString(), cleared_at: null,
        first_reported_at: firstReported.get(row.player_id) || now.toISOString()
      })), { onConflict: "player_id,source" }), "player_injuries upsert");
    }
    const cleared = changes.filter((change) => change.type === "cleared").map((change) => change.player_id);
    if (cleared.length) {
      must(await supabase.from("player_injuries").update({ cleared_at: now.toISOString(), checked_at: now.toISOString() })
        .eq("source", "rotowire").in("player_id", cleared), "player_injuries clear");
    }

    const names = new Map(pool.map((p) => [p.player_id, p.name]));
    Object.assign(result, {
      feed_rows: feed.length,
      listed: matches.length,
      changes: changes.filter((change) => watched.has(change.player_id))
        .map((change) => ({ ...change, name: names.get(change.player_id), starter: roster.starters.has(change.player_id) }))
    });
  }
  must(await supabase.from("sync_log").upsert({ run_type: "injuries", last_run_at: now.toISOString(), details: JSON.stringify({ ...result, changes: result.changes.length }) },
    { onConflict: "run_type" }), "sync_log injuries");
  return result;
}
