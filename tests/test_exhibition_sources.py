import csv
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from exhibition_sources import build_review, summarize_review, workbook_manual_stats


class WorkbookManualStatsTest(unittest.TestCase):
    def make_workbook(self, path):
        workbook = openpyxl.Workbook()
        games = workbook.active
        games.title = "Games"
        games.append(["Exhibitions"])
        games.append(["Game ID", "Date", "Winner", "Winner PTS", "Loser", "Loser PTS", "Coverage", "Source"])
        games.append(["G90", datetime(2026, 10, 24), "Seton Hall", 53, "Monmouth", 50, "Manual", ""])
        stats = workbook.create_sheet("Player stats")
        stats.append(["Title"])
        stats.append(["Notes"])
        stats.append(["Date", "Team ID", "Team", "Player", "Player ID", "Opponent", "Conference", "Game ID", "Minutes", "PTS", "REB", "AST", "STL", "BLK", "TO", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "OREB", "DREB", "PF", "+/-", "FD", "BA", "Jersey", "Position", "Starter"])
        stats.append(["2026-10-24", 52, "Seton Hall", "Terry Copeland", 1234, "Monmouth", "Big East", "G90", 26, 10, 6, 2, 1, 0, 3, 5, 6, 0, 1, 0, 0, 2, 4, 2, None, None, None, "9", "G", True])
        workbook.save(path)

    def test_reads_manual_player_stats_by_game_label(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manual.xlsx"
            self.make_workbook(path)
            result = workbook_manual_stats(path)

        self.assertEqual(len(result["G90"]), 1)
        self.assertEqual(result["G90"][0]["source_player_name"], "Terry Copeland")
        self.assertEqual(result["G90"][0]["team_id"], 52)
        self.assertEqual(result["G90"][0]["pts"], 10)
        self.assertEqual(result["G90"][0]["minutes"], 26)

    def test_build_review_uses_manual_rows_when_source_link_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manual.xlsx"
            output = Path(directory) / "review.csv"
            self.make_workbook(path)
            build_review(path, output)
            with output.open(newline="", encoding="utf-8-sig") as handle:
                rows = list(csv.DictReader(handle))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source_type"], "Manual workbook entry")
        self.assertEqual(rows[0]["player_id"], "1234")
        self.assertEqual(rows[0]["source_status"], "Manual workbook entry; 1 player rows")

    def test_summary_counts_games_separately_from_player_rows(self):
        review = [
            {"game_label": "G1", "source_type": "PDF", "source_status": "HTTP 200; extracted 12 candidate rows"},
            {"game_label": "G1", "source_type": "PDF", "source_status": "HTTP 200; extracted 12 candidate rows"},
            {"game_label": "G2", "source_type": "Manual workbook entry", "source_status": "Manual workbook entry; 8 player rows"},
            {"game_label": "G3", "source_type": "Webpage", "source_status": "HTTP 200; extracted 0 candidate rows"},
        ]

        summary = summarize_review(review)

        self.assertEqual(summary["games"], 3)
        self.assertEqual(summary["review_rows"], 4)
        self.assertEqual(summary["parsed_games"], 1)
        self.assertEqual(summary["manual_games"], 1)
        self.assertEqual(summary["needs_review_games"], 1)


if __name__ == "__main__":
    unittest.main()
