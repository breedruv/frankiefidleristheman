import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from compare_exhibition_stats import parse_pdf_tables, parse_pdf_text, parse_source_rows
from parse_exhibition_pdfs import add_game_points_check, attribute_pdf_teams, file_team_matches, game_fields, matching_roster_row, mark_duplicate_player_rows, update_workbook_pdf_links, write_review


class ExhibitionPdfMatchTest(unittest.TestCase):
    def test_filename_team_aliases_match_workbook_names(self):
        self.assertTrue(file_team_matches(
            ("Connecticut", "Michigan-State"), ("UConn", "Michigan St.")
        ))
        self.assertTrue(file_team_matches(("Vanerbuilt", "Virginia"), ("Vanderbilt", "Virginia")))

    def test_only_jersey_and_name_match_sets_a_confirmed_roster_match(self):
        roster = {"41": [{"team_id": "41", "team_name": "UConn Huskies", "player_id": "123",
                          "jersey": 2, "name": "Silas Demary Jr."}]}

        exact, exact_status = matching_roster_row(
            {"jersey": "2", "source_player_name": "Silas Demary Jr. G"}, ["41"], roster
        )
        review, review_status = matching_roster_row(
            {"jersey": "2", "source_player_name": "Unrelated Player"}, ["41"], roster
        )

        self.assertEqual(exact["player_id"], "123")
        self.assertEqual(exact_status, "matched jersey + name")
        self.assertEqual(review["player_id"], "123")
        self.assertTrue(review_status.startswith("review"))

    def test_pdf_text_fallback_does_not_duplicate_table_rows(self):
        with patch("compare_exhibition_stats.parse_pdf_tables", return_value=[{"source_player_name": "Known"}]), \
             patch("compare_exhibition_stats.parse_pdf_text") as text_parser:
            rows = parse_source_rows([], "PDF", "play-by-play content")

        self.assertEqual(rows, [{"source_player_name": "Known"}])
        text_parser.assert_not_called()

    def test_repairs_local_pdf_cells_and_keeps_a_workbook_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            workbook_path = Path(directory) / "games.xlsx"
            workbook = openpyxl.Workbook()
            sheet = workbook.active
            sheet.title = "Games"
            for column, value in enumerate(("Game ID", "Date", "Winner", "Winner PTS", "Loser", "Loser PTS", "Coverage", "Source"), 1):
                sheet.cell(6, column, value)
            sheet.cell(7, 1, "G01")
            workbook.save(workbook_path)
            pdf_path = Path(__file__).resolve().parents[1] / "data" / "exhibition-pdfs" / "G01_2026-09-27_Vanerbuilt-vs-Virginia.pdf"

            backup, saved_path = update_workbook_pdf_links(workbook_path, {"G01": (pdf_path, "")})

            saved = openpyxl.load_workbook(workbook_path)
            cell = saved["Games"].cell(7, 9)
            self.assertEqual(cell.value, "data/exhibition-pdfs/G01_2026-09-27_Vanerbuilt-vs-Virginia.pdf")
            self.assertTrue(cell.hyperlink.target.endswith("G01_2026-09-27_Vanerbuilt-vs-Virginia.pdf"))
            self.assertTrue(backup.is_file())
            self.assertEqual(saved_path, workbook_path)

    def test_parses_sidearm_text_rows_with_comma_names(self):
        rows = parse_pdf_text(
            "24 McCreesh,Brandon * 36 8-14 4-8 0-0 0-2 2 1 1 0 0 4 20"
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source_player_name"], "Brandon McCreesh")
        self.assertEqual(rows[0]["minutes"], 36)
        self.assertEqual((rows[0]["fgm"], rows[0]["fga"], rows[0]["pts"]), (8, 14, 20))

    def test_pdf_tables_keep_separate_team_sections(self):
        header = ["No.", "Name", "MIN", "FG", "3PT", "FT", "OREB", "DREB", "REB", "PF", "FD", "PTS", "AST", "TO", "STL", "BLK", "BA", "+/-"]
        row = ["1", "Player A", "20", "1-2", "0-0", "0-0", "0", "0", "0", "0", "0", "2", "0", "0", "0", "0", "0", "0"]

        players = parse_pdf_tables([([header, row, header, row], "")])

        self.assertEqual([player["_pdf_section"] for player in players], [0, 1])

    def test_parsed_pdf_rows_include_their_original_page_number(self):
        header = ["No.", "Name", "MIN", "FG", "3PT", "FT", "OREB", "DREB", "REB", "PF", "FD", "PTS", "AST", "TO", "STL", "BLK", "BA", "+/-"]
        row = ["1", "Player A", "20", "1-2", "0-0", "0-0", "0", "0", "0", "0", "0", "2", "0", "0", "0", "0", "0", "0"]

        parsed = parse_pdf_tables([([header, row], "pdf_page:4")])

        self.assertEqual(parsed[0]["_source_pdf_page"], 4)

    def test_pdf_text_fallback_tracks_page_markers(self):
        rows = parse_pdf_text(
            "[[PDF_PAGE:2]]\n24 McCreesh,Brandon * 36 8-14 4-8 0-0 0-2 2 1 1 0 0 4 20"
        )

        self.assertEqual(rows[0]["_source_pdf_page"], 2)

    def test_pdf_sections_are_assigned_by_team_score_and_preserve_order_independently(self):
        players = [
            {"_pdf_section": 0, "source_player_name": "Away Player", "pts": 50},
            {"_pdf_section": 1, "source_player_name": "Home Player", "pts": 60},
        ]
        game = {"team_a": "Home", "team_a_score": 60, "team_b": "Away", "team_b_score": 50}

        players, checks = attribute_pdf_teams(players, game)

        self.assertEqual([player["source_team_name"] for player in players], ["Away", "Home"])
        self.assertEqual(checks, {"team_a": "Match", "team_b": "Match"})

    def test_pdf_team_assignment_can_combine_adjacent_tables(self):
        players = [
            {"_pdf_section": 0, "source_player_name": "Home A", "pts": 20},
            {"_pdf_section": 1, "source_player_name": "Home B", "pts": 40},
            {"_pdf_section": 2, "source_player_name": "Away", "pts": 50},
        ]
        game = {"team_a": "Home", "team_a_score": 60, "team_b": "Away", "team_b_score": 50}

        players, checks = attribute_pdf_teams(players, game)

        self.assertEqual([player["source_team_name"] for player in players], ["Home", "Home", "Away"])
        self.assertEqual(checks, {"team_a": "Match", "team_b": "Match"})

    def test_flags_conflicting_repeated_player_rows(self):
        rows = [
            {"jersey": "2", "source_player_name": "Nas Meyer", "pts": 10},
            {"jersey": "2", "source_player_name": "Nas Meyer", "pts": 14},
        ]

        mark_duplicate_player_rows(rows)

        self.assertTrue(all(row["source_duplicate"] for row in rows))

    def test_review_rows_include_source_game_metadata_for_later_import(self):
        fields = game_fields({"game_date": "2026-10-24", "team_a": "Seton Hall", "team_a_score": 53,
                              "team_b": "Monmouth", "team_b_score": 50, "source_url": "https://example.test/box.pdf"}, "G95")

        self.assertEqual((fields["source_game_label"], fields["season"], fields["is_exhibition"]), ("G95", 2027, True))
        self.assertEqual((fields["team_a_score"], fields["team_b_score"]), (53, 50))

    def test_checks_parsed_player_points_against_final_score(self):
        rows = [
            {"source_game_label": "G95", "team_a_score": 53, "team_b_score": 50, "source_player_name": "A", "pts": 10},
            {"source_game_label": "G95", "team_a_score": 53, "team_b_score": 50, "source_player_name": "B", "pts": 93},
        ]

        add_game_points_check(rows)

        self.assertTrue(all(row["game_points_check"] == "Match" for row in rows))

    def test_withholds_exact_ids_when_game_point_total_does_not_match(self):
        row = {"source_game_label": "G56", "team_a_score": 80, "team_b_score": 78,
               "source_player_name": "Player", "pts": 10, "player_id": "123", "team_id": "41",
               "review_status": "Approve exact matches"}

        add_game_points_check([row])

        self.assertEqual(row["game_points_check"], "Review: player points 10 vs final score 158")
        self.assertEqual((row["player_id"], row["team_id"]), ("", ""))
        self.assertEqual((row["candidate_player_id"], row["candidate_team_id"]), ("123", "41"))

    def test_incremental_review_replaces_only_the_selected_game(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "review.csv"
            write_review(path, [{"source_game_label": "G01", "pts": 10}, {"source_game_label": "G02", "pts": 20}])

            rows = write_review(path, [{"source_game_label": "G02", "pts": 22}], append=True)

        self.assertEqual([(row["source_game_label"], int(row["pts"])) for row in rows], [("G01", 10), ("G02", 22)])


if __name__ == "__main__":
    unittest.main()
