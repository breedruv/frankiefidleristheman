import { query, hasDatabase } from "./db";
import { supabase, hasSupabase } from "./supabase";

const useSupabase = !hasDatabase && hasSupabase;

const ROSTER_SQL = `
  WITH eligible AS (
    SELECT pg.* FROM player_games pg
    LEFT JOIN games g ON g.game_id = pg.game_id
    WHERE pg.minutes > 0 AND NOT COALESCE(g.is_exhibition, FALSE)
  ),
  latest AS (
    SELECT player_id, MAX(season) AS season FROM eligible GROUP BY player_id
  ),
  filtered AS (
    SELECT e.* FROM eligible e JOIN latest l USING (player_id)
    WHERE e.season IS NOT DISTINCT FROM l.season
  ),
  stats AS (
    SELECT
      player_id,
      MAX(season) AS stats_season,
      AVG(pts) AS ppg,
      AVG(minutes) AS mpg,
      AVG(fgm) AS fgm,
      AVG(fga) AS fga,
      AVG(tpm) AS tpm,
      AVG(tpa) AS tpa,
      SUM(tpm)::NUMERIC / NULLIF(SUM(tpa), 0) * 100 AS three_pct,
      SUM(ftm)::NUMERIC / NULLIF(SUM(fta), 0) * 100 AS ft_pct,
      AVG(fga) AS shots_per_game
    FROM filtered
    GROUP BY player_id
  ),
  last5 AS (
    SELECT player_id, AVG(pts) AS last5_ppg
    FROM (
      SELECT
        player_id,
        pts,
        ROW_NUMBER() OVER (
          PARTITION BY player_id
          ORDER BY game_date DESC NULLS LAST, game_id DESC
        ) AS rn
      FROM filtered
    ) ranked
    WHERE rn <= 5
    GROUP BY player_id
  )
  SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    p.team_id,
    p.headshot,
    p.position,
    COALESCE(t.display_name, t.name, p.team_id::text) AS team_name,
    t.conference_name,
    s.ppg,
    s.mpg,
    s.fgm,
    s.fga,
    s.tpm,
    s.tpa,
    s.three_pct,
    s.ft_pct,
    s.shots_per_game,
    l.last5_ppg,
    p.experience AS year,
    s.stats_season
  FROM players p
  LEFT JOIN teams t ON t.team_id = p.team_id
  LEFT JOIN stats s ON s.player_id = p.player_id
  LEFT JOIN last5 l ON l.player_id = p.player_id
  ORDER BY s.ppg DESC NULLS LAST, p.player_id
  LIMIT $1;
`;

// Pool players only: box-score imports also add opponents from non-pool schools (e.g. Oakland's Chris Fields Jr.).
export async function getRosterSnapshot(limit = 50) {
  return (await getDraftPool(5000)).slice(0, limit);
}

export async function getTopPerformers(limit = 3) {
  return getRosterSnapshot(limit);
}

export async function getHomeStats() {
  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("home_stats", {
      include_dnp: false
    });
    if (error) {
      console.warn("Supabase home_stats error", error.message);
      return null;
    }
    return data?.[0] || null;
  }
  const result = await query(
    `
    SELECT
      (SELECT COUNT(*) FROM players) AS total_players,
      (SELECT COUNT(*) FROM players WHERE is_active IS TRUE) AS active_players,
      (SELECT AVG(pts) FILTER (WHERE minutes > 0) FROM player_games) AS avg_ppg,
      (SELECT COUNT(DISTINCT game_id) FROM player_games) AS total_games;
  `
  );

  return result.rows[0];
}

// Draftable pool: latest ESPN rosters plus reviewed CBS/Yahoo/Lindy's listings. The latter keeps players
// visible when ESPN's roster feed is incomplete, while imports still only include AVAILABLE_TEAMS.
// Returns null when no rosters are loaded so callers fall back to every player rather than an empty pool.
export async function getPoolPlayerIds() {
  if (useSupabase && supabase) {
    const latest = await supabase.from("team_rosters").select("season").order("season", { ascending: false }).limit(1);
    if (latest.error) throw latest.error;
    const season = latest.data?.[0]?.season;
    if (!season) return null;
    const ids = new Set();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("team_rosters").select("player_id").eq("season", season).range(offset, offset + 999);
      if (error) throw error;
      data.forEach((row) => ids.add(Number(row.player_id)));
      if (data.length < 1000) break;
    }
    const { data: sourceRows, error: sourceError } = await supabase
      .from("player_source_listings")
      .select("player_id")
      .eq("season", season)
      .not("player_id", "is", null);
    // Source listings are an optional migration on older deployments.
    if (sourceError && sourceError.code !== "PGRST205") throw sourceError;
    (sourceRows || []).forEach((row) => ids.add(Number(row.player_id)));
    return ids;
  }
  const result = await query(`
    SELECT player_id FROM team_rosters WHERE season = (SELECT MAX(season) FROM team_rosters)
    UNION
    SELECT player_id FROM player_source_listings WHERE season = (SELECT MAX(season) FROM team_rosters) AND player_id IS NOT NULL
  `);
  return result.rows.length ? new Set(result.rows.map((row) => Number(row.player_id))) : null;
}

export async function getDraftPool(limit = 50, filters = {}) {
  const matches = (player) => {
    const conference = filters.conference && filters.conference !== "All" ? filters.conference : null;
    const position = filters.position && filters.position !== "All" ? filters.position : null;
    const team = filters.team && filters.team !== "All" ? filters.team : null;
    const minPpg = filters.minPpg === "" || filters.minPpg == null ? null : Number(filters.minPpg);
    const maxPpg = filters.maxPpg === "" || filters.maxPpg == null ? null : Number(filters.maxPpg);
    return (!poolIds || poolIds.has(Number(player.player_id))) && (!conference || player.conference_name === conference) && (!position || player.position === position) && (!team || player.team_name === team) && (!Number.isFinite(minPpg) || Number(player.ppg) >= minPpg) && (!Number.isFinite(maxPpg) || Number(player.ppg) <= maxPpg);
  };
  let poolIds;
  try {
    poolIds = await getPoolPlayerIds();
  } catch (error) {
    console.warn("Draft pool roster lookup error", error.message);
    return [];
  }
  if (useSupabase && supabase) {
    const rows = [];
    for (let offset = 0; offset < limit; offset += 1000) {
      const { data, error } = await supabase.rpc("roster_snapshot", { include_dnp: false, row_limit: limit }).range(offset, offset + Math.min(999, limit - offset - 1));
      if (error) {
        console.warn("Supabase draft pool error", error.message);
        return [];
      }
      rows.push(...data);
      if (data.length < Math.min(1000, limit - offset)) break;
    }
    return rows.filter(matches);
  }
  const result = await query(ROSTER_SQL, [limit]);
  return result.rows.filter(matches);
}

export async function getDraftedPlayerIds(season = 2026) {
  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from("draft_selections")
      .select("player_id")
      .eq("season", season);
    if (error) {
      console.warn("Supabase drafted player lookup error", error.message);
      return [];
    }
    return (data || []).map((row) => Number(row.player_id)).filter(Number.isFinite);
  }
  return [];
}

export async function getPlayerStatAverages(season = 2025, playerIds = null) {
  if (useSupabase && supabase) {
    if (playerIds?.length) {
      const { data, error } = await supabase
        .from("player_stat_averages")
        .select("*")
        .eq("season", season)
        .in("player_id", playerIds)
        .order("player_id");
      if (error) {
        console.warn("Supabase player stat averages lookup error", error.message);
        return [];
      }
      return data || [];
    }
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("player_stat_averages")
        .select("*")
        .eq("season", season)
        .order("player_id")
        .range(offset, offset + 999);
      if (error) {
        console.warn("Supabase player stat averages lookup error", error.message);
        return [];
      }
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  }
  return [];
}

// Latest imported KenPom ratings (python/import_kenpom.py), keyed by ESPN team id. Empty until db/team-ratings.sql runs.
export async function getLatestTeamRatings(source = "kenpom") {
  if (!useSupabase || !supabase) return new Map();
  const { data: latest, error } = await supabase.from("team_ratings").select("rating_date").eq("source", source).order("rating_date", { ascending: false }).limit(1);
  if (error || !latest?.length) return new Map();
  const { data, error: ratingsError } = await supabase.from("team_ratings").select("team_id,rank,net_rtg,ortg,ortg_rank,drtg,drtg_rank,adj_tempo,adj_tempo_rank,sos_net_rank,rating_date").eq("source", source).eq("rating_date", latest[0].rating_date).not("team_id", "is", null);
  if (ratingsError) return new Map();
  return new Map(data.map((row) => [Number(row.team_id), row]));
}

export async function getPlayerOptions(limit = 200) {
  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("player_options", {
      row_limit: limit
    });
    if (error) {
      console.warn("Supabase player_options error", error.message);
      return [];
    }
    return data || [];
  }
  const result = await query(
    `
    SELECT
      p.player_id,
      p.first_name,
      p.last_name,
      p.position,
      COALESCE(t.display_name, t.name, p.team_id) AS team_name
    FROM players p
    LEFT JOIN teams t ON t.team_id = p.team_id
    ORDER BY p.last_name, p.first_name
    LIMIT $1;
  `,
    [limit]
  );
  return result.rows;
}

export async function getPlayerHeadshots(playerIds = []) {
  if (!playerIds.length) return [];
  if (useSupabase && supabase) {
    const { data, error } = await supabase.from("players").select("player_id,headshot").in("player_id", playerIds);
    if (error) {
      console.warn("Supabase player headshot lookup error", error.message);
      return [];
    }
    return data || [];
  }
  const result = await query("SELECT player_id, headshot FROM players WHERE player_id = ANY($1::integer[])", [playerIds]);
  return result.rows;
}

export async function getPlayerSummaries(playerIds) {
  if (!playerIds || playerIds.length === 0) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("player_summaries", {
      player_ids: playerIds,
      include_dnp: false
    });
    if (error) {
      console.warn("Supabase player_summaries error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(
    `
    WITH target AS (
      SELECT UNNEST($1::text[]) AS player_id
    ),
    stats AS (
      SELECT
        pg.player_id,
        AVG(pg.pts) FILTER (WHERE pg.minutes > 0) AS ppg,
        AVG(pg.minutes) FILTER (WHERE pg.minutes > 0) AS mpg,
        AVG(pg.fgm) FILTER (WHERE pg.minutes > 0) AS fgm,
        AVG(pg.fga) FILTER (WHERE pg.minutes > 0) AS fga,
        AVG(pg.tpm) FILTER (WHERE pg.minutes > 0) AS tpm,
        AVG(pg.tpa) FILTER (WHERE pg.minutes > 0) AS tpa
      FROM player_games pg
      JOIN target t ON t.player_id = pg.player_id
      GROUP BY pg.player_id
    ),
    last5 AS (
      SELECT player_id, AVG(pts) AS last5_ppg
      FROM (
        SELECT
          pg.player_id,
          pg.pts,
          ROW_NUMBER() OVER (
            PARTITION BY pg.player_id
            ORDER BY pg.game_date DESC NULLS LAST, pg.game_id DESC
          ) AS rn
        FROM player_games pg
        JOIN target t ON t.player_id = pg.player_id
        WHERE pg.minutes > 0
      ) ranked
      WHERE rn <= 5
      GROUP BY player_id
    )
    SELECT
      p.player_id,
      p.first_name,
      p.last_name,
      p.position,
      COALESCE(t.display_name, t.name, p.team_id) AS team_name,
      s.ppg,
      s.mpg,
      s.fgm,
      s.fga,
      s.tpm,
      s.tpa,
      l.last5_ppg
    FROM players p
    JOIN target t2 ON t2.player_id = p.player_id
    LEFT JOIN teams t ON t.team_id = p.team_id
    LEFT JOIN stats s ON s.player_id = p.player_id
    LEFT JOIN last5 l ON l.player_id = p.player_id
    ORDER BY p.last_name, p.first_name;
    `,
    [playerIds]
  );

  return result.rows;
}

export async function getWeekOptions(limit = 8) {
  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("week_options", {
      row_limit: limit
    });
    if (error) {
      console.warn("Supabase week_options error", error.message);
      return [];
    }
    return (data || []).map((row) => row.week_start);
  }
  const result = await query(
    `
    SELECT DISTINCT TO_CHAR(date_trunc('week', game_date)::date, 'YYYY-MM-DD') AS week_start
    FROM player_games
    WHERE game_date IS NOT NULL
    ORDER BY week_start DESC
    LIMIT $1;
  `,
    [limit]
  );
  return result.rows.map((row) => row.week_start);
}

export async function getTeamScoreboard(weekStart, limit = 10) {
  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("team_scoreboard", {
      week_start: weekStart,
      row_limit: limit
    });
    if (error) {
      console.warn("Supabase team_scoreboard error", error.message);
      return [];
    }
    return data || [];
  }
  const result = await query(
    `
    SELECT
      COALESCE(t.display_name, t.name, pg.team_id) AS team_name,
      COUNT(DISTINCT pg.game_id) AS games,
      COUNT(DISTINCT pg.player_id) FILTER (WHERE pg.minutes > 0) AS active_players,
      SUM(pg.pts) AS total_points
    FROM player_games pg
    LEFT JOIN teams t ON t.team_id = pg.team_id
    WHERE pg.game_date >= $1::date
      AND pg.game_date < ($1::date + INTERVAL '7 days')
    GROUP BY COALESCE(t.display_name, t.name, pg.team_id)
    ORDER BY total_points DESC NULLS LAST
    LIMIT $2;
  `,
    [weekStart, limit]
  );

  return result.rows;
}

export async function getTeamScoreboardRange(startDate, endDate, limit = 10) {
  if (!startDate || !endDate) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("team_scoreboard_range", {
      start_date: startDate,
      end_date: endDate,
      row_limit: limit
    });
    if (error) {
      console.warn("Supabase team_scoreboard_range error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(
    `
    SELECT
      COALESCE(t.display_name, t.name, pg.team_id::text) AS team_name,
      COUNT(DISTINCT pg.game_id) AS games,
      COUNT(DISTINCT pg.player_id) FILTER (WHERE pg.minutes > 0) AS active_players,
      SUM(pg.pts) AS total_points
    FROM player_games pg
    LEFT JOIN teams t ON t.team_id = pg.team_id
    WHERE pg.game_date >= $1::date
      AND pg.game_date <= $2::date
    GROUP BY COALESCE(t.display_name, t.name, pg.team_id::text)
    ORDER BY total_points DESC NULLS LAST
    LIMIT $3;
  `,
    [startDate, endDate, limit]
  );

  return result.rows;
}

export async function getFantasyWeekOptions(season, seasonType = "regular") {
  if (!season) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("fantasy_week_options", {
      season_param: season,
      season_type_param: seasonType
    });
    if (error) {
      console.warn("Supabase fantasy_week_options error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(
    `
    SELECT
      season,
      season_type,
      week,
      COALESCE(label, 'Week ' || week::text) AS label,
      start_date,
      end_date,
      is_dynamic,
      notes
    FROM fantasy_weeks
    WHERE season = $1
      AND season_type = $2
    ORDER BY week;
  `,
    [season, seasonType]
  );

  return result.rows;
}

export async function getFantasyMatchups(season, seasonType = "regular") {
  if (!season) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from("fantasy_matchups")
      .select("*")
      .eq("season", season)
      .eq("season_type", seasonType)
      .order("week", { ascending: true })
      .order("fantasy_team_id", { ascending: true });
    if (error) {
      console.warn("Supabase fantasy_matchups error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(
    `
    SELECT *
    FROM fantasy_matchups
    WHERE season = $1
      AND season_type = $2
    ORDER BY week ASC, fantasy_team_id ASC;
    `,
    [season, seasonType]
  );
  return result.rows;
}

export async function getFantasyTeams() {
  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from("fantasy_teams")
      .select("fantasy_team_id,name,short_code")
      .order("fantasy_team_id", { ascending: true });
    if (error) {
      console.warn("Supabase fantasy_teams error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(
    `
    SELECT fantasy_team_id, name, short_code
    FROM fantasy_teams
    ORDER BY fantasy_team_id ASC;
    `
  );
  return result.rows;
}

export async function getFantasyLineup({ season, seasonType = "regular", week, teamId } = {}) {
  if (!season || !week || !teamId) {
    return null;
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from("fantasy_lineups")
      .select("*")
      .eq("season", season)
      .eq("season_type", seasonType)
      .eq("week", week)
      .eq("fantasy_team_id", teamId)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("Supabase fantasy_lineups error", error.message);
      return null;
    }
    return data || null;
  }

  const result = await query(
    `
    SELECT *
    FROM fantasy_lineups
    WHERE season = $1
      AND season_type = $2
      AND week = $3
      AND fantasy_team_id = $4
    LIMIT 1;
    `,
    [season, seasonType, week, teamId]
  );
  return result.rows[0] || null;
}

export async function getFantasyLineupScores({ season, seasonType = "regular", week } = {}) {
  if (!season || !week) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("fantasy_lineup_scores", {
      season_param: season,
      season_type_param: seasonType,
      week_param: week
    });
    if (error) {
      console.warn("Supabase fantasy_lineup_scores error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(`SELECT * FROM fantasy_lineup_scores($1, $2, $3);`, [
    season,
    week,
    seasonType
  ]);
  return result.rows;
}

export async function getFantasyLineupDetails({
  season,
  seasonType = "regular",
  week,
  teamId
} = {}) {
  if (!season || !week || !teamId) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("fantasy_lineup_details", {
      season_param: season,
      season_type_param: seasonType,
      week_param: week,
      team_param: teamId
    });
    if (error) {
      console.warn("Supabase fantasy_lineup_details error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(`SELECT * FROM fantasy_lineup_details($1, $2, $3, $4);`, [
    season,
    week,
    teamId,
    seasonType
  ]);
  return result.rows;
}

export async function getNcaaTeams() {
  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from("teams")
      .select("team_id,abbreviation,short_display_name,display_name,name")
      .order("team_id", { ascending: true });
    if (error) {
      console.warn("Supabase teams error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(
    `
    SELECT team_id, abbreviation, short_display_name, display_name, name
    FROM teams
    ORDER BY team_id ASC;
    `
  );
  return result.rows;
}

export async function getFantasyWeekPlayerGames({
  teamId,
  startDate,
  endDate,
  season = null,
  includeDnp = false
} = {}) {
  if (!teamId || !startDate || !endDate) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("fantasy_week_player_games", {
      team_id: teamId,
      start_date: startDate,
      end_date: endDate,
      season,
      include_dnp: includeDnp
    });
    if (error) {
      console.warn("Supabase fantasy_week_player_games error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(
    `SELECT * FROM fantasy_week_player_games($1, $2, $3, $4, $5);`,
    [teamId, startDate, endDate, season, includeDnp]
  );
  return result.rows;
}

export async function getFantasyWeekPlayerSchedule({
  teamId,
  startDate,
  endDate,
  season = null,
  includeCompleted = false
} = {}) {
  if (!teamId || !startDate || !endDate) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("fantasy_week_player_schedule", {
      team_id: teamId,
      start_date: startDate,
      end_date: endDate,
      season,
      include_completed: includeCompleted
    });
    if (error) {
      console.warn("Supabase fantasy_week_player_schedule error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(
    `SELECT * FROM fantasy_week_player_schedule($1, $2, $3, $4, $5);`,
    [teamId, startDate, endDate, season, includeCompleted]
  );
  return result.rows;
}

export async function getFantasyRoster({ teamId, season = null, includeDnp = false } = {}) {
  if (!teamId) {
    return [];
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("fantasy_roster", {
      team_id: teamId,
      season,
      include_dnp: includeDnp
    });
    if (error) {
      console.warn("Supabase fantasy_roster error", error.message);
      return [];
    }
    return data || [];
  }

  const result = await query(`SELECT * FROM fantasy_roster($1, $2, $3);`, [
    teamId,
    season,
    includeDnp
  ]);
  return result.rows;
}

export async function getPlayerProfile(playerId, teamId = null) {
  if (!playerId) {
    return null;
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase.rpc("player_profile", {
      player_id_param: playerId,
      team_id_param: teamId
    });
    if (error) {
      console.warn("Supabase player_profile error", error.message);
      return null;
    }
    return data?.[0] || null;
  }

  const result = await query(
    `
    SELECT
      p.player_id,
      p.first_name,
      p.last_name,
      p.position,
      p.player_number,
      p.height,
      p.display_height,
      p.weight,
      p.experience,
      p.headshot,
      p.team_id,
      COALESCE(t.display_name, t.name, p.team_id::text) AS team_name,
      (
        SELECT fr.player_position
        FROM fantasy_rosters fr
        WHERE fr.player_id = p.player_id
          AND ($2::int IS NULL OR fr.fantasy_team_id = $2::int)
        ORDER BY fr.season DESC
        LIMIT 1
      ) AS player_position
    FROM players p
    LEFT JOIN teams t ON t.team_id = p.team_id
    WHERE p.player_id = $1;
    `,
    [playerId, teamId]
  );
  return result.rows[0] || null;
}

export async function getPlayerGameLog(playerId, limit = 10, season = null) {
  if (!playerId) {
    return [];
  }

  if (useSupabase && supabase) {
    let gameIds = null;
    if (season) {
      const { data: seasonRows, error: seasonError } = await supabase
        .from("player_games")
        .select("game_id")
        .eq("player_id", playerId)
        .eq("season", season);
      if (seasonError) {
        console.warn("Supabase player season game lookup error", seasonError.message);
        return [];
      }
      gameIds = new Set((seasonRows || []).map((row) => Number(row.game_id)));
    }
    const { data, error } = await supabase.rpc("player_game_log", {
      player_id_param: playerId,
      row_limit: season ? 100 : limit
    });
    if (error) {
      console.warn("Supabase player_game_log error", error.message);
      return [];
    }
    return (data || []).filter((game) => !gameIds || gameIds.has(Number(game.game_id))).slice(0, limit);
  }

  const result = await query(
    `
    SELECT
      pg.game_id,
      pg.game_date,
      pg.season,
      pg.team_id,
      COALESCE(t.display_name, t.name, pg.team_id::text) AS team_name,
      CASE WHEN g.home_team_id = pg.team_id THEN g.away_team_id ELSE g.home_team_id END AS opponent_id,
      CASE WHEN g.home_team_id = pg.team_id THEN g.away_team_name ELSE g.home_team_name END AS opponent_name,
      CASE WHEN g.home_team_id = pg.team_id THEN 'Home' ELSE 'Away' END AS home_away,
      COALESCE(g.is_exhibition, FALSE) AS is_exhibition,
      pg.pts,
      pg.minutes,
      pg.fgm,
      pg.fga,
      pg.tpm,
      pg.tpa,
      pg.reb,
      pg.ast,
      pg.stl,
      pg.blocks,
      pg.turnovers
    FROM player_games pg
    LEFT JOIN games g ON g.game_id = pg.game_id
    LEFT JOIN teams t ON t.team_id = pg.team_id
    WHERE pg.player_id = $1
      AND ($3::int IS NULL OR pg.season = $3::int)
    ORDER BY pg.game_date DESC NULLS LAST, pg.game_id DESC
    LIMIT $2;
    `,
    [playerId, limit, season]
  );

  return result.rows;
}
