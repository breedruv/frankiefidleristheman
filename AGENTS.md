# AGENTS.md

## Project Summary
Build a Next.js web app for a two-person fantasy college basketball league. The focus is in-season tracking with a future draft-night workflow. The app replaces Google Sheets with richer views, filters, and history.

## Target Users
- Two users (owner and partner)
- Public access is acceptable for now (no auth/roles)
- Hosted on Vercel, repo on GitHub

## Current Scope (MVP)
- In-season tracking and weekly matchups
- Scoreboard dashboard with week selection
- Roster views with player stats and trends
- Draft board (basic, with drafted tagging)
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
- Keep features focused on in-season tracking first
- Avoid heavy projection models for now; suggest simple formulas only if asked
- Maintain multi-season support from day one
- Prefer direct ESPN ingestion into Postgres
- Ask before introducing paid services
- Default to Postgres on Vercel for scale unless user prefers SQLite
