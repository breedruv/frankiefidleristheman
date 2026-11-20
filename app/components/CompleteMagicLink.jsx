'use client';

import { useEffect, useState } from 'react';

export default function CompleteMagicLink() {
  const [error, setError] = useState('');

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (!fragment.has('access_token') && !fragment.has('error')) return;
    const access_token = fragment.get('access_token');
    const refresh_token = fragment.get('refresh_token');
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    if (!access_token || !refresh_token) { setError('This sign-in link is invalid or expired. Request a new one.'); return; }

    async function complete() {
      try {
        const response = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token, refresh_token }) });
        if (!response.ok) throw new Error();
        const check = await fetch('/api/auth', { cache: 'no-store' });
        if (!check.ok || !(await check.json()).member) throw new Error();
        window.location.replace('/draft/players');
      } catch { setError('Unable to finish sign-in. Request a new link and try again.'); }
    }
    complete();
  }, []);

  return error ? <p role="alert" className="workspace-error">{error} <a href="/login">Request a new link</a></p> : null;
}
