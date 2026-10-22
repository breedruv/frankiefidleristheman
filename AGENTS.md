# AGENTS.md

## Project Summary
Build a Next.js web app used by Andrew and Sam to draft for their shared fantasy college basketball team and track players throughout the season. The league has eight fantasy teams; two app users does not mean two league teams. The app replaces Google Sheets with richer views, filters, and history. The current priority is a quick draft workflow with readily accessible player stats and availability, alongside in-season tracking.

## Target Users
- Two users: Andrew and Sam, who will manually enter all teams' draft picks.
- Planned: individual sign-ins so Andrew and Sam can manage their respective player shortlists.
- Keep the site open during the building phase. Before the draft, activate restrictions so visitors can view only the draft board; all other pages and their data must be restricted to signed-in Andrew and Sam. Public board access is view-only; pick entry is for Andrew and Sam.
- Hosted on Vercel, repo on GitHub

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
  - Schedule: once per year (finals only)
  - Game stats: daily at 4am ET (finals only)
- Store MIN=0 games and allow toggle in UI queries
- Plays endpoint is skipped (too much data for now)
- Ingestion supports Supabase REST using `SUPABASE_SERVICE_ROLE_KEY` when Postgres is unavailable
- Default path (Option B): Supabase REST for app reads + Python ingest (Supabase REST)

## League Scoring Rules
- Weekly matchup against one opponent
- Starting lineup is exactly 1 Center, 2 Forwards, 2 Guards
- Weekly score is sum of points for the selected week
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
- Both lists must be easily visible at the same time within the private Player Focus board alongside player research. Do not place either list on the draft board.
- Each signed-in user can edit only their own list; the other user's list is visible but read-only. Enforce ownership on the server as well as in the UI.
- Users should be able to add players while researching. Drafted players remain greyed out in their existing shortlist slots, count toward the ten-player limit, and must be manually removed. Do not automatically remove them, shift rankings, or backfill their slots when drafted.
- Use Move up / Move down controls to manually reorder players without deleting and re-adding them. Do not automatically sort either list.
- Andrew confirmed Draft.csv is the correct end-of-2025 fantasy-roster ownership snapshot for the 2026 franchise round. Use it when 2025 fantasy_rosters has not been loaded; do not infer ownership from NCAA rosters.
- ESPN 100 is a freshman-only ranking with one eligible ranking year per player; display its year with the ranking and do not treat it as a multi-year player history.
- Previous-season PPG rank is the player's rank among all players available in that season's player pool, calculated from that season's PPG.
- Draftable player pool is limited to teams in the AAC, ACC, Big East, Big Ten, Big 12, and SEC for the active season. Conference membership should come from the current ESPN team metadata so realignment changes eligibility without manually rewriting the pool.
- ESPN's source season can be one year ahead of the fantasy draft label (for example, ESPN season 2027 represents the 2026 fantasy draft pool). Preserve the ESPN season value and keep the fantasy draft season as a separate application concept.
- Season-specific player attributes such as class/year, position, height, weight, and team should be preserved by player and source season rather than overwriting the current player profile.

### Project reference maintenance
- Record confirmed product decisions and league rules in this AGENTS.md as discussions progress.
- Distinguish confirmed requirements from suggestions and unresolved questions. These requirements describe intended behavior, not proof that it is implemented.

### Draft workspace implementation reference
- Account allowlist: server-only `ANDREW_EMAIL` and `SAM_EMAIL`; verified Supabase magic-link sessions (user chose email links instead of passwords). No public registration. Email template: `docs/magic-link-email.html`; confirmation handler: `/auth/confirm`.
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
