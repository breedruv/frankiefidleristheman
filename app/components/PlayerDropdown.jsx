"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PlayerDropdown({ players = [] }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const handleChange = (event) => {
    const next = event.target.value;
    setValue(next);
    if (next) {
      router.push(`/players/${next}`);
    }
  };

  return (
    <div className="nav-select">
      <label htmlFor="player-select" className="sr-only">Player</label>
      <select id="player-select" value={value} onChange={handleChange}>
        <option value="">Players</option>
        {players.map((player) => (
          <option key={player.player_id} value={player.player_id}>
            {player.label}
          </option>
        ))}
      </select>
    </div>
  );
}
