import { compactVerify, SignJWT } from 'jose';
import { z } from 'zod';

export const PRINTER_FILE_ORIGIN = 'https://admin.littleherolabs.com';
const issuer = 'littleherolabs:printer-files:v1';
const audience = 'gelato-print-pdf';
// Local bounded policy, not a promise of the provider's download/retry window.
export const PRINTER_FILE_LIFETIME_SECONDS = 24 * 60 * 60;
export const PRINTER_FILE_SEND_MARGIN_SECONDS = 60 * 60;
export const PrinterFileWindowSchema = z.object({ version: z.literal(1), issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive() }).strict();
export type PrinterFileWindow = z.infer<typeof PrinterFileWindowSchema>;
const ScopeSchema = z.object({ key: z.string().max(512), submissionId: z.string().uuid(), itemReferenceId: z.string().min(1).max(200),
  orderDbId: z.number().int().positive(), configVersion: z.number().int().positive(), inputFingerprint: z.string().regex(/^[a-f0-9]{24}$/) }).strict();
export type PrinterFileScope = z.infer<typeof ScopeSchema>;
const ClaimsSchema = ScopeSchema.extend({ iss: z.literal(issuer), aud: z.literal(audience), purpose: z.literal(audience), version: z.literal(1),
  origin: z.literal(PRINTER_FILE_ORIGIN), iat: z.number().int().nonnegative(), exp: z.number().int().positive() }).strict();

export function printerArtifactKey(key: string) {
  return key.match(/^([A-Za-z0-9_-]+)\/orders\/([A-Za-z0-9_-]+)\/gelato\/print\/v([1-9]\d*)\/([a-f0-9]{24})\.pdf$/);
}
function validScope(scope: PrinterFileScope) {
  const match = printerArtifactKey(scope.key);
  if (!match || Number(match[3]) !== scope.configVersion || match[4] !== scope.inputFingerprint) throw new Error('Invalid printer artifact scope');
}
function validWindow(window: PrinterFileWindow) {
  PrinterFileWindowSchema.parse(window);
  if (window.expiresAt <= window.issuedAt || window.expiresAt - window.issuedAt > PRINTER_FILE_LIFETIME_SECONDS) throw new Error('Invalid printer file lifetime');
}
export function newPrinterFileWindow(now: Date): PrinterFileWindow {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return PrinterFileWindowSchema.parse({ version: 1, issuedAt, expiresAt: issuedAt + PRINTER_FILE_LIFETIME_SECONDS });
}
async function signingKey() {
  const secret = (process.env.BACKEND_API_TOKEN ?? '').trim();
  if (secret.length < 32) throw new Error('Printer file authorization unavailable');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${issuer}\u0000${secret}`)));
}
export async function createPrinterFileUrl(scopeInput: PrinterFileScope, window: PrinterFileWindow, backendUrl: string): Promise<string> {
  const scope = ScopeSchema.parse(scopeInput); validScope(scope); validWindow(window);
  if (backendUrl.replace(/\/$/, '') !== PRINTER_FILE_ORIGIN) throw new Error('Printer files require the canonical backend origin');
  const grant = await new SignJWT({ ...scope, purpose: audience, version: 1, origin: PRINTER_FILE_ORIGIN })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer(issuer).setAudience(audience)
    .setIssuedAt(window.issuedAt).setExpirationTime(window.expiresAt).sign(await signingKey());
  return `${PRINTER_FILE_ORIGIN}/api/pdf/${scope.key}?printerGrant=${grant}`;
}
export function parsePrinterFileUrl(value: string, key: string): { grant: string | null } | null {
  try {
    if (!printerArtifactKey(key) || value.length > 8192) return null;
    const url = new URL(value);
    if (url.origin !== PRINTER_FILE_ORIGIN || url.username || url.password || url.hash ||
        url.pathname !== `/api/pdf/${key}` || url.href !== value) return null;
    if (!url.search) return { grant: null }; // Historical unsigned snapshots only; never public authority.
    const grant = url.searchParams.get('printerGrant');
    if (!grant || grant.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(grant) ||
        url.search !== `?printerGrant=${grant}`) return null;
    return { grant };
  } catch { return null; }
}
/** Historical verification authenticates the immutable URL without granting a new download. */
export async function verifyPrinterFileUrl(value: string, key: string, options: { now?: Date; historical?: boolean; minimumRemainingSeconds?: number; scope?: PrinterFileScope } = {}): Promise<boolean> {
  const parsed = parsePrinterFileUrl(value, key);
  if (!parsed?.grant) return false;
  try {
    const { payload, protectedHeader } = await compactVerify(parsed.grant, await signingKey(), { algorithms: ['HS256'] });
    if (protectedHeader.typ !== 'JWT' || Object.keys(protectedHeader).some(key => !['alg', 'typ'].includes(key))) return false;
    const claims = ClaimsSchema.parse(JSON.parse(new TextDecoder().decode(payload)));
    validScope(claims); validWindow({ version: claims.version, issuedAt: claims.iat, expiresAt: claims.exp });
    if (claims.key !== key) return false;
    if (options.scope) {
      const expected = ScopeSchema.parse(options.scope);
      if (Object.keys(expected).some(key => claims[key as keyof PrinterFileScope] !== expected[key as keyof PrinterFileScope])) return false;
    }
    const now = (options.now ?? new Date()).getTime() / 1000;
    const margin = options.minimumRemainingSeconds ?? 0;
    if (!Number.isFinite(now) || !Number.isSafeInteger(margin) || margin < 0) return false;
    return options.historical === true || (claims.iat <= now && claims.exp > now && claims.exp - now >= margin);
  } catch { return false; }
}
export async function authorizePrinterFileRequest(request: Request, key: string): Promise<boolean> {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  return verifyPrinterFileUrl(request.url, key);
}
