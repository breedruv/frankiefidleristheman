# AGENTS.md

## Project Summary
Build a Next.js web app used by Andrew and Sam to draft for their shared fantasy college basketball team and track players throughout the season. The league has eight fantasy teams; two app users does not mean two league teams. The app replaces Google Sheets with richer views, filters, and history. The current priority is a quick draft workflow with readily accessible player stats and availability, alongside in-season tracking.

## Target Users
- Two users: Andrew and Sam, who will manually enter all teams' draft picks.
- Planned: individual sign-ins so Andrew and Sam can manage their respective player shortlists.
- Keep the site open during the building phase. Before the draft, activate restrictions so visitors can view only the draft board; all other pages and their data must be restricted to signed-in Andrew and Sam. Public board access is view-only; pick entry is for Andrew and Sam.
- Hosted on Vercel, repo on GitHub

## Confirmed product identity and access (2026-11-23)
- The public-facing product name is **Fantasy College Basketball**. Do not show “B Town Sparties” to signed-out visitors.
- During the draft, signed-out visitors may view only `/draft/board`, including its Draft View and Roster View. It is read-only, and its header must not include a sign-in link.
- Player Focus, player details, player comparison, personal top 10 lists, and draft research remain private to signed-in Andrew and Sam.
- Player Focus and Compare belong under a private Draft navigation menu. Comparison is draft research, not a public page.
- Save the draft-start snapshot automatically at 7:00 PM Eastern on November 22. It must preserve player stats, rankings, Andrew/Sam top 10 lists, projected PPG, and availability/injury status; filters are excluded.
- After the draft, the public scoreboard becomes the homepage. Individual player pages and all player research remain member-only; operational setup/import tools remain in Admin.
- Rename the Vercel project to `fantasy-college-basketball` when the account owner updates its project settings. Update Supabase Auth URLs if the production address changes.
- Keep routine work local and uncommitted. Push only user-approved major milestones.

### Private dashboard decisions (2026-11-23)
- Andrew and Sam’s shared fantasy team is `AS` (displayed as `A/S` in the historical draft CSV). Treat this stable team code—not a physical draft-board column—as the dashboard team identity.
- 2026 snake-order/team-number mapping is `1=AS, 2=BJ, 3=SL, 4=MB, 5=John B, 6=DD, 7=Len, 8=Brandon`. Generate fantasy matchup schedules from this configured snake order rather than maintaining a separate mapping.
- Saved `draft_selections` are the initial season-roster source of truth: the saved receiving `team_code` owns the player immediately, including block recipients. Current roster reads layer recorded trades over those selections rather than duplicating every pick into `fantasy_rosters`; retain that table only for an explicit override/snapshot if needed.
- Andrew and Sam are full league administrators. Either may enter every team’s official lineup and the full scoreboard; this is not restricted to their own team.
- The signed-in home dashboard is Andrew/Sam’s weekly command center; the signed-out post-draft home remains the public scoreboard.
- Its header identifies B Town Sparties with current rank, season W-L record, and OW record.
- OW (Overall Win) is awarded to the fantasy team with the highest weekly score from its starting five among all eight teams; it is a material standings measure.
- The primary matchup view shows proposed C, F, F, G, G, T1, and T2 slots plus the weekly total. T1 and T2 are explicitly proposed by Andrew/Sam; they are used only if both teams’ starting-five totals tie, then sequentially if T1 also ties.
- Roster rows provide a configurable season PPG or last-five PPG display, injury/availability status, and restrained game-week context. Each player links to their private detail page.
- Weekly highlights include the highest starting-five score and highest starting-five PPG, with the fantasy team shown for each. The average divides by starters who have played in the active scoring period, not all five starters.
- Andrew and Sam need separate, persistent proposed C/F/F/G/G/T1/T2 lineups. Both proposals are visible to both users and persist historically with the relevant scoring window.
- All seven proposed-lineup players are unique. T1 and T2 may use any eligible position.
- Each scoring window stores only each user’s latest proposal, not an edit history. Proposals lock automatically at noon Eastern on Monday (Monday–Thursday window) and Friday (Friday–Sunday window); these are separate dashboard weeks/windows.
- The dashboard displays Andrew’s and Sam’s proposals as mirrored vertical columns—C, F1, F2, G1, G2, then T1 and T2—for quick comparison. Each compact row shows only the slot, player name, and the player’s upcoming college opponent (for example, `C Player Name vs Team B`); detailed stats stay on the private Lineups page to avoid duplication.
- Each user’s Season PPG / Last 5 PPG dashboard choice persists as a personal preference.
- Historical weekly views must show the team, proposals, and data as they stood in that scoring window. Standings rank by `(OW + W) - L`, then OW wins, then season starting-five points.
- After the scoreboard work, build a Jeff Crose Memorial Christmas Tournament page and a Regular Season page for tournament/season results and standings.
- 2026 fantasy calendar: Jeff Crose Memorial Christmas Tournament rounds run Nov. 30–Dec. 6, Dec. 7–13, Dec. 14–20, Dec. 21–31, Jan. 1–3, Jan. 4–10, and Jan. 11–14 only if a seventh double-elimination round is required. Regular season begins Dec. 21 and ends with Week 15, Feb. 19–21; playoffs are Feb. 22–28 (1v4, 2v3) and Mar. 1–7 (W1vW2, L1vL2). The 14 regular-season pairings use the Draft Admin snake order: AS, BJ, SL, MB, John B, DD, Len, Brandon. Import-ready rows: `data/fantasy-import-2026/fantasy_weeks.csv`.
- A matchup automatically advances once both starting fives are final and one leads; do not wait for T1/T2 unless the score is tied. On a starting-five tie, wait for both T1s; on a T1 tie, wait for both T2s. A complete tie through T2 requires review rather than advancing a team. Andrew/Sam must be able to override or reopen a decided matchup for corrections; Christmas advancement uses that final/overridden result.
- Current Matchup selection: choose the active scoring window in Eastern time; otherwise select the next upcoming one, or allow advancing to the next matchup once the current game is complete. During overlap, prioritize the Christmas Tournament while A/S remains alive (fewer than two tournament losses); otherwise prioritize Regular Season. Provide a Christmas/Regular toggle during overlap.
- Christmas Tournament matchups advance automatically from finalized scoring results, with Andrew/Sam admin controls to manually override a bracket result or next pairing when needed.
- Christmas Tournament wins and losses are isolated to the tournament. They do not affect Regular Season W-L, OW, standings, seeding, or playoff qualification.

## Current Scope (MVP)
- In-season tracking and weekly matchups
- Scoreboard dashboard with week selection
- Roster views with player stats and trends
- Draft board with pick entry, franchise-round handling, snake order, and drafted tagging
- Player research with Andrew's and Sam's top 10 lists visible together, separate from the draft board
- Player comparison view
- Lineup history (track when a player was started)
- Manual lineup entry inside the app (current process is text + Excel)

## Data Sources and Updates
- ESPN endpoints (direct, no CSV in scope)
  - Game stats: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event={game_id}`
  - Schedule: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{team_id}/schedule`
  - Roster: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{team_id}/roster`
- Data scope: only teams in `AVAILABLE_TEAMS`
- Update cadence
  - Rosters: once per year
  - Schedule: once per year, including upcoming games (live scoring and lineups need them); re-run for postseason
  - Game stats: daily at 4am ET (finals only)
  - Live stats: every 5 minutes during relevant games, from the 24/7 PC collector (see Data gathering scope)
- Store MIN=0 games and allow toggle in UI queries
- Plays endpoint is skipped (too much data for now)
- Ingestion supports Supabase REST using `SUPABASE_SERVICE_ROLE_KEY` when Postgres is unavailable
- Default path (Option B): Supabase REST for app reads + Python ingest (Supabase REST)

## Data gathering scope (confirmed 2026-11-02)
- Supersedes the earlier "refresh while someone is watching" decision: live updates come from a scheduled job only, every 5 minutes during relevant games. Page visits must not contact ESPN.
- League scores the regular season only; no conference-tournament or NCAA-tournament tracking.
- League rules: no free agents after draft night. The player universe for the season is the 144 players drafted on draft night (8 teams x 18); players move only by trade within that pool.
- Automated jobs: live stats (lineup players), nightly final-stats backstop (games involving teams of the 144 drafted players), schedule refresh (tip-time changes, postponements), and injury/availability.
- Fantasy weeks run Monday–Thursday and Friday–Sunday. Availability should be current daily and again leading into games, including players ruled out after lineups are set.
- Injury scope: only Andrew/Sam's own fantasy roster matters, and their starting five most. If injury collection fails, track it manually (no failover).
- Injury scope expanded (confirmed 2026-11-11): through the draft, cover the full draft pool so injured players (including season-ending injuries Rotowire never lists) are visible during research. Rotowire listings are stored for every pool player; phone alerts stay limited to Andrew/Sam's roster and both top 10 lists, with starters prioritized.
- Availability implementation: `lib/availability.mjs` (pure, tested) and `lib/availability.js` combine active `player_injuries` rows (manual outranks Rotowire) with games missed from loaded regular-season box scores (flagged when a player has played none of his team's games or missed the last two). Badges appear in Player Focus, both top 10 lists, pick search, and the franchise reference; the expanded player detail shows the summary and lets Andrew or Sam set or clear a manual Out for season / Out / Game Time Decision flag via `/api/injuries`. Table setup: `db/player-injuries.sql`.
- Injury sources (researched 2026-11-02): ESPN's college injury feed and roster injury fields were empty on opening night, and CBS's injury page renders client-side. Rotowire's public table (`/cbasketball/tables/injury-report.php?team=ALL&pos=ALL`) returns JSON with team, position, injury, and status; return dates are subscriber-only, and it listed only 5 players on opening night. Its robots.txt allows generic crawlers, but its terms of use have not been reviewed. Official availability reports exist for ACC, Big East, Big Ten, Big 12, and SEC conference games only (night before plus about 2 hours pre-tip); the AAC policy is unconfirmed and non-conference games have none.
- Injury source (confirmed 2026-11-03): Rotowire's JSON injury table for the daily checks, filtered to Andrew/Sam's roster. Official conference reports are reference links only; a manual Out/GTD flag is the fallback.
- Draft night is 2026-11-22 at 7pm. The 144-player pool and Andrew/Sam's roster do not exist until then.
- Hosting (confirmed): the 24/7 PC (not Andrew's dev PC) is primary for all jobs. Supabase pg_cron calling Vercel is a failover for live scores only, used when the PC stops reporting.
- Collector implementation: `scripts/collector.mjs` (started by `scripts/run-collector.cmd` via the "FFI Collector" scheduled task) runs live stats, the 4am ET final-stats backstop, the 5am ET schedule refresh, and Rotowire injury checks (10am ET daily, plus hourly on roster game days until the last tip), and writes a `sync_log.collector_heartbeat` every 5 minutes. Pure timing and injury-matching helpers: `lib/collectorSchedule.mjs`, `lib/injuries.mjs` (tested). Injuries: `lib/injuryCheck.js` → `player_injuries` (`rotowire` and `manual` sources). Alerts: `lib/notify.js` (`NTFY_TOPIC`). `COLLECTOR_ALL_GAMES=true` follows every scheduled game until lineups exist.
- Failover implementation: `db/collector.sql` defines `collector_failover_tick()` (pg_cron every 5 minutes; secrets in Supabase Vault). With a heartbeat older than 15 minutes, it pushes one ntfy alert and calls `/api/cron/live-stats` (`CRON_SECRET` bearer, exempt from member checks) while a game is in its live window. Setup and operations: `docs/collector.md`.
- `/api/live-stats` is read-only (last refresh result for the scoreboard label); page visits never contact ESPN.
- Fantasy weeks, matchups, draft results, and all teams' lineups are entered in the app by Andrew or Sam.
- Failures and rate limiting alert by phone push via ntfy.
- ESPN team roster refresh is not an automated job (rosters stay yearly).
- Shot maps (added 2026-11-20): field-goal attempts (no free throws) with court coordinates come from each game summary's plays, keyed by the shooter's ESPN id, into `player_shots`. The 4am stats backstop saves shots from the summaries it fetches; the collector then runs `espn_ingest.py shots` (daily, last 3 days) for final games that have box scores but no shots, since live scoring finalizes most games without plays. Backfill a season with `python python/espn_ingest.py shots --use-supabase --season 2027`.
- Previous season (2025-26, ESPN season 2026; added 2026-11-20): `python/import_prior_season.py --season 2026 --apply` loads regular-season box scores (with ESPN's `starter` flag) and shots for every current pool player, wherever he played, using each player's ESPN game log; responses are cached in `.cache/espn/`. `player_stat_averages` holds season averages, games started, and last five. Player Focus shows optional 25-26 GP/GS/PPG/MPG/Last 5 columns, and the expanded player shows the 2025-26 last five games with Started/Bench. Games stored under the old label `season = 2025` are 2025-26 games; the import relabels the ones it loads.
- Rotowire links (added 2026-11-22): `python/rotowire_players.py --apply` writes each pool player's Rotowire page to `player_links` (site `rotowire`; table in `db/player-links.sql`). Rotowire team ids (about 1200-1800) are scanned via `/cbasketball/tables/team-roster.php`, each roster is matched to the pool team sharing the most names, then players match by name, jersey + last name, or first + final surname word. Players missing from Rotowire's roster tables fall back to the player sitemap only when one page has the name and that page links to his current team. First load: 1,396 of 1,403 linked; the 7 without a Rotowire page are in `rotowire-player-links-review.csv`. Player Focus and franchise-list details show the link.
- Exhibition games removed (2026-11-22, Andrew): the 124 exhibition games and their 1,959 `player_games` rows were deleted because they caused more issues than they helped. They are saved in `backups/exhibition-games-2027-20261122.json` (restore by upserting `games`, then `player_games`); the source workbook is unchanged. The exhibition switch in Player Focus now has no data to add.
- KenPom ratings (added 2026-11-23): kenpom.com blocks automated requests (Cloudflare challenge, subscriber login, AI crawlers disallowed), so it is not scraped. Andrew or Sam saves the ratings page from a browser and `python/import_kenpom.py <saved .html> --apply` stores every team in `team_ratings` (source `kenpom`; `db/team-ratings.sql`) under the page's data-through date, matched to ESPN team ids (`KENPOM_ALIASES` for UConn, Miami, NC State, Ole Miss). Player Focus shows the latest team rank as a "KenPom" column and the full line in the expanded player. Barttorvik's free daily CSV was offered as an automated alternative and not chosen.
- Draft pool lists (home top performers, Roster) show pool players only; box-score imports also add non-pool opponents such as Oakland's Chris Fields Jr.

## Live scoring (confirmed 2026-11-01)
- Superseded 2026-11-02 (see Data gathering scope): open scoreboard pages poll `/api/live-stats`; the server reaches ESPN at most once per minute (`sync_log.run_type = 'live_stats'`).
- One daily scoreboard request (`/scoreboard?dates=YYYYMMDD&groups=50`) gives every game's state; `summary` is fetched only for in-progress games involving players in the current week's fantasy lineups, plus one final fetch when such a game ends.
- Without `groups=50` the scoreboard returns only featured (Top 25) games. With it, a 2026-11-02/03/06 check matched every scheduled `AVAILABLE_TEAMS` game. As a safety net, lineup games that have started per the `games` schedule but are missing from the scoreboard get a direct `summary` check.
- The full 2026-27 regular-season schedule (including upcoming games) is loaded with `npm run sync:schedule`; re-run it when postseason games are scheduled.
- In-progress stats go to the separate `live_player_games` table, only for players on the scoreboard (current-week lineup players). It exists so season averages never include partial games, and to support a future league-wide live scoreboard.
- On final, the full box score for all known players is written to `player_games` and that game's live rows are deleted. The 4am job remains the backstop.
- Unconfirmed: the Sheets-era daily rate limit may have been Apps Script's fetch quota, not ESPN. `sync_log` details record `espn_requests` per run so this can be tested.
- Rate-limit testing (started 2026-11-02): every ESPN request from the live refresh is logged to `espn_request_log` (source `web`/`pc`, endpoint, status, latency). `npm run live:report [YYYY-MM-DD]` summarizes a day.
- If the scoreboard request fails, the refresh continues with direct `summary` calls for every started, non-final scheduled game. A 403/429 on `summary` stops that run's remaining summary calls.
- PC ingest: `npm run live:loop` (lineup games) or `npm run live:loop:all` (every scheduled `AVAILABLE_TEAMS` game; still writes live rows only for lineup players, and writes final box scores for all). It shares the one-run-per-minute lock with the web refresh. Confirmed 2026-11-02: the loop waits for the first relevant tip of the ET game day (4am–4am ET), sleeps through gaps until the next tip, and exits once every relevant game is final; `--hours` is only a safety cap.
- Open question to answer from the logs: whether summaries keep working when the scoreboard is limited, and whether PC and Vercel IPs are limited independently.
- Planned UI: full league scoreboard with the ability to focus on individual matchups.
- Implementation: `lib/liveScoring.mjs` (pure helpers, tested), `lib/liveStats.js` (refresh; writes `player_games` before marking a game Final so failed writes retry), `app/api/live-stats/route.js` (read-only), `app/api/cron/live-stats/route.js` (failover), `app/components/LiveRefresh.jsx`.

## League Scoring Rules
- Weekly matchup against one opponent
- Starting lineup is exactly 1 Center, 2 Forwards, 2 Guards
- Weekly score is sum of points for the selected week
- The weekly score is **only** the starting-five total. Never add T1 or T2 to that total for display, standings, saved results, or tiebreaker evaluation. Compare T1 to T1 only when starter totals tie; compare T2 to T2 only when both starter totals and T1 totals tie.
- Tiebreakers
  - Tiebreaker 1: next highest player outside the starting five
  - Tiebreaker 2: next highest player outside the top six

## Key Metrics (must surface)
- Points per game (PPG), with toggle to include/exclude `MIN = 0`
- Minutes per game (MPG)
- Field goals attempted (FGA)
- Field goals made (FGM)
- 3PT attempts (3PA)
- 3PT made (3PM)
- Averages for overall season and last 5 games

## Draft Board Requirements
- Filters by conference, position, team
- Points per game range filter
- PPG toggle to include/exclude `MIN = 0`
- Drafted tag per player and ability to hide drafted players

## Confirmed Draft Workflow (2026-10-20)
- Andrew and Sam use the app together for research and manually record picks for every league team. Other owners do not submit their own picks through the app.
- Primary goal: quickly access player stats, identify available players, and decide whom their shared team wants to draft.
- The franchise round consists of the first eight franchise slots, one per fantasy team. Blocks can complete slots out of order, so do not infer the active owner solely from the number of saved picks.
- After the franchise round, snake-draft selections strictly follow the configured pick order.
- The layout for current/next pick information is still being discussed; a compact strip or carousel redesign has not been approved.
- The draft board is one live page. Do not show the 2026 Setup, Pick 40 Simulation, or 2025 History board views.
- The pick carousel does not need a "Current pick" jump button for now.
- Clicking the current pick in the carousel or draft board should expand player search directly beneath that pick. Future slots are display only.
- The carousel and board should share draft state refreshes instead of polling the same endpoints independently.
- Keep the draft board page focused on the board, a compact read-only view of both personal top 10 lists, and a private franchise reference; player-pool filters and the full research table belong in Player Focus.
- The active pick opens a compact search anchored to its carousel card or board cell. After a blockable franchise player is selected, show Allowed and Blocked choices beneath that player; a block awards the player to the previous owner and leaves the initiating team on the clock.
- The franchise reference is one player list with a previous fantasy-team filter. Show each player's photo, prior owner, college, position, current stats, and a clear franchiseable, unrestricted, or drafted status. Only players in the current draftable pool are labeled franchiseable.

### Franchise selection and blocking
- Every player in the current season's pool is available for franchise selection. Previous-season ownership creates a possible blocking right, not a restriction on who can be selected.
- An owner can select an unrestricted player, select an available player from another owner's previous-season roster, or directly retain an available player from their own previous-season roster.
- A block is allowed only during the franchise round and only by the owner whose previous-season roster contains the selected, still-available player.
- Only owners with an unfilled franchise slot can block. A block serves as that owner's franchise pick; after completing their slot by any method, they cannot block any later selection.
- A successful block awards the player to the blocker for the new season and completes the blocker's franchise slot. The original picker keeps their turn and selects again.
- Overall selection order and scheduled franchise turn order are distinct. A blocked selection counts as an actual selection awarded to the blocker, including first overall if it is the first award; it does not consume the original picker's franchise turn. Preserve both the initiating team and receiving team when recording a block.
- In the pick carousel, label a blocked selection with the initiating team, e.g. "Blocked Len" on D/D's P.J. Haggerty selection. Keep the original picker shown as choosing again until their franchise slot is complete.
- The blocker gets no further franchise selection and is skipped if their scheduled franchise turn has not yet occurred. They participate normally in the snake draft.
- Completing a franchise slot by an unblocked selection, direct retention, or block releases that owner's remaining previous-season roster into the unrestricted pool for the new season. Players already awarded are not released.
- Example: Andrew selects Player A from Sam's 2025 roster for 2026. Sam blocks and receives Player A. Sam's franchise slot is complete, his remaining available 2025 players become unrestricted, and Andrew chooses again.
- Example: Andrew selects Player B from the unrestricted pool, or retains a player from his own 2025 roster. Andrew's franchise slot is complete and his remaining available 2025 players become unrestricted.
- Actual 2025 example: D/D owned P.J. Haggerty, J.T. Toppin, and Trey Kauffman-Renn and was scheduled third. Len, scheduled first, selected Haggerty; D/D blocked and received Haggerty as its franchise player and the first overall selection. D/D's remaining roster immediately became unrestricted. Len then selected Toppin, and John B selected Kauffman-Renn. D/D had no further franchise pick or blocking right.

### Personal top 10 lists
- Provide separate Andrew and Sam top 10 lists, managed through their individual sign-ins.
- Both lists must be easily visible at the same time within the private Player Focus board alongside player research. Show a compact read-only view of both lists on the draft board for signed-in Andrew and Sam; list editing remains in Player Focus.
- Each signed-in user can edit only their own list; the other user's list is visible but read-only. Enforce ownership on the server as well as in the UI.
- Users should be able to add players while researching. Drafted players remain greyed out in their existing shortlist slots, count toward the ten-player limit, and must be manually removed. Do not automatically remove them, shift rankings, or backfill their slots when drafted.
- Use Move up / Move down controls to manually reorder players without deleting and re-adding them. Do not automatically sort either list.
- The Player Focus pool lets each browser choose visible columns while keeping Player visible. Shooting percentages use total makes divided by total attempts; show no percentage when a player has no attempts.
- Player Focus PPG, MPG, shooting percentages, and last-five stats use the active draft's ESPN source season (`DRAFT_SEASON + 1`). Before a player has a regular-season game in that season, Regular season stats stay blank rather than falling back to a prior year. The ESPN season differs from the fantasy draft year; keep it available as an optional pool column.
- Player Focus has an in-place "Include exhibitions in stats" switch. Off shows regular-season games only; on recomputes averages and last-five from regular plus exhibition games in the active ESPN source season. Missing stats stay blank. Exhibition box scores with missing minutes count toward other averages, while MPG uses reported minutes only.
- The draft board franchise list retains its separate Regular Season / Exhibitions choice, including the top-10 PPG. Franchise-list player rows expand to show mode-specific recent games and a regular-season shot map; exhibition mode has no shot map. Exhibition games are labeled in the game log.
- Andrew confirmed Draft.csv is the correct end-of-2025 fantasy-roster ownership snapshot for the 2026 franchise round. Use it when 2025 fantasy_rosters has not been loaded; do not infer ownership from NCAA rosters.
- ESPN 100 is a freshman-only ranking with one eligible ranking year per player; display its year with the ranking and do not treat it as a multi-year player history.
- Previous-season PPG rank is the player's rank among all players available in that season's player pool, calculated from that season's PPG.
- Draftable player pool is limited to teams in the AAC, ACC, Big East, Big Ten, Big 12, and SEC for the active season. Conference membership should come from the current ESPN team metadata so realignment changes eligibility without manually rewriting the pool.
- Pool membership (implemented 2026-11-11): players on the latest season's `team_rosters` (the roster sync loads only `AVAILABLE_TEAMS`). `getPoolPlayerIds` in `lib/queries.js` filters Player Focus, pick search/validation, shortlists, and the franchise reference, so players added by exhibition imports (non-pool opponents) or who left a pool team are excluded even though they remain in `players`.
- ESPN's source season can be one year ahead of the fantasy draft label (for example, ESPN season 2027 represents the 2026 fantasy draft pool). Preserve the ESPN season value and keep the fantasy draft season as a separate application concept.
- Season-specific player attributes such as class/year, position, height, weight, and team should be preserved by player and source season rather than overwriting the current player profile.
- Additional roster sources (started 2026-11-11): CBS Sports and Yahoo Sports team rosters, plus a Lindy's magazine CSV supplied by Andrew, will eventually be combined into one database (design still to be discussed). `python/source_rosters.py` fetches CBS and Yahoo rosters for `AVAILABLE_TEAMS` into review CSVs under `source-rosters/` (no database writes). ESPN IDs are filled only for same-team name matches; other matches stay as review candidates.
- Combined sources rules (confirmed 2026-11-11):
  - Draft eligibility: every player listed by any source (ESPN, CBS, Yahoo, Lindy's) on a pool team is draftable, even without an ESPN ID.
  - Position eligibility: the union of all sources' positions. Example: ESPN, CBS, and Yahoo list G and Lindy's lists F, so he is a G-F who can be drafted at either position. Store which sources list each position, e.g. "G (ESPN, CBS, Yahoo) - F (Lindy's)".
  - Height: use the tallest listing, which counts toward the 6'10" C rule. Store which source supplied it.
  - Lindy's rankings: `2027/2026-2027_lindy_top_150.csv` (rank, name, team, ESPN id) and `2027/2026-2027_lindy_top_100_freshman.csv` (rank, name, ESPN id, team) load into `player_rankings` with the same import script. They appear as optional Player Focus columns ("Lindy's Top 150" shown by default, "Lindy's Top Fr") and in the player detail. Ranked players outside the pool or without an id are stored but not shown.
  - ESPN 100 (added 2026-11-11): the class of 2026 recruiting rankings (this season's freshmen) are collected with the College-Basketball repo's `collect_espn_recruiting_rankings.py --classes 2026` into `2027/espn100-class-2026.csv` and load into `player_rankings` (source `espn`, list `top100`). ESPN recruit ids differ from player ids, so recruits match by college + name; nickname matches are in `REVIEWED_RECRUITS`. Shown as the optional "ESPN 100 ('26)" Player Focus column and in the player detail. Rank columns sort #1 first on the first click.
  - In-season roster refreshes are out of scope: after the draft, only the 144 drafted players matter.
  - Implementation: `db/player-source-listings.sql` stores every CBS, Yahoo, and Lindy's row, and `python/import_source_listings.py --apply` loads it (dry run by default; reviewed spelling-variant links live in `REVIEWED_LINKS`). Players listed by CBS/Yahoo but absent from ESPN get negative stand-in ids in `players` and `team_rosters` (`-CBS id`, or `-(1e9 + Yahoo id)`); they have no stats. `lib/sourceProfiles.mjs` (pure, tested) builds eligible positions, tallest height, and per-source detail; `lib/sourceProfiles.js` applies it to pick search/validation, Player Focus, and the franchise reference (ESPN-only until the table exists).
  - Lindy's file fixes (2026-11-11, backup `2026-2027_lindys.before-fixes-20261111.csv`): line 1204 -> Trent Burns 5169569, 912 -> Malachi Palmer 5239554, 180 Smrekar -> 5351298, 77 -> Tristan Vukotic 5458687. Lindy's rows without ESPN ids are players not playing this season; they are stored unlinked and not draftable. A duplicated ESPN id keeps the row whose jersey matches ESPN.
- ESPN's roster feed omits some active players who appear in its box scores (e.g., Jakub Szumert, SMU, F, added manually 2026-11-11; Lucas Morillo, Illinois, added and Malique Ewin, Oregon, and Zak Smrekar, Boston College, restored to the 2027 rosters the same day; duplicate Onyeka Joe Agu ID 5458353 removed from the USC roster in favor of 5388939; Robbie Avila, TCU, C, 4917097, added 2026-11-22). Box-score imports drop players missing from `players`, so such players must be added to `players` and the latest `team_rosters` season; the yearly roster sync upserts and does not remove them.
- Reviewed school roster photos can fill missing ESPN headshots. Import them with `python/import_player_photos.py`; a future ESPN roster sync should preserve the school photo when ESPN has no headshot and replace it when ESPN supplies one.

### Exhibition game collection
- The manual exhibition source workbook is `College-Basketball-Exhibition-Box-Scores-2026(1).xlsx`; imported exhibition games use `games.is_exhibition = true` and retain workbook IDs such as `G01` in `games.source_game_label`.
- Exhibition collection is separate from the ESPN schedule/stat pipeline. Only games explicitly identified as exhibitions are eligible; skip regular-season games so ESPN remains responsible for those.
- Hoops HD's 2026-27 open-exhibition page is the schedule source of truth. Filter for games involving `AVAILABLE_TEAMS`; unresolved ESPN name matches need human review. Use the linked official college box score when available, and do not import stats until a complete box score is published.
- Prefer linked official box-score PDFs for exhibition stat collection. If a PDF is unavailable or unsupported, allow stats to be entered manually in the workbook's `Player stats` sheet; inspect school HTML box-score formats as a fallback, with LSU's format still to be reviewed.
- Initial collection must use a review/approval step before database writes. Capture the official source URL and leave unreported stats blank.
- Match players using jersey number and team as the initial signal, then compare names. Flag substantially different names, ambiguous matches, and unresolved player IDs for human review; do not automatically attach stats based on number alone.
- ESPN remains the primary player identity system. A player absent from ESPN must use the separately agreed special handling process rather than receiving a guessed ESPN ID. Workbook-supplied team IDs may reflect team affiliation more accurately than ESPN's current roster assignment for exhibition stats.
- Exhibition game rows are marked and displayed with an “(Exhibition)” label; they must remain distinguishable from regular-season stats.

### Exhibition PDF parser implementation reference
- Run `python/parse_exhibition_pdfs.py` to create `exhibition-pdf-import-review.csv`; it does not write to the database.
- The review carries `source_game_label`, game date, ESPN source season, exhibition flag, game scores, source URL, extracted stats, and local PDF path. Resolve `source_game_label` to the database game row during a future import.
- Fill `player_id` and `team_id` only when both jersey and normalized player name match the ESPN roster. Jersey-only/name-only suggestions stay in candidate columns for human review. Duplicate source rows are flagged and withheld from import IDs.
- Preserve PDF player-stat section boundaries and original page numbers; assign each section to a workbook team only when player point totals match that team's final score. Match against that team's ESPN roster only, and include source team name/ID plus per-team point validation in the review CSV. Unassigned sections stay unresolved.
- Compare parsed player-point totals with each game's final score; if totals differ, withhold otherwise exact IDs and flag the whole game for review.
- `--update-links` repairs workbook `Local PDF` links from game-ID and matchup-matched local PDF filenames. `--game G## --append` supports targeted updates when a PDF is added later.
- Parse final box-score pages only. Half-by-half-only PDFs and unsupported layouts stay in review; no stats are silently imported.

### Project reference maintenance
- Record confirmed product decisions and league rules in this AGENTS.md as discussions progress.
- Distinguish confirmed requirements from suggestions and unresolved questions. These requirements describe intended behavior, not proof that it is implemented.

### Codex agent and GitHub workflow
- Project-scoped agents are defined in `.codex/agents/`: `frontend_specialist` owns scoped UI implementation; `backend_architect` provides read-only API/data architecture review; `qa_security_critic` provides read-only correctness, security, and test review.
- The main Codex agent remains responsible for requirements, assigning one implementation owner per overlapping files, reconciling reviews, running final checks, and reporting the outcome. Delegate independent exploration, design review, or verification; avoid parallel writes to shared files.
- Use the installed `agent-skills` workflows for planning, implementation, testing, and review, and `ponytail` to keep changes minimal. Apply the specific skill that fits the task rather than invoking every workflow on every change.
- The web app is `breedruv/frankiefidleristheman`; `College-Basketball` is a separate repository for projection/model work. Keep issue/PR planning and changes in the owning repository, and do not edit or commit the other repository unless the task explicitly crosses that boundary.
- GitHub Issues and pull requests are available for planning and review. GitHub Actions is not configured in this repository yet; do not describe checks as CI-enforced until a workflow is added.

### Draft workspace implementation reference
- Account allowlist: verified Supabase magic-link users whose admin-controlled `app_metadata.member_name` is `Andrew` or `Sam`. These names are set on the two existing Supabase Auth users; Vercel email allowlist variables are not required. No public registration. Optional email template: `docs/magic-link-email.html`; confirmation handler: `/auth/confirm`.
- The standard Supabase Magic Link email is supported without custom SMTP: `app/components/CompleteMagicLink.jsx` processes the `#access_token` fragment and `/api/auth/session` verifies and stores an HTTP-only server session. The custom token-hash email template remains optional when template editing is available.
- Development remains open with `PRE_DRAFT_PRIVATE=false`. Set it to `true` and redeploy/restart to expose only the read-only public board and sign-in. Writes and personal lists always require membership.
- Shared franchise/snake rules: `lib/draftRules.mjs`. Previous ownership: `lib/draftState.js`. Record both initiating and receiving teams for a block.
- Player Focus lists: `app/draft/players/PlayerFocusWorkspace.jsx`, `/api/shortlists`, and the service-only `draft_shortlists` table.
- Database setup: `db/draft-workspace.sql`, also applied by the schema setup script. Operational details and verification commands: `docs/draft-workspace.md`.
- Corrections must preserve downstream rules; undo proceeds from the latest selection backward. Draft order is locked after picks are recorded.

## Core Pages
- Home: scoreboard snapshot, slideshow of players and weekly scores, nav to roster, scoreboard, matchup, draft
- Scoreboard: week dropdown (ex: week 7), quick reference to prior weeks
- Matchup: upcoming week focus
- Roster: player list with filters and trends
- Player detail: stats, last 5, lineup history
- Compare: head-to-head player comparison
- Draft: draft board with filters and drafted tagging

## Data Model Expectations (high level)
- Teams (NCAA): id, slug, location, name, nickname, abbreviation, displayName, shortDisplayName, color, alternateColor, logo, conference
- Players: id, team_id, name, position, number, bio, headshot, active
- Team rosters (ESPN): team_id, player_id, season, active
- Games: game_id, date, home/away teams, status (final only)
- Player stats: game_id + player_id (mins, points, shooting, rebounds, etc.)
- Fantasy teams: name + short_code + logo (blank for now)
- Fantasy team list: MB, AS, SL, DD, Len, Brandon, John B, BJ
- Fantasy team seasons: season + draft_order
- Fantasy rosters: current roster per season
- Fantasy roster moves: trade history log
- Sync log: run_type + last_run_at

## Guardrails
- Keep features focused on the confirmed draft workflow and in-season tracking; current work prioritizes draft usability
- Avoid heavy projection models for now; suggest simple formulas only if asked
- Maintain multi-season support from day one
- Prefer direct ESPN ingestion into Postgres
- Ask before introducing paid services
- Default to Postgres on Vercel for scale unless user prefers SQLite


 ## Next.js Context Optimization
- NEVER scan or read files inside the `.next/`, `node_modules/`, or `out/` directories.
- Prioritize native Next.js features (`next/image`, `next/link`, Next.js App Router parallel routes) before proposing external packages.
- When updating components, provide only the specific lines changed (the diff). Do not rewrite the entire file unless explicitly asked.
