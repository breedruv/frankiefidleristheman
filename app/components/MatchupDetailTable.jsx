"use client";

import { useState } from "react";
import styles from "./MatchupDetailTable.module.css";

export default function MatchupDetailTable({ home = [], away = [], isSample = false }) {
  const [open, setOpen] = useState(false);
  const rows = home.map((player, index) => ({ slot: player.slot, home: player, away: away[index] }));
  return <div className={styles.wrap}>
    <button className={styles.toggle} type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide matchup table" : "Show matchup table"}<span>{open ? "−" : "+"}</span></button>
    {open ? <div className={styles.tableWrap}><p>{isSample ? "Sample game states · not live scoring" : "Game details will appear after both lineups are set."}</p><table><thead><tr><th>A/S</th><th>Status</th><th>BJ</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr className={row.slot === "T1" ? styles.tiebreaker : ""} key={row.slot}><td>{row.home?.points ?? "—"}</td><td>{row.home?.status ?? "No game"}</td><td>{row.away?.points ?? "—"}</td><td>{row.away?.status ?? "No game"}</td></tr>)}</tbody></table></div> : null}
  </div>;
}
