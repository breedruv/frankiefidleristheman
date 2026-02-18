import csv
from contextlib import ExitStack
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from csv_utils import ensure_csv_header, load_existing_keys
from http_utils import fetch_json

EASTERN_TZ = ZoneInfo("America/New_York")

PLAYER_STATS_FIELDS = [
    "PTS",
    "FGM",
    "FGA",
    "3PTM",
    "3PTA",
    "FTM",
    "FTA",
    "REB",
    "AST",
    "TO",
    "STL",
    "Blocks",
    "OREB",
    "DREB",
    "PF",
    "MIN",
]

PLAYER_STATS_HEADER = [
    "Date",
    "Game ID",
    "Player ID",
    "Player Name",
    *PLAYER_STATS_FIELDS,
    "TEAM ID",
    "Team Name",
]

TEAM_STATS_HEADER = ["Date", "Game ID", "TEAM ID", "Team Name", *PLAYER_STATS_FIELDS]

PLAYS_HEADER = [
    "Game ID",
    "Play Index",
    "Play ID",
    "Type ID",
    "Type Text",
    "Play Text",
    "Away Score",
    "Home Score",
    "Period",
    "Period Display",
    "Clock",
    "Team ID",
    "Player IDs",
    "Coord X",
    "Coord Y",
]


def _normalize_stats(stats):
    normalized = []
    for stat in stats:
        if "-" in stat:
            part1, part2 = stat.split("-")
            normalized.extend([part1, part2])
        else:
            normalized.append(stat)
    if not normalized:
        normalized = [0] * len(PLAYER_STATS_FIELDS)
    if len(normalized) < len(PLAYER_STATS_FIELDS):
        normalized.extend([0] * (len(PLAYER_STATS_FIELDS) - len(normalized)))
    return normalized[: len(PLAYER_STATS_FIELDS)]


def _to_number(value):
    try:
        return int(value)
    except Exception:
        try:
            return float(value)
        except Exception:
            return 0


def game_information(
    game_id,
    player_stats_filename=None,
    team_stats_filename=None,
    plays_filename=None,
    session=None,
    existing_player_game_ids=None,
    existing_team_game_ids=None,
    existing_play_keys=None,
):
    url = (
        "https://site.api.espn.com/apis/site/v2/sports/basketball/"
        f"mens-college-basketball/summary?event={game_id}"
    )

    try:
        data = fetch_json(url, session=session)
    except Exception as e:
        print(f"Error fetching game ID {game_id}: {e}")
        return {
            "status": "error",
            "wrote_players": False,
            "wrote_teams": False,
            "plays_written": 0,
            "plays_error": False,
        }

    status = (
        data.get("header", {})
        .get("competitions", [{}])[0]
        .get("status", {})
        .get("type", {})
    )
    if not status.get("completed"):
        return {
            "status": "incomplete",
            "wrote_players": False,
            "wrote_teams": False,
            "plays_written": 0,
            "plays_error": False,
        }

    game_id_str = str(game_id)
    write_players = player_stats_filename is not None
    write_teams = team_stats_filename is not None

    if write_players:
        ensure_csv_header(player_stats_filename, PLAYER_STATS_HEADER)
        if existing_player_game_ids is None:
            existing_player_game_ids = {
                key[0]
                for key in load_existing_keys(
                    player_stats_filename,
                    [1],
                    expected_header=PLAYER_STATS_HEADER,
                )
            }
        if game_id_str in existing_player_game_ids:
            write_players = False

    if write_teams:
        ensure_csv_header(team_stats_filename, TEAM_STATS_HEADER)
        if existing_team_game_ids is None:
            existing_team_game_ids = load_existing_keys(
                team_stats_filename,
                [1, 2],
                expected_header=TEAM_STATS_HEADER,
            )

    wrote_players = False
    wrote_teams = False
    wrote_any = False
    if write_players or write_teams:
        wrote_any = process_game_stats(
            data,
            game_id_str,
            player_stats_filename if write_players else None,
            team_stats_filename if write_teams else None,
            existing_team_game_ids,
        )
        if write_players and wrote_any:
            wrote_players = True
        if write_teams and wrote_any:
            wrote_teams = True

    if write_players:
        existing_player_game_ids.add(game_id_str)

    plays_written = 0
    plays_error = False
    if plays_filename:
        plays_written, plays_ok = process_game_plays(
            data, game_id_str, plays_filename, existing_play_keys
        )
        plays_error = not plays_ok

    wrote_any = wrote_any or plays_written > 0
    return {
        "status": "written" if wrote_any else "skipped",
        "wrote_players": wrote_players,
        "wrote_teams": wrote_teams,
        "plays_written": plays_written,
        "plays_error": plays_error,
    }


def process_game_stats(
    data, game_id, player_stats_filename=None, team_stats_filename=None, existing_team_game_ids=None
):
    """Process team and player statistics and write to the stats files."""
    try:
        game_time = data["header"]["competitions"][0]["date"]
        game_date = (
            datetime.strptime(game_time, "%Y-%m-%dT%H:%MZ")
            .replace(tzinfo=timezone.utc)
            .astimezone(EASTERN_TZ)
            .strftime("%m/%d/%y")
        )

        with ExitStack() as stack:
            player_writer = None
            team_writer = None
            if player_stats_filename:
                player_file = stack.enter_context(
                    open(player_stats_filename, "a", newline="", encoding="utf-8")
                )
                player_writer = csv.writer(player_file)
            if team_stats_filename:
                team_file = stack.enter_context(
                    open(team_stats_filename, "a", newline="", encoding="utf-8")
                )
                team_writer = csv.writer(team_file)

            teams = data.get("boxscore", {}).get("players", [])
            for team_data in teams:
                team_info = team_data.get("team", {})
                team_id = str(team_info.get("id", ""))
                team_name = team_info.get("shortDisplayName", "")

                team_totals = [0] * len(PLAYER_STATS_FIELDS)
                athletes = team_data.get("statistics", [{}])[0].get("athletes", [])
                for athlete in athletes:
                    player = athlete.get("athlete", {})
                    player_id = player.get("id", "")
                    player_name = player.get("displayName", "")
                    stats = _normalize_stats(athlete.get("stats", []))

                    if player_writer:
                        player_writer.writerow(
                            [game_date, game_id, player_id, player_name]
                            + stats
                            + [team_id, team_name]
                        )

                    for idx, value in enumerate(stats):
                        team_totals[idx] += _to_number(value)

                if team_writer:
                    team_game_key = (game_id, team_id)
                    if (
                        existing_team_game_ids is None
                        or team_game_key not in existing_team_game_ids
                    ):
                        team_writer.writerow(
                            [game_date, game_id, team_id, team_name] + team_totals
                        )
                        if existing_team_game_ids is not None:
                            existing_team_game_ids.add(team_game_key)

            return player_writer is not None or team_writer is not None
    except Exception as e:
        print(f"Error processing stats for game ID {game_id}: {e}")
        return False


def process_game_plays(data, game_id, plays_filename, existing_play_keys=None):
    """Process game plays and write to the plays file."""
    try:
        plays = data.get("plays", [])
        ensure_csv_header(plays_filename, PLAYS_HEADER)
        if existing_play_keys is None:
            existing_play_keys = load_existing_keys(
                plays_filename, [0, 1], expected_header=PLAYS_HEADER
            )

        added_count = 0
        with open(plays_filename, "a", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)

            for idx, play in enumerate(plays):
                play_index = str(idx)
                key = (str(game_id), play_index)
                if key in existing_play_keys:
                    continue
                existing_play_keys.add(key)

                coord_x, coord_y = "", ""
                coord = play.get("coordinate") or play.get("coordinates")
                if isinstance(coord, dict):
                    coord_x = coord.get("x", "")
                    coord_y = coord.get("y", "")
                elif isinstance(coord, (list, tuple)) and len(coord) >= 2:
                    coord_x, coord_y = coord[0], coord[1]

                type_id = play.get("type", {}).get("id", "")
                type_text = play.get("type", {}).get("text", "")
                play_text = play.get("text", "")
                away_score = play.get("awayScore", "")
                home_score = play.get("homeScore", "")
                period = play.get("period", {}).get("number", "")
                period_display = play.get("period", {}).get("displayValue", "")
                clock = play.get("clock", {}).get("displayValue", "")

                team_id = play.get("team", {}).get("id", "")
                player_ids = []
                if play.get("participants"):
                    player_ids = [
                        participant.get("athlete", {}).get("id", "")
                        for participant in play["participants"]
                    ]

                writer.writerow(
                    [
                        game_id,
                        play_index,
                        play.get("id", "") or play.get("sequenceNumber", ""),
                        type_id,
                        type_text,
                        play_text,
                        away_score,
                        home_score,
                        period,
                        period_display,
                        clock,
                        team_id,
                        " ".join([pid for pid in player_ids if pid]),
                        coord_x,
                        coord_y,
                    ]
                )
                added_count += 1
        return added_count, True
    except Exception as e:
        print(f"Error processing plays for game ID {game_id}: {e}")
        return 0, False

