const easternDay = (value) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(value));
  const valueFor = (type) => parts.find((part) => part.type === type)?.value;
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
};

const byStart = (a, b) => a.start_date.localeCompare(b.start_date) || a.week - b.week;

export function chooseCurrentMatchup({ weeks = [], now = new Date(), tournamentLosses = 0, phase = null } = {}) {
  const day = easternDay(now);
  const priority = phase ? [phase] : tournamentLosses < 2 ? ["christmas", "regular"] : ["regular", "playoffs"];
  const candidates = weeks.filter((week) => priority.includes(week.season_type));
  for (const type of priority) {
    const active = candidates.filter((week) => week.season_type === type && week.start_date <= day && week.end_date >= day).sort(byStart)[0];
    if (active) return active;
  }
  const future = candidates.filter((week) => week.start_date > day).sort((a, b) => priority.indexOf(a.season_type) - priority.indexOf(b.season_type) || byStart(a, b))[0];
  if (future) return future;
  return candidates.sort(byStart).at(-1) || null;
}
