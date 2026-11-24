import { supabase, hasSupabase } from "./supabase.js";
import {
  ESPN_CBB_BASE,
  easternGameDay,
  extractSummaryStats,
  pendingGames,
  isFinalStatus,
  missingStartedGames,
  nextCheckSeconds,
  parseScoreboardEvents,
  parseSummaryEvent,
  planGameFetches,
  scoreboardDates
} from "./liveScoring.mjs";

const RUN_TYPE = "live_stats";
const THROTTLE_MS = 60 * 1000;
const LINEUP_PLAYER_COLUMNS = ["center", "forward1", "forward2", "guard1", "guard2", "t1", "t2"];
const GAME_COLUMNS = "game_id,game_date,game_datetime,season,status,home_team_id,home_team_name,away_team_id,away_team_name";
const SCHEDULE_LOOKBACK_MS = 6 * 60 * 60 * 1000;

const BLOCKED_STATUSES = new Set([403, 429]);

class EspnError extends Error {
  constructor(status, url) {
    super(`ESPN ${status} for ${url}`);
    this.status = status;
  }
}

// Every ESPN call is recorded so rate limits can be measured per endpoint and source.
async function fetchJson(url, counter, { endpoint, gameId = null }) {
  counter.requests += 1;
  const started = Date.now();
  const entry = { requested_at: new Date(started).toISOString(), source: counter.source, endpoint, game_id: gameId, status: null, duration_ms: null, error: null };
  counter.log.push(entry);
  try {
    const response = await fetch(url, { cache: "no-store" });
    entry.status = response.status;
    if (!response.ok) throw new EspnError(response.status, url);
    return await response.json();
  } catch (error) {
    entry.error = error.message.slice(0, 300);
    throw error;
  } finally {
    entry.duration_ms = Date.now() - started;
  }
}

function must({ data, error }, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}

// Only one viewer per minute reaches ESPN; everyone else reads the last result.
async function claimRun(now) {
  must(await supabase.from("sync_log").upsert(
    { run_type: RUN_TYPE, last_run_at: new Date(0).toISOString() },
    { onConflict: "run_type", ignoreDuplicates: true }
  ), "sync_log seed");
  const cutoff = new Date(now.getTime() - THROTTLE_MS).toISOString();
  const claimed = must(await supabase.from("sync_log")
    .update({ last_run_at: now.toISOString() })
    .eq("run_type", RUN_TYPE)
    .or(`last_run_at.is.null,last_run_at.lt."${cutoff}"`)
    .select("run_type"), "sync_log claim");
  return claimed.length > 0;
}

async function lastResult() {
  const rows = must(await supabase.from("sync_log").select("last_run_at,details").eq("run_type", RUN_TYPE).limit(1), "sync_log read");
  try {
    return { ...JSON.parse(rows[0]?.details || "{}"), refreshed: false };
  } catch {
    return { refreshed: false };
  }
}

// Players in any lineup whose fantasy week covers the dates being checked.
async function lineupTargets(firstIso, lastIso) {
  const weeks = must(await supabase.from("fantasy_weeks").select("season,season_type,week")
    .lte("start_date", lastIso).gte("end_date", firstIso), "fantasy_weeks");
  const lineups = (await Promise.all(weeks.map(async (week) => must(await supabase.from("fantasy_lineups").select("*")
    .eq("season", week.season).eq("season_type", week.season_type).eq("week", week.week), "fantasy_lineups")))).flat();
  const playerIds = new Set();
  const gameIds = new Set();
  for (const lineup of lineups) {
    for (const slot of LINEUP_PLAYER_COLUMNS) {
      if (lineup[`${slot}_id`]) playerIds.add(Number(lineup[`${slot}_id`]));
      if (lineup[`${slot}_game_id`]) gameIds.add(Number(lineup[`${slot}_game_id`]));
    }
  }
  const players = playerIds.size
    ? must(await supabase.from("players").select("player_id,team_id").in("player_id", [...playerIds]), "players")
    : [];
  return { playerIds, gameIds, teamIds: new Set(players.map((p) => Number(p.team_id)).filter(Boolean)) };
}

function gameRow(event, season, stored) {
  return {
    game_id: event.game_id,
    game_date: stored?.game_date ?? event.game_datetime?.slice(0, 10) ?? null,
    game_datetime: event.game_datetime,
    season: stored?.season ?? season,
    home_team_id: event.home_team_id,
    home_team_name: event.home_team_name,
    away_team_id: event.away_team_id,
    away_team_name: event.away_team_name,
    status: event.status
  };
}

async function writeLiveGame(event, summary, ctx) {
  const game = gameRow(event, ctx.season, ctx.storedGames.get(event.game_id));
  const rows = extractSummaryStats(summary, event.game_id, { season: game.season, gameDate: game.game_date })
    .filter((row) => ctx.targets.playerIds.has(row.player_id))
    .map((row) => ({ ...row, updated_at: ctx.now.toISOString() }));
  must(await supabase.from("games").upsert(game, { onConflict: "game_id" }), "games live upsert");
  if (rows.length) must(await supabase.from("live_player_games").upsert(rows, { onConflict: "game_id,player_id" }), "live_player_games upsert");
  return rows.length;
}

// Final box score goes to player_games for every known player, matching the Python stats job.
async function writeFinalGame(event, summary, ctx) {
  const game = gameRow(event, ctx.season, ctx.storedGames.get(event.game_id));
  const rows = extractSummaryStats(summary, event.game_id, { season: game.season, gameDate: game.game_date });
  const known = (table, column, ids) => ids.length
    ? supabase.from(table).select(column).in(column, ids).then((result) => new Set(must(result, table).map((r) => Number(r[column]))))
    : new Set();
  const [players, teams] = await Promise.all([
    known("players", "player_id", [...new Set(rows.map((r) => r.player_id))]),
    known("teams", "team_id", [...new Set(rows.map((r) => r.team_id))])
  ]);
  const payload = rows.filter((row) => players.has(row.player_id) && teams.has(row.team_id));
  // Stats first: the game is only marked Final once they are saved, so a failed write is retried next run.
  if (payload.length) must(await supabase.from("player_games").upsert(payload, { onConflict: "game_id,player_id" }), "player_games upsert");
  must(await supabase.from("games").upsert(game, { onConflict: "game_id" }), "games final upsert");
  must(await supabase.from("live_player_games").delete().eq("game_id", event.game_id), "live_player_games cleanup");
  return payload.length;
}

// Last refresh result for the scoreboard label; reads Supabase only.
export async function latestLiveStatus() {
  if (!hasSupabase || !supabase) throw new Error("Supabase is not configured.");
  return lastResult();
}

// Relevant games for the current ET game day that are not final yet, earliest tip first.
export async function pendingGamesToday({ now = new Date(), allGames = false } = {}) {
  if (!hasSupabase || !supabase) throw new Error("Supabase is not configured.");
  const day = easternGameDay(now);
  const games = must(await supabase.from("games").select(GAME_COLUMNS)
    .eq("is_exhibition", false).gte("game_datetime", day.start).lt("game_datetime", day.end), "games day read");
  if (allGames) return pendingGames(games, now);
  const targets = await lineupTargets(day.iso, day.iso);
  return pendingGames(games.filter((game) => targets.gameIds.has(Number(game.game_id)) ||
    targets.teamIds.has(Number(game.home_team_id)) || targets.teamIds.has(Number(game.away_team_id))), now);
}

// allGames follows every scheduled AVAILABLE_TEAMS game (rate-limit testing / PC ingest);
// live rows are still written only for lineup players.
export async function refreshLiveStats({ now = new Date(), force = false, source = "web", allGames = false } = {}) {
  if (!hasSupabase || !supabase) throw new Error("Supabase is not configured.");
  if (!force && !(await claimRun(now))) return lastResult();

  const counter = { requests: 0, source, log: [] };
  const { dates, isoDates } = scoreboardDates(now);
  const targets = await lineupTargets(isoDates[0], isoDates[isoDates.length - 1]);
  const result = {
    refreshed: true, checked_at: now.toISOString(), source, all_games: allGames, lineup_players: targets.playerIds.size,
    relevant_games: 0, live_games: 0, finalized_games: 0, live_rows: 0, final_rows: 0, errors: []
  };

  // Our schedule window: started in the last 6 hours or tipping within 30 minutes. Exhibitions have their own pipeline.
  const scheduled = must(await supabase.from("games").select(GAME_COLUMNS)
    .eq("is_exhibition", false)
    .gte("game_datetime", new Date(now.getTime() - SCHEDULE_LOOKBACK_MS).toISOString())
    .lte("game_datetime", new Date(now.getTime() + 30 * 60 * 1000).toISOString()), "games schedule read");
  if (allGames) scheduled.forEach((game) => targets.gameIds.add(Number(game.game_id)));

  if (targets.playerIds.size || allGames) {
    let season = null;
    const events = [];
    for (const day of dates) {
      try {
        const payload = await fetchJson(`${ESPN_CBB_BASE}/scoreboard?dates=${day}&groups=50&limit=500`, counter, { endpoint: "scoreboard" });
        season = season ?? payload?.leagues?.[0]?.season?.year ?? null;
        events.push(...parseScoreboardEvents(payload));
      } catch (error) {
        // Fall through to schedule-driven summaries; missingStartedGames picks up every started game.
        result.scoreboard_error = error.message;
      }
    }
    season = season ?? scheduled.find((game) => game.season)?.season ?? null;
    const eventIds = events.map((event) => event.game_id);
    const stored = eventIds.length
      ? must(await supabase.from("games").select(`${GAME_COLUMNS},is_exhibition`).in("game_id", eventIds), "games read")
      : [];
    const missing = missingStartedGames(scheduled, new Set(eventIds), targets, now);
    const storedGames = new Map([...stored, ...missing].map((game) => [Number(game.game_id), game]));
    const finalGameIds = new Set(stored.filter((game) => game.is_exhibition || isFinalStatus(game.status)).map((game) => Number(game.game_id)));
    const plan = planGameFetches(events, { ...targets, finalGameIds });
    const ctx = { now, season, targets, storedGames };
    result.relevant_games = plan.relevant.length + missing.length;
    result.schedule_fallback_games = missing.length;
    result.next_check_seconds = missing.length ? 60 : nextCheckSeconds(plan.relevant, now);

    const jobs = [...plan.live, ...plan.finalize, ...missing].map((game) => Number(game.game_id));
    const scoreboardEvents = new Map(events.map((event) => [event.game_id, event]));
    for (const gameId of jobs) {
      try {
        const summary = await fetchJson(`${ESPN_CBB_BASE}/summary?event=${gameId}`, counter, { endpoint: "summary", gameId });
        const event = scoreboardEvents.get(gameId) || parseSummaryEvent(summary, gameId);
        if (event?.state === "in") {
          result.live_games += 1;
          result.live_rows += await writeLiveGame(event, summary, ctx);
        } else if (event?.state === "post") {
          result.final_rows += await writeFinalGame(event, summary, ctx);
          result.finalized_games += 1;
        }
      } catch (error) {
        result.errors.push(`${gameId}: ${error.message}`);
        if (BLOCKED_STATUSES.has(error.status)) {
          result.summary_blocked = error.status;
          break;
        }
      }
    }

    if (result.finalized_games && season) {
      const { error } = await supabase.rpc("refresh_player_stat_averages", { season_param: season });
      if (error) result.errors.push(`averages: ${error.message}`);
    }
  } else {
    result.next_check_seconds = 300;
  }

  result.espn_requests = counter.requests;
  if (counter.log.length) {
    const { error } = await supabase.from("espn_request_log").insert(counter.log);
    if (error) result.errors.push(`request log: ${error.message}`);
  }
  must(await supabase.from("sync_log").update({ details: JSON.stringify(result) }).eq("run_type", RUN_TYPE), "sync_log details");
  return result;
}
