"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sortPositionRoster } from "../../lib/rosterBoard.mjs";
import styles from "./HomeRosterBoard.module.css";

const groups = [["C", "Centers"], ["F", "Forwards"], ["G", "Guards"]];
const storageKey = "home-roster-columns";
const options = [
  ["positionPick", "Pick"], ["team_name", "Team"], ["games", "GP"], ["ppg", "PPG"], ["last5_ppg", "Last 5 PPG"], ["mpg", "MPG"], ["three_pct", "3PT%"], ["ft_pct", "FT%"], ["shots_per_game", "Shots/G"],
  ["prev_games", "25-26 GP"], ["prev_starts", "25-26 GS"], ["prev_ppg", "25-26 PPG"], ["prev_mpg", "25-26 MPG"], ["prev_last5_ppg", "25-26 Last 5"]
].map(([key, label]) => ({ key, label }));
const defaults = ["positionPick", "ppg", "last5_ppg", "mpg"];
const display = (player, key) => {
  const value = player[key];
  if (value === null || value === undefined || value === "") return "—";
  if (key === "team_name") return value;
  if (key === "positionPick") return `#${value}`;
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return key.endsWith("_pct") ? `${number.toFixed(1)}%` : number.toFixed(1);
};

export default function HomeRosterBoard({ players = [] }) {
  const [sorts, setSorts] = useState({ C: "pick", F: "pick", G: "pick" });
  const [columns, setColumns] = useState(defaults);
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (Array.isArray(saved) && saved.length) setColumns(saved); } catch {} }, []);
  const toggle = (key) => setColumns((current) => {
    const next = current.includes(key) ? current.filter((column) => column !== key) : [...current, key];
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    return next.length ? next : current;
  });
  const visible = options.filter((option) => columns.includes(option.key));
  return <section className={styles.board} aria-label="B Town Sparties roster">
    <header><div><span>Your roster</span><h2>Position board</h2></div><details><summary>Columns</summary><fieldset><legend>Player is always shown</legend>{options.map((option) => <label key={option.key}><input type="checkbox" checked={columns.includes(option.key)} onChange={() => toggle(option.key)} />{option.label}</label>)}</fieldset></details></header>
    {groups.map(([position, label]) => {
      const group = sortPositionRoster(players.filter((player) => player.position === position), sorts[position]);
      return <section className={styles.group} key={position}><div className={styles.groupHeader}><h3>{label}</h3><div role="group" aria-label={`Sort ${label}`}><button type="button" onClick={() => setSorts({ ...sorts, [position]: "pick" })} aria-pressed={sorts[position] === "pick"}>Pick</button><button type="button" onClick={() => setSorts({ ...sorts, [position]: "ppg" })} aria-pressed={sorts[position] === "ppg"}>PPG</button></div></div><div className={styles.columns} style={{ gridTemplateColumns: `minmax(130px,1fr) repeat(${visible.length}, minmax(3.3rem,auto))` }}><span>Player</span>{visible.map((column) => <span key={column.key}>{column.label}</span>)}</div>{group.length ? group.map((player) => <Link className={styles.player} style={{ gridTemplateColumns: `minmax(130px,1fr) repeat(${visible.length}, minmax(3.3rem,auto))` }} href={`/players/${player.playerId}`} key={player.playerId}><span className={styles.identity}>{player.headshot ? <img src={player.headshot} alt="" /> : <i>{player.name.charAt(0)}</i>}<strong>{player.name}</strong></span>{visible.map((column) => <span key={column.key}>{display(player, column.key)}</span>)}</Link>) : <p className={styles.empty}>No {label.toLowerCase()} drafted yet.</p>}</section>;
    })}
  </section>;
}
