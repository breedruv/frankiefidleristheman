import { getRosterSnapshot } from "../../lib/queries";

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

export default async function RosterPage() {
  const players = await getRosterSnapshot(100);

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>Roster Tracker</h2>
          <span className="section-subtitle">PPG excludes games with MIN = 0</span>
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
              <option>Florida Atlantic</option>
              <option>Seton Hall</option>
            </select>
          </div>
          <div className="filter-card">
            <label>PPG Range</label>
            <input type="text" placeholder="18 - 26" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Player Metrics</h2>
          <span className="section-subtitle">Overall season + last 5</span>
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
              <th>FGM/FGA</th>
              <th>3PM/3PA</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td colSpan={8}>No player data yet. Run `npm run db:import` to load CSVs.</td>
              </tr>
            ) : (
              players.map((player) => (
                <tr key={player.player_id}>
                  <td>{`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()}</td>
                  <td>{player.team_name ?? "--"}</td>
                  <td>{player.position ?? "--"}</td>
                  <td>{formatNumber(player.ppg)}</td>
                  <td>{formatNumber(player.last5_ppg)}</td>
                  <td>{formatNumber(player.mpg)}</td>
                  <td>{`${formatNumber(player.fgm)} / ${formatNumber(player.fga)}`}</td>
                  <td>{`${formatNumber(player.tpm)} / ${formatNumber(player.tpa)}`}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="section split">
        <div className="card">
          <div className="section-title">
            <h2>Lineup History</h2>
            <span className="section-subtitle">Manual entry</span>
          </div>
          <div className="section">
            <div>
              <span className="tag">Week 6</span>
              <h3>Starters: 1C, 2F, 2G</h3>
              <p className="section-subtitle">Frankie Fidler, Elijah Martin, Nate Johnson, Dorian Finley, Aaron Hill</p>
            </div>
            <div>
              <span className="tag">Week 5</span>
              <h3>Bench tiebreaker used</h3>
              <p className="section-subtitle">Bench +12 to secure the win.</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="section-title">
            <h2>Notes</h2>
            <span className="section-subtitle">Scouting and trends</span>
          </div>
          <div className="section">
            <div>
              <span className="tag">Hot</span>
              <h3>Frankie Fidler</h3>
              <p className="section-subtitle">Last 5 up +2.6 PPG with higher usage.</p>
            </div>
            <div>
              <span className="tag">Watch</span>
              <h3>Elijah Martin</h3>
              <p className="section-subtitle">Minutes down, check next matchup.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
