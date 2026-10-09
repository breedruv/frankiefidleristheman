"use client";

import { useEffect, useMemo, useState } from "react";

const blankConfig = {
  franchisePicks: Array.from({ length: 8 }, (_, index) => ({ pick: index + 1, team: "", player: "" })),
  snakeOrder: Array.from({ length: 8 }, (_, index) => ({ slot: index + 1, team: `Team ${index + 1}` }))
};

export default function DraftOrderEditor() {
  const [config, setConfig] = useState(blankConfig);
  const [round, setRound] = useState("franchise");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch("/api/draft-config").then((response) => response.json()).then((data) => setConfig({ franchisePicks: data.franchisePicks || blankConfig.franchisePicks, snakeOrder: data.snakeOrder || blankConfig.snakeOrder })).finally(() => setLoading(false)); }, []);
  const snakePreview = useMemo(() => Array.from({ length: 4 }, (_, index) => ({ round: index + 1, teams: index % 2 === 0 ? config.snakeOrder : [...config.snakeOrder].reverse() })), [config.snakeOrder]);
  const updateFranchise = (index, key, value) => setConfig((current) => ({ ...current, franchisePicks: current.franchisePicks.map((pick, pickIndex) => pickIndex === index ? { ...pick, [key]: value } : pick) }));
  const updateSnake = (index, value) => setConfig((current) => ({ ...current, snakeOrder: current.snakeOrder.map((slot, slotIndex) => slotIndex === index ? { ...slot, team: value } : slot) }));
  async function save() { setSaved(false); const response = await fetch("/api/draft-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }); if (response.ok) { setSaved(true); window.setTimeout(() => setSaved(false), 2500); } }

  if (loading) return <aside className="draft-order-panel card"><p className="section-subtitle">Loading draft setup…</p></aside>;
  return <aside className="draft-order-panel card"><div className="section-title"><div><h2>Draft setup</h2><span className="section-subtitle">Reference for off-site draft night</span></div><span className="draft-save-status">{saved ? "Saved" : ""}</span></div><div className="draft-setup-tabs"><button type="button" className={round === "franchise" ? "active" : ""} onClick={() => setRound("franchise")}>Franchise round</button><button type="button" className={round === "snake" ? "active" : ""} onClick={() => setRound("snake")}>Snake order</button></div>{round === "franchise" ? <><p className="draft-editor-help">Enter the eight franchise players after the off-site selection is complete.</p><div className="draft-editor-table"><div className="draft-editor-head"><span>Pick</span><span>Team</span><span>Franchise player</span></div>{config.franchisePicks.map((pick, index) => <div className="draft-editor-row" key={pick.pick}><b>{pick.pick}</b><input value={pick.team} onChange={(event) => updateFranchise(index, "team", event.target.value)} placeholder="Team" /><input value={pick.player} onChange={(event) => updateFranchise(index, "player", event.target.value)} placeholder="Player" /></div>)}</div></> : <><p className="draft-editor-help">Set the first-round order. Later rounds automatically reverse this list.</p><div className="draft-editor-table"><div className="draft-editor-head"><span>Slot</span><span>Team</span><span>Round 2</span></div>{config.snakeOrder.map((slot, index) => <div className="draft-editor-row" key={slot.slot}><b>{slot.slot}</b><input value={slot.team} onChange={(event) => updateSnake(index, event.target.value)} placeholder={`Team ${slot.slot}`} /><span className="draft-order-preview">{config.snakeOrder[7 - index]?.team || `Team ${8 - index}`}</span></div>)}</div><div className="snake-preview"><strong>Snake preview</strong>{snakePreview.map((preview) => <span key={preview.round}>R{preview.round}: {preview.teams.map((team) => team.team || "—").join(" → ")}</span>)}</div></>}<button className="solid-pill draft-save-button" type="button" onClick={save}>Save draft setup</button></aside>;
}

