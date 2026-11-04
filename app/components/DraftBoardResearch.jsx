"use client";

import { useState } from "react";
import { DEFAULT_TEAMS } from "../../lib/draftRules.mjs";

const stat = (value) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(1);

export default function DraftBoardResearch({ research, picks, teams = DEFAULT_TEAMS, error, onRefresh }) {
  const [teamFilter, setTeamFilter] = useState("All");
  const players = new Map(research?.players.map((player) => [Number(player.player_id), player]) || []);
  const drafted = new Map(picks.map((pick) => [Number(pick.player_id), pick]));
  const completed = new Set(picks.filter((pick) => Number(pick.round_number) === 0).map((pick) => pick.team_code));
  const franchisePlayers = (research?.players || []).filter((player) => player.previous_owner);
  const visiblePlayers = teamFilter === "All" ? franchisePlayers : franchisePlayers.filter((player) => player.previous_owner === teamFilter);

  return <section className="draft-research-section" aria-label="Draft night research">
    <div className="section-title"><div><h2>Draft night reference</h2><span className="section-subtitle">Both top 10 lists and players eligible for a franchise selection</span></div><button type="button" className="ghost-pill" onClick={onRefresh}>Refresh lists</button></div>
    {error && <p role="alert" className="workspace-error">{error}</p>}
    {!research ? !error && <p>Loading lists and franchise players...</p> : <>
      <div className="draft-research-lists">{research.lists.map((list) => <section key={list.owner_name} aria-label={`${list.owner_name} top 10`}><h3>{list.owner_name}’s top 10</h3>{!list.player_ids.length ? <p>No players added yet.</p> : <ol>{list.player_ids.map((id) => {
        const player = players.get(Number(id));
        const pick = drafted.get(Number(id));
        return <li key={id} className={pick ? "draft-franchise-muted" : ""}><strong>{player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : research.missingNames?.[id] || `Player ${id}`}</strong><span> · {player?.team_name || "Outside current pool"} · {stat(player?.ppg)} PPG{pick ? ` · Drafted by ${pick.team_code}` : ""}</span></li>;
      })}</ol>}</section>)}</div>
      <div className="section-title"><div><h2>Previous roster franchise options</h2><span className="section-subtitle">{franchisePlayers.length} players in the current pool · {research.excludedCount} previous-roster players outside the pool</span></div></div>
      <nav className="draft-franchise-filter" aria-label="Filter by previous fantasy team">{["All", ...teams].map((team) => <button key={team} type="button" aria-pressed={teamFilter === team} className={teamFilter === team ? "active" : ""} onClick={() => setTeamFilter(team)}>{team === "All" ? "All teams" : team}<span>{team === "All" ? franchisePlayers.length : franchisePlayers.filter((player) => player.previous_owner === team).length}</span></button>)}</nav>
      <div className="table-scroll draft-franchise-table"><table className="table"><thead><tr><th>Player</th><th>2025 owner</th><th>Pos</th><th>PPG</th><th>MPG</th><th>FGM/FGA</th><th>3PM/3PA</th><th>Last 5</th><th>Status</th></tr></thead><tbody>{visiblePlayers.length ? visiblePlayers.map((player) => {
        const pick = drafted.get(Number(player.player_id));
        const status = pick ? "drafted" : completed.has(player.previous_owner) ? "unrestricted" : "franchiseable";
        return <tr key={player.player_id} className={`draft-franchise-${status}`}><td><div className="draft-franchise-player"><span className="draft-franchise-avatar">{player.headshot ? <img src={player.headshot} alt="" /> : "?"}</span><span><strong>{`${player.first_name || ""} ${player.last_name || ""}`.trim()}</strong><small>{player.team_name || "College unavailable"}</small></span></div></td><td><span className="draft-owner-badge">{player.previous_owner}</span></td><td>{player.position || "—"}</td><td>{stat(player.ppg)}</td><td>{stat(player.mpg)}</td><td>{stat(player.fgm)}/{stat(player.fga)}</td><td>{stat(player.tpm)}/{stat(player.tpa)}</td><td>{stat(player.last5_ppg)}</td><td><span className={`draft-status-badge ${status}`}>{pick ? `Drafted · ${pick.team_code}` : status === "unrestricted" ? "Unrestricted" : "Franchiseable"}</span></td></tr>;
      }) : <tr><td colSpan={9}>No players from this team are in the current pool.</td></tr>}</tbody></table></div>
    </>}
  </section>;
}
