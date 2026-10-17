import { authorizePrinterFileRequest } from './printer-file-grants';
import { requireAdminAuth } from './admin-auth';
import { verifyPreviewImageGrant } from './preview-file-grants';
import { isOrderAssetKey } from './order-paths';
import { ADMIN_LOGIN_PATH, ADMIN_SIGN_IN_HEADER, adminReturnPath, adminLoginHref, canonicalAdminOrigin } from './admin-login-target';

const publicStatic = new Set(['/favicon.ico', '/window.svg', '/globe.svg', '/next.svg', '/vercel.svg', '/file.svg', '/pdf.worker.min.mjs']);
const cronPaths = new Set(['/api/cron/amazon-orders', '/api/cron/book-config-integrity', '/api/cron/health-monitor', '/api/cron/router']);
const publicMethods = new Map([
  ['/api/checkout/create', ['POST']], ['/api/preview/check', ['GET', 'POST']],
  ['/api/preview/generate', ['POST']], ['/api/preview/validate-token', ['POST']],
  ['/api/preview/contact', ['POST']], ['/api/webhooks/stripe', ['POST']], ['/api/webhooks/lulu/status', ['POST']],
]);

export type BoundaryPolicy = 'static' | 'public-route' | 'asset' | 'cron' | 'privileged';
export function boundaryPolicy(path: string, method: string): BoundaryPolicy {
  if (['GET', 'HEAD'].includes(method) && (publicStatic.has(path) || path.startsWith('/_next/static/'))) return 'static';
  if (publicMethods.get(path)?.includes(method)) return 'public-route';
  if (method === 'POST' && /^\/api\/preview\/[^/]+\/(?:approve|reject|files)$/.test(path)) return 'public-route';
  if (method === 'GET' && /^\/api\/preview\/[^/]+\/status$/.test(path)) return 'public-route';
  if (['GET', 'HEAD'].includes(method) && path.startsWith('/api/assets/') && path.length > '/api/assets/'.length) return 'asset';
  if (method === 'GET' && cronPaths.has(path)) return 'cron';
  return 'privileged';
}

function denied(status = 401): Response {
  return Response.json({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

/** Null means continue to the route, which retains its own customer/provider checks. */
export async function authorizeBackendBoundary(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Preview-Token, Idempotency-Key, Stripe-Signature, Lulu-HMAC-SHA256',
    'Cache-Control': 'no-store',
  } });
  if (url.pathname.startsWith('/api/pdf/') && url.searchParams.has('printerGrant')) {
    let key: string;
    try { key = url.pathname.slice('/api/pdf/'.length).split('/').map(decodeURIComponent).join('/'); } catch { return denied(); }
    return await authorizePrinterFileRequest(request, key) ? null : denied();
  }
  const policy = boundaryPolicy(url.pathname, request.method);
  if (policy === 'static' || policy === 'public-route') return null;
  if (policy === 'cron') {
    const expected = (process.env.CRON_SECRET ?? '').trim();
    const header = request.headers.get('authorization');
    const provided = header?.match(/^Bearer (.+)$/i)?.[1].trim();
    return expected && provided && provided === expected ? null : denied();
  }
  if (policy === 'asset') {
    let key: string;
    try { key = url.pathname.slice('/api/assets/'.length).split('/').map(decodeURIComponent).join('/'); }
    catch { return denied(); }
    if (!isOrderAssetKey(key)) return null; // Explicit public-assets compatibility boundary.
    const grants = url.searchParams.getAll('previewGrant');
    if (grants.length) return grants.length === 1 && await verifyPreviewImageGrant(grants[0], key) ? null : denied();
  }
  const auth = await requireAdminAuth(request, { protectReadActions: url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/') || url.pathname.startsWith('/cdn-cgi/image/') });
  if (auth.ok) return null;
  if (auth.response.status !== 401 || request.headers.has('authorization')) return auth.response;
  const headers = new Headers(auth.response.headers);
  headers.set(ADMIN_SIGN_IN_HEADER, 'required');
  const htmlNavigation = request.method === 'GET' && request.headers.get('accept')?.includes('text/html') &&
    (!request.headers.has('sec-fetch-mode') || request.headers.get('sec-fetch-mode') === 'navigate') &&
    (!request.headers.has('sec-fetch-dest') || request.headers.get('sec-fetch-dest') === 'document');
  const origin = canonicalAdminOrigin();
  if (htmlNavigation && origin === url.origin && adminReturnPath(url.pathname)) {
    headers.set('Location', new URL(adminLoginHref(url.pathname), origin).href);
    return new Response(null, { status: 303, headers });
  }
  if (htmlNavigation && url.pathname === ADMIN_LOGIN_PATH) {
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response('<!doctype html><html lang="en"><title>Sign-in unavailable</title><main><h1>Sign-in could not be verified</h1><p>Contact the site administrator if signing in again does not resolve this.</p><a href="/">Return to admin</a></main></html>', { status: 401, headers });
  }
  return new Response(auth.response.body, { status: 401, headers });
}

export function cleanBoundaryHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  for (const name of [...headers.keys()]) {
    if (/^x-(?:middleware-|invoke-|nextjs-|opennext-)/i.test(name) || ['x-matched-path', 'x-now-route-matches', 'x-request-id'].includes(name.toLowerCase())) headers.delete(name);
  }
  return headers;
}

export function newBoundaryRequestId(): string { return `req_${crypto.randomUUID()}`; }

/** Runs before OpenNext normalization, image shortcuts or ASSETS, inside its runtime context. */
export async function withBackendAccess(request: Request, next: (request: Request) => Promise<Response>): Promise<Response> {
  const requestId = newBoundaryRequestId();
  const headers = cleanBoundaryHeaders(request.headers);
  headers.set('x-request-id', requestId);
  const forwarded = new Request(request, { headers });
  const rejection = await authorizeBackendBoundary(forwarded);
  const response = rejection ?? await next(forwarded);
  const responseHeaders = new Headers(response.headers);
  // The normal Next path generates its own correlation ID; shortcuts use this entrypoint ID.
  responseHeaders.set('x-request-id', responseHeaders.get('x-request-id') ?? requestId);
  if (boundaryPolicy(new URL(request.url).pathname, request.method) !== 'static') {
    responseHeaders.set('Cache-Control', 'private, no-store');
    responseHeaders.set('CDN-Cache-Control', 'no-store');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}
