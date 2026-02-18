"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const POSITION_LABELS = {
  C: "Center",
  F: "Forward",
  G: "Guard"
};

const normalizePosition = (value) => {
  if (!value) {
    return "";
  }
  const normalized = value.toString().trim().toLowerCase();
  if (["c", "center", "centers"].includes(normalized)) return "C";
  if (["f", "forward", "forwards"].includes(normalized)) return "F";
  if (["g", "guard", "guards"].includes(normalized)) return "G";
  return "";
};

export default function PositionRosterNav({ players = [] }) {
  const [openGroups, setOpenGroups] = useState({});

  const groups = useMemo(() => {
    const grouped = { C: [], F: [], G: [] };
    players.forEach((player) => {
      const key = normalizePosition(player.player_position);
      if (!key) return;
      grouped[key].push(player);
    });
    Object.values(grouped).forEach((list) =>
      list.sort((a, b) => (a.label || "").localeCompare(b.label || ""))
    );
    return grouped;
  }, [players]);

  const toggleGroup = (key) => {
    setOpenGroups((prev) => {
      const nextState = !prev[key];
      return nextState ? { [key]: true } : {};
    });
  };

  return (
    <div className="nav-roster">
      {Object.entries(groups).map(([key, list]) => (
        <div key={key} className="roster-group">
          <button
            type="button"
            className="roster-toggle"
            onClick={() => toggleGroup(key)}
            aria-expanded={Boolean(openGroups[key])}
            aria-controls={`roster-${key}`}
          >
            {POSITION_LABELS[key]}
          </button>
          <ul id={`roster-${key}`} className={`roster-list ${openGroups[key] ? "is-open" : ""}`}>
            {list.length === 0 ? (
              <li className="roster-empty">No players</li>
            ) : (
              list.map((player) => (
                <li key={player.player_id}>
                  <Link href={`/players/${player.player_id}`}>{player.label}</Link>
                </li>
              ))
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
