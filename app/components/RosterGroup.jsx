"use client";

import Link from "next/link";
import { useState } from "react";

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

export default function RosterGroup({ title, rows, teamAbbrById }) {
  const [ppgMode, setPpgMode] = useState("season");
  const ppgLabel = ppgMode === "last5" ? "PPG (Last 5)" : "PPG (Season)";
  const ppgValue = (player) => (ppgMode === "last5" ? player.last5_ppg : player.ppg);
  const medianValue = (player) =>
    ppgMode === "last5" ? player.last5_median_ppg : player.median_ppg;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div className="section-title" style={{ marginBottom: "0.5rem" }}>
        <div className="title-with-toggle">
          <h2>{title}</h2>
          <label className="ppg-toggle">
            <span>Season</span>
            <input
              type="checkbox"
              checked={ppgMode === "last5"}
              onChange={(event) => setPpgMode(event.target.checked ? "last5" : "season")}
              aria-label={`Toggle ${title} PPG mode`}
            />
            <span>Last 5</span>
          </label>
        </div>
        <span className="section-subtitle">Fantasy roster stats</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Team</th>
            <th>{ppgLabel}</th>
            <th>Median</th>
            <th>MPG</th>
            <th>FGM/FGA</th>
            <th>3PM/3PA</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7}>No players in this group.</td>
            </tr>
          ) : (
            rows.map((player) => (
              <tr key={player.player_id}>
                <td>
                  <Link href={`/players/${player.player_id}`}>
                    {`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()}
                  </Link>
                </td>
                <td>{player.team_abbr ?? teamAbbrById?.[player.team_id] ?? player.team_name ?? "--"}</td>
                <td>{formatNumber(ppgValue(player))}</td>
                <td>{formatNumber(medianValue(player))}</td>
                <td>{formatNumber(player.mpg)}</td>
                <td>{`${formatNumber(player.fgm)} / ${formatNumber(player.fga)}`}</td>
                <td>{`${formatNumber(player.tpm)} / ${formatNumber(player.tpa)}`}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
