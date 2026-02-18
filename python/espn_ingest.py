import argparse
import json
import os
import time
from datetime import datetime, timezone

import requests

from espn_config import (
    AVAILABLE_TEAMS,
    ESPN_BASE,
    DEFAULT_TIMEOUT,
    DEFAULT_SLEEP_SECONDS,
    USER_AGENT,
    FANTASY_TEAMS,
)

AVAILABLE_TEAM_SET = {str(team_id) for team_id in AVAILABLE_TEAMS}


def load_env_local():
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip("\"").strip("'")
            os.environ.setdefault(key.strip(), value)


def parse_args():
    parser = argparse.ArgumentParser(description="Sync ESPN CBB data into Postgres or Supabase REST.")
    parser.add_argument("command", choices=["roster", "schedule", "stats", "all", "seed-fantasy"], help="Run type")
    parser.add_argument("--season", type=int, default=datetime.now().year, help="Season year tag")
    parser.add_argument("--sleep", type=float, default=DEFAULT_SLEEP_SECONDS, help="Delay between requests")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="HTTP timeout in seconds")
    parser.add_argument("--since", type=str, default=None, help="Only sync games on/after YYYY-MM-DD")
    parser.add_argument("--force", action="store_true", help="Re-import games even if stats exist")
    parser.add_argument("--draft-order", type=str, default=None, help="Draft order mapping like MB=1,AS=2")
    parser.add_argument("--apply-schema", action="store_true", help="Apply db/schema.sql before running")
    parser.add_argument("--use-supabase", action="store_true", help="Write via Supabase REST instead of Postgres")
    parser.add_argument(
        "--include-nonfinal",
        action="store_true",
        help="(Deprecated) Include non-final games when syncing schedules",
    )
    parser.add_argument(
        "--finals-only",
        action="store_true",
        help="Only sync final games when building schedules",
    )
    return parser.parse_args()


def db_connect():
    try:
        import psycopg2
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "psycopg2 is required for Postgres mode. Install with: pip install -r python/requirements.txt "
            "or run with --use-supabase to skip Postgres."
        ) from exc

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set. Add it to .env.local before running this script.")
    return psycopg2.connect(dsn)


def apply_schema(conn):
    schema_path = os.path.join(os.path.dirname(__file__), "..", "db", "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as handle:
        schema_sql = handle.read()
    with conn.cursor() as cur:
        cur.execute(schema_sql)
    conn.commit()


def fetch_json(url, timeout):
    headers = {"User-Agent": USER_AGENT}
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.json()


def parse_iso_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_minutes(value):
    if not value or value in ("--", "-"):
        return 0.0
    value = str(value).strip()
    if ":" in value:
        mins, secs = value.split(":", 1)
        try:
            return float(mins) + float(secs) / 60.0
        except ValueError:
            return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def parse_int(value):
    if value is None:
        return 0
    value = str(value).strip()
    if value in ("", "--", "-"):
        return 0
    try:
        return int(value)
    except ValueError:
        return 0


def parse_made_attempts(value):
    if not value:
        return 0, 0
    value = str(value).strip()
    if value in ("", "--", "-"):
        return 0, 0
    if "-" in value:
        made, attempt = value.split("-", 1)
        return parse_int(made), parse_int(attempt)
    return parse_int(value), 0


def use_supabase_rest(args):
    env_flag = os.environ.get("USE_SUPABASE_REST", "").lower() == "true"
    return args.use_supabase or env_flag


def supabase_config():
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set.")
    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not set. It is required for writes.")
    return supabase_url.rstrip("/"), service_key


class SupabaseRest:
    def __init__(self, base_url, api_key, timeout):
        self.base_url = base_url
        self.timeout = timeout
        self.headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def request(self, method, path, params=None, json_body=None, prefer=None):
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        url = f"{self.base_url}{path}"
        response = requests.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
            timeout=self.timeout,
        )
        if not response.ok:
            detail = response.text
            try:
                payload = response.json()
                detail = json.dumps(payload)
            except ValueError:
                pass
            raise RuntimeError(f"Supabase REST {method} {url} failed ({response.status_code}): {detail}")
        if not response.text:
            return []
        return response.json()

    def upsert(self, table, rows, conflict_cols):
        if not rows:
            return
        params = {"on_conflict": conflict_cols}
        prefer = "resolution=merge-duplicates,return=minimal"
        self.request("POST", f"/rest/v1/{table}", params=params, json_body=rows, prefer=prefer)

    def select(self, table, params=None):
        return self.request("GET", f"/rest/v1/{table}", params=params)

    def select_in(self, table, column, values, select_columns=None):
        if not values:
            return []
        select_value = select_columns or column
        params = {
            "select": select_value,
            column: f"in.({','.join(values)})",
        }
        return self.select(table, params)

    def update_sync_log(self, run_type, details):
        payload = [{
            "run_type": run_type,
            "last_run_at": datetime.now(timezone.utc).isoformat(),
            "details": details,
        }]
        self.upsert("sync_log", payload, "run_type")


def upsert_team(cur, team):
    cur.execute(
        """
        INSERT INTO teams (
            team_id,
            slug,
            location,
            name,
            nickname,
            abbreviation,
            display_name,
            short_display_name,
            color,
            alternate_color,
            logo_url,
            conference_id,
            conference_name
        ) VALUES (
            %(team_id)s,
            %(slug)s,
            %(location)s,
            %(name)s,
            %(nickname)s,
            %(abbreviation)s,
            %(display_name)s,
            %(short_display_name)s,
            %(color)s,
            %(alternate_color)s,
            %(logo_url)s,
            %(conference_id)s,
            %(conference_name)s
        )
        ON CONFLICT (team_id) DO UPDATE SET
            slug = EXCLUDED.slug,
            location = EXCLUDED.location,
            name = EXCLUDED.name,
            nickname = EXCLUDED.nickname,
            abbreviation = EXCLUDED.abbreviation,
            display_name = EXCLUDED.display_name,
            short_display_name = EXCLUDED.short_display_name,
            color = EXCLUDED.color,
            alternate_color = EXCLUDED.alternate_color,
            logo_url = EXCLUDED.logo_url,
            conference_id = EXCLUDED.conference_id,
            conference_name = EXCLUDED.conference_name;
        """,
        team,
    )


def upsert_player(cur, player):
    cur.execute(
        """
        INSERT INTO players (
            player_id,
            team_id,
            first_name,
            last_name,
            short_name,
            short_name_abbr,
            player_number,
            position,
            height,
            display_height,
            weight,
            experience,
            headshot,
            is_active
        ) VALUES (
            %(player_id)s,
            %(team_id)s,
            %(first_name)s,
            %(last_name)s,
            %(short_name)s,
            %(short_name_abbr)s,
            %(player_number)s,
            %(position)s,
            %(height)s,
            %(display_height)s,
            %(weight)s,
            %(experience)s,
            %(headshot)s,
            %(is_active)s
        )
        ON CONFLICT (player_id) DO UPDATE SET
            team_id = EXCLUDED.team_id,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            short_name = EXCLUDED.short_name,
            short_name_abbr = EXCLUDED.short_name_abbr,
            player_number = EXCLUDED.player_number,
            position = EXCLUDED.position,
            height = EXCLUDED.height,
            display_height = EXCLUDED.display_height,
            weight = EXCLUDED.weight,
            experience = EXCLUDED.experience,
            headshot = EXCLUDED.headshot,
            is_active = EXCLUDED.is_active;
        """,
        player,
    )


def upsert_team_roster(cur, team_id, player_id, season, is_active):
    cur.execute(
        """
        INSERT INTO team_rosters (team_id, player_id, season, is_active)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (team_id, player_id, season) DO UPDATE SET
            is_active = EXCLUDED.is_active;
        """,
        (team_id, player_id, season, is_active),
    )


def upsert_game(cur, game):
    cur.execute(
        """
        INSERT INTO games (
            game_id,
            game_date,
            game_datetime,
            season,
            home_team_id,
            home_team_name,
            away_team_id,
            away_team_name,
            status
        ) VALUES (
            %(game_id)s,
            %(game_date)s,
            %(game_datetime)s,
            %(season)s,
            %(home_team_id)s,
            %(home_team_name)s,
            %(away_team_id)s,
            %(away_team_name)s,
            %(status)s
        )
        ON CONFLICT (game_id) DO UPDATE SET
            game_date = EXCLUDED.game_date,
            game_datetime = EXCLUDED.game_datetime,
            season = EXCLUDED.season,
            home_team_id = EXCLUDED.home_team_id,
            home_team_name = EXCLUDED.home_team_name,
            away_team_id = EXCLUDED.away_team_id,
            away_team_name = EXCLUDED.away_team_name,
            status = EXCLUDED.status;
        """,
        game,
    )


def upsert_player_game(cur, row):
    cur.execute(
        """
        INSERT INTO player_games (
            game_id,
            player_id,
            game_date,
            team_id,
            pts,
            fgm,
            fga,
            tpm,
            tpa,
            ftm,
            fta,
            reb,
            ast,
            turnovers,
            stl,
            blocks,
            oreb,
            dreb,
            pf,
            minutes,
            season
        ) VALUES (
            %(game_id)s,
            %(player_id)s,
            %(game_date)s,
            %(team_id)s,
            %(pts)s,
            %(fgm)s,
            %(fga)s,
            %(tpm)s,
            %(tpa)s,
            %(ftm)s,
            %(fta)s,
            %(reb)s,
            %(ast)s,
            %(turnovers)s,
            %(stl)s,
            %(blocks)s,
            %(oreb)s,
            %(dreb)s,
            %(pf)s,
            %(minutes)s,
            %(season)s
        )
        ON CONFLICT (game_id, player_id) DO UPDATE SET
            game_date = EXCLUDED.game_date,
            team_id = EXCLUDED.team_id,
            pts = EXCLUDED.pts,
            fgm = EXCLUDED.fgm,
            fga = EXCLUDED.fga,
            tpm = EXCLUDED.tpm,
            tpa = EXCLUDED.tpa,
            ftm = EXCLUDED.ftm,
            fta = EXCLUDED.fta,
            reb = EXCLUDED.reb,
            ast = EXCLUDED.ast,
            turnovers = EXCLUDED.turnovers,
            stl = EXCLUDED.stl,
            blocks = EXCLUDED.blocks,
            oreb = EXCLUDED.oreb,
            dreb = EXCLUDED.dreb,
            pf = EXCLUDED.pf,
            minutes = EXCLUDED.minutes,
            season = EXCLUDED.season;
        """,
        row,
    )


def update_sync_log(cur, run_type, details=None):
    cur.execute(
        """
        INSERT INTO sync_log (run_type, last_run_at, details)
        VALUES (%s, NOW(), %s)
        ON CONFLICT (run_type) DO UPDATE SET
            last_run_at = EXCLUDED.last_run_at,
            details = EXCLUDED.details;
        """,
        (run_type, details),
    )


def get_last_run(cur, run_type):
    cur.execute("SELECT last_run_at FROM sync_log WHERE run_type = %s;", (run_type,))
    row = cur.fetchone()
    if not row or not row[0]:
        return None
    return row[0]


def get_team_from_roster_payload(payload):
    team = payload.get("team") or {}
    if isinstance(team, dict) and team.get("team"):
        team = team.get("team")
    return team


def extract_team_fields(team, fallback_team_id):
    team_id = str(team.get("id") or fallback_team_id)
    conference = team.get("conference") or {}
    logos = team.get("logos") or []
    logo_url = logos[0].get("href") if logos else None

    return {
        "team_id": team_id,
        "slug": team.get("slug"),
        "location": team.get("location"),
        "name": team.get("name"),
        "nickname": team.get("nickname"),
        "abbreviation": team.get("abbreviation"),
        "display_name": team.get("displayName"),
        "short_display_name": team.get("shortDisplayName"),
        "color": team.get("color"),
        "alternate_color": team.get("alternateColor"),
        "logo_url": logo_url,
        "conference_id": str(conference.get("id")) if conference.get("id") else None,
        "conference_name": conference.get("name"),
    }


def extract_player_fields(athlete, team_id):
    experience = athlete.get("experience") or {}
    position = athlete.get("position") or {}
    headshot = athlete.get("headshot") or {}

    return {
        "player_id": str(athlete.get("id")),
        "team_id": str(team_id),
        "first_name": athlete.get("firstName"),
        "last_name": athlete.get("lastName"),
        "short_name": athlete.get("shortName") or athlete.get("displayName"),
        "short_name_abbr": athlete.get("abbreviatedName") or athlete.get("shortName"),
        "player_number": athlete.get("jersey"),
        "position": position.get("abbreviation") or position.get("name"),
        "height": athlete.get("height"),
        "display_height": athlete.get("displayHeight"),
        "weight": athlete.get("weight"),
        "experience": experience.get("displayValue") or experience.get("class"),
        "headshot": headshot.get("href"),
        "is_active": athlete.get("active"),
    }


def compact_dict(payload):
    return {key: value for key, value in payload.items() if value not in (None, "")}


def iter_athletes(payload):
    athletes = payload.get("athletes") or []
    for entry in athletes:
        if isinstance(entry, dict) and "items" in entry:
            for athlete in entry.get("items") or []:
                yield athlete
        elif isinstance(entry, dict) and entry.get("id"):
            yield entry
        elif isinstance(entry, list):
            for athlete in entry:
                if isinstance(athlete, dict):
                    yield athlete


def run_roster(conn, season, sleep, timeout):
    with conn.cursor() as cur:
        roster_count = 0
        team_count = 0
        for team_id in AVAILABLE_TEAMS:
            url = f"{ESPN_BASE}/teams/{team_id}/roster"
            payload = fetch_json(url, timeout)
            team = get_team_from_roster_payload(payload)
            team_fields = extract_team_fields(team, team_id)
            upsert_team(cur, team_fields)

            for athlete in iter_athletes(payload):
                player_fields = extract_player_fields(athlete, team_fields["team_id"])
                if not player_fields["player_id"]:
                    continue
                upsert_player(cur, player_fields)
                upsert_team_roster(
                    cur,
                    team_fields["team_id"],
                    player_fields["player_id"],
                    season,
                    player_fields.get("is_active"),
                )
                roster_count += 1

            conn.commit()
            team_count += 1
            print(f"Roster synced for team {team_fields['team_id']} ({team_fields['display_name']}).")
            time.sleep(sleep)

        update_sync_log(cur, "roster", json.dumps({"teams": team_count, "players": roster_count}))
        conn.commit()


def is_final_status(status):
    if not status:
        return False
    status_type = status.get("type") or {}
    description = (status_type.get("description") or "").lower()
    name = (status_type.get("name") or "").lower()
    completed = status_type.get("completed")
    state = (status_type.get("state") or "").lower()
    return (
        "final" in description
        or "status_final" in name
        or (completed is True and state == "post")
    )


def extract_event_status(event):
    status = event.get("status") or {}
    status_type = status.get("type") or {}
    description = status_type.get("description")
    name = status_type.get("name")
    state = status_type.get("state")
    completed = status_type.get("completed")
    if description:
        return description
    if name:
        return name
    if completed is True:
        return "Final"
    if state:
        return state.title()

    competition = (event.get("competitions") or [None])[0] or {}
    comp_status = competition.get("status") or {}
    comp_type = comp_status.get("type") or {}
    comp_desc = comp_type.get("description")
    comp_name = comp_type.get("name")
    comp_state = comp_type.get("state")
    comp_completed = comp_type.get("completed")
    if comp_desc:
        return comp_desc
    if comp_name:
        return comp_name
    if comp_completed is True:
        return "Final"
    if comp_state:
        return comp_state.title()

    return None


def run_schedule(conn, season, sleep, timeout, include_nonfinal=False):
    with conn.cursor() as cur:
        game_count = 0
        for team_id in AVAILABLE_TEAMS:
            url = f"{ESPN_BASE}/teams/{team_id}/schedule"
            payload = fetch_json(url, timeout)
            events = payload.get("events") or []
            for event in events:
                if not include_nonfinal and not is_final_status(event.get("status") or {}):
                    continue

                competition = (event.get("competitions") or [None])[0] or {}
                competitors = competition.get("competitors") or []

                home = next((c for c in competitors if c.get("homeAway") == "home"), None)
                away = next((c for c in competitors if c.get("homeAway") == "away"), None)

                game_datetime = parse_iso_datetime(event.get("date"))
                game_date = game_datetime.date() if game_datetime else parse_iso_date(event.get("date"))
                game_id = str(event.get("id"))

                game_status = extract_event_status(event)
                game = {
                    "game_id": game_id,
                    "game_date": game_date,
                    "game_datetime": game_datetime,
                    "season": season or (game_date.year if game_date else None),
                    "home_team_id": str((home or {}).get("team", {}).get("id")) if home else None,
                    "home_team_name": (home or {}).get("team", {}).get("displayName"),
                    "away_team_id": str((away or {}).get("team", {}).get("id")) if away else None,
                    "away_team_name": (away or {}).get("team", {}).get("displayName"),
                    "status": game_status,
                }

                if not game["game_id"]:
                    continue

                upsert_game(cur, game)
                game_count += 1

            conn.commit()
            print(f"Schedule synced for team {team_id}.")
            time.sleep(sleep)

        update_sync_log(cur, "schedule", json.dumps({"games": game_count}))
        conn.commit()


def ensure_team_stub(cur, team_id, display_name=None):
    cur.execute("SELECT team_id FROM teams WHERE team_id = %s;", (team_id,))
    if cur.fetchone():
        return
    cur.execute(
        """
        INSERT INTO teams (team_id, display_name, name)
        VALUES (%s, %s, %s)
        ON CONFLICT (team_id) DO NOTHING;
        """,
        (team_id, display_name, display_name),
    )


def ensure_player_stub(cur, athlete, team_id):
    player_id = str(athlete.get("id"))
    if not player_id:
        return None
    cur.execute("SELECT player_id FROM players WHERE player_id = %s;", (player_id,))
    if cur.fetchone():
        return player_id

    player = {
        "player_id": player_id,
        "team_id": team_id,
        "first_name": athlete.get("firstName"),
        "last_name": athlete.get("lastName"),
        "short_name": athlete.get("shortName") or athlete.get("displayName"),
        "short_name_abbr": athlete.get("abbreviatedName") or athlete.get("shortName"),
        "player_number": None,
        "position": None,
        "height": None,
        "display_height": None,
        "weight": None,
        "experience": None,
        "headshot": None,
        "is_active": None,
    }
    upsert_player(cur, player)
    return player_id


def extract_game_date(summary):
    header = summary.get("header") or {}
    competitions = header.get("competitions") or []
    if competitions:
        date_value = competitions[0].get("date")
        parsed = parse_iso_date(date_value)
        if parsed:
            return parsed
    game_info = summary.get("gameInfo") or {}
    return parse_iso_date(game_info.get("date"))


def extract_stats_rows(summary, season, game_id):
    boxscore = summary.get("boxscore") or {}
    players_by_team = boxscore.get("players") or []
    game_date = extract_game_date(summary)
    rows = []

    for team_entry in players_by_team:
        team = team_entry.get("team") or {}
        team_id = str(team.get("id")) if team.get("id") else None
        if not team_id or team_id not in AVAILABLE_TEAM_SET:
            continue

        stats_groups = team_entry.get("statistics") or []
        for group in stats_groups:
            athletes = group.get("athletes") or []
            labels = group.get("labels") or []
            if not labels:
                continue
            for athlete_entry in athletes:
                athlete = athlete_entry.get("athlete") or {}
                player_id = str(athlete.get("id")) if athlete.get("id") else None
                if not player_id:
                    continue

                values = athlete_entry.get("stats") or []
                stat_map = {label: values[idx] if idx < len(values) else None for idx, label in enumerate(labels)}

                fgm, fga = parse_made_attempts(stat_map.get("FG"))
                tpm, tpa = parse_made_attempts(stat_map.get("3PT"))
                ftm, fta = parse_made_attempts(stat_map.get("FT"))
                oreb = parse_int(stat_map.get("OREB"))
                dreb = parse_int(stat_map.get("DREB"))
                reb = parse_int(stat_map.get("REB"))
                if reb == 0 and (oreb or dreb):
                    reb = oreb + dreb

                row = {
                    "game_id": str(game_id),
                    "player_id": player_id,
                    "game_date": game_date,
                    "team_id": team_id,
                    "pts": parse_int(stat_map.get("PTS")),
                    "fgm": fgm,
                    "fga": fga,
                    "tpm": tpm,
                    "tpa": tpa,
                    "ftm": ftm,
                    "fta": fta,
                    "reb": reb,
                    "ast": parse_int(stat_map.get("AST")),
                    "turnovers": parse_int(stat_map.get("TO")),
                    "stl": parse_int(stat_map.get("STL")),
                    "blocks": parse_int(stat_map.get("BLK")),
                    "oreb": oreb,
                    "dreb": dreb,
                    "pf": parse_int(stat_map.get("PF")),
                    "minutes": parse_minutes(stat_map.get("MIN")),
                    "season": season or (game_date.year if game_date else None),
                    "athlete": athlete,
                    "team_display": team.get("displayName"),
                }

                rows.append(row)

    return rows


def run_stats(conn, season, sleep, timeout, since_date=None, force=False):
    with conn.cursor() as cur:
        last_run = get_last_run(cur, "stats")
        if since_date:
            try:
                last_run = datetime.fromisoformat(since_date)
            except ValueError:
                print("Invalid --since date. Use YYYY-MM-DD.")

        today = datetime.now(timezone.utc).date()
        if last_run:
            cur.execute(
                """
                SELECT game_id
                FROM games
                WHERE game_date IS NOT NULL
                  AND game_date <= %s
                  AND game_date >= %s
                ORDER BY game_date ASC;
                """,
                (today, last_run.date()),
            )
        else:
            cur.execute(
                """
                SELECT game_id
                FROM games
                WHERE game_date IS NOT NULL
                  AND game_date <= %s
                ORDER BY game_date ASC;
                """,
                (today,),
            )

        game_ids = [row[0] for row in cur.fetchall()]
        processed = 0
        skipped = 0

        for game_id in game_ids:
            if not force:
                cur.execute("SELECT 1 FROM player_games WHERE game_id = %s LIMIT 1;", (game_id,))
                if cur.fetchone():
                    skipped += 1
                    continue

            url = f"{ESPN_BASE}/summary?event={game_id}"
            summary = fetch_json(url, timeout)

            rows = extract_stats_rows(summary, season, game_id)
            for row in rows:
                team_id = row["team_id"]
                ensure_team_stub(cur, team_id, row.get("team_display"))
                ensure_player_stub(cur, row.get("athlete", {}), team_id)
                upsert_player_game(cur, row)

            conn.commit()
            processed += 1
            print(f"Stats synced for game {game_id} ({len(rows)} player rows).")
            time.sleep(sleep)

        update_sync_log(cur, "stats", json.dumps({"games": processed, "skipped": skipped}))
        conn.commit()


def build_draft_mapping(draft_order):
    mapping = {}
    if draft_order:
        pairs = [pair.strip() for pair in draft_order.split(",") if pair.strip()]
        for pair in pairs:
            if "=" not in pair:
                continue
            name, order = pair.split("=", 1)
            try:
                mapping[name.strip()] = int(order.strip())
            except ValueError:
                continue
    return mapping


def seed_fantasy(conn, season, draft_order):
    mapping = build_draft_mapping(draft_order)

    with conn.cursor() as cur:
        for team in FANTASY_TEAMS:
            team_id = team["id"]
            cur.execute(
                """
                INSERT INTO fantasy_teams (fantasy_team_id, name, short_code, logo_url)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (fantasy_team_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    short_code = EXCLUDED.short_code,
                    logo_url = EXCLUDED.logo_url;
                """,
                (team_id, team["name"], team["short_code"], None),
            )

            draft_value = mapping.get(str(team_id)) or mapping.get(team["short_code"]) or mapping.get(team["name"])
            if season and draft_value is not None:
                cur.execute(
                    """
                    INSERT INTO fantasy_team_seasons (season, fantasy_team_id, draft_order)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (season, fantasy_team_id) DO UPDATE SET
                        draft_order = EXCLUDED.draft_order;
                    """,
                    (season, team_id, draft_value),
                )

        conn.commit()
    print("Fantasy teams seeded.")


def run_roster_supabase(client, season, sleep, timeout):
    roster_count = 0
    team_count = 0
    for team_id in AVAILABLE_TEAMS:
        url = f"{ESPN_BASE}/teams/{team_id}/roster"
        payload = fetch_json(url, timeout)
        team = get_team_from_roster_payload(payload)
        team_fields = extract_team_fields(team, team_id)
        client.upsert("teams", [team_fields], "team_id")

        players = []
        roster_rows = []
        for athlete in iter_athletes(payload):
            player_fields = extract_player_fields(athlete, team_fields["team_id"])
            if not player_fields["player_id"]:
                continue
            players.append(player_fields)
            roster_rows.append({
                "team_id": team_fields["team_id"],
                "player_id": player_fields["player_id"],
                "season": season,
                "is_active": player_fields.get("is_active"),
            })
            roster_count += 1

        client.upsert("players", players, "player_id")
        client.upsert("team_rosters", roster_rows, "team_id,player_id,season")

        team_count += 1
        print(f"Roster synced for team {team_fields['team_id']} ({team_fields['display_name']}).")
        time.sleep(sleep)

    client.update_sync_log("roster", json.dumps({"teams": team_count, "players": roster_count}))


def run_schedule_supabase(client, season, sleep, timeout, include_nonfinal=False):
    game_count = 0
    for team_id in AVAILABLE_TEAMS:
        url = f"{ESPN_BASE}/teams/{team_id}/schedule"
        payload = fetch_json(url, timeout)
        events = payload.get("events") or []
        games = []
        for event in events:
            if not include_nonfinal and not is_final_status(event.get("status") or {}):
                continue

            competition = (event.get("competitions") or [None])[0] or {}
            competitors = competition.get("competitors") or []

            home = next((c for c in competitors if c.get("homeAway") == "home"), None)
            away = next((c for c in competitors if c.get("homeAway") == "away"), None)

            game_datetime = parse_iso_datetime(event.get("date"))
            game_date = game_datetime.date() if game_datetime else parse_iso_date(event.get("date"))
            game_id = str(event.get("id"))

            if not game_id:
                continue

            game_status = extract_event_status(event)
            games.append({
                "game_id": game_id,
                "game_date": game_date.isoformat() if game_date else None,
                "game_datetime": game_datetime.isoformat() if game_datetime else None,
                "season": season or (game_date.year if game_date else None),
                "home_team_id": str((home or {}).get("team", {}).get("id")) if home else None,
                "home_team_name": (home or {}).get("team", {}).get("displayName"),
                "away_team_id": str((away or {}).get("team", {}).get("id")) if away else None,
                "away_team_name": (away or {}).get("team", {}).get("displayName"),
                "status": game_status,
            })
            game_count += 1

        client.upsert("games", games, "game_id")
        print(f"Schedule synced for team {team_id}.")
        time.sleep(sleep)

    client.update_sync_log("schedule", json.dumps({"games": game_count}))


def get_last_run_supabase(client, run_type):
    data = client.select("sync_log", {
        "select": "last_run_at",
        "run_type": f"eq.{run_type}",
        "limit": "1",
    })
    if not data:
        return None
    value = data[0].get("last_run_at")
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def get_games_supabase(client, since_date=None, up_to_date=None):
    params = {
        "select": "game_id,game_date",
        "order": "game_date.asc",
    }
    if since_date and up_to_date:
        params["and"] = f"(game_date.gte.{since_date},game_date.lte.{up_to_date})"
    elif since_date:
        params["game_date"] = f"gte.{since_date}"
    elif up_to_date:
        params["game_date"] = f"lte.{up_to_date}"
    rows = client.select("games", params)
    return [row["game_id"] for row in rows if row.get("game_id")]


def run_stats_supabase(client, season, sleep, timeout, since_date=None, force=False):
    last_run = get_last_run_supabase(client, "stats")
    if since_date:
        try:
            last_run = datetime.fromisoformat(since_date)
        except ValueError:
            print("Invalid --since date. Use YYYY-MM-DD.")

    today = datetime.now(timezone.utc).date().isoformat()
    since_value = last_run.date().isoformat() if last_run else None
    game_ids = get_games_supabase(client, since_value, today)
    if not game_ids and last_run:
        print("No games since last run. Retrying full schedule up to today.")
        game_ids = get_games_supabase(client, None, today)
    if not game_ids:
        print("No games found in schedule up to today. Run schedule sync first.")
        client.update_sync_log("stats", json.dumps({"games": 0, "note": "no games up to today"}))
        return
    processed = 0

    for game_id in game_ids:
        url = f"{ESPN_BASE}/summary?event={game_id}"
        summary = fetch_json(url, timeout)

        rows = extract_stats_rows(summary, season, game_id)
        player_ids = sorted({row["player_id"] for row in rows if row.get("player_id")})
        existing_players = client.select_in("players", "player_id", player_ids, "player_id")
        existing_set = {row.get("player_id") for row in existing_players}

        payload = []
        for row in rows:
            if row["player_id"] not in existing_set:
                continue
            payload.append({
                "game_id": row["game_id"],
                "player_id": row["player_id"],
                "game_date": row["game_date"].isoformat() if row["game_date"] else None,
                "team_id": row["team_id"],
                "pts": row["pts"],
                "fgm": row["fgm"],
                "fga": row["fga"],
                "tpm": row["tpm"],
                "tpa": row["tpa"],
                "ftm": row["ftm"],
                "fta": row["fta"],
                "reb": row["reb"],
                "ast": row["ast"],
                "turnovers": row["turnovers"],
                "stl": row["stl"],
                "blocks": row["blocks"],
                "oreb": row["oreb"],
                "dreb": row["dreb"],
                "pf": row["pf"],
                "minutes": row["minutes"],
                "season": row["season"],
            })

        if payload:
            client.upsert("player_games", payload, "game_id,player_id")
            processed += 1
            print(f"Stats synced for game {game_id} ({len(payload)} player rows).")
        else:
            print(f"Skipped game {game_id} (no rostered players found).")
        time.sleep(sleep)

    client.update_sync_log("stats", json.dumps({"games": processed}))


def seed_fantasy_supabase(client, season, draft_order):
    mapping = build_draft_mapping(draft_order)

    teams_payload = []
    seasons_payload = []
    for team in FANTASY_TEAMS:
        team_id = team["id"]
        teams_payload.append({
            "fantasy_team_id": team_id,
            "name": team["name"],
            "short_code": team["short_code"],
            "logo_url": None,
        })

        draft_value = mapping.get(str(team_id)) or mapping.get(team["short_code"]) or mapping.get(team["name"])
        if season and draft_value is not None:
            seasons_payload.append({
                "season": season,
                "fantasy_team_id": team_id,
                "draft_order": draft_value,
            })

    client.upsert("fantasy_teams", teams_payload, "fantasy_team_id")
    client.upsert("fantasy_team_seasons", seasons_payload, "season,fantasy_team_id")
    print("Fantasy teams seeded.")


def main():
    args = parse_args()
    load_env_local()
    supabase_mode = use_supabase_rest(args)

    if supabase_mode:
        base_url, api_key = supabase_config()
        client = SupabaseRest(base_url, api_key, args.timeout)

        if args.apply_schema:
            print("Apply db/schema.sql in the Supabase SQL editor before running.")

        if args.command == "seed-fantasy":
            seed_fantasy_supabase(client, args.season, args.draft_order)
            return

        if args.command in ("roster", "all"):
            run_roster_supabase(client, args.season, args.sleep, args.timeout)

        include_nonfinal = args.include_nonfinal or not args.finals_only
        if args.command in ("schedule", "all"):
            run_schedule_supabase(client, args.season, args.sleep, args.timeout, include_nonfinal=include_nonfinal)

        if args.command in ("stats", "all"):
            run_stats_supabase(
                client,
                args.season,
                args.sleep,
                args.timeout,
                since_date=args.since,
                force=args.force,
            )
        return

    conn = db_connect()
    try:
        if args.apply_schema:
            apply_schema(conn)

        if args.command == "seed-fantasy":
            seed_fantasy(conn, args.season, args.draft_order)
            return

        if args.command in ("roster", "all"):
            run_roster(conn, args.season, args.sleep, args.timeout)

        include_nonfinal = args.include_nonfinal or not args.finals_only
        if args.command in ("schedule", "all"):
            run_schedule(conn, args.season, args.sleep, args.timeout, include_nonfinal=include_nonfinal)

        if args.command in ("stats", "all"):
            run_stats(
                conn,
                args.season,
                args.sleep,
                args.timeout,
                since_date=args.since,
                force=args.force,
            )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
