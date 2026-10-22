'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PlayerFocusTable from './PlayerFocusTable';
import { sortPlayers } from '../../../lib/playerSort.mjs';

export default function PlayerFocusWorkspace({ players, pool, draftedPlayerIds, member, hideDrafted }) {
  const [lists, setLists] = useState(['Andrew', 'Sam'].map((owner) => ({ owner_name: owner, player_ids: [], revision: 0 })));
  const [drafted, setDrafted] = useState(draftedPlayerIds);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(50);
  const [retry, setRetry] = useState(0);
  const [sort, setSort] = useState({ key: 'ppg', direction: 'desc' });
  const byId = new Map(pool.map((player) => [Number(player.player_id), player]));
  const mine = lists.find((list) => list.owner_name === member);
  const available = sortPlayers(hideDrafted ? players.filter((p) => !drafted.includes(Number(p.player_id))) : players, sort.key, sort.direction);
  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/shortlists');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!cancelled) { setLists((current) => data.lists.map((list) => { const existing = current.find((row) => row.owner_name === list.owner_name); return existing && existing.revision > list.revision ? existing : list; })); setReady(true); setError(''); }
      } catch (err) { if (!cancelled) setError(err.message || 'Unable to load your lists.'); }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [member, retry]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/draft-picks');
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setDrafted(data.picks.map((p) => Number(p.player_id)));
      } catch { /* Keep the last confirmed drafted status until the next refresh. */ }
    };
    const interval = setInterval(load, 5000);
    window.addEventListener('draft-pick-saved', load);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener('draft-pick-saved', load); };
  }, []);
  async function save(ids) {
    if (busy || !ready || !mine) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/shortlists', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: member, playerIds: ids, revision: mine.revision }) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 409) setRetry((n) => n + 1); throw new Error(data.error); }
      setLists((current) => current.map((list) => list.owner_name === member ? data.list : list));
    } catch (err) { setError(err.message || 'Unable to save. Your list has not been changed.'); }
    finally { setBusy(false); }
  }
  function move(index, direction) {
    const ids = [...mine.player_ids];
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    save(ids);
  }
  return <div className="player-focus-workspace">
    <aside className="shortlist-rail" aria-label="Andrew and Sam’s top 10">
      <div className="shortlist-heading"><h2>Our top 10</h2><span>{member ? `Editing ${member}’s list` : 'Team shortlists'}</span></div>
      {!member && <p><Link href="/login">Sign in</Link> to view both lists and edit yours.</p>}
      {error && <div role="alert" className="workspace-error">{error} <button type="button" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>}
      <div className="shortlist-pair">{lists.map((list) => <section className="shortlist-panel" key={list.owner_name} aria-label={`${list.owner_name} top 10`}>
        <header><h3>{list.owner_name}’s top 10</h3><span>{member && ready ? `${list.player_ids.length}/10` : '—'}{member && member !== list.owner_name ? ' · View only' : ''}</span></header>
        {member && !ready ? <p>{error ? 'Lists unavailable.' : 'Loading lists…'}</p> : !list.player_ids.length ? <p>{member ? 'Add players from the pool.' : 'Sign-in required.'}</p> : <ol>{list.player_ids.map((id, index) => {
          const player = byId.get(Number(id));
          const name = player ? `${player.first_name || ''} ${player.last_name || ''}`.trim() : `Player ${id}`;
          const isDrafted = drafted.includes(Number(id));
          return <li key={id} className={isDrafted ? 'shortlist-drafted' : ''}>
            <span className="shortlist-rank">{index + 1}</span><span className="shortlist-avatar">{player?.headshot ? <img src={player.headshot} alt="" /> : '?'}</span><div className="shortlist-player"><strong>{name}</strong><small>{player?.position} · {player?.team_name || 'Outside current pool'}{isDrafted ? ' · Drafted' : ''}</small></div>
            {member === list.owner_name && <div className="shortlist-actions"><button type="button" disabled={busy || index === 0} aria-label={`Move ${name} up`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={busy || index === list.player_ids.length - 1} aria-label={`Move ${name} down`} onClick={() => move(index, 1)}>↓</button><button type="button" disabled={busy} aria-label={`Remove ${name}`} onClick={() => save(mine.player_ids.filter((value) => value !== id))}>×</button></div>}
          </li>;
        })}</ol>}
      </section>)}</div>
    </aside>
    <section className="card player-pool-panel"><div className="section-title"><div><h2>Player pool</h2><span className="section-subtitle">{available.length} matching players · Select a name for recent games</span></div></div>
      <PlayerFocusTable players={available.slice(0, visible)} sort={sort} onSort={(key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))} draftedPlayerIds={drafted} member={member} shortlistIds={mine?.player_ids || []} canAdd={!!member && ready && !busy && mine?.player_ids.length < 10} onAdd={(id) => save([...mine.player_ids, id])} />
      {visible < available.length && <button className="ghost-pill load-more-players" type="button" onClick={() => setVisible((n) => n + 50)}>Show 50 more ({available.length - visible} remaining)</button>}
    </section>
  </div>;
}
