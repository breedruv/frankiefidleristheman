import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from sync_hoopshd_pdfs import matchup_key, normalize_team_name, workbook_games
import openpyxl


class HoopsHdMatchTest(unittest.TestCase):
    def test_matches_team_names_independent_of_order_and_common_abbreviations(self):
        workbook_key = matchup_key("2026-10-10", "Wisconsin", "UW-Parkside", {})
        schedule_key = matchup_key("2026-10-10", "UW Parkside", "Wisconsin", {})

        self.assertEqual(workbook_key, schedule_key)

    def test_normalizes_accents_punctuation_and_case(self):
        self.assertEqual(normalize_team_name("St. John’s"), normalize_team_name("Saint Johns"))
        self.assertEqual(normalize_team_name("Cal Baptist"), normalize_team_name("California Baptist"))

    def test_reads_iso_date_strings_from_workbook_rows(self):
        sheet = openpyxl.Workbook().active
        for column, value in enumerate(("Game ID", "Date", "Winner", "Loser"), 1):
            sheet.cell(6, column, value)
        for column, value in enumerate(("G01", "2026-10-10", "Wisconsin", "UW Parkside"), 1):
            sheet.cell(7, column, value)

        _, games = workbook_games(sheet, {})

        self.assertEqual(games[0]["game_date"], "2026-10-10")
        self.assertEqual(games[0]["key"], matchup_key("2026-10-10", "UW-Parkside", "Wisconsin", {}))


if __name__ == "__main__":
    unittest.main()
