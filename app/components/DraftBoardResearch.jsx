"use client";

import { DEFAULT_TEAMS } from "../../lib/draftRules.mjs";

const stat = (value) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(1);

export default function DraftBoardResearch({ research, picks, teams = DEFAULT_TEAMS, error, onRefresh }) {
  const players = new Map(research?.players.map((player) => [Number(player.player_id), player]) || []);
  const drafted = new Map(picks.map((pick) => [Number(pick.player_id), pick]));
  const completed = new Set(picks.filter((pick) => Number(pick.round_number) === 0).map((pick) => pick.team_code));
  const owners = teams.map((team) => ({ team, roster: (research?.players || []).filter((player) => player.previous_owner === team) }));

  return <section className="draft-research-section" aria-label="Draft night research">
    <div className="section-title"><div><h2>Draft night reference</h2><span className="section-subtitle">Both top 10 lists and players eligible for a franchise selection</span></div><button type="button" className="ghost-pill" onClick={onRefresh}>Refresh lists</button></div>
    {error && <p role="alert" className="workspace-error">{error}</p>}
    {!research ? !error && <p>Loading lists and franchise players...</p> : <>
      <div className="draft-research-lists">{research.lists.map((list) => <section key={list.owner_name} aria-label={`${list.owner_name} top 10`}><h3>{list.owner_name}’s top 10</h3>{!list.player_ids.length ? <p>No players added yet.</p> : <ol>{list.player_ids.map((id) => {
        const player = players.get(Number(id));
        const pick = drafted.get(Number(id));
        return <li key={id} className={pick ? "draft-franchise-muted" : ""}><strong>{player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : research.missingNames?.[id] || `Player ${id}`}</strong><span> · {player?.team_name || "Outside current pool"} · {stat(player?.ppg)} PPG{pick ? ` · Drafted by ${pick.team_code}` : ""}</span></li>;
      })}</ol>}</section>)}</div>
      <div className="section-title"><div><h2>Previous roster franchise options</h2><span className="section-subtitle">Only players still in the current ESPN pool can be selected. {research.excludedCount} previous-roster players are outside that pool.</span></div></div>
      <div className="draft-franchise-groups">{owners.map(({ team, roster }) => {
        const available = roster.filter((player) => !drafted.has(Number(player.player_id)) && !completed.has(team));
        return <details className="draft-franchise-team" key={team}>
          <summary className="draft-franchise-summary"><span>{team}{completed.has(team) ? " · Franchise pick complete" : ""}</span><span>{available.length} franchiseable · {roster.length} in pool</span></summary>
          {!roster.length ? <p>No prior roster players in the current pool.</p> : <div className="table-scroll"><table className="table"><thead><tr><th>Player</th><th>College</th><th>Pos</th><th>PPG</th><th>MPG</th><th>FGM/FGA</th><th>3PM/3PA</th><th>Last 5</th><th>Status</th></tr></thead><tbody>{roster.map((player) => {
            const pick = drafted.get(Number(player.player_id));
            const status = pick ? `Drafted · ${pick.team_code}` : completed.has(team) ? "Unrestricted" : "Can retain/block";
            return <tr key={player.player_id} className={pick || completed.has(team) ? "draft-franchise-muted" : ""}><td><strong>{`${player.first_name || ""} ${player.last_name || ""}`.trim()}</strong></td><td>{player.team_name || "—"}</td><td>{player.position || "—"}</td><td>{stat(player.ppg)}</td><td>{stat(player.mpg)}</td><td>{stat(player.fgm)}/{stat(player.fga)}</td><td>{stat(player.tpm)}/{stat(player.tpa)}</td><td>{stat(player.last5_ppg)}</td><td>{status}</td></tr>;
          })}</tbody></table></div>}
        </details>;
      })}</div>
    </>}
  </section>;
}
