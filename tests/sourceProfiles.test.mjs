import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceProfile, parsePositions } from "../lib/sourceProfiles.mjs";

test("parsePositions normalizes source formats", () => {
  assert.deepEqual(parsePositions("G/F"), ["G", "F"]);
  assert.deepEqual(parsePositions("g-f"), ["G", "F"]);
  assert.deepEqual(parsePositions("PG"), ["G"]);
  assert.deepEqual(parsePositions("F/C"), ["F", "C"]);
  assert.deepEqual(parsePositions(""), []);
});

test("positions are the union of all sources, with who lists each", () => {
  const profile = buildSourceProfile({ position: "G", height: 77 }, [
    { source: "cbs", position: "G", height_in: 77 },
    { source: "yahoo", position: "G", height_in: 77 },
    { source: "lindys", position: "F", height_in: 78 }
  ]);
  assert.equal(profile.position, "G-F");
  assert.equal(profile.positionSummary, "G (ESPN, CBS, Yahoo) - F (Lindy's)");
  assert.equal(profile.height, 78);
  assert.deepEqual(profile.heightSources, ["Lindy's"]);
  assert.deepEqual(profile.sources, ["ESPN", "CBS", "Yahoo", "Lindy's"]);
});

test("the tallest listing at 6'10\" adds C even when only one source has it", () => {
  const profile = buildSourceProfile({ position: "F", height: 81 }, [{ source: "lindys", position: "F", height_in: 82 }]);
  assert.equal(profile.position, "F-C");
  assert.equal(profile.positionSummary, "F (ESPN, Lindy's) - C (height 6'10\" Lindy's)");
});

test("a listed C does not need the height rule; stand-ins have no ESPN entry", () => {
  const listed = buildSourceProfile({ position: "F", height: 82 }, [{ source: "cbs", position: "C", height_in: 82 }]);
  assert.equal(listed.positionSummary, "F (ESPN) - C (CBS)");
  assert.deepEqual(listed.heightSources, ["ESPN", "CBS"]);
  const standIn = buildSourceProfile(null, [{ source: "yahoo", position: "G", height_in: 79 }]);
  assert.deepEqual(standIn.sources, ["Yahoo"]);
  assert.equal(standIn.position, "G");
});
