import { notFound } from "next/navigation";
import { getPlayerGameLog, getPlayerProfile, getPlayerSummaries } from "../../../lib/queries";

const TEAM_ID = 2;

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

export default async function PlayerPage({ params }) {
  const { playerId } = await params;
  const numericPlayerId = Number(playerId);
  const player = await getPlayerProfile(numericPlayerId, TEAM_ID);
  if (!player) {
    notFound();
  }

  const summaries = await getPlayerSummaries([numericPlayerId]);
  const summary = summaries?.[0] || {};
  const gameLog = await getPlayerGameLog(player.player_id, 12);
  const fullName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  const bioLine = [
    player.team_name,
    player.player_position ? `Fantasy ${player.player_position}` : null,
    player.position ? `NCAA ${player.position}` : null,
    player.player_number ? `#${player.player_number}` : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>{fullName || "Player"}</h2>
          <span className="section-subtitle">{bioLine || "Profile overview"}</span>
        </div>
        <div className="grid-2">
          <div className="card">
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              {player.headshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={player.headshot}
                  alt={fullName || "Player headshot"}
                  style={{ width: "96px", height: "96px", borderRadius: "12px", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "96px",
                    height: "96px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.08)"
                  }}
                />
              )}
              <div>
                <h3 style={{ margin: 0 }}>Profile</h3>
                <p className="section-subtitle" style={{ marginTop: "0.3rem" }}>
                  {player.team_name ?? "--"}
                </p>
              </div>
            </div>
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
              <div><strong>Height:</strong> {player.display_height ?? player.height ?? "--"}</div>
              <div><strong>Weight:</strong> {player.weight ? `${player.weight} lbs` : "--"}</div>
              <div><strong>Experience:</strong> {player.experience ?? "--"}</div>
              <div><strong>Team:</strong> {player.team_name ?? "--"}</div>
            </div>
          </div>
          <div className="card">
            <h3>Season Averages</h3>
            <p className="section-subtitle">Games with MIN &gt; 0</p>
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
              <div><strong>PPG:</strong> {formatNumber(summary.ppg)}</div>
              <div><strong>MPG:</strong> {formatNumber(summary.mpg)}</div>
              <div><strong>FGM/FGA:</strong> {formatNumber(summary.fgm)} / {formatNumber(summary.fga)}</div>
              <div><strong>3PM/3PA:</strong> {formatNumber(summary.tpm)} / {formatNumber(summary.tpa)}</div>
              <div><strong>Last 5 PPG:</strong> {formatNumber(summary.last5_ppg)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Game Log</h2>
          <span className="section-subtitle">Recent performances</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Opponent</th>
              <th>H/A</th>
              <th>PTS</th>
              <th>MIN</th>
              <th>FGM/FGA</th>
              <th>3PM/3PA</th>
              <th>REB</th>
              <th>AST</th>
              <th>STL</th>
              <th>BLK</th>
              <th>TO</th>
            </tr>
          </thead>
          <tbody>
            {gameLog.length === 0 ? (
              <tr>
                <td colSpan={12}>No game logs yet for this player.</td>
              </tr>
            ) : (
              gameLog.map((game) => (
                <tr key={game.game_id}>
                  <td>{game.game_date ?? "--"}</td>
                  <td>{game.opponent_name ?? "--"}</td>
                  <td>{game.home_away ?? "--"}</td>
                  <td>{game.pts ?? 0}</td>
                  <td>{formatNumber(game.minutes)}</td>
                  <td>{`${formatNumber(game.fgm, 0)} / ${formatNumber(game.fga, 0)}`}</td>
                  <td>{`${formatNumber(game.tpm, 0)} / ${formatNumber(game.tpa, 0)}`}</td>
                  <td>{game.reb ?? 0}</td>
                  <td>{game.ast ?? 0}</td>
                  <td>{game.stl ?? 0}</td>
                  <td>{game.blocks ?? 0}</td>
                  <td>{game.turnovers ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
