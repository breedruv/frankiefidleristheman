import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { memberName, requiresMember } from './lib/access.mjs';

export async function proxy(request) {
  const path = request.nextUrl.pathname;
  const restricted = process.env.PRE_DRAFT_PRIVATE === 'true';
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  let member = null;
  if (url && key && request.cookies.getAll().some((c) => c.name.startsWith('sb-'))) {
    const client = createServerClient(url, key, {
      cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    });
    const { data } = await client.auth.getUser();
    member = memberName(data.user);
  }
  if (requiresMember(path, request.method, restricted) && !member) {
    const denied = path.startsWith('/api/')
      ? NextResponse.json({ error: 'Sign in as Andrew or Sam to continue.' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    response = denied;
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?)$).*)'] };
