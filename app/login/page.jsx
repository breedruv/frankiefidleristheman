'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.replace('/draft/players');
    } catch (err) { setError(err.message || 'Unable to connect. Try again.'); }
    finally { setBusy(false); }
  }
  return <div className="page"><section className="card login-card"><h1>Team sign-in</h1><p>Sign in with your team account.</p><form onSubmit={submit}><label>Email<input required type="email" name="email" autoComplete="email" /></label><label>Password<input required type="password" name="password" autoComplete="current-password" /></label><button className="solid-pill" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>{error && <p role="alert">{error}</p>}</form><Link href="/draft/board">View the public draft board</Link></section></div>;
}
