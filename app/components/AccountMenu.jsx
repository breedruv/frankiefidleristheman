'use client';
import Link from 'next/link';
import { useState } from 'react';
export default function AccountMenu({ member }) {
  const [error, setError] = useState('');
  if (!member) return <Link className="ghost-pill" href="/login">Sign in</Link>;
  async function signOut() {
    try {
      const response = await fetch('/api/auth', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      window.location.assign('/draft/board');
    } catch { setError('Unable to sign out. Try again.'); }
  }
  return <><span>{member}</span><button type="button" className="ghost-pill" onClick={signOut}>Sign out</button>{error && <small role="alert">{error}</small>}</>;
}
