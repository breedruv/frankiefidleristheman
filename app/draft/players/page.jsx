import Link from "next/link";
import { getDraftPool, getDraftedPlayerIds, getLatestTeamRatings, getPlayerStatAverages, getPoolPlayerIds } from "../../../lib/queries";
import { withAvailability } from "../../../lib/availability";
import { withSourceProfiles } from "../../../lib/sourceProfiles";
import { getDraftRosterPool } from "../../../lib/draftRoster";
import { mergePlayerStats } from "../../../lib/playerStats";
import { getCombinedStats } from "../../../lib/exhibitionStats";
import { currentSeasonStats, overlayExhibitionStats } from "../../../lib/exhibitionStats.mjs";
import { DRAFT_SEASON } from "../../../lib/draftRules.mjs";
import PlayerPoolControls from "./PlayerPoolControls";
import PlayerFocusWorkspace from "./PlayerFocusWorkspace";
import TeamBrowser from "./TeamBrowser";
import { currentMember } from "../../../lib/auth";
import { getTeamBrowserTeams } from "../../../lib/teamBrowser";

export const dynamic = "force-dynamic";

export default async function DraftPlayersPage({ searchParams }) {
  const member = await currentMember();
  const params = await searchParams;
  const includeExhibitions = params?.stats === "combined" || params?.stats === "exhibition";
  const filters = { position: params?.position || "All", team: params?.team || "All", minPpg: params?.min_ppg || "", maxPpg: params?.max_ppg || "", search: params?.search || "" };
  const hideDrafted = params?.hide_drafted === "1";
  const [databasePlayers, draftedPlayerIds, combinedStats, poolIds, priorAverages, kenpom] = await Promise.all([getDraftPool(5000), getDraftedPlayerIds(2026), getCombinedStats(DRAFT_SEASON + 1), getPoolPlayerIds().catch(() => null), getPlayerStatAverages(DRAFT_SEASON), getLatestTeamRatings("kenpom")]);
  // Previous ESPN season (DRAFT_SEASON = 2026 is 2025-26), regular season only (python/import_prior_season.py).
  const priorById = new Map(priorAverages.map((row) => [Number(row.player_id), { prev_games: row.games_played, prev_starts: row.games_started, prev_ppg: row.ppg, prev_mpg: row.mpg, prev_last5_ppg: row.last5_ppg }]));
  // Team KenPom rating from the latest saved-page import (python/import_kenpom.py).
  const kenpomFields = (row) => row ? { kenpom_rank: row.rank, kenpom: row } : {};
  const roster = getDraftRosterPool(5000).filter((p) => !poolIds || poolIds.has(Number(p.player_id)));
  const rosterById = new Map(roster.map((p) => [Number(p.player_id), p]));
  const dbIds = new Set(databasePlayers.map((p) => Number(p.player_id)));
  const base = [...databasePlayers.filter((p) => !roster.length || rosterById.has(Number(p.player_id))).map((p) => { const r = rosterById.get(Number(p.player_id)); return r ? { ...r, ...p, height: p.height ?? r.height, headshot: p.headshot ?? r.headshot } : p; }), ...roster.filter((p) => !dbIds.has(Number(p.player_id)))];
  // Positions and height combine ESPN, CBS, Yahoo, and Lindy's (lib/sourceProfiles.mjs).
  const pool = await withAvailability((await withSourceProfiles(mergePlayerStats(base))).map((player) => ({ ...currentSeasonStats(player, DRAFT_SEASON + 1), ...priorById.get(Number(player.player_id)), ...kenpomFields(kenpom.get(Number(player.team_id))) })));
  const combinedPool = pool.map((player) => overlayExhibitionStats(player, combinedStats[player.player_id]));
  const filterPool = (items) => items.filter((p) => { const text = `${p.first_name || ""} ${p.last_name || ""} ${p.team_name || ""}`.toLowerCase(); const positions = (p.position || "").split("-"); const positionMatch = filters.position === "All" || filters.position.split("-").every((position) => positions.includes(position)); const min = filters.minPpg === "" ? null : Number(filters.minPpg); const max = filters.maxPpg === "" ? null : Number(filters.maxPpg); return (!filters.search || text.includes(filters.search.toLowerCase())) && positionMatch && (filters.team === "All" || p.team_name === filters.team) && (!Number.isFinite(min) || (p.ppg != null && Number(p.ppg) >= min)) && (!Number.isFinite(max) || (p.ppg != null && Number(p.ppg) <= max)); });
  const players = filterPool(pool);
  const combinedPlayerIds = filterPool(combinedPool).map((player) => Number(player.player_id));
  const teams = [...new Set(pool.map((p) => p.team_name).filter(Boolean))].sort();
  const teamBrowserGroups = getTeamBrowserTeams(teams);
  return <div className="page draft-players-page"><div className="draft-subnav"><Link href="/draft/board">Draft Board</Link><Link className="active" href="/draft/players">Player Focus</Link><Link href="/compare">Compare Players</Link></div><section className="draft-focus-hero"><div><span className="draft-countdown-kicker">Draft headquarters · Player focus</span><h1>Player Focus</h1><p>Research available players and keep both top 10 lists in view.</p></div><div className="draft-focus-count"><strong>{DRAFT_SEASON} Draft</strong><span>{DRAFT_SEASON}–{String(DRAFT_SEASON + 1).slice(-2)} player stats</span></div></section><PlayerPoolControls search={filters.search} hideDrafted={hideDrafted} /><TeamBrowser groups={teamBrowserGroups} query={params} selectedTeam={filters.team} /><details className="player-filter-disclosure"><summary>Filters <span>Position, team, and PPG range</span></summary><form id="player-focus-filters" className="filters" method="get"><div className="filter-card"><label>Position</label><select name="position" defaultValue={filters.position}><option>All</option><option>G</option><option>F</option><option>C</option><option>G-F</option><option>F-C</option></select></div><div className="filter-card"><label>Team</label><select name="team" defaultValue={filters.team}><option>All</option>{teams.map((team) => <option key={team}>{team}</option>)}</select></div><div className="filter-card"><label>PPG range</label><div className="ppg-range"><input name="min_ppg" type="number" step="0.1" placeholder="Min" defaultValue={filters.minPpg} /><input name="max_ppg" type="number" step="0.1" placeholder="Max" defaultValue={filters.maxPpg} /></div></div><div className="filter-card filter-submit"><button className="solid-pill" type="submit">Apply filters</button><a className="ghost-pill" href="/draft/players">Reset</a></div></form></details><PlayerFocusWorkspace players={players} combinedPlayerIds={combinedPlayerIds} combinedStats={combinedStats} pool={pool} includeExhibitions={includeExhibitions} draftedPlayerIds={[...draftedPlayerIds]} member={member} hideDrafted={hideDrafted} /></div>;
}
