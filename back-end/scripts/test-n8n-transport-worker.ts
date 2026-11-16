import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as WorkerResponse } from 'miniflare';

async function main() {
  const settings = await readFile('wrangler.toml', 'utf8');
  const date = settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags = [...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(date && flags.length);
  const entry = `export default { async fetch(request) {
    try { if (new URL(request.url).pathname === '/w0') {
      const client = await import(${JSON.stringify(resolve('src/lib/w0-webhook-transport.ts'))});
      const response = await client.postW0Webhook('https://n8n.example.test/webhook/w0', {orderId:'TEST-SYNTHETIC'});
      if (!response.ok) throw Error('W0 dispatch failed (HTTP '+response.status+')');
      return Response.json(await response.json());
    }
      const client = await import(${JSON.stringify(resolve('src/lib/n8n-recovery-client.ts'))});
      return Response.json(await client.readN8NExecution('101'));
    } catch (error) { return Response.json({error:error.message}, {status:502}); }
  }};`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false,
    format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'], external: ['node:*'], logLevel: 'silent' });
  let status = 200, location = 'https://foreign.example.test/never-follow';
  const calls: { url: string; method: string }[] = [];
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: date, compatibilityFlags: flags,
    bindings: { N8N_API_URL: 'https://n8n.example.test/api/v1', N8N_API_KEY: 'synthetic-worker-n8n' },
    outboundService: async request => {
      calls.push({ url: request.url, method: request.method });
      assert.ok(['https://n8n.example.test/api/v1/executions/101?includeData=true','https://n8n.example.test/webhook/w0'].includes(request.url), 'No redirect destination or live traffic');
      if (request.url.endsWith('/w0')) {
        assert.equal(request.method, 'POST'); assert.equal(request.headers.get('X-N8N-API-KEY'), null);
        assert.equal(request.headers.get('Content-Type'), 'application/json');
        assert.deepEqual(await request.json(), {orderId:'TEST-SYNTHETIC'});
      } else {
        assert.equal(request.method, 'GET');
        assert.equal(request.headers.get('X-N8N-API-KEY'), 'synthetic-worker-n8n');
        assert.equal(request.headers.get('Cache-Control'), 'no-store');
      }
      return status === 200 ? WorkerResponse.json({ id: '101', status: 'error' })
        : new WorkerResponse(null, { status, headers: location ? { Location: location } : {} });
    },
  }));
  try {
    for (const path of ['/inspect','/w0']) {
    status = 200; calls.length = 0;
    const success = await worker.dispatchFetch('https://local.example.test'+path);
    const body = await success.json();
    assert.equal(success.status, 200, JSON.stringify({body,calls}));
    assert.deepEqual(body, { id: '101', status: 'error' });
    assert.equal(calls.length, 1);
    for (status of [301, 302, 303, 307, 308, 401, 503]) for (location of ['https://foreign.example.test/never-follow', 'https://n8n.example.test/never-follow', '']) {
      calls.length = 0;
      const refused = await worker.dispatchFetch('https://local.example.test'+path);
      assert.equal(refused.status, 502, 'Upstream failure/redirect must fail closed');
      assert.equal(calls.length, 1, 'No following Location, retry, or credential forwarding');
      assert.match((await refused.json() as { error: string }).error, /(?:lookup|dispatch) failed/);
    }
    }
  } finally { await worker.dispose(); }
  console.log('Actual production-config Workerd n8n lookup and W0 POST: dynamic imports, native fetch success, redirects/errors refused, zero destination requests or live traffic');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
