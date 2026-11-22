import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { groupTeamLinks } from "./teamBrowser.mjs";

function readSourceTeams() {
  const csv = fs.readFileSync(path.join(process.cwd(), "data", "team-source-links-2027.csv"), "utf8");
  return parse(csv, { columns: true, skip_empty_lines: true });
}

export function getTeamBrowserTeams(poolTeamNames) {
  const poolNames = new Set(poolTeamNames);
  return groupTeamLinks(readSourceTeams().filter((team) => poolNames.has(team.team_name)));
}
