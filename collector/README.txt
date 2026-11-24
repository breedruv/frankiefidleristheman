FFI COLLECTOR - 24/7 PC SETUP
=============================

Runs live stats, the 4am ET final-stats catch-up, the 5am ET schedule refresh, Rotowire
injury checks, and the heartbeat Supabase watches. Full details: docs\collector.md in the repo.

ONE-TIME SETUP
1. Install Node.js 22 LTS (nodejs.org) with default options.
2. Install Python 3 (python.org). On the first installer screen, tick "Add python.exe to PATH".
3. Unzip this folder somewhere permanent, e.g. C:\ffi-collector (not Downloads or the Desktop).
4. Copy .env.local.example to .env.local and fill it in. The Supabase values come from the
   dev PC's .env.local. Pick a long random NTFY_TOPIC.
5. Install the ntfy app on both phones and subscribe to that topic.
6. Open PowerShell as administrator (Start > type PowerShell > Run as administrator), then:
       cd "C:\ffi-collector"     (keep the quotes if your path has spaces)
       powershell -ExecutionPolicy Bypass -File .\setup.ps1
   It installs packages, does one test pass, registers the "FFI Collector" startup task,
   starts it, and stops the PC from sleeping on AC power. You should get a
   "Collector started" push.

Also on this PC:
- The task runs at boot without anyone signing in. Keep the Windows account it was
  registered under (don't delete or rename it).
- Optional: Settings > Windows Update > Advanced options > Active hours, so updates restart
  overnight. The task starts again by itself after a reboot.

UPDATING
Unzip the new package over this folder (keep .env.local), then run setup.ps1 again as
administrator. It restarts the collector on the new code.

DRAFT NIGHT
Once lineups are being entered, set COLLECTOR_ALL_GAMES=false in .env.local and run
setup.ps1 again (or reboot).

CHECKING ON IT
- logs\collector.log
- Task Scheduler > Task Scheduler Library > FFI Collector
- Stop: Task Scheduler > FFI Collector > End (and stop node.exe in Task Manager)
