import { getPlayerOptions, getPlayerSummaries } from "../../lib/queries";
import { getDraftRosterPool } from "../../lib/draftRoster";
import PlayerSearch from "./PlayerSearch";

export const dynamic = "force-dynamic";

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

export default async function ComparePage({ searchParams }) {
  searchParams = await searchParams;
  const options = await getPlayerOptions(200);

  const fallbackA = options[0]?.player_id;
  const fallbackB = options[1]?.player_id || fallbackA;

  const playerA = Number(searchParams?.a || fallbackA);
  const playerB = Number(searchParams?.b || fallbackB);

  const summaries = await getPlayerSummaries([playerA, playerB].filter(Boolean));
  const summaryMap = new Map(summaries.map((row) => [Number(row.player_id), row]));
  const rosterMap = new Map(getDraftRosterPool(5000).map((row) => [Number(row.player_id), row]));

  const left = { ...rosterMap.get(playerA), ...summaryMap.get(playerA) };
  const right = { ...rosterMap.get(playerB), ...summaryMap.get(playerB) };

  const compareRows = [
    { metric: "PPG", left: left.ppg, right: right.ppg },
    { metric: "Last 5 PPG", left: left.last5_ppg, right: right.last5_ppg },
    { metric: "MPG", left: left.mpg, right: right.mpg },
    { metric: "FGM / FGA", left: `${formatNumber(left.fgm)} / ${formatNumber(left.fga)}`, right: `${formatNumber(right.fgm)} / ${formatNumber(right.fga)}` },
    { metric: "3PM / 3PA", left: `${formatNumber(left.tpm)} / ${formatNumber(left.tpa)}`, right: `${formatNumber(right.tpm)} / ${formatNumber(right.tpa)}` }
  ];
  const name = (player, fallback) => player.first_name ? `${player.first_name} ${player.last_name}` : fallback;
  const value = (entry) => typeof entry === "number" ? formatNumber(entry) : entry;
  const winner = (entry, side) => typeof entry.left === "number" && entry.left !== entry.right && ((side === "left" && entry.left > entry.right) || (side === "right" && entry.right > entry.left)) ? " compare-winner" : "";

  return (
    <div className="page">
      <section className="section compare-hero">
        <div className="section-title">
          <h2>Head-to-Head Comparison</h2>
          <span className="section-subtitle">Side-by-side player view</span>
        </div>
        <form className="filters compare-filters" method="get">
          <div className="filter-card compare-context-control">
            <label>Week</label>
            <select defaultValue="Season">
              <option>Season</option>
              <option>Week 7</option>
              <option>Week 6</option>
            </select>
          </div>
          <div className="filter-card compare-context-control">
            <label>Split</label>
            <select defaultValue="Overall">
              <option>Overall</option>
              <option>Last 5</option>
            </select>
          </div>
        </form>
      </section>
      <section className="section compare-table-section">
        <table className="table">
          <colgroup><col className="compare-metric-column" /><col /><col /></colgroup>
          <thead>
            <tr>
              <th>Metric</th>
              <th><PlayerSearch label="Player A" side="a" player={left} otherId={playerB} /></th>
              <th><PlayerSearch label="Player B" side="b" player={right} otherId={playerA} /></th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td className={winner(row, "left")}>{value(row.left)}</td>
                <td className={winner(row, "right")}>{value(row.right)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
