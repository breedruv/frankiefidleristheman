"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { nextPick } from "../../lib/draftRules.mjs";

const defaultTeams = ["MB", "AS", "SL", "DD", "Len", "Brandon", "John B", "BJ"];
const rounds = ["Franchise Round", ...Array.from({ length: 17 }, (_, index) => `Round ${index + 1}`)];
const rosterGroups = [
  { label: "Centers", short: "C", count: 3, className: "center" },
  { label: "Forwards", short: "F", count: 5, className: "forward" },
  { label: "Guards", short: "G", count: 5, className: "guard" }
];

function PlayerCard({ player, supplemental = false, emptyLabel = "Open pick" }) {
  if (!player) return <div className="draft-player-card draft-player-card-empty"><div className="draft-player-avatar">+</div><div><strong>{emptyLabel}</strong><span>{supplemental ? "Any position" : "Player slot"}</span></div></div>;
  const headshot = player.playerId ? `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${player.playerId}.png` : null;
  return <div className={`draft-player-card draft-player-card-filled position-${String(player.position || "").toLowerCase()}`}><div className="draft-player-avatar">{headshot ? <img src={headshot} alt="" /> : "?"}</div><div><strong>{player.name}</strong><span>{player.position} · {player.college}</span></div></div>;
}

function TeamHeader({ team, index, counts = null }) {
  const limitsComplete = counts?.coreTotal >= 13;
  return <div className="draft-board-team" key={team}><span>Team {index + 1}</span><strong>{team}</strong>{counts && <small className="draft-team-limits">{limitsComplete ? `C ${counts.C} · F ${counts.F} · G ${counts.G}` : `C ${counts.C}/3 · F ${counts.F}/5 · G ${counts.G}/5`}</small>}</div>;
}

function EditPickCell({ roundNumber, player }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [block, setBlock] = useState(Boolean(player.blockedTeam));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const pickNumber = Number(player.pickNumber);
  useEffect(() => {
    if (!open || !query.trim()) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/draft-players?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setResults(data.players);
      } catch (error) { if (error.name !== 'AbortError') setMessage(error.message || 'Unable to search.'); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query]);
  async function mutate(method) {
    if (saving) return;
    if (method === 'DELETE' && !window.confirm(`Undo ${player.name} at pick ${pickNumber}? Only the latest selection can be undone.`)) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/draft-picks', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pickNumber, playerId: selected?.playerId, draftedPosition: selected?.position, block }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOpen(false); setSelected(null); setQuery(''); setResults([]);
      window.dispatchEvent(new Event('draft-pick-saved'));
    } catch (error) { setMessage(error.message || 'Unable to save. Try again.'); }
    finally { setSaving(false); }
  }
  if (!open) return <button type="button" className="draft-edit-cell" aria-label={`Edit ${player.name}`} onClick={() => setOpen(true)}><PlayerCard player={player} /></button>;
  return <div className="draft-inline-cell-search"><strong>Edit pick {pickNumber}</strong><input autoFocus aria-label="Search replacement player" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Search replacement..." />
    {results.length > 0 && <div className="draft-cell-search-results">{results.map((candidate) => <button type="button" key={`${candidate.playerId}-${candidate.position}`} disabled={candidate.drafted && candidate.playerId !== Number(player.playerId)} className={selected?.playerId === candidate.playerId && selected?.position === candidate.position ? 'selected' : ''} onClick={() => { setSelected(candidate); setResults([]); }}><strong>{candidate.name}</strong><span>{candidate.college} / {candidate.position}</span></button>)}</div>}
    {selected && <><strong>{selected.name} / {selected.position}</strong>{roundNumber === 0 && <label><input type="checkbox" checked={block} onChange={(event) => setBlock(event.target.checked)} /> Record as a block by previous owner{selected.previousOwner ? ` (${selected.previousOwner})` : ''}</label>}<button type="button" className="solid-pill" disabled={saving} onClick={() => mutate('PATCH')}>{saving ? 'Saving...' : 'Save correction'}</button></>}
    <button type="button" className="draft-delete-pick" disabled={saving} onClick={() => mutate('DELETE')}>Undo pick</button>{message && <small role="alert">{message}</small>}<button type="button" className="draft-cell-cancel" onClick={() => setOpen(false)}>Cancel</button>
  </div>;
}

export default function DraftBoardLayout({ history, readOnly = false, picks = [], orders = { snake: defaultTeams, franchise: defaultTeams }, openPicker = null, onOpenPicker, picker, canPick = true }) {
  const [view, setView] = useState("draft");
  const teams = orders.snake;
  const franchiseTeams = orders.franchise;
  const currentHistory = (history ? [] : picks).reduce((map, pick) => { map[`${pick.round_number}-${pick.team_code}`] = { name: pick.player_name, position: pick.drafted_position, college: pick.college_team_name, playerId: pick.player_id, pickNumber: pick.pick_number, blockedTeam: pick.blocked_team_code }; return map; }, { ...history?.draftSlots });
  const currentRoster = (history ? [] : picks).reduce((map, pick) => { const group = pick.drafted_position; const key = `${pick.team_code}-${group}`; const slot = map[key] || 0; map[`${group}-${pick.team_code}-${slot}`] = { name: pick.player_name, position: pick.drafted_position, college: pick.college_team_name, playerId: pick.player_id, pickNumber: pick.pick_number, blockedTeam: pick.blocked_team_code }; map[key] = slot + 1; return map; }, { ...history?.rosterSlots });
  const teamCounts = teams.reduce((all, team) => { all[team] = { coreTotal: 0, C: 0, F: 0, G: 0, SUP: 0 }; return all; }, {});
  Object.entries(currentHistory).forEach(([key, player]) => { const [round, team] = key.split("-"); if (!teamCounts[team]) return; if (Number(round) <= 12) teamCounts[team].coreTotal += 1; const group = player.position; if (teamCounts[team][group] !== undefined) teamCounts[team][group] += 1; });
  const next = nextPick(picks, teams, franchiseTeams);
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
          {teams.map((team, index) => <TeamHeader key={team} team={team} index={index} counts={teamCounts[team]} />)}
          {rounds.map((round) => {
            const roundNumber = rounds.indexOf(round);
            const activeRound = openPicker === "board" && next?.roundNumber === roundNumber;
            return <Fragment key={round}>
              <div className="draft-board-row">
                <div className={`draft-board-round ${round === "Franchise Round" ? "is-franchise" : ""}`}><strong>{round === "Franchise Round" ? "FR" : round.replace("Round ", "R")}</strong><span>{round}</span></div>
                {teams.map((team) => {
                  const player = currentHistory[`${roundNumber}-${team}`];
                  const status = !history && next?.roundNumber === roundNumber && next?.teamCode === team ? "is-on-clock" : "";
                  const actionable = !player && !!status;
                  return <div className={`draft-board-cell ${actionable ? "is-open-pick" : ""} ${status}`} key={`${round}-${team}`}>
                    {player ? history || readOnly ? <PlayerCard player={player} /> : <EditPickCell roundNumber={roundNumber} teamCode={team} player={player} teamOrder={teams} franchiseTeams={franchiseTeams} />
                      : actionable ? readOnly ? <Link href="/login" className="draft-open-pick-button draft-edit-cell" aria-label={`Sign in to select player for ${team}, pick ${next.pickNumber}`}><PlayerCard player={null} emptyLabel="Select player" /></Link>
                        : <button id="draft-board-current-pick" type="button" className="draft-open-pick-button draft-edit-cell" aria-expanded={openPicker === "board"} aria-controls="draft-player-search" aria-label={`Select player for ${team}, pick ${next.pickNumber}`} disabled={!canPick} onClick={() => onOpenPicker("board")}><PlayerCard player={null} emptyLabel={!canPick ? "Draft unavailable" : openPicker === "board" ? "Search below" : "Select player"} /></button>
                      : <PlayerCard player={null} emptyLabel="Upcoming" />}
                  </div>;
                })}
              </div>
              {activeRound && <div className="draft-board-picker-row" style={{ "--picker-align": teams.indexOf(next.teamCode) < 3 ? "start" : teams.indexOf(next.teamCode) > 4 ? "end" : "center" }}><strong>Pick {next.pickNumber} · {next.teamCode}</strong>{picker}</div>}
            </Fragment>;
          })}
        </div> : <div className="draft-board-grid roster-board-grid" style={{ "--draft-team-count": teams.length }}>
          <div className="draft-board-corner">Roster</div>
          {teams.map((team, index) => <TeamHeader key={team} team={team} index={index} counts={teamCounts[team]} />)}
          {rosterGroups.map((group) => Array.from({ length: group.count }, (_, index) => <div className={`draft-board-row ${index === 0 ? "roster-row-start" : ""}`} key={`${group.short}-${index}`}>
            <div className={`draft-board-round roster-group-${group.className}`}><strong>{group.short}</strong><span>{group.label} {index + 1}</span></div>
            {teams.map((team) => { const player = currentRoster[`${group.short}-${team}-${index}`]; return <div className={`draft-board-cell roster-cell-${group.className}`} key={`${group.short}-${index}-${team}`}><PlayerCard supplemental={false} player={player} emptyLabel="Empty slot" /></div>; })}
          </div>))}
        </div>}
      </div>
    </section>
  );
}

