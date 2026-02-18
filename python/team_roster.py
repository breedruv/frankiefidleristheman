import csv

from csv_utils import ensure_csv_header, load_existing_keys
from http_utils import fetch_json

ROSTER_HEADER = [
    "Team ID",
    "Team Name",
    "Player ID",
    "Player First Name",
    "Player Last Name",
    "Player Full Name",
    "Player Display Name",
    "Player Short Name",
    "Player Weight",
    "Player Display Weight",
    "Player Height",
    "Player Display Height",
    "Player Headshot",
    "Player Position",
    "Player Position ID",
    "Player Experience Years",
    "Player Experience Display Value",
    "Player Status",
]


def team_Roster(team_id, filename, season, existing_player_keys=None, session=None):
    url = (
        "https://site.api.espn.com/apis/site/v2/sports/basketball/"
        f"mens-college-basketball/teams/{team_id}/roster?season={season}"
    )

    ensure_csv_header(filename, ROSTER_HEADER, encoding="utf-8-sig")
    if existing_player_keys is None:
        existing_player_keys = load_existing_keys(
            filename, [0, 2], expected_header=ROSTER_HEADER, encoding="utf-8-sig"
        )

    try:
        data = fetch_json(url, session=session)
    except Exception as e:
        print(f"Error fetching roster for team {team_id}: {e}")
        return existing_player_keys, 0, False

    team_name = data.get("team", {}).get("displayName", "")
    athletes = data.get("athletes", [])
    added_count = 0
    with open(filename, "a", newline="", encoding="utf-8-sig") as file:
        writer = csv.writer(file)
        for athlete in athletes:
            player_id = athlete.get("id", "")
            key = (str(team_id), str(player_id))
            if not player_id or key in existing_player_keys:
                continue
            existing_player_keys.add(key)
            added_count += 1

            player_weight = athlete.get("weight") or "Player Weight Not Listed"
            player_display_weight = athlete.get("displayWeight") or "Player Weight Not Listed"
            player_height = athlete.get("height") or "Player Height Not Listed"
            player_display_height = athlete.get("displayHeight") or "Player Height Not Listed"
            player_headshot = (
                athlete.get("headshot", {}).get("href")
                or data.get("team", {}).get("logo", "")
            )

            position = athlete.get("position", {})
            experience = athlete.get("experience", {})
            status = athlete.get("status", {})

            writer.writerow(
                [
                    team_id,
                    team_name,
                    player_id,
                    athlete.get("firstName", ""),
                    athlete.get("lastName", ""),
                    athlete.get("fullName", ""),
                    athlete.get("displayName", ""),
                    athlete.get("shortName", ""),
                    player_weight,
                    player_display_weight,
                    player_height,
                    player_display_height,
                    player_headshot,
                    position.get("name", ""),
                    position.get("id", ""),
                    experience.get("years", ""),
                    experience.get("displayValue", ""),
                    status.get("name", ""),
                ]
            )

    return existing_player_keys, added_count, True
