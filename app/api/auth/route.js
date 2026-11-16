import { authClient, currentMember } from '../../../lib/auth';
import { loginCredentials, memberName } from '../../../lib/access.mjs';

export async function GET() {
  return Response.json({ member: await currentMember() });
}

export async function POST(request) {
  let credentials;
  try { credentials = loginCredentials(await request.json()); }
  catch { return Response.json({ error: 'Enter a valid email address and password.' }, { status: 400 }); }
  if (!credentials) return Response.json({ error: 'Enter a valid email address and password.' }, { status: 400 });
  try {
    const client = await authClient();
    if (!client) return Response.json({ error: 'Sign-in is not configured yet.' }, { status: 503 });
    const { error } = await client.auth.signInWithPassword(credentials);
    if (error) {
      if (error.status === 429) return Response.json({ error: 'Too many sign-in attempts. Try again shortly.' }, { status: 429 });
      if (!error.status || error.status >= 500) return Response.json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' }, { status: 503 });
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    const { data, error: userError } = await client.auth.getUser();
    const member = !userError && memberName(data.user);
    if (!member) {
      await client.auth.signOut();
      return Response.json({ error: 'This account cannot access the team workspace.' }, { status: 403 });
    }
    return Response.json({ member });
  } catch { return Response.json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' }, { status: 503 }); }
}

export async function DELETE() {
  const client = await authClient();
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) return Response.json({ error: 'Unable to sign out. Please try again.' }, { status: 503 });
  }
  return Response.json({ ok: true });
}
