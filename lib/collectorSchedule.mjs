// Pure timing helpers for scripts/collector.mjs.
import { easternGameDay } from './liveScoring.mjs';

const HOUR_MS = 60 * 60 * 1000;

// When a daily job at `hour` ET (4-27, measured from the 4am ET game-day start) is due today.
export function dailyJobBoundary(now, hour) {
  return Date.parse(easternGameDay(now).start) + (hour - 4) * HOUR_MS;
}

// A daily job is due once the current game day reaches its hour and it has not run since then.
export function dailyJobDue(lastRunAt, now, hour) {
  const boundary = dailyJobBoundary(now, hour);
  return now.getTime() >= boundary && (!lastRunAt || Date.parse(lastRunAt) < boundary);
}

// Live polling covers games that have tipped or tip within the lead window.
export function liveWindowOpen(pending, now, leadMs = 5 * 60 * 1000) {
  return pending.some((game) => Date.parse(game.game_datetime) <= now.getTime() + leadMs);
}

// Hourly injury checks on days our roster plays, until the day's last tip.
export function injuryCheckDue(lastRunAt, now, rosterTips, intervalMs = HOUR_MS) {
  const upcoming = rosterTips.some((tip) => Date.parse(tip) > now.getTime());
  return upcoming && (!lastRunAt || now.getTime() - Date.parse(lastRunAt) >= intervalMs);
}
