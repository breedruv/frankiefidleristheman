"""Check today's Hoops HD games for PDF box scores and tracked-team HTML fallbacks."""

import argparse
import csv
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from urllib.parse import quote_plus, urlparse

import requests
from bs4 import BeautifulSoup

from discover_hoopshd_exhibitions import classify_games, extract_games, SOURCE_URL
from espn_config import AVAILABLE_TEAMS, ESPN_BASE
from exhibition_sources import extract_table_rows, fetch_source

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}


def relevant_team(game):
    for key in ("team_a", "team_b"):
        if game.get(f"{key}_espn_id") and int(game[f"{key}_espn_id"]) in AVAILABLE_TEAMS:
            return game[key]
    return ""


def find_official_schedule_url(team_name, timeout):
    query = quote_plus(f"{team_name} men's basketball box score exhibition")
    response = requests.get(f"https://www.google.com/search?q={query}", headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    for link in soup.select("a[href]"):
        href = link.get("href", "")
        match = re.match(r"/url\?q=([^&]+)", href)
        url = match.group(1) if match else href
        host = urlparse(url).netloc.casefold()
        if host.endswith(".edu") or any(domain in host for domain in ("sidearmstats.com", "sidearmsports.com")):
            if "espn.com" not in host and "hoopshd.com" not in host:
                return url
    return ""


def check_game(game, timeout):
    tracked = relevant_team(game)
    base = {**game, "tracked_team": tracked, "pdf_status": "", "html_search_url": "", "html_candidate_url": "", "html_status": "", "recommended_source": "", "review_status": ""}
    session = requests.Session()
    try:
        tables, kind, text = fetch_source(session, game["source_url"], timeout)
        rows = extract_table_rows(tables, [game["team_a"], game["team_b"]])
        if kind == "PDF" and not rows:
            from compare_exhibition_stats import parse_pdf_text, parse_pdf_tables
            rows = parse_pdf_tables(tables) + parse_pdf_text(text)
        base["pdf_status"] = f"{kind} reachable; {len(rows)} player rows parsed"
        if rows:
            base["recommended_source"] = game["source_url"]
            base["review_status"] = "PDF/source has player rows; verify tracked team is included"
            return base
    except Exception as error:
        base["pdf_status"] = f"Unavailable/unparsed: {type(error).__name__}: {error}"

    if not tracked:
        base["review_status"] = "No eligible tracked team resolved; review team match"
        return base
    query = quote_plus(f"{tracked} men's basketball {game['game_date']} box score")
    base["html_search_url"] = f"https://www.google.com/search?q={query}"
    try:
        candidate = find_official_schedule_url(tracked, timeout)
        base["html_candidate_url"] = candidate
        if not candidate:
            base["html_status"] = "No official athletics candidate found"
            base["review_status"] = "Manual search needed"
            return base
        response = session.get(candidate, headers=HEADERS, timeout=timeout, allow_redirects=True)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")
        tables = []
        for table in soup.find_all("table"):
            section = table.find_parent(class_=lambda value: value and "scoring-indivual-stats" in value)
            heading = section.find("h2", attrs={"alt": True}) if section else None
            team_label = (heading.get("alt") or heading.get_text(" ", strip=True)) if heading else ""
            rows = [[cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])] for row in table.find_all("tr")]
            tables.append((rows, re.sub(r"\s-\s\d+\s*$", "", team_label)))
        html_rows = extract_table_rows(tables, [tracked])
        base["html_status"] = f"HTTP {response.status_code}; {len(html_rows)} player rows parsed"
        if html_rows:
            base["recommended_source"] = response.url
            base["review_status"] = "HTML box score found; verify matchup/date and tracked-team rows"
        else:
            base["review_status"] = "Official page candidate found, but no supported box-score rows; manual review needed"
    except Exception as error:
        base["html_status"] = f"Search/fetch failed: {type(error).__name__}: {error}"
        base["review_status"] = "Manual search needed"
    return base


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=date.today().isoformat(), help="Game date in YYYY-MM-DD (default: today)")
    parser.add_argument("--output", default="today-exhibition-boxscore-check.csv")
    parser.add_argument("--timeout", type=int, default=25)
    args = parser.parse_args()

    try:
        page = requests.get(SOURCE_URL, headers=HEADERS, timeout=args.timeout)
        page.raise_for_status()
        games = extract_games(page.content)
        teams_response = requests.get(f"{ESPN_BASE}/teams?limit=1000", timeout=args.timeout)
        teams_response.raise_for_status()
        teams = teams_response.json()["sports"][0]["leagues"][0]["teams"]
        games = classify_games(games, teams)
        schedule_status = "Live Hoops HD schedule"
    except Exception as error:
        cached = Path("hoopshd-relevant-exhibition-review.csv")
        if not cached.exists():
            raise RuntimeError(f"Live schedule unavailable and no cached schedule exists: {error}") from error
        with cached.open(newline="", encoding="utf-8-sig") as handle:
            games = list(csv.DictReader(handle))
        schedule_status = f"Cached schedule (live request failed: {type(error).__name__})"
    games = [game for game in games if game["game_date"] == args.date and game.get("matchup_relevance") != "Not relevant"]
    if not games:
        print(f"{schedule_status}: no relevant or unresolved games listed for {args.date}.")
        return

    results = [None] * len(games)
    with ThreadPoolExecutor(max_workers=3) as pool:
        pending = {pool.submit(check_game, game, args.timeout): index for index, game in enumerate(games)}
        for done, future in enumerate(as_completed(pending), 1):
            results[pending[future]] = future.result()
            print(f"Checked {done}/{len(games)} games", flush=True)
    with open(args.output, "w", newline="", encoding="utf-8-sig") as handle:
        fields = list(dict.fromkeys(key for result in results for key in result))
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(results)
    for result in results:
        print(f"{result['game_date']} {result['matchup_label']} | {result['pdf_status']} | HTML: {result['html_status']} | {result['review_status']}")
    print(schedule_status)
    print(f"Review CSV: {Path(args.output).resolve()}")


if __name__ == "__main__":
    main()
