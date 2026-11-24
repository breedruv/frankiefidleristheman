import assert from "node:assert/strict";
import test from "node:test";
import { buildSampleLineup } from "../lib/sampleMatchup.mjs";

const roster = [
  { drafted_position: "C", name: "Center" },
  { drafted_position: "F", name: "Forward One" },
  { drafted_position: "F", name: "Forward Two" },
  { drafted_position: "G", name: "Guard One" },
  { drafted_position: "G", name: "Guard Two" },
  { drafted_position: "F", name: "Reserve One" },
  { drafted_position: "G", name: "Reserve Two" }
];

test("creates a C, F, F, G, G, T1, T2 sample from the drafted roster", () => {
  assert.deepEqual(buildSampleLineup(roster).map((player) => [player.slot, player.name]), [
    ["C", "Center"], ["F1", "Forward One"], ["F2", "Forward Two"], ["G1", "Guard One"], ["G2", "Guard Two"], ["T1", "Reserve One"], ["T2", "Reserve Two"]
  ]);
});
