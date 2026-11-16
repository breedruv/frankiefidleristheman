export function memberName(user, env = process.env) {
  if (!user?.email_confirmed_at || !user.email) return null;
  const email = user.email.toLowerCase();
  if (env.ANDREW_EMAIL && email === env.ANDREW_EMAIL.toLowerCase()) return 'Andrew';
  if (env.SAM_EMAIL && email === env.SAM_EMAIL.toLowerCase()) return 'Sam';
  return null;
}

export function shouldVerifyUserInProxy(path, method, memberRequired) {
  return memberRequired || !path.startsWith('/api/') || !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

export function sessionTokens(body) {
  const access_token = body?.access_token;
  const refresh_token = body?.refresh_token;
  return typeof access_token === 'string' && access_token.length > 0 && access_token.length <= 8192
    && typeof refresh_token === 'string' && refresh_token.length > 0 && refresh_token.length <= 8192
    ? { access_token, refresh_token } : null;
}

export function requiresMember(path, method, restricted) {
  if (path === '/login' || path === '/auth/confirm' || path === '/api/auth' || path.startsWith('/api/auth/')) return false;
  if (path === '/api/shortlists') return true;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') return true;
  if (!restricted) return false;
  return !['/draft/board', '/api/draft-config', '/api/draft-picks'].includes(path);
}
