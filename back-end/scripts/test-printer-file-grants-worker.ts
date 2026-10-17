import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

async function main() {
  const settings = await readFile('wrangler.toml', 'utf8');
  const date = settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags = [...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(date && flags.length);
  const entry = `import { createPrinterFileUrl, newPrinterFileWindow, verifyPrinterFileUrl } from ${JSON.stringify(resolve('src/lib/printer-file-grants.ts'))};
    export default { async fetch(request) {
      const body = await request.json();
      const scope = { key: body.key, submissionId: '11111111-1111-4111-8111-111111111111', itemReferenceId: 'item-1', orderDbId: 1, configVersion: 2, inputFingerprint: 'a'.repeat(24) };
      if (body.url) return Response.json({ valid: await verifyPrinterFileUrl(body.url, body.key) });
      return Response.json({url: await createPrinterFileUrl(scope, newPrinterFileWindow(new Date()), 'https://admin.littleherolabs.com')});
    }};`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'], external: ['node:*'], logLevel: 'silent' });
  const worker = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: date, compatibilityFlags: flags,
    bindings: { BACKEND_API_TOKEN: 'synthetic-worker-preview-signing-authority-only' },
    outboundService: async () => { throw new Error('No outbound requests permitted'); },
  });
  const key = 'book-synthetic/orders/ORDER-SYNTHETIC/gelato/print/v2/' + 'a'.repeat(24) + '.pdf';
  const call = (body: unknown) => worker.dispatchFetch('https://worker.example.test', { method: 'POST', body: JSON.stringify(body) });
  try {
    const signed = await (await call({ key })).json() as { url: string };
    assert.deepEqual(await (await call({ key, url: signed.url })).json(), { valid: true });
    assert.deepEqual(await (await call({ key: key.replace('ORDER-SYNTHETIC', 'OTHER'), url: signed.url })).json(), { valid: false });
    assert.deepEqual(await (await call({ key, url: signed.url + 'tampered' })).json(), { valid: false });
    assert.deepEqual(await (await call({ key, url: signed.url + '&format=json' })).json(), { valid: false });
    console.log('Printer grants production-config Worker: runtime binding, WebCrypto, exact PDF scope, tamper and presign escape denial passed; zero outbound traffic');
  } finally { await worker.dispose(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
