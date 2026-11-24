"""Open school roster searches sequentially from the discovery CSV."""

import argparse
import csv
import time
import webbrowser
from pathlib import Path


def open_searches(path, interval):
    with open(path, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    searches = [row["google_roster_search"] for row in rows if row.get("google_roster_search")]
    for index, url in enumerate(searches):
        print(f"Opening search {index + 1}/{len(searches)}")
        if not webbrowser.open_new_tab(url):
            raise RuntimeError("Could not open the default browser. Check your system browser association.")
        if index < len(searches) - 1:
            time.sleep(interval)
    return len(searches)


def main():
    parser = argparse.ArgumentParser(description="Open the school roster Google searches one at a time.")
    parser.add_argument("csv", nargs="?", default="school-site-discovery-updated.csv")
    parser.add_argument("--interval", type=float, default=8, help="Seconds between browser tabs (default: 8).")
    args = parser.parse_args()
    if args.interval < 0:
        parser.error("--interval must be zero or greater")
    count = open_searches(args.csv, args.interval)
    print(f"Opened {count} searches. Press Ctrl+C before the run to cancel it.")
    print(f"Search list: {Path(args.csv).resolve()}")


if __name__ == "__main__":
    main()
