'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PlayerSearch({ label, side, player, otherId }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try { const response = await fetch(`/api/draft-players?q=${encodeURIComponent(query)}`, { signal: controller.signal }); const data = await response.json(); if (response.ok) setResults(data.players || []); }
      catch (error) { if (error.name !== 'AbortError') setResults([]); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  function choose(id) {
    const params = new URLSearchParams({ [side]: String(id), [side === 'a' ? 'b' : 'a']: String(otherId || '') });
    router.push(`/compare?${params.toString()}`);
    setQuery(''); setResults([]);
  }
  return <div className="compare-player-search">
    <input id={`compare-search-${side}`} aria-label={label} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player or school..." autoComplete="off" />
    {results.length > 0 && <div className="compare-search-results">{results.map((result) => <button type="button" key={`${result.playerId}-${result.position}`} onClick={() => choose(result.playerId)}><img src={result.headshot} alt="" /><span><strong>{result.name}</strong><small>{result.college} · {result.position}</small></span></button>)}</div>}
    <div className="compare-selected">{player.player_id && <img src={player.headshot || `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${player.player_id}.png`} alt="" />}<div><strong>{player.first_name ? `${player.first_name} ${player.last_name}` : 'Choose a player'}</strong><span>{player.team_name || 'Search above to compare'}{player.position ? ` · ${player.position}` : ''}{player.year ? ` · ${player.year}` : ''}</span></div></div>
  </div>;
}
