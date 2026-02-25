import { NextRequest, NextResponse } from 'next/server';

type AdminAuthOk = { ok: true; mode: 'same_origin' | 'token' };
type AdminAuthFail = { ok: false; response: NextResponse };

function parseHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function unauthorized(): AdminAuthFail {
  return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
}

/**
 * Purpose: fail-closed auth for admin endpoints.
 * Accept if either:
 * - strict same-origin host match against NEXT_PUBLIC_SITE_URL, OR
 * - Authorization: Bearer <BACKEND_API_TOKEN>
 */
export function requireAdminAuth(request: NextRequest): AdminAuthOk | AdminAuthFail {
  const configuredSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  const allowlistedHosts = new Set<string>();
  const configuredHost = parseHost(configuredSiteUrl);
  if (configuredHost) allowlistedHosts.add(configuredHost);

  // Purpose: avoid hard dependency on NEXT_PUBLIC_SITE_URL and support reverse proxies/CDNs.
  const forwardedHost = (request.headers.get('x-forwarded-host') ?? '').split(',')[0]?.trim() || null;
  const requestHost = (request.headers.get('host') ?? '').trim() || null;
  if (forwardedHost) allowlistedHosts.add(forwardedHost);
  if (requestHost) allowlistedHosts.add(requestHost);

  const originHost = parseHost(request.headers.get('origin'));
  const refererHost = parseHost(request.headers.get('referer'));
  const isSameOrigin =
    (originHost && allowlistedHosts.has(originHost)) ||
    (refererHost && allowlistedHosts.has(refererHost));
  if (isSameOrigin) return { ok: true, mode: 'same_origin' };

  const expectedToken = (process.env.BACKEND_API_TOKEN ?? '').trim();
  const authHeader = (request.headers.get('authorization') ?? '').trim();
  const token =
    authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (expectedToken && token === expectedToken) return { ok: true, mode: 'token' };

  return unauthorized();
}

