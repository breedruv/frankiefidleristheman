"""Create a review queue for finding official athletics roster/schedule pages."""

import argparse
import csv
from pathlib import Path
from urllib.parse import quote_plus

import requests

from espn_config import AVAILABLE_TEAMS, ESPN_BASE


def build_search_rows(session):
    response = session.get(f"{ESPN_BASE}/teams?limit=1000", timeout=30)
    response.raise_for_status()
    teams = response.json()["sports"][0]["leagues"][0]["teams"]
    by_id = {int(item["team"]["id"]): item["team"] for item in teams}
    missing = sorted(set(AVAILABLE_TEAMS) - by_id.keys())
    if missing:
        raise ValueError(f"ESPN team feed is missing eligible team IDs: {missing}")

    rows = []
    for team_id in AVAILABLE_TEAMS:
        team = by_id[team_id]
        school = team["location"]
        full_name = team["displayName"]
        query = f"{full_name} men's basketball roster"
        rows.append({
            "espn_team_id": team_id,
            "school": school,
            "team": team["displayName"],
            "google_roster_search": f"https://www.google.com/search?q={quote_plus(query)}",
            "official_roster_url": "",
            "official_schedule_url": "",
            "notes": "",
        })
    return rows


def preserve_review_fields(rows, output):
    try:
        with open(output, newline="", encoding="utf-8-sig") as handle:
            existing = {int(row["espn_team_id"]): row for row in csv.DictReader(handle)}
    except FileNotFoundError:
        return rows
    for row in rows:
        previous = existing.get(row["espn_team_id"], {})
        for field in ("official_roster_url", "official_schedule_url", "notes"):
            row[field] = previous.get(field, "")
    return rows


def main():
    parser = argparse.ArgumentParser(description="Generate Google searches to identify official school athletics pages.")
    parser.add_argument("--output", default="school-site-discovery.csv")
    args = parser.parse_args()

    rows = preserve_review_fields(build_search_rows(requests.Session()), args.output)
    with open(args.output, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    print(f"Created {len(rows)} school searches: {Path(args.output).resolve()}")
    print("Use official athletics-site results; fill in the roster and schedule URL columns for review.")


if __name__ == "__main__":
    main()
