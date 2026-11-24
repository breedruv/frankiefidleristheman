"""Parse a Yahoo Sports team roster page (sports.yahoo.com/ncaab/teams/{slug}/roster/)."""
import re

from bs4 import BeautifulSoup

YAHOO_BASE = "https://sports.yahoo.com"


def parse_yahoo_roster(html):
    soup = BeautifulSoup(html, "html.parser")
    players = []
    for table in soup.find_all("table"):
        headers = [th.get_text(" ", strip=True).upper() for th in table.find_all("th")]
        if "PLAYER" not in headers:
            continue
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) != len(headers):
                continue
            values = dict(zip(headers, cells))
            link = values["PLAYER"].find("a")
            href = link.get("href") if link else ""
            match = re.search(r"/players/(\d+)", href or "")
            text = lambda key: values[key].get_text(" ", strip=True) if key in values else ""
            players.append({
                "source_player_id": match.group(1) if match else "",
                "source_player_url": f"{YAHOO_BASE}{href}" if href else "",
                "jersey": text("NO"),
                "name": link.get_text(" ", strip=True) if link else text("PLAYER"),
                "position": text("P"),
                "height": text("HT"),
                "weight": text("WT"),
                "class": text("YR"),
                "hometown": text("HOMETOWN"),
            })
    return players
