import {
  getFantasyMatchups,
  getFantasyRoster,
  getNcaaTeams,
  getFantasyTeams,
  getFantasyWeekOptions,
  getFantasyWeekPlayerSchedule,
  getFantasyLineup
} from "../../lib/queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase, hasSupabase } from "../../lib/supabase";
import RosterGroup from "../components/RosterGroup";
import LineupSelector from "../components/LineupSelector";

async function saveLineup(formData) {
  "use server";
  if (!hasSupabase || !supabase) {
    return;
  }

  const season = Number(formData.get("season"));
  const seasonType = formData.get("season_type")?.toString() || "regular";
  const week = Number(formData.get("week"));
  const fantasyTeamId = Number(formData.get("fantasy_team_id"));

  const parseId = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  const centerId = parseId(formData.get("center_id"));
  const forward1Id = parseId(formData.get("forward1_id"));
  const forward2Id = parseId(formData.get("forward2_id"));
  const guard1Id = parseId(formData.get("guard1_id"));
  const guard2Id = parseId(formData.get("guard2_id"));
  const t1Id = parseId(formData.get("t1_id"));
  const t2Id = parseId(formData.get("t2_id"));
  const centerGameId = parseId(formData.get("center_game_id"));
  const forward1GameId = parseId(formData.get("forward1_game_id"));
  const forward2GameId = parseId(formData.get("forward2_game_id"));
  const guard1GameId = parseId(formData.get("guard1_game_id"));
  const guard2GameId = parseId(formData.get("guard2_game_id"));
  const t1GameId = parseId(formData.get("t1_game_id"));
  const t2GameId = parseId(formData.get("t2_game_id"));

  if (!season || !week || !fantasyTeamId) {
    return;
  }

  if (!centerId || !forward1Id || !forward2Id || !guard1Id || !guard2Id || !t1Id || !t2Id) {
    return;
  }

  await supabase.from("fantasy_lineups").upsert(
    [{
      season,
      season_type: seasonType,
      week,
      fantasy_team_id: fantasyTeamId,
      center_id: centerId,
      center_game_id: centerGameId,
      forward1_id: forward1Id,
      forward1_game_id: forward1GameId,
      forward2_id: forward2Id,
      forward2_game_id: forward2GameId,
      guard1_id: guard1Id,
      guard1_game_id: guard1GameId,
      guard2_id: guard2Id,
      guard2_game_id: guard2GameId,
      t1_id: t1Id,
      t1_game_id: t1GameId,
      t2_id: t2Id,
      t2_game_id: t2GameId
    }],
    { onConflict: "season,season_type,week,fantasy_team_id" }
  );

  revalidatePath("/matchup");
  revalidatePath("/scoreboard");
  redirect(`/matchup?season=${season}&season_type=${seasonType}&week=${week}&saved=1`);
}

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

const normalizePosition = (value) => {
  if (!value) {
    return "";
  }
  const normalized = value.toString().trim().toLowerCase();
  if (["c", "center", "centers"].includes(normalized)) return "C";
  if (["f", "forward", "forwards"].includes(normalized)) return "F";
  if (["g", "guard", "guards"].includes(normalized)) return "G";
  return "";
};

const normalizeStatus = (value) => (value ?? "").toString().trim().toLowerCase();

const parseGameTimeMs = (game) => {
  if (game?.game_datetime) {
    const ms = Date.parse(game.game_datetime);
    if (!Number.isNaN(ms)) return ms;
  }
  if (game?.game_date) {
    const ms = Date.parse(`${game.game_date}T00:00:00Z`);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
};

const isLockedGame = (game, nowMs) => {
  const status = normalizeStatus(game.status);
  if (
    status.includes("final") ||
    status.includes("in progress") ||
    status.includes("progress") ||
    status.includes("live") ||
    status.includes("complete")
  ) {
    return true;
  }
  const gameMs = parseGameTimeMs(game);
  if (gameMs === null) return false;
  return nowMs >= gameMs - 60 * 60 * 1000;
};

const getLockedPlayerIds = (games) => {
  const locked = new Set();
  const nowMs = Date.now();
  games.forEach((game) => {
    if (!game?.player_id) return;
    if (isLockedGame(game, nowMs)) {
      locked.add(String(game.player_id));
    }
  });
  return locked;
};

export default async function MatchupPage({ searchParams }) {
  const teamId = 2;
  const resolvedSearchParams = await searchParams;
  const season = Number(resolvedSearchParams?.season) || new Date().getFullYear();
  const seasonType =
    typeof resolvedSearchParams?.season_type === "string"
      ? resolvedSearchParams.season_type
      : "regular";
  const rawWeekOptions = await getFantasyWeekOptions(season, seasonType);
  const weekOptions = rawWeekOptions.map((week) => ({
    ...week,
    week: Number(week.week)
  }));
  const selectedWeekNumber = Number(resolvedSearchParams?.week) || (weekOptions[0]?.week ?? null);
  const selectedWeek = weekOptions.find((week) => week.week === selectedWeekNumber) || null;
  const matchups = await getFantasyMatchups(season, seasonType);
  const fantasyTeams = await getFantasyTeams();
  const ncaaTeams = await getNcaaTeams();
  const teamAbbrById = new Map(
    ncaaTeams.map((team) => [
      team.team_id,
      team.abbreviation || team.short_display_name || team.display_name || team.name
    ])
  );
  const teamAbbrByIdObject = Object.fromEntries(teamAbbrById);
  const teamNameById = new Map(
    fantasyTeams.map((team) => [team.fantasy_team_id, team.name || team.short_code])
  );
  const currentMatchup = matchups.find(
    (row) => row.week === selectedWeekNumber && row.fantasy_team_id === teamId
  );
  const opponentName = currentMatchup
    ? teamNameById.get(currentMatchup.opponent_fantasy_team_id) ?? `Team ${currentMatchup.opponent_fantasy_team_id}`
    : null;

  const roster = await getFantasyRoster({ teamId });
  const centers = roster.filter((player) => normalizePosition(player.player_position) === "C");
  const forwards = roster.filter((player) => normalizePosition(player.player_position) === "F");
  const guards = roster.filter((player) => normalizePosition(player.player_position) === "G");
  const existingLineup = selectedWeekNumber
    ? await getFantasyLineup({ season, seasonType, week: selectedWeekNumber, teamId })
    : null;
  const weekSchedule = selectedWeek
    ? await getFantasyWeekPlayerSchedule({
        teamId,
        startDate: selectedWeek.start_date,
        endDate: selectedWeek.end_date,
        season,
        includeCompleted: false
      })
    : [];
  const weekScheduleAll = selectedWeek
    ? await getFantasyWeekPlayerSchedule({
        teamId,
        startDate: selectedWeek.start_date,
        endDate: selectedWeek.end_date,
        season,
        includeCompleted: true
      })
    : [];
  const lockedPlayerIds = selectedWeek ? Array.from(getLockedPlayerIds(weekScheduleAll)) : [];

  const gameOptionsByPlayerId = {};
  if (selectedWeek) {
    const grouped = new Map();
    weekScheduleAll.forEach((game) => {
      if (!game?.player_id) return;
      const key = String(game.player_id);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(game);
    });

    grouped.forEach((games, playerId) => {
      const sorted = [...games].sort((a, b) => {
        const aTime = parseGameTimeMs(a);
        const bTime = parseGameTimeMs(b);
        if (aTime && bTime) return aTime - bTime;
        if (aTime) return -1;
        if (bTime) return 1;
        return String(a?.game_id ?? "").localeCompare(String(b?.game_id ?? ""));
      });
      gameOptionsByPlayerId[playerId] = sorted.map((game) => {
        const opponent =
          teamAbbrById.get(game.opponent_id) ??
          game.opponent_name ??
          "--";
        const location = game.home_away ? ` (${game.home_away})` : "";
        return {
          value: String(game.game_id),
          label: `${formatShortDate(game.game_date)} vs ${opponent}${location}`
        };
      });
    });
  }

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>My Team</h2>
          <span className="section-subtitle">Fantasy Team #{teamId} roster</span>
        </div>
        <form className="week-picker" method="get">
          <input type="hidden" name="season" value={season} />
          <select name="season_type" defaultValue={seasonType}>
            <option value="regular">Regular</option>
            <option value="preseason">Preseason</option>
          </select>
          <select name="week" defaultValue={selectedWeekNumber ?? ""}>
            {weekOptions.map((week) => (
              <option key={`${week.season}-${week.week}`} value={week.week}>
                {`${week.label} (${formatDate(week.start_date)} -> ${formatDate(week.end_date)})`}
              </option>
            ))}
          </select>
          <button className="ghost-pill" type="submit">Apply</button>
        </form>
        <p className="section-subtitle">
          {selectedWeek
            ? `Week ${selectedWeek.week}: ${formatDate(selectedWeek.start_date)} -> ${formatDate(selectedWeek.end_date)}`
            : "PPG excludes games with MIN = 0."}
        </p>
      </section>
      <section className="section">
        <div className="card upcoming-matchup">
          <div className="section-title">
            <h2>Upcoming Matchup</h2>
            <span className="section-subtitle">
              {opponentName
                ? `Week ${selectedWeekNumber} vs ${opponentName}`
                : "Matchup scoring will appear once lineups are recorded."}
            </span>
          </div>
          <div className="section">
            <div>
              <span className="tag">Week</span>
              <h3>{selectedWeekNumber ? `Week ${selectedWeekNumber}` : "Week TBD"}</h3>
              <p className="section-subtitle">
                Use the roster table below to verify starters and tiebreakers.
              </p>
            </div>
          </div>

          <div className="matchup-divider" />

          <div className="section-title">
            <h2>Starting Lineup</h2>
            <span className="section-subtitle">Select 1C, 2F, 2G + T1/T2</span>
          </div>
          <form className="section lineup-form" action={saveLineup}>
            <input type="hidden" name="season" value={season} />
            <input type="hidden" name="season_type" value={seasonType} />
            <input type="hidden" name="week" value={selectedWeekNumber ?? ""} />
            <input type="hidden" name="fantasy_team_id" value={teamId} />
            <LineupSelector
              key={`${season}-${seasonType}-${selectedWeekNumber ?? "na"}`}
              centers={centers}
              forwards={forwards}
              guards={guards}
              allPlayers={roster}
              teamAbbrById={teamAbbrByIdObject}
              initialLineup={existingLineup}
              lockedPlayerIds={lockedPlayerIds}
              gameOptionsByPlayerId={gameOptionsByPlayerId}
            />
            <div>
              <button className="solid-pill" type="submit" disabled={!selectedWeekNumber}>
                Submit Lineup
              </button>
            </div>
            {lockedPlayerIds.length > 0 ? (
              <p className="lineup-locked">Players lock 1 hour before tip-off.</p>
            ) : null}
            {resolvedSearchParams?.saved === "1" ? (
              <p className="lineup-success">Lineup saved for Week {selectedWeekNumber}.</p>
            ) : null}
          </form>
        </div>
      </section>



      <section className="section split">
        <div className="card">
          <div className="section-title">
            <h2>Roster</h2>
            <span className="section-subtitle">Grouped by position</span>
          </div>
          <RosterGroup title="Centers" rows={centers} teamAbbrById={teamAbbrByIdObject} />
          <RosterGroup title="Forwards" rows={forwards} teamAbbrById={teamAbbrByIdObject} />
          <RosterGroup title="Guards" rows={guards} teamAbbrById={teamAbbrByIdObject} />
        </div>
        <div className="card">
          <div className="section-title">
            <h2>Upcoming Games</h2>
            <span className="section-subtitle">
              {selectedWeek
                ? `Week ${selectedWeek.week} (${formatDate(selectedWeek.start_date)} -> ${formatDate(selectedWeek.end_date)})`
                : "Select a week to view games."}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Player</th>
                <th>Pos</th>
                <th>Opponent</th>
                <th>H/A</th>
              </tr>
            </thead>
            <tbody>
              {weekSchedule.length === 0 ? (
                <tr>
                  <td colSpan={5}>No upcoming games found for this week.</td>
                </tr>
              ) : (
                weekSchedule.map((game) => (
                  <tr key={`${game.game_id}-${game.player_id}`}>
                    <td>{formatDate(game.game_date)}</td>
                    <td>{`${game.first_name ?? ""} ${game.last_name ?? ""}`.trim()}</td>
                    <td>{game.player_position ?? "--"}</td>
                    <td>{teamAbbrById.get(game.opponent_id) ?? game.opponent_name ?? "--"}</td>
                    <td>{game.home_away ?? "--"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
