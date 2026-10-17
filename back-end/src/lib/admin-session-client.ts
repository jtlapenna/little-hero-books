import { ADMIN_SIGN_IN_HEADER, adminReturnPath } from './admin-login-target';

// The early client entry installs this before React hydration starts any data fetches.
let expired = false;
const subscribers = new Set<() => void>();
export const adminSessionExpired = () => expired;
export const serverSessionExpired = () => false;
export function subscribeAdminSession(callback: () => void): () => void {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}
export function installAdminSessionMonitor(browser: Window): void {
  if (!adminReturnPath(browser.location.pathname)) return;
  const originalFetch = browser.fetch.bind(browser);
  const markExpired = () => {
    if (expired) return;
    expired = true;
    for (const notify of subscribers) notify();
  };
  browser.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const url = new URL(input instanceof Request ? input.url : String(input), browser.location.href);
    // Public customer endpoints and explicit Bearer callers do not carry this marker.
    if (url.origin === browser.location.origin && url.pathname.startsWith('/api/') &&
        response.status === 401 && response.headers.get(ADMIN_SIGN_IN_HEADER) === 'required') markExpired();
    return response; // Never consume bodies, change credentials or replay a request.
  };
  let probe: Promise<void> | undefined;
  const checkSession = () => {
    if (expired || probe || browser.document.visibilityState === 'hidden') return;
    probe = browser.fetch('/api/admin/session', { cache: 'no-store' })
      .then(() => undefined).catch(() => undefined).finally(() => { probe = undefined; });
  };
  browser.document.addEventListener('visibilitychange', checkSession);
  browser.addEventListener('pageshow', checkSession);
  checkSession();
}
