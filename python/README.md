# ESPN Data Sync

This folder contains the manual ESPN ? Postgres ingestion script.

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
