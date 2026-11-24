"""Load CBS, Yahoo, and Lindy's roster listings into player_source_listings.

Draft rules (AGENTS.md, confirmed 2026-11-11): every listed player on a pool team is draftable; position
eligibility is the union of all sources; height is the tallest listing. The app combines the rows at read time.

- CBS/Yahoo rows come from python/source_rosters.py review CSVs and are re-matched to the current ESPN rosters.
- Players listed by CBS/Yahoo but missing from ESPN get a negative stand-in id in players + team_rosters so they
  can be drafted and shortlisted (no stats). Stand-in ids: -<CBS id>, or -(1e9 + Yahoo id) when CBS lacks him.
- Lindy's rows carry ESPN ids (Andrew-reviewed). Rows without an id are stored unlinked; Andrew confirmed those
  players are not playing this season. A duplicated ESPN id keeps only the row whose jersey matches ESPN.

Lindy's rankings (top 150, top 100 freshmen) go to player_rankings with the ESPN id as listed. The ESPN 100
(recruiting class entering this season, from the College-Basketball repo's collect_espn_recruiting_rankings.py)
uses recruit ids, so each recruit is matched to the pool by college + name; unmatched recruits are stored unlinked.

Dry run by default; --apply writes. Run db/player-source-listings.sql first.
  python python/import_source_listings.py
  python python/import_source_listings.py --apply
"""
import argparse
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from espn_ingest import SupabaseRest, load_env_local, supabase_config  # noqa: E402
from source_rosters import match_player, normalize_name  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
# Same player, name spelled differently by the source; jersey and team match (reviewed 2026-11-11).
REVIEWED_LINKS = {
    (52, "10"): 5347037,     # Elisee Assui = Elise Assui (Florida State)
    (52, "3"): 5241756,      # Kameron Taylor = Kam Taylor (Florida State)
    (87, "4"): 5144387,      # Bryce Dortch = Bryce Ruglass Dortch (Notre Dame)
    (2226, "25"): 5254160,   # Fawaz Ifaola = Tacko Ifaola (Florida Atlantic)
    (2483, "7"): 4685658,    # Taylor Bowen = Taylor Bol Bowen (Oregon)
    (130, "9"): 5293244,     # Marcus Moller (Michigan)
    (264, "15"): 5458619,    # Wini Silva Braga = Wini Braga (Washington)
    (2429, "7"): 5311911,    # Jordi Rodriguez-Stegemeijer (Charlotte)
}
# ESPN 100 recruits listed under a different first name (ESPN recruit id -> ESPN player id; reviewed 2026-11-11).
REVIEWED_RECRUITS = {
    "259940": 5210434,  # Babatunde Oladotun = Baba Oladotun (Maryland)
    "254855": 5142711,  # JaShawn Andrews = JJ Andrews (Arkansas)
    "259987": 5210410,  # Jon Sanderson = Jonathan Sanderson (Notre Dame)
}
RANKING_FILES = {"top150": "2026-2027_lindy_top_150.csv", "freshmen": "2026-2027_lindy_top_100_freshman.csv"}
CLASSES = {"fr": "Freshman", "freshman": "Freshman", "so": "Sophomore", "soph": "Sophomore", "sophomore": "Sophomore",
           "jr": "Junior", "junior": "Junior", "sr": "Senior", "senior": "Senior", "gr": "Graduate", "graduate": "Graduate"}


def height_inches(value):
    text = str(value or "").strip()
    if text.isdigit():
        return int(text)
    match = re.match(r"^(\d)\s*['-]\s*(\d{1,2})", text)
    return int(match.group(1)) * 12 + int(match.group(2)) if match else None


def number(value):
    match = re.search(r"\d+", str(value or ""))
    return int(match.group()) if match else None


def class_name(value):
    first = str(value or "").split(" ")[0].strip(".").lower()
    return CLASSES.get(first, value or None)


def pages(client, table, params):
    rows, offset = [], 0
    while True:
        page = client.select(table, {**params, "limit": 1000, "offset": offset})
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", type=int, default=2027, help="ESPN source season")
    parser.add_argument("--lindys", default=str(ROOT / "2026-2027_lindys.csv"))
    parser.add_argument("--rosters-dir", default=str(ROOT / "source-rosters"))
    parser.add_argument("--rankings-dir", default=str(ROOT / "2027"), help="Folder with the Lindy's ranking files")
    parser.add_argument("--espn100", default=str(ROOT / "2027" / "espn100-class-2026.csv"), help="ESPN 100 recruiting CSV")
    parser.add_argument("--apply", action="store_true", help="Write to Supabase (default is a dry run)")
    args = parser.parse_args()
    load_env_local()
    url, key = supabase_config()
    client = SupabaseRest(url, key, 60)

    players = {int(p["player_id"]): p for p in pages(client, "players", {"select": "player_id,first_name,last_name,player_number"})}
    rosters = {}
    for row in pages(client, "team_rosters", {"select": "team_id,player_id", "season": f"eq.{args.season}"}):
        p = players.get(int(row["player_id"]))
        if p:
            rosters.setdefault(int(row["team_id"]), []).append({
                "player_id": int(p["player_id"]), "name": f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip(),
                "jersey": str(p.get("player_number") or "")})

    listings, stand_ins = [], {}
    for source in ("cbs", "yahoo"):
        path = Path(args.rosters_dir) / f"{source}-rosters-{args.season}.csv"
        for row in csv.DictReader(open(path, encoding="utf-8-sig")):
            team_id = int(row["espn_team_id"])
            roster = rosters.get(team_id, [])
            # A stand-in created on an earlier run is on the roster now, so a plain name match finds it.
            found = match_player(row, roster)
            player_id, match = found.get("espn_player_id") or None, found["match"]
            reviewed = REVIEWED_LINKS.get((team_id, row["jersey"]))
            if not player_id and reviewed and str(reviewed) in found.get("candidate_espn_id", "").split("; "):
                player_id, match = reviewed, "reviewed"
            if not player_id and match == "not_on_espn":
                key_ = (team_id, normalize_name(row["name"]))
                stand_in = stand_ins.get(key_)
                if not stand_in:
                    new_id = -int(row["source_player_id"]) if source == "cbs" else -(1_000_000_000 + int(row["source_player_id"]))
                    stand_in = stand_ins[key_] = {"player_id": new_id, "team_id": team_id, "row": row}
                player_id, match = stand_in["player_id"], "stand_in"
            elif player_id and int(player_id) < 0:
                match = "stand_in"
            listings.append({
                "source": source, "season": args.season, "source_key": row["source_player_id"] or f"{team_id}-{row['jersey']}-{row['name']}",
                "player_id": int(player_id) if player_id else None, "team_id": team_id, "name": row["name"], "jersey": row["jersey"] or None,
                "position": row["position"] or None, "height_in": height_inches(row["height"]), "weight": number(row["weight"]),
                "class": class_name(row["class"]), "hometown": row["hometown"] or None, "source_url": row["source_player_url"] or None,
                "match": match if player_id else "unlinked"})

    lindys = list(csv.reader(open(args.lindys, encoding="utf-8-sig"), delimiter="\t"))
    by_id = {}
    for line, row in enumerate(lindys[1:], start=2):
        if len(row) < 5:
            continue
        jersey, name, position, height, espn_id = (cell.strip() for cell in row[:5])
        espn_id = int(espn_id) if espn_id.isdigit() else None
        by_id.setdefault(espn_id, []).append(line) if espn_id else None
        listings.append({
            "source": "lindys", "season": args.season, "source_key": f"line-{line}",
            "player_id": espn_id if espn_id in players else None, "team_id": None, "name": name, "jersey": jersey or None,
            "position": position.upper() or None, "height_in": height_inches(height), "weight": None, "class": None,
            "hometown": None, "source_url": None, "match": "espn_id" if espn_id in players else ("espn_id_not_in_db" if espn_id else "unlinked"),
            "_espn_id": espn_id})
    for espn_id, lines in by_id.items():
        if len(lines) < 2:
            continue
        espn_jersey = str((players.get(espn_id) or {}).get("player_number") or "")
        rows = [r for r in listings if r["source"] == "lindys" and r["_espn_id"] == espn_id]
        keep = next((r for r in rows if r["jersey"] == espn_jersey), None)
        for r in rows:
            if r is not keep:
                r["player_id"], r["match"] = None, "duplicate_id"
        print(f"Lindy's duplicate ESPN id {espn_id} on lines {lines}: kept {keep['source_key'] if keep else 'none'}; others stored unlinked.")
    for r in listings:
        r.pop("_espn_id", None)

    counts = {}
    for r in listings:
        counts[(r["source"], r["match"])] = counts.get((r["source"], r["match"]), 0) + 1
    for (source, match), count in sorted(counts.items()):
        print(f"{source:7} {match:20} {count}")
    print(f"Stand-in players ({len(stand_ins)}):")
    for s in stand_ins.values():
        print(f"  {s['player_id']}: {s['row']['name']} #{s['row']['jersey']} {s['row']['team']} {s['row']['position']} {s['row']['height']}")
    pool = {p["player_id"] for team in rosters.values() for p in team}
    extra = sorted({r["player_id"] for r in listings if r["source"] == "lindys" and r["player_id"] and r["player_id"] not in pool})
    print(f"Lindy's players in players but not on a {args.season} pool roster (added to the pool by the app): {extra}")

    rankings = []
    for list_name, filename in RANKING_FILES.items():
        path = Path(args.rankings_dir) / filename
        if not path.exists():
            print(f"Ranking file not found, skipped: {path}")
            continue
        for cells in csv.reader(open(path, encoding="utf-8-sig"), delimiter="\t"):
            cells = [cell.strip() for cell in cells]
            if len(cells) < 4 or not cells[0].isdigit():
                continue
            # Top 150 is rank, name, team, id; the freshman file is rank, name, id, team.
            id_col = 2 if re.fullmatch(r"\d+|#N/A", cells[2]) else 3
            espn_id, team = cells[id_col], cells[5 - id_col]
            rankings.append({"source": "lindys", "list": list_name, "season": args.season, "rank": int(cells[0]),
                             "player_id": int(espn_id) if espn_id.isdigit() else None, "name": cells[1],
                             "team": None if team == "#N/A" else team or None})
        rows = [r for r in rankings if r["list"] == list_name]
        in_pool = sum(1 for r in rows if r["player_id"] in pool)
        print(f"Lindy's {list_name}: {len(rows)} ranked, {in_pool} in the pool, {sum(1 for r in rows if not r['player_id'])} without an ESPN id")

    espn100 = Path(args.espn100)
    if espn100.exists():
        all_by_name = {}
        for p in players.values():
            all_by_name.setdefault(normalize_name(f"{p.get('first_name') or ''} {p.get('last_name') or ''}"), []).append(int(p["player_id"]))
        unmatched = []
        for row in csv.DictReader(open(espn100, encoding="utf-8-sig")):
            name, team_id = normalize_name(row["Recruit Name"]), int(row["College Team ID"] or 0)
            on_team = [p["player_id"] for p in rosters.get(team_id, []) if normalize_name(p["name"]) == name]
            # A single same-name player elsewhere covers recruits whose college changed after signing.
            player_id = REVIEWED_RECRUITS.get(row["ESPN Recruit ID"]) or (on_team[0] if len(on_team) == 1 else (all_by_name[name][0] if not on_team and len(all_by_name.get(name, [])) == 1 else None))
            if not player_id:
                unmatched.append(f"#{row['ESPN Recruit Rank']} {row['Recruit Name']} ({row['College'] or 'uncommitted'})")
            elif not on_team and row["ESPN Recruit ID"] not in REVIEWED_RECRUITS:
                print(f"ESPN 100 #{row['ESPN Recruit Rank']} {row['Recruit Name']} matched by name only (signed with {row['College']}).")
            rankings.append({"source": "espn", "list": "top100", "season": args.season, "rank": int(row["ESPN Recruit Rank"]),
                             "player_id": player_id, "name": row["Recruit Name"], "team": row["College"] or None})
        rows = [r for r in rankings if r["list"] == "top100"]
        print(f"ESPN 100: {len(rows)} ranked, {sum(1 for r in rows if r['player_id'] in pool)} in the pool; unmatched: {', '.join(unmatched) or 'none'}")

    if not args.apply:
        print("\nDry run. Re-run with --apply to write.")
        return
    stand_rows, roster_rows = [], []
    for s in stand_ins.values():
        row, rows = s["row"], [r for r in listings if r["player_id"] == s["player_id"]]
        first, _, last = row["name"].partition(" ")
        stand_rows.append({
            "player_id": s["player_id"], "team_id": s["team_id"], "first_name": first, "last_name": last, "short_name": row["name"],
            "player_number": number(row["jersey"]), "position": row["position"] or None,
            "height": max((r["height_in"] for r in rows if r["height_in"]), default=None),
            "display_height": None, "weight": number(row["weight"]), "experience": class_name(row["class"]), "headshot": None})
        roster_rows.append({"team_id": s["team_id"], "player_id": s["player_id"], "season": args.season})
    client.upsert("players", stand_rows, "player_id")
    client.upsert("team_rosters", roster_rows, "team_id,player_id,season")
    client.request("DELETE", "/rest/v1/player_source_listings", params={"season": f"eq.{args.season}"})
    for start in range(0, len(listings), 500):
        client.upsert("player_source_listings", listings[start:start + 500], "source,season,source_key")
    client.request("DELETE", "/rest/v1/player_rankings", params={"source": "in.(lindys,espn)", "season": f"eq.{args.season}"})
    client.upsert("player_rankings", rankings, "source,list,season,rank")
    print(f"Wrote {len(listings)} listings, {len(stand_rows)} stand-in players, and {len(rankings)} rankings.")


if __name__ == "__main__":
    main()
