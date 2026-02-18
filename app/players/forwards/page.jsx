import Link from "next/link";
import { getFantasyRoster } from "../../../lib/queries";

const TEAM_ID = 2;

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

const normalizePosition = (value) => {
  if (!value) {
    return "";
  }
  const normalized = value.toString().trim().toLowerCase();
  if (["c", "center", "centers"].includes(normalized)) return "C";
  if (["f", "forward", "forwards"].includes(normalized)) return "F";
  if (["g", "guard", "guards"].includes(normalized)) return "G";
  return value.toString().toUpperCase();
};

export default async function ForwardsPage() {
  const roster = await getFantasyRoster({ teamId: TEAM_ID });
  const forwards = roster.filter((player) => normalizePosition(player.player_position) === "F");

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>Forwards</h2>
          <span className="section-subtitle">Fantasy Team #{TEAM_ID}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Pos</th>
              <th>PPG</th>
              <th>Last 5</th>
              <th>MPG</th>
            </tr>
          </thead>
          <tbody>
            {forwards.length === 0 ? (
              <tr>
                <td colSpan={6}>No forwards found for this roster.</td>
              </tr>
            ) : (
              forwards.map((player) => (
                <tr key={player.player_id}>
                  <td>
                    <Link href={`/players/${player.player_id}`}>
                      {`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unknown"}
                    </Link>
                  </td>
                  <td>{player.team_name ?? "--"}</td>
                  <td>{player.player_position ?? "--"}</td>
                  <td>{formatNumber(player.ppg)}</td>
                  <td>{formatNumber(player.last5_ppg)}</td>
                  <td>{formatNumber(player.mpg)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
