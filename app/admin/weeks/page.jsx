import { revalidatePath } from "next/cache";
import { getFantasyMatchups, getFantasyTeams, getFantasyWeekOptions } from "../../../lib/queries";
import { supabase, hasSupabase } from "../../../lib/supabase";

const currentSeason = () => new Date().getFullYear();
const DEFAULT_ROW_COUNT = 8;

const hasOverlap = (a, b) => !(a.end < b.start || a.start > b.end);
const formatDate = (value) => {
  if (!value) return "--";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
};

async function addWeeks(formData) {
  "use server";
  if (!hasSupabase || !supabase) {
    return;
  }

  const season = Number(formData.get("season"));
  const rowCount = Number(formData.get("row_count")) || DEFAULT_ROW_COUNT;

  if (!season) {
    return;
  }

  const entries = [];
  for (let i = 1; i <= rowCount; i += 1) {
    const week = Number(formData.get(`week_${i}`));
    const startDate = formData.get(`start_${i}`);
    const endDate = formData.get(`end_${i}`);
    const label = formData.get(`label_${i}`)?.toString().trim() || null;
    const notes = formData.get(`notes_${i}`)?.toString().trim() || null;
    const isDynamic = formData.get(`dynamic_${i}`) === "on";

    if (!week || !startDate || !endDate) {
      continue;
    }

    entries.push({
      season,
      week,
      start_date: startDate,
      end_date: endDate,
      label,
      notes,
      is_dynamic: isDynamic
    });
  }

  if (entries.length === 0) {
    return;
  }

  const { data: existing } = await supabase
    .from("fantasy_weeks")
    .select("week,start_date,end_date")
    .eq("season", season);

  const existingRanges = (existing || []).map((row) => ({
    start: row.start_date,
    end: row.end_date,
    week: row.week
  }));

  const newRanges = entries.map((entry) => ({
    start: entry.start_date,
    end: entry.end_date,
    week: entry.week
  }));

  for (const range of newRanges) {
    for (const other of existingRanges) {
      if (other.week === range.week) continue;
      if (hasOverlap(range, other)) {
        console.warn("Week overlap detected with existing weeks. Adjust dates before saving.");
        return;
      }
    }
  }

  for (let i = 0; i < newRanges.length; i += 1) {
    for (let j = i + 1; j < newRanges.length; j += 1) {
      if (newRanges[i].week === newRanges[j].week) continue;
      if (hasOverlap(newRanges[i], newRanges[j])) {
        console.warn("Week overlap detected within new entries. Adjust dates before saving.");
        return;
      }
    }
  }

  await supabase.from("fantasy_weeks").upsert(entries, { onConflict: "season,week" });

  revalidatePath("/scoreboard");
  revalidatePath("/admin/weeks");
}

async function deleteWeek(formData) {
  "use server";
  if (!hasSupabase || !supabase) {
    return;
  }
  const season = Number(formData.get("season"));
  const week = Number(formData.get("week"));
  if (!season || !week) {
    return;
  }
  await supabase.from("fantasy_weeks").delete().eq("season", season).eq("week", week);
  revalidatePath("/scoreboard");
  revalidatePath("/admin/weeks");
}

async function upsertMatchup(formData) {
  "use server";
  if (!hasSupabase || !supabase) {
    return;
  }
  const season = Number(formData.get("season"));
  const week = Number(formData.get("week"));
  const fantasyTeamId = Number(formData.get("fantasy_team_id"));
  const opponentTeamId = Number(formData.get("opponent_fantasy_team_id"));

  if (!season || !week || !fantasyTeamId || !opponentTeamId) {
    return;
  }

  await supabase.from("fantasy_matchups").upsert(
    [{
      season,
      week,
      fantasy_team_id: fantasyTeamId,
      opponent_fantasy_team_id: opponentTeamId
    }],
    { onConflict: "season,week,fantasy_team_id" }
  );

  revalidatePath("/admin/weeks");
}

async function deleteMatchup(formData) {
  "use server";
  if (!hasSupabase || !supabase) {
    return;
  }
  const season = Number(formData.get("season"));
  const week = Number(formData.get("week"));
  const fantasyTeamId = Number(formData.get("fantasy_team_id"));
  if (!season || !week || !fantasyTeamId) {
    return;
  }
  await supabase
    .from("fantasy_matchups")
    .delete()
    .eq("season", season)
    .eq("week", week)
    .eq("fantasy_team_id", fantasyTeamId);
  revalidatePath("/admin/weeks");
}

export default async function AdminWeeksPage({ searchParams }) {
  const season = Number(searchParams?.season) || currentSeason();
  const weeks = await getFantasyWeekOptions(season);
  const matchups = await getFantasyMatchups(season);
  const fantasyTeams = await getFantasyTeams();
  const teamNameById = new Map(
    fantasyTeams.map((team) => [team.fantasy_team_id, team.name || team.short_code])
  );

  return (
    <div className="page">
      <section className="section">
        <div className="section-title">
          <h2>Week Schedule Admin</h2>
          <span className="section-subtitle">Define custom week start/end dates for the season.</span>
        </div>
        <form className="card" action={addWeeks}>
          <input type="hidden" name="row_count" value={DEFAULT_ROW_COUNT} />
          <div className="filters">
            <div className="filter-card">
              <label>Season</label>
              <input name="season" type="number" defaultValue={season} />
            </div>
          </div>
          <table className="table" style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>Week #</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Label</th>
                <th>Dynamic</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: DEFAULT_ROW_COUNT }).map((_, index) => {
                const row = index + 1;
                return (
                  <tr key={`new-week-${row}`}>
                    <td><input name={`week_${row}`} type="number" min="1" /></td>
                    <td><input name={`start_${row}`} type="date" /></td>
                    <td><input name={`end_${row}`} type="date" /></td>
                    <td><input name={`label_${row}`} type="text" placeholder={`Week ${row}`} /></td>
                    <td style={{ textAlign: "center" }}>
                      <input name={`dynamic_${row}`} type="checkbox" />
                    </td>
                    <td><input name={`notes_${row}`} type="text" placeholder="Notes" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: "1rem" }}>
            <button className="solid-pill" type="submit">Save Weeks</button>
          </div>
        </form>

        <table className="table" style={{ marginTop: "1.5rem" }}>
          <thead>
            <tr>
              <th>Week</th>
              <th>Label</th>
              <th>Start</th>
              <th>End</th>
              <th>Dynamic</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {weeks.length === 0 ? (
              <tr>
                <td colSpan={7}>No custom weeks saved yet.</td>
              </tr>
            ) : (
              weeks.map((week) => (
                <tr key={`${week.season}-${week.week}`}>
                  <td>Week {week.week}</td>
                  <td>{week.label}</td>
                  <td>{formatDate(week.start_date)}</td>
                  <td>{formatDate(week.end_date)}</td>
                  <td>{week.is_dynamic ? "Yes" : "No"}</td>
                  <td>{week.notes ?? "--"}</td>
                  <td>
                    <form action={deleteWeek}>
                      <input type="hidden" name="season" value={week.season} />
                      <input type="hidden" name="week" value={week.week} />
                      <button className="ghost-pill" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Matchups</h2>
          <span className="section-subtitle">Adjust week 15 or any week when standings change.</span>
        </div>
        <form className="card" action={upsertMatchup}>
          <div className="filters">
            <div className="filter-card">
              <label>Season</label>
              <input name="season" type="number" defaultValue={season} />
            </div>
            <div className="filter-card">
              <label>Week</label>
              <input name="week" type="number" min="1" />
            </div>
            <div className="filter-card">
              <label>Team ID</label>
              <select name="fantasy_team_id" defaultValue="">
                <option value="" disabled>Choose team</option>
                {fantasyTeams.map((team) => (
                  <option key={team.fantasy_team_id} value={team.fantasy_team_id}>
                    {team.name} ({team.fantasy_team_id})
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-card">
              <label>Opponent ID</label>
              <select name="opponent_fantasy_team_id" defaultValue="">
                <option value="" disabled>Choose opponent</option>
                {fantasyTeams.map((team) => (
                  <option key={team.fantasy_team_id} value={team.fantasy_team_id}>
                    {team.name} ({team.fantasy_team_id})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button className="solid-pill" type="submit">Save Matchup</button>
          </div>
        </form>

        <table className="table" style={{ marginTop: "1.5rem" }}>
          <thead>
            <tr>
              <th>Week</th>
              <th>Team ID</th>
              <th>Opponent ID</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {matchups.length === 0 ? (
              <tr>
                <td colSpan={4}>No matchups saved for this season.</td>
              </tr>
            ) : (
              matchups.map((matchup) => (
                <tr key={`${matchup.season}-${matchup.week}-${matchup.fantasy_team_id}`}>
                  <td>Week {matchup.week}</td>
                  <td>{teamNameById.get(matchup.fantasy_team_id) ?? matchup.fantasy_team_id}</td>
                  <td>{teamNameById.get(matchup.opponent_fantasy_team_id) ?? matchup.opponent_fantasy_team_id}</td>
                  <td>
                    <form action={deleteMatchup}>
                      <input type="hidden" name="season" value={matchup.season} />
                      <input type="hidden" name="week" value={matchup.week} />
                      <input type="hidden" name="fantasy_team_id" value={matchup.fantasy_team_id} />
                      <button className="ghost-pill" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
