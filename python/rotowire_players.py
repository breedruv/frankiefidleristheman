"""Link every pool player to his Rotowire player page (player_links, site 'rotowire').

Rotowire's team roster table (/cbasketball/tables/team-roster.php?team=<id>) lists each player's Rotowire id,
page URL, jersey, position, and height. Team ids are not published, so the valid id range is scanned (cached in
.cache/rotowire/teams/), and each Rotowire roster is matched to the pool team sharing the most player names.
Players are then matched within that team by normalized name, then jersey + last name, then first name + final
surname word (Bryce Ruglass Dortch = Bryce Dortch). Rotowire's roster tables omit some players who still have pages
(e.g. Onyeka Joe Agu, Eric Freeny), so the rest fall back to the player sitemap (/cbasketball_players.xml) when
exactly one page carries the same name; shared names stay in the review CSV.

Writes rotowire-player-links-review.csv for unmatched players. Dry run by default; --apply writes player_links.
Run db/player-links.sql first.
  python python/rotowire_players.py
  python python/rotowire_players.py --apply
"""
import argparse
import csv
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from espn_ingest import SupabaseRest, load_env_local, supabase_config  # noqa: E402
from source_rosters import normalize_name  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "rotowire" / "teams"
BASE = "https://www.rotowire.com"
ROSTER = BASE + "/cbasketball/tables/team-roster.php?team={}"
HEADERS = {"User-Agent": "Mozilla/5.0"}
REVIEW = ROOT / "rotowire-player-links-review.csv"
SITEMAP = BASE + "/cbasketball_players.xml"


def sitemap_names():
    """Normalized name -> list of (rotowire id, url) from the player sitemap (cached)."""
    path = CACHE.parent / "cbasketball_players.xml"
    if not path.exists():
        response = requests.get(SITEMAP, headers=HEADERS, timeout=60)
        response.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(response.text, encoding="utf-8")
    names = {}
    for url in re.findall(r"<loc>([^<]+/cbasketball/player/[^<]+)</loc>", path.read_text(encoding="utf-8")):
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        match = re.match(r"(.+)-(\d+)$", slug)
        if match:
            names.setdefault(normalize_name(match.group(1).replace("-", " ")), []).append((match.group(2), url))
    return names


def page_team(rotowire_id, url, sleep):
    """Rotowire team id linked from a player's page (cached), or None."""
    path = CACHE.parent / "player-teams" / f"{rotowire_id}.txt"
    if not path.exists():
        response = requests.get(url, headers=HEADERS, timeout=30)
        if response.status_code in (403, 429):
            sys.exit(f"Rotowire returned {response.status_code}; re-run later to resume.")
        found = re.search(r"/cbasketball/team/[a-z0-9-]+-(\d+)", response.text) if response.ok else None
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(found.group(1) if found else "", encoding="utf-8")
        time.sleep(sleep)
    return path.read_text(encoding="utf-8") or None


def first_last(name):
    words = normalize_name(name).split()
    return (words[0], words[-1]) if len(words) >= 2 else None


def team_roster(team_id, sleep):
    path = CACHE / f"{team_id}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    for attempt in range(4):
        try:
            response = requests.get(ROSTER.format(team_id), headers=HEADERS, timeout=30)
            break
        except (requests.ConnectionError, requests.Timeout):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt * 2)
    if response.status_code in (403, 429):
        sys.exit(f"Rotowire returned {response.status_code}; cached teams are kept, re-run later to resume.")
    response.raise_for_status()
    payload = response.json()
    rows = payload if isinstance(payload, list) else []  # invalid ids return {"error": ...}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows), encoding="utf-8")
    time.sleep(sleep)
    return rows


def select_all(client, table, params):
    rows = []
    while True:
        page = client.select(table, {**params, "limit": 1000, "offset": len(rows)})
        rows.extend(page)
        if len(page) < 1000:
            return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Write player_links")
    parser.add_argument("--first", type=int, default=1200, help="First Rotowire team id to scan")
    parser.add_argument("--last", type=int, default=1800, help="Last Rotowire team id to scan")
    parser.add_argument("--sleep", type=float, default=0.4)
    args = parser.parse_args()

    load_env_local()
    client = SupabaseRest(*supabase_config(), 60)
    season = client.select("team_rosters", {"select": "season", "order": "season.desc", "limit": 1})[0]["season"]
    rosters = select_all(client, "team_rosters", {"select": "team_id,player_id", "season": f"eq.{season}"})
    team_of = {r["player_id"]: r["team_id"] for r in rosters}
    players = {}
    ids = list(team_of)
    for start in range(0, len(ids), 200):
        for p in client.select_in("players", "player_id", [str(i) for i in ids[start:start + 200]],
                                  "player_id,first_name,last_name,player_number"):
            players[p["player_id"]] = p
    teams = {t["team_id"]: t.get("display_name") for t in select_all(client, "teams", {"select": "team_id,display_name"})}
    by_team = {}
    for pid, tid in team_of.items():
        p = players.get(pid) or {}
        by_team.setdefault(tid, []).append({**p, "player_id": pid, "key": normalize_name(f"{p.get('first_name', '')} {p.get('last_name', '')}")})
    name_team = {}
    for tid, members in by_team.items():
        for m in members:
            name_team.setdefault(m["key"], set()).add(tid)

    print(f"Scanning Rotowire team ids {args.first}-{args.last}...")
    rw_teams = {}
    for team_id in range(args.first, args.last + 1):
        rows = team_roster(team_id, args.sleep)
        if rows:
            rw_teams[team_id] = rows
    print(f"{len(rw_teams)} Rotowire teams found.")

    # Each Rotowire roster goes to the pool team sharing the most names (at least 3).
    rw_for_team = {}
    for rw_id, rows in rw_teams.items():
        votes = Counter(tid for r in rows for tid in name_team.get(normalize_name(f"{r['firstname']} {r['lastname']}"), ()))
        if votes:
            tid, count = votes.most_common(1)[0]
            if count >= 3 and count > rw_for_team.get(tid, (None, 0))[1]:
                rw_for_team[tid] = (rw_id, count)

    sitemap = sitemap_names()
    links, review = [], []
    for tid, members in by_team.items():
        rw_id = rw_for_team.get(tid, (None,))[0]
        rows = rw_teams.get(rw_id, [])
        by_name = {normalize_name(f"{r['firstname']} {r['lastname']}"): r for r in rows}
        for m in members:
            row, how = by_name.get(m["key"]), "name"
            if not row and m.get("last_name"):
                last = normalize_name(m["last_name"])
                cands = [r for r in rows if str(r.get("jersey")) == str(m.get("player_number")) and normalize_name(r["lastname"]) == last]
                row, how = (cands[0], "jersey_last") if len(cands) == 1 else (None, None)
            name = f"{m.get('first_name') or ''} {m.get('last_name') or ''}".strip()
            if not row and first_last(name):
                cands = [r for r in rows if first_last(f"{r['firstname']} {r['lastname']}") == first_last(name)]
                row, how = (cands[0], "first_last") if len(cands) == 1 else (None, None)
            # A single sitemap page with his name counts only if that page links to his current team.
            if not row and len(sitemap.get(m["key"], [])) == 1 and page_team(*sitemap[m["key"]][0], args.sleep) == str(rw_id):
                rw_player, url = sitemap[m["key"]][0]
                links.append({"player_id": m["player_id"], "site": "rotowire", "external_id": rw_player, "url": url,
                              "name": name, "match": "sitemap", "team_id": tid, "external_team_id": None})
                continue
            if not row:
                review.append({"player_id": m["player_id"], "name": name, "team": teams.get(tid), "team_id": tid,
                               "rotowire_team_id": rw_id or "",
                               "reason": "team not found" if not rw_id else "no Rotowire page" if not sitemap.get(m["key"])
                               else "shared name" if len(sitemap[m["key"]]) > 1 else "page is another team's player"})
                continue
            links.append({"player_id": m["player_id"], "site": "rotowire", "external_id": str(row["playerID"]),
                          "url": BASE + row["playerURL"], "name": f"{row['firstname']} {row['lastname']}",
                          "match": how, "team_id": tid, "external_team_id": str(rw_id)})

    with REVIEW.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["player_id", "name", "team", "team_id", "rotowire_team_id", "reason"])
        writer.writeheader()
        writer.writerows(sorted(review, key=lambda r: (r["team"] or "", r["name"])))
    missing_teams = sorted({teams.get(r["team_id"]) or str(r["team_id"]) for r in review if r["reason"] == "team not found"})
    print(f"{len(by_team)} pool teams, {len(rw_for_team)} matched to Rotowire. Linked {len(links)} of {len(team_of)} players "
          f"({Counter(l['match'] for l in links)}); {len(review)} unmatched -> {REVIEW.name}.")
    if missing_teams:
        print("Teams without a Rotowire match:", ", ".join(missing_teams))
    if not args.apply:
        print("Dry run: nothing written. Re-run with --apply.")
        return
    for start in range(0, len(links), 500):
        client.upsert("player_links", links[start:start + 500], "player_id,site")
    client.update_sync_log("rotowire_links", json.dumps({"links": len(links), "unmatched": len(review)}))
    print(f"Wrote {len(links)} Rotowire links.")


if __name__ == "__main__":
    main()
