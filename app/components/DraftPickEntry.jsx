"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DEFAULT_TEAMS, draftOrders, nextPick } from "../../lib/draftRules.mjs";

export default function DraftPickEntry({ history = null, readOnly = false }) {
  const [picks, setPicks] = useState([]);
  const [orders, setOrders] = useState({ snake: DEFAULT_TEAMS, franchise: DEFAULT_TEAMS });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [searchError, setSearchError] = useState("");
  const currentCardRef = useRef(null);
  const historyPicks = useMemo(() => Object.values(history?.draftSlots || {}).map((p) => ({ pick_number: Number(p.pickNumber), round_number: Number(p.round), team_code: p.teamCode, player_name: p.name, drafted_position: p.position, player_id: p.playerId })).sort((a, b) => a.pick_number - b.pick_number), [history]);
  const displayed = history ? historyPicks : picks;
  const next = nextPick(displayed, orders.snake, orders.franchise);
  const retrying = !history && next && displayed.at(-1)?.blocked_team_code === next.teamCode;
  useEffect(() => {
    setSelected(null); setQuery(''); setResults([]); setSearchError('');
  }, [next?.pickNumber, next?.teamCode]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [configResponse, picksResponse] = await Promise.all([fetch('/api/draft-config'), history ? Promise.resolve(null) : fetch('/api/draft-picks')]);
        if (!configResponse.ok || (picksResponse && !picksResponse.ok)) throw new Error();
        const config = await configResponse.json();
        const data = picksResponse ? await picksResponse.json() : null;
        if (!cancelled) { setOrders(draftOrders(config.snakeOrder)); if (data) setPicks(data.picks); setLoadError(''); }
      } catch { if (!cancelled) setLoadError('Unable to refresh draft state. Pick entry is paused until it reconnects.'); }
    }
    load();
    const timer = setInterval(load, 5000);
    window.addEventListener('draft-pick-saved', load);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('draft-pick-saved', load); };
  }, [history]);

  useEffect(() => {
    if (readOnly || !query.trim()) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/draft-players?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setResults(data.players); setSearchError('');
      } catch (err) { if (err.name !== 'AbortError') { setResults([]); setSearchError(err.message || 'Unable to search.'); } }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, readOnly]);

  async function submit(block = false) {
    if (!selected || !next || saving || loadError) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/draft-picks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...next, block, playerId: selected.playerId, draftedPosition: selected.position }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPicks((current) => [...current.filter((p) => p.pick_number !== data.pick.pick_number), data.pick].sort((a,b) => a.pick_number-b.pick_number));
      setSelected(null); setQuery(''); setResults([]);
      setMessage(block ? `${data.pick.team_code} retained ${selected.name}. ${next.teamCode} chooses again.` : `Pick ${next.pickNumber}: ${data.pick.team_code} selected ${selected.name}.`);
    } catch (err) { setMessage(err.message || 'Unable to save. Please retry.'); }
    finally { setSaving(false); window.dispatchEvent(new Event('draft-pick-saved')); }
  }

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
  const eligibleBlocker = next?.roundNumber === 0 && selected?.blockingOwner && selected.blockingOwner !== next.teamCode ? selected.blockingOwner : null;
  return <section className="draft-pick-entry">
    <div className="draft-carousel-heading"><span>Pick carousel</span><div>{!readOnly && <Link href="/draft/players">Player Focus</Link>}<button type="button" onClick={() => currentCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })}>Current pick</button></div></div>
    {loadError && <p role="alert">{loadError}</p>}
    <div className="draft-pick-timeline" aria-label="Draft pick timeline">{timeline.map((item) => <div ref={item.current ? currentCardRef : null} className={`draft-pick-timeline-card ${item.current ? 'is-current' : ''} ${item.player ? 'is-complete' : 'is-open'}`} key={item.pickNumber}>
      <span>Pick {item.pickNumber}{item.current ? ' - On the clock' : ''}</span><strong>{item.teamCode}</strong><small>{item.roundNumber === 0 ? 'Franchise round' : `Round ${item.roundNumber}`}</small>
      {item.player ? <><div className="draft-pick-timeline-player"><b>{item.player.player_name}</b></div><em>{item.player.drafted_position}</em>{item.player.blocked_team_code && <span className="draft-block-label">Blocked {item.player.blocked_team_code}</span>}</> : <b>{item.current && retrying ? 'Choosing again' : item.current ? 'Choosing now' : 'Up next'}</b>}
    </div>)}</div>
    {!next && !history && <p>Draft complete. All franchise and snake selections are recorded.</p>}
    {!readOnly && next && <div className="draft-entry-controls"><div className="draft-pick-inline-search"><label htmlFor="draft-player-search">Record {next.teamCode}'s selection<input id="draft-player-search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Search player or school..." autoComplete="off" /></label>
      {results.length > 0 && !selected && <div className="draft-search-results">{results.map((player) => <button type="button" disabled={player.drafted} key={`${player.playerId}-${player.position}`} onClick={() => { setSelected(player); setResults([]); }}><span><strong>{player.name}</strong><small>{player.college} / {player.position}{player.drafted ? ' / Drafted' : ''}{player.blockingOwner ? ` / ${player.blockingOwner} can retain` : ' / Unrestricted'}</small></span></button>)}</div>}
    </div>{searchError && <p role="alert">{searchError}</p>}
    {selected && <div className="draft-selection-review"><div><strong>{selected.name}</strong><small>{selected.college} / Draft as {selected.position}</small></div><button type="button" className="solid-pill" disabled={saving || !!loadError} onClick={() => submit(false)}>{saving ? 'Saving...' : eligibleBlocker ? 'Allow selection' : 'Submit pick'}</button>{eligibleBlocker && <button type="button" className="ghost-pill" disabled={saving || !!loadError} onClick={() => submit(true)}>{eligibleBlocker} blocks and retains</button>}</div>}
    </div>}
    {message && <p role="status" className="draft-pick-message">{message}</p>}
  </section>;
}
