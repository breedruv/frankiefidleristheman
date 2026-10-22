"use client";

import { useEffect, useRef, useState } from "react";

const formatNumber = (value) => value === null || value === undefined || Number.isNaN(Number(value)) ? "--" : Number(value).toFixed(1);

export default function PlayerPoolTable({ players, draftedPlayerIds }) {
  const [visibleCount, setVisibleCount] = useState(30);
  const sentinel = useRef(null);
  const visiblePlayers = players.slice(0, visibleCount);

  useEffect(() => setVisibleCount(30), [players]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((count) => Math.min(count + 50, players.length));
    }, { rootMargin: "240px" });
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [players.length]);

  return <div className="table-scroll player-pool-scroll"><table className="table player-focus-table"><thead><tr><th>Player</th><th>Team</th><th>Position</th><th>PPG</th><th>MPG</th><th>3PT%</th><th>FT%</th><th>Shots/G</th></tr></thead><tbody>{players.length === 0 ? <tr><td colSpan={8}>No players match these filters.</td></tr> : visiblePlayers.map((player) => { const drafted = draftedPlayerIds.has(Number(player.player_id)); return <tr className={drafted ? "player-row-drafted" : ""} key={player.player_id}><td><div className="player-table-identity"><span className="player-table-headshot">{player.headshot ? <img src={player.headshot} alt="" /> : "?"}</span><span>{`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()}</span></div></td><td>{player.team_name ?? "--"}</td><td>{player.position ?? "--"}</td><td>{formatNumber(player.ppg)}</td><td>{formatNumber(player.mpg)}</td><td>{formatNumber(player.three_pct)}</td><td>{formatNumber(player.ft_pct)}</td><td>{formatNumber(player.shots_per_game)}</td></tr>; })}</tbody></table><div ref={sentinel} className="player-pool-load-more">{visibleCount < players.length ? `Showing ${visibleCount} of ${players.length} players` : players.length ? `Showing all ${players.length} players` : ""}</div></div>;
}
