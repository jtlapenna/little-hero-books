'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { LEGACY_ADMIN_LOGIN_PATH } from '@/lib/admin-login-target';

const hydrationSubscribe = () => () => undefined;
const clientReady = () => true;
const serverReady = () => false;
type Props = { enabled: boolean; returnTo: string; signedOut: boolean };
const field = 'mt-2 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 shadow-sm focus:border-blue-600 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600';
const button = 'min-h-12 w-full rounded-lg bg-blue-700 px-4 py-3 text-base font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60';
export function AdminSignIn({ enabled, returnTo, signedOut }: Props) {
  const ready = useSyncExternalStore(hydrationSubscribe, clientReady, serverReady);
  const [email, setEmail] = useState(''), [token, setToken] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [remember, setRemember] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [sent, setSent] = useState(false), [cooldown, setCooldown] = useState(0);
  const code = useRef<HTMLInputElement>(null), emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (stage === 'code') code.current?.focus(); }, [stage]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  useEffect(() => {
    if (signedOut) return;
    const controller = new AbortController();
    fetch('/api/admin/session', { cache: 'no-store', referrerPolicy: 'same-origin', signal: controller.signal }).then(response => {
      if (response.ok) window.location.replace(returnTo);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [returnTo, signedOut]);
  async function submit(event?: FormEvent) {
    event?.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    const action = stage === 'email' ? 'request-code' : 'verify-code';
    try {
      const response = await fetch('/api/auth/' + action, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stage === 'email' ? { email } : { email, token, remember, returnTo }), signal: AbortSignal.timeout(15000) });
      const data = await response.json() as { error?: string; redirectTo?: string; resendAfter?: number };
      if (!response.ok) { if (response.status === 429) setCooldown(60); throw Error(data.error || 'Sign-in could not be completed. Please try again.'); }
      if (stage === 'code') { window.location.replace(data.redirectTo || returnTo); return; }
      setStage('code'); setSent(true); setCooldown(data.resendAfter ?? 60);
    } catch (cause) { setError(cause instanceof Error && cause.name !== 'TimeoutError' && cause.name !== 'TypeError' ? cause.message : 'We could not reach sign-in. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  async function resend() {
    if (busy || cooldown) return;
    setBusy(true); setError(''); setSent(false);
    try {
      const response = await fetch('/api/auth/request-code', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(15000) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw Error(data.error || 'Unable to send a new code. Please try again.');
      setToken(''); setSent(true); code.current?.focus();
    } catch (cause) { setError(cause instanceof Error && cause.name !== 'TypeError' && cause.name !== 'TimeoutError' ? cause.message : 'Check your connection and try again.'); }
    finally { setCooldown(60); setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-10 sm:py-16" aria-labelledby="sign-in-title">
    <div className="w-full max-w-md">
      <p className="mb-8 text-lg font-semibold text-slate-800">Little Hero Labs</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 id="sign-in-title" className="text-3xl font-semibold tracking-tight text-slate-950">{stage === 'email' ? 'Sign in to admin' : 'Check your email'}</h1>
        {signedOut && <p role="status" className="mt-4 text-slate-700">You’re signed out on this device.</p>}
        {!enabled ? <>
          <p className="mt-4 leading-relaxed text-slate-600">Email sign-in is being set up. You can continue with the existing sign-in.</p>
          <a className={button + ' mt-6 block text-center'} href={`${LEGACY_ADMIN_LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`}>Continue to sign in</a>
        </> : <>
          <p className="mt-3 leading-relaxed text-slate-600">{stage === 'email' ? 'Use your approved work email. We’ll send you a six-digit sign-in code.' : <>Enter the six-digit code sent to <strong className="mt-1 block break-words font-medium text-slate-800">{email}</strong></>}</p>
          <noscript><p className="mt-4 text-red-800">Enable JavaScript in your browser to sign in.</p></noscript>
          <form method="post" onSubmit={submit} className="mt-6 space-y-5" aria-busy={busy}>
            {stage === 'email' ? <div><label className="font-medium text-slate-800" htmlFor="admin-email">Email address</label>
              <input className={field} ref={emailInput} id="admin-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} disabled={!ready || busy} /></div>
              : <div><label className="font-medium text-slate-800" htmlFor="admin-code">Sign-in code</label>
                <input className={field + ' text-center text-2xl tracking-[0.3em]'} ref={code} id="admin-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={token} onChange={event => setToken(event.target.value.replace(/\D/g, ''))} aria-invalid={error ? true : undefined} aria-describedby={error ? 'signin-error' : 'code-help'} disabled={!ready || busy} />
                <p id="code-help" className="mt-2 text-sm leading-relaxed text-slate-600">Use the most recent code. If it has expired, request a new one below.</p></div>}
            <div><label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={!ready || busy} />Keep me signed in for 30 days</label>
              <p className="ml-8 text-xs leading-5 text-slate-500">Use this on a device you trust.</p></div>
            {error && <p id="signin-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-800">{error}</p>}
            <button className={button} type="submit" disabled={!ready || busy || stage === 'email' && cooldown > 0}>{!ready ? 'Loading sign-in…' : busy ? (stage === 'email' ? 'Sending code…' : 'Signing in…') : stage === 'email' ? 'Email me a code' : 'Sign in'}</button>
          </form>
          {stage === 'code' && <div className="mt-5 space-y-3 text-sm">
            <p role="status" className="text-slate-600">{sent ? 'Code requested. Check your inbox and spam folder.' : ''}</p>
            <button type="button" onClick={resend} disabled={busy || cooldown > 0} className="min-h-11 text-blue-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:text-slate-500 disabled:no-underline">{cooldown ? `Send a new code in ${cooldown}s` : 'Send a new code'}</button>
            <button type="button" disabled={!ready || busy} className="block min-h-11 text-blue-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => { setStage('email'); setToken(''); setError(''); requestAnimationFrame(() => emailInput.current?.focus()); }}>Use a different email</button>
          </div>}
        </>}
      </div>
      <p className="mt-6 text-center text-sm leading-relaxed text-slate-500">Private access for Little Hero Labs administrators.</p>
    </div>
  </main>;
}
