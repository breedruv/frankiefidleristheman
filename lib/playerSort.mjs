const CLASS_ORDER = [/^fr/, /^so/, /^(jr|jun)/, /^(sr|sen)/, /^(gr|grad|5th|fifth)/];
const isEmpty = (value) => value === null || value === undefined || value === '' || value === '--';

function classRank(value) {
  const text = String(value).toLowerCase().replace(/^(redshirt|rs)[\s-]*/, '');
  const rank = CLASS_ORDER.findIndex((pattern) => pattern.test(text));
  return rank === -1 ? CLASS_ORDER.length : rank;
}

export function sortPlayers(players, key, direction) {
  return players.slice().sort((a, b) => {
    const left = key === 'name' ? `${a.first_name || ''} ${a.last_name || ''}` : a[key];
    const right = key === 'name' ? `${b.first_name || ''} ${b.last_name || ''}` : b[key];
    if (isEmpty(left)) return isEmpty(right) ? 0 : 1;
    if (isEmpty(right)) return -1;
    const order = key === 'year' ? classRank(left) - classRank(right)
      : ['name', 'team_name', 'position'].includes(key) ? String(left).localeCompare(String(right)) : Number(left) - Number(right);
    return order * (direction === 'asc' ? 1 : -1);
  });
}
