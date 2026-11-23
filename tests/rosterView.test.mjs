import assert from "node:assert/strict";
import test from "node:test";
import { supplementalRoster } from "../lib/rosterView.mjs";

test("roster view keeps supplemental picks separate from positional slots", () => {
  const roster = supplementalRoster({
    "12-AS": { name: "Core guard" },
    "13-AS": { name: "Supplemental one" },
    "17-AS": { name: "Supplemental five" }
  });

  assert.equal(roster.count, 5);
  assert.equal(roster.players["AS-0"].name, "Supplemental one");
  assert.equal(roster.players["AS-4"].name, "Supplemental five");
  assert.equal(roster.players["AS--1"], undefined);
});
