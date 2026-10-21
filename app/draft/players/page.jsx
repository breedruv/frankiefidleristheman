import Link from "next/link";
import { getDraftPool, getDraftedPlayerIds, getPlayerStatAverages } from "../../../lib/queries";
import { getDraftRosterPool } from "../../../lib/draftRoster";
import { mergePlayerStats } from "../../../lib/playerStats";
import PlayerPoolControls from "./PlayerPoolControls";
import PlayerFocusWorkspace from "./PlayerFocusWorkspace";
import { currentMember } from "../../../lib/auth";

export const dynamic = "force-dynamic";
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;

export default async function DraftPlayersPage({ searchParams }) {
  const member = await currentMember();
  const params = await searchParams;
  const filters = { position: params?.position || "All", team: params?.team || "All", minPpg: params?.min_ppg || "", maxPpg: params?.max_ppg || "", search: params?.search || "" };
  const hideDrafted = params?.hide_drafted === "1";
  const databasePlayers = await getDraftPool(5000);
  const draftedPlayerIds = new Set(await getDraftedPlayerIds(2026));
  const summaryRows = await getPlayerStatAverages(2025);
  const summaries = new Map(summaryRows.map((row) => [Number(row.player_id), row]));
  const roster = getDraftRosterPool(5000).map((p) => ({ ...p, position: num(p.height) >= 82 && p.position === "F" ? "F-C" : p.position }));
  const rosterById = new Map(roster.map((p) => [Number(p.player_id), p]));
  const dbIds = new Set(databasePlayers.map((p) => Number(p.player_id)));
  const base = [...databasePlayers.filter((p) => !roster.length || rosterById.has(Number(p.player_id))).map((p) => { const r = rosterById.get(Number(p.player_id)); return r ? { ...r, ...p, height: p.height ?? r.height, headshot: p.headshot ?? r.headshot } : p; }), ...roster.filter((p) => !dbIds.has(Number(p.player_id)))];
  const pool = (summaryRows.length ? base : mergePlayerStats(base)).map((p) => { const s = summaries.get(Number(p.player_id)); const merged = s ? { ...p, ...s, three_pct: s.three_pt_percentage, ft_pct: s.free_throw_percentage, shots_per_game: s.shots_per_game } : p; const positions = (merged.position || "").split("-").filter(Boolean); return { ...merged, position: num(merged.height) >= 82 && !positions.includes("C") ? [...positions, "C"].join("-") : merged.position }; });
  const players = pool.filter((p) => { const text = `${p.first_name || ""} ${p.last_name || ""} ${p.team_name || ""}`.toLowerCase(); const positions = (p.position || "").split("-"); const positionMatch = filters.position === "All" || (filters.position === "C" ? positions.includes("C") || num(p.height) >= 82 : positions.includes(filters.position)); const min = filters.minPpg === "" ? null : Number(filters.minPpg); const max = filters.maxPpg === "" ? null : Number(filters.maxPpg); return (!filters.search || text.includes(filters.search.toLowerCase())) && positionMatch && (filters.team === "All" || p.team_name === filters.team) && (!Number.isFinite(min) || Number(p.ppg) >= min) && (!Number.isFinite(max) || Number(p.ppg) <= max); });
  const teams = [...new Set(pool.map((p) => p.team_name).filter(Boolean))].sort();
  return <div className="page draft-players-page"><div className="draft-subnav"><Link href="/draft/board">Draft Board</Link><Link className="active" href="/draft/players">Player Focus</Link><Link href="/compare">Compare Players</Link></div><section className="draft-focus-hero"><div><span className="draft-countdown-kicker">Draft headquarters · Player focus</span><h1>Player Focus</h1><p>Research available players and keep both top 10 lists in view.</p></div><div className="draft-focus-count"><strong>2026 Draft</strong><span>2025 season stats</span></div></section><PlayerPoolControls search={filters.search} hideDrafted={hideDrafted} /><details className="player-filter-disclosure"><summary>Filters <span>Position, team, and PPG range</span></summary><form className="filters" method="get"><div className="filter-card"><label>Position</label><select name="position" defaultValue={filters.position}><option>All</option><option>G</option><option>F</option><option>C</option><option>G-F</option><option>F-C</option></select></div><div className="filter-card"><label>Team</label><select name="team" defaultValue={filters.team}><option>All</option>{teams.map((team) => <option key={team}>{team}</option>)}</select></div><div className="filter-card"><label>PPG range</label><div className="ppg-range"><input name="min_ppg" type="number" step="0.1" placeholder="Min" defaultValue={filters.minPpg} /><input name="max_ppg" type="number" step="0.1" placeholder="Max" defaultValue={filters.maxPpg} /></div></div><div className="filter-card filter-submit"><button className="solid-pill" type="submit">Apply filters</button><Link className="ghost-pill" href="/draft/players">Reset</Link></div></form></details><PlayerFocusWorkspace players={players} pool={pool} draftedPlayerIds={[...draftedPlayerIds]} member={member} hideDrafted={hideDrafted} /></div>;
}
