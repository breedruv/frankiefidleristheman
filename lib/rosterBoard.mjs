export function sortPositionRoster(players = [], sort = "pick") {
  return players.slice().sort((a, b) => {
    if (sort === "ppg") return (Number(b.ppg) || -1) - (Number(a.ppg) || -1) || a.positionPick - b.positionPick;
    return a.positionPick - b.positionPick;
  });
}
