import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authorizeBackendBoundary } from '../src/lib/access-boundary';
import { adminReturnPath, ADMIN_SIGN_IN_HEADER } from '../src/lib/admin-login-target';
import { GET as login } from '../src/app/%5F_access_setup/route';
import { GET as session } from '../src/app/api/admin/session/route';

async function main() {
  const require = createRequire(import.meta.url);
  const { collectAppFiles, createPagesMapping } = require('next/dist/build/entries');
  const { createValidFileMatcher } = require('next/dist/server/lib/find-page-file');
  const appDir = resolve('src/app');
  const { appPaths } = await collectAppFiles(appDir, createValidFileMatcher(['tsx', 'ts', 'jsx', 'js'], appDir));
  assert.ok(appPaths.some((path: string) => path.endsWith('%5F_access_setup/route.ts')), 'Next must discover the escaped login bridge');
  const origin = 'https://admin.littleherolabs.com';
  const issuer = 'https://login-synthetic.cloudflareaccess.com';
  const audience = 'c'.repeat(64);
  Object.assign(process.env, { ADMIN_SITE_ORIGIN: origin, CF_ACCESS_ISSUER: issuer,
    CF_ACCESS_AUDIENCE: audience, ADMIN_ALLOWED_EMAILS: 'john@example.test', BACKEND_API_TOKEN: 'synthetic-machine-login' });
  const keys = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'login-test', alg: 'RS256' };
  globalThis.fetch = async (input) => {
    assert.equal(String(input instanceof Request ? input.url : input), `${issuer}/cdn-cgi/access/certs`);
    return Response.json({ keys: [jwk] });
  };
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ iss: issuer, aud: audience, sub: 'synthetic', email: 'john@example.test', type: 'app', iat: now, exp: now + 600 })
    .setProtectedHeader({ alg: 'RS256', kid: 'login-test' }).sign(keys.privateKey);
  const nav = { accept: 'text/html', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
  const human = { cookie: `CF_Authorization=${token}` };
  const req = (path: string, headers = {}, host = origin, method = 'GET') => new Request(`${host}${path}`, { headers, method });
  for (const path of ['/', '/orders', '/orders/synthetic_123', '/admin/workflow-jobs']) {
    const response = await authorizeBackendBoundary(req(path, nav));
    assert.equal(response?.status, 303);
    const redirect = new URL(response!.headers.get('location')!);
    assert.equal(redirect.origin, origin); assert.equal(redirect.pathname, '/__access_setup');
    assert.equal(redirect.searchParams.get('returnTo'), path);
    const bridge = req(redirect.pathname + redirect.search, { ...nav, ...human });
    assert.equal(await authorizeBackendBoundary(bridge), null);
    const landed = await login(bridge);
    assert.equal(landed.status, 303); assert.equal(landed.headers.get('location'), `${origin}${path}`);
    assert.match(landed.headers.get('cache-control')!, /no-store/);
  }
  for (const bad of ['//evil.test', 'https://evil.test', '/api/orders', '/__access_setup', '/unknown', '/orders/../admin', '/%2f%2fevil.test', '/orders?x=1', '/orders#x', '/orders/\\evil', '/orders/one/two']) {
    assert.equal(adminReturnPath(bad), null);
    assert.equal((await login(req(`/__access_setup?returnTo=${encodeURIComponent(bad)}`, human))).status, 400);
  }
  assert.equal((await login(req('/__access_setup?returnTo=%2F&returnTo=%2Forders', human))).status, 400);
  assert.equal((await login(req('/__access_setup?extra=1', human))).status, 400);
  assert.equal((await login(req('/__access_setup', { authorization: 'Bearer synthetic-machine-login' }))).status, 403);
  for (const request of [req('/api/orders', nav), req('/orders', nav, 'https://direct.pages.dev'), req('/unknown', nav), req('/orders', { ...nav, 'sec-fetch-dest': 'empty' }), req('/orders', { accept: '*/*' }), req('/__access_setup', nav)]) {
    const denied = await authorizeBackendBoundary(request);
    assert.equal(denied?.status, 401); assert.equal(denied?.headers.has('location'), false);
  }
  const missing = await authorizeBackendBoundary(req('/api/orders'));
  assert.equal(missing?.headers.get(ADMIN_SIGN_IN_HEADER), 'required');
  assert.equal((await authorizeBackendBoundary(req('/api/orders', { authorization: 'Bearer wrong' })))?.headers.has(ADMIN_SIGN_IN_HEADER), false);
  assert.equal((await authorizeBackendBoundary(req('/api/pdf/orders/synthetic.pdf?printerGrant=bad')))?.headers.has(ADMIN_SIGN_IN_HEADER), false);
  const read = req('/api/admin/session', { ...human, 'sec-fetch-site': 'same-origin', referer: `${origin}/orders` });
  assert.equal(await authorizeBackendBoundary(read), null);
  assert.deepEqual(await (await session(read)).json(), { authenticated: true });
  assert.equal((await session(req('/api/admin/session', human))).status, 403);
  process.env.CF_ACCESS_AUDIENCE = '';
  assert.equal((await authorizeBackendBoundary(req('/__access_setup', { ...nav, ...human })))?.status, 401);
  assert.equal((await authorizeBackendBoundary(req('/api/orders', { authorization: 'Bearer synthetic-machine-login' }))), null);
  process.env.ADMIN_SITE_ORIGIN = 'https://direct.pages.dev';
  assert.equal((await authorizeBackendBoundary(req('/orders', nav, 'https://direct.pages.dev')))?.status, 401);
  console.log('Actual boundary/login/session path: human redirect, finite denial, safe return paths, CSRF, direct-host and machine isolation passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
