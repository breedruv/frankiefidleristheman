"use client";

import { useState } from "react";
import { MANUAL_STATUSES } from "../../lib/availability.mjs";

export default function AvailabilityBadge({ availability }) {
  if (!availability?.level) return null;
  return <span className={`availability-badge ${availability.level}`} title={availability.detail}>{availability.label}</span>;
}

// Availability summary plus the manual Out/GTD flag (Andrew and Sam only).
export function AvailabilityPanel({ player, canFlag, onChange }) {
  const [availability, setAvailability] = useState(player.availability || null);
  const [status, setStatus] = useState(MANUAL_STATUSES[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(nextStatus) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/injuries", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: player.player_id, status: nextStatus, injury: note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAvailability(data.availability);
      setNote("");
      onChange?.();
    } catch (err) { setError(err.message || "Unable to save the injury flag."); }
    finally { setBusy(false); }
  }
  return <div className="availability-panel">
    <h3>Availability <AvailabilityBadge availability={availability} /></h3>
    <p>{availability?.detail || "No injury listing, and no box scores loaded for his team yet."}</p>
    {canFlag && <form onSubmit={(event) => { event.preventDefault(); save(status); }} onClick={(event) => event.stopPropagation()}>
      <select aria-label="Injury status" value={status} onChange={(event) => setStatus(event.target.value)} disabled={busy}>{MANUAL_STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
      <input aria-label="Injury note" placeholder="Injury or source (optional)" maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} />
      <button type="submit" className="ghost-pill" disabled={busy}>{busy ? "Saving..." : "Flag player"}</button>
      {availability?.source === "manual" && <button type="button" className="ghost-pill" disabled={busy} onClick={() => save(null)}>Clear flag</button>}
    </form>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
