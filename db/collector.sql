-- 24/7 PC collector support: injury storage plus the Supabase failover/watchdog.
-- Run in the Supabase SQL editor after creating the three Vault secrets (see docs/collector.md).

BEGIN;

-- Current injury listing per player and source (also in db/player-injuries.sql). The collector writes 'rotowire' rows;
-- 'manual' rows are the fallback Andrew or Sam set when the scrape is down.
CREATE TABLE IF NOT EXISTS player_injuries (
  player_id INTEGER NOT NULL REFERENCES players(player_id),
  source TEXT NOT NULL CHECK (source IN ('rotowire', 'manual')),
  status TEXT,
  injury TEXT,
  source_player TEXT,
  source_team TEXT,
  updated_by TEXT,
  first_reported_at TIMESTAMPTZ DEFAULT NOW(),
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  cleared_at TIMESTAMPTZ,
  PRIMARY KEY (player_id, source)
);
ALTER TABLE player_injuries ENABLE ROW LEVEL SECURITY;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Every 5 minutes: if the PC heartbeat is older than 15 minutes, push one "PC down" alert and, while a
-- regular-season game is in its live window, ask Vercel to refresh live scores. Pushes "back online" on recovery.
CREATE OR REPLACE FUNCTION public.collector_failover_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  heartbeat TIMESTAMPTZ;
  was_down BOOLEAN;
  app_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'collector_app_url');
  cron_secret TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'collector_cron_secret');
  ntfy_topic TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'collector_ntfy_topic');
BEGIN
  SELECT last_run_at INTO heartbeat FROM sync_log WHERE run_type = 'collector_heartbeat';
  SELECT details = 'down' INTO was_down FROM sync_log WHERE run_type = 'collector_failover';

  IF heartbeat > NOW() - INTERVAL '15 minutes' THEN
    IF was_down THEN
      PERFORM net.http_post('https://ntfy.sh', jsonb_build_object('topic', ntfy_topic, 'title', 'PC collector back online',
        'message', 'Heartbeat resumed; failover stopped.', 'tags', jsonb_build_array('white_check_mark')));
      UPDATE sync_log SET details = 'ok', last_run_at = NOW() WHERE run_type = 'collector_failover';
    END IF;
    RETURN;
  END IF;

  IF NOT COALESCE(was_down, FALSE) THEN
    PERFORM net.http_post('https://ntfy.sh', jsonb_build_object('topic', ntfy_topic, 'title', 'PC collector is down',
      'message', format('No heartbeat since %s. Vercel is covering live scores; injuries, nightly stats and schedule wait for the PC.',
        COALESCE(to_char(heartbeat AT TIME ZONE 'America/New_York', 'Mon DD HH12:MI AM ET'), 'never')),
      'priority', 5, 'tags', jsonb_build_array('rotating_light')));
    INSERT INTO sync_log (run_type, last_run_at, details) VALUES ('collector_failover', NOW(), 'down')
      ON CONFLICT (run_type) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, details = EXCLUDED.details;
  END IF;

  IF EXISTS (
    SELECT 1 FROM games
    WHERE NOT is_exhibition
      AND game_datetime BETWEEN NOW() - INTERVAL '6 hours' AND NOW() + INTERVAL '5 minutes'
      AND COALESCE(status, '') NOT ILIKE '%final%'
  ) THEN
    PERFORM net.http_get(app_url || '/api/cron/live-stats',
      headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
      timeout_milliseconds := 60000);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.collector_failover_tick() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Schedule it once the PC collector is running (otherwise the first tick reports it down):
-- SELECT cron.schedule('collector-failover', '*/5 * * * *', 'SELECT public.collector_failover_tick()');
-- To stop: SELECT cron.unschedule('collector-failover');
