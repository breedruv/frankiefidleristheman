import { getPlayerOptions, getPlayerSummaries } from "../../lib/queries";

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

export default async function ComparePage({ searchParams }) {
  const options = await getPlayerOptions(200);

  const fallbackA = options[0]?.player_id;
  const fallbackB = options[1]?.player_id || fallbackA;

  const playerA = searchParams?.a || fallbackA;
  const playerB = searchParams?.b || fallbackB;

  const summaries = await getPlayerSummaries([playerA, playerB].filter(Boolean));
  const summaryMap = new Map(summaries.map((row) => [row.player_id, row]));

  const left = summaryMap.get(playerA) || {};
  const right = summaryMap.get(playerB) || {};

  const compareRows = [
    { metric: "PPG", left: formatNumber(left.ppg), right: formatNumber(right.ppg) },
    { metric: "Last 5", left: formatNumber(left.last5_ppg), right: formatNumber(right.last5_ppg) },
    { metric: "MPG", left: formatNumber(left.mpg), right: formatNumber(right.mpg) },
    { metric: "FGM/FGA", left: `${formatNumber(left.fgm)} / ${formatNumber(left.fga)}`, right: `${formatNumber(right.fgm)} / ${formatNumber(right.fga)}` },
    { metric: "3PM/3PA", left: `${formatNumber(left.tpm)} / ${formatNumber(left.tpa)}`, right: `${formatNumber(right.tpm)} / ${formatNumber(right.tpa)}` }
  ];

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>Head-to-Head Comparison</h2>
          <span className="section-subtitle">Side-by-side player view</span>
        </div>
        <form className="filters" method="get">
          <div className="filter-card">
            <label>Player A</label>
            <select name="a" defaultValue={playerA}>
              {options.map((option) => (
                <option key={option.player_id} value={option.player_id}>
                  {option.last_name}, {option.first_name} ({option.team_name})
                </option>
              ))}
            </select>
          </div>
          <div className="filter-card">
            <label>Player B</label>
            <select name="b" defaultValue={playerB}>
              {options.map((option) => (
                <option key={option.player_id} value={option.player_id}>
                  {option.last_name}, {option.first_name} ({option.team_name})
                </option>
              ))}
            </select>
          </div>
          <div className="filter-card">
            <label>Week</label>
            <select defaultValue="Season">
              <option>Season</option>
              <option>Week 7</option>
              <option>Week 6</option>
            </select>
          </div>
          <div className="filter-card">
            <label>Split</label>
            <select defaultValue="Overall">
              <option>Overall</option>
              <option>Last 5</option>
            </select>
          </div>
          <div className="filter-card" style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="solid-pill" type="submit">Compare</button>
          </div>
        </form>
      </section>

      <section className="section">
        <table className="table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>{left.first_name ? `${left.first_name} ${left.last_name}` : "Player A"}</th>
              <th>{right.first_name ? `${right.first_name} ${right.last_name}` : "Player B"}</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td>{row.left}</td>
                <td>{row.right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
