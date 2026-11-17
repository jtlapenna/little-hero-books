'use client';
import { useState } from 'react';
export function AdminSignOut() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  async function signOut() {
    setBusy(true); setError(false);
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error();
      window.location.replace('/login?signedOut=1');
    } catch { setError(true); setBusy(false); }
  }
  return <div className="text-right"><button onClick={signOut} disabled={busy} className="min-h-11 px-2 text-sm text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2">{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="max-w-48 text-xs text-red-700">Could not sign out. Check your connection and retry.</p>}</div>;
}
