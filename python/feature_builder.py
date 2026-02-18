import csv
from datetime import datetime
from pathlib import Path

from csv_utils import ensure_csv_header


FEATURES_HEADER = [
    "Date",
    "Game ID",
    "Player ID",
    "Player Name",
    "TEAM ID",
    "Team Name",
    "MIN",
    "PTS",
    "FGM",
    "FGA",
    "3PTM",
    "3PTA",
    "FTM",
    "FTA",
    "OREB",
    "DREB",
    "REB",
    "AST",
    "TO",
    "STL",
    "Blocks",
    "PF",
    "2PTM",
    "2PTA",
    "FG%",
    "2P%",
    "3P%",
    "FT%",
    "eFG%",
    "TS%",
    "FTr",
    "3PAr",
    "Scoring Attempts",
    "PTS/FGA",
    "PTS/Shot",
    "PTS/Min",
    "PTS/40",
    "Games Played",
    "Avg PTS",
    "Avg MIN",
    "Avg FGA",
    "Avg 3PA",
    "Avg FTA",
    "Avg PTS/40",
    "Avg FG%",
    "Avg 3P%",
    "Avg FT%",
    "Avg eFG%",
    "Avg TS%",
]


def _to_float(value):
    try:
        return float(value)
    except Exception:
        return 0.0


def _safe_div(numerator, denominator):
    return numerator / denominator if denominator else 0.0


def build_player_features(player_stats_file, output_file, min_minutes=5):
    stats_path = Path(player_stats_file)
    if not stats_path.exists() or stats_path.stat().st_size == 0:
        print(f"No player stats found at {player_stats_file}")
        return 0

    rows = []
    with stats_path.open("r", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        for row in reader:
            minutes = _to_float(row.get("MIN", 0))
            if minutes < min_minutes:
                continue
            date_text = row.get("Date", "")
            try:
                date_obj = datetime.strptime(date_text, "%m/%d/%y").date()
            except Exception:
                continue
            rows.append((row.get("Player ID", ""), date_obj, row.get("Game ID", ""), row))

    rows.sort(key=lambda item: (item[0], item[1], item[2]))

    output_path = Path(output_file)
    if output_path.exists():
        output_path.unlink()
    ensure_csv_header(output_file, FEATURES_HEADER)

    totals = {}
    written = 0
    with open(output_file, "a", newline="", encoding="utf-8") as out_file:
        writer = csv.writer(out_file)
        for player_id, _date, _game_id, row in rows:
            minutes = _to_float(row.get("MIN", 0))
            pts = _to_float(row.get("PTS", 0))
            fgm = _to_float(row.get("FGM", 0))
            fga = _to_float(row.get("FGA", 0))
            tpm = _to_float(row.get("3PTM", 0))
            tpa = _to_float(row.get("3PTA", 0))
            ftm = _to_float(row.get("FTM", 0))
            fta = _to_float(row.get("FTA", 0))
            oreb = _to_float(row.get("OREB", 0))
            dreb = _to_float(row.get("DREB", 0))
            reb = _to_float(row.get("REB", 0))
            ast = _to_float(row.get("AST", 0))
            to = _to_float(row.get("TO", 0))
            stl = _to_float(row.get("STL", 0))
            blocks = _to_float(row.get("Blocks", 0))
            pf = _to_float(row.get("PF", 0))

            twom = fgm - tpm
            twoa = fga - tpa
            fg_pct = _safe_div(fgm, fga)
            two_pct = _safe_div(twom, twoa)
            three_pct = _safe_div(tpm, tpa)
            ft_pct = _safe_div(ftm, fta)
            efg = _safe_div(fgm + 0.5 * tpm, fga)
            ts = _safe_div(pts, 2 * (fga + 0.44 * fta))
            ftr = _safe_div(fta, fga)
            three_par = _safe_div(tpa, fga)
            scoring_attempts = fga + 0.44 * fta
            pts_per_fga = _safe_div(pts, fga)
            pts_per_shot = _safe_div(pts, scoring_attempts)
            pts_per_min = _safe_div(pts, minutes)
            pts_per_40 = pts_per_min * 40 if minutes else 0.0

            player_totals = totals.setdefault(
                player_id,
                {
                    "games": 0,
                    "pts": 0.0,
                    "min": 0.0,
                    "fga": 0.0,
                    "fgm": 0.0,
                    "tpa": 0.0,
                    "tpm": 0.0,
                    "fta": 0.0,
                    "ftm": 0.0,
                },
            )
            player_totals["games"] += 1
            player_totals["pts"] += pts
            player_totals["min"] += minutes
            player_totals["fga"] += fga
            player_totals["fgm"] += fgm
            player_totals["tpa"] += tpa
            player_totals["tpm"] += tpm
            player_totals["fta"] += fta
            player_totals["ftm"] += ftm

            games_played = player_totals["games"]
            avg_pts = _safe_div(player_totals["pts"], games_played)
            avg_min = _safe_div(player_totals["min"], games_played)
            avg_fga = _safe_div(player_totals["fga"], games_played)
            avg_tpa = _safe_div(player_totals["tpa"], games_played)
            avg_fta = _safe_div(player_totals["fta"], games_played)
            avg_pts_per_40 = (
                _safe_div(player_totals["pts"], player_totals["min"]) * 40
                if player_totals["min"]
                else 0.0
            )
            avg_fg_pct = _safe_div(player_totals["fgm"], player_totals["fga"])
            avg_3p_pct = _safe_div(player_totals["tpm"], player_totals["tpa"])
            avg_ft_pct = _safe_div(player_totals["ftm"], player_totals["fta"])
            avg_efg = _safe_div(
                player_totals["fgm"] + 0.5 * player_totals["tpm"],
                player_totals["fga"],
            )
            avg_ts = _safe_div(
                player_totals["pts"],
                2 * (player_totals["fga"] + 0.44 * player_totals["fta"]),
            )

            writer.writerow(
                [
                    row.get("Date", ""),
                    row.get("Game ID", ""),
                    row.get("Player ID", ""),
                    row.get("Player Name", ""),
                    row.get("TEAM ID", ""),
                    row.get("Team Name", ""),
                    minutes,
                    pts,
                    fgm,
                    fga,
                    tpm,
                    tpa,
                    ftm,
                    fta,
                    oreb,
                    dreb,
                    reb,
                    ast,
                    to,
                    stl,
                    blocks,
                    pf,
                    twom,
                    twoa,
                    fg_pct,
                    two_pct,
                    three_pct,
                    ft_pct,
                    efg,
                    ts,
                    ftr,
                    three_par,
                    scoring_attempts,
                    pts_per_fga,
                    pts_per_shot,
                    pts_per_min,
                    pts_per_40,
                    games_played,
                    avg_pts,
                    avg_min,
                    avg_fga,
                    avg_tpa,
                    avg_fta,
                    avg_pts_per_40,
                    avg_fg_pct,
                    avg_3p_pct,
                    avg_ft_pct,
                    avg_efg,
                    avg_ts,
                ]
            )
            written += 1

    print(f"Wrote {written} feature rows to {output_file}")
    return written
