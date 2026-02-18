import csv
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from csv_utils import ensure_csv_header, load_existing_keys
from http_utils import fetch_json

SCHEDULE_HEADER = [
    "Game ID",
    "Game Date",
    "Game Time",
    "Home Team ID",
    "Home Team Name",
    "Away Team ID",
    "Away Team Name",
    "Neutral Site",
]

EASTERN_TZ = ZoneInfo("America/New_York")


def team_schedule(team_id, filename, season, existing_game_ids=None, session=None):
    url = (
        "https://site.api.espn.com/apis/site/v2/sports/basketball/"
        f"mens-college-basketball/teams/{team_id}/schedule?season={season}"
    )
    teams = []
    added_count = 0
    ensure_csv_header(filename, SCHEDULE_HEADER)
    if existing_game_ids is None:
        existing_game_ids = {
            key[0]
            for key in load_existing_keys(
                filename, [0], expected_header=SCHEDULE_HEADER
            )
        }

    try:
        data = fetch_json(url, session=session)
    except Exception as e:
        print(f"Error fetching schedule for team {team_id}: {e}")
        return teams, existing_game_ids, added_count, False

    games = data.get("events", [])
    with open(filename, "a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        for event in games:
            competition = event.get("competitions", [{}])[0]
            game_id = str(competition.get("id", "")).strip()
            if not game_id or game_id in existing_game_ids:
                continue

            game_time = competition.get("date")
            if not game_time:
                continue

            eastern_time = (
                datetime.strptime(game_time, "%Y-%m-%dT%H:%MZ")
                .replace(tzinfo=timezone.utc)
                .astimezone(EASTERN_TZ)
            )
            game_date = eastern_time.strftime("%Y/%m/%d")
            game_time_str = eastern_time.strftime("%I:%M %p")
            game_neutral = competition.get("neutralSite", False)

            competitors = competition.get("competitors", [])
            home_team = next(
                (team for team in competitors if team.get("homeAway") == "home"), None
            )
            away_team = next(
                (team for team in competitors if team.get("homeAway") == "away"), None
            )
            if home_team is None or away_team is None:
                if len(competitors) >= 2:
                    home_team = competitors[0]
                    away_team = competitors[1]
                else:
                    continue

            home_team_id = str(home_team.get("id", "")).strip()
            away_team_id = str(away_team.get("id", "")).strip()
            home_team_name = home_team.get("team", {}).get("shortDisplayName", "")
            away_team_name = away_team.get("team", {}).get("shortDisplayName", "")

            if home_team_id:
                try:
                    home_team_id_int = int(home_team_id)
                    if home_team_id_int not in teams:
                        teams.append(home_team_id_int)
                except ValueError:
                    pass
            if away_team_id:
                try:
                    away_team_id_int = int(away_team_id)
                    if away_team_id_int not in teams:
                        teams.append(away_team_id_int)
                except ValueError:
                    pass

            writer.writerow(
                [
                    game_id,
                    game_date,
                    game_time_str,
                    home_team_id,
                    home_team_name,
                    away_team_id,
                    away_team_name,
                    game_neutral,
                ]
            )
            existing_game_ids.add(game_id)
            added_count += 1

    print(f"Processed schedule for team {team_id}")
    return teams, existing_game_ids, added_count, True
