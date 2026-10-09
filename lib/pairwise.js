import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { hasSupabase, supabase } from "./supabase";

const pairFile = path.join(process.cwd(), "College Basketball", "outputs", "human_feedback", "player_comparisons.csv");
const picksFile = path.join(process.cwd(), "College Basketball", "outputs", "human_feedback", "human_pairwise_picks.csv");
const pickFields = ["Timestamp", "Mode", "Pair ID", "Pair Type", "Pick Side", "Picked Player ID", "Picked Player Name", "Other Player ID", "Other Player Name", "Confidence", "Correct", "Projected Winner", "Actual Winner", "A Player ID", "A Player Name", "A Projected Total PTS", "A Actual Remainder PTS", "B Player ID", "B Player Name", "B Projected Total PTS", "B Actual Remainder PTS"];
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  return parse(fs.readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
}

function sidePayload(row, side) {
  const prefix = `${side} `;
  return {
    playerId: row[`${prefix}Player ID`], name: row[`${prefix}Player Name`], team: row[`${prefix}Team Name`], rosterClass: row[`${prefix}Roster Class`],
    rank: number(row[`${prefix}Rank`]), projectedTotal: number(row[`${prefix}Projected Total PTS`]), actualRemainder: number(row[`${prefix}Actual Remainder PTS`]),
    ppg: number(row[`${prefix}Prior PPG`]), mpg: number(row[`${prefix}Prior MPG`]), games: number(row[`${prefix}Prior Games`]), roll10: number(row[`${prefix}Roll 10 PPG`]),
    career: number(row[`${prefix}Career Best PPG`]), share: number(row[`${prefix}Player Team PTS Share`]), risk: number(row[`${prefix}Role Fragility Score`]),
    opportunity: number(row[`${prefix}Team Scoring Opportunity`]), recruit: number(row[`${prefix}Recruiting Rank`]), schedule: number(row[`${prefix}Schedule Net Difficulty`])
  };
}

export async function getPairwiseState(includePlayed = false) {
  if (hasSupabase && supabase) {
    const [{ data: comparisons, error: comparisonError }, { data: picks, error: pickError }] = await Promise.all([
      supabase.from("pairwise_comparisons").select("pair_id, pair_type, reason, projected_winner, actual_winner, player_a, player_b").order("pair_id"),
      supabase.from("pairwise_picks").select("pair_id, correct")
    ]);
    if (!comparisonError && !pickError) {
      const played = new Set((picks || []).map((pick) => pick.pair_id));
      const available = includePlayed ? comparisons || [] : (comparisons || []).filter((pair) => !played.has(pair.pair_id));
      const scored = (picks || []).filter((pick) => pick.correct !== null);
      const correct = scored.filter((pick) => pick.correct).length;
      return {
        pairs: available.map((pair) => ({ pairId: pair.pair_id, pairType: pair.pair_type, reason: pair.reason, projectedWinner: pair.projected_winner, actualWinner: pair.actual_winner, A: pair.player_a, B: pair.player_b })),
        summary: { scoredPicks: scored.length, correct, accuracy: scored.length ? correct / scored.length : null, groups: [] }
      };
    }
    console.warn("Supabase pairwise state error", comparisonError?.message || pickError?.message);
  }
  const pairs = readCsv(pairFile);
  const picks = readCsv(picksFile);
  const played = new Set(picks.map((pick) => pick["Pair ID"]));
  const available = includePlayed ? pairs : pairs.filter((pair) => !played.has(pair["Pair ID"]));
  return { pairs: available.map((row) => ({ pairId: row["Pair ID"], pairType: row["Pair Type"], reason: row.Reason, projectedWinner: row["Projected Winner"], actualWinner: row["Actual Winner"], A: sidePayload(row, "A"), B: sidePayload(row, "B") })), summary: summarizePicks(picks) };
}

export async function getPairById(pairId) {
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("pairwise_comparisons").select("pair_id, pair_type, reason, projected_winner, actual_winner, player_a, player_b").eq("pair_id", pairId).maybeSingle();
    if (!error && data) return { "Pair ID": data.pair_id, "Pair Type": data.pair_type, Reason: data.reason, "Projected Winner": data.projected_winner, "Actual Winner": data.actual_winner, "A Player ID": data.player_a.playerId, "A Player Name": data.player_a.name, "A Projected Total PTS": data.player_a.projectedTotal, "A Actual Remainder PTS": data.player_a.actualRemainder, "B Player ID": data.player_b.playerId, "B Player Name": data.player_b.name, "B Projected Total PTS": data.player_b.projectedTotal, "B Actual Remainder PTS": data.player_b.actualRemainder, _playerA: data.player_a, _playerB: data.player_b };
  }
  return readCsv(pairFile).find((pair) => pair["Pair ID"] === pairId);
}

export function summarizePicks(picks = readCsv(picksFile)) {
  const scored = picks.filter((pick) => pick.Correct === "0" || pick.Correct === "1");
  const correct = scored.filter((pick) => pick.Correct === "1").length;
  const groups = ["Pair Type", "Confidence"].flatMap((field) => [...new Set(scored.map((pick) => pick[field]).filter(Boolean))].map((value) => {
    const rows = scored.filter((pick) => pick[field] === value); const groupCorrect = rows.filter((pick) => pick.Correct === "1").length;
    return { group: field === "Pair Type" ? "Pair type" : "Confidence", value, picks: rows.length, correct: groupCorrect, accuracy: groupCorrect / rows.length };
  }));
  return { scoredPicks: scored.length, correct, accuracy: scored.length ? correct / scored.length : null, groups };
}

function csvCell(value) { const string = value == null ? "" : String(value); return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string; }

export async function savePick(pair, pickSide, confidence, mode, user = {}) {
  const otherSide = pickSide === "A" ? "B" : "A"; const picked = pair._playerA ? (pickSide === "A" ? pair._playerA : pair._playerB) : sidePayload(pair, pickSide); const other = pair._playerA ? (otherSide === "A" ? pair._playerA : pair._playerB) : sidePayload(pair, otherSide);
  const correct = pair["Actual Winner"] === "A" || pair["Actual Winner"] === "B" ? (pickSide === pair["Actual Winner"] ? "1" : "0") : "";
  if (hasSupabase && supabase) {
    let userId = null;
    if (user.browserKey || user.displayName) {
      const { data: profile, error: profileError } = await supabase.from("prediction_users").upsert({ browser_key: user.browserKey || null, display_name: user.displayName || "Anonymous", last_seen_at: new Date().toISOString() }, { onConflict: "browser_key" }).select("user_id").single();
      if (profileError) throw profileError;
      userId = profile.user_id;
    }
    const { error } = await supabase.from("pairwise_picks").insert({ pair_id: pair["Pair ID"], user_id: userId, mode, pick_side: pickSide, confidence: Number(confidence), correct: correct === "" ? null : correct === "1" });
    if (error) throw error;
    const { data: picks, error: pickError } = await supabase.from("pairwise_picks").select("correct");
    if (pickError) throw pickError;
    const scored = (picks || []).filter((pick) => pick.correct !== null); const totalCorrect = scored.filter((pick) => pick.correct).length;
    return { row: { Correct: correct }, summary: { scoredPicks: scored.length, correct: totalCorrect, accuracy: scored.length ? totalCorrect / scored.length : null, groups: [] } };
  }
  const row = { Timestamp: new Date().toISOString().slice(0, 19), Mode: mode, "Pair ID": pair["Pair ID"], "Pair Type": pair["Pair Type"], "Pick Side": pickSide, "Picked Player ID": picked.playerId, "Picked Player Name": picked.name, "Other Player ID": other.playerId, "Other Player Name": other.name, Confidence: String(confidence), Correct: correct, "Projected Winner": pair["Projected Winner"], "Actual Winner": pair["Actual Winner"], "A Player ID": pair["A Player ID"], "A Player Name": pair["A Player Name"], "A Projected Total PTS": pair["A Projected Total PTS"], "A Actual Remainder PTS": pair["A Actual Remainder PTS"], "B Player ID": pair["B Player ID"], "B Player Name": pair["B Player Name"], "B Projected Total PTS": pair["B Projected Total PTS"], "B Actual Remainder PTS": pair["B Actual Remainder PTS"] };
  fs.mkdirSync(path.dirname(picksFile), { recursive: true });
  if (!fs.existsSync(picksFile) || fs.statSync(picksFile).size === 0) fs.writeFileSync(picksFile, `${pickFields.join(",")}\n`);
  fs.appendFileSync(picksFile, `${pickFields.map((field) => csvCell(row[field])).join(",")}\n`);
  return { row, summary: summarizePicks() };
}

