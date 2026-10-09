export const FANTASY_CSV_TABLES = [
  {
    key: "fantasyTeams",
    label: "Fantasy Teams",
    filename: "fantasy_teams.csv",
    table: "fantasy_teams",
    conflict: "fantasy_team_id",
    headers: ["fantasy_team_id", "name", "short_code", "logo_url"]
  },
  {
    key: "fantasyTeamSeasons",
    label: "Fantasy Team Seasons",
    filename: "fantasy_team_seasons.csv",
    table: "fantasy_team_seasons",
    conflict: "season,fantasy_team_id",
    headers: ["season", "fantasy_team_id", "draft_order"]
  },
  {
    key: "fantasyRosters",
    label: "Fantasy Rosters",
    filename: "fantasy_rosters.csv",
    table: "fantasy_rosters",
    conflict: "season,fantasy_team_id,player_id",
    headers: ["season", "fantasy_team_id", "player_id", "player_position"]
  },
  {
    key: "fantasyRosterMoves",
    label: "Roster Moves",
    filename: "fantasy_roster_moves.csv",
    table: "fantasy_roster_moves",
    conflict: "season,player_id,move_date,from_team_id,to_team_id,note",
    headers: ["season", "player_id", "from_team_id", "to_team_id", "move_date", "note"]
  },
  {
    key: "fantasyMatchups",
    label: "Fantasy Matchups",
    filename: "fantasy_matchups.csv",
    table: "fantasy_matchups",
    conflict: "season,season_type,week,fantasy_team_id",
    headers: ["season", "season_type", "week", "fantasy_team_id", "opponent_fantasy_team_id"]
  },
  {
    key: "fantasyLineups",
    label: "Fantasy Lineups",
    filename: "fantasy_lineups.csv",
    table: "fantasy_lineups",
    conflict: "season,season_type,week,fantasy_team_id",
    headers: [
      "season",
      "season_type",
      "week",
      "fantasy_team_id",
      "center_id",
      "center_game_id",
      "forward1_id",
      "forward1_game_id",
      "forward2_id",
      "forward2_game_id",
      "guard1_id",
      "guard1_game_id",
      "guard2_id",
      "guard2_game_id",
      "t1_id",
      "t1_game_id",
      "t2_id",
      "t2_game_id"
    ]
  },
  {
    key: "fantasyWeeks",
    label: "Fantasy Weeks",
    filename: "fantasy_weeks.csv",
    table: "fantasy_weeks",
    conflict: "season,season_type,week",
    headers: ["season", "season_type", "week", "label", "start_date", "end_date", "is_dynamic", "notes"]
  }
];

export const FANTASY_CSV_TABLE_MAP = new Map(FANTASY_CSV_TABLES.map((table) => [table.key, table]));

export const csvHeaderLine = (headers) => headers.join(",");

export const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const makeSampleCsv = (table) => {
  const header = csvHeaderLine(table.headers);
  let sampleRows = [];
  switch (table.key) {
    case "fantasyTeams":
      sampleRows = [
        [1, "B Town Sparties", "BTS", ""],
        [2, "Andrew's Squad", "ASQ", ""]
      ];
      break;
    case "fantasyTeamSeasons":
      sampleRows = [
        [2026, 1, 1],
        [2026, 2, 2]
      ];
      break;
    case "fantasyRosters":
      sampleRows = [
        [2026, 1, 1234567, "C"],
        [2026, 1, 1234568, "G"]
      ];
      break;
    case "fantasyRosterMoves":
      sampleRows = [[2026, 1234567, 1, 2, "2026-01-10", "Trade"]];
      break;
    case "fantasyMatchups":
      sampleRows = [
        [2026, "preseason", 1, 1, 2],
        [2026, "regular", 1, 1, 2]
      ];
      break;
    case "fantasyLineups":
      sampleRows = [
        [2026, "preseason", 1, 1, 1234567, "", 1234568, "", 1234569, "", 1234570, "", 1234571, "", 1234572, "", 1234573, ""],
        [2026, "regular", 1, 1, 2234567, "", 2234568, "", 2234569, "", 2234570, "", 2234571, "", 2234572, "", 2234573, ""]
      ];
      break;
    case "fantasyWeeks":
      sampleRows = [
        [2026, "preseason", 1, "Preseason Week 1", "2026-10-20", "2026-10-26", false, "Preseason tournament"],
        [2026, "regular", 1, "Week 1", "2026-11-01", "2026-11-07", false, "Opening week"]
      ];
      break;
    default:
      sampleRows = [];
  }
  const sample = sampleRows.map((row) => csvHeaderLine(row.map(csvEscape))).join("\n");
  return `${header}\n${sample}\n`;
};
