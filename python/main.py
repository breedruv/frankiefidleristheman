
import argparse
import csv
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from csv_utils import ensure_csv_header, load_existing_keys
from feature_builder import FEATURES_HEADER, build_player_features
from game_information import (
    PLAYER_STATS_HEADER,
    TEAM_STATS_HEADER,
    PLAYS_HEADER,
    game_information,
)
from http_utils import fetch_content, get_session
from team_roster import ROSTER_HEADER, team_Roster
from team_schedule import SCHEDULE_HEADER, team_schedule

AVAILABLE_TEAMS = [
    2,
    5,
    8,
    9,
    12,
    24,
    25,
    26,
    30,
    38,
    41,
    46,
    52,
    57,
    58,
    59,
    61,
    66,
    77,
    84,
    87,
    96,
    97,
    99,
    103,
    120,
    127,
    130,
    135,
    142,
    145,
    150,
    151,
    152,
    153,
    154,
    156,
    158,
    164,
    183,
    194,
    197,
    201,
    202,
    213,
    218,
    221,
    222,
    228,
    235,
    238,
    239,
    242,
    245,
    248,
    249,
    251,
    252,
    254,
    258,
    259,
    264,
    269,
    275,
    277,
    305,
    333,
    344,
    356,
    2086,
    2116,
    2132,
    2226,
    2294,
    2305,
    2306,
    2390,
    2429,
    2483,
    2507,
    2509,
    2550,
    2567,
    2579,
    2599,
    2628,
    2633,
    2636,
    2641,
    2655,
    2724,
    2752,
]

EASTERN_TZ = ZoneInfo("America/New_York")


def _parse_team_ids(team_ids_text):
    if not team_ids_text:
        return AVAILABLE_TEAMS
    team_ids = []
    for part in team_ids_text.split(","):
        part = part.strip()
        if not part:
            continue
        team_ids.append(int(part))
    return team_ids


def crawl_schedules(start_team, filename, season, session=None):
    visited = set()
    queue = [start_team]
    existing_game_ids = {
        key[0]
        for key in load_existing_keys(
            filename, [0], expected_header=SCHEDULE_HEADER
        )
    }
    added_total = 0
    failed_teams = 0
    processed_teams = 0

    while queue:
        team_id = queue.pop(0)
        if team_id in visited:
            continue

        visited.add(team_id)
        processed_teams += 1
        print(
            # f"Schedule crawl: teams processed {processed_teams} "
            f"(queued {len(queue)})",
            end="\r",
            flush=True,
        )

        teams, existing_game_ids, added_count, ok = team_schedule(
            team_id,
            filename,
            season,
            existing_game_ids=existing_game_ids,
            session=session,
        )
        added_total += added_count
        if not ok:
            failed_teams += 1

        for team in teams:
            if team not in visited:
                queue.append(team)

    if processed_teams:
        print(" " * 60, end="\r", flush=True)
        print(f"Schedule crawl: teams processed {processed_teams}")
    return added_total, failed_teams


def extract_players_to_csv(url, base_url, csv_filename, session=None):
    """
    Extracts player names and links from a depth chart URL.

    Args:
        url (str): Depth-chart URL to fetch.
        base_url (str): Base site (e.g., "https://www.espn.com").
        csv_filename (str): Writes results to a CSV file.
    """
    from bs4 import BeautifulSoup

    html_content = fetch_content(url, session=session)

    soup = BeautifulSoup(html_content, "html.parser")

    with open(csv_filename, "a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)

        for li in soup.select("ul.depth-charts__pos-list li"):
            anchor = li.find("a")
            if not anchor:
                continue

            name = anchor.get_text(strip=True)
            link = anchor["href"].strip()

            if link.startswith("/"):
                link = base_url.rstrip("/") + link

            writer.writerow([name, link])


def collect_rosters(team_ids, roster_file, season, session=None):
    existing_player_keys = load_existing_keys(
        roster_file, [0, 2], expected_header=ROSTER_HEADER, encoding="utf-8-sig"
    )
    added_total = 0
    failed_teams = 0
    total_teams = len(team_ids)
    for index, team_id in enumerate(team_ids, start=1):
        if total_teams:
            print(
                f"Rosters: teams processed {index}/{total_teams}",
                end="\r",
                flush=True,
            )
        existing_player_keys, added_count, ok = team_Roster(
            team_id,
            roster_file,
            season,
            existing_player_keys=existing_player_keys,
            session=session,
        )
        added_total += added_count
        if not ok:
            failed_teams += 1
    if total_teams:
        print(" " * 60, end="\r", flush=True)
        print(f"Rosters: teams processed {total_teams}/{total_teams}")
    return added_total, failed_teams


def collect_schedules(team_ids, schedule_file, season, session=None):
    existing_game_ids = {
        key[0]
        for key in load_existing_keys(
            schedule_file, [0], expected_header=SCHEDULE_HEADER
        )
    }
    added_total = 0
    failed_teams = 0
    for team_id in team_ids:
        _, existing_game_ids, added_count, ok = team_schedule(
            team_id,
            schedule_file,
            season,
            existing_game_ids=existing_game_ids,
            session=session,
        )
        added_total += added_count
        if not ok:
            failed_teams += 1
    return added_total, failed_teams


def _read_schedule_games(schedule_file):
    games = []
    schedule_path = Path(schedule_file)
    if not schedule_path.exists() or schedule_path.stat().st_size == 0:
        return games

    with schedule_path.open("r", newline="", encoding="utf-8") as file:
        reader = csv.reader(file)
        for row in reader:
            if row == SCHEDULE_HEADER:
                continue
            if len(row) < 2:
                continue
            game_id = row[0].strip()
            game_date = row[1].strip()
            if game_id and game_date:
                games.append((game_id, game_date))
    return games


def _read_schedule_team_ids(schedule_file):
    team_ids = set()
    schedule_path = Path(schedule_file)
    if not schedule_path.exists() or schedule_path.stat().st_size == 0:
        return team_ids

    with schedule_path.open("r", newline="", encoding="utf-8") as file:
        reader = csv.reader(file)
        for row in reader:
            if row == SCHEDULE_HEADER:
                continue
            if len(row) < 6:
                continue
            home_id = row[3].strip()
            away_id = row[5].strip()
            if home_id:
                try:
                    team_ids.add(int(home_id))
                except ValueError:
                    pass
            if away_id:
                try:
                    team_ids.add(int(away_id))
                except ValueError:
                    pass
    return team_ids


def _resolve_roster_team_ids(default_team_ids, schedule_file):
    schedule_team_ids = _read_schedule_team_ids(schedule_file)
    if schedule_team_ids:
        return sorted(schedule_team_ids)
    return default_team_ids


def collect_completed_games_from_schedule(
    schedule_file,
    player_stats_file,
    team_stats_file=None,
    plays_file=None,
    session=None,
):
    existing_player_game_ids = set()
    if player_stats_file:
        existing_player_game_ids = {
            key[0]
            for key in load_existing_keys(
                player_stats_file, [1], expected_header=PLAYER_STATS_HEADER
            )
        }
    existing_team_game_ids = None
    existing_team_game_ids_by_game = set()
    if team_stats_file:
        existing_team_game_ids = load_existing_keys(
            team_stats_file, [1, 2], expected_header=TEAM_STATS_HEADER
        )
        existing_team_game_ids_by_game = {key[0] for key in existing_team_game_ids}

    existing_play_keys = None
    existing_play_game_ids = set()
    if plays_file:
        existing_play_keys = load_existing_keys(
            plays_file, [0, 1], expected_header=PLAYS_HEADER
        )
        existing_play_game_ids = {key[0] for key in existing_play_keys}

    today = datetime.now(EASTERN_TZ).date()
    schedule_games = _read_schedule_games(schedule_file)
    skipped_future = 0
    skipped_existing = 0
    written = 0
    incomplete = 0
    errors = 0
    plays_written = 0
    plays_errors = 0
    total_games = len(schedule_games)
    processed_games = 0

    for game_id, game_date in schedule_games:
        processed_games += 1
        if total_games:
            print(
                f"Games processed {processed_games}/{total_games}",
                end="\r",
                flush=True,
            )
        try:
            game_day = datetime.strptime(game_date, "%Y/%m/%d").date()
        except ValueError:
            continue
        if game_day > today:
            skipped_future += 1
            continue
        needs_player_stats = player_stats_file and game_id not in existing_player_game_ids
        needs_team_stats = team_stats_file and game_id not in existing_team_game_ids_by_game
        needs_plays = plays_file and game_id not in existing_play_game_ids

        if not needs_player_stats and not needs_team_stats and not needs_plays:
            skipped_existing += 1
            continue

        result = game_information(
            game_id,
            player_stats_file if needs_player_stats else None,
            team_stats_filename=team_stats_file if needs_team_stats else None,
            plays_filename=plays_file if needs_plays else None,
            session=session,
            existing_player_game_ids=existing_player_game_ids,
            existing_team_game_ids=existing_team_game_ids,
            existing_play_keys=existing_play_keys,
        )
        if result["status"] == "written":
            existing_player_game_ids.add(game_id)
            written += 1
        elif result["status"] == "incomplete":
            incomplete += 1
        elif result["status"] == "error":
            errors += 1
        plays_written += result.get("plays_written", 0)
        if result.get("plays_error"):
            plays_errors += 1

    if total_games:
        print(" " * 60, end="\r", flush=True)
        print(f"Games processed {processed_games}/{total_games}")

    return {
        "written": written,
        "incomplete": incomplete,
        "errors": errors,
        "skipped_existing": skipped_existing,
        "skipped_future": skipped_future,
        "total_schedule": len(schedule_games),
        "plays_written": plays_written,
        "plays_errors": plays_errors,
    }


def append_status_log(log_file, row):
    header = [
        "Timestamp",
        "Season",
        "Task",
        "Rosters Added",
        "Roster Failures",
        "Schedules Added",
        "Schedule Failures",
        "Games Written",
        "Games Incomplete",
        "Games Errors",
        "Games Skipped Existing",
        "Games Skipped Future",
        "Schedule Total",
        "Plays Written",
        "Plays Errors",
        "Features Written",
    ]
    log_path = Path(log_file)
    header_written = ensure_csv_header(log_file, header)
    if not header_written:
        try:
            with log_path.open("r", newline="", encoding="utf-8") as file:
                reader = csv.reader(file)
                first_row = next(reader, [])
            if first_row != header:
                with log_path.open("a", newline="", encoding="utf-8") as file:
                    writer = csv.writer(file)
                    writer.writerow(header)
        except Exception:
            pass

    with open(log_file, "a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(description="College basketball data collector")
    parser.add_argument(
        "--task",
        choices=["rosters", "schedules", "games", "features", "all"],
        default="all",
        help="Which data to collect.",
    )
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument(
        "--output-dir",
        default=r"",
        help=(
            "Base directory to store season data "
            "(defaults to D:\\College Basketball Stats\\<season>)."
        ),
    )
    parser.add_argument(
        "--team-ids",
        default="",
        help="Comma-separated ESPN team IDs (defaults to AVAILABLE_TEAMS).",
    )
    parser.add_argument("--roster-file", default="")
    parser.add_argument("--schedule-file", default="")
    parser.add_argument("--player-stats-file", default="")
    parser.add_argument("--team-stats-file", default="")
    parser.add_argument("--plays-file", default="")
    parser.add_argument("--features-file", default="")
    parser.add_argument(
        "--min-minutes",
        type=float,
        default=5,
        help="Minimum minutes played to include in features.",
    )
    parser.add_argument(
        "--no-features",
        action="store_true",
        help="Skip building player feature rows.",
    )
    parser.add_argument(
        "--no-team-stats",
        action="store_true",
        help="Skip writing team-level stats.",
    )
    parser.add_argument(
        "--crawl-start-team",
        type=int,
        default=0,
        help="If set, crawl schedules starting from this team ID (default: first team).",
    )

    args = parser.parse_args()
    session = get_session()

    season = args.season
    if args.output_dir:
        base_dir = Path(args.output_dir)
        output_dir = base_dir if base_dir.name == str(season) else base_dir / str(season)
    else:
        output_dir = Path(str(season))
    output_dir.mkdir(parents=True, exist_ok=True)

    roster_file = args.roster_file or str(output_dir / f"{season}_cbb_roster.csv")
    schedule_file = args.schedule_file or str(output_dir / f"{season}_cbb_available_games.csv")
    player_stats_file = args.player_stats_file or str(output_dir / f"{season}_cbb_player_stats.csv")
    team_stats_file = None
    if not args.no_team_stats:
        team_stats_file = args.team_stats_file or str(output_dir / f"{season}_cbb_team_stats.csv")
    plays_file = args.plays_file or str(output_dir / f"{season}_cbb_plays.csv")
    features_file = args.features_file or str(output_dir / f"{season}_cbb_player_features.csv")
    status_log_file = str(output_dir / "status_log.csv")

    team_ids = _parse_team_ids(args.team_ids)

    roster_added = 0
    roster_failed = 0
    schedule_added = 0
    schedule_failed = 0
    game_status = {
        "written": 0,
        "incomplete": 0,
        "errors": 0,
        "skipped_existing": 0,
        "skipped_future": 0,
        "total_schedule": 0,
    }

    if args.task in ("schedules", "all"):
        start_team = args.crawl_start_team or (team_ids[0] if team_ids else AVAILABLE_TEAMS[0])
        schedule_added, schedule_failed = crawl_schedules(
            start_team, schedule_file, season, session=session
        )

    if args.task in ("rosters", "all"):
        roster_team_ids = _resolve_roster_team_ids(team_ids, schedule_file)
        roster_added, roster_failed = collect_rosters(
            roster_team_ids, roster_file, season, session=session
        )

    if args.task in ("games", "all"):
        game_status = collect_completed_games_from_schedule(
            schedule_file,
            player_stats_file,
            team_stats_file=team_stats_file,
            plays_file=plays_file,
            session=session,
        )

    features_written = 0
    if args.task in ("features", "all") and not args.no_features:
        features_written = build_player_features(
            player_stats_file, features_file, min_minutes=args.min_minutes
        )

    timestamp = datetime.now(EASTERN_TZ).isoformat(timespec="seconds")
    append_status_log(
        status_log_file,
        [
            timestamp,
            season,
            args.task,
            roster_added,
            roster_failed,
            schedule_added,
            schedule_failed,
            game_status["written"],
            game_status["incomplete"],
            game_status["errors"],
            game_status["skipped_existing"],
            game_status["skipped_future"],
            game_status["total_schedule"],
            game_status["plays_written"],
            game_status["plays_errors"],
            features_written,
        ],
    )

    print(
        "Status: "
        f"rosters +{roster_added} (fail {roster_failed}), "
        f"schedules +{schedule_added} (fail {schedule_failed}), "
        f"games written {game_status['written']} "
        f"(incomplete {game_status['incomplete']}, errors {game_status['errors']}, "
        f"skipped existing {game_status['skipped_existing']}, "
        f"skipped future {game_status['skipped_future']}), "
        f"plays written {game_status['plays_written']} "
        f"(errors {game_status['plays_errors']}), "
        f"features written {features_written}."
    )


if __name__ == "__main__":
    main()
