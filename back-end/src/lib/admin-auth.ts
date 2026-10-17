import { createRemoteJWKSet, jwtVerify } from 'jose';
import { verifyBearerAuth } from './auth';

type AdminAuthOk = { ok: true; mode: 'access' | 'token'; actor: string };
type AdminAuthFail = { ok: false; response: Response };
type AccessSettings = { issuer: string; audience: string; emails: Set<string>; origin: string };

let cachedKeys: { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

function denied(status = 401): AdminAuthFail {
  return {
    ok: false,
    response: Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, {
      status, headers: { 'Cache-Control': 'private, no-store' },
    }),
  };
}

function settings(): AccessSettings | null {
  try {
    const issuer = (process.env.CF_ACCESS_ISSUER ?? '').trim();
    const audience = (process.env.CF_ACCESS_AUDIENCE ?? '').trim();
    const origin = (process.env.ADMIN_SITE_ORIGIN ?? '').trim();
    const team = new URL(issuer);
    const site = new URL(origin);
    if (team.protocol !== 'https:' || team.origin !== issuer ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(team.hostname) ||
        team.username || team.password || team.port ||
        !/^[a-f0-9]{64}$/.test(audience) ||
        site.protocol !== 'https:' || site.origin !== origin || site.username || site.password) return null;
    const emails = (process.env.ADMIN_ALLOWED_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase());
    if (!emails.length || emails.length > 100 || emails.some((email) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))) return null;
    return { issuer, audience, emails: new Set(emails), origin };
  } catch {
    return null;
  }
}

function accessToken(request: Request): string | null {
  // Parse the raw cookie list: a duplicate name must not silently select an identity.
  const cookies = (request.headers.get('cookie') ?? '').split(';')
    .map((value) => value.trim()).filter((value) => value.split('=', 1)[0] === 'CF_Authorization');
  if (cookies.length > 1) return null;
  const header = request.headers.get('cf-access-jwt-assertion');
  const cookie = cookies.length ? cookies[0].slice('CF_Authorization='.length) : null;
  if (header !== null && (!header || (cookie !== null && header !== cookie))) return null;
  const token = header ?? cookie;
  return token && token.length <= 16384 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : null;
}

/** Verify human identity, or the existing explicit machine Bearer contract.
 * Origin/Referer/Host and unsigned identity headers can never grant access.
 */
export async function requireAdminAuth(request: Request, options: { protectReadActions?: boolean } = {}): Promise<AdminAuthOk | AdminAuthFail> {
  // Incidental Access cookies must not disable authorized machine consumers.
  if (request.headers.has('authorization')) {
    return verifyBearerAuth(request).ok
      ? { ok: true, mode: 'token', actor: 'backend-automation' }
      : denied();
  }
  const config = settings();
  const token = accessToken(request);
  if (!config || !token) return denied();

  try {
    if (!cachedKeys || cachedKeys.issuer !== config.issuer) {
      cachedKeys = {
        issuer: config.issuer,
        keys: createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), {
          timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 300000,
        }),
      };
    }
    const { payload } = await jwtVerify(token, cachedKeys.keys, {
      issuer: config.issuer, audience: config.audience, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email', 'type'],
    });
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (audiences.length !== 1 || audiences[0] !== config.audience ||
        payload.type !== 'app' || typeof payload.sub !== 'string' || !payload.sub.trim() ||
        typeof payload.email !== 'string' || !config.emails.has(payload.email.toLowerCase()) ||
        typeof payload.iat !== 'number' || payload.iat > Date.now() / 1000) return denied();

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.headers.get('origin') !== config.origin ||
          request.headers.get('sec-fetch-site') === 'cross-site') return denied(403);
    }
    if (options.protectReadActions && ['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (origin !== null) {
        if (origin !== config.origin) return denied(403);
      } else {
        let refererOrigin: string | undefined;
        try { refererOrigin = new URL(request.headers.get('referer') ?? '').origin; } catch { /* deny */ }
        if (request.headers.get('sec-fetch-site') !== 'same-origin' || refererOrigin !== config.origin) return denied(403);
      }
    }
    return { ok: true, mode: 'access', actor: payload.email.toLowerCase() };
  } catch {
    // Do not echo tokens, signed claims, JWKS errors or transport details.
    return denied();
  }
}
