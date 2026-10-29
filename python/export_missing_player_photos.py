"""Export current draft-pool players without a working ESPN headshot."""

import csv
import os
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import requests

from espn_config import AVAILABLE_TEAMS
from espn_ingest import load_env_local

ROOT = Path(__file__).resolve().parent.parent
FIELDS = [
    "player_id", "player_name", "team_id", "team_name", "position", "reason",
    "http_status", "espn_headshot_url", "official_roster_url", "candidate_roster_url",
    "roster_search_url", "team_site_photo_url",
]


def player_pool():
    load_env_local()
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows = []
    for offset in range(0, 5000, 1000):
        response = requests.post(
            f"{base}/rest/v1/rpc/roster_snapshot",
            headers=headers,
            params={"limit": 1000, "offset": offset},
            json={"include_dnp": False, "row_limit": 5000},
            timeout=30,
        )
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if len(page) < 1000:
            break
    allowed = {int(team_id) for team_id in AVAILABLE_TEAMS}
    rows = [row for row in rows if row.get("team_id") is not None and int(row["team_id"]) in allowed]
    assert len({row["player_id"] for row in rows}) == len(rows), "Player pool contains duplicate IDs"
    return rows


def check_photo(row):
    url = (row.get("headshot") or "").strip()
    if not url:
        return row, "missing_url", ""
    if urlparse(url).scheme not in ("http", "https"):
        return row, "broken_url", "invalid_url"
    for attempt in range(2):
        try:
            response = requests.head(url, allow_redirects=True, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            if response.status_code in (403, 405) or not response.headers.get("content-type", "").lower().startswith("image/"):
                response.close()
                response = requests.get(url, allow_redirects=True, timeout=10, stream=True, headers={"User-Agent": "Mozilla/5.0"})
            status = response.status_code
            content_type = response.headers.get("content-type", "").lower()
            response.close()
            if status == 200 and content_type.startswith("image/"):
                return row, "available", str(status)
            if status in (404, 410) or status == 200:
                return row, "broken_url", str(status)
            if attempt == 0 and status in (429, 500, 502, 503, 504):
                time.sleep(1)
                continue
            return row, "unverified", str(status)
        except requests.RequestException as error:
            if attempt == 0:
                time.sleep(1)
                continue
            return row, "unverified", type(error).__name__
    return row, "unverified", "retry_exhausted"


def school_sites():
    candidates = {}
    candidate_file = ROOT / "school-site-discovery.csv"
    if candidate_file.exists():
        with candidate_file.open(newline="", encoding="utf-8-sig") as handle:
            candidates = {
                int(site["espn_team_id"]): site.get("official_roster_url") or ""
                for site in csv.DictReader(handle) if site["espn_team_id"].isdigit()
            }
    sites = {team_id: {"candidate_roster_url": url} for team_id, url in candidates.items()}
    reviewed_file = ROOT / "school-site-discovery-updated.csv"
    if reviewed_file.exists():
        with reviewed_file.open(newline="", encoding="utf-8-sig") as handle:
            for site in csv.DictReader(handle):
                if site["espn_team_id"].isdigit():
                    team_id = int(site["espn_team_id"])
                    sites[team_id] = {**site, "candidate_roster_url": candidates.get(team_id, "")}
    return sites


def export(path, results, sites):
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for row, reason, status in sorted(results, key=lambda item: (item[0].get("team_name") or "", item[0].get("last_name") or "", item[0].get("first_name") or "")):
            site = sites.get(int(row["team_id"]), {})
            writer.writerow({
                "player_id": row["player_id"],
                "player_name": f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip(),
                "team_id": row["team_id"],
                "team_name": row.get("team_name") or "",
                "position": row.get("position") or "",
                "reason": reason,
                "http_status": status,
                "espn_headshot_url": row.get("headshot") or "",
                "official_roster_url": site.get("official_roster_url") or "",
                "candidate_roster_url": site.get("candidate_roster_url") or "",
                "roster_search_url": site.get("google_roster_search") or "",
                "team_site_photo_url": "",
            })


def main():
    rows = player_pool()
    print(f"Checking {len(rows)} draft-pool players", flush=True)
    results = []
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = [executor.submit(check_photo, row) for row in rows]
        for index, future in enumerate(as_completed(futures), 1):
            results.append(future.result())
            if index % 250 == 0:
                print(f"Checked {index}/{len(rows)}", flush=True)
    sites = school_sites()
    missing = [result for result in results if result[1] in ("missing_url", "broken_url")]
    output = ROOT / f"missing-player-photos-{date.today().isoformat()}.csv"
    export(output, missing, sites)
    unverified = [result for result in results if result[1] == "unverified"]
    if unverified:
        export(ROOT / f"unverified-player-photo-urls-{date.today().isoformat()}.csv", unverified, sites)
    print(f"Exported {len(missing)} players to {output.name}; statuses: {dict(Counter(reason for _, reason, _ in results))}", flush=True)


if __name__ == "__main__":
    main()
