import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "csv-parse/sync";
import { groupTeamLinks, teamFilterHref } from "../lib/teamBrowser.mjs";

test("groups team links in the draft conference order and sorts teams by name", () => {
  const grouped = groupTeamLinks([
    { conference: "SEC", team_name: "Tennessee Volunteers" },
    { conference: "ACC", team_name: "Duke Blue Devils" },
    { conference: "ACC", team_name: "Boston College Eagles" },
  ]);

  assert.deepEqual(grouped.map((group) => group.conference), ["ACC", "SEC"]);
  assert.deepEqual(grouped[0].teams.map((team) => team.team_name), ["Boston College Eagles", "Duke Blue Devils"]);
});

test("replaces only the team filter while preserving the rest of Player Focus state", () => {
  assert.equal(
    teamFilterHref({ position: "G", stats: "combined", search: "smith", team: "Old team" }, "Duke Blue Devils"),
    "/draft/players?position=G&stats=combined&search=smith&team=Duke+Blue+Devils",
  );
  assert.equal(teamFilterHref({ team: "Duke Blue Devils" }, "All"), "/draft/players");
});

test("keeps representative teams in their current conferences", () => {
  const teams = parse(fs.readFileSync(new URL("../data/team-source-links-2027.csv", import.meta.url), "utf8"), { columns: true });
  const conferenceFor = (name) => teams.find((team) => team.team_name === name)?.conference;

  assert.equal(conferenceFor("Creighton Bluejays"), "Big East");
  assert.equal(conferenceFor("Illinois Fighting Illini"), "Big Ten");
  assert.equal(conferenceFor("Alabama Crimson Tide"), "SEC");
  assert.equal(conferenceFor("South Florida Bulls"), "AAC");
});
