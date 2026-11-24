"""Load a previous ESPN season's regular-season box scores for every current pool player.

Each pool player's ESPN game log names his games for that season, wherever he played (transfers from schools
outside AVAILABLE_TEAMS included). Each game's summary is then fetched once, and rows are written to games and
player_games for every pool player in the box score, with ESPN's starter flag, and each pool player's field-goal
attempts go to player_shots for shot maps. Postseason games are skipped:
the league scores the regular season only.

ESPN responses are cached under .cache/espn/<season>/ so an interrupted run resumes without refetching.
Dry run by default; --apply writes. Run db/player-stat-averages.sql first (adds player_games.starter),
--apply also refreshes that season's player_stat_averages.
  python python/import_prior_season.py --season 2026
  python python/import_prior_season.py --season 2026 --apply
"""
import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from espn_ingest import (  # noqa: E402
    ESPN_BASE, SupabaseRest, USER_AGENT, extract_game_from_summary, extract_shot_rows, load_env_local, parse_int, parse_made_attempts,
    parse_minutes, supabase_config,
)

ROOT = Path(__file__).resolve().parent.parent
GAMELOG = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/{}/gamelog?season={}"
REGULAR_SEASON = 2


class RateLimited(Exception):
    pass


def cached_json(path, url, sleep):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    for attempt in range(4):  # dropped connections (SSL EOF, timeouts) are retried with backoff
        try:
            response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
            break
        except (requests.ConnectionError, requests.Timeout):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt * 2)
    if response.status_code in (403, 429):
        raise RateLimited(f"{response.status_code} from {url}")
    payload = response.json() if response.status_code == 200 else {}
    if response.status_code not in (200, 404):
        response.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    time.sleep(sleep)
    return payload


def fetch_all(label, items, fetch, workers):
    results, done = {}, 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for key, value in zip(items, pool.map(fetch, items)):
            results[key] = value
            done += 1
            if done % 200 == 0 or done == len(items):
                print(f"  {label}: {done}/{len(items)}")
    return results


def regular_season_events(gamelog):
    events = set()
    # seasonTypes are "2025-26 Season" (category "Regular Season Stats") and "2025-26 Postseason".
    for season_type in gamelog.get("seasonTypes") or []:
        if "postseason" in (season_type.get("displayName") or "").lower():
            continue
        for category in season_type.get("categories") or []:
            if "regular" not in (category.get("displayName") or "").lower():
                continue
            events.update(str(e["eventId"]) for e in category.get("events") or [] if e.get("eventId"))
    return events


def box_score_rows(summary, game_id, season, pool):
    game_date = extract_game_from_summary(summary, season, game_id)["game_date"]
    rows = []
    for team_entry in (summary.get("boxscore") or {}).get("players") or []:
        team_id = int(team_entry["team"]["id"])
        for group in team_entry.get("statistics") or []:
            labels = group.get("labels") or []
            for entry in group.get("athletes") or []:
                player_id = int((entry.get("athlete") or {}).get("id") or 0)
                if player_id not in pool:
                    continue
                stats = dict(zip(labels, entry.get("stats") or []))
                fgm, fga = parse_made_attempts(stats.get("FG"))
                tpm, tpa = parse_made_attempts(stats.get("3PT"))
                ftm, fta = parse_made_attempts(stats.get("FT"))
                rows.append({
                    "game_id": int(game_id), "player_id": player_id, "game_date": str(game_date), "team_id": team_id,
                    "pts": parse_int(stats.get("PTS")), "fgm": fgm, "fga": fga, "tpm": tpm, "tpa": tpa, "ftm": ftm,
                    "fta": fta, "reb": parse_int(stats.get("REB")), "ast": parse_int(stats.get("AST")),
                    "turnovers": parse_int(stats.get("TO")), "stl": parse_int(stats.get("STL")),
                    "blocks": parse_int(stats.get("BLK")), "oreb": parse_int(stats.get("OREB")),
                    "dreb": parse_int(stats.get("DREB")), "pf": parse_int(stats.get("PF")),
                    "minutes": parse_minutes(stats.get("MIN")), "season": season, "starter": bool(entry.get("starter")),
                })
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
    parser.add_argument("--season", type=int, required=True, help="ESPN season to load (2026 = 2025-26)")
    parser.add_argument("--apply", action="store_true", help="Write games and player_games")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--sleep", type=float, default=0.2, help="Delay after each uncached request, per worker")
    args = parser.parse_args()

    load_env_local()
    client = SupabaseRest(*supabase_config(), 60)
    latest = client.select("team_rosters", {"select": "season", "order": "season.desc", "limit": 1})[0]["season"]
    if args.season >= latest:
        sys.exit(f"--season {args.season} is not before the current pool season {latest}.")
    pool = {r["player_id"] for r in select_all(client, "team_rosters", {"select": "player_id", "season": f"eq.{latest}"}) if r["player_id"] > 0}
    print(f"{len(pool)} pool players (season {latest}); loading ESPN season {args.season}.")

    cache = ROOT / ".cache" / "espn" / str(args.season)
    try:
        gamelogs = fetch_all("game logs", sorted(pool), lambda pid: cached_json(
            cache / "gamelog" / f"{pid}.json", GAMELOG.format(pid, args.season), args.sleep), args.workers)
        events = sorted(set().union(*(regular_season_events(g) for g in gamelogs.values())))
        played = sum(1 for g in gamelogs.values() if regular_season_events(g))
        print(f"{played} pool players played in {args.season}; {len(events)} regular-season games.")
        summaries = fetch_all("box scores", events, lambda gid: cached_json(
            cache / "summary" / f"{gid}.json", f"{ESPN_BASE}/summary?event={gid}", args.sleep), args.workers)
    except RateLimited as error:
        sys.exit(f"ESPN rate limited the run ({error}). Cached responses are kept; re-run later to resume.")

    games, rows, shots, skipped = [], [], [], []
    for game_id, summary in summaries.items():
        header = summary.get("header") or {}
        if (header.get("season") or {}).get("type") != REGULAR_SEASON or (header.get("season") or {}).get("year") != args.season:
            skipped.append(game_id)
            continue
        game = extract_game_from_summary(summary, args.season, game_id)
        if "final" not in str(game["status"]).lower():
            skipped.append(game_id)
            continue
        games.append({**game, "game_id": int(game_id), "game_date": str(game["game_date"]),
                      "game_datetime": game["game_datetime"].isoformat() if game["game_datetime"] else None,
                      "home_team_id": int(game["home_team_id"]) if game["home_team_id"] else None,
                      "away_team_id": int(game["away_team_id"]) if game["away_team_id"] else None,
                      "is_exhibition": False})
        rows.extend(box_score_rows(summary, game_id, args.season, pool))
        shots.extend(extract_shot_rows(summary, game_id, args.season, pool))

    players = {r["player_id"] for r in rows}
    print(f"{len(games)} final games, {len(rows)} player rows for {len(players)} players, "
          f"{sum(r['starter'] for r in rows)} starts, {len(shots)} shots. Skipped {len(skipped)} (not final or not regular season).")
    if not args.apply:
        print("Dry run: nothing written. Re-run with --apply.")
        return

    known = {t["team_id"] for t in select_all(client, "teams", {"select": "team_id"})}
    names = {}
    for game in games:
        names[game["home_team_id"]] = game["home_team_name"]
        names[game["away_team_id"]] = game["away_team_name"]
    stubs = [{"team_id": tid, "display_name": names.get(tid)} for tid in {r["team_id"] for r in rows} - known]
    client.upsert("teams", stubs, "team_id")
    for start in range(0, len(games), 500):
        client.upsert("games", games[start:start + 500], "game_id")
    for start in range(0, len(rows), 1000):
        client.upsert("player_games", rows[start:start + 1000], "game_id,player_id")
    for start in range(0, len(shots), 1000):
        client.upsert("player_shots", shots[start:start + 1000], "play_id")
    refreshed = client.request("POST", "/rest/v1/rpc/refresh_player_stat_averages", json_body={"season_param": args.season})
    client.update_sync_log(f"prior_season_{args.season}", json.dumps({"games": len(games), "rows": len(rows), "shots": len(shots)}))
    print(f"Wrote {len(games)} games, {len(rows)} player rows, {len(shots)} shots, {len(stubs)} team stubs; "
          f"refreshed {refreshed} season averages.")


if __name__ == "__main__":
    main()
