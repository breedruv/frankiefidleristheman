'use client';

import { useState } from 'react';

export default function ChangePasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    if (password !== form.get('confirmation')) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.replace('/draft/players');
    } catch (err) { setError(err.message || 'Unable to set password. Try again.'); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit}><label>New password<input required type="password" name="password" autoComplete="new-password" minLength={8} /></label><label>Confirm password<input required type="password" name="confirmation" autoComplete="new-password" minLength={8} /></label><button className="solid-pill" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>{error && <p role="alert">{error}</p>}</form>;
}
