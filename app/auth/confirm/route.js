import { NextResponse } from 'next/server';
import { authClient } from '../../../lib/auth';
import { memberName } from '../../../lib/access.mjs';

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token_hash');
  const code = url.searchParams.get('code');
  const client = await authClient();
  if (client && ((token && token.length <= 512) || (code && code.length <= 2048))) {
    const { data, error } = token
      ? await client.auth.verifyOtp({ token_hash: token, type: 'email' })
      : await client.auth.exchangeCodeForSession(code);
    if (!error && memberName(data.user)) return NextResponse.redirect(new URL('/draft/players', url.origin));
    if (data.session) await client.auth.signOut();
  }
  return NextResponse.redirect(new URL('/login?error=invalid_link', url.origin));
}
