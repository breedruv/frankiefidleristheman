import { getDraftPool } from "../../lib/queries";

const board = [
  { pick: 1, team: "Andrew", player: "TBD", position: "G" },
  { pick: 2, team: "Partner", player: "TBD", position: "F" },
  { pick: 3, team: "Andrew", player: "TBD", position: "G" },
  { pick: 4, team: "Partner", player: "TBD", position: "C" }
];

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

export default async function DraftPage() {
  const draftPool = await getDraftPool(60);

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>Draft Board</h2>
          <span className="section-subtitle">Tag drafted players to filter them out.</span>
        </div>
        <div className="filters">
          <div className="filter-card">
            <label>Conference</label>
            <select defaultValue="All">
              <option>All</option>
              <option>Big Ten</option>
              <option>SEC</option>
              <option>Big East</option>
            </select>
          </div>
          <div className="filter-card">
            <label>Position</label>
            <select defaultValue="All">
              <option>All</option>
              <option>G</option>
              <option>F</option>
              <option>C</option>
            </select>
          </div>
          <div className="filter-card">
            <label>Team</label>
            <select defaultValue="All">
              <option>All</option>
              <option>Nebraska</option>
              <option>Gonzaga</option>
              <option>Seton Hall</option>
            </select>
          </div>
          <div className="filter-card">
            <label>PPG Range</label>
            <input type="text" placeholder="15 - 25" />
          </div>
        </div>
      </section>

      <section className="section split">
        <div className="card">
          <div className="section-title">
            <h2>Available Players</h2>
            <span className="section-subtitle">Sorted by PPG</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Pos</th>
                <th>PPG</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {draftPool.length === 0 ? (
                <tr>
                  <td colSpan={5}>No player data yet. Run `npm run db:import` to load CSVs.</td>
                </tr>
              ) : (
                draftPool.map((player) => (
                  <tr key={player.player_id}>
                    <td>{`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()}</td>
                    <td>{player.team_name ?? "--"}</td>
                    <td>{player.position ?? "--"}</td>
                    <td>{formatNumber(player.ppg)}</td>
                    <td>
                      <span className="tag">Available</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-title">
            <h2>Pick History</h2>
            <span className="section-subtitle">Draft order preview</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Pick</th>
                <th>Team</th>
                <th>Player</th>
                <th>Pos</th>
              </tr>
            </thead>
            <tbody>
              {board.map((pick) => (
                <tr key={pick.pick}>
                  <td>{pick.pick}</td>
                  <td>{pick.team}</td>
                  <td>{pick.player}</td>
                  <td>{pick.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
