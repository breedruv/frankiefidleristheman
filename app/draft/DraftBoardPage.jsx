import { getDraftPool } from "../../lib/queries";
import DraftCountdown from "../components/DraftCountdown";
import DraftWorkspace from "../components/DraftWorkspace";
import { currentMember } from "../../lib/auth";

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
};

export default async function DraftBoardPage({ searchParams }) {
  const member = await currentMember();
  const publicOnly = process.env.PRE_DRAFT_PRIVATE === "true" && !member;
  const params = await searchParams || {};
  const filters = {
    conference: params.conference || "All",
    position: params.position || "All",
    team: params.team || "All",
    minPpg: params.min_ppg || "",
    maxPpg: params.max_ppg || ""
  };
  const allPlayers = publicOnly ? [] : await getDraftPool(500);
  const draftPool = publicOnly ? [] : await getDraftPool(500, filters);
  const conferences = [...new Set(allPlayers.map((player) => player.conference_name).filter(Boolean))].sort();
  const teams = [...new Set(allPlayers.map((player) => player.team_name).filter(Boolean))].sort();

  return (
    <div className="page draft-board-page">
      {!publicOnly && <div className="draft-subnav"><a className="active" href="/draft/board">Draft Board</a><a href="/draft/players">Player Focus</a><a href="/admin/draft">Draft setup</a></div>}
      <DraftCountdown />
      <DraftWorkspace readOnly={!member} />
      {!publicOnly && <><section className="section">
        <div className="section-title">
          <h2>Draft Prep Board</h2>
          <span className="section-subtitle">Research available players in Player Focus. Record current picks in the carousel above.</span>
        </div>
        <form className="filters" method="get">
          <div className="filter-card">
            <label>Conference</label>
            <select name="conference" defaultValue={filters.conference}>
              <option>All</option>
              {conferences.map((conference) => <option key={conference}>{conference}</option>)}
            </select>
          </div>
          <div className="filter-card">
            <label>Position</label>
            <select name="position" defaultValue={filters.position}>
              <option>All</option>
              <option>G</option>
              <option>F</option>
              <option>C</option>
              <option>G-F</option>
              <option>F-C</option>
            </select>
          </div>
          <div className="filter-card">
            <label>Team</label>
            <select name="team" defaultValue={filters.team}>
              <option>All</option>
              {teams.map((team) => <option key={team}>{team}</option>)}
            </select>
          </div>
          <div className="filter-card">
            <label>PPG Range</label>
            <div className="ppg-range"><input name="min_ppg" type="number" step="0.1" placeholder="Min" defaultValue={filters.minPpg} /><input name="max_ppg" type="number" step="0.1" placeholder="Max" defaultValue={filters.maxPpg} /></div>
          </div>
          <div className="filter-card filter-submit"><button className="solid-pill" type="submit">Apply filters</button><a className="ghost-pill" href="/draft">Reset</a></div>
        </form>
      </section>

      <section className="section">
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
      </section></>}
    </div>
  );
}


