"""Match Hoops HD games to the exhibition workbook and cache linked PDFs locally."""

import argparse
import csv
import hashlib
import re
import shutil
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import copy
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

import openpyxl
import requests

from discover_hoopshd_exhibitions import team_aliases, normalize_team_name
from espn_config import AVAILABLE_TEAMS, ESPN_BASE

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = ROOT / "College-Basketball-Exhibition-Box-Scores-2026(1).xlsx"
DEFAULT_SCHEDULE = ROOT / "hoopshd-exhibition-review.csv"
PDF_DIR = ROOT / "data" / "exhibition-pdfs"
REPORT_PATH = ROOT / "hoopshd-pdf-link-review.csv"
LSU_FSU_PDF = "https://static.lsusports.net/assets/docs/mb/27stats/lsu03exh.pdf"
NAME_ALIASES = {"uwparkside": "wisconsinparkside", "calbaptist": "californiabaptist", "stjohns": "saintjohns"}
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}


def normalize_team_name(name):
    value = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().casefold()
    value = re.sub(r"[^a-z0-9]", "", value)
    return NAME_ALIASES.get(value, value)


def alias_to_id(team_records):
    aliases = {}
    for item in team_records:
        team = item["team"]
        team_id = int(team["id"])
        for alias in team_aliases(team):
            aliases.setdefault(alias, set()).add(team_id)
    return {name: next(iter(ids)) for name, ids in aliases.items() if len(ids) == 1}


def team_key(name, aliases):
    normalized = normalize_team_name(name)
    return f"id:{aliases[normalized]}" if normalized in aliases else f"name:{normalized}"


def matchup_key(game_date, team_a, team_b, aliases):
    return str(game_date), tuple(sorted((team_key(team_a, aliases), team_key(team_b, aliases))))


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def workbook_games(sheet, aliases):
    headers = {cell.value: cell.column for cell in sheet[6] if cell.value}
    records = []
    for row_number in range(7, sheet.max_row + 1):
        game_id = sheet.cell(row_number, headers["Game ID"]).value
        if not isinstance(game_id, str) or not re.fullmatch(r"G\d+", game_id.strip()):
            continue
        raw_date = sheet.cell(row_number, headers["Date"]).value
        game_date = raw_date.date().isoformat() if isinstance(raw_date, datetime) else raw_date.isoformat() if isinstance(raw_date, date) else date.fromisoformat(raw_date[:10]).isoformat() if isinstance(raw_date, str) and raw_date else ""
        team_a = sheet.cell(row_number, headers["Winner"]).value
        team_b = sheet.cell(row_number, headers["Loser"]).value
        records.append({"row": row_number, "game_id": game_id.strip(), "game_date": game_date,
                        "team_a": str(team_a or ""), "team_b": str(team_b or ""),
                        "key": matchup_key(game_date, team_a, team_b, aliases)})
    return headers, records


def match_schedule_games(schedule, existing, aliases):
    by_key = {}
    for game in existing:
        by_key.setdefault(game["key"], []).append(game)
    matches, new_games, ambiguous = [], [], []
    for game in schedule:
        if game.get("matchup_relevance") != "Relevant":
            continue
        key = matchup_key(game["game_date"], game["team_a"], game["team_b"], aliases)
        candidates = by_key.get(key, [])
        if len(candidates) == 1:
            matches.append((game, candidates[0]))
        elif candidates:
            ambiguous.append(game)
        else:
            new_games.append(game)
    return matches, new_games, ambiguous


def is_pdf_url(url):
    return urlparse(str(url or "")).path.casefold().endswith(".pdf")


def safe_name(value):
    return re.sub(r"[^A-Za-z0-9-]+", "-", str(value or "")).strip("-")[:48] or "team"


def download_pdf(game_id, game_date, team_a, team_b, url, timeout):
    digest = hashlib.sha256(url.encode()).hexdigest()[:10]
    filename = f"{game_id}_{game_date}_{safe_name(team_a)}-vs-{safe_name(team_b)}_{digest}.pdf"
    target = PDF_DIR / filename
    relative = target.relative_to(ROOT).as_posix()
    if target.is_file() and target.stat().st_size:
        return relative, "Cached"
    try:
        with requests.get(url, headers=HEADERS, stream=True, timeout=timeout, allow_redirects=True) as response:
            response.raise_for_status()
            first = next(response.iter_content(chunk_size=8192), b"")
            if not first.startswith(b"%PDF"):
                return "", f"Not a PDF ({response.headers.get('Content-Type', 'unknown content type')})"
            PDF_DIR.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(".pdf.part")
            with temporary.open("wb") as output:
                output.write(first)
                for chunk in response.iter_content(chunk_size=65536):
                    if chunk:
                        output.write(chunk)
            temporary.replace(target)
        return relative, "Downloaded"
    except Exception as error:
        return "", f"Download failed: {type(error).__name__}: {error}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--schedule", type=Path, default=DEFAULT_SCHEDULE)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument("--timeout", type=int, default=40)
    args = parser.parse_args()

    schedule = read_csv(args.schedule)
    response = requests.get(f"{ESPN_BASE}/teams?limit=1000", timeout=args.timeout)
    response.raise_for_status()
    teams = response.json()["sports"][0]["leagues"][0]["teams"]
    aliases = alias_to_id(teams)
    workbook = openpyxl.load_workbook(args.workbook)
    sheet = workbook["Games"]
    headers, existing = workbook_games(sheet, aliases)
    matches, new_games, ambiguous = match_schedule_games(schedule, existing, aliases)

    next_id = max((int(game["game_id"][1:]) for game in existing), default=0) + 1
    new_entries = [{**game, "game_id": f"G{next_id + i:02d}", "row": None} for i, game in enumerate(new_games)]
    jobs, records = [], []
    for game, old in matches:
        pdf_url = LSU_FSU_PDF if {normalize_team_name(game["team_a"]), normalize_team_name(game["team_b"])} == {"floridastate", "lsu"} and game["game_date"] == "2026-10-24" else game["source_url"] if is_pdf_url(game["source_url"]) else ""
        if not pdf_url and headers.get("PDF Source"):
            existing_pdf = sheet.cell(old["row"], headers["PDF Source"]).value
            if is_pdf_url(existing_pdf):
                pdf_url = existing_pdf
        if not pdf_url and is_pdf_url(sheet.cell(old["row"], headers["Source"]).value):
            pdf_url = sheet.cell(old["row"], headers["Source"]).value
        records.append({"game": game, "existing": old, "game_id": old["game_id"], "pdf_url": pdf_url})
    for game in new_entries:
        pdf_url = LSU_FSU_PDF if {normalize_team_name(game["team_a"]), normalize_team_name(game["team_b"])} == {"floridastate", "lsu"} and game["game_date"] == "2026-10-24" else game["source_url"] if is_pdf_url(game["source_url"]) else ""
        records.append({"game": game, "existing": None, "game_id": game["game_id"], "pdf_url": pdf_url})
    for record in records:
        if record["pdf_url"]:
            game = record["game"]
            jobs.append((record, game["game_date"], game["team_a"], game["team_b"], record["pdf_url"]))

    with ThreadPoolExecutor(max_workers=5) as pool:
        pending = {pool.submit(download_pdf, row["game_id"], date_value, team_a, team_b, url, args.timeout): (row, url)
                   for row, date_value, team_a, team_b, url in jobs}
        for completed, future in enumerate(as_completed(pending), 1):
            record, url = pending[future]
            local_path, status = future.result()
            record["local_pdf"], record["download_status"] = local_path, status
            print(f"Downloaded/check {completed}/{len(pending)}: {record['game_id']} {status}", flush=True)
    for record in records:
        record.setdefault("local_pdf", "")
        record.setdefault("download_status", "No direct PDF link")

    pdf_col = headers.get("PDF Source") or max(headers.values()) + 1
    local_col = headers.get("Local PDF") or pdf_col + 1
    sheet.cell(6, pdf_col, "PDF Source")
    sheet.cell(6, local_col, "Local PDF")
    source_col = headers["Source"]
    last_game_row = max(game["row"] for game in existing)
    if new_entries:
        sheet.insert_rows(last_game_row + 1, len(new_entries))
        last_game_row += len(new_entries)
    for row_number in range(6, last_game_row + 1):
        for column in (pdf_col, local_col):
            source_cell = sheet.cell(row_number, source_col)
            target_cell = sheet.cell(row_number, column)
            if source_cell.has_style:
                target_cell._style = copy(source_cell._style)
    new_row_by_id = {entry["game_id"]: last_game_row - len(new_entries) + index + 1 for index, entry in enumerate(new_entries)}
    for record in records:
        game, old = record["game"], record["existing"]
        row_number = old["row"] if old else new_row_by_id[record["game_id"]]
        if old is None:
            values = [game["game_id"], date.fromisoformat(game["game_date"]), game["team_a"], game["team_a_score"], game["team_b"], game["team_b_score"],
                      "PDF downloaded" if record["local_pdf"] else "PDF linked; review download" if record["pdf_url"] else "Linked source; manual/HTML review", game["source_url"]]
            for column, value in enumerate(values, 1):
                sheet.cell(row_number, column, value)
        sheet.cell(row_number, pdf_col, record["pdf_url"] or None)
        local_cell = sheet.cell(row_number, local_col)
        local_cell.value = record["local_pdf"] or None
        if record["local_pdf"]:
            local_cell.hyperlink = (ROOT / record["local_pdf"]).as_uri()
            local_cell.style = "Hyperlink"
    table = next(iter(sheet.tables.values()), None)
    if table:
        table.ref = f"A6:{openpyxl.utils.get_column_letter(local_col)}{last_game_row}"
    sheet["A3"] = f"2026-27 men's basketball. Completed through October 24, 2026. Updated October 25. {last_game_row - 6} games."
    sheet.column_dimensions[openpyxl.utils.get_column_letter(pdf_col)].width = 52
    sheet.column_dimensions[openpyxl.utils.get_column_letter(local_col)].width = 38

    backup = args.workbook.with_name(f"{args.workbook.stem}.before-hoopshd-pdf-sync{args.workbook.suffix}")
    if not backup.exists():
        shutil.copy2(args.workbook, backup)
    workbook.save(args.workbook)

    by_key = {(record["game"]["game_date"], record["game"]["matchup_label"]): record for record in records}
    report = []
    for game in schedule:
        if game.get("matchup_relevance") != "Relevant":
            continue
        record = by_key.get((game["game_date"], game["matchup_label"]))
        report.append({"game_date": game["game_date"], "game_id": record["game_id"] if record else "",
                       "matchup": game["matchup_label"], "source_url": game["source_url"],
                       "pdf_url": record["pdf_url"] if record else "", "local_pdf": record["local_pdf"] if record else "",
                       "status": record["download_status"] if record else "Ambiguous name/date match; skipped"})
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=report[0].keys())
        writer.writeheader()
        writer.writerows(report)
    print(f"Matched {len(matches)} existing games; added {len(new_entries)} new games; ambiguous matches skipped: {len(ambiguous)}.")
    print(f"Workbook backup: {backup}")
    print(f"Updated workbook: {args.workbook}")
    print(f"PDF download report: {args.report}")


if __name__ == "__main__":
    main()
