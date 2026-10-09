"use client";

import { useEffect, useState } from "react";

const teams = ["MB", "AS", "SL", "DD", "Len", "Brandon", "John B", "BJ"];
const rounds = ["Franchise Round", ...Array.from({ length: 17 }, (_, index) => `Round ${index + 1}`)];
const rosterGroups = [
  { label: "Centers", short: "C", count: 3, className: "center" },
  { label: "Forwards", short: "F", count: 5, className: "forward" },
  { label: "Guards", short: "G", count: 5, className: "guard" },
  { label: "Supplemental", short: "SUP", count: 5, className: "supplemental" }
];

function PlayerCard({ player, supplemental = false }) {
  if (!player) return <div className="draft-player-card draft-player-card-empty"><div className="draft-player-avatar">+</div><div><strong>Open pick</strong><span>{supplemental ? "Any position" : "Player slot"}</span></div></div>;
  const headshot = player.playerId ? `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${player.playerId}.png` : null;
  return <div className={`draft-player-card draft-player-card-filled position-${String(player.position || "").toLowerCase()}`}><div className="draft-player-avatar">{headshot ? <img src={headshot} alt="" /> : "?"}</div><div><strong>{player.name}</strong><span>{player.position} · {player.college}</span></div></div>;
}

export default function DraftBoardLayout({ history }) {
  const [view, setView] = useState("draft");
  const [savedPicks, setSavedPicks] = useState([]);
  useEffect(() => { const load = () => fetch("/api/draft-picks").then((response) => response.json()).then((data) => setSavedPicks(data.picks || [])); load(); window.addEventListener("draft-pick-saved", load); return () => window.removeEventListener("draft-pick-saved", load); }, []);
  const currentHistory = savedPicks.reduce((map, pick) => { map[`${pick.round_number}-${pick.team_code}`] = { name: pick.player_name, position: pick.drafted_position, college: pick.college_team_name, playerId: pick.player_id }; return map; }, history?.draftSlots || {});
  const currentRoster = savedPicks.reduce((map, pick) => { const group = pick.round_number >= 13 ? "SUP" : pick.drafted_position; const key = `${pick.team_code}-${group}`; const slot = map[key] || 0; map[`${group}-${pick.team_code}-${slot}`] = { name: pick.player_name, position: pick.drafted_position, college: pick.college_team_name, playerId: pick.player_id }; map[key] = slot + 1; return map; }, { ...history?.rosterSlots });
  return (
    <section className="draft-board-section">
      <div className="draft-board-heading">
        <div>
          <span className="draft-countdown-kicker">Draft order</span>
          <h2>Board format</h2>
        </div>
        <div className="draft-board-toggle"><button type="button" className={view === "draft" ? "active" : ""} onClick={() => setView("draft")}>Draft view</button><button type="button" className={view === "roster" ? "active" : ""} onClick={() => setView("roster")}>Roster view</button></div>
      </div>
      <div className="draft-board-scroll">
        {view === "draft" ? <div className="draft-board-grid" style={{ "--draft-team-count": teams.length }}>
          <div className="draft-board-corner">Round</div>
          {teams.map((team, index) => <div className="draft-board-team" key={team}><span>Team {index + 1}</span><strong>{team}</strong></div>)}
          {rounds.map((round) => <div className="draft-board-row" key={round}>
            <div className={`draft-board-round ${round === "Franchise Round" ? "is-franchise" : ""}`}><strong>{round === "Franchise Round" ? "FR" : round.replace("Round ", "R")}</strong><span>{round}</span></div>
            {teams.map((team) => <div className="draft-board-cell" key={`${round}-${team}`}><PlayerCard player={currentHistory[`${rounds.indexOf(round)}-${team}`]} /></div>)}
          </div>)}
        </div> : <div className="draft-board-grid roster-board-grid" style={{ "--draft-team-count": teams.length }}>
          <div className="draft-board-corner">Roster</div>
          {teams.map((team, index) => <div className="draft-board-team" key={team}><span>Team {index + 1}</span><strong>{team}</strong></div>)}
          {rosterGroups.map((group) => Array.from({ length: group.count }, (_, index) => <div className={`draft-board-row ${index === 0 ? "roster-row-start" : ""}`} key={`${group.short}-${index}`}>
            <div className={`draft-board-round roster-group-${group.className}`}><strong>{group.short}</strong><span>{group.label} {index + 1}</span></div>
            {teams.map((team) => <div className={`draft-board-cell roster-cell-${group.className}`} key={`${group.short}-${index}-${team}`}><PlayerCard supplemental={group.short === "SUP"} player={currentRoster[`${group.short}-${team}-${index}`]} /></div>)}
          </div>))}
        </div>}
      </div>
    </section>
  );
}

