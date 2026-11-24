"""Parse a CBS Sports team roster page (cbssports.com/college-basketball/teams/{CODE}/{slug}/roster/)."""
import re

from bs4 import BeautifulSoup

CBS_BASE = "https://www.cbssports.com"


def parse_cbs_roster(html):
    soup = BeautifulSoup(html, "html.parser")
    players = []
    for table in soup.find_all(class_="TableBase-table"):
        headers = [th.get_text(" ", strip=True).upper() for th in table.find_all("th")]
        if "PLAYER" not in headers:
            continue
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) != len(headers):
                continue
            values = dict(zip(headers, cells))
            name_cell = values["PLAYER"]
            link = (name_cell.select_one(".CellPlayerName--long a") or name_cell.find("a"))
            href = link.get("href") if link else ""
            match = re.search(r"/players/(\d+)/", href or "")
            text = lambda key: values[key].get_text(" ", strip=True) if key in values else ""
            players.append({
                "source_player_id": match.group(1) if match else "",
                "source_player_url": f"{CBS_BASE}{href}" if href else "",
                "jersey": text("NO"),
                "name": link.get_text(" ", strip=True) if link else text("PLAYER"),
                "position": text("POS"),
                "height": text("HT"),
                "weight": text("WT"),
                "class": text("CLASS"),
                "hometown": text("HOMETOWN"),
            })
    return players
