import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as WorkerResponse } from 'miniflare';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

async function main() {
  const issuer = 'https://worker-synthetic.cloudflareaccess.com';
  const audience = 'a'.repeat(64);
  const origin = 'https://admin.example.test';
  const pair = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'worker-key', alg: 'RS256' };
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ email: 'john@example.test', type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'worker-key' }).setIssuer(issuer)
    .setAudience([audience]).setSubject('synthetic-user').setIssuedAt(now)
    .setExpirationTime(now + 600).sign(pair.privateKey);
  const settings = await readFile('wrangler.toml', 'utf8');
  const date = settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags = [...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(date && flags.length);
  const bindings = {
    CF_ACCESS_ISSUER: issuer, CF_ACCESS_AUDIENCE: audience,
    ADMIN_ALLOWED_EMAILS: 'john@example.test,jeff@example.test', ADMIN_SITE_ORIGIN: origin,
    BACKEND_API_TOKEN: 'synthetic-worker-machine-token',
  };
  const entry = `import { requireAdminAuth } from ${JSON.stringify(resolve('src/lib/admin-auth.ts'))};
    export default { async fetch(request) {
      const result = await requireAdminAuth(request);
      return result.ok ? Response.json({ mode: result.mode, actor: result.actor }) : result.response;
    }};`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'],
    external: ['node:*'], logLevel: 'silent',
  });
  let keyRequests = 0;
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: date, compatibilityFlags: flags, bindings,
    outboundService: async (request) => {
      assert.equal(request.url, `${issuer}/cdn-cgi/access/certs`, 'only synthetic JWKS transport is allowed');
      keyRequests++;
      return new WorkerResponse(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
    },
  }));
  try {
    assert.equal((await worker.dispatchFetch(origin, { headers: { origin, referer: origin, 'x-admin-email': 'john@example.test' } })).status, 401);
    assert.equal((await worker.dispatchFetch(origin, { headers: { 'cf-access-jwt-assertion': token } })).status, 200);
    const cookie = await worker.dispatchFetch(origin, { headers: { cookie: `CF_Authorization=${token}` } });
    assert.deepEqual(await cookie.json(), { mode: 'access', actor: 'john@example.test' });
    assert.equal((await worker.dispatchFetch(origin, { method: 'POST', headers: { 'cf-access-jwt-assertion': token } })).status, 403);
    assert.equal((await worker.dispatchFetch(origin, { method: 'POST', headers: { 'cf-access-jwt-assertion': token, origin } })).status, 200);
    const machine = await worker.dispatchFetch(origin, { method: 'POST', headers: { authorization: `Bearer ${bindings.BACKEND_API_TOKEN}` } });
    assert.deepEqual(await machine.json(), { mode: 'token', actor: 'backend-automation' });
    assert.equal((await worker.dispatchFetch(origin, { method: 'POST', headers: { authorization: 'Bearer retired-synthetic-token' } })).status, 401);
    assert.equal(keyRequests, 1);
    console.log('Admin identity production-config Worker: real jose JWT/JWKS verification, cached keys, cookie, CSRF and machine contract passed; zero live traffic');
  } finally {
    await worker.dispose();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
