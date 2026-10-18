import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

async function main() {
  const settings = await readFile('wrangler.toml', 'utf8');
  const date = settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags = [...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(date && flags.length);
  const entry = `import { createPreviewImageGrant, verifyPreviewImageGrant } from ${JSON.stringify(resolve('src/lib/preview-file-grants.ts'))};
    export default { async fetch(request) {
      const body = await request.json();
      if (body.grant) return Response.json({ valid: await verifyPreviewImageGrant(body.grant, body.key) });
      try { return Response.json(await createPreviewImageGrant(body.key, body.expiresAt)); }
      catch { return new Response(null, {status: 400}); }
    }};`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'], external: ['node:*'], logLevel: 'silent' });
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: date, compatibilityFlags: flags,
    bindings: { BACKEND_API_TOKEN: 'synthetic-worker-preview-signing-authority-only' },
    outboundService: async () => { throw new Error('No outbound requests permitted'); },
  }));
  const key = 'book-synthetic/orders/ORDER-SYNTHETIC/preview-images/p01.png';
  const call = (body: unknown) => worker.dispatchFetch('https://worker.example.test', { method: 'POST', body: JSON.stringify(body) });
  try {
    const sourceExpiry = new Date(Date.now() + 120000).toISOString();
    const issued = await call({ key, expiresAt: sourceExpiry }); assert.equal(issued.status, 200);
    const signed = await issued.json() as { grant: string; expiresAt: string };
    assert.ok(Date.parse(signed.expiresAt) <= Date.parse(sourceExpiry));
    assert.deepEqual(await (await call({ key, grant: signed.grant })).json(), { valid: true });
    assert.deepEqual(await (await call({ key: key.replace('p01', 'p02'), grant: signed.grant })).json(), { valid: false });
    assert.deepEqual(await (await call({ key, grant: signed.grant + 'tampered' })).json(), { valid: false });
    assert.equal((await call({ key, expiresAt: '2000-01-01' })).status, 400);
    assert.equal((await call({ key: key.replace('/preview-images/p01.png', '/manifests/3-manifest.json'), expiresAt: sourceExpiry })).status, 400);
    console.log('Preview file grants production-config Worker: runtime signing binding, WebCrypto, exact image authority, expiry and tamper denial passed; zero outbound traffic');
  } finally { await worker.dispose(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
