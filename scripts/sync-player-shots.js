import path from "node:path";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), ".env.local") });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const limit = Number(process.argv[2] || 25);
const delayMs = Number(process.argv[3] || 300);
if (!supabaseUrl || !serviceKey) throw new Error("Supabase URL and service role key are required.");
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
const apiBase = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const gamesResponse = await fetch(`${supabaseUrl}/rest/v1/games?select=game_id,game_date,season&order=game_date.desc&limit=${limit}`, { headers });
if (!gamesResponse.ok) throw new Error(`Could not read games (${gamesResponse.status}): ${await gamesResponse.text()}`);
const games = await gamesResponse.json();
const shots = [];
for (const game of games) {
  const response = await fetch(`${apiBase}${game.game_id}`);
  if (!response.ok) { console.warn(`Skipping ${game.game_id}: ESPN returned ${response.status}`); continue; }
  const summary = await response.json();
  for (const play of summary.plays || []) {
    if (!play.shootingPlay || !play.coordinate || !play.participants?.length) continue;
    const shooter = play.participants[0]?.athlete?.id;
    if (!shooter) continue;
    const text = play.text || "";
    shots.push({
      // ESPN play IDs are 18+ digit values. Keep them as strings so JavaScript
      // does not round distinct plays past Number.MAX_SAFE_INTEGER.
      play_id: String(play.id), game_id: Number(game.game_id), player_id: Number(shooter), assist_player_id: play.participants[1]?.athlete?.id ? Number(play.participants[1].athlete.id) : null,
      team_id: play.team?.id ? Number(play.team.id) : null, period: play.period?.number ?? null, clock: play.clock?.displayValue ?? null,
      shot_type: play.type?.text ?? null, result: play.scoringPlay ? "Made" : "Missed", points_attempted: play.pointsAttempted ?? null,
      coord_x: play.coordinate.x, coord_y: play.coordinate.y, shot_text: text, game_date: game.game_date, season: game.season || 2025
    });
  }
  await sleep(delayMs);
}
const uniqueShots = [...new Map(shots.map((shot) => [shot.play_id, shot])).values()];
for (let index = 0; index < uniqueShots.length; index += 500) {
  const batch = uniqueShots.slice(index, index + 500);
  const response = await fetch(`${supabaseUrl}/rest/v1/player_shots?on_conflict=play_id`, { method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch) });
  if (!response.ok) throw new Error(`Shot upsert failed (${response.status}): ${await response.text()}`);
}
console.log(`Synced ${uniqueShots.length} shots from ${games.length} ESPN games.`);
