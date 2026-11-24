"""Create a review CSV from Hoops HD's linked 2026-27 exhibition results."""

import argparse
import csv
import re
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from espn_config import AVAILABLE_TEAMS, ESPN_BASE


SOURCE_URL = "https://hoopshd.com/exhibition-games-schedule-2026-2027/"
MONTHS = {name.upper(): index for index, name in enumerate((
    "January February March April May June July August September October November December"
).split(), 1)}
DATE_RE = re.compile(r"^(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),\s*([A-Z]+)\s+(\d+)(?:ST|ND|RD|TH)?:?$", re.I)
GAME_RE = re.compile(r"^(.+?)\s+(\d+),\s+(.+?)\s+(\d+)(?:\s+\(.*)?$")


def extract_games(html):
    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one(".entry-content")
    if content is None:
        raise ValueError("Hoops HD page did not contain its article content.")

    season = re.search(r"(20\d{2})-(20\d{2})", SOURCE_URL)
    start_year, end_year = map(int, season.groups())
    current_date = None
    games = []
    for paragraph in content.find_all("p"):
        text = " ".join(paragraph.get_text(" ", strip=True).split()).lstrip("–- ")
        date_match = DATE_RE.fullmatch(text)
        if date_match:
            month = MONTHS[date_match.group(1).upper()]
            year = start_year if month >= 7 else end_year
            current_date = date(year, month, int(date_match.group(2))).isoformat()

        for link in paragraph.select("a[href]"):
            label = " ".join(link.get_text(" ", strip=True).split()).lstrip("–- ")
            game_match = GAME_RE.fullmatch(label)
            if not game_match:
                continue
            team_a, score_a, team_b, score_b = game_match.groups()
            url = link["href"].strip()
            games.append({
                "game_date": current_date or "",
                "team_a": team_a,
                "team_a_score": int(score_a),
                "team_b": team_b,
                "team_b_score": int(score_b),
                "matchup_label": label,
                "source_url": url,
                "source_domain": urlparse(url).netloc,
                "source_type": "PDF" if urlparse(url).path.casefold().endswith(".pdf") else "Webpage",
                "review_status": "Verify linked page contains a complete box score",
                "approval": "",
            })
    if not games:
        raise ValueError("No linked scored exhibition games were found; page format may have changed.")
    return games


def normalize_team_name(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().casefold()
    return re.sub(r"[^a-z0-9]", "", ascii_name)


def team_aliases(team):
    names = {team.get(key, "") for key in ("location", "displayName", "shortDisplayName", "name", "abbreviation")}
    display_name, nickname = team.get("displayName", ""), team.get("name", "")
    if nickname and display_name.endswith(nickname):
        names.add(display_name[:-len(nickname)].strip())
    aliases = set(names)
    for name in names:
        if name.casefold().startswith("st. "):
            aliases.add("Saint " + name[4:])
        elif name.casefold().startswith("saint "):
            aliases.add("St. " + name[6:])
    if team.get("location") == "UConn":
        aliases.add("Connecticut")
    if team.get("location") == "Miami" and int(team["id"]) in AVAILABLE_TEAMS:
        aliases.add("Miami FL")
    return {normalize_team_name(name) for name in aliases if name}


def classify_games(games, team_records):
    aliases = {}
    for item in team_records:
        team = item["team"]
        team_id = int(team["id"])
        for alias in team_aliases(team):
            aliases.setdefault(alias, set()).add(team_id)

    def match(name):
        ids = aliases.get(normalize_team_name(name), set())
        return next(iter(ids)) if len(ids) == 1 else None

    for game in games:
        team_a_id = match(game["team_a"])
        team_b_id = match(game["team_b"])
        eligible = [team_id for team_id in (team_a_id, team_b_id) if team_id in AVAILABLE_TEAMS]
        if eligible:
            relevance = "Relevant"
        elif team_a_id is not None and team_b_id is not None:
            relevance = "Not relevant"
        else:
            relevance = "Review team match"
        game.update({
            "team_a_espn_id": team_a_id or "",
            "team_b_espn_id": team_b_id or "",
            "eligible_teams": "; ".join(name for name, team_id in ((game["team_a"], team_a_id), (game["team_b"], team_b_id)) if team_id in AVAILABLE_TEAMS),
            "matchup_relevance": relevance,
        })
    return games


def main():
    parser = argparse.ArgumentParser(description="Build a review queue from Hoops HD's linked exhibition results.")
    parser.add_argument("--output", default="hoopshd-exhibition-review.csv")
    parser.add_argument("--relevant-output", default="hoopshd-relevant-exhibition-review.csv")
    args = parser.parse_args()

    response = requests.get(SOURCE_URL, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }, timeout=30)
    response.raise_for_status()
    team_response = requests.get(f"{ESPN_BASE}/teams?limit=1000", timeout=30)
    team_response.raise_for_status()
    team_records = team_response.json()["sports"][0]["leagues"][0]["teams"]
    games = classify_games(extract_games(response.content), team_records)
    with open(args.output, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=games[0].keys())
        writer.writeheader()
        writer.writerows(games)
    review_games = [game for game in games if game["matchup_relevance"] != "Not relevant"]
    with open(args.relevant_output, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=review_games[0].keys())
        writer.writeheader()
        writer.writerows(review_games)
    pdfs = sum(game["source_type"] == "PDF" for game in games)
    relevant = sum(game["matchup_relevance"] == "Relevant" for game in games)
    unresolved = sum(game["matchup_relevance"] == "Review team match" for game in games)
    print(f"Found {len(games)} linked scored games ({pdfs} direct PDF links).")
    print(f"Team-pool check: {relevant} relevant, {unresolved} need team-name review; {len(review_games)} rows kept for review.")
    print(f"Full source queue: {Path(args.output).resolve()}")
    print(f"Relevant + unresolved queue: {Path(args.relevant_output).resolve()}")
    print("Confirm each exhibition and complete box score before importing anything.")


if __name__ == "__main__":
    main()
