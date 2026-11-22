export const TEAM_BROWSER_CONFERENCES = ["AAC", "ACC", "Big East", "Big Ten", "Big 12", "SEC"];

export function groupTeamLinks(teams) {
  const byConference = new Map();
  for (const team of teams) {
    if (!TEAM_BROWSER_CONFERENCES.includes(team.conference)) continue;
    const group = byConference.get(team.conference) || [];
    group.push(team);
    byConference.set(team.conference, group);
  }
  return TEAM_BROWSER_CONFERENCES
    .filter((conference) => byConference.has(conference))
    .map((conference) => ({
      conference,
      teams: byConference.get(conference).sort((a, b) => a.team_name.localeCompare(b.team_name)),
    }));
}

export function teamFilterHref(query, team) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (key === "team" || value == null || value === "") continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  if (team && team !== "All") params.set("team", team);
  const search = params.toString();
  return search ? `/draft/players?${search}` : "/draft/players";
}
