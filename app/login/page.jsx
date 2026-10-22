'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'invalid_link') setError('That sign-in link is expired or already used. Request a new link below.');
  }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.message);
    } catch (err) { setError(err.message || 'Unable to connect. Try again.'); }
    finally { setBusy(false); }
  }
  return <div className="page"><section className="card login-card"><h1>Team sign-in</h1><p>Enter your email and we’ll send you a sign-in link.</p><form onSubmit={submit}><label>Email<input required type="email" name="email" autoComplete="email" /></label><button className="solid-pill" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}</form><Link href="/draft/board">View the public draft board</Link></section></div>;
}
