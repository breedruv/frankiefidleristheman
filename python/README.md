# ESPN Data Sync

This folder contains the manual ESPN ? Postgres ingestion script.

## Official school schedule discovery

Create a review CSV with a Google roster search for every currently eligible team. Searches use the full team name (for example, `Auburn Tigers men's basketball roster`) without quotation marks. Existing official URLs and notes are preserved when regenerating the CSV. Close the CSV in Excel before regenerating it; if it is locked, choose another output path with `--output`.

```bash
python python/discover_school_sites.py
```

Verify each result is on the school's official athletics site, then fill in its roster and schedule URLs. Do not treat a search result or an unverified schedule page as a box-score source. To open the searches in separate tabs, eight seconds apart:

```bash
python python/open_school_searches.py
```

Stop the sequence with `Ctrl+C`.

Hoops HD is the current source of truth for the 2026-27 exhibition schedule. Build a review queue of its linked scored games and classify them against the ESPN eligible-team pool with:

```bash
python python/discover_hoopshd_exhibitions.py
```

The script writes `hoopshd-exhibition-review.csv` with the full schedule and `hoopshd-relevant-exhibition-review.csv` with relevant games plus unresolved team-name matches. Games are relevant when either team is in `AVAILABLE_TEAMS`; games with unknown ESPN name matches stay in the review file. Verify each linked page has a complete box score before importing stats.

Match relevant Hoops HD rows to the workbook by date and team names, cache PDF files locally, and add `PDF Source` / `Local PDF` links to matched and newly listed games:

```bash
python python/sync_hoopshd_pdfs.py
```

The workbook is backed up before changes. PDF copies go under the git-ignored `data/exhibition-pdfs/` folder; the public source URL remains in the workbook. The review builder uses a cached local PDF when present. Florida State–LSU uses the direct LSU PDF URL supplied by Andrew.

Parse locally saved PDFs into a player-stat review CSV (no database writes). IDs are filled only for jersey-and-name roster matches; uncertain matches remain flagged. Rosters (with jersey numbers) are fetched from ESPN for source season 2027 by default; use `--season` to change it, or `--roster roster.csv` for an offline roster file. `--update-links` repairs the workbook's `Local PDF` cells from matching `G##` PDF filenames and saves a backup first:

```bash
python python/parse_exhibition_pdfs.py --update-links
```

The output is `exhibition-pdf-import-review.csv`. For a newly added PDF, update only that game's rows and local link with `python python/parse_exhibition_pdfs.py --game G95 --append --update-links`. Final box-score pages are parsed; half-by-half and play-by-play pages are excluded to prevent duplicate stats. It checks the player-point sum against the final score and withholds IDs when those totals differ. Review unsupported layouts and unresolved player IDs before import.

For PDFs with separate player-stat sections, the parser assigns each section to a workbook team only when its player-point total matches that team's final score. Roster matching is then limited to that team, and the review CSV includes the source team name/ESPN ID plus a per-team points check. Sections that cannot be tied to a team stay unresolved for review.

The review CSV also includes `source_pdf_page`, so you can jump straight to the page containing each parsed row.

Compare the workbook's existing player stats to the linked source box scores without writing to the database:

```bash
python python/compare_exhibition_stats.py
```

This writes a per-game summary and side-by-side per-player CSV. Players are matched by jersey and name; close name spellings are flagged, and jersey-only matches with different names are left unresolved.

For exhibition collection, add an official PDF URL in the game's `Source` cell on the `Games` sheet. The review builder parses supported PDFs first. If the PDF is missing or its layout is unsupported, enter the player stats in `Player stats` using that game's `Game ID`; those rows become the manual fallback. Leave stats blank when the source does not report them. Run:

```bash
python python/exhibition_sources.py
```

This creates `exhibition-source-review.csv` with the PDF or manual workbook rows marked for review. It does not write to the database; verify player/team IDs and approve rows before any later import step.

Check today's relevant Hoops HD links for usable box-score rows, then search for an official tracked-team HTML box score when the linked source is unavailable or unparseable:

```bash
python python/check_exhibition_boxscores.py
```

Use `--date YYYY-MM-DD` to check another day. The checker writes `today-exhibition-boxscore-check.csv` for review only; it does not import data. If Hoops HD is unavailable, it uses the saved `hoopshd-relevant-exhibition-review.csv` schedule and reports that fallback.

## Setup
1. Ensure `DATABASE_URL` is set in `.env.local` for Postgres mode.
2. For Supabase REST mode, set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `USE_SUPABASE_REST=true` (recommended)
2. Install Python deps:

```bash
pip install -r python/requirements.txt
```

## Run
Apply schema once (Postgres):
```bash
python python/espn_ingest.py roster --apply-schema --season 2026
```

If using Supabase REST, apply `db/schema.sql` in the Supabase SQL editor first.

Roster (once per year):
```bash
python python/espn_ingest.py roster --season 2026
```

Schedule (once per year, finals only):
```bash
python python/espn_ingest.py schedule --season 2026
```

Include upcoming games:
```bash
python python/espn_ingest.py schedule --season 2026 --include-nonfinal
```

Stats (daily @ 4am ET):
```bash
python python/espn_ingest.py stats --season 2026
```

Supabase REST mode:
```bash
python python/espn_ingest.py roster --season 2026 --use-supabase
python python/espn_ingest.py schedule --season 2026 --use-supabase
python python/espn_ingest.py stats --season 2026 --use-supabase
```

All (runs roster + schedule + stats):
```bash
python python/espn_ingest.py all --season 2026
```

Seed fantasy teams:
```bash
python python/espn_ingest.py seed-fantasy --season 2026 --draft-order "MB=1,AS=2,SL=3,DD=4,Len=5,Brandon=6,John B=7,BJ=8"
```

Optional flags:
- `--since YYYY-MM-DD` to limit game sync
- `--force` to re-import existing games
- `--sleep 0.5` to slow requests

## CBS and Yahoo rosters

`python python/source_rosters.py` fetches CBS Sports and Yahoo Sports rosters for every `AVAILABLE_TEAMS` school and writes
`source-rosters/cbs-rosters-<season>.csv` and `source-rosters/yahoo-rosters-<season>.csv` for review (no database writes).
Each row carries the source player ID/URL, jersey, position, height, weight, class, and hometown, plus `espn_player_id` when
the name matches that team's ESPN roster. `match` values: `exact` (name and jersey), `name`, `review_*` (candidate IDs only),
or `not_on_espn`. Options: `--source cbs|yahoo`, `--team <espn id>` (repeatable), `--sleep`, `--out-dir`.
Slug exceptions live in `CBS_OVERRIDES` / `YAHOO_OVERRIDES`.

## Combined source listings

After `source_rosters.py` writes the CBS/Yahoo CSVs, run `db/player-source-listings.sql` once in Supabase, then:

```
python python/import_source_listings.py           # dry run: match counts, stand-ins, Lindy's duplicates
python python/import_source_listings.py --apply   # writes player_source_listings and stand-in players
```

The app combines the rows into eligible positions (union of all sources) and tallest height (82"+ adds C).

