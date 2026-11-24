// Summarize ESPN request outcomes from espn_request_log for one ET day.
//   node scripts/live-rate-report.mjs [YYYY-MM-DD]
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const { supabase } = await import("../lib/supabase.js");

const day = process.argv[2] || new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
// ET is UTC-5 during the season (after the November DST change); close enough for a daily report.
const from = new Date(`${day}T05:00:00Z`);
const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

const rows = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await supabase.from("espn_request_log").select("*")
    .gte("requested_at", from.toISOString()).lt("requested_at", to.toISOString())
    .order("requested_at").range(offset, offset + 999);
  if (error) throw new Error(error.message);
  rows.push(...data);
  if (data.length < 1000) break;
}

console.log(`ESPN requests for ${day} (ET): ${rows.length}`);
const groups = new Map();
for (const row of rows) {
  const key = `${row.source} ${row.endpoint} ${row.status ?? "network-error"}`;
  const group = groups.get(key) || { count: 0, ms: 0 };
  group.count += 1;
  group.ms += row.duration_ms || 0;
  groups.set(key, group);
}
console.table([...groups].map(([key, g]) => ({ "source endpoint status": key, requests: g.count, avg_ms: Math.round(g.ms / g.count) })));

const perMinute = new Map();
rows.forEach((row) => perMinute.set(row.requested_at.slice(0, 16), (perMinute.get(row.requested_at.slice(0, 16)) || 0) + 1));
console.log(`Peak requests in one minute: ${Math.max(0, ...perMinute.values())}`);

const failures = rows.filter((row) => row.status !== 200);
if (failures.length) {
  console.log(`First failure: ${failures[0].requested_at} ${failures[0].endpoint} ${failures[0].status ?? ""} ${failures[0].error ?? ""}`);
  const afterFirst = rows.filter((row) => row.requested_at > failures[0].requested_at);
  const ok = (endpoint) => afterFirst.filter((row) => row.endpoint === endpoint && row.status === 200).length;
  console.log(`Successful after first failure: scoreboard=${ok("scoreboard")} summary=${ok("summary")}`);
} else {
  console.log("No failed requests.");
}
