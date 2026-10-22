import { authClient, currentMember } from '../../../lib/auth';
import { memberName } from '../../../lib/access.mjs';

export async function GET() {
  return Response.json({ member: await currentMember() });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
    const email = body.email.trim().toLowerCase();
    const message = 'If this is your approved team email, a sign-in link is on its way. Check your inbox.';
    if (!memberName({ email, email_confirmed_at: true })) return Response.json({ message });
    const client = await authClient();
    if (!client) return Response.json({ error: 'Sign-in is not configured yet.' }, { status: 503 });
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: new URL('/auth/confirm', request.url).toString() } });
    if (error) return Response.json({ error: error.status === 429 ? 'Please wait a moment before requesting another link.' : 'Unable to send the link. Check Supabase email delivery settings and try again.' }, { status: error.status === 429 ? 429 : 503 });
    return Response.json({ message });
  } catch { return Response.json({ error: 'Unable to sign in. Please try again.' }, { status: 400 }); }
}

export async function DELETE() {
  const client = await authClient();
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) return Response.json({ error: 'Unable to sign out. Please try again.' }, { status: 503 });
  }
  return Response.json({ ok: true });
}
