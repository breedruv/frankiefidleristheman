import {
  getFantasyWeekOptions,
  getFantasyMatchups,
  getFantasyTeams,
  getFantasyLineupScores,
  getFantasyLineupDetails
} from "../../lib/queries";
import AutoSubmitSelect from "../components/AutoSubmitSelect";
import LiveRefresh from "../components/LiveRefresh";
import { sampleScoreboard } from "../../lib/sampleScoreboard.mjs";
import { formatFocusedGame } from "../../lib/scoreboardFocus.mjs";

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
  const last = row?.last_name?.trim() || "";
  return last || row?.first_name?.trim() || "--";
};

export default async function ScoreboardPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const isSample = process.env.NODE_ENV !== "production" && resolvedSearchParams?.sample === "scoreboard";
  const sample = isSample ? sampleScoreboard() : null;
  const season = Number(resolvedSearchParams?.season) || (isSample ? 2026 : new Date().getFullYear());
  const seasonType =
    typeof resolvedSearchParams?.season_type === "string"
      ? resolvedSearchParams.season_type
      : "regular";
  const rawWeekOptions = isSample ? [sample.week] : await getFantasyWeekOptions(season, seasonType);
  const weekOptions = rawWeekOptions.map((week) => ({
    ...week,
    week: Number(week.week)
  }));
  const selectedWeekNumber = Number(resolvedSearchParams?.week) || (weekOptions[0]?.week ?? null);
  const selectedWeek = weekOptions.find((week) => week.week === selectedWeekNumber) || null;
  const selectedGameParam =
    typeof resolvedSearchParams?.game === "string" ? resolvedSearchParams.game : "overall";

  const weekSelectOptions = weekOptions.map((week) => ({
    value: String(week.week),
    label: `${week.label} (${formatDate(week.start_date)} -> ${formatDate(week.end_date)})`
  }));

  const matchups = isSample ? sample.matchups : await getFantasyMatchups(season, seasonType);
  const fantasyTeams = isSample ? sample.teams : await getFantasyTeams();
  const teamNameById = new Map(
    fantasyTeams.map((team) => [team.fantasy_team_id, team.short_code || team.name])
  );
  const lineupScores = isSample ? sample.lineupScores : selectedWeekNumber
    ? await getFantasyLineupScores({ season, seasonType, week: selectedWeekNumber })
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

  const matchupCardsOrdered = matchupCards.map((matchup, index) => ({
    ...matchup,
    gameIndex: index + 1
  }));

  const selectedGameIndex =
    selectedGameParam !== "overall" ? Number(selectedGameParam) - 1 : null;
  const selectedMatchups =
    Number.isInteger(selectedGameIndex) && selectedGameIndex >= 0
      ? matchupCardsOrdered.slice(selectedGameIndex, selectedGameIndex + 1)
      : matchupCardsOrdered;
  const focusedMatchup = selectedGameParam === "overall" ? null : selectedMatchups[0] || null;
  const otherMatchups = focusedMatchup ? matchupCardsOrdered.filter((matchup) => matchup.key !== focusedMatchup.key) : [];

  const teamIds = Array.from(
    new Set(
      weekMatchups.flatMap((row) => [row.fantasy_team_id, row.opponent_fantasy_team_id])
    )
  );
  const lineupDetailsEntries = isSample ? Array.from(sample.lineupDetails.entries()).map(([teamId, details]) => ({ teamId, details })) : await Promise.all(
    teamIds.map(async (teamId) => ({
      teamId,
      details: await getFantasyLineupDetails({
        season,
        seasonType,
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
  const gameField = (row) => {
    if (!row) return { label: "—", state: "empty" };
    const status = (row.status || "").toLowerCase();
    if (status.includes("final")) return { label: `Final ${row.points ?? "—"}`, state: "final" };
    if (status.includes("progress") || status.includes("live")) return { label: `Live ${row.points ?? "—"}`, state: "live" };
    if (!row.game_datetime) return { label: row.game_date ? formatShortDate(row.game_date) : "Upcoming", state: "upcoming" };
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })
      .format(new Date(row.game_datetime))
      .replace(":00", "")
      .replace(" ", "");
    return { label: `${formatShortDate(row.game_date)} ${time}`, state: "upcoming" };
  };
  const renderTeamBlock = (teamId) => {
    const details = lineupDetailsByTeam.get(teamId) || [];
    const detailMap = new Map(details.map((row) => [row.slot, row]));
    const starterTotal = scoresByTeamFull.get(teamId)?.starter_points ?? 0;
    const starterAverage = starterTotal / 5;

    return <div className="lineup-block">
      <div className="lineup-header"><h3>{teamNameById.get(teamId) ?? `Team ${teamId}`}</h3></div>
      <table className="table lineup-table">
        <thead><tr><th>Pos</th><th>Player</th><th>Game</th></tr></thead>
        <tbody>{slotOrder.flatMap((slot, index) => {
          const row = detailMap.get(slot);
          const game = gameField(row);
          const rows = [];
          if (index === 5) {
            rows.push(<tr className="lineup-summary" key={`${teamId}-total`}><td colSpan="2">Starter total</td><td className="lineup-total-score">{starterTotal}</td></tr>);
            rows.push(<tr className="lineup-average" key={`${teamId}-average`}><td colSpan="2">Starter avg.</td><td>{starterAverage.toFixed(1)}</td></tr>);
          }
          rows.push(<tr key={`${teamId}-${slot}`}><td>{slot}</td><td><strong>{formatPlayerName(row)}</strong><small>{row?.team_abbr ?? "—"}</small></td><td><span className={`scoreboard-game-state ${game.state}`}>{game.label}</span></td></tr>);
          return rows;
        })}</tbody>
      </table>
    </div>;
  };

  const renderFocusedMatchup = (matchup) => {
    const teamA = matchup.teamADisplay;
    const teamB = matchup.teamBDisplay;
    const detailsA = new Map((lineupDetailsByTeam.get(teamA) || []).map((row) => [row.slot, row]));
    const detailsB = new Map((lineupDetailsByTeam.get(teamB) || []).map((row) => [row.slot, row]));
    const totalA = scoresByTeamFull.get(teamA)?.starter_points ?? 0;
    const totalB = scoresByTeamFull.get(teamB)?.starter_points ?? 0;
    const focusedPlayer = (row) => {
      const game = formatFocusedGame(row);
      const initials = formatPlayerName(row).slice(0, 1);
      return <div className="scoreboard-focused-player">
        {row?.headshot ? <img src={row.headshot} alt="" /> : <span className="scoreboard-player-avatar" aria-hidden="true">{initials}</span>}
        <div><strong>{formatPlayerName(row)}</strong><small>{row?.team_abbr ?? "—"}{row?.opponent_abbr ? ` vs ${row.opponent_abbr}` : ""}</small><small className={`scoreboard-focus-game ${game.state}`}>{game.game}</small></div>
        <b>{game.points}</b>
      </div>;
    };
    const lineupRow = (slot) => {
      const a = detailsA.get(slot);
      const b = detailsB.get(slot);
      return <tr className={slot === "T1" ? "scoreboard-tiebreaker" : ""} key={slot}><th>{slot}</th><td>{focusedPlayer(a)}</td><td>{focusedPlayer(b)}</td></tr>;
    };
    return <section className="scoreboard-focus"><div className="scoreboard-focus-heading"><div><span>{isSample ? "Scoreboard sample · local only" : "Focused matchup"}</span><h2>{teamNameById.get(teamA)} <em>vs</em> {teamNameById.get(teamB)}</h2></div><form method="get"><input type="hidden" name="season" value={season} /><input type="hidden" name="season_type" value={seasonType} /><input type="hidden" name="week" value={selectedWeekNumber ?? ""} />{isSample && <input type="hidden" name="sample" value="scoreboard" />}<button className="ghost-pill" type="submit">Back to grid</button></form></div><div className="table-scroll"><table className="table scoreboard-focus-table"><thead><tr><th>Slot</th><th>{teamNameById.get(teamA)}</th><th>{teamNameById.get(teamB)}</th></tr></thead><tbody>{slotOrder.slice(0, 5).map(lineupRow)}<tr className="scoreboard-starter-total"><th>Total</th><td><strong>{totalA}</strong><small>{(totalA / 5).toFixed(1)} starter avg.</small></td><td><strong>{totalB}</strong><small>{(totalB / 5).toFixed(1)} starter avg.</small></td></tr>{slotOrder.slice(5).map(lineupRow)}</tbody></table></div></section>;
  };
  const scoreboardHref = (gameIndex) => {
    const query = new URLSearchParams({ season: String(season), season_type: seasonType, week: String(selectedWeekNumber ?? ""), game: String(gameIndex) });
    if (isSample) query.set("sample", "scoreboard");
    return `/scoreboard?${query}`;
  };

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>Scoreboard</h2>
          <LiveRefresh />
          <div className="header-selects">
            <AutoSubmitSelect
              label="Phase"
              name="season_type"
              options={[
                { value: "regular", label: "Regular" },
                { value: "christmas", label: "Christmas Tournament" },
                { value: "playoffs", label: "Playoffs" }
              ]}
              defaultValue={seasonType}
              hiddenInputs={{
                season: season,
                week: selectedWeekNumber ?? "",
                game: selectedGameParam
              }}
              className="week-picker"
            />
            <AutoSubmitSelect
              label="Week"
              name="week"
              options={weekSelectOptions}
              defaultValue={selectedWeekNumber ? String(selectedWeekNumber) : ""}
              hiddenInputs={{
                season: season,
                season_type: seasonType,
                game: selectedGameParam
              }}
              className="week-picker"
            />
          </div>
        </div>
        <p className="section-subtitle">
          Fantasy matchup grid for the selected week. Totals use submitted starting lineups.
        </p>
        {selectedWeek ? (
          <p className="section-subtitle">
            {`${formatDate(selectedWeek.start_date)} -> ${formatDate(selectedWeek.end_date)}`}
          </p>
        ) : null}
        {focusedMatchup ? <><div className="scoreboard-other-games" aria-label="Other league matchups">{otherMatchups.map((matchup) => <form key={matchup.key} method="get"><input type="hidden" name="season" value={season} /><input type="hidden" name="season_type" value={seasonType} /><input type="hidden" name="week" value={selectedWeekNumber ?? ""} /><input type="hidden" name="game" value={matchup.gameIndex} />{isSample && <input type="hidden" name="sample" value="scoreboard" />}<button type="submit"><span>{teamNameById.get(matchup.teamADisplay)} <b>{matchup.teamAScore ?? "—"}</b></span><em>vs</em><span>{teamNameById.get(matchup.teamBDisplay)} <b>{matchup.teamBScore ?? "—"}</b></span></button></form>)}</div>{renderFocusedMatchup(focusedMatchup)}</> : <div className="score-grid">
          {matchupCardsOrdered.length === 0 ? (
            <div className="card">
              <p className="section-subtitle">No matchups found for this week.</p>
            </div>
          ) : (
            matchupCardsOrdered.map((matchup) => <a className="matchup-card scoreboard-grid-card" key={matchup.key} href={scoreboardHref(matchup.gameIndex)} aria-label={`Open ${teamNameById.get(matchup.teamADisplay)} versus ${teamNameById.get(matchup.teamBDisplay)}`}>{renderTeamBlock(matchup.teamADisplay)}<span className="matchup-vs">vs</span>{renderTeamBlock(matchup.teamBDisplay)}</a>)
          )}
        </div>}
      </section>

    </div>
  );
}
