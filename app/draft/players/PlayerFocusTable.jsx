"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AvailabilityBadge, { AvailabilityPanel } from "../../components/AvailabilityBadge";
import { formatHeight } from "../../../lib/sourceProfiles.mjs";
import { DRAFT_SEASON } from "../../../lib/draftRules.mjs";

// Previous ESPN season label, e.g. "25-26" (ESPN season DRAFT_SEASON).
const PRIOR = `${String(DRAFT_SEASON - 1).slice(-2)}-${String(DRAFT_SEASON).slice(-2)}`;
const number = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? "--" : Number(value).toFixed(1);
export const POOL_COLUMNS = [
  { key: "team_name", label: "Team" },
  { key: "kenpom_rank", label: "KenPom" },
  { key: "position", label: "Position" },
  { key: "year", label: "Year" },
  { key: "stats_season", label: "ESPN Season" },
  { key: "games", label: "GP" },
  { key: "ppg", label: "PPG" },
  { key: "last5_ppg", label: "Last 5 PPG" },
  { key: "mpg", label: "MPG" },
  { key: "fgm", label: "FGM/G" },
  { key: "tpm", label: "3PM/G" },
  { key: "tpa", label: "3PA/G" },
  { key: "three_pct", label: "3PT%" },
  { key: "ft_pct", label: "FT%" },
  { key: "shots_per_game", label: "Shots/G" },
  { key: "prev_games", label: `${PRIOR} GP` },
  { key: "prev_starts", label: `${PRIOR} GS` },
  { key: "prev_ppg", label: `${PRIOR} PPG` },
  { key: "prev_mpg", label: `${PRIOR} MPG` },
  { key: "prev_last5_ppg", label: `${PRIOR} Last 5` },
  { key: "lindys_top150_rank", label: "Lindy's Top 150" },
  { key: "lindys_freshmen_rank", label: "Lindy's Top Fr" },
  { key: "espn_top100_rank", label: "ESPN 100 ('26)" }
];
const textColumns = new Set(["team_name", "position", "year", "stats_season", "games", "prev_games", "prev_starts"]);
const displayValue = (player, key) => {
  if (textColumns.has(key)) return (player[key] ?? "") === "" ? "--" : player[key];
  if (key.endsWith("_rank")) return player[key] ? `#${player[key]}` : "--";
  const value = number(player[key]);
  return value !== "--" && key.endsWith("_pct") ? `${value}%` : value;
};

const gameMini = (game) => <div className="player-game-mini" key={`${game.game_id}-${game.game_date}`}><strong>{game.game_date || "Game"}</strong><span className="player-game-opponent">{game.opponent_logo && <img src={game.opponent_logo} alt="" />}<b>{game.opponent_name || "Opponent"}{game.is_exhibition ? " (Exhibition)" : ""}</b></span><b>{game.pts ?? "—"} PTS</b><span>{number(game.minutes)} MIN{game.starter == null ? "" : game.starter ? " · Started" : " · Bench"}</span><span>{game.fgm ?? "—"}/{game.fga ?? "—"} FG</span><span>{game.tpm ?? "—"}/{game.tpa ?? "—"} 3PT</span><span>{game.ftm ?? "—"}/{game.fta ?? "—"} FT</span></div>;

function PlayerSourceLinks({ player }) {
  const urls = player.source_profile?.sourceUrls || {};
  const espnUrl = Number(player.player_id) > 0 ? `https://www.espn.com/mens-college-basketball/player/_/id/${player.player_id}` : urls.espn;
  const links = [["ESPN", espnUrl], ["CBS", urls.cbs], ["Yahoo", urls.yahoo], ["RotoWire", player.rotowire_url]].filter(([, url]) => url);
  if (!links.length) return null;
  return <div className="player-source-links"><b>Player pages</b>{links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}</a>)}</div>;
}

export function PlayerFocusDetail({ player, statsMode, canFlag = false, onFlagChange }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, games: [], priorGames: [], shots: [], error: "" });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, games: [], priorGames: [], shots: [], error: "" });
    Promise.all([
      fetch(`/api/player-detail?playerId=${player.player_id}&stats=${statsMode}`).then((response) => { if (!response.ok) throw new Error("Game log unavailable"); return response.json(); }),
      fetch(`/api/player-detail?playerId=${player.player_id}&stats=regular&season=${DRAFT_SEASON}`).then((response) => response.ok ? response.json() : { games: [] }).catch(() => ({ games: [] })),
      statsMode === 'exhibition' ? Promise.resolve({ shots: [] }) : fetch(`/api/player-shots?playerId=${player.player_id}`).then((response) => { if (!response.ok) throw new Error("Shot map unavailable"); return response.json(); })
    ]).then(([detail, prior, shotData]) => {
      if (cancelled) return;
      const games = detail.games || [];
      const gameIds = new Set(games.map((game) => Number(game.game_id)));
      setState({ loading: false, games, priorGames: prior.games || [], shots: (shotData.shots || []).filter((shot) => gameIds.has(Number(shot.game_id))), error: "" });
    }).catch(() => { if (!cancelled) setState({ loading: false, games: [], priorGames: [], shots: [], error: "Unable to load player details. Close and reopen to retry." }); });
    return () => { cancelled = true; };
  }, [player.player_id, statsMode]);
  if (state.loading) return <div className="player-focus-expanded"><span className="loading-line" /> Loading recent games{statsMode === 'exhibition' ? '...' : ' and shot map...'}</div>;
  return <div className="player-focus-expanded"><AvailabilityPanel player={player} canFlag={canFlag} onChange={onFlagChange || (() => router.refresh())} />{player.source_profile && <div className="source-profile"><span><b>Eligible</b> {player.source_profile.positionSummary}</span>{player.source_profile.height && <span><b>Height</b> {formatHeight(player.source_profile.height)} ({player.source_profile.heightSources.join(", ")})</span>}<span><b>Listed by</b> {player.source_profile.sources.join(", ")}</span>{(player.lindys_top150_rank || player.lindys_freshmen_rank) ? <span><b>Lindy's</b> {[player.lindys_top150_rank && `#${player.lindys_top150_rank} of top 150`, player.lindys_freshmen_rank && `#${player.lindys_freshmen_rank} freshman`].filter(Boolean).join(" · ")}</span> : null}{player.espn_top100_rank ? <span><b>ESPN 100</b> #{player.espn_top100_rank} (class of 2026)</span> : null}{player.kenpom ? <span><b>KenPom</b> #{player.kenpom.rank} {player.team_name} · NetRtg {Number(player.kenpom.net_rtg) > 0 ? "+" : ""}{player.kenpom.net_rtg} · ORtg {player.kenpom.ortg} (#{player.kenpom.ortg_rank}) · DRtg {player.kenpom.drtg} (#{player.kenpom.drtg_rank}) · Tempo {player.kenpom.adj_tempo} (#{player.kenpom.adj_tempo_rank}) · as of {player.kenpom.rating_date}</span> : null}</div>}<PlayerSourceLinks player={player} />{state.error && <p role="alert">{state.error}</p>}
    <div><h3>{statsMode === 'combined' ? 'Last 5 games (including exhibitions)' : statsMode === 'exhibition' ? 'Last 5 exhibition games' : 'Last 5 regular-season games'}</h3><div className="player-last-five">{state.games.length ? state.games.map(gameMini) : <span>No game log available.</span>}</div></div>
    <div><h3>{PRIOR} last 5 regular-season games</h3><div className="player-last-five">{state.priorGames.length ? state.priorGames.map(gameMini) : <span>No {PRIOR} games.</span>}</div></div>
    {statsMode !== 'exhibition' && <div className="player-shot-map"><h3>{statsMode === 'combined' ? 'Regular-season shots from recent games' : 'Recent games shot map'}</h3><div className="shot-map-court">{state.shots.map((shot) => { const courtX = Math.min(100, Math.max(0, Number(shot.coord_x) / 50 * 100)); const courtY = Math.min(100, Math.max(0, (Number(shot.coord_y) + 1.25) / 47 * 100)); return <i key={shot.play_id} className={shot.result === "Made" ? "made" : "missed"} style={{ left: `${courtX}%`, top: `${courtY}%` }} title={`${shot.result} ${shot.shot_type}`} />; })}{!state.shots.length && <span className="shot-map-empty">No shot-location data available.</span>}</div><div className="shot-map-legend"><span className="made-key">○ Made</span><span className="missed-key">× Missed</span></div><small>{state.shots.length} recorded shots</small></div>}
  </div>;
}

export default function PlayerFocusTable({ players, columns, draftedPlayerIds, sort, onSort, member, shortlistIds = [], canAdd = false, onAdd, statsMode = 'regular' }) {
  const [expanded, setExpanded] = useState(null);
  const visibleColumns = POOL_COLUMNS.filter(({ key }) => columns.includes(key) && (key !== "games" || statsMode !== "regular"));
  const header = ({ key, label }) => <th key={key} aria-sort={sort?.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="player-detail-button" type="button" onClick={() => onSort?.(key)}>{label}{sort?.key === key ? sort.direction === 'asc' ? ' +' : ' -' : ''}</button></th>;
    return <div className="table-scroll"><table className="table player-focus-table"><thead><tr>{header({ key: "name", label: "Player" })}{visibleColumns.map(header)}</tr></thead><tbody>{players.length === 0 ? <tr><td colSpan={visibleColumns.length + 1}>No players match these filters.</td></tr> : players.map((player) => { const drafted = draftedPlayerIds.includes(Number(player.player_id)); const open = expanded === player.player_id; return <Fragment key={player.player_id}><tr className={`${drafted ? "player-row-drafted" : ""} player-focus-clickable`} onClick={() => setExpanded(open ? null : player.player_id)}><td><div className="player-table-identity"><button type="button" className="shortlist-add" aria-label={`Add ${player.first_name || ""} ${player.last_name || ""} to my top 10`} title={shortlistIds.includes(Number(player.player_id)) ? "Already on your list" : member ? "Add to my top 10" : "Sign in to add players"} disabled={!canAdd || drafted || shortlistIds.includes(Number(player.player_id))} onClick={(event) => { event.stopPropagation(); onAdd?.(Number(player.player_id)); }}>{shortlistIds.includes(Number(player.player_id)) ? "Added" : "Add"}</button><span className="player-table-headshot">{player.headshot ? <img src={player.headshot} alt="" /> : "?"}</span><button type="button" className="player-detail-button" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setExpanded(open ? null : player.player_id); }}>{`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()}</button><AvailabilityBadge availability={player.availability} /></div></td>{visibleColumns.map(({ key }) => <td key={key}>{displayValue(player, key)}</td>)}</tr>{open && <tr><td colSpan={visibleColumns.length + 1}><PlayerFocusDetail player={player} statsMode={statsMode} canFlag={!!member} /></td></tr>}</Fragment>; })}</tbody></table></div>;
}
