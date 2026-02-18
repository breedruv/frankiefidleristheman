import { getHomeStats, getTopPerformers } from "../lib/queries";

const matchups = [
  { teamA: "Andrew", teamB: "Partner", scoreA: 287, scoreB: 269, tiebreaker: "Bench +18" },
  { teamA: "North Squad", teamB: "South Squad", scoreA: 255, scoreB: 244, tiebreaker: "Bench +11" }
];

const slides = [
  { name: "Rasheem Dunn", team: "St. Johns", line: "25 pts, 6 ast" },
  { name: "Nate Johnson", team: "Akron", line: "19 pts, 7 reb" },
  { name: "Dorian Finley", team: "Seton Hall", line: "22 pts, 5 3PM" },
  { name: "Avery Holt", team: "Oregon", line: "17 pts, 9 ast" },
  { name: "Caleb Reed", team: "Iowa", line: "30 pts, 4 stl" }
];

const slideTrack = [...slides, ...slides];

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

export default async function HomePage() {
  const [leaders, stats] = await Promise.all([getTopPerformers(3), getHomeStats()]);

  const quickStats = [
    {
      label: "Active Players",
      value: `${stats?.active_players ?? 0} / ${stats?.total_players ?? 0}`,
      note: "Roster status"
    },
    {
      label: "Avg PPG",
      value: `${formatNumber(stats?.avg_ppg)} PPG`,
      note: "MIN > 0 only"
    },
    {
      label: "Games Tracked",
      value: stats?.total_games ?? 0,
      note: "All imported games"
    }
  ];

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Weekly Control Center</h1>
          <p>
            Track your roster, manage weekly lineups, and stay ahead of the matchup race. PPG defaults to games where
            MIN &gt; 0, with quick access to last 5 trends and draft status.
          </p>
        </div>
        <div className="hero-cards">
          {quickStats.map((stat) => (
            <div className="card" key={stat.label}>
              <h3>{stat.label}</h3>
              <p className="section-subtitle">{stat.note}</p>
              <p style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0 }}>{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Scoreboard Snapshot</h2>
          <span className="section-subtitle">Week 7 live totals</span>
        </div>
        <div className="grid-2">
          {matchups.map((matchup) => (
            <div className="card" key={`${matchup.teamA}-${matchup.teamB}`}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{matchup.teamA}</strong>
                <span className="stat-pill">{matchup.scoreA} pts</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.6rem" }}>
                <strong>{matchup.teamB}</strong>
                <span className="stat-pill">{matchup.scoreB} pts</span>
              </div>
              <p className="section-subtitle" style={{ marginTop: "0.8rem" }}>
                Tiebreaker: {matchup.tiebreaker}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="section split">
        <div className="card">
          <div className="section-title">
            <h2>Top Performers</h2>
            <span className="section-subtitle">Overall + last 5</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>PPG</th>
                <th>Last 5</th>
              </tr>
            </thead>
            <tbody>
              {leaders.length === 0 ? (
                <tr>
                  <td colSpan={4}>No player data yet. Run `npm run db:import` to load CSVs.</td>
                </tr>
              ) : (
                leaders.map((player) => (
                  <tr key={player.player_id}>
                    <td>{`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()}</td>
                    <td>{player.team_name ?? "--"}</td>
                    <td>{formatNumber(player.ppg)}</td>
                    <td>{formatNumber(player.last5_ppg)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-title">
            <h2>Next Actions</h2>
            <span className="section-subtitle">Quick access</span>
          </div>
          <div className="section">
            <div>
              <span className="tag">Lineup</span>
              <h3>Update week 7 starters</h3>
              <p className="section-subtitle">Center + 2 Forwards + 2 Guards required.</p>
            </div>
            <div>
              <span className="tag">Draft</span>
              <h3>Refresh drafted list</h3>
              <p className="section-subtitle">Tag drafted players to keep the board clean.</p>
            </div>
            <div>
              <span className="tag">Roster</span>
              <h3>Check last 5 trends</h3>
              <p className="section-subtitle">Find the hot hand before tipoff.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Weekly Highlight Reel</h2>
          <span className="section-subtitle">Auto-scroll snapshot from the week</span>
        </div>
        <div className="slideshow">
          <div className="slide-track">
            {slideTrack.map((slide, index) => (
              <div className="player-card" key={`${slide.name}-${index}`}>
                <strong>{slide.name}</strong>
                <p>{slide.team}</p>
                <p style={{ fontWeight: 600 }}>{slide.line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
