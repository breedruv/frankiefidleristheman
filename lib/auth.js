import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { memberName } from './access.mjs';

export async function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        // Server Components cannot write cookies; proxy refreshes those sessions.
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      }
    }
  });
}

export async function currentMember() {
  const client = await authClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return memberName(data.user);
}
