"""Compare workbook player stats with their linked published box scores."""

import argparse
import csv
import difflib
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import openpyxl
import requests

from exhibition_sources import extract_table_rows, fetch_source, workbook_games


STAT_FIELDS = {
    "Minutes": "minutes", "PTS": "pts", "REB": "reb", "AST": "ast", "STL": "steals",
    "BLK": "blocks", "TO": "turnovers", "FGM": "fgm", "FGA": "fga", "3PM": "tpm",
    "3PA": "tpa", "FTM": "ftm", "FTA": "fta", "OREB": "oreb", "DREB": "dreb",
    "PF": "pf", "+/-": "plus_minus", "FD": "fd", "BA": "ba",
}
PDF_TEXT_ROW = re.compile(r"^(\d{1,2})\s+(.+?)\s+(?:\*\s+)?(\d+:\d{1,2}|\d+\+?)\s+(\d+)-(\d+)\s+(\d+)-(\d+)\s+(\d+)-(\d+)\s+(\d+)-(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)$")
SIMPLE_PDF_TEXT_ROW = re.compile(r"^(\d{1,2})\s+([^\n]+?,\s*[^\n]+?)\s+(?:\*\s+)?(\d+:\d{1,2}|\d+\+?)\s+(\d+)-(\d+)\s+(\d+)-(\d+)\s+(\d+)-(\d+)\s+(\d+)-(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$")


def normalize_name(value):
    name = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().casefold()
    name = re.sub(r"\s+[gfc](?:/[gfc])?$", "", name)
    if "," in name:
        last, first = name.split(",", 1)
        name = f"{first} {last}"
    name = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", name)
    return re.sub(r"[^a-z0-9]", "", name)


def jersey_number(value):
    match = re.search(r"\d+", str(value or ""))
    return int(match.group()) if match else None


def minutes_value(value):
    value = str(value or "").strip()
    match = re.fullmatch(r"(\d+):(\d{1,2})", value)
    if match:
        return int(match.group(1)) + int(match.group(2)) / 60
    if value.endswith("+") and value[:-1].isdigit():
        return float(value[:-1])
    try:
        return float(value)
    except ValueError:
        return None


def stat_int(value):
    match = re.fullmatch(r"\s*(-?\d+)\s*", str(value or ""))
    return int(match.group(1)) if match else None


def stat_pair(value):
    match = re.fullmatch(r"\s*(\d+)\s*-\s*(\d+)\s*", str(value or ""))
    return tuple(map(int, match.groups())) if match else (None, None)


def parse_pdf_tables(tables):
    players = []
    section = 0
    for table, source_info in tables:
        page = re.fullmatch(r"pdf_page:(\d+)", str(source_info or ""), re.I)
        page_number = int(page.group(1)) if page else ""
        headers = [index for index, row in enumerate(table)
                   if len(row) >= 18 and str(row[0]).strip().casefold() in ("no.", "no")
                   and str(row[1]).strip().casefold() == "name"]
        for header_index, index in enumerate(headers):
            next_header = headers[header_index + 1] if header_index + 1 < len(headers) else len(table)
            for row in table[index + 1:next_header]:
                if len(row) < 18 or jersey_number(row[0]) is None or not str(row[1] or "").strip():
                    continue
                fgm, fga = stat_pair(row[3]); tpm, tpa = stat_pair(row[4]); ftm, fta = stat_pair(row[5])
                if any(value is None for value in (fgm, fga, tpm, tpa, ftm, fta)):
                    continue
                players.append({
                    "source_team_name": "", "_pdf_section": section, "_source_pdf_page": page_number, "jersey": str(row[0]).strip(),
                    "source_player_name": str(row[1]).strip(), "minutes": minutes_value(row[2]),
                    "fgm": fgm, "fga": fga, "tpm": tpm, "tpa": tpa, "ftm": ftm, "fta": fta,
                    "oreb": stat_int(row[6]), "dreb": stat_int(row[7]), "reb": stat_int(row[8]),
                    "pf": stat_int(row[9]), "fd": stat_int(row[10]), "pts": stat_int(row[11]),
                    "ast": stat_int(row[12]), "turnovers": stat_int(row[13]), "steals": stat_int(row[14]),
                    "blocks": stat_int(row[15]), "ba": stat_int(row[16]), "plus_minus": stat_int(row[17]),
                })
            section += 1
    return players


def parse_pdf_text(text):
    simple_players = []
    section = -1
    page_number = ""
    for line in text.splitlines():
        line = " ".join(line.replace("\x00", " ").split())
        page = re.fullmatch(r"\[\[PDF_PAGE:(\d+)\]\]", line, re.I)
        if page:
            page_number = int(page.group(1))
            continue
        if re.search(r"#\s+Player\s+GS\s+MIN\s+FG\b", line, re.I):
            section += 1
        match = SIMPLE_PDF_TEXT_ROW.fullmatch(line)
        if not match:
            continue
        jersey, name, minutes, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb, pf, ast, turnovers, blocks, steals, pts = match.groups()
        simple_players.append({
            "source_team_name": "", "_pdf_section": max(section, 0), "_source_pdf_page": page_number, "jersey": jersey,
            "source_player_name": f"{name.split(',', 1)[1].strip()} {name.split(',', 1)[0].strip()}",
            "minutes": minutes_value(minutes), "fgm": int(fgm), "fga": int(fga), "tpm": int(tpm), "tpa": int(tpa),
            "ftm": int(ftm), "fta": int(fta), "oreb": int(oreb), "dreb": int(dreb), "reb": int(reb),
            "pf": int(pf), "ast": int(ast), "turnovers": int(turnovers), "blocks": int(blocks),
            "steals": int(steals), "pts": int(pts), "fd": None, "ba": None, "plus_minus": None,
        })
    if simple_players:
        return simple_players

    players = []
    section = -1
    page_number = ""
    for line in text.splitlines():
        line = " ".join(line.replace("\x00", " ").split())
        page = re.fullmatch(r"\[\[PDF_PAGE:(\d+)\]\]", line, re.I)
        if page:
            page_number = int(page.group(1))
            continue
        if re.search(r"#\s+Player\s+GS\s+MIN\s+FG\b", line, re.I):
            section += 1
        match = PDF_TEXT_ROW.fullmatch(line)
        if not match:
            continue
        jersey, name, minutes, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb, pf, ast, turnovers, blocks, steals, pts = match.groups()
        players.append({
            "source_team_name": "", "_pdf_section": max(section, 0), "_source_pdf_page": page_number, "jersey": jersey, "source_player_name": name.replace("*", " ").strip(),
            "minutes": minutes_value(minutes), "fgm": int(fgm), "fga": int(fga), "tpm": int(tpm), "tpa": int(tpa),
            "ftm": int(ftm), "fta": int(fta), "oreb": int(oreb), "dreb": int(dreb), "reb": int(reb),
            "pf": int(pf), "ast": int(ast), "turnovers": int(turnovers), "blocks": int(blocks),
            "steals": int(steals), "pts": int(pts), "fd": None, "ba": None, "plus_minus": None,
        })
    return players


def parse_source_rows(tables, source_type, source_text=""):
    if source_type == "PDF":
        players = parse_pdf_tables(tables)
        if not players:
            players = parse_pdf_text(source_text)
    else:
        players = extract_table_rows(tables)
    unique = []
    for player in players:
        same_player = [existing for existing in unique if jersey_number(existing.get("jersey")) == jersey_number(player.get("jersey")) and normalize_name(existing.get("source_player_name")) == normalize_name(player.get("source_player_name"))]
        existing = next((candidate for candidate in same_player if all(candidate.get(field) is None or player.get(field) is None or candidate.get(field) == player.get(field) for field in STAT_FIELDS.values())), None)
        if existing:
            for field in STAT_FIELDS.values():
                if existing.get(field) is None:
                    existing[field] = player.get(field)
        else:
            unique.append(player)
    return unique


def load_workbook_players(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Player stats"]
    rows = sheet.iter_rows(values_only=True)
    headers = None
    for row in rows:
        if row and row[0] == "Date":
            headers = {name: index for index, name in enumerate(row) if name}
            break
    if not headers:
        raise ValueError("Could not find the Player stats header row.")
    players = {}
    for row in rows:
        game_id = row[headers["Game ID"]]
        if not game_id:
            continue
        player = {name: row[index] for name, index in headers.items()}
        player["jersey_number"] = jersey_number(player.get("Jersey"))
        player["name_key"] = normalize_name(player.get("Player"))
        players.setdefault(game_id, []).append(player)
    return players


def load_source(game, timeout=30):
    if not game["source_url"]:
        return [], "Missing source URL"
    try:
        tables, source_type, source_text = fetch_source(requests.Session(), game["source_url"], timeout)
        players = parse_source_rows(tables, source_type, source_text)
        return players, f"Fetched {source_type}" if players else f"No player rows parsed from {source_type}"
    except Exception as error:
        return [], f"Fetch/parse error: {type(error).__name__}: {error}"


def compare_game(game, old_players, new_players, source_status):
    unmatched = list(old_players)
    detail = []
    for new in new_players:
        number_matches = [old for old in unmatched if old["jersey_number"] is not None and old["jersey_number"] == jersey_number(new.get("jersey"))]
        name_matches = [old for old in unmatched if old["name_key"] and old["name_key"] == normalize_name(new.get("source_player_name"))]
        exact = [old for old in number_matches if old in name_matches]
        if len(exact) == 1:
            old, method = exact[0], "jersey + name"
        elif number_matches:
            similarities = [(difflib.SequenceMatcher(None, old["name_key"], normalize_name(new.get("source_player_name"))).ratio(), old) for old in number_matches]
            best = max((ratio for ratio, _ in similarities), default=0)
            close = [old for ratio, old in similarities if ratio == best and ratio >= 0.85]
            if len(close) == 1:
                old, method = close[0], "jersey + close name; review"
            else:
                detail.append({"game_id": game["game_label"], "game_date": game["game_date"], "team": new.get("source_team_name", ""), "jersey": new.get("jersey", ""), "workbook_player": "", "source_player": new.get("source_player_name", ""), "match_method": "jersey match; name mismatch" if number_matches else "unmatched", "candidate_workbook_players": "; ".join(old.get("Player", "") for old in number_matches), "differing_fields": "", "missing_in_workbook": "", "missing_in_source": ""})
                continue
        elif len(name_matches) == 1:
            old, method = name_matches[0], "name only; jersey differs"
        else:
            detail.append({"game_id": game["game_label"], "game_date": game["game_date"], "team": new.get("source_team_name", ""), "jersey": new.get("jersey", ""), "workbook_player": "", "source_player": new.get("source_player_name", ""), "match_method": "jersey match; name mismatch" if number_matches else "ambiguous" if name_matches else "unmatched", "candidate_workbook_players": "; ".join(old.get("Player", "") for old in (number_matches or name_matches)), "differing_fields": "", "missing_in_workbook": "", "missing_in_source": ""})
            continue

        unmatched.remove(old)
        differing, workbook_blank, source_blank = [], [], []
        for workbook_field, source_field in STAT_FIELDS.items():
            old_value = old.get(workbook_field)
            new_value = new.get(source_field)
            if old_value is None and new_value is not None:
                workbook_blank.append(workbook_field)
            elif old_value is not None and new_value is None:
                source_blank.append(workbook_field)
            elif old_value is not None and new_value is not None:
                if workbook_field == "Minutes":
                    if abs(float(old_value) - float(new_value)) > 0.5:
                        differing.append(workbook_field)
                elif float(old_value) != float(new_value):
                    differing.append(workbook_field)
        result = "Different" if differing else "Match"
        detail_row = {
            "game_id": game["game_label"], "game_date": game["game_date"], "team": old.get("Team", ""),
            "jersey": old.get("Jersey", ""), "workbook_player": old.get("Player", ""),
            "source_player": new.get("source_player_name", ""), "match_method": method,
            "candidate_workbook_players": "",
            "comparison": result, "differing_fields": "; ".join(differing),
            "missing_in_workbook": "; ".join(workbook_blank), "missing_in_source": "; ".join(source_blank),
        }
        for field, source_field in STAT_FIELDS.items():
            detail_row[f"workbook_{field}"] = old.get(field)
            detail_row[f"source_{field}"] = new.get(source_field)
        detail.append(detail_row)

    detail.extend({
        "game_id": game["game_label"], "game_date": game["game_date"], "team": old.get("Team", ""),
        "jersey": old.get("Jersey", ""), "workbook_player": old.get("Player", ""),
        "source_player": "", "match_method": "missing from source", "candidate_workbook_players": "",
        "comparison": "", "differing_fields": "", "missing_in_workbook": "", "missing_in_source": "",
    } for old in unmatched)
    return detail, unmatched, source_status


def run_comparison(workbook_path, summary_path, detail_path, timeout=30):
    games = list(workbook_games(workbook_path))
    old_by_game = load_workbook_players(workbook_path)
    source_results = [None] * len(games)
    with ThreadPoolExecutor(max_workers=4) as executor:
        pending = {executor.submit(load_source, game, timeout): index for index, game in enumerate(games)}
        for completed, future in enumerate(as_completed(pending), 1):
            index = pending[future]
            source_results[index] = future.result()
            print(f"Fetched {completed}/{len(games)} source links", flush=True)

    summary, detail_rows = [], []
    for game, (source_players, status) in zip(games, source_results):
        game_detail, old_unmatched, status = compare_game(game, old_by_game.get(game["game_label"], []), source_players, status)
        detail_rows.extend(game_detail)
        matched = [row for row in game_detail if row.get("comparison")]
        differing_fields = sum(len(row["differing_fields"].split("; ")) for row in matched if row["differing_fields"])
        compared_fields = sum(
            1 for row in matched for field in STAT_FIELDS
            if row.get(f"workbook_{field}") is not None and row.get(f"source_{field}") is not None
        )
        summary.append({
            "game_id": game["game_label"], "game_date": game["game_date"], "team_a": game["team_a"],
            "team_b": game["team_b"], "source_url": game["source_url"], "source_status": status,
            "workbook_players": len(old_by_game.get(game["game_label"], [])), "source_players": len(source_players),
            "matched_players": len(matched), "matching_players": sum(row["comparison"] == "Match" for row in matched),
            "players_with_differences": sum(row["comparison"] == "Different" for row in matched),
            "differing_stat_fields": differing_fields, "compared_stat_fields": compared_fields,
            "close_name_matches": sum(row.get("match_method") == "jersey + close name; review" for row in matched),
            "unmatched_source_rows": sum(row.get("match_method") in {"unmatched", "ambiguous", "jersey match; name mismatch"} for row in game_detail),
            "workbook_only": len(old_unmatched),
        })

    for path, rows in ((summary_path, summary), (detail_path, detail_rows)):
        with open(path, "w", newline="", encoding="utf-8-sig") as handle:
            fields = list(dict.fromkeys(key for row in rows for key in row))
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    return summary, detail_rows


def main():
    parser = argparse.ArgumentParser(description="Compare workbook player stats against linked box scores; writes review CSVs only.")
    parser.add_argument("workbook", nargs="?", default="College-Basketball-Exhibition-Box-Scores-2026(1).xlsx")
    parser.add_argument("--summary", default="exhibition-stats-comparison-games.csv")
    parser.add_argument("--details", default="exhibition-stats-comparison-players.csv")
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    summary, details = run_comparison(args.workbook, args.summary, args.details, args.timeout)
    matched = sum(row["matched_players"] for row in summary)
    diff = sum(row["players_with_differences"] for row in summary)
    diff_fields = sum(row["differing_stat_fields"] for row in summary)
    compared_fields = sum(row["compared_stat_fields"] for row in summary)
    failed = sum(not row["source_status"].startswith("Fetched") for row in summary)
    print(f"Compared {len(summary)} games and matched {matched} players; {diff} have differences across {diff_fields}/{compared_fields} compared stat fields; {failed} sources need review.")
    print(f"Game summary: {Path(args.summary).resolve()}")
    print(f"Player details: {Path(args.details).resolve()}")


if __name__ == "__main__":
    main()
