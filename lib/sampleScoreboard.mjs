const slots = ["C", "F1", "F2", "G1", "G2", "T1", "T2"];
const headshot = (id) => `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${id}.png`;

// Actual first C, two F, and two G draft selections, using their Nov. 19–22 results.
const lineups = {
  AS: [["C", "Matas", "Vokietaitis", 5239838, "TEX", "SUU", 92, 68, 26], ["F1", "Brady", "Koehler", 5312256, "ND", "AUB", 78, 73, 15], ["F2", "Amari", "Allen", 5101833, "ALA"], ["G1", "Andrej", "Stojakovic", 5175007, "ILL", "EIU", 114, 52, 6], ["G2", "Tyler", "Tanner", 5187600, "VAN", "UCF", 82, 74, 23]],
  BJ: [["C", "Vince", "Iwuchukwu", 5105641, "GTWN", "COPP", 84, 60, 29], ["F1", "Tylis", "Jordan", 5144115, "GT", "UGA", 82, 88, 19], ["F2", "Tre", "Singleton", 5226071, "ISU"], ["G1", "Robert", "Wright III", 5060709, "BYU", "UNCO", 98, 54, 0], ["G2", "Dedan", "Thomas Jr.", 4873093, "HOU", "KU", 92, 83, 16]],
  SL: [["C", "Christian", "Gurdak", 5101850, "RUTG", "UNLV", 89, 70, 20], ["F1", "Keyshawn", "Hall", 5075625, "SJU", "SIE", 119, 72, 20], ["F2", "Asim", "Djulovic", 5459441, "BTLR", "NE", 84, 77, 28], ["G1", "Jayden", "Reid", 4895746, "MEM", "EVAN", 82, 62, 13], ["G2", "Braylon", "Mullins", 5196916, "CONN", "ARIZ", 79, 85, 29]],
  MB: [["C", "William", "Berg", 5105857, "WICH", "LUC", 79, 75, 27], ["F1", "Pryce", "Sandfort", 4858604, "NEB", "SDAK", 73, 47, 22], ["F2", "Thomas", "Haugh", 5080489, "FLA", "WVU", 85, 72, 22], ["G1", "Keyshuan", "Tillery", 5196876, "CLT"], ["G2", "Rodney", "Rice", 4684634, "USC", "TAR", 96, 51, 24]],
  "John B": [["C", "Motiejus", "Krivas", 5174954, "ARIZ", "CONN", 85, 79, 18], ["F1", "Baye", "Ndongo", 5142356, "PITT", "CMU", 104, 82, 30], ["F2", "Kanon", "Catchings", 5243212, "UGA", "GT", 88, 82, 19], ["G1", "Dior", "Johnson", 4432741, "UCF", "VAN", 74, 82, 30], ["G2", "Alijah", "Arenas", 5144495, "USC", "TAR", 96, 51, 19]],
  DD: [["C", "Pharrel", "Payne", 5105823, "MD", "WAG", 62, 45, 25], ["F1", "Thijs", "De Ridder", 5311846, "UVA", "L-MD", 103, 61, 18], ["F2", "Tylik", "Weeks", 5313270, "MEM", "EVAN", 82, 62, 14], ["G1", "PJ", "Haggerty", 5106275, "TA&M", "TCU", 97, 92, 29], ["G2", "Je'Shawn", "Stevenson", 5241608, "UNT", "APP", 75, 81, 16]],
  Len: [["C", "Sebastian", "Rancik", 5144392, "FSU", "GB", 87, 63, 24], ["F1", "Ivan", "Kharchenkov", 5311896, "ARIZ", "CONN", 85, 79, 20], ["F2", "Milan", "Momcilovic", 4848637, "UK", "IU", 76, 90, 28], ["G1", "Kanaan", "Carlyle", 4683761, "FAU", "FGCU", 86, 76, 21], ["G2", "Jake", "West", 5221322, "NU", "VT", 70, 87, 19]],
  Brandon: [["C", "Daniel", "Jacobsen", 5144147, "PUR", "OAK", 95, 49, 16], ["F1", "Paulius", "Murauskas", 5174955, "ASU", "OAK", 68, 65, 23], ["F2", "Devin", "Royal", 4895776, "VILL", "MICH", 79, 73, 11], ["G1", "Miles", "Sadler", 5210795, "WVU", "KU", 82, 86, 34], ["G2", "Krystian", "Lewis", 5313381, "TULN", "LT", 67, 74, 20]]
};

function toRow([slot, first_name, last_name, player_id, team_abbr, opponent_abbr, team_score, opponent_score, points]) {
  return {
    slot, first_name, last_name, player_id, headshot: headshot(player_id), team_abbr,
    opponent_abbr: opponent_abbr || null,
    game_date: team_score === undefined ? null : "2026-11-19",
    game_datetime: team_score === undefined ? null : "2026-11-19T01:00:00-05:00",
    status: team_score === undefined ? null : "Final",
    team_score: team_score ?? null, opponent_score: opponent_score ?? null, points: points ?? null
  };
}

export function sampleScoreboard() {
  const codes = ["AS", "BJ", "SL", "MB", "John B", "DD", "Len", "Brandon"];
  const teams = codes.map((short_code, index) => ({ fantasy_team_id: index + 1, short_code, name: short_code }));
  const teamId = new Map(teams.map((team) => [team.short_code, team.fantasy_team_id]));
  const pairs = [["AS", "BJ"], ["SL", "MB"], ["John B", "DD"], ["Len", "Brandon"]];
  const matchups = pairs.flatMap(([one, two]) => [
    { season: 2026, season_type: "regular", week: 1, fantasy_team_id: teamId.get(one), opponent_fantasy_team_id: teamId.get(two) },
    { season: 2026, season_type: "regular", week: 1, fantasy_team_id: teamId.get(two), opponent_fantasy_team_id: teamId.get(one) }
  ]);
  const lineupDetails = new Map(teams.map((team) => [team.fantasy_team_id, [...lineups[team.short_code].map(toRow), ...slots.slice(5).map((slot) => ({ slot }))]]));
  const lineupScores = teams.map((team) => ({ fantasy_team_id: team.fantasy_team_id, starter_points: lineups[team.short_code].reduce((sum, row) => sum + (row[8] || 0), 0), t1_points: 0, t2_points: 0 }));
  return { week: { season: 2026, season_type: "regular", week: 1, label: "Nov. 19–22", start_date: "2026-11-19", end_date: "2026-11-22" }, teams, matchups, lineupScores, lineupDetails };
}
