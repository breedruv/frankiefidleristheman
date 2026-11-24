"""Build a review queue for exhibition game box-score sources; never writes to DB."""

import argparse
import csv
import io
import re
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

import openpyxl
import requests
import pdfplumber
from bs4 import BeautifulSoup


def source_type(url):
    parsed = urlparse(url or "")
    path = parsed.path.casefold()
    if path.endswith(".pdf") or path.endswith(".pdf/"):
        return "PDF"
    return "Webpage"


def workbook_games(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook["Games"]
        rows = sheet.iter_rows(values_only=True)
        headers = None
        for row in rows:
            if row and row[0] == "Game ID":
                headers = {name: index for index, name in enumerate(row) if name}
                break
        if not headers:
            raise ValueError("Could not find the Games sheet header row.")

        for row in rows:
            label = row[headers["Game ID"]]
            if not isinstance(label, str) or not label.strip().startswith("G") or not label.strip()[1:].isdigit():
                continue
            source = row[headers.get("PDF Source", headers["Source"])] or row[headers["Source"]]
            local_pdf = row[headers["Local PDF"]] if "Local PDF" in headers else None
            coverage = row[headers["Coverage"]]
            raw_date = row[headers["Date"]]
            game_date = raw_date.date().isoformat() if isinstance(raw_date, datetime) else raw_date.isoformat() if isinstance(raw_date, date) else ""
            yield {
                "game_label": label.strip(),
                "game_date": game_date,
                "team_a": row[headers["Winner"]],
                "team_a_score": row[headers["Winner PTS"]],
                "team_b": row[headers["Loser"]],
                "team_b_score": row[headers["Loser PTS"]],
                "coverage": coverage,
                "source_url": source,
                "local_pdf_path": local_pdf,
            }
    finally:
        workbook.close()


def workbook_manual_stats(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Player stats"]
    rows = sheet.iter_rows(values_only=True)
    headers = None
    for row in rows:
        if row and "Game ID" in row:
            headers = {name: index for index, name in enumerate(row) if name}
            break
    if not headers:
        raise ValueError("Could not find the Player stats sheet header row.")

    columns = {
        "team_id": "Team ID", "source_team_name": "Team", "source_player_name": "Player",
        "player_id": "Player ID", "minutes": "Minutes", "pts": "PTS", "reb": "REB",
        "ast": "AST", "steals": "STL", "blocks": "BLK", "turnovers": "TO",
        "fgm": "FGM", "fga": "FGA", "tpm": "3PM", "tpa": "3PA", "ftm": "FTM",
        "fta": "FTA", "oreb": "OREB", "dreb": "DREB", "pf": "PF",
        "plus_minus": "+/-", "fd": "FD", "ba": "BA", "jersey": "Jersey",
        "position": "Position", "starter": "Starter",
    }
    result = {}
    for row in rows:
        game_id = row[headers["Game ID"]]
        player = row[headers["Player"]] if "Player" in headers else None
        if not game_id or not player:
            continue
        candidate = {key: row[headers[column]] if column in headers else None for key, column in columns.items()}
        candidate["source_player_name"] = str(candidate["source_player_name"]).strip()
        candidate["jersey"] = str(candidate["jersey"] or "").strip()
        result.setdefault(str(game_id).strip(), []).append(candidate)
    workbook.close()
    return result


def inspect_source(session, url, timeout):
    if not url:
        return "Missing source URL", ""
    try:
        response = session.get(url, timeout=timeout, stream=True, allow_redirects=True)
        result = f"HTTP {response.status_code}"
        content_type = response.headers.get("Content-Type", "").split(";", 1)[0]
        response.close()
        return result, content_type
    except requests.RequestException as error:
        return f"Request failed: {type(error).__name__}", ""


def fetch_source(session, url, timeout):
    local_path = Path(str(url or ""))
    if local_path.is_file():
        content = local_path.read_bytes()
        content_type = "application/pdf"
        source_url = local_path.resolve().as_uri()
    else:
        response = session.get(url, timeout=timeout, allow_redirects=True)
        response.raise_for_status()
        content = response.content
        content_type = response.headers.get("Content-Type", "").casefold()
        source_url = response.url
    is_pdf = "pdf" in content_type or urlparse(source_url).path.casefold().endswith(".pdf")
    if is_pdf or content.startswith(b"%PDF"):
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages = pdf.pages
            boxscore_pages = []
            for page_number, page in enumerate(pages, 1):
                page_text = (page.extract_text() or "").replace("\x00", "")
                heading = " ".join(page_text.splitlines()[:6]).casefold()
                has_player_header = re.search(r"(?m)^\s*#\s+Player\s+GS\s+MIN\s+FG\b", page_text, re.I)
                period = re.search(r"box score\s*-\s*(.+?)\s+game time", heading)
                is_half_page = (re.search(r"\b(?:first|second|1st|2nd)\s+half\b", heading, re.I)
                                or (period and period.group(1).strip() != "final"))
                is_final_boxscore = "box score" in heading
                if not is_half_page and (has_player_header or is_final_boxscore):
                    boxscore_pages.append((page_number, page, page_text))
            tables = [(table, f"pdf_page:{page_number}") for page_number, page, _ in boxscore_pages for table in (page.extract_tables() or [])]
            boxscore_text = [f"[[PDF_PAGE:{page_number}]]\n{page_text}" for page_number, _, page_text in boxscore_pages]
            text = "\n".join(boxscore_text)
            return tables, "PDF", text
    soup = BeautifulSoup(content, "html.parser")
    tables = []
    for table in soup.find_all("table"):
        section = table.find_parent(class_=lambda value: value and "scoring-indivual-stats" in value)
        heading = section.find("h2", attrs={"alt": True}) if section else None
        heading_text = (heading.get("alt") or heading.get_text(" ", strip=True)) if heading else ""
        team_name = re.sub(r"\s-\s\d+\s*$", "", heading_text)
        rows = [[cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])] for row in table.find_all("tr")]
        tables.append((rows, team_name))
    return tables, "Webpage", ""


def extract_candidate_rows(text):
    """Conservative text-table extractor; unknown layouts become manual review rows."""
    extracted = []
    for line in text.splitlines():
        clean = " ".join(line.split())
        # Keep likely stat lines only; never infer IDs or silently import them.
        match = re.match(r"^(\d{1,2})\s+(.+?)\s+(\d{1,2})\s+(\d{1,2})-(\d{1,2})\s+(\d{1,2})-(\d{1,2})\s+(\d{1,2})-(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})$", clean)
        if match:
            jersey, name, minutes, fgm, fga, tpm, tpa, ftm, fta, reb, ast, pf, turnovers = match.groups()
            extracted.append({"jersey": jersey, "source_player_name": name, "minutes": minutes, "fgm": fgm, "fga": fga, "tpm": tpm, "tpa": tpa, "ftm": ftm, "fta": fta, "reb": reb, "ast": ast, "pf": pf, "turnovers": turnovers})
    return extracted


def parse_boxscore_row(cells, team_name=None):
    if len(cells) < 15 or not str(cells[0]).strip().isdigit():
        return None
    values = [" ".join(str(value or "").split()) for value in cells]
    def pair(value):
        match = re.fullmatch(r"(\d+)\s*-\s*(\d+)", value)
        return tuple(map(int, match.groups())) if match else (None, None)
    fgm, fga = pair(values[4]); tpm, tpa = pair(values[5]); ftm, fta = pair(values[6]); oreb, dreb = pair(values[7])
    try:
        numbers = [int(values[i]) for i in (8, 9, 10, 11, 12, 13, 14)]
        minutes = float(values[3]) if values[3] else None
    except ValueError:
        return None
    if any(v is None for v in (fgm, fga, tpm, tpa, ftm, fta, oreb, dreb)):
        return None
    return {"source_team_name": team_name or "", "jersey": values[0], "source_player_name": values[1], "minutes": minutes, "fgm": fgm, "fga": fga, "tpm": tpm, "tpa": tpa, "ftm": ftm, "fta": fta, "oreb": oreb, "dreb": dreb, "reb": numbers[0], "pf": numbers[1], "ast": numbers[2], "turnovers": numbers[3], "blocks": numbers[4], "steals": numbers[5], "pts": numbers[6]}


def extract_table_rows(tables, team_names=()):
    extracted = []
    team_names = {" ".join(str(name).casefold().split()): name for name in team_names if name}
    for table, source_team in tables:
        headers = [[str(cell or "").strip().casefold() for cell in row] for row in table]
        if not any(row and row[0] == "#" and "player" in row for row in headers):
            continue
        normalized = " ".join(str(source_team).casefold().split())
        team = team_names.get(normalized, source_team)
        extracted.extend(parsed for row in table if (parsed := parse_boxscore_row(row, team)))
    return extracted


def build_review(path, output, timeout=20):
    session = requests.Session()
    review = []
    manual_by_game = workbook_manual_stats(path)
    for game in workbook_games(path):
        extracted, parsed_type = [], source_type(game["source_url"])
        source_to_read = game.get("local_pdf_path") if game.get("local_pdf_path") and Path(game["local_pdf_path"]).is_file() else game["source_url"]
        if source_to_read:
            try:
                tables, parsed_type, source_text = fetch_source(session, source_to_read, timeout)
                if parsed_type == "PDF":
                    from compare_exhibition_stats import parse_source_rows
                    extracted = parse_source_rows(tables, parsed_type, source_text)
                else:
                    extracted = extract_table_rows(tables, [game["team_a"], game["team_b"]])
                status = f"HTTP 200; extracted {len(extracted)} candidate rows"
            except Exception as error:
                status = f"Source needs review ({type(error).__name__}: {error})"
        else:
            status = "No source link; manual entry available"
        if not extracted and manual_by_game.get(game["game_label"]):
            extracted = manual_by_game[game["game_label"]]
            parsed_type = "Manual workbook entry"
            status = f"Manual workbook entry; {len(extracted)} player rows"
        if not extracted:
            review.append({**game, "source_type": parsed_type, "source_status": status, "team_id": "", "player_id": "", "jersey": "", "source_team_name": "", "source_player_name": "", "minutes": "", "fgm": "", "fga": "", "tpm": "", "tpa": "", "ftm": "", "fta": "", "reb": "", "oreb": "", "dreb": "", "ast": "", "pf": "", "turnovers": "", "blocks": "", "steals": "", "pts": "", "plus_minus": "", "fd": "", "ba": "", "ready_for_extraction": "review", "approval": ""})
        else:
            for candidate in extracted:
                review.append({**game, "source_type": parsed_type, "source_status": status, **candidate, "ready_for_extraction": "review", "approval": ""})
    if not review:
        raise ValueError("No exhibition games with source URLs found.")
    with open(output, "w", newline="", encoding="utf-8-sig") as handle:
        fields = list(dict.fromkeys(key for row in review for key in row))
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(review)
    return review


def summarize_review(review):
    games = {}
    for row in review:
        games.setdefault(row["game_label"], row)
    parsed_games = sum(bool(re.search(r"extracted [1-9]\d* candidate rows", row["source_status"])) for row in games.values())
    manual_games = sum(row["source_type"] == "Manual workbook entry" for row in games.values())
    return {
        "games": len(games), "review_rows": len(review), "parsed_games": parsed_games,
        "manual_games": manual_games, "needs_review_games": len(games) - parsed_games - manual_games,
        "pdf_games": sum(row["source_type"] == "PDF" for row in games.values()),
        "webpage_games": sum(row["source_type"] == "Webpage" for row in games.values()),
    }


def main():
    parser = argparse.ArgumentParser(description="Check exhibition box-score sources and create a manual review queue.")
    parser.add_argument("workbook", nargs="?", default="College-Basketball-Exhibition-Box-Scores-2026(1).xlsx")
    parser.add_argument("--output", default="exhibition-source-review.csv")
    parser.add_argument("--timeout", type=int, default=20)
    args = parser.parse_args()
    results = build_review(args.workbook, args.output, args.timeout)
    summary = summarize_review(results)
    print(f"Prepared review for {summary['games']} games: {summary['pdf_games']} linked PDFs, {summary['webpage_games']} webpages, {summary['manual_games']} with manual workbook stats.")
    print(f"Parsed source rows for {summary['parsed_games']} games; {summary['needs_review_games']} games need source or format review. Wrote {summary['review_rows']} player rows for review; nothing was imported.")
    print(f"Review queue: {Path(args.output).resolve()}")


if __name__ == "__main__":
    main()
