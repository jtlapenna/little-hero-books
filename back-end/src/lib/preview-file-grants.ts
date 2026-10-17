import { jwtVerify, SignJWT } from 'jose';

const issuer = 'littleherolabs:preview-files:v1';
const audience = 'customer-preview-image';
const maxLifetimeSeconds = 3600;

export function isPreviewImageKey(key: string, orderPrefix?: string): boolean {
  if (key.length > 512 || !/^[A-Za-z0-9_-]+\/orders\/[A-Za-z0-9_-]+\/preview-images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/.test(key)) return false;
  return !orderPrefix || key.startsWith(`${orderPrefix}/preview-images/`);
}

async function signingKey(): Promise<Uint8Array> {
  const secret = (process.env.BACKEND_API_TOKEN ?? '').trim();
  if (secret.length < 32) throw new Error('Preview file authorization unavailable');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${issuer}\u0000${secret}`)));
}

export async function createPreviewImageGrant(key: string, sourceExpiresAt: string): Promise<{ grant: string; expiresAt: string }> {
  if (!isPreviewImageKey(key)) throw new Error('Invalid preview image key');
  const now = Math.floor(Date.now() / 1000);
  const expires = Math.min(Math.floor(Date.parse(sourceExpiresAt) / 1000), now + maxLifetimeSeconds);
  if (!Number.isFinite(expires) || expires <= now) throw new Error('Preview link expired');
  const grant = await new SignJWT({ purpose: audience, key }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(issuer).setAudience(audience).setIssuedAt(now).setExpirationTime(expires).sign(await signingKey());
  return { grant, expiresAt: new Date(expires * 1000).toISOString() };
}

export async function verifyPreviewImageGrant(grant: string, key: string): Promise<boolean> {
  if (!isPreviewImageKey(key) || grant.length > 4096) return false;
  try {
    const { payload } = await jwtVerify(grant, await signingKey(), {
      issuer, audience, algorithms: ['HS256'], requiredClaims: ['exp', 'iat', 'purpose', 'key'],
    });
    const now = Date.now() / 1000;
    return payload.purpose === audience && payload.key === key && payload.aud === audience &&
      typeof payload.iat === 'number' && payload.iat <= now && typeof payload.exp === 'number' &&
      payload.exp > payload.iat && payload.exp - payload.iat <= maxLifetimeSeconds;
  } catch { return false; }
}
