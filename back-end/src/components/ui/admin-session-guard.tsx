'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { adminLoginHref } from '@/lib/admin-login-target';
import { adminSessionExpired, serverSessionExpired, subscribeAdminSession } from '@/lib/admin-session-client';

export function AdminSessionGuard({ children }: { children: React.ReactNode }) {
  const expired = useSyncExternalStore(subscribeAdminSession, adminSessionExpired, serverSessionExpired);
  const path = usePathname();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (expired) heading.current?.focus(); }, [expired]);
  if (!expired) return children;
  return <main className="max-w-xl mx-auto p-8" aria-labelledby="sign-in-heading">
    <h1 id="sign-in-heading" ref={heading} tabIndex={-1} className="text-2xl font-bold">Sign in again to continue</h1>
    <p className="my-4">Your admin session could not be verified. Review any interrupted action before trying it again.</p>
    <a href={adminLoginHref(path)} className="text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-4">Sign in again</a>
  </main>;
}
