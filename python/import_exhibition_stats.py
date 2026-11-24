"""Sync the workbook's exhibition games and Player stats sheet to Supabase (dry run unless --apply)."""

import argparse
from datetime import datetime, timedelta
from pathlib import Path

import openpyxl
import requests

from add_exhibition_stats_to_workbook import DEFAULT_WORKBOOK, header_row
from espn_ingest import extract_player_fields
from http_utils import fetch_json
from parse_exhibition_pdfs import load_team_aliases, team_key


ROOT = Path(__file__).resolve().parents[1]
SEASON = 2027
ATHLETE_URL = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/{}"
GAME_TEAM_IDS = ("home_team_id", "away_team_id")  # filled when missing; an existing ID is never overwritten
STAT_FIELDS = {
    "pts": "PTS", "fgm": "FGM", "fga": "FGA", "tpm": "3PM", "tpa": "3PA", "ftm": "FTM", "fta": "FTA",
    "reb": "REB", "ast": "AST", "turnovers": "TO", "stl": "STL", "blocks": "BLK",
    "oreb": "OREB", "dreb": "DREB", "pf": "PF",
}


def load_env():
    env = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"')
    return env


class Supabase:
    def __init__(self, env):
        self.url = f"{env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')}/rest/v1"
        key = env["SUPABASE_SERVICE_ROLE_KEY"]
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def select(self, table, query):
        rows, offset = [], 0
        while True:
            response = requests.get(f"{self.url}/{table}?{query}", timeout=60,
                                    headers={**self.headers, "Range": f"{offset}-{offset + 999}"})
            response.raise_for_status()
            page = response.json()
            rows.extend(page)
            if len(page) < 1000:
                return rows
            offset += 1000

    def upsert(self, table, rows, conflict, resolution="merge-duplicates"):
        for start in range(0, len(rows), 500):
            response = requests.post(f"{self.url}/{table}?on_conflict={conflict}", json=rows[start:start + 500], timeout=120,
                                     headers={**self.headers, "Prefer": f"resolution={resolution},return=minimal"})
            if not response.ok:
                raise SystemExit(f"{table} write failed ({response.status_code}): {response.text}")

    def delete(self, table, query):
        response = requests.delete(f"{self.url}/{table}?{query}", headers=self.headers, timeout=60)
        response.raise_for_status()


def game_number(label):
    return int(str(label)[1:])


def game_id(label):
    return -(2026000 + game_number(label))


def as_int(value):
    if value in (None, ""):
        return None
    return int(round(float(value)))


def as_minutes(value):
    return None if value in (None, "") else float(value)


def as_date(value):
    if isinstance(value, (int, float)):  # Excel serial date typed into a non-date cell
        value = datetime(1899, 12, 30) + timedelta(days=value)
    return value.date().isoformat() if isinstance(value, datetime) else str(value)[:10]


def workbook_rows(path, aliases):
    workbook = openpyxl.load_workbook(path, data_only=True)
    games = {}
    for row in workbook["Games"].iter_rows(values_only=True):
        if row[0] and str(row[0]).startswith("G") and str(row[0])[1:].isdigit():
            games[row[0]] = {"date": row[1], "winner": str(row[2]).strip(), "loser": str(row[4]).strip()}
    sheet = workbook["Player stats"]
    header, columns = header_row(sheet)
    stats, problems, side_ids = {}, [], {}
    for number, row in enumerate(sheet.iter_rows(min_row=header + 1, values_only=True), header + 1):
        label = row[columns["Game ID"]]
        if not label:
            continue
        team_id, player_id = row[columns["Team ID"]], row[columns["Player ID"]]
        if not isinstance(team_id, int) or not isinstance(player_id, int) or label not in games:
            problems.append(f"row {number}: {label} {row[columns['Player']]} has a missing Team ID, Player ID or game")
            continue
        side_ids.setdefault((label, str(row[columns["Team"]]).strip()), set()).add(team_id)
        key = (game_id(label), player_id)
        if key in stats:
            problems.append(f"row {number}: duplicate {label} player {player_id}")
            continue
        stats[key] = {
            "game_id": key[0], "player_id": player_id, "game_date": as_date(row[columns["Date"]]),
            "team_id": team_id, "season": SEASON, "minutes": as_minutes(row[columns["Minutes"]]),
            **{field: as_int(row[columns[column]]) for field, column in STAT_FIELDS.items()},
            "_label": label, "_name": row[columns["Player"]],
        }
    labels = {row["_label"] for row in stats.values()}

    def team_id_for(label, name):
        # The sheet's Team IDs come first; ESPN's name lookup covers a side with no player rows (non-pool teams).
        ids = side_ids.get((label, name))
        if ids and len(ids) == 1:
            return next(iter(ids))
        if ids:
            problems.append(f"{label} {name}: several Team IDs {sorted(ids)}")
            return None
        team_id = aliases.get(team_key(name))
        if not team_id:
            problems.append(f"{label} {name}: no ESPN team match; team ID left empty")
        return int(team_id) if team_id else None

    game_rows = [{
        "game_id": game_id(label), "game_date": as_date(games[label]["date"]),
        "game_datetime": f"{as_date(games[label]['date'])}T00:00:00+00:00", "season": SEASON,
        "home_team_id": team_id_for(label, games[label]["winner"]), "home_team_name": games[label]["winner"],
        "away_team_id": team_id_for(label, games[label]["loser"]), "away_team_name": games[label]["loser"],
        "status": "STATUS_FINAL", "is_exhibition": True, "source_game_label": label,
    } for label in sorted(labels, key=game_number)]
    return game_rows, stats, problems


def comparable(row):
    return {key: value for key, value in row.items() if not key.startswith("_")}


def stats_differ(before, after):
    for key, value in comparable(after).items():
        old = before.get(key)
        if key == "minutes" and old is not None and value is not None:
            if abs(float(old) - value) > 0.001:
                return True
        elif old != value:
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--apply", action="store_true", help="Write the changes; without it nothing is written")
    args = parser.parse_args()

    game_rows, stats, problems = workbook_rows(args.workbook, load_team_aliases(30))
    for problem in problems:
        print(f"Skipped {problem}")
    db = Supabase(load_env())
    existing_games = {row["game_id"]: row for row in db.select("games", "select=*&is_exhibition=eq.true&order=game_id")}
    existing_stats = {(row["game_id"], row["player_id"]): row for row in db.select("player_games", "select=*&game_id=lt.0&order=game_id,player_id")}
    known_players = {row["player_id"] for row in db.select("players", "select=player_id&order=player_id")}

    new_games = [row for row in game_rows if row["game_id"] not in existing_games]
    def game_changes(row):
        before = existing_games[row["game_id"]]
        return {key: (before.get(key), value) for key, value in row.items()
                if key != "game_datetime" and before.get(key) != value
                and (key not in GAME_TEAM_IDS or (before.get(key) is None and value is not None))}

    changed_games = [row for row in game_rows if row["game_id"] in existing_games and game_changes(row)]
    missing_players = {}
    for row in stats.values():
        if row["player_id"] not in known_players:
            missing_players.setdefault(row["player_id"], (row["_name"], row["team_id"], []))[2].append(row["_label"])
    inserts = [row for key, row in stats.items() if key not in existing_stats]
    updates = [row for key, row in stats.items() if key in existing_stats and stats_differ(existing_stats[key], row)]
    synced_games = {row["game_id"] for row in game_rows}
    deletes = [row for key, row in existing_stats.items() if key not in stats and key[0] in synced_games]
    orphans = sorted({row["source_game_label"] for game, row in existing_games.items() if game not in synced_games})

    print(f"Games: {len(new_games)} new, {len(changed_games)} changed, {len(game_rows)} on the sheet")
    print(f"Player stats: {len(inserts)} new, {len(updates)} changed, {len(deletes)} to delete, "
          f"{len(stats) - len(inserts) - len(updates)} unchanged")
    for row in updates:
        before = existing_stats[(row["game_id"], row["player_id"])]
        diff = {key: (before.get(key), value) for key, value in comparable(row).items() if stats_differ({key: before.get(key)}, {key: value})}
        print(f"  change {row['_label']} {row['_name']} ({row['player_id']}): {diff}")
    for row in changed_games:
        print(f"  game {row['source_game_label']}: {game_changes(row)}")
    for row in deletes:
        print(f"  delete game {row['game_id']} player {row['player_id']} ({row['pts']} pts)")
    if orphans:
        print(f"Exhibition games in the database but not on the sheet (left alone): {', '.join(orphans)}")
    new_players = []
    for player_id, (name, team_id, labels) in sorted(missing_players.items(), key=lambda item: item[1][0]):
        athlete = fetch_json(ATHLETE_URL.format(player_id)).get("athlete") or {}
        espn_name = athlete.get("displayName")
        if espn_name:
            new_players.append(extract_player_fields(athlete, team_id))
        print(f"  add player {name} ({player_id}) team {team_id} for {', '.join(sorted(labels, key=game_number))}: "
              f"{'ESPN ' + espn_name if espn_name else 'NOT FOUND ON ESPN'}")
    if not args.apply:
        print("Dry run: nothing was written. Re-run with --apply to sync.")
        return
    if len(new_players) != len(missing_players):
        raise SystemExit("Some players were not found on ESPN; fix their Player IDs before applying.")

    db.upsert("players", new_players, "player_id", resolution="ignore-duplicates")
    if new_games:
        db.upsert("games", new_games, "game_id")
    if changed_games:
        db.upsert("games", [{**row, **{key: existing_games[row["game_id"]][key] or row[key] for key in GAME_TEAM_IDS}}
                            for row in changed_games], "game_id")
    db.upsert("player_games", [comparable(row) for row in inserts + updates], "game_id,player_id")
    for row in deletes:
        db.delete("player_games", f"game_id=eq.{row['game_id']}&player_id=eq.{row['player_id']}")
    print("Applied.")


if __name__ == "__main__":
    main()
