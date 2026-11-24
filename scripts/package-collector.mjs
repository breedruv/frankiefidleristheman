// Builds dist/ffi-collector.zip: only the files the 24/7 PC collector needs, no secrets.
//   npm run collector:package
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const stage = path.join("dist", "ffi-collector");
const zip = path.join("dist", "ffi-collector.zip");
const files = {
  "lib/supabase.js": "lib/supabase.js",
  "lib/liveStats.js": "lib/liveStats.js",
  "lib/liveScoring.mjs": "lib/liveScoring.mjs",
  "lib/injuryCheck.js": "lib/injuryCheck.js",
  "lib/injuries.mjs": "lib/injuries.mjs",
  "lib/draftRules.mjs": "lib/draftRules.mjs",
  "lib/notify.js": "lib/notify.js",
  "lib/collectorSchedule.mjs": "lib/collectorSchedule.mjs",
  "scripts/collector.mjs": "scripts/collector.mjs",
  "scripts/run-collector.cmd": "scripts/run-collector.cmd",
  "python/espn_ingest.py": "python/espn_ingest.py",
  "python/espn_config.py": "python/espn_config.py",
  "docs/collector.md": "docs/collector.md",
  "collector/package.json": "package.json",
  "collector/requirements.txt": "requirements.txt",
  "collector/setup.ps1": "setup.ps1",
  "collector/README.txt": "README.txt",
  "collector/.env.local.example": ".env.local.example"
};

rmSync(stage, { recursive: true, force: true });
rmSync(zip, { force: true });
for (const [from, to] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(stage, to)), { recursive: true });
  cpSync(from, path.join(stage, to));
}
execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${stage}' -DestinationPath '${zip}' -Force`], { stdio: "inherit" });
console.log(`Wrote ${zip}`);
