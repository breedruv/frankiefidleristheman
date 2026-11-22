import assert from "node:assert/strict";
import test from "node:test";
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
