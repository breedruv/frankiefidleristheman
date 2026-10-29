"use client";
import Link from "next/link";
import { DEFAULT_TEAMS, nextPick } from "../../lib/draftRules.mjs";

export function DraftPlayerPicker({ pickNumber, teamCode, roundNumber, query, onQueryChange, results, selected, onSelect, searchError, searching, saving, loadError, submitError, onSubmit, onCancel }) {
  const blocker = roundNumber === 0 && selected?.blockingOwner && selected.blockingOwner !== teamCode ? selected.blockingOwner : null;
  return <div className="draft-inline-picker" role="region" aria-label={`Select player for ${teamCode}, pick ${pickNumber}`}>
    <div className="draft-inline-picker-heading"><strong>Pick {pickNumber} · {teamCode}</strong><button type="button" className="draft-cell-cancel" disabled={saving} onClick={onCancel}>Cancel</button></div>
    <label htmlFor="draft-player-search">Search player or school</label>
    <input id="draft-player-search" autoFocus value={query} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }} placeholder="Search player or school..." autoComplete="off" />
    {searchError && <p role="alert">{searchError}</p>}
    {query.trim() && searching && !selected && <small>Searching players...</small>}
    {query.trim() && !searching && !results.length && !searchError && !selected && <small>No matching players.</small>}
    {results.length > 0 && !selected && <div className="draft-search-results">{results.map((player) => <button type="button" disabled={player.drafted} key={`${player.playerId}-${player.position}`} onClick={() => onSelect(player)}><span><strong>{player.name}</strong><small>{player.college} / {player.position}{player.drafted ? " / Drafted" : ""}{player.blockingOwner ? ` / ${player.blockingOwner} can retain` : " / Unrestricted"}</small></span></button>)}</div>}
    {selected && <div className="draft-selection-review"><div><strong>{selected.name}</strong><small>{selected.college} / Draft as {selected.position}</small></div><button type="button" className="solid-pill" disabled={saving || !!loadError} onClick={() => onSubmit(false)}>{saving ? "Saving..." : blocker ? "Allow selection" : "Submit pick"}</button>{blocker && <button type="button" className="ghost-pill" disabled={saving || !!loadError} onClick={() => onSubmit(true)}>{blocker} blocks and retains</button>}</div>}
    {submitError && <p role="alert">{submitError}</p>}
  </div>;
}

export default function DraftPickEntry({ history = null, picks = [], orders = { snake: DEFAULT_TEAMS, franchise: DEFAULT_TEAMS }, readOnly = false, openPicker = null, onOpenPicker, picker, message = "", canPick = true }) {
  const historyPicks = Object.values(history?.draftSlots || {}).map((p) => ({ pick_number: Number(p.pickNumber), round_number: Number(p.round), team_code: p.teamCode, player_name: p.name, drafted_position: p.position, player_id: p.playerId })).sort((a, b) => a.pick_number - b.pick_number);
  const displayed = history ? historyPicks : picks;
  const next = nextPick(displayed, orders.snake, orders.franchise);
  const retrying = !history && next && displayed.at(-1)?.blocked_team_code === next.teamCode;
  const timeline = displayed.slice(-2).map((player) => ({ pickNumber: player.pick_number, roundNumber: player.round_number, teamCode: player.team_code, player }));
  if (!history) {
    const projected = [...displayed];
    for (let i = 0; i < 3; i++) {
      const upcoming = nextPick(projected, orders.snake, orders.franchise);
      if (!upcoming) break;
      timeline.push({ ...upcoming, current: i === 0 });
      projected.push({ pick_number: upcoming.pickNumber, round_number: upcoming.roundNumber, team_code: upcoming.teamCode });
    }
  }
  const togglePicker = () => onOpenPicker("carousel");
  return <section className="draft-pick-entry">
    <div className="draft-carousel-heading"><span>Pick carousel</span>{!readOnly && <Link href="/draft/players">Player Focus</Link>}</div>
    <div className="draft-pick-timeline" aria-label="Draft pick timeline">{timeline.map((item) => {
      const current = item.current && !item.player && !history;
      const Card = current ? readOnly ? Link : "button" : "div";
      const action = current ? readOnly ? { href: "/login" } : { type: "button", disabled: !canPick, "aria-expanded": openPicker === "carousel", "aria-controls": "draft-player-search", onClick: togglePicker } : {};
      return <Card {...action} id={current ? "draft-carousel-current-pick" : undefined} className={`draft-pick-timeline-card ${current ? "is-current" : ""} ${item.player ? "is-complete" : "is-open"}`} key={item.pickNumber}>
        <span>Pick {item.pickNumber}{current ? " - On the clock" : ""}</span><strong>{item.teamCode}</strong><small>{item.roundNumber === 0 ? "Franchise round" : `Round ${item.roundNumber}`}</small>
        {item.player ? <><div className="draft-pick-timeline-player"><b>{item.player.player_name}</b></div><em>{item.player.drafted_position}</em>{item.player.blocked_team_code && <span className="draft-block-label">Blocked {item.player.blocked_team_code}</span>}</> : current ? <b>{readOnly ? "Sign in to select" : !canPick ? "Draft unavailable" : retrying ? "Choosing again · Search players" : "Choose player"}</b> : <b>Up next</b>}
      </Card>;
    })}</div>
    {!readOnly && next && openPicker === "carousel" && picker}
    {!next && !history && <p>Draft complete. All franchise and snake selections are recorded.</p>}
    {message && <p role="status" className="draft-pick-message">{message}</p>}
  </section>;
}
