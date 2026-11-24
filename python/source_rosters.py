"""Fetch CBS Sports and Yahoo Sports rosters for every AVAILABLE_TEAMS school and match them to ESPN players.

Writes review CSVs only (no database writes):
  source-rosters/cbs-rosters-<season>.csv
  source-rosters/yahoo-rosters-<season>.csv

ESPN stays the identity system. espn_player_id is filled only when the normalized name matches a player on that
team's ESPN roster in Supabase; jersey-only or last-name matches go to candidate columns for human review.

Usage:
  python python/source_rosters.py                 # both sources, all teams
  python python/source_rosters.py --source cbs --team 2567
"""
import argparse
import csv
import re
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cbs_roster import CBS_BASE, parse_cbs_roster  # noqa: E402
from espn_config import AVAILABLE_TEAMS  # noqa: E402
from espn_ingest import SupabaseRest, espn_season, load_env_local, supabase_config  # noqa: E402
from yahoo_rosters import YAHOO_BASE, parse_yahoo_roster  # noqa: E402

ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=1000"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
ROOT = Path(__file__).resolve().parent.parent
# Schools whose site slug doesn't follow the ESPN display name (CBS) or location (Yahoo).
CBS_OVERRIDES = {41: "connecticut-huskies", 127: "michigan-st-spartans", 2390: "miami-fla-hurricanes", 2636: "texassan-antonio-roadrunners"}
YAHOO_OVERRIDES = {2390: "miami-(fl)"}
COLUMNS = ["source", "espn_team_id", "team", "jersey", "name", "position", "height", "weight", "class", "hometown",
           "source_player_id", "source_player_url", "espn_player_id", "espn_name", "match", "candidate_espn_id", "candidate_espn_name", "source_team_url"]


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower().replace("&", "").replace("'", "")).strip("-")


def normalize_name(name):
    text = unicodedata.normalize("NFD", name or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    text = re.sub(r"[.'’-]", "", text)
    text = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", text)
    return re.sub(r"\s+", " ", text).strip()


def get(session, url):
    for attempt in range(3):
        response = session.get(url, timeout=30)
        if response.status_code in (429, 503) and attempt < 2:
            time.sleep(10 * (attempt + 1))
            continue
        response.raise_for_status()
        return response.text
    raise RuntimeError(f"{url} kept returning {response.status_code}")


def team_urls(session):
    data = requests.get(ESPN_TEAMS_URL, timeout=30).json()
    teams = {int(t["team"]["id"]): t["team"] for t in data["sports"][0]["leagues"][0]["teams"]}
    cbs = {s: code for code, s in re.findall(r"/college-basketball/teams/([A-Z0-9]+)/([a-z0-9-]+)/", get(session, f"{CBS_BASE}/college-basketball/teams/"))}
    yahoo = set(re.findall(r"/ncaab/teams/([a-z0-9()-]+)/", get(session, f"{YAHOO_BASE}/college-basketball/teams/")))
    urls = {}
    for team_id in AVAILABLE_TEAMS:
        team = teams.get(team_id)
        if not team:
            print(f"ESPN team {team_id} not found; skipped.")
            continue
        cbs_slug = CBS_OVERRIDES.get(team_id, slug(team["displayName"]))
        yahoo_slug = YAHOO_OVERRIDES.get(team_id, slug(team["location"]))
        urls[team_id] = {
            "team": team["displayName"],
            "cbs": f"{CBS_BASE}/college-basketball/teams/{cbs[cbs_slug]}/{cbs_slug}/roster/" if cbs_slug in cbs else None,
            "yahoo": f"{YAHOO_BASE}/ncaab/teams/{yahoo_slug}/roster/" if yahoo_slug in yahoo else None,
        }
    return urls


def espn_rosters():
    """team_id -> [{player_id, name, jersey}] from the latest season's team_rosters in Supabase."""
    url, key = supabase_config()
    client = SupabaseRest(url, key, 30)
    def pages(table, params):
        rows, offset = [], 0
        while True:
            page = client.select(table, {**params, "limit": 1000, "offset": offset})
            rows += page
            if len(page) < 1000:
                return rows
            offset += 1000
    season = client.select("team_rosters", {"select": "season", "order": "season.desc", "limit": 1})[0]["season"]
    players = {int(p["player_id"]): p for p in pages("players", {"select": "player_id,first_name,last_name,player_number"})}
    rosters = {}
    for row in pages("team_rosters", {"select": "team_id,player_id", "season": f"eq.{season}"}):
        p = players.get(int(row["player_id"]))
        if p:
            rosters.setdefault(int(row["team_id"]), []).append({
                "player_id": int(p["player_id"]), "name": f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip(), "jersey": str(p.get("player_number") or "")})
    return rosters


def match_player(player, roster):
    name = normalize_name(player["name"])
    by_name = [p for p in roster if normalize_name(p["name"]) == name]
    if len(by_name) == 1:
        p = by_name[0]
        return {"espn_player_id": p["player_id"], "espn_name": p["name"], "match": "exact" if p["jersey"] == player["jersey"] else "name"}
    last = name.split(" ")[-1] if name else ""
    by_jersey = [p for p in roster if player["jersey"] and p["jersey"] == player["jersey"]]
    by_last = [p for p in roster if last and normalize_name(p["name"]).split(" ")[-1] == last]
    candidates = [p for p in by_jersey if p in by_last] or by_last or by_jersey
    if len(by_name) > 1:
        candidates, kind = by_name, "review_duplicate_name"
    else:
        kind = "review_jersey_last_name" if any(p in by_last for p in by_jersey) else "review_last_name" if by_last else "review_jersey_only" if by_jersey else "not_on_espn"
    return {"espn_player_id": "", "espn_name": "", "match": kind,
            "candidate_espn_id": "; ".join(str(p["player_id"]) for p in candidates),
            "candidate_espn_name": "; ".join(p["name"] for p in candidates)}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=["cbs", "yahoo", "all"], default="all")
    parser.add_argument("--team", type=int, action="append", help="ESPN team id (repeatable); default all AVAILABLE_TEAMS")
    parser.add_argument("--sleep", type=float, default=1.5, help="Seconds between roster requests")
    parser.add_argument("--out-dir", default=str(ROOT / "source-rosters"))
    parser.add_argument("--season", type=int, default=espn_season(datetime.now()), help="ESPN season label for file names")
    args = parser.parse_args()
    load_env_local()

    session = requests.Session()
    session.headers.update(HEADERS)
    urls = team_urls(session)
    rosters = espn_rosters()
    team_ids = args.team or list(urls)
    sources = {"cbs": parse_cbs_roster, "yahoo": parse_yahoo_roster}
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for source, parse in sources.items():
        if args.source not in ("all", source):
            continue
        rows, summary = [], []
        for team_id in team_ids:
            info = urls.get(team_id)
            url = info and info[source]
            if not url:
                print(f"[{source}] no roster URL for team {team_id}; skipped.")
                continue
            try:
                players = parse(get(session, url))
            except Exception as error:  # keep going; the summary lists failed teams
                print(f"[{source}] {info['team']}: {error}")
                summary.append((info["team"], "error"))
                continue
            roster = rosters.get(team_id, [])
            for player in players:
                rows.append({"source": source, "espn_team_id": team_id, "team": info["team"], "source_team_url": url, **player, **match_player(player, roster)})
            unmatched = [p["name"] for p in players if match_player(p, roster)["match"] not in ("exact", "name")]
            summary.append((info["team"], f"{len(players)} players, {len(players) - len(unmatched)} matched to ESPN" + (f"; review: {', '.join(unmatched)}" if unmatched else "")))
            time.sleep(args.sleep)
        path = out_dir / f"{source}-rosters-{args.season}.csv"
        with open(path, "w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=COLUMNS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        counts = {}
        for row in rows:
            counts[row["match"]] = counts.get(row["match"], 0) + 1
        print(f"\n[{source}] wrote {len(rows)} players from {sum(1 for _, s in summary if s != 'error')} teams to {path}")
        print(f"[{source}] match counts: {counts}")
        for team, status in summary:
            if status == "error" or "review" in status:
                print(f"  {team}: {status}")


if __name__ == "__main__":
    main()
