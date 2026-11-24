"""Import KenPom team ratings from a saved kenpom.com ratings page.

kenpom.com blocks automated requests, so Andrew or Sam saves the ratings page from a signed-in browser
(Ctrl+S, "Webpage, HTML only" is enough) and this script reads the file. Each team is matched to an ESPN team id
(location, display name, or KENPOM_ALIASES) and stored in team_ratings (source 'kenpom') under the page's
"Data includes ... games played on <date>" date (its fanmatch link), so each import keeps a dated snapshot.

Dry run by default; --apply writes. Run db/team-ratings.sql first.
  python python/import_kenpom.py "C:/Users/.../Downloads/2027 Pomeroy College Basketball Ratings.html"
  python python/import_kenpom.py <file> --apply
"""
import argparse
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from espn_config import AVAILABLE_TEAMS  # noqa: E402
from espn_ingest import SupabaseRest, load_env_local, supabase_config  # noqa: E402

# KenPom name -> ESPN team id, for names that do not match ESPN's location or display name.
KENPOM_ALIASES = {"Connecticut": 41, "Miami FL": 2390, "N.C. State": 152, "Mississippi": 145}

# Ratings columns after Rk, Team, Conf, W-L: value, or (value, rank) pairs.
COLUMNS = [
    ("net_rtg", False), ("ortg", True), ("drtg", True), ("adj_tempo", True), ("luck", True),
    ("sos_net", True), ("sos_ortg", True), ("sos_drtg", True), ("ncsos_net", True),
]


def norm(name):
    text = html.unescape(name or "").lower().replace("&", " and ")
    text = re.sub(r"\bst\.?$", "state", text.strip())
    text = re.sub(r"\bst\.\s", "saint ", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def cell_text(cell):
    return html.unescape(re.sub(r"<[^>]+>", "", cell)).strip()


def number(text):
    text = text.replace("+", "").strip()
    return float(text) if text not in ("", "-") else None


def parse(page, season):
    found = re.search(r"games played on\s*<a[^>]*fanmatch\.php\?d=(\d{4}-\d{2}-\d{2})", page)
    if not found:
        sys.exit("No 'Data includes ... games played on <date>' line found; is this the KenPom ratings page?")
    rating_date = date.fromisoformat(found.group(1))
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(cells) < 4 + sum(2 if pair else 1 for _, pair in COLUMNS) or not cell_text(cells[0]).isdigit():
            continue
        team = cell_text(re.sub(r'<span class="seed">.*?</span>', "", cells[1]))  # March seeds follow the name
        wins, losses = (int(x) for x in cell_text(cells[3]).split("-"))
        row = {"source": "kenpom", "season": season, "rating_date": rating_date.isoformat(), "source_team": team,
               "rank": int(cell_text(cells[0])), "conference": cell_text(cells[2]), "wins": wins, "losses": losses}
        index = 4
        for key, pair in COLUMNS:
            row[key] = number(cell_text(cells[index]))
            if pair:
                rank = cell_text(cells[index + 1])
                row[f"{key}_rank"] = int(rank) if rank.isdigit() else None
            index += 2 if pair else 1
        rows.append(row)
    return rating_date, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path, help="Saved kenpom.com ratings page (.html)")
    parser.add_argument("--apply", action="store_true", help="Write team_ratings")
    args = parser.parse_args()

    page = args.file.read_text(encoding="utf-8", errors="replace")
    title = re.search(r"<title>(\d{4}) Pomeroy College Basketball Ratings</title>", page)
    if not title:
        sys.exit("The file's title is not '<year> Pomeroy College Basketball Ratings'.")
    season = int(title.group(1))
    rating_date, rows = parse(page, season)

    load_env_local()
    client = SupabaseRest(*supabase_config(), 60)
    teams = client.select("teams", {"select": "team_id,location,display_name,short_display_name", "limit": 5000})
    lookup = {}
    for team in teams:
        for key in (team.get("location"), team.get("display_name"), team.get("short_display_name")):
            if key:
                lookup.setdefault(norm(key), team["team_id"])
    for row in rows:
        row["team_id"] = KENPOM_ALIASES.get(row["source_team"]) or lookup.get(norm(row["source_team"]))

    names = {t["team_id"]: t.get("display_name") for t in teams}
    seen = {}
    for row in rows:
        if row["team_id"] in seen:
            sys.exit(f"{row['source_team']} and {seen[row['team_id']]} both matched team {row['team_id']}; fix KENPOM_ALIASES.")
        if row["team_id"]:
            seen[row["team_id"]] = row["source_team"]
    matched = {r["team_id"] for r in rows if r["team_id"]}
    missing_pool = sorted(names.get(t) or str(t) for t in AVAILABLE_TEAMS if t not in matched)
    print(f"KenPom {season} ratings through {rating_date}: {len(rows)} teams, {len(matched)} matched to ESPN teams.")
    if missing_pool:
        print("Pool teams without a KenPom match (add to KENPOM_ALIASES):", ", ".join(missing_pool))
        print("Unmatched KenPom names:", ", ".join(r["source_team"] for r in rows if not r["team_id"]))
    if not args.apply:
        print("Dry run: nothing written. Re-run with --apply.")
        return
    client.upsert("team_ratings", rows, "source,season,rating_date,source_team")
    client.update_sync_log("kenpom_ratings", json.dumps({"rating_date": rating_date.isoformat(), "teams": len(rows),
                                                         "matched": len(matched)}))
    print(f"Wrote {len(rows)} KenPom ratings for {rating_date}.")


if __name__ == "__main__":
    main()
