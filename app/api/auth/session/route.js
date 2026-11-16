import { authClient } from '../../../../lib/auth';
import { memberName, sessionTokens } from '../../../../lib/access.mjs';

export async function POST(request) {
  let tokens;
  try { tokens = sessionTokens(await request.json()); } catch { return Response.json({ error: 'Invalid sign-in link.' }, { status: 400 }); }
  if (!tokens) return Response.json({ error: 'Invalid sign-in link.' }, { status: 400 });
  const client = await authClient();
  if (!client) return Response.json({ error: 'Sign-in is not configured yet.' }, { status: 503 });
  const { error } = await client.auth.setSession(tokens);
  if (error) return Response.json({ error: 'Invalid or expired sign-in link.' }, { status: 401 });
  const { data, error: userError } = await client.auth.getUser();
  const member = !userError && memberName(data.user);
  if (!member) {
    await client.auth.signOut();
    return Response.json({ error: 'This account cannot access the team workspace.' }, { status: 403 });
  }
  return Response.json({ member });
}
