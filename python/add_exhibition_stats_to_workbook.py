"""Append approved review-CSV player stats to the workbook's Player stats sheet."""

import argparse
import csv
import re
import shutil
from copy import copy
from datetime import date, datetime
from pathlib import Path

import openpyxl

from espn_config import AVAILABLE_CONFERENCE_GROUPS, ESPN_BASE
from http_utils import fetch_json
from parse_exhibition_pdfs import load_team_aliases, team_key


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = ROOT / "College-Basketball-Exhibition-Box-Scores-2026(1).xlsx"
DEFAULT_REVIEW = ROOT / "exhibition-pdf-import-review.csv"
SHEET = "Player stats"
STAT_COLUMNS = {
    "PTS": "pts", "REB": "reb", "AST": "ast", "STL": "stl", "BLK": "blocks", "TO": "turnovers",
    "FGM": "fgm", "FGA": "fga", "3PM": "tpm", "3PA": "tpa", "FTM": "ftm", "FTA": "fta",
    "OREB": "oreb", "DREB": "dreb", "PF": "pf",
}


def number(value):
    value = str(value or "").strip()
    if not value:
        return None
    result = float(value)
    return int(result) if result.is_integer() else result


def player_name(row):
    # roster_name belongs to the suggested candidate, not to a manually entered ID.
    if row.get("roster_name") and row["player_id"] == row.get("candidate_player_id"):
        return row["roster_name"]
    return re.sub(r"\s+[GFC](?:/[GFC])?$", "", row["source_player_name"].strip(" ,"))


def header_row(sheet):
    for row in sheet.iter_rows(max_row=20):
        values = [cell.value for cell in row]
        if "Game ID" in values:
            return row[0].row, {value: index for index, value in enumerate(values) if value}
    raise ValueError(f"No Game ID header on {SHEET}")


def game_info(workbook):
    games = {}
    for row in workbook["Games"].iter_rows(values_only=True):
        if row[0] and str(row[0]).startswith("G"):
            games[row[0]] = {"date": row[1], "team_a": row[2], "team_b": row[4], "source": row[7]}
    return games


def team_groups(team_ids, timeout):
    groups = {}
    for team_id in sorted(team_ids):
        team = fetch_json(f"{ESPN_BASE}/teams/{team_id}", timeout=timeout).get("team") or {}
        group_id = str((team.get("groups") or {}).get("id") or "")
        groups[team_id] = int(group_id) if group_id.isdigit() else None
    return groups


def build_rows(review_rows, games, existing, timeout):
    aliases = load_team_aliases(timeout)
    candidate_ids = {int(row["team_id"]) for row in review_rows}
    known_conferences = {team_id: conference for team_id, conference in existing.items() if conference}
    groups = team_groups(candidate_ids | set(known_conferences), timeout)
    group_names = {groups[team_id]: name for team_id, name in known_conferences.items() if groups.get(team_id)}
    output, skipped = [], []
    for row in review_rows:
        team_id = int(row["team_id"])
        group = groups.get(team_id)
        if group not in AVAILABLE_CONFERENCE_GROUPS:
            continue
        game = games[row["source_game_label"]]
        names = {aliases.get(team_key(game[side])): game[side] for side in ("team_a", "team_b")}
        team_name = names.get(str(team_id))
        opponent = next((name for key, name in names.items() if key != str(team_id)), None)
        if not team_name or group not in group_names:
            skipped.append((row["source_game_label"], row.get("roster_name"), "team or conference unresolved"))
            continue
        minutes = number(row.get("minutes"))
        output.append({
            "Date": game["date"], "Team ID": team_id, "Team": team_name,
            "Player": player_name(row), "Player ID": int(row["player_id"]),
            "Opponent": opponent, "Conference": group_names[group], "Game ID": row["source_game_label"],
            "Minutes": minutes, "Jersey": str(row.get("jersey") or ""), "Minutes source": minutes,
            "Coverage": "Full box score" if minutes is not None else "Full box score; minutes unavailable",
            "Source": game["source"],
            **{column: number(row.get(field)) for column, field in STAT_COLUMNS.items()},
        })
    return output, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--game", action="append", help="Limit to this game ID; may be repeated")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    workbook = openpyxl.load_workbook(args.workbook)
    sheet = workbook[SHEET]
    header, columns = header_row(sheet)
    data_rows = [row for row in sheet.iter_rows(min_row=header + 1, values_only=True) if row[columns["Game ID"]]]
    present = {(row[columns["Game ID"]], str(row[columns["Player ID"]])) for row in data_rows}
    existing = {row[columns["Team ID"]]: row[columns["Conference"]] for row in data_rows if isinstance(row[columns["Team ID"]], int)}

    with args.review.open(newline="", encoding="utf-8-sig") as handle:
        review = list(csv.DictReader(handle))
    selected = set(args.game or [])
    pending = [row for row in review if row["source_player_name"] and not row["player_id"]
               and (not selected or row["source_game_label"] in selected)]
    approved = [row for row in review if row["player_id"] and row["team_id"]
                and (row["source_game_label"], row["player_id"]) not in present
                and (not selected or row["source_game_label"] in selected)]
    rows, skipped = build_rows(approved, game_info(workbook), existing, args.timeout)
    rows.sort(key=lambda row: (int(row["Game ID"][1:]), row["Team"], -(row["Minutes"] or 0)))

    added_games = sorted({row["Game ID"] for row in rows}, key=lambda game: int(game[1:]))
    print(f"Adding {len(rows)} player rows from {len(added_games)} games: {', '.join(added_games)}")
    present_games = {game for game, _ in present}
    for game in added_games:
        if game in present_games:
            names = ", ".join(row["Player"] for row in rows if row["Game ID"] == game)
            print(f"  {game} is already on {SHEET}; adding missing players: {names}")
    for game, player, reason in skipped:
        print(f"Skipped {game} {player}: {reason}")
    print(f"Review rows without a player_id (not added): {len(pending)}")
    if args.dry_run or not rows:
        return

    backup = args.workbook.with_name(f"{args.workbook.stem}.before-player-stats-{datetime.now():%Y%m%d-%H%M%S}{args.workbook.suffix}")
    shutil.copy2(args.workbook, backup)
    last = max(row[0].row for row in sheet.iter_rows(min_row=header + 1) if row[columns["Game ID"]].value)
    template = sheet[last]
    for offset, values in enumerate(rows, 1):
        for index, cell in enumerate(template):
            target = sheet.cell(row=last + offset, column=index + 1)
            target._style = copy(cell._style)
        for name, value in values.items():
            sheet.cell(row=last + offset, column=columns[name] + 1, value=value)
    table = next(iter(sheet.tables.values()))
    start, end = table.ref.split(":")
    end_column = "".join(character for character in end if character.isalpha())
    new_last = last + len(rows)
    table.ref = f"{start}:{end_column}{new_last}"
    total = new_last - header
    sheet.cell(row=3, column=1, value=(
        f"{total:,} player-game rows. AAC, ACC, Big East, Big Ten, Big 12 and SEC exhibitions; "
        f"both teams included. Updated {date.today():%B} {date.today().day}, {date.today().year}."))
    workbook.save(args.workbook)
    print(f"Saved {args.workbook.name}; backup: {backup.name}")


if __name__ == "__main__":
    main()
