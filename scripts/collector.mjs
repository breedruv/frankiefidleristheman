// 24/7 PC collector: live stats, nightly final-stats backstop, schedule refresh, Rotowire injuries,
// a heartbeat the Supabase failover watches, and ntfy alerts. Setup: docs/collector.md.
//   node scripts/collector.mjs [--all-games] [--once]
import dotenv from "dotenv";
import os from "node:os";
import { spawn } from "node:child_process";

dotenv.config({ path: ".env.local" });
const { supabase } = await import("../lib/supabase.js");
const { refreshLiveStats, pendingGamesToday } = await import("../lib/liveStats.js");
const { runInjuryCheck, rosterTipsToday } = await import("../lib/injuryCheck.js");
const { notify } = await import("../lib/notify.js");
const { easternGameDay } = await import("../lib/liveScoring.mjs");
const { dailyJobDue, injuryCheckDue, liveWindowOpen } = await import("../lib/collectorSchedule.mjs");

const MINUTE = 60 * 1000;
const LIVE_INTERVAL_MS = 5 * MINUTE;
const HEARTBEAT_MS = 5 * MINUTE;
const RETRY_MS = 30 * MINUTE;
const TIPS_CACHE_MS = 15 * MINUTE;
const STATS_HOUR = 4; // ET; late West Coast games are final by then
const SCHEDULE_HOUR = 5;
const INJURY_HOUR = 10;

const args = process.argv.slice(2);
const allGames = args.includes("--all-games") || process.env.COLLECTOR_ALL_GAMES === "true";
const once = args.includes("--once");
const python = process.env.PYTHON || "python";
const state = { lastLive: 0, lastHeartbeat: 0, failing: new Set(), retryAt: new Map(), alerted: new Set(), tips: { at: 0, value: [] } };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
const log = (message) => console.log(`${new Date().toLocaleString()} ${message}`);

async function lastRun(runType) {
  const { data, error } = await supabase.from("sync_log").select("last_run_at").eq("run_type", runType).maybeSingle();
  if (error) throw new Error(`sync_log ${runType}: ${error.message}`);
  return data?.last_run_at || null;
}

// Alerts on a job's first failure and on recovery, not on every tick.
async function track(job, fn) {
  try {
    const result = await fn();
    if (state.failing.delete(job)) await notify(`${job} recovered`, `The ${job} job is working again.`, { tags: ["white_check_mark"] });
    return result ?? true;
  } catch (error) {
    log(`${job} failed: ${error.message}`);
    if (!state.failing.has(job)) {
      state.failing.add(job);
      const manual = job === "injuries" ? " Track injuries manually until it recovers." : "";
      await notify(`${job} failed`, `${error.message.slice(0, 300)}${manual}`, { priority: 4, tags: ["warning"] });
    }
    return null;
  }
}

async function alertOncePerDay(key, title, message, now) {
  const dayKey = `${easternGameDay(now).iso}:${key}`;
  if (state.alerted.has(dayKey)) return;
  state.alerted.add(dayKey);
  await notify(title, message, { priority: 4, tags: ["rotating_light"] });
}

function runPython(jobArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["python/espn_ingest.py", ...jobArgs, "--use-supabase"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const keep = (chunk) => { output = (output + chunk).slice(-2000); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", reject);
    child.on("close", (code) => {
      const tail = output.trim().split("\n").slice(-3).join(" | ");
      if (code === 0) {
        log(`python ${jobArgs[0]}: ${tail}`);
        resolve(true);
      } else reject(new Error(`python ${jobArgs[0]} exited ${code}: ${tail}`));
    });
  });
}

async function heartbeat(now) {
  if (now.getTime() - state.lastHeartbeat < HEARTBEAT_MS) return;
  const details = JSON.stringify({ host: os.hostname(), all_games: allGames, failing: [...state.failing] });
  const { error } = await supabase.from("sync_log").upsert({ run_type: "collector_heartbeat", last_run_at: now.toISOString(), details }, { onConflict: "run_type" });
  if (error) throw new Error(`heartbeat: ${error.message}`);
  state.lastHeartbeat = now.getTime();
}

async function live(now) {
  if (now.getTime() - state.lastLive < LIVE_INTERVAL_MS) return;
  if (!liveWindowOpen(await pendingGamesToday({ now, allGames }), now)) return;
  state.lastLive = now.getTime();
  const r = await refreshLiveStats({ now, source: "pc", allGames });
  if (!r.refreshed) return log("live: skipped, another refresh ran within the last minute");
  log(`live: espn=${r.espn_requests} relevant=${r.relevant_games} live=${r.live_games} finalized=${r.finalized_games} ` +
    `live_rows=${r.live_rows} final_rows=${r.final_rows}${r.errors.length ? ` errors: ${r.errors.slice(0, 3).join(" | ")}` : ""}`);
  if (r.summary_blocked) await alertOncePerDay("summary", "ESPN rate limit", `Game summaries returned ${r.summary_blocked}. Live stats paused until the next run.`, now);
  if (r.scoreboard_error) await alertOncePerDay("scoreboard", "ESPN scoreboard failing", `${r.scoreboard_error.slice(0, 200)} (using schedule fallback).`, now);
}

async function daily(job, hour, now, fn) {
  if ((state.retryAt.get(job) || 0) > now.getTime()) return;
  if (!dailyJobDue(await lastRun(job), now, hour)) return;
  if (!(await track(job, fn))) state.retryAt.set(job, now.getTime() + RETRY_MS);
}

function sinceIso(now, days) {
  const day = new Date(`${easternGameDay(now).iso}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - days);
  return day.toISOString().slice(0, 10);
}

async function injuries(now) {
  if ((state.retryAt.get("injuries") || 0) > now.getTime()) return;
  if (now.getTime() - state.tips.at > TIPS_CACHE_MS) state.tips = { at: now.getTime(), value: await rosterTipsToday(now) };
  const last = await lastRun("injuries");
  if (!dailyJobDue(last, now, INJURY_HOUR) && !injuryCheckDue(last, now, state.tips.value)) return;
  const result = await track("injuries", () => runInjuryCheck({ now }));
  if (!result) return state.retryAt.set("injuries", now.getTime() + RETRY_MS);
  log(`injuries: pool=${result.pool} watched=${result.watched} roster=${result.roster} rotowire=${result.feed_rows} listed=${result.listed} changes=${result.changes.length}`);
  for (const change of result.changes) {
    const who = `${change.starter ? "STARTER " : ""}${change.name || change.player_id}`;
    const what = change.type === "cleared" ? `no longer listed (was ${change.status})`
      : `${change.status}${change.injury ? ` (${change.injury})` : ""}${change.type === "changed" ? `, was ${change.from}` : ""}`;
    await notify(`Injury: ${who}`, what, { priority: change.starter && change.type !== "cleared" ? 5 : 3, tags: ["ambulance"] });
  }
}

log(`Collector started on ${os.hostname()} (${allGames ? "all scheduled games" : "lineup games"}).`);
if (!once) await notify("Collector started", `${os.hostname()} · ${allGames ? "all games" : "lineup games"}`, { priority: 2 });
do {
  const now = new Date();
  await track("heartbeat", () => heartbeat(now));
  await track("live", () => live(now));
  await daily("stats", STATS_HOUR, now, () => runPython(["stats", "--since", sinceIso(now, 3)]));
  // Shot maps for games finalized by live scoring (the stats backstop skips games that already have box scores).
  await daily("shots", STATS_HOUR, now, () => runPython(["shots", "--since", sinceIso(now, 3)]));
  await daily("schedule", SCHEDULE_HOUR, now, () => runPython(["schedule"]));
  await track("injuries-schedule", () => injuries(now));
  if (!once) await sleep(MINUTE - (Date.now() - now.getTime()));
} while (!once);
