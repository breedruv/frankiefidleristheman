import { redirect } from "next/navigation";
import { currentMember } from "../lib/auth";
import { getDraftState } from "../lib/draftState";
import { getFantasyMatchups, getFantasyTeams, getFantasyWeekOptions, getPlayerHeadshots, getPlayerStatAverages, getPlayerSummaries } from "../lib/queries";
import { resolveDashboardMatchup } from "../lib/dashboardMatchup.mjs";
import { buildOpeningTournamentMatchups, buildRegularSeasonMatchups } from "../lib/regularSeasonSchedule.mjs";
import { seasonCalendar } from "../lib/seasonCalendar.mjs";
import { DEFAULT_TEAMS } from "../lib/draftRules.mjs";
import { buildSampleLineup } from "../lib/sampleMatchup.mjs";
import HomeDashboard from "./components/HomeDashboard";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }) {
  const member = await currentMember();
  if (!member) redirect("/scoreboard");
  const resolvedSearchParams = await searchParams;
  const showSample = process.env.NODE_ENV !== "production" && resolvedSearchParams?.sample === "matchup";
  let draftState = { picks: [] };
  let teams = [];
  let matchup = { window: null, team: null, opponent: null };
  try {
    const [draft, fantasyTeams, christmasWeeks, regularWeeks, playoffWeeks] = await Promise.all([
      getDraftState(), getFantasyTeams(), getFantasyWeekOptions(2026, "christmas"),
      getFantasyWeekOptions(2026, "regular"), getFantasyWeekOptions(2026, "playoffs")
    ]);
    draftState = draft;
    teams = fantasyTeams;
    const savedMatchups = (await Promise.all([
      getFantasyMatchups(2026, "christmas"), getFantasyMatchups(2026, "regular"), getFantasyMatchups(2026, "playoffs")
    ])).flat();
    const snake = draftState.snake?.length === 8 ? draftState.snake : DEFAULT_TEAMS;
    const scheduleTeams = teams.length ? teams : snake.map((short_code, index) => ({ fantasy_team_id: index + 1, short_code, name: short_code }));
    const teamIdByCode = new Map(scheduleTeams.map((team) => [team.short_code, team.fantasy_team_id]));
    const fallbackMatchups = [...buildOpeningTournamentMatchups(snake).map((row) => ({ ...row, season_type: "christmas" })), ...buildRegularSeasonMatchups(snake).map((row) => ({ ...row, season_type: "regular" }))]
      .map((row) => ({ ...row, fantasy_team_id: teamIdByCode.get(row.team_code), opponent_fantasy_team_id: teamIdByCode.get(row.opponent_team_code) }));
    const savedWeeks = [...christmasWeeks, ...regularWeeks, ...playoffWeeks];
    matchup = resolveDashboardMatchup({
      weeks: savedWeeks.length ? savedWeeks : seasonCalendar(2026),
      matchups: savedMatchups.length ? savedMatchups : fallbackMatchups,
      teams: scheduleTeams
    });
  } catch (error) {
    console.warn("Home dashboard data is unavailable", error.message);
  }
  const ourTeam = teams.find((team) => team.short_code === "AS");
  const roster = draftState.picks.filter((pick) => pick.team_code === "AS");
  let rosterPlayers = [];
  try {
    const [summaries, seasonStats, priorStats, headshots] = await Promise.all([
      getPlayerSummaries(roster.map((pick) => pick.player_id)),
      getPlayerStatAverages(2027, roster.map((pick) => pick.player_id)),
      getPlayerStatAverages(2026, roster.map((pick) => pick.player_id)),
      getPlayerHeadshots(roster.map((pick) => pick.player_id))
    ]);
    const summaryById = new Map(summaries.map((player) => [Number(player.player_id), player]));
    const seasonStatById = new Map(seasonStats.map((player) => [Number(player.player_id), player]));
    const priorStatById = new Map(priorStats.map((player) => [Number(player.player_id), player]));
    const headshotById = new Map(headshots.map((player) => [Number(player.player_id), player.headshot]));
    const positionPick = { C: 0, F: 0, G: 0 };
    rosterPlayers = roster.slice().sort((a, b) => a.pick_number - b.pick_number).map((pick) => {
      const position = pick.drafted_position;
      positionPick[position] += 1;
      const player = summaryById.get(Number(pick.player_id));
      return {
        playerId: pick.player_id,
        position,
        positionPick: positionPick[position],
        name: player ? `${player.first_name} ${player.last_name}` : `Player ${pick.player_id}`,
        headshot: headshotById.get(Number(pick.player_id)) || null,
        team_name: player?.team_name || null,
        games: seasonStatById.get(Number(pick.player_id))?.games_played,
        ppg: seasonStatById.get(Number(pick.player_id))?.ppg == null ? null : Number(seasonStatById.get(Number(pick.player_id)).ppg),
        last5_ppg: seasonStatById.get(Number(pick.player_id))?.last5_ppg,
        mpg: seasonStatById.get(Number(pick.player_id))?.mpg,
        three_pct: seasonStatById.get(Number(pick.player_id))?.three_pt_percentage,
        ft_pct: seasonStatById.get(Number(pick.player_id))?.free_throw_percentage,
        shots_per_game: seasonStatById.get(Number(pick.player_id))?.shots_per_game,
        prev_games: priorStatById.get(Number(pick.player_id))?.games_played,
        prev_starts: priorStatById.get(Number(pick.player_id))?.games_started,
        prev_ppg: priorStatById.get(Number(pick.player_id))?.ppg,
        prev_mpg: priorStatById.get(Number(pick.player_id))?.mpg,
        prev_last5_ppg: priorStatById.get(Number(pick.player_id))?.last5_ppg
      };
    });
  } catch (error) {
    console.warn("Home roster data is unavailable", error.message);
  }
  let sampleLineups = null;
  if (showSample) {
    const samplePicks = draftState.picks.filter((pick) => ["AS", "BJ"].includes(pick.team_code));
    const summaries = await getPlayerSummaries(samplePicks.map((pick) => pick.player_id));
    const nameById = new Map(summaries.map((player) => [Number(player.player_id), `${player.first_name} ${player.last_name}`]));
    const selected = (teamCode) => samplePicks.filter((pick) => pick.team_code === teamCode).map((pick) => ({
      drafted_position: pick.drafted_position,
      name: nameById.get(Number(pick.player_id)) || `Player ${pick.player_id}`
    }));
    sampleLineups = { home: buildSampleLineup(selected("AS")), away: buildSampleLineup(selected("BJ"), 1) };
  }
  return <HomeDashboard roster={roster} rosterPlayers={rosterPlayers} teamName={ourTeam?.name || "B Town Sparties"} matchup={matchup} sampleLineups={sampleLineups} />;
}
