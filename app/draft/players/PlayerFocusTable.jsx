"use client";

import { Fragment, useEffect, useState } from "react";

const number = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? "--" : Number(value).toFixed(1);
export const POOL_COLUMNS = [
  { key: "team_name", label: "Team" },
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
  { key: "shots_per_game", label: "Shots/G" }
];
const textColumns = new Set(["team_name", "position", "year", "stats_season", "games"]);
const displayValue = (player, key) => {
  if (textColumns.has(key)) return player[key] || "--";
  const value = number(player[key]);
  return value !== "--" && key.endsWith("_pct") ? `${value}%` : value;
};

export function PlayerFocusDetail({ player, statsMode }) {
  const [state, setState] = useState({ loading: true, games: [], shots: [], error: "" });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, games: [], shots: [], error: "" });
    Promise.all([
      fetch(`/api/player-detail?playerId=${player.player_id}&stats=${statsMode}`).then((response) => { if (!response.ok) throw new Error("Game log unavailable"); return response.json(); }),
      statsMode === 'exhibition' ? Promise.resolve({ shots: [] }) : fetch(`/api/player-shots?playerId=${player.player_id}`).then((response) => { if (!response.ok) throw new Error("Shot map unavailable"); return response.json(); })
    ]).then(([detail, shotData]) => {
      if (cancelled) return;
      const games = detail.games || [];
      const gameIds = new Set(games.map((game) => Number(game.game_id)));
      setState({ loading: false, games, shots: (shotData.shots || []).filter((shot) => gameIds.has(Number(shot.game_id))), error: "" });
    }).catch(() => { if (!cancelled) setState({ loading: false, games: [], shots: [], error: "Unable to load player details. Close and reopen to retry." }); });
    return () => { cancelled = true; };
  }, [player.player_id, statsMode]);
  if (state.loading) return <div className="player-focus-expanded"><span className="loading-line" /> Loading recent games{statsMode === 'exhibition' ? '...' : ' and shot map...'}</div>;
  return <div className="player-focus-expanded">{state.error && <p role="alert">{state.error}</p>}
    <div><h3>{statsMode === 'exhibition' ? 'Last 5 exhibition games' : 'Last 5 regular-season games'}</h3><div className="player-last-five">{state.games.length ? state.games.map((game) => <div className="player-game-mini" key={`${game.game_id}-${game.game_date}`}><strong>{game.game_date || "Game"}</strong><span className="player-game-opponent">{game.opponent_logo && <img src={game.opponent_logo} alt="" />}<b>{game.opponent_name || "Opponent"}{game.is_exhibition ? " (Exhibition)" : ""}</b></span><b>{game.pts ?? "—"} PTS</b><span>{number(game.minutes)} MIN</span><span>{game.fgm ?? "—"}/{game.fga ?? "—"} FG</span><span>{game.tpm ?? "—"}/{game.tpa ?? "—"} 3PT</span><span>{game.ftm ?? "—"}/{game.fta ?? "—"} FT</span></div>) : <span>No game log available.</span>}</div></div>
    {statsMode !== 'exhibition' && <div className="player-shot-map"><h3>Recent games shot map</h3><div className="shot-map-court">{state.shots.map((shot) => { const courtX = Math.min(100, Math.max(0, Number(shot.coord_x) / 50 * 100)); const courtY = Math.min(100, Math.max(0, (Number(shot.coord_y) + 1.25) / 47 * 100)); return <i key={shot.play_id} className={shot.result === "Made" ? "made" : "missed"} style={{ left: `${courtX}%`, top: `${courtY}%` }} title={`${shot.result} ${shot.shot_type}`} />; })}{!state.shots.length && <span className="shot-map-empty">No shot-location data available.</span>}</div><div className="shot-map-legend"><span className="made-key">○ Made</span><span className="missed-key">× Missed</span></div><small>{state.shots.length} recorded shots</small></div>}
  </div>;
}

export default function PlayerFocusTable({ players, columns, draftedPlayerIds, sort, onSort, member, shortlistIds = [], canAdd = false, onAdd, statsMode = 'regular' }) {
  const [expanded, setExpanded] = useState(null);
  const visibleColumns = POOL_COLUMNS.filter(({ key }) => columns.includes(key) && (key !== "games" || statsMode === "exhibition"));
  const header = ({ key, label }) => <th key={key} aria-sort={sort?.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="player-detail-button" type="button" onClick={() => onSort?.(key)}>{label}{sort?.key === key ? sort.direction === 'asc' ? ' +' : ' -' : ''}</button></th>;
    return <div className="table-scroll"><table className="table player-focus-table"><thead><tr>{header({ key: "name", label: "Player" })}{visibleColumns.map(header)}</tr></thead><tbody>{players.length === 0 ? <tr><td colSpan={visibleColumns.length + 1}>No players match these filters.</td></tr> : players.map((player) => { const drafted = draftedPlayerIds.includes(Number(player.player_id)); const open = expanded === player.player_id; return <Fragment key={player.player_id}><tr className={`${drafted ? "player-row-drafted" : ""} player-focus-clickable`} onClick={() => setExpanded(open ? null : player.player_id)}><td><div className="player-table-identity"><button type="button" className="shortlist-add" aria-label={`Add ${player.first_name || ""} ${player.last_name || ""} to my top 10`} title={shortlistIds.includes(Number(player.player_id)) ? "Already on your list" : member ? "Add to my top 10" : "Sign in to add players"} disabled={!canAdd || drafted || shortlistIds.includes(Number(player.player_id))} onClick={(event) => { event.stopPropagation(); onAdd?.(Number(player.player_id)); }}>{shortlistIds.includes(Number(player.player_id)) ? "Added" : "Add"}</button><span className="player-table-headshot">{player.headshot ? <img src={player.headshot} alt="" /> : "?"}</span><button type="button" className="player-detail-button" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setExpanded(open ? null : player.player_id); }}>{`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()}</button></div></td>{visibleColumns.map(({ key }) => <td key={key}>{displayValue(player, key)}</td>)}</tr>{open && <tr><td colSpan={visibleColumns.length + 1}><PlayerFocusDetail player={player} statsMode={statsMode} /></td></tr>}</Fragment>; })}</tbody></table></div>;
}
