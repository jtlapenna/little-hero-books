import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { verifyGelatoStatusRouting } from './gelato-status-routing-cases';

async function main() {
  const origin = 'https://admin.example.test', issuer = 'https://boundary-synthetic.cloudflareaccess.com';
  const machine = 'synthetic-boundary-machine-authority-long-value';
  const cron = 'synthetic-boundary-cron-'.padEnd(64, 'c'), webhook = 'synthetic-boundary-webhook-'.padEnd(64, 'w');
  Object.assign(process.env, { CF_ACCESS_ISSUER: issuer, CF_ACCESS_AUDIENCE: 'a'.repeat(64), ADMIN_ALLOWED_EMAILS: 'john@example.test,jeff@example.test', ADMIN_SITE_ORIGIN: origin,
    BACKEND_API_TOKEN: machine, CRON_SECRET: cron, GELATO_WEBHOOK_SECRET: webhook,
    GELATO_DRAFT_SUBMISSION_ENABLED: 'false', GELATO_CANCEL_ENABLED: 'false', GELATO_STATUS_RELAY_ENABLED: 'false',
    GELATO_STATUS_POLLING_ENABLED: 'false', GELATO_SCHEDULED_STATUS_ENABLED: 'false', GELATO_NOTIFICATIONS_ENABLED: 'false', SUPABASE_URL: 'https://boundary-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-key',
    CLOUDFLARE_ACCOUNT_ID: 'synthetic-boundary', R2_ACCESS_KEY_ID: 'synthetic-access', R2_SECRET_ACCESS_KEY: 'synthetic-secret',
    LULU_CLIENT_SECRET: 'synthetic-lulu-owner-secret', STRIPE_SECRET_KEY: 'synthetic-stripe-secret', STRIPE_WEBHOOK_SECRET: 'synthetic-stripe-hook' });
  const pair = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(pair.publicKey), alg: 'RS256', kid: 'boundary-key' };
  const token = await new SignJWT({ email: 'john@example.test', type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: 'boundary-key' }).setIssuer(issuer)
    .setAudience(['a'.repeat(64)]).setSubject('synthetic-operator').setIssuedAt().setExpirationTime('10m').sign(pair.privateKey);
  const human = { cookie: `CF_Authorization=${token}`, 'sec-fetch-site': 'same-origin', referer: `${origin}/orders` };
  const originalFetch = globalThis.fetch, originalLog = console.log, originalError = console.error, originalWarn = console.warn;
  let businessFetches = 0, auditWrites = 0, routeCalls = 0;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url);
    if (url.href === `${issuer}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
    if (url.hostname === 'little-hero-orders.synthetic-boundary.r2.cloudflarestorage.com') {
      assert.equal(req.method, 'GET'); businessFetches++; return new Response('synthetic-image-bytes', { headers: { 'Content-Type': 'image/png' } });
    }
    assert.equal(url.origin, process.env.SUPABASE_URL, 'all non-synthetic providers and messaging forbidden'); businessFetches++;
    const table = url.pathname.split('/').pop();
    assert.ok(['preview_tokens', 'idempotency_keys', 'lulu_webhook_log'].includes(table!));
    if (req.method === 'POST') { if (table === 'lulu_webhook_log') auditWrites++; return new Response(null, { status: 201 }); }
    assert.equal(req.method, 'GET'); return Response.json(null);
  };
  console.log = () => undefined; console.error = () => undefined; console.warn = () => undefined;
  try {
    const { middleware } = await import('../src/middleware');
    const { withBackendAccess, boundaryPolicy } = await import('../src/lib/access-boundary');
    const make = (path: string, method = 'GET', headers: Record<string, string> = {}, body?: string, host = origin) => new NextRequest(host + path, { method, headers, ...(body === undefined ? {} : { body }) });
    const run = (request: NextRequest, handler: (request: NextRequest) => Promise<Response> = async req => { routeCalls++; return Response.json({ id: req.headers.get('x-request-id'), internalHeader: req.headers.get('x-middleware-subrequest') }); }) => withBackendAccess(request, async clean => {
      const next = await middleware(new NextRequest(clean.clone()));
      if (next.headers.get('x-middleware-next') !== '1') return next;
      const headers = new Headers(clean.headers);
      for (const name of (next.headers.get('x-middleware-override-headers') ?? '').split(',')) if (name) {
        const value = next.headers.get(`x-middleware-request-${name}`); if (value === null) headers.delete(name); else headers.set(name, value);
      }
      const response = await handler(new NextRequest(clean, { headers }));
      response.headers.set('x-request-id', next.headers.get('x-request-id')!); return response;
    });
    const privileged = ['/', '/orders', '/api/orders', '/api/admin/send-amazon-message', '/api/admin/orders/X/delete', '/api/debug/env-vars', '/api/r2/signed-url', '/api/preview/generate-token', '/api/preview/unknown', '/api/manifests/book/orders/X/manifests/3-manifest.json', '/api/pdf/book/orders/X/book.pdf', '/_next/image?url=/private-sentinel.png', '/_next/data/wrong-build/orders.json', '/_next/data/current-build/orders.json', '/_next/new-unknown', '/public-admin', '/api/new-privileged-route'];
    for (const path of privileged) for (const host of [origin, 'https://direct-deployment.pages.dev']) {
      const before = businessFetches, calls = routeCalls;
      const res = await run(make(path, 'GET', { origin, host: 'admin.example.test', 'x-admin-email': 'john@example.test', 'x-forwarded-host': 'admin.example.test', 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware', 'x-request-id': 'attacker-id' }, undefined, host));
      assert.equal(res.status, 401, path); assert.equal(businessFetches, before); assert.equal(routeCalls, calls); assert.notEqual(res.headers.get('x-request-id'), 'attacker-id'); assert.match(res.headers.get('cache-control')!, /no-store/);
    }
    for (const headers of [ { ...human, 'sec-fetch-site': 'cross-site', referer: 'https://evil.example/' }, { cookie: human.cookie }, { ...human, 'sec-fetch-site': 'same-site' }, { ...human, referer: 'invalid-url' }, { ...human, origin: 'https://evil.example' } ]) {
      for (const method of ['GET', 'HEAD']) { const calls = routeCalls, before = businessFetches; assert.equal((await run(make('/api/admin/send-amazon-message', method, headers))).status, 403); assert.equal(routeCalls, calls); assert.equal(businessFetches, before); }
    }
    assert.equal((await run(make('/api/orders', 'GET', { ...human, cookie: 'CF_Authorization=bad.bad.bad' }))).status, 401);
    const read = await run(make('/api/orders', 'GET', { ...human, 'x-request-id': 'attacker', 'x-middleware-subrequest': 'bypass' })); assert.equal(read.status, 200);
    const data = await read.json(); assert.equal(data.id, read.headers.get('x-request-id')); assert.equal(data.internalHeader, null);
    assert.equal((await run(make('/api/orders', 'POST', human, '{}'))).status, 403);
    assert.equal((await run(make('/api/orders', 'POST', { ...human, origin }, '{}'))).status, 200);
    assert.equal((await run(make('/api/orders', 'POST', { authorization: `Bearer ${machine}` }, '{}'))).status, 200);
    for (const path of ['/api/cron/router', '/api/cron/amazon-orders', '/api/cron/health-monitor', '/api/cron/book-config-integrity']) {
      assert.equal((await run(make(path, 'GET', { authorization: `Bearer ${machine}` }))).status, 401);
      assert.equal((await run(make(path, 'GET', { authorization: `Bearer ${cron}` }))).status, 200);
    }
    process.env.CRON_SECRET = ''; assert.equal((await run(make('/api/cron/router', 'GET', { authorization: 'Bearer undefined' }))).status, 401); process.env.CRON_SECRET = cron;
    const { POST: pollGelato } = await import('../src/app/api/cron/gelato-status/route');
    const { POST: hookGelato } = await import('../src/app/api/webhooks/gelato/route');
    const beforeGelato = businessFetches;
    await verifyGelatoStatusRouting((path, init) => run(make(path, init.method, init.headers, init.body),
      req => new URL(req.url).pathname === '/api/cron/gelato-status' ? pollGelato(req) : hookGelato(req)), { backend: machine, cron, webhook });
    assert.equal(businessFetches, beforeGelato, 'OFF and rejected Gelato requests must not touch database/provider/storage/messages');
    process.env.CRON_SECRET = '';
    assert.equal((await run(make('/api/cron/gelato-status', 'POST', { authorization: `Bearer ${cron}` }, '{}'), pollGelato)).status, 401);
    process.env.CRON_SECRET = cron;
    delete process.env.GELATO_WEBHOOK_SECRET;
    assert.equal((await run(make('/api/webhooks/gelato', 'POST', { 'x-lhl-gelato-webhook-token': webhook }, '{}'), hookGelato)).status, 401);
    process.env.GELATO_WEBHOOK_SECRET = webhook;
    assert.equal(businessFetches, beforeGelato);
    const beforePreflight = businessFetches, calls = routeCalls;
    const preflight = await run(make('/api/unknown', 'OPTIONS')); assert.equal(preflight.status, 204); assert.equal(routeCalls, calls); assert.equal(businessFetches, beforePreflight); assert.match(preflight.headers.get('access-control-allow-headers')!, /X-Preview-Token/);
    for (const path of ['/api/checkout/create', '/api/preview/generate', '/api/preview/check', '/api/preview/validate-token', '/api/preview/contact', '/api/preview/X/approve', '/api/preview/X/reject', '/api/preview/X/files', '/api/webhooks/stripe', '/api/webhooks/lulu/status', '/api/webhooks/gelato']) { assert.equal(boundaryPolicy(path, 'POST'), 'public-route'); assert.equal(boundaryPolicy(path, 'DELETE'), 'privileged'); assert.equal(boundaryPolicy(path + '/extra', 'POST'), 'privileged'); }
    const { assertPublicRouteInventory, readAppRouteInventory, routePatternsIntersect } = await import('./security-public-routes.mjs');
    const inventory = readAppRouteInventory('src/app'); assertPublicRouteInventory(inventory);
    for (const source of ['api/preview/[...path]/route.ts', 'api/preview/[[...path]]/route.ts', '(regrouped)/api/preview/[orderId]/status/route.ts', 'api/(regrouped)/preview/[orderId]/status/route.ts', 'api/assets/book/[...path]/route.ts', 'api/assets/internal/page.tsx', 'api/preview/admin/status/route.js', 'api/webhooks/[...path]/route.ts', '(regrouped)/api/webhooks/gelato/route.ts']) {
      assert.throws(() => assertPublicRouteInventory([...inventory, { source, methods: ['GET'] }]), /Unreviewed/);
    }
    assert.throws(() => assertPublicRouteInventory(inventory.filter(row => row.source !== 'api/checkout/create/route.ts')), /missing/);
    assert.equal(routePatternsIntersect('api/preview/[...path]/route.ts', 'api/preview/[orderId]/status'), true);
    assert.equal(routePatternsIntersect('api/privileged/[id]/route.ts', 'api/preview/[orderId]/status'), false);
    const diskFixture = await mkdtemp(join(tmpdir(), 'lhl-route-inventory-'));
    try {
      for (const path of ['api/assets/internal/page.tsx', 'api/preview/admin/status/route.js', '(group)/api/assets/icon.tsx']) {
        await mkdir(join(diskFixture, path, '..'), { recursive: true });
        await writeFile(join(diskFixture, path), path.endsWith('route.js') ? 'export function GET(){}' : 'export default function Entry(){}');
      }
      const owners = readAppRouteInventory(diskFixture); assert.equal(owners.length, 3);
      for (const owner of owners) assert.throws(() => assertPublicRouteInventory([...inventory, owner]), /Unreviewed/);
    } finally { await rm(diskFixture, { recursive: true, force: true }); }

    const { createPreviewImageGrant } = await import('../src/lib/preview-file-grants');
    const assetsRoute = await import('../src/app/api/assets/[...path]/route');
    const imageKey = 'book-synthetic/orders/ORDER-SYNTHETIC/preview-images/p01.png';
    const signedImage = await createPreviewImageGrant(imageKey, new Date(Date.now() + 120000).toISOString());
    for (const method of ['GET', 'HEAD'] as const) {
      const path = `/api/assets/${imageKey}?previewGrant=${encodeURIComponent(signedImage.grant)}`;
      const response = await run(make(path, method), req => assetsRoute[method](req, { params: Promise.resolve({ path: imageKey.split('/') }) })); assert.equal(response.status, 200);
      const before = businessFetches;
      assert.equal((await run(make(path.replace('p01.png', 'p02.png'), method))).status, 401);
      assert.equal((await run(make(path + '&previewGrant=duplicate', method))).status, 401); assert.equal(businessFetches, before);
    }
    const { POST: checkout } = await import('../src/app/api/checkout/create/route'); assert.equal((await run(make('/api/checkout/create', 'POST', {}, '{}'), checkout)).status, 400);
    const { POST: generate } = await import('../src/app/api/preview/generate/route'); assert.equal((await run(make('/api/preview/generate', 'POST', {}, '{}'), generate)).status, 400);
    const { POST: validate } = await import('../src/app/api/preview/validate-token/route'); assert.equal((await run(make('/api/preview/validate-token', 'POST', {}, JSON.stringify({ token: 'synthetic-missing-preview-token' })), validate)).status, 401);
    const { GET: summary } = await import('../src/app/api/admin/cleanup-stuck-orders/route'); assert.equal((await run(make('/api/admin/cleanup-stuck-orders', 'GET', human), summary)).status, 200);
    const { POST: automation } = await import('../src/app/api/internal/w4/engineering-automation/route'); assert.equal((await run(make('/api/internal/w4/engineering-automation', 'POST', { authorization: `Bearer ${machine}` }, '{}'), automation)).status, 400);
    const { POST: stripeHook } = await import('../src/app/api/webhooks/stripe/route'); const beforeStripe = businessFetches;
    assert.equal((await run(make('/api/webhooks/stripe', 'POST', {}, '{}'), stripeHook)).status, 401); assert.equal(businessFetches, beforeStripe);
    const stripeBody = JSON.stringify({ id: 'evt_synthetic_boundary', type: 'synthetic.ignored', data: { object: {} } });
    const stripeSignature = Stripe.webhooks.generateTestHeaderString({ payload: stripeBody, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    assert.equal((await run(make('/api/webhooks/stripe', 'POST', { 'stripe-signature': stripeSignature }, stripeBody), stripeHook)).status, 200);
    const { POST: luluHook } = await import('../src/app/api/webhooks/lulu/status/route');
    const luluBody = ' { "topic": "PRINT_JOB_STATUS_CHANGED", "data": { "note": "Snowman ☃ and spaces" } } ';
    const signature = createHmac('sha256', process.env.LULU_CLIENT_SECRET!).update(luluBody, 'utf8').digest('hex');
    for (const [body, value] of [[luluBody, ''], [luluBody, signature + ',' + signature], [luluBody + ' ', signature], [luluBody, 'bad']]) { const before = businessFetches; assert.equal((await run(make('/api/webhooks/lulu/status', 'POST', { 'lulu-hmac-sha256': value }, body), luluHook)).status, 401); assert.equal(businessFetches, before); }
    const beforeAudit = auditWrites; assert.equal((await run(make('/api/webhooks/lulu/status', 'POST', { 'lulu-hmac-sha256': signature }, luluBody), luluHook)).status, 200); assert.equal(auditWrites, beforeAudit + 1);
    const malformed = '{signed invalid json'; const malformedSignature = createHmac('sha256', process.env.LULU_CLIENT_SECRET!).update(malformed).digest('hex'); const beforeBadJson = businessFetches;
    assert.equal((await run(make('/api/webhooks/lulu/status', 'POST', { 'lulu-hmac-sha256': malformedSignature }, malformed), luluHook)).status, 400); assert.equal(businessFetches, beforeBadJson);
    process.env.LULU_CLIENT_SECRET = ''; delete process.env.LULU_API_SECRET; assert.equal((await run(make('/api/webhooks/lulu/status', 'POST', { 'lulu-hmac-sha256': signature }, luluBody), luluHook)).status, 401);
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; console.error = originalError; console.warn = originalWarn; }
  console.log('Default-deny actual middleware + routes: privileged/direct-host/unknown/data/image denial, CSRF GET/HEAD, exact public contracts, cron/machine, signed Stripe/Lulu, request IDs and no-side-effect rejection passed; zero live traffic');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
