const rows = [
  ["christmas", 1, "Jeff Crose Memorial - Round 1", "2026-11-30", "2026-12-06", false, "Double-elimination tournament: opening round"],
  ["christmas", 2, "Jeff Crose Memorial - Round 2", "2026-12-07", "2026-12-13", false, "Double-elimination tournament"],
  ["christmas", 3, "Jeff Crose Memorial - Round 3", "2026-12-14", "2026-12-20", false, "Double-elimination tournament"],
  ["christmas", 4, "Jeff Crose Memorial - Round 4", "2026-12-21", "2026-12-31", false, "Double-elimination tournament overlaps regular season"],
  ["christmas", 5, "Jeff Crose Memorial - Round 5", "2027-01-01", "2027-01-03", false, "Double-elimination tournament overlaps regular season"],
  ["christmas", 6, "Jeff Crose Memorial - Round 6", "2027-01-04", "2027-01-10", false, "Double-elimination tournament"],
  ["christmas", 7, "Jeff Crose Memorial - Round 7 (if needed)", "2027-01-11", "2027-01-14", true, "Only if the double-elimination tournament requires a seventh round"],
  ["regular", 1, "Regular Season - Week 1", "2026-12-21", "2026-12-31", false, "Holiday scoring window"],
  ["regular", 2, "Regular Season - Week 2", "2027-01-01", "2027-01-03", false, "Friday-Sunday scoring window"],
  ["regular", 3, "Regular Season - Week 3", "2027-01-04", "2027-01-10", false, "Monday-Sunday scoring window"],
  ["regular", 4, "Regular Season - Week 4", "2027-01-11", "2027-01-14", false, "Monday-Thursday scoring window if needed"],
  ["regular", 5, "Regular Season - Week 5", "2027-01-15", "2027-01-17", false, "Friday-Sunday scoring window"],
  ["regular", 6, "Regular Season - Week 6", "2027-01-18", "2027-01-21", false, "Monday-Thursday scoring window"],
  ["regular", 7, "Regular Season - Week 7", "2027-01-22", "2027-01-24", false, "Friday-Sunday scoring window"],
  ["regular", 8, "Regular Season - Week 8", "2027-01-25", "2027-01-28", false, "Monday-Thursday scoring window"],
  ["regular", 9, "Regular Season - Week 9", "2027-01-29", "2027-01-31", false, "Friday-Sunday scoring window"],
  ["regular", 10, "Regular Season - Week 10", "2027-02-01", "2027-02-04", false, "Monday-Thursday scoring window"],
  ["regular", 11, "Regular Season - Week 11", "2027-02-05", "2027-02-07", false, "Friday-Sunday scoring window"],
  ["regular", 12, "Regular Season - Week 12", "2027-02-08", "2027-02-11", false, "Monday-Thursday scoring window"],
  ["regular", 13, "Regular Season - Week 13", "2027-02-12", "2027-02-14", false, "Friday-Sunday scoring window"],
  ["regular", 14, "Regular Season - Week 14", "2027-02-15", "2027-02-18", false, "Monday-Thursday scoring window"],
  ["regular", 15, "Regular Season - Week 15", "2027-02-19", "2027-02-21", false, "Seeded matchup week: 1v8 2v7 3v6 4v5"],
  ["playoffs", 1, "Playoffs - Semifinals", "2027-02-22", "2027-02-28", false, "1v4 and 2v3"],
  ["playoffs", 2, "Playoffs - Finals and Third Place", "2027-03-01", "2027-03-07", false, "W1vW2 and L1vL2"]
];

export function seasonCalendar(season) {
  if (season !== 2026) return [];
  return rows.map(([season_type, week, label, start_date, end_date, is_dynamic, notes]) => ({
    season, season_type, week, label, start_date, end_date, is_dynamic, notes
  }));
}
