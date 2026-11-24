import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from exhibition_sources import fetch_source


class PdfPagesTest(unittest.TestCase):
    def test_fetch_source_extracts_tables_and_text_from_every_page(self):
        class Page:
            def __init__(self, label, heading="Official Basketball Box Score"):
                self.label = label
                self.heading = heading

            def extract_tables(self):
                return [[[self.label]]]

            def extract_text(self):
                return f"{self.heading} {self.label}"

        class Pdf:
            pages = [Page("page one"), Page("play-by-play", "Official Basketball Play by Play"),
                     Page("page three"), Page("1st Half Box Score", "1st Half Box Score")]

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

        with tempfile.TemporaryDirectory() as directory:
            pdf_path = Path(directory) / "boxscore.pdf"
            pdf_path.write_bytes(b"%PDF-test")
            with patch("exhibition_sources.pdfplumber.open", return_value=Pdf()):
                tables, source_type, text = fetch_source(None, str(pdf_path), 1)

        self.assertEqual(source_type, "PDF")
        self.assertEqual(tables, [([['page one']], "pdf_page:1"), ([['page three']], "pdf_page:3")])
        self.assertEqual(text, "[[PDF_PAGE:1]]\nOfficial Basketball Box Score page one\n[[PDF_PAGE:3]]\nOfficial Basketball Box Score page three")

    def test_fetch_source_skips_overtime_box_score_pages(self):
        class Page:
            def __init__(self, period):
                self.period = period

            def extract_tables(self):
                return [[[self.period]]]

            def extract_text(self):
                return f"Official Basketball Box Score - {self.period} Game Time: 2:00 PM\nBaylor at Florida"

        class Pdf:
            pages = [Page("Final"), Page("First Half"), Page("Second Half"), Page("1st OT"), Page("2nd OT")]

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

        with tempfile.TemporaryDirectory() as directory:
            pdf_path = Path(directory) / "boxscore.pdf"
            pdf_path.write_bytes(b"%PDF-test")
            with patch("exhibition_sources.pdfplumber.open", return_value=Pdf()):
                tables, _, _ = fetch_source(None, str(pdf_path), 1)

        self.assertEqual(tables, [([['Final']], "pdf_page:1")])


if __name__ == "__main__":
    unittest.main()
