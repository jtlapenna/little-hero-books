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

function misconfigured(details: string): AdminAuthFail {
  return {
    ok: false,
    response: NextResponse.json({ error: 'Admin auth misconfigured', details }, { status: 500 }),
  };
}

/**
 * Purpose: fail-closed auth for admin endpoints.
 * Accept if either:
 * - strict same-origin host match against NEXT_PUBLIC_SITE_URL, OR
 * - Authorization: Bearer <BACKEND_API_TOKEN>
 */
export function requireAdminAuth(request: NextRequest): AdminAuthOk | AdminAuthFail {
  const configuredSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  if (!configuredSiteUrl) return misconfigured('NEXT_PUBLIC_SITE_URL is missing');

  const allowlistedHost = parseHost(configuredSiteUrl);
  if (!allowlistedHost) return misconfigured('NEXT_PUBLIC_SITE_URL is not a valid URL');

  const originHost = parseHost(request.headers.get('origin'));
  const refererHost = parseHost(request.headers.get('referer'));
  const isSameOrigin =
    (originHost && originHost === allowlistedHost) ||
    (refererHost && refererHost === allowlistedHost);
  if (isSameOrigin) return { ok: true, mode: 'same_origin' };

  const expectedToken = (process.env.BACKEND_API_TOKEN ?? '').trim();
  const authHeader = (request.headers.get('authorization') ?? '').trim();
  const token =
    authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (expectedToken && token === expectedToken) return { ok: true, mode: 'token' };

  return unauthorized();
}

