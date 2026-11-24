"""Parse locally saved exhibition PDFs into a reviewed, non-importing CSV."""

import argparse
import csv
import re
import shutil
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path

import requests

from compare_exhibition_stats import normalize_name, parse_source_rows, jersey_number
from discover_hoopshd_exhibitions import team_aliases
from exhibition_sources import fetch_source, workbook_games
from espn_config import ESPN_BASE
from http_utils import fetch_json
from sync_hoopshd_pdfs import normalize_team_name


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = ROOT / "College-Basketball-Exhibition-Box-Scores-2026(1).xlsx"
PDF_DIR = ROOT / "data" / "exhibition-pdfs"
DEFAULT_ESPN_SEASON = 2027
DEFAULT_OUTPUT = ROOT / "exhibition-pdf-import-review.csv"
FILE_RE = re.compile(r"^(G\d+)[_-](\d{4}-\d{2}-\d{2})_([^_]+?)-vs-(.+?)(?:_[0-9a-f]{10})?\.pdf$", re.I)
TEAM_ALIASES = {
    "vanerbuilt": "vanderbilt", "vilinova": "villanova",
    "saintbonaventure": "stbonaventure", "connecticut": "uconn",
    "michiganstate": "michiganst",
}
STAT_COLUMNS = {
    "minutes": "minutes", "pts": "pts", "fgm": "fgm", "fga": "fga",
    "tpm": "tpm", "tpa": "tpa", "ftm": "ftm", "fta": "fta",
    "reb": "reb", "ast": "ast", "turnovers": "turnovers", "stl": "steals",
    "blocks": "blocks", "oreb": "oreb", "dreb": "dreb", "pf": "pf",
}


def team_key(value):
    key = normalize_team_name(value)
    return TEAM_ALIASES.get(key, key)


def load_roster(path):
    records = defaultdict(list)
    with open(path, newline="", encoding="cp1252") as handle:
        for row in csv.DictReader(handle):
            records[str(row["teamID"])].append({
                "team_id": str(row["teamID"]), "team_name": row["Team Name"],
                "player_id": row["playerID"], "jersey": jersey_number(row["Player Number"]),
                "name": f"{row['playerFirstName']} {row['playerLastName']}",
            })
    return records


def fetch_espn_roster(team_ids, season, timeout):
    """Current ESPN rosters with jerseys; the season CSV export omits jersey numbers."""
    records = defaultdict(list)
    for team_id in sorted(team_ids, key=int):
        data = fetch_json(f"{ESPN_BASE}/teams/{team_id}/roster?season={season}", timeout=timeout)
        team_name = data.get("team", {}).get("displayName", "")
        for athlete in data.get("athletes", []):
            records[str(team_id)].append({
                "team_id": str(team_id), "team_name": team_name,
                "player_id": str(athlete.get("id", "")), "jersey": jersey_number(athlete.get("jersey")),
                "name": athlete.get("fullName") or athlete.get("displayName", ""),
            })
    return records


def load_team_aliases(timeout):
    response = requests.get(f"{ESPN_BASE}/teams?limit=1000", timeout=timeout)
    response.raise_for_status()
    teams = response.json()["sports"][0]["leagues"][0]["teams"]
    aliases = {}
    for item in teams:
        team = item["team"]
        for alias in team_aliases(team):
            aliases.setdefault(team_key(alias), set()).add(str(team["id"]))
    return {name: next(iter(ids)) for name, ids in aliases.items() if len(ids) == 1}


def file_team_matches(filename_teams, game_teams):
    return {team_key(name) for name in filename_teams} == {team_key(name) for name in game_teams}


def matching_roster_row(player, team_ids, roster):
    number = jersey_number(player.get("jersey"))
    name = normalize_name(player.get("source_player_name"))
    candidates = [row for team_id in team_ids for row in roster.get(team_id, [])]
    number_matches = [row for row in candidates if number is not None and row["jersey"] == number]
    exact = [row for row in number_matches if normalize_name(row["name"]) == name]
    if len(exact) == 1:
        return exact[0], "matched jersey + name"
    if len(exact) > 1:
        return None, "ambiguous jersey + name"
    if len(number_matches) == 1:
        return number_matches[0], "review jersey match; name differs"
    if len(number_matches) > 1:
        return None, "ambiguous jersey; name differs"
    name_matches = [row for row in candidates if normalize_name(row["name"]) == name]
    if len(name_matches) == 1:
        return name_matches[0], "review name match; jersey differs"
    return None, "unmatched ESPN roster"


def attribute_pdf_teams(players, game):
    sections = defaultdict(list)
    for player in players:
        sections[player.get("_pdf_section", 0)].append(player)
    ordered = sorted(sections.items())
    scores = {"team_a": int(float(game["team_a_score"])), "team_b": int(float(game["team_b_score"]))}
    assigned = {}
    sums = {section: sum(int(player.get("pts") or 0) for player in rows) for section, rows in ordered}

    # A box-score team can be split across adjacent extracted tables; accept only an exact score boundary.
    if len(ordered) > 1:
        for boundary in range(1, len(ordered)):
            left = sum(sums[section] for section, _ in ordered[:boundary])
            right = sum(sums[section] for section, _ in ordered[boundary:])
            if (left, right) == (scores["team_a"], scores["team_b"]):
                assigned.update({section: "team_a" for section, _ in ordered[:boundary]})
                assigned.update({section: "team_b" for section, _ in ordered[boundary:]})
                break
            if (left, right) == (scores["team_b"], scores["team_a"]):
                assigned.update({section: "team_b" for section, _ in ordered[:boundary]})
                assigned.update({section: "team_a" for section, _ in ordered[boundary:]})
                break
    if not assigned:
        for section, total in sums.items():
            matches = [team for team, score in scores.items() if score == total]
            if len(matches) == 1:
                assigned[section] = matches[0]

    totals = defaultdict(int)
    for section, rows in ordered:
        team = assigned.get(section)
        for player in rows:
            player["source_team_name"] = game[team] if team else ""
            player["source_team_key"] = team or ""
            if team:
                totals[team] += int(player.get("pts") or 0)
    checks = {team: "Match" if totals[team] == score else f"Review: player points {totals[team]} vs team score {score}"
              for team, score in scores.items()}
    return players, checks


def mark_duplicate_player_rows(players):
    groups = defaultdict(list)
    for player in players:
        key = (jersey_number(player.get("jersey")), normalize_name(player.get("source_player_name")))
        groups[key].append(player)
    for duplicates in groups.values():
        if len(duplicates) > 1:
            for player in duplicates:
                player["source_duplicate"] = True
    return players


def game_fields(game, game_id):
    return {
        "source_game_label": game_id, "game_date": game["game_date"], "season": 2027,
        "is_exhibition": True, "team_a": game["team_a"], "team_a_score": game["team_a_score"],
        "team_b": game["team_b"], "team_b_score": game["team_b_score"], "source_url": game["source_url"],
    }


def add_game_points_check(rows):
    by_game = defaultdict(list)
    for row in rows:
        if row.get("source_player_name") and row.get("pts") not in (None, ""):
            by_game[row["source_game_label"]].append(int(float(row["pts"])))
    for row in rows:
        points = by_game.get(row["source_game_label"])
        if not points:
            row["game_points_check"] = "Not checked"
            continue
        expected = int(float(row["team_a_score"])) + int(float(row["team_b_score"]))
        actual = sum(points)
        row["game_points_check"] = "Match" if actual == expected else f"Review: player points {actual} vs final score {expected}"
        if actual != expected and row.get("player_id"):
            row["candidate_player_id"] = row["player_id"]
            row["candidate_team_id"] = row["team_id"]
            row["player_id"] = row["team_id"] = ""
            row["player_match_status"] = "game total mismatch; review"
            row["review_status"] = "; ".join(filter(None, [row.get("review_status"), "Player-point total does not match game score"]))
    return rows


def parse_pdf_file(path, timeout):
    try:
        tables, source_type, text = fetch_source(requests.Session(), str(path), timeout)
        players = parse_source_rows(tables, source_type, text)
        status = f"Parsed {len(players)} player rows from PDF" if players else "No player rows parsed from PDF"
        return players, status
    except Exception as error:
        return [], f"PDF parse error: {type(error).__name__}: {error}"


def update_workbook_pdf_links(workbook_path, choices, clear_missing=True):
    import openpyxl

    workbook = openpyxl.load_workbook(workbook_path)
    sheet = workbook["Games"]
    headers = {cell.value: cell.column for cell in sheet[6] if cell.value}
    local_col = headers.get("Local PDF")
    if not local_col:
        local_col = max(headers.values()) + 1
        sheet.cell(6, local_col, "Local PDF")
    backup = workbook_path.with_name(
        f"{workbook_path.stem}.before-pdf-links-{datetime.now():%Y%m%d-%H%M%S}{workbook_path.suffix}"
    )
    shutil.copy2(workbook_path, backup)
    for row in range(7, sheet.max_row + 1):
        game_id = sheet.cell(row, headers["Game ID"]).value
        if not isinstance(game_id, str) or not re.fullmatch(r"G\d+", game_id.strip()):
            continue
        cell = sheet.cell(row, local_col)
        choice = choices.get(game_id.strip())
        if not choice and not clear_missing:
            continue
        cell.value = str(choice[0].relative_to(ROOT)).replace("\\", "/") if choice else None
        cell.hyperlink = (ROOT / cell.value).as_uri() if cell.value else None
        if cell.hyperlink:
            cell.style = "Hyperlink"
    try:
        workbook.save(workbook_path)
        return backup, workbook_path
    except PermissionError:
        linked_copy = workbook_path.with_name(f"{workbook_path.stem}.pdf-links-repaired{workbook_path.suffix}")
        workbook.save(linked_copy)
        return backup, linked_copy


def parse_game_pdfs(workbook_path, pdf_dir, roster_path=None, timeout=30, game_ids=None, season=DEFAULT_ESPN_SEASON):
    games = {game["game_label"]: game for game in workbook_games(workbook_path)}
    if game_ids:
        selected = set(game_ids)
        games = {game_id: game for game_id, game in games.items() if game_id in selected}
    aliases = load_team_aliases(timeout)
    if roster_path:
        roster = load_roster(roster_path)
    else:
        team_ids = {aliases[key] for game in games.values() for name in ("team_a", "team_b")
                    if (key := team_key(game[name])) in aliases}
        print(f"Fetching {len(team_ids)} ESPN rosters for season {season}", flush=True)
        roster = fetch_espn_roster(team_ids, season, timeout)
    files = defaultdict(list)
    for path in pdf_dir.glob("*.pdf"):
        match = FILE_RE.fullmatch(path.name)
        if match and path.read_bytes()[:4] == b"%PDF":
            game_id, file_date, team_a, team_b = match.groups()
            game = games.get(game_id.upper())
            if game and file_team_matches((team_a, team_b), (game["team_a"], game["team_b"])):
                files[game_id.upper()].append((path, file_date))

    choices_by_game = {}
    for game_id, candidates in files.items():
        choices_by_game[game_id] = sorted(candidates, key=lambda item: item[0].stat().st_mtime, reverse=True)[0]
    parsed_by_game = {}
    with ProcessPoolExecutor(max_workers=8) as executor:
        pending = {executor.submit(parse_pdf_file, path, timeout): game_id
                   for game_id, (path, _) in choices_by_game.items()}
        for completed, future in enumerate(as_completed(pending), 1):
            game_id = pending[future]
            parsed_by_game[game_id] = future.result()
            print(f"Parsed {completed}/{len(pending)} PDFs: {game_id}", flush=True)

    output = []
    for game_id, game in games.items():
        choice = choices_by_game.get(game_id)
        if not choice:
            output.append({**game_fields(game, game_id),
                           "source_pdf": "", "parser_status": "No matched local PDF", "review_status": "Find or review PDF"})
            continue
        path, file_date = choice
        warning = "" if file_date == game["game_date"] else f"Filename date differs ({file_date})"
        choices = files[game_id]
        if len(choices) > 1:
            warning = "; ".join(filter(None, [warning, f"Selected newest of {len(choices)} matching PDFs"]))
        players, status = parsed_by_game[game_id]
        players, team_points_checks = attribute_pdf_teams(players, game)
        mark_duplicate_player_rows(players)
        team_ids = {name: aliases.get(team_key(game[name])) for name in ("team_a", "team_b")}
        if not players:
            output.append({**game_fields(game, game_id),
                           "source_pdf": str(path.relative_to(ROOT)).replace("\\", "/"),
                           "parser_status": status, "review_status": warning or "Review PDF layout"})
            continue
        for player in players:
            source_team = player.get("source_team_key")
            source_team_id = team_ids.get(source_team) if source_team else None
            if source_team_id:
                matched, match_status = matching_roster_row(player, [source_team_id], roster)
            elif source_team:
                matched, match_status = None, "source team has no ESPN ID mapping; review"
            else:
                matched, match_status = None, "unassigned PDF team; review"
            row = {
                **game_fields(game, game_id),
                "source_team_name": player.get("source_team_name", ""),
                "source_team_id": source_team_id or "",
                "team_points_check": team_points_checks.get(source_team, "Review: PDF team section not matched to a final score"),
                "team_id": matched["team_id"] if matched and match_status == "matched jersey + name" and team_points_checks.get(source_team) == "Match" else "",
                "player_id": matched["player_id"] if matched and match_status == "matched jersey + name" and team_points_checks.get(source_team) == "Match" else "",
                "candidate_team_id": matched["team_id"] if matched else "",
                "candidate_player_id": matched["player_id"] if matched else "",
                "roster_name": matched["name"] if matched else "",
                "roster_team": matched["team_name"] if matched else "",
                "source_pdf_page": player.get("_source_pdf_page", ""),
                "source_player_name": player.get("source_player_name", ""), "jersey": player.get("jersey", ""),
                "player_match_status": match_status, "source_pdf": str(path.relative_to(ROOT)).replace("\\", "/"),
                "source_duplicate": bool(player.get("source_duplicate")),
                "parser_status": status, "review_status": "; ".join(filter(None, [warning, "Approve exact matches; resolve all other IDs"])),
            }
            if matched and match_status == "matched jersey + name" and team_points_checks.get(source_team) != "Match":
                row["player_match_status"] = "team point total mismatch; review"
                row["review_status"] = "; ".join(filter(None, [warning, "Player points do not match source team score"]))
            if player.get("source_duplicate"):
                row["team_id"] = row["player_id"] = ""
                row["player_match_status"] = "duplicate source row; review"
                row["review_status"] = "; ".join(filter(None, [warning, "Multiple rows for jersey/name; check full-game totals"]))
            row.update({column: player.get(source_field) for column, source_field in STAT_COLUMNS.items()})
            output.append(row)
    return add_game_points_check(output)


def write_review(path, rows, append=False):
    if append and path.is_file():
        with path.open(encoding="utf-8-sig", newline="") as handle:
            previous = list(csv.DictReader(handle))
        replaced = {row["source_game_label"] for row in rows}
        rows = [row for row in previous if row["source_game_label"] not in replaced] + rows
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = list(dict.fromkeys(key for row in rows for key in row))
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--pdf-dir", type=Path, default=PDF_DIR)
    parser.add_argument("--roster", type=Path, help="Offline roster CSV in roster.csv format; default fetches current ESPN rosters")
    parser.add_argument("--season", type=int, default=DEFAULT_ESPN_SEASON, help="ESPN source season for roster fetches")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--update-links", action="store_true", help="Repair workbook Local PDF links using matched filenames")
    parser.add_argument("--game", action="append", help="Limit parsing to this workbook game ID; may be repeated")
    parser.add_argument("--append", action="store_true", help="Replace selected game rows in an existing review CSV")
    args = parser.parse_args()
    rows = parse_game_pdfs(args.workbook, args.pdf_dir, args.roster, args.timeout, args.game, args.season)
    rows = write_review(args.output, rows, args.append)
    games = {row["source_game_label"] for row in rows}
    parsed = {row["source_game_label"] for row in rows if row.get("player_id")}
    review = sum(1 for row in rows if row.get("player_match_status") not in ("matched jersey + name", None))
    print(f"Reviewed {len(games)} workbook games; parsed {len(parsed)} games with exact roster matches.")
    print(f"Wrote {len(rows)} rows ({review} player rows need ID review) to {args.output.resolve()}. Nothing was imported.")
    if args.update_links:
        backup, saved_path = update_workbook_pdf_links(args.workbook, {
            row["source_game_label"]: (ROOT / row["source_pdf"], "")
            for row in rows if row.get("source_pdf")
        }, clear_missing=not args.game)
        if saved_path == args.workbook:
            print(f"Repaired workbook Local PDF links; backup: {backup}")
        else:
            print(f"Original workbook is locked; repaired workbook copy: {saved_path}; backup: {backup}")


if __name__ == "__main__":
    main()
