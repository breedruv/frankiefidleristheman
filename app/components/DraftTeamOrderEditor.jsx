"use client";

import { useEffect, useState } from "react";

const blankRows = Array.from({ length: 8 }, (_, index) => ({ slot: index + 1, team: "", franchiseOrder: index + 1 }));

export default function DraftTeamOrderEditor() {
  const [rows, setRows] = useState(blankRows);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/draft-config")
      .then((response) => response.json())
      .then((data) => setRows((data.snakeOrder || blankRows).map((row, index) => ({ slot: index + 1, team: row.team || "", franchiseOrder: row.franchiseOrder || index + 1 }))))
      .finally(() => setLoading(false));
  }, []);

  function update(index, key, value) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
    setSaved(false);
  }

  async function save() {
    setError("");
    const orders = rows.map((row) => Number(row.franchiseOrder));
    if (new Set(orders).size !== 8 || orders.some((order) => order < 1 || order > 8)) { setError("Franchise Order must contain each number from 1 through 8 exactly once."); return; }
    if (rows.some((row) => !row.team.trim())) { setError("Every team needs a name."); return; }
    const response = await fetch("/api/draft-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snakeOrder: rows }) });
    if (!response.ok) { const data = await response.json(); setError(data.error || "Unable to save draft order."); return; }
    setSaved(true);
  }

  if (loading) return <section className="section"><p>Loading draft order…</p></section>;
  return <section className="section admin-draft-order"><div className="section-title"><div><h2>Draft team order</h2><span className="section-subtitle">Team number controls the snake order. Franchise Order controls the first eight picks.</span></div><span className="draft-save-status">{saved ? "Saved" : ""}</span></div><div className="draft-team-order-table"><div className="draft-team-order-head"><span>Number</span><span>Team Name</span><span>Franchise Order</span></div>{rows.map((row, index) => <div className="draft-team-order-row" key={row.slot}><strong>{row.slot}</strong><input value={row.team} onChange={(event) => update(index, "team", event.target.value)} placeholder={`Team ${row.slot}`} /><input type="number" min="1" max="8" value={row.franchiseOrder} onChange={(event) => update(index, "franchiseOrder", event.target.value)} /></div>)}</div>{error && <p className="draft-pick-message">{error}</p>}<button className="solid-pill" type="button" onClick={save}>Save draft order</button></section>;
}
