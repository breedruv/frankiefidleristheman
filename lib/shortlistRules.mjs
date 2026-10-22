export function validateShortlist(member, body, pool) {
  if (!member || body.owner !== member) throw new Error('You can edit only your own list.');
  const ids = body.playerIds;
  if (!Array.isArray(ids) || ids.length > 10 || new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || !pool.has(id)) || !Number.isInteger(body.revision) || body.revision < 0) throw new Error('Choose up to ten unique players from the current pool.');
  return ids;
}
