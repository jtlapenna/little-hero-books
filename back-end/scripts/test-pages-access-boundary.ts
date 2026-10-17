import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, copyFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { dirname } from 'node:path';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

async function main() {
  // Actual installed OpenNext worker, init, image and skew templates; only Next env/routing/business transports are fixtures.
  const templates = resolve('node_modules/@opennextjs/cloudflare/dist/cli/templates');
  const { emitPagesAccessBoundary, patchWorkerForAccessBoundary, pagesRoutes } = await import('./enforce-pages-access-boundary.mjs');
  assert.throws(() => patchWorkerForAccessBoundary('unsupported template'), /Unsupported/);
  const folder = await mkdtemp(join(tmpdir(), 'lhl-pages-access-'));
  let assets = 0, adapter = 0;
  const issuer = 'https://pages-synthetic.cloudflareaccess.com', origin = 'https://admin.example.test', audience = 'a'.repeat(64);
  const pair = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'pages-key', alg: 'RS256' };
  const jwt = await new SignJWT({ email: 'john@example.test', type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: 'pages-key' }).setIssuer(issuer).setAudience([audience]).setSubject('synthetic').setIssuedAt().setExpirationTime('10m').sign(pair.privateKey);
  const settings = await readFile('wrangler.toml', 'utf8');
  const date = settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags = [...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(date && flags.length);
  try {
    for (const path of ['cloudflare', 'middleware', 'server-functions/default', '.build/durable-objects']) await mkdir(join(folder, path), { recursive: true });
    await copyFile(join(templates, 'worker.js'), join(folder, '_worker.js'));
    await copyFile(join(templates, 'images.js'), join(folder, 'cloudflare/images.js'));
    await copyFile(join(templates, 'skew-protection.js'), join(folder, 'cloudflare/skew-protection.js'));
    await copyFile(join(templates, 'init.js'), join(folder, 'cloudflare/init.js'));
    await writeFile(join(folder, 'cloudflare/next-env.mjs'), 'export const production = {};');
    await writeFile(join(folder, 'middleware/handler.mjs'), 'export async function handler(r){await fetch("https://adapter.example.test/called");return r;}');
    await writeFile(join(folder, 'server-functions/default/handler.mjs'), `import {verifyLuluWebhook} from ${JSON.stringify(resolve('src/lib/lulu-webhook-auth.ts'))};export async function handler(r){if(new URL(r.url).pathname==='/api/webhooks/lulu/status'){const valid=await verifyLuluWebhook(new Uint8Array(await r.arrayBuffer()),r.headers.get('lulu-hmac-sha256'));return Response.json({valid},{status:valid?200:401});}return Response.json({requestId:r.headers.get('x-request-id'),internal:r.headers.get('x-middleware-subrequest'),body:r.method==='POST'?await r.text():null});}`);
    for (const [file, name] of [['queue.js', 'DOQueueHandler'], ['sharded-tag-cache.js', 'DOShardedTagCache'], ['bucket-cache-purge.js', 'BucketCachePurge']]) await writeFile(join(folder, '.build/durable-objects', file), `export class ${name} {}`);
    await emitPagesAccessBoundary(folder);
    assert.deepEqual(JSON.parse(await readFile(join(folder, '_routes.json'), 'utf8')), pagesRoutes);
    assert.deepEqual(pagesRoutes.exclude, ['/_next/static/*', '/favicon.ico']);
    const source = await readFile(join(folder, '_worker.js'), 'utf8'); assert.throws(() => patchWorkerForAccessBoundary(source), /Unsupported/);
    assert.ok(source.indexOf('withBackendAccess(request,') < source.indexOf('maybeGetSkewProtectionResponse(request)'));
    const bundle = await build({ entryPoints: [join(folder, '_worker.js')], bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'], external: ['node:*'], logLevel: 'silent',
      define: { __BUILD_TIMESTAMP_MS__: '0', __NEXT_BASE_PATH__: '""', __ASSETS_RUN_WORKER_FIRST__: 'false', __DEPLOYMENT_ID__: '""', __TRAILING_SLASH__: 'false', __SKEW_PROTECTION_ENABLED__: 'false', __IMAGES_LOCAL_PATTERNS__: '[]', __IMAGES_REMOTE_PATTERNS__: '[]', __IMAGES_ALLOW_SVG__: 'false', __IMAGES_CONTENT_DISPOSITION__: '"inline"', __IMAGES_CONTENT_SECURITY_POLICY__: '"default-src none"' } });
    const worker = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: date, compatibilityFlags: flags,
      bindings: { CF_ACCESS_ISSUER: issuer, CF_ACCESS_AUDIENCE: audience, ADMIN_ALLOWED_EMAILS: 'john@example.test', ADMIN_SITE_ORIGIN: origin, BACKEND_API_TOKEN: 'synthetic-pages-machine-secret-value', LULU_CLIENT_SECRET: 'synthetic-worker-lulu-owner-secret' },
      serviceBindings: { ASSETS: async () => { assets++; return new WorkerResponse('synthetic-static-sentinel', { headers: { 'Cache-Control': 'public, max-age=3600' } }); } },
      outboundService: async request => {
        if (request.url === issuer + '/cdn-cgi/access/certs') return new WorkerResponse(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
        assert.equal(request.url, 'https://adapter.example.test/called', 'no real provider transport'); adapter++; return new WorkerResponse('synthetic');
      },
    });
    try {
      for (const path of ['/api/orders', '/_next/data/wrong-build/orders.json', '/_next/data/current-build/api/admin/send-amazon-message.json', '/_next/unknown', '/_next/image?url=/private-sentinel.png', '/cdn-cgi/image/width=100/private-sentinel.png']) {
        const beforeAssets = assets, beforeAdapter = adapter;
        const response = await worker.dispatchFetch('https://direct-deployment.pages.dev' + path, { headers: { 'x-request-id': 'attacker', 'x-middleware-subrequest': 'bypass', 'x-matched-path': '/api/checkout/create' } });
        assert.equal(response.status, 401, path); assert.equal(assets, beforeAssets); assert.equal(adapter, beforeAdapter); assert.notEqual(response.headers.get('x-request-id'), 'attacker'); assert.match(response.headers.get('cache-control')!, /private.*no-store/);
      }
      for (const method of ['GET', 'HEAD']) {
        const response = await worker.dispatchFetch(origin + '/_next/data/current-build/api/admin/send-amazon-message.json', { method, headers: { cookie: 'CF_Authorization=' + jwt, 'sec-fetch-site': 'cross-site', referer: 'https://evil.example/' } }); assert.equal(response.status, 403);
      }
      const human = { cookie: 'CF_Authorization=' + jwt, 'sec-fetch-site': 'same-origin', referer: origin + '/orders' };
      const image = await worker.dispatchFetch(origin + '/_next/image?url=/private-sentinel.png', { headers: human }); assert.equal(image.status, 200); assert.equal(await image.text(), 'synthetic-static-sentinel'); assert.equal(assets, 1); assert.match(image.headers.get('cache-control')!, /private.*no-store/); assert.ok(image.headers.get('x-request-id'));
      const machine = await worker.dispatchFetch(origin + '/api/internal/synthetic', { method: 'POST', headers: { authorization: 'Bearer synthetic-pages-machine-secret-value', 'x-request-id': 'caller-id', 'x-middleware-subrequest': 'bypass' }, body: 'synthetic-request-body' });
      assert.equal(machine.status, 200); const body = await machine.json() as { requestId: string; internal: null; body: string };
      assert.equal(body.requestId, machine.headers.get('x-request-id')); assert.notEqual(body.requestId, 'caller-id'); assert.equal(body.internal, null); assert.equal(body.body, 'synthetic-request-body');
      const rawLulu = ' {"data":{"note":"Unicode ☃ whitespace"}} ';
      const luluDigest = createHmac('sha256', 'synthetic-worker-lulu-owner-secret').update(rawLulu).digest('base64');
      const signed = await worker.dispatchFetch(origin + '/api/webhooks/lulu/status', { method: 'POST', headers: { 'lulu-hmac-sha256': luluDigest }, body: rawLulu }); assert.equal(signed.status, 200); assert.deepEqual(await signed.json(), { valid: true });
      assert.equal((await worker.dispatchFetch(origin + '/api/webhooks/lulu/status', { method: 'POST', headers: { 'lulu-hmac-sha256': luluDigest }, body: rawLulu + ' ' })).status, 401);
    } finally { await worker.dispose(); }
    // Execute the actual postbuild script against a controlled synthetic filesystem.
    const fixture = join(folder, 'postbuild-fixture');
    for (const path of ['.open-next/cloudflare', '.open-next/cloudflare-templates', '.open-next/middleware', '.open-next/server-functions/default', '.open-next/assets', '.next/static', 'public']) await mkdir(join(fixture, path), { recursive: true });
    await mkdir(join(fixture, 'scripts'));
    for (const file of ['enforce-pages-access-boundary.mts', 'security-public-routes.mts']) await copyFile(resolve('scripts', file), join(fixture, 'scripts', file));
    await symlink(resolve('src'), join(fixture, 'src'));
    await symlink(resolve('node_modules'), join(fixture, 'node_modules'));
    await copyFile(join(templates, 'worker.js'), join(fixture, '.open-next/worker.js'));
    for (const helper of ['images.js', 'init.js', 'skew-protection.js', 'next-env.mjs']) {
      await writeFile(join(fixture, '.open-next/cloudflare', helper), `export const COMPILED_HELPER_MARKER=${JSON.stringify(helper)};`);
      await writeFile(join(fixture, '.open-next/cloudflare-templates', helper), 'throw new Error("RAW_TEMPLATE_MUST_NOT_BE_PACKAGED");');
    }
    await writeFile(join(fixture, '.open-next/middleware/handler.mjs'), 'export function handler(){}');
    await writeFile(join(fixture, '.open-next/server-functions/default/handler.mjs'), 'export function handler(){}');
    await writeFile(join(fixture, '.next/static/synthetic.js'), '// synthetic static bundle');
    await writeFile(join(fixture, 'public/pdf.worker.min.mjs'), '// synthetic public worker');
    execFileSync('bash', [resolve('scripts/postbuild.sh')], { cwd: fixture, env: { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH }, stdio: 'pipe' });
    for (const helper of ['images.js', 'init.js', 'skew-protection.js', 'next-env.mjs']) assert.match(await readFile(join(fixture, '.open-next/cloudflare/cloudflare', helper), 'utf8'), /COMPILED_HELPER_MARKER/);
    assert.deepEqual(JSON.parse(await readFile(join(fixture, '.open-next/cloudflare/_routes.json'), 'utf8')), pagesRoutes);
    assert.ok((await readFile(join(fixture, '.open-next/cloudflare/_worker.js'), 'utf8')).includes('withBackendAccess(request,'));
  } finally { await rm(folder, { recursive: true, force: true }); }
  console.log('Packaged actual OpenNext template + image helper: raw-entry denial before image/assets/adapter, runtime JWT bindings, data/unknown paths, CSRF, request IDs/cache policy, body preservation and fail-closed transform passed; zero live traffic');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
