import assert from "node:assert/strict";
import test from "node:test";
import { seasonCalendar } from "../lib/seasonCalendar.mjs";

test("defines the agreed 2026-27 fantasy calendar", () => {
  const calendar = seasonCalendar(2026);

  assert.equal(calendar.length, 24);
  assert.deepEqual(calendar.find((week) => week.season_type === "christmas" && week.week === 1), {
    season: 2026,
    season_type: "christmas",
    week: 1,
    label: "Jeff Crose Memorial - Round 1",
    start_date: "2026-11-30",
    end_date: "2026-12-06",
    is_dynamic: false,
    notes: "Double-elimination tournament: opening round"
  });
  assert.deepEqual(calendar.find((week) => week.season_type === "regular" && week.week === 15)?.start_date, "2027-02-19");
  assert.equal(calendar.filter((week) => week.season_type === "playoffs").length, 2);
});

test("does not seed the 2026-27 calendar for another fantasy season", () => {
  assert.deepEqual(seasonCalendar(2027), []);
});
