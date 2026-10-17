/** Lulu signs the exact raw UTF-8 payload with the webhook owner's API secret.
 * https://lulu.apidocumentation.com/ (Webhooks). No unsigned fallback.
 */
export async function verifyLuluWebhook(raw: Uint8Array, signature: string | null): Promise<boolean> {
  const secret = (process.env.LULU_CLIENT_SECRET || process.env.LULU_API_SECRET || '').trim();
  if (!secret || !signature) return false;
  let digest: Uint8Array;
  if (/^[a-fA-F0-9]{64}$/.test(signature)) {
    digest = Uint8Array.from(signature.match(/../g)!, value => Number.parseInt(value, 16));
  } else if (/^[A-Za-z0-9+/]{43}=$/.test(signature)) {
    try { digest = Uint8Array.from(atob(signature), value => value.charCodeAt(0)); } catch { return false; }
  } else return false;
  if (digest.length !== 32) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, new Uint8Array(digest), new Uint8Array(raw));
}
