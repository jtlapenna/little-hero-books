import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT, type JWTPayload } from 'jose';
import { NextRequest } from 'next/server';
import { requireAdminAuth } from '../src/lib/admin-auth';

async function main() {
  const issuer = 'https://lhl-synthetic.cloudflareaccess.com';
  const audience = 'a'.repeat(64);
  const origin = 'https://admin.example.test';
  const machine = 'synthetic-local-machine-authority';
  const env = { ...process.env };
  const originalFetch = globalThis.fetch;
  const keys = await generateKeyPair('RS256', { extractable: true });
  const otherKeys = await generateKeyPair('RS256');
  const publicKey = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  let dbCalls = 0;
  let keyCalls = 0;
  let actor = '';
  let releaseKeys: (() => void) | undefined;
  let holdKeys = false;
  process.env.CF_ACCESS_ISSUER = issuer;
  process.env.CF_ACCESS_AUDIENCE = audience;
  process.env.ADMIN_ALLOWED_EMAILS = 'john@example.test, jeff@example.test';
  process.env.ADMIN_SITE_ORIGIN = origin;
  process.env.BACKEND_API_TOKEN = machine;
  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-admin-auth-database';
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${issuer}/cdn-cgi/access/certs`) {
      keyCalls++;
      if (holdKeys) await new Promise<void>((resolve) => { releaseKeys = resolve; });
      return Response.json({ keys: [publicKey] });
    }
    assert.ok(url.startsWith('https://db.example.test/rest/v1/workflow_alerts?'), 'only synthetic alert transport allowed');
    dbCalls++;
    actor = JSON.parse(String(init?.body)).acknowledged_by;
    return Response.json({ id: 1, acknowledged_by: actor });
  };
  async function sign(changes: JWTPayload = {}, options: { otherKey?: boolean; algorithm?: string; omit?: string[] } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = { iss: issuer, aud: [audience], sub: 'synthetic-user', email: 'john@example.test', type: 'app', iat: now, nbf: now - 1, exp: now + 600, ...changes };
    for (const key of options.omit ?? []) delete payload[key];
    const alg = options.algorithm ?? 'RS256';
    return new SignJWT(payload).setProtectedHeader({ alg, kid: 'test-key' })
      .sign(alg === 'HS256' ? new TextEncoder().encode('synthetic-hmac-key-at-least-thirty-two-bytes') : options.otherKey ? otherKeys.privateKey : keys.privateKey);
  }
  const req = (headers: Record<string, string | undefined> = {}, method = 'GET', path = '/api/admin/w4-production?limit=0') =>
    new NextRequest(`${origin}${path}`, { method, headers: new Headers(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) });
  const deny = async (request: NextRequest, status = 401) => {
    const result = await requireAdminAuth(request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, status);
  };
  try {
    // No request metadata or unsigned operator header grants identity.
    for (const headers of [{}, { origin, referer: `${origin}/`, host: 'admin.example.test', 'x-forwarded-host': 'admin.example.test', 'x-admin-email': 'john@example.test' }]) await deny(req(headers));
    const token = await sign();
    const jwtHeader = { 'cf-access-jwt-assertion': token };
    const { GET: inspect } = await import('../src/app/api/admin/w4-production/route');
    // A real route cannot continue while its verifier is unresolved.
    holdKeys = true;
    let settled = false;
    const pending = inspect(req(jwtHeader)).then((value) => { settled = true; return value; });
    for (let i = 0; i < 100 && !releaseKeys; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(releaseKeys, 'actual route must reach JWKS verification');
    assert.equal(settled, false); assert.equal(dbCalls, 0);
    releaseKeys(); holdKeys = false;
    assert.equal((await pending).status, 500, 'invalid query should run only after authentication');

    for (const email of ['john@example.test', 'jeff@example.test']) {
      const result = await requireAdminAuth(req({ 'cf-access-jwt-assertion': await sign({ email }) }));
      assert.deepEqual(result, { ok: true, mode: 'access', actor: email });
    }
    assert.equal((await requireAdminAuth(req({ cookie: `CF_Authorization=${token}` }))).ok, true);
    assert.equal((await requireAdminAuth(req({ ...jwtHeader, cookie: `CF_Authorization=${token}` }))).ok, true);
    for (const headers of [
      { cookie: 'CF_Authorization=' },
      { cookie: `CF_Authorization=${token}; CF_Authorization=${token}` },
      { ...jwtHeader, cookie: 'CF_Authorization=' },
      { 'cf-access-jwt-assertion': 'malformed', cookie: `CF_Authorization=${token}` },
      { ...jwtHeader, cookie: `CF_Authorization=${await sign({ sub: 'another-user' })}` },
      { 'cf-access-jwt-assertion': '' },
      { 'cf-access-jwt-assertion': 'a.b.c' },
    ]) await deny(req(headers));
    for (const payload of [
      { email: 'stranger@example.test' }, { email: 123 }, { iss: 'https://attacker.example.test' },
      { aud: ['b'.repeat(64)] }, { aud: [audience, 'b'.repeat(64)] }, { aud: 42 },
      { sub: '' }, { type: 'org' }, { exp: Math.floor(Date.now() / 1000) - 1 },
      { nbf: Math.floor(Date.now() / 1000) + 600 }, { iat: Math.floor(Date.now() / 1000) + 600 },
    ]) await deny(req({ 'cf-access-jwt-assertion': await sign(payload as JWTPayload) }));
    for (const claim of ['exp', 'iat', 'sub', 'email', 'type']) await deny(req({ 'cf-access-jwt-assertion': await sign({}, { omit: [claim] }) }));
    await deny(req({ 'cf-access-jwt-assertion': await sign({}, { otherKey: true }) }));
    await deny(req({ 'cf-access-jwt-assertion': await sign({}, { algorithm: 'HS256' }) }));
    assert.equal((await requireAdminAuth(req({ 'cf-access-jwt-assertion': await sign({ aud: audience }) }))).ok, true);
    for (const badOrigin of ['', 'null', 'https://evil.example.test', 'http://admin.example.test', `${origin}:8443`]) {
      await deny(req({ ...jwtHeader, ...(badOrigin ? { origin: badOrigin } : {}), host: 'admin.example.test', 'x-forwarded-host': 'admin.example.test', referer: `${origin}/` }, 'POST'), 403);
    }
    await deny(req({ ...jwtHeader, origin, 'sec-fetch-site': 'cross-site' }, 'POST'), 403);
    assert.equal((await requireAdminAuth(req({ ...jwtHeader, origin }, 'POST'))).ok, true);

    for (const issuerValue of ['', 'http://lhl-synthetic.cloudflareaccess.com', `${issuer}:8443`, `${issuer}/path`, `${issuer}?x=y`, `${issuer}#x`, 'https://user:pass@lhl-synthetic.cloudflareaccess.com', 'https://lhl-synthetic.cloudflareaccess.com.attacker.test']) {
      process.env.CF_ACCESS_ISSUER = issuerValue;
      await deny(req(jwtHeader));
      assert.deepEqual(await requireAdminAuth(req({ authorization: `Bearer ${machine}`, cookie: 'CF_Authorization=bad' }, 'POST')), { ok: true, mode: 'token', actor: 'backend-automation' });
    }
    process.env.CF_ACCESS_ISSUER = issuer;
    for (const [name, value] of [['CF_ACCESS_AUDIENCE', 'wrong'], ['ADMIN_ALLOWED_EMAILS', ''], ['ADMIN_ALLOWED_EMAILS', 'john@example.test,'], ['ADMIN_SITE_ORIGIN', `${origin}/path`], ['ADMIN_SITE_ORIGIN', 'http://admin.example.test']]) {
      const previous = process.env[name]; process.env[name] = value; await deny(req(jwtHeader)); process.env[name] = previous;
    }
    await deny(req({ authorization: 'Bearer wrong', ...jwtHeader }));
    delete process.env.BACKEND_API_TOKEN;
    await deny(req({ authorization: `Bearer ${machine}` }));
    process.env.BACKEND_API_TOKEN = '   ';
    await deny(req({ authorization: 'Bearer \u00a0' }));
    const emptyMachineRoute = await inspect(req({ authorization: 'Bearer \u00a0' }));
    assert.equal(emptyMachineRoute.status, 401, 'whitespace-only configured secrets must not grant route access');
    process.env.BACKEND_API_TOKEN = machine;

    // Inventory direct and delegated handlers; denied auth must not touch business transport.
    const delegatedRoutes = new Set([join(process.cwd(), 'src/app/api/admin/w3-calibration/route.ts')]);
    const routes = new Set<string>();
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === 'route.ts' && (delegatedRoutes.has(path) || readFileSync(path, 'utf8').includes('requireAdminAuth(request)'))) routes.add(path);
      }
    }
    walk(join(process.cwd(), 'src/app/api'));
    for (const path of delegatedRoutes) assert.ok(routes.has(path), `Delegated protected route must be inventoried: ${path}`);
    assert.equal(routes.size, 18);
    let handlers = 0;
    for (const path of routes) {
      const module = await import(path);
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (typeof module[method] !== 'function') continue;
        const before: number = dbCalls;
        const response = await module[method](req({ origin, 'x-admin-email': 'forged@example.test' }, method), { params: Promise.resolve({ orderId: 'synthetic', jobId: '1', alertId: '1' }) });
        assert.equal(response.status, 401, `${path}:${method}`);
        assert.equal(dbCalls, before); handlers++;
      }
    }
    assert.equal(handlers, 26);
    const { POST: acknowledge } = await import('../src/app/api/admin/workflow-alerts/[alertId]/acknowledge/route');
    for (const [headers, expected] of [[{ ...jwtHeader, origin }, 'john@example.test'], [{ authorization: `Bearer ${machine}` }, 'backend-automation']] as const) {
      const response = await acknowledge(req({ ...headers, 'x-admin-email': 'forged@example.test', 'x-admin-user': 'another-forged-actor' }, 'POST'), { params: Promise.resolve({ alertId: '1' }) });
      assert.equal(response.status, 200); assert.equal(actor, expected);
    }
    assert.equal(keyCalls, 1, 'verified issuer JWKS should be cached across requests');
    console.log('Admin identity: signed claims, CSRF, machine compatibility, 26 actual handler denials, async gating and verified actor attribution passed');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
