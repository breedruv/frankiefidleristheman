# 24/7 PC collector

`scripts/collector.mjs` runs every scheduled data job from the always-on PC. Supabase watches its heartbeat and covers live scores through Vercel if the PC goes quiet.

| Job | When | What it does |
| --- | --- | --- |
| Heartbeat | Every 5 min | Writes `sync_log.collector_heartbeat` so Supabase knows the PC is up |
| Live stats | Every 5 min from 5 min before the first relevant tip until all are final | `refreshLiveStats` (source `pc`); lineup games, or every scheduled game with `COLLECTOR_ALL_GAMES=true` |
| Final-stats backstop | Daily, 4am ET | `espn_ingest.py stats --since <3 days ago>`; only games missing stats |
| Schedule refresh | Daily, 5am ET | `espn_ingest.py schedule` (tip-time changes, postponements) |
| Injuries | Daily 10am ET, plus hourly on days Andrew/Sam's roster plays until the last tip | Rotowire injury table → `player_injuries` for Andrew/Sam's roster |

Alerts go to ntfy: a job's first failure and its recovery, ESPN rate limits (once per day), and injury changes for the roster (starters get max priority). Missed daily jobs run as soon as the PC is back, and a failed one retries after 30 minutes.

## 1. Set up the 24/7 PC

Easiest path: run `npm run collector:package` on the dev PC and copy `dist/ffi-collector.zip` to the 24/7 PC. It contains only the collector files (no secrets), and its `README.txt` and `setup.ps1` handle installing packages, the test pass, the startup task, and sleep settings. The manual steps below do the same from a full clone.

1. Install Git, Node.js 22, and Python 3 (tick "Add to PATH"). Disable sleep in Windows power settings.
2. Clone `breedruv/frankiefidleristheman`, then in the repo folder:
   ```
   npm ci
   pip install -r python/requirements.txt
   ```
3. Copy `.env.local` from the dev PC (it needs the Supabase URL and `SUPABASE_SERVICE_ROLE_KEY`) and add:
   ```
   NTFY_TOPIC=<long random topic, e.g. ffi-collector-8f3k2q9x7m>
   COLLECTOR_ALL_GAMES=true   # until draft night; see step 4
   # PYTHON=C:\Path\To\python.exe   # only if "python" is not on PATH
   # OUR_TEAM_CODE=AS                # Andrew/Sam's fantasy team code (default AS)
   ```
   Anyone who knows a ntfy.sh topic can read it, so keep it unguessable. Install the ntfy app on both phones and subscribe to the topic.
4. Test one pass: `npm run collector:once`. It should log a start line, and you should see a `collector_heartbeat` row in `sync_log`.
5. Register the startup task. In PowerShell **as administrator**, from the repo folder:
   ```powershell
   $action = New-ScheduledTaskAction -Execute "$PWD\scripts\run-collector.cmd" -WorkingDirectory $PWD
   $trigger = New-ScheduledTaskTrigger -AtStartup
   $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U
   $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
   Register-ScheduledTask -TaskName "FFI Collector" -Action $action -Trigger $trigger -Principal $principal -Settings $settings
   Start-ScheduledTask -TaskName "FFI Collector"
   ```
   `run-collector.cmd` restarts the collector a minute after any exit and appends output to `logs\collector.log`.

**Draft night (Nov 22):** keep `COLLECTOR_ALL_GAMES=true` until lineups are being entered, then remove it (or set `false`) and restart the task. Lineup mode only follows games for current-week lineup players. Once draft picks are saved, the injury check uses Andrew/Sam's picks automatically.

**Updating code:** `git pull`, `npm ci` if dependencies changed, then `Stop-ScheduledTask "FFI Collector"; Start-ScheduledTask "FFI Collector"`.

## 2. Set up the Supabase failover (live scores only)

1. In Vercel, add an environment variable `CRON_SECRET` (a long random string) and redeploy. The deploy must include `app/api/cron/live-stats`.
2. In the Supabase SQL editor, store the secrets in Vault:
   ```sql
   SELECT vault.create_secret('https://<your-app>.vercel.app', 'collector_app_url');
   SELECT vault.create_secret('<same CRON_SECRET>', 'collector_cron_secret');
   SELECT vault.create_secret('<same NTFY_TOPIC>', 'collector_ntfy_topic');
   ```
3. Run `db/collector.sql`. It creates `player_injuries` and `collector_failover_tick()` and enables pg_cron and pg_net.
4. Once the PC collector is running, schedule the watchdog:
   ```sql
   SELECT cron.schedule('collector-failover', '*/5 * * * *', 'SELECT public.collector_failover_tick()');
   ```

Every 5 minutes it checks the heartbeat. If it is more than 15 minutes old, you get one "PC collector is down" push, and while a regular-season game is in its live window it calls `/api/cron/live-stats` on Vercel (lineup players only). When the heartbeat returns, you get "back online" and the failover stops. Injuries, nightly stats and the schedule refresh wait for the PC. Missed nightly runs catch up when it returns, and injuries are tracked manually meanwhile.

Test the failover: stop the task, wait 15–20 minutes, and confirm the push arrives; then start the task again.

## Checking on it

- `logs\collector.log` on the 24/7 PC
- `sync_log` rows: `collector_heartbeat`, `live_stats`, `stats`, `schedule`, `injuries`, `collector_failover`
- `npm run live:report [YYYY-MM-DD]` for ESPN request counts and failures by source (`pc`, `failover`)
