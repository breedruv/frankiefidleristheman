import { teamFilterHref } from "../../../lib/teamBrowser.mjs";

const sources = [
  ["espn_url", "ESPN"],
  ["cbs_url", "CBS"],
  ["yahoo_url", "Yahoo"],
  ["rotowire_url", "RotoWire"],
];

export default function TeamBrowser({ groups, query, selectedTeam }) {
  return <details className="team-browser">
    <summary><span>Browse teams</span><small>Quick filter and source links</small></summary>
    <div className="team-browser-content">
      <div className="team-browser-heading">
        <p>Choose a team to filter the player pool. Source links open in a new tab.</p>
        {selectedTeam !== "All" && <a className="ghost-pill" href={teamFilterHref(query, "All")}>Clear team: {selectedTeam}</a>}
      </div>
      <div className="team-browser-conferences">
        {groups.map((group) => <details className="team-browser-conference" key={group.conference}>
          <summary>{group.conference}<span>{group.teams.length} teams</span></summary>
          <div className="team-browser-grid">
            {group.teams.map((team) => <div className="team-browser-row" key={team.team_id}>
              <a className={`team-browser-team${selectedTeam === team.team_name ? " active" : ""}`} href={teamFilterHref(query, team.team_name)}>
                <img alt="" src={`https://a.espncdn.com/i/teamlogos/ncaa/500/${team.team_id}.png`} />
                <span>{team.team_name}</span>
              </a>
              <div className="team-browser-sources" aria-label={`${team.team_name} sources`}>
                {sources.map(([field, label]) => <a key={field} href={team[field]} target="_blank" rel="noreferrer">{label}</a>)}
              </div>
            </div>)}
          </div>
        </details>)}
      </div>
    </div>
  </details>;
}
