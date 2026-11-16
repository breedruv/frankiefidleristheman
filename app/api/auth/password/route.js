import { authClient } from '../../../../lib/auth';
import { memberName } from '../../../../lib/access.mjs';

export async function POST(request) {
  let password;
  try { password = (await request.json()).password; }
  catch { return Response.json({ error: 'Enter a new password.' }, { status: 400 }); }
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) {
    return Response.json({ error: 'Use a password of at least 8 characters.' }, { status: 400 });
  }
  try {
    const client = await authClient();
    if (!client) return Response.json({ error: 'Password updates are temporarily unavailable.' }, { status: 503 });
    const { data, error } = await client.auth.getUser();
    if (error || !memberName(data.user)) return Response.json({ error: 'Sign in before changing your password.' }, { status: 401 });
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      if (updateError.status === 429) return Response.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
      if (!updateError.status || updateError.status >= 500) return Response.json({ error: 'Password updates are temporarily unavailable.' }, { status: 503 });
      return Response.json({ error: 'Choose a different password that meets the password requirements.' }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch { return Response.json({ error: 'Password updates are temporarily unavailable.' }, { status: 503 }); }
}
