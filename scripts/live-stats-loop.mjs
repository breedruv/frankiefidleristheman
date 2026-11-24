// Run the live refresh from this PC so stats are captured even when nobody has the scoreboard open.
//   node scripts/live-stats-loop.mjs [--all-games] [--hours 14] [--interval 60]
// Waits for the first relevant tip of the ET game day and exits once every relevant game is final
// (--hours is a safety cap from the first tip). Shares the one-run-per-minute lock with the web app.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const { refreshLiveStats, pendingGamesToday } = await import("../lib/liveStats.js");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const allGames = args.includes("--all-games");
const minInterval = option("--interval", 60);
const capHours = option("--hours", 14);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const time = () => new Date().toLocaleTimeString();
const scope = allGames ? "scheduled" : "lineup";

const initial = await pendingGamesToday({ allGames });
if (!initial.length) {
  console.log(`No ${scope} games left today. Nothing to do.`);
  process.exit(0);
}
const firstTip = Date.parse(initial[0].game_datetime);
console.log(`${initial.length} ${scope} games pending; first tip ${new Date(firstTip).toLocaleTimeString()}.`);
if (firstTip > Date.now()) {
  console.log(`Waiting until first tip. Ctrl+C to stop.`);
  await sleep(firstTip - Date.now());
}

const stopAt = Math.max(firstTip, Date.now()) + capHours * 60 * 60 * 1000;
console.log(`Live loop running; safety cap ${new Date(stopAt).toLocaleString()}.`);
while (Date.now() < stopAt) {
  let delay = minInterval;
  try {
    const r = await refreshLiveStats({ source: "pc", allGames });
    if (r.refreshed) {
      console.log(`${time()} espn=${r.espn_requests} relevant=${r.relevant_games} live=${r.live_games} finalized=${r.finalized_games} ` +
        `live_rows=${r.live_rows} final_rows=${r.final_rows} fallback=${r.schedule_fallback_games ?? 0}` +
        (r.scoreboard_error ? ` SCOREBOARD_ERROR="${r.scoreboard_error}"` : "") +
        (r.summary_blocked ? ` SUMMARY_BLOCKED=${r.summary_blocked}` : "") +
        (r.errors.length ? ` errors=${r.errors.length}: ${r.errors.slice(0, 3).join(" | ")}` : ""));
    } else {
      console.log(`${time()} skipped: another refresh ran within the last minute`);
    }
    delay = Math.max(minInterval, r.next_check_seconds || minInterval);

    const pending = await pendingGamesToday({ allGames });
    if (!pending.length) {
      console.log(`${time()} All ${scope} games are final. Live loop finished.`);
      process.exit(0);
    }
    const nextTip = Date.parse(pending[0].game_datetime);
    if (nextTip - Date.now() > delay * 1000) delay = Math.ceil((nextTip - Date.now()) / 1000);
  } catch (error) {
    console.error(`${time()} refresh failed: ${error.message}`);
  }
  await sleep(delay * 1000);
}
console.log("Safety cap reached. Live loop finished.");
