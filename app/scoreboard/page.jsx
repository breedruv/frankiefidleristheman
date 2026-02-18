import {
  getFantasyWeekOptions,
  getFantasyMatchups,
  getFantasyTeams,
  getFantasyLineupScores,
  getFantasyLineupDetails
} from "../../lib/queries";

export const dynamic = "force-dynamic";

const formatDate = (value) => {
  if (!value) return "--";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
};

const formatShortDate = (value) => {
  if (!value) return "--";
  const [year, month, day] = value.split("-");
  if (!month || !day) return value;
  return `${Number(month)}/${Number(day)}`;
};

const formatPlayerName = (row) => {
  const first = row?.first_name?.trim() || "";
  const last = row?.last_name?.trim() || "";
  if (first && last) {
    return `${first.charAt(0)}. ${last}`;
  }
  return first || last || "--";
};

export default async function ScoreboardPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const season = Number(resolvedSearchParams?.season) || new Date().getFullYear();
  const rawWeekOptions = await getFantasyWeekOptions(season);
  const weekOptions = rawWeekOptions.map((week) => ({
    ...week,
    week: Number(week.week)
  }));
  const selectedWeekNumber = Number(resolvedSearchParams?.week) || (weekOptions[0]?.week ?? null);
  const selectedWeek = weekOptions.find((week) => week.week === selectedWeekNumber) || null;

  const matchups = await getFantasyMatchups(season);
  const fantasyTeams = await getFantasyTeams();
  const teamNameById = new Map(
    fantasyTeams.map((team) => [team.fantasy_team_id, team.name || team.short_code])
  );
  const lineupScores = selectedWeekNumber
    ? await getFantasyLineupScores({ season, week: selectedWeekNumber })
    : [];
  const scoresByTeam = new Map(
    lineupScores.map((row) => [row.fantasy_team_id, row.starter_points ?? 0])
  );
  const weekMatchups = matchups.filter((row) => row.week === selectedWeekNumber);
  const seenPairs = new Set();
  const matchupCards = [];

  weekMatchups.forEach((row) => {
    const teamA = row.fantasy_team_id;
    const teamB = row.opponent_fantasy_team_id;
    if (!teamA || !teamB) return;
    const key = [Math.min(teamA, teamB), Math.max(teamA, teamB)].join("-");
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    const teamAScore = scoresByTeam.get(teamA) ?? null;
    const teamBScore = scoresByTeam.get(teamB) ?? null;
    const primaryTeamId = Math.min(teamA, teamB);
    const teamADisplay = primaryTeamId;
    const teamBDisplay = teamADisplay === teamA ? teamB : teamA;
    matchupCards.push({
      key,
      teamA,
      teamB,
      teamAScore,
      teamBScore,
      primaryTeamId,
      teamADisplay,
      teamBDisplay
    });
  });

  matchupCards.sort((a, b) => {
    return a.primaryTeamId - b.primaryTeamId;
  });

  const teamIds = Array.from(
    new Set(
      weekMatchups.flatMap((row) => [row.fantasy_team_id, row.opponent_fantasy_team_id])
    )
  );
  const lineupDetailsEntries = await Promise.all(
    teamIds.map(async (teamId) => ({
      teamId,
      details: await getFantasyLineupDetails({
        season,
        week: selectedWeekNumber,
        teamId
      })
    }))
  );
  const lineupDetailsByTeam = new Map(
    lineupDetailsEntries.map((entry) => [entry.teamId, entry.details])
  );

  const scoresByTeamFull = new Map(
    lineupScores.map((row) => [row.fantasy_team_id, row])
  );

  const slotOrder = ["C", "F1", "F2", "G1", "G2", "T1", "T2"];
  const slotLabel = (slot) => {
    if (slot.startsWith("F")) return "F";
    if (slot.startsWith("G")) return "G";
    return slot;
  };
  const formatNumber = (value, digits = 1) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "--";
    }
    return Number(value).toFixed(digits);
  };
  const renderTeamBlock = (teamId, opponentId) => {
    const details = lineupDetailsByTeam.get(teamId) || [];
    const detailMap = new Map(details.map((row) => [row.slot, row]));
    const totals = scoresByTeamFull.get(teamId);
    const starterTotal = totals?.starter_points ?? 0;
    const teamTotal = starterTotal;
    const opponentTotal = scoresByTeamFull.get(opponentId)?.starter_points ?? 0;
    const margin = starterTotal - opponentTotal;
    const averageStarters = starterTotal ? starterTotal / 5 : 0;
    const averageMargin = margin / 5;

    return (
      <div className="lineup-block">
        <div className="lineup-header">
          <h3>{teamNameById.get(teamId) ?? `Team ${teamId}`}</h3>
          <span className="section-subtitle">
            vs {teamNameById.get(opponentId) ?? `Team ${opponentId}`}
          </span>
        </div>
        <table className="table lineup-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Player</th>
              <th>Team</th>
              <th>Date</th>
              <th>Points</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {slotOrder.slice(0, 5).map((slot) => {
              const row = detailMap.get(slot);
              const name = row ? formatPlayerName(row) : "--";
              return (
                <tr key={`${teamId}-${slot}`}>
                  <td>{slotLabel(slot)}</td>
                  <td>{name || "--"}</td>
                  <td>{row?.team_abbr ?? "--"}</td>
                  <td>{row?.game_date ? formatShortDate(row.game_date) : "--"}</td>
                  <td>{row?.points ?? "--"}</td>
                  <td>{row?.status ?? "--"}</td>
                </tr>
              );
            })}
            <tr className="lineup-summary">
              <td>Total</td>
              <td>{`Margin ${formatNumber(margin, 0)}`}</td>
              <td>{`Starters ${starterTotal}`}</td>
              <td></td>
              <td><strong>{teamTotal}</strong></td>
              <td></td>
            </tr>
            <tr className="lineup-summary">
              <td>Average</td>
              <td>{`Avg Margin ${formatNumber(averageMargin, 1)}`}</td>
              <td>{`Starters ${formatNumber(averageStarters, 1)}`}</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
            {slotOrder.slice(5).map((slot) => {
              const row = detailMap.get(slot);
              const name = row ? formatPlayerName(row) : "--";
              return (
                <tr key={`${teamId}-${slot}`}>
                  <td>{slot}</td>
                  <td>{name || "--"}</td>
                  <td>{row?.team_abbr ?? "--"}</td>
                  <td>{row?.game_date ? formatShortDate(row.game_date) : "--"}</td>
                  <td>{row?.points ?? "--"}</td>
                  <td>{row?.status ?? "--"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>Scoreboard</h2>
          <form className="week-picker" method="get">
            <span>Week</span>
            <input type="hidden" name="season" value={season} />
            <select name="week" defaultValue={selectedWeekNumber ?? ""}>
              {weekOptions.map((week) => (
                <option key={`${week.season}-${week.week}`} value={week.week}>
                  {`${week.label} (${formatDate(week.start_date)} -> ${formatDate(week.end_date)})`}
                </option>
              ))}
            </select>
            <button className="ghost-pill" type="submit">Apply</button>
          </form>
        </div>
        <p className="section-subtitle">
          Fantasy matchup grid for the selected week. Totals use submitted starting lineups.
        </p>
        {selectedWeek ? (
          <p className="section-subtitle">
            {`${formatDate(selectedWeek.start_date)} -> ${formatDate(selectedWeek.end_date)}`}
          </p>
        ) : null}
        <div className="score-grid">
          {matchupCards.length === 0 ? (
            <div className="card">
              <p className="section-subtitle">No matchups found for this week.</p>
            </div>
          ) : (
            matchupCards.map((matchup) => (
              <div className="card matchup-card" key={matchup.key}>
                {renderTeamBlock(matchup.teamADisplay, matchup.teamBDisplay)}
                <div className="lineup-divider" />
                {renderTeamBlock(matchup.teamBDisplay, matchup.teamADisplay)}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section split">
        <div className="card">
          <div className="section-title">
            <h2>Matchup Notes</h2>
            <span className="section-subtitle">Weekly focus</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            <li>Starter totals exclude DNP games (`MIN = 0`).</li>
            <li>Bench points apply to tiebreaker 1.</li>
            <li>Next highest after top 6 applies to tiebreaker 2.</li>
          </ul>
        </div>
        <div className="card">
          <div className="section-title">
            <h2>Upcoming Schedule</h2>
            <span className="section-subtitle">Next set of featured games</span>
          </div>
          <div className="section">
            <div>
              <span className="tag">Featured</span>
              <h3>Andrew vs Partner</h3>
              <p className="section-subtitle">Tip: Saturday 3:00 PM</p>
            </div>
            <div>
              <span className="tag">Rivalry</span>
              <h3>North Squad vs South Squad</h3>
              <p className="section-subtitle">Tip: Saturday 5:00 PM</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
