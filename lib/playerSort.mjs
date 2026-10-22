export function sortPlayers(players, key, direction) {
  return players.slice().sort((a, b) => {
    const left = key === 'name' ? `${a.first_name || ''} ${a.last_name || ''}` : a[key];
    const right = key === 'name' ? `${b.first_name || ''} ${b.last_name || ''}` : b[key];
    if (left === null || left === undefined || left === '') return right == null || right === '' ? 0 : 1;
    if (right === null || right === undefined || right === '') return -1;
    const order = ['name', 'team_name', 'position'].includes(key)
      ? String(left).localeCompare(String(right)) : Number(left) - Number(right);
    return order * (direction === 'asc' ? 1 : -1);
  });
}
