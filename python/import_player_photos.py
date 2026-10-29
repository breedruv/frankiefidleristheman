"""Apply reviewed school photo URLs to players missing ESPN headshots."""

import csv
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import requests

from export_missing_player_photos import check_photo, player_pool

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "school-player-photos.csv"
REVIEW = ROOT / "school-player-photo-import-review.csv"


def main():
    with SOURCE.open(newline="", encoding="utf-8-sig") as handle:
        rows = [row for row in csv.DictReader(handle) if (row.get("player_id") or "").strip()]
    assert len({row["player_id"] for row in rows}) == len(rows), "Duplicate player IDs in photo review"
    players = {str(row["player_id"]): row for row in player_pool()}
    for row in rows:
        row["team_site_photo_url"] = (row.get("team_site_photo_url") or "").strip()
        player = players.get(row["player_id"])
        if player is None:
            raise ValueError(f"Player {row['player_id']} is no longer in the current pool")
        name = f"{player.get('first_name') or ''} {player.get('last_name') or ''}".strip()
        if name.casefold() != row["player_name"].strip().casefold() or str(player["team_id"]) != row["team_id"].strip():
            raise ValueError(f"Player identity changed for {row['player_id']}")
        if row["team_site_photo_url"] and urlparse(row["team_site_photo_url"]).scheme != "https":
            raise ValueError(f"Photo URL must use HTTPS for {row['player_id']}")

    def apply(row):
        url = row["team_site_photo_url"]
        if not url:
            return "no_photo_found"
        existing = players[row["player_id"]].get("headshot")
        if existing:
            return "already_imported" if existing == url else "existing_photo_preserved"
        _, reason, status = check_photo({"headshot": url})
        if reason != "available":
            return f"photo_{reason}_{status}"
        response = requests.patch(
            f"{base}/rest/v1/players",
            headers=headers,
            params={"player_id": f"eq.{row['player_id']}", "headshot": "is.null"},
            json={"headshot": url},
            timeout=20,
        )
        response.raise_for_status()
        return "imported" if len(response.json()) == 1 else "not_updated_review"

    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=representation"}
    with ThreadPoolExecutor(max_workers=8) as executor:
        statuses = list(executor.map(apply, rows))
    with REVIEW.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=[*SOURCE_FIELDS, "import_status"])
        writer.writeheader()
        for row, status in zip(rows, statuses):
            writer.writerow({**{field: row.get(field, "") for field in SOURCE_FIELDS}, "import_status": status})
    from collections import Counter
    print(f"Photo import: {dict(Counter(statuses))}; review: {REVIEW}")


SOURCE_FIELDS = [
    "player_id", "player_name", "team_id", "team_name", "position", "reason",
    "http_status", "espn_headshot_url", "official_roster_url", "candidate_roster_url",
    "roster_search_url", "team_site_photo_url",
]

if __name__ == "__main__":
    main()
