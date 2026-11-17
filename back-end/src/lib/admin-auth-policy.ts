export type AdminIdentity = { ok: true; mode: 'access' | 'supabase' | 'token'; actor: string };
export function isHumanAdminIdentity(identity: Pick<AdminIdentity, 'mode'>): boolean {
  return identity.mode === 'access' || identity.mode === 'supabase';
}
export function adminIdentityPolicy(): { origin: string; emails: Set<string> } | null {
  try {
    const origin = (process.env.ADMIN_SITE_ORIGIN ?? '').trim(), site = new URL(origin);
    const emails = (process.env.ADMIN_ALLOWED_EMAILS ?? '').split(',').map(value => value.trim().toLowerCase());
    if (!(site.protocol === 'https:' || process.env.NODE_ENV === 'development' && site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)) || site.origin !== origin || site.username || site.password || !emails.length || emails.length > 100 || emails.some(email => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))) return null;
    return { origin, emails: new Set(emails) };
  } catch { return null; }
}
/** Browser-origin evidence is separate from identity; mutations always require Origin. */
export function humanAdminRequestAllowed(request: Request, origin: string, protectReadActions = false): boolean {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return request.headers.get('origin') === origin && request.headers.get('sec-fetch-site') !== 'cross-site';
  if (!protectReadActions || !['GET', 'HEAD'].includes(request.method)) return true;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const provided = request.headers.get('origin');
  if (provided !== null) return provided === origin;
  try { return new URL(request.headers.get('referer') ?? '').origin === origin; } catch { return false; }
}
