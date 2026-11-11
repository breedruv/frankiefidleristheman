import Link from "next/link";
import { getDraftPool, getDraftedPlayerIds } from "../../../lib/queries";
import { getDraftRosterPool } from "../../../lib/draftRoster";
import { mergePlayerStats } from "../../../lib/playerStats";
import { getExhibitionStats } from "../../../lib/exhibitionStats";
import { currentSeasonStats, overlayExhibitionStats } from "../../../lib/exhibitionStats.mjs";
import { DRAFT_SEASON } from "../../../lib/draftRules.mjs";
import PlayerPoolControls from "./PlayerPoolControls";
import PlayerFocusWorkspace from "./PlayerFocusWorkspace";
import { currentMember } from "../../../lib/auth";

export const dynamic = "force-dynamic";
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;

export default async function DraftPlayersPage({ searchParams }) {
  const member = await currentMember();
  const params = await searchParams;
  const statsMode = params?.stats === "exhibition" ? "exhibition" : "regular";
  const filters = { position: params?.position || "All", team: params?.team || "All", minPpg: params?.min_ppg || "", maxPpg: params?.max_ppg || "", search: params?.search || "" };
  const hideDrafted = params?.hide_drafted === "1";
  const [databasePlayers, draftedPlayerIds, exhibitionStats] = await Promise.all([getDraftPool(5000), getDraftedPlayerIds(2026), statsMode === "exhibition" ? getExhibitionStats() : Promise.resolve(null)]);
  const roster = getDraftRosterPool(5000).map((p) => ({ ...p, position: num(p.height) >= 82 && p.position === "F" ? "F-C" : p.position }));
  const rosterById = new Map(roster.map((p) => [Number(p.player_id), p]));
  const dbIds = new Set(databasePlayers.map((p) => Number(p.player_id)));
  const base = [...databasePlayers.filter((p) => !roster.length || rosterById.has(Number(p.player_id))).map((p) => { const r = rosterById.get(Number(p.player_id)); return r ? { ...r, ...p, height: p.height ?? r.height, headshot: p.headshot ?? r.headshot } : p; }), ...roster.filter((p) => !dbIds.has(Number(p.player_id)))];
  const pool = mergePlayerStats(base).map((player) => { const positions = (player.position || "").split("-").filter(Boolean); const positioned = { ...player, position: num(player.height) >= 82 && !positions.includes("C") ? [...positions, "C"].join("-") : player.position }; const stats = statsMode === "exhibition" ? overlayExhibitionStats(positioned, exhibitionStats[player.player_id]) : positioned; return currentSeasonStats(stats, DRAFT_SEASON + 1); });
  const players = pool.filter((p) => { const text = `${p.first_name || ""} ${p.last_name || ""} ${p.team_name || ""}`.toLowerCase(); const positions = (p.position || "").split("-"); const positionMatch = filters.position === "All" || (filters.position === "C" ? positions.includes("C") || num(p.height) >= 82 : positions.includes(filters.position)); const min = filters.minPpg === "" ? null : Number(filters.minPpg); const max = filters.maxPpg === "" ? null : Number(filters.maxPpg); return (!filters.search || text.includes(filters.search.toLowerCase())) && positionMatch && (filters.team === "All" || p.team_name === filters.team) && (!Number.isFinite(min) || (p.ppg != null && Number(p.ppg) >= min)) && (!Number.isFinite(max) || (p.ppg != null && Number(p.ppg) <= max)); });
  const teams = [...new Set(pool.map((p) => p.team_name).filter(Boolean))].sort();
  return <div className="page draft-players-page"><div className="draft-subnav"><Link href="/draft/board">Draft Board</Link><Link className="active" href="/draft/players">Player Focus</Link><Link href="/compare">Compare Players</Link></div><section className="draft-focus-hero"><div><span className="draft-countdown-kicker">Draft headquarters · Player focus</span><h1>Player Focus</h1><p>Research available players and keep both top 10 lists in view.</p></div><div className="draft-focus-count"><strong>{DRAFT_SEASON} Draft</strong><span>{DRAFT_SEASON}–{String(DRAFT_SEASON + 1).slice(-2)} {statsMode === "exhibition" ? "exhibition" : "regular-season"} stats</span></div></section><PlayerPoolControls search={filters.search} hideDrafted={hideDrafted} /><details className="player-filter-disclosure"><summary>Filters <span>Position, team, and PPG range</span></summary><form className="filters" method="get"><input type="hidden" name="stats" value={statsMode} /><div className="filter-card"><label>Position</label><select name="position" defaultValue={filters.position}><option>All</option><option>G</option><option>F</option><option>C</option><option>G-F</option><option>F-C</option></select></div><div className="filter-card"><label>Team</label><select name="team" defaultValue={filters.team}><option>All</option>{teams.map((team) => <option key={team}>{team}</option>)}</select></div><div className="filter-card"><label>PPG range</label><div className="ppg-range"><input name="min_ppg" type="number" step="0.1" placeholder="Min" defaultValue={filters.minPpg} /><input name="max_ppg" type="number" step="0.1" placeholder="Max" defaultValue={filters.maxPpg} /></div></div><div className="filter-card filter-submit"><button className="solid-pill" type="submit">Apply filters</button><Link className="ghost-pill" href={statsMode === "exhibition" ? "/draft/players?stats=exhibition" : "/draft/players"}>Reset</Link></div></form></details><PlayerFocusWorkspace players={players} pool={pool} statsMode={statsMode} draftedPlayerIds={[...draftedPlayerIds]} member={member} hideDrafted={hideDrafted} /></div>;
}
