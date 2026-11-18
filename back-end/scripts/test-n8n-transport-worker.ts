import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as WorkerResponse } from 'miniflare';

async function main() {
  const settings = await readFile('wrangler.toml', 'utf8');
  const date = settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags = [...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(date && flags.length);
  const entry = `export default { async fetch(request) {
    let cancelled = 0;
    const transport = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (init.redirect !== 'manual' || !init.signal) throw Error('Missing transport fences');
      const response = await transport(input, init), body = response.body;
      return new Proxy(response, {get(target, key) {
        if (key === 'body' && body) return {
          cancel: async () => { cancelled++; await body.cancel(); },
          getReader() { const reader = body.getReader(); return {
            read: () => reader.read(), cancel: async () => { cancelled++; await reader.cancel(); }
          }; }
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }});
    };
    try { const path = new URL(request.url).pathname; if (path === '/w0') {
      const client = await import(${JSON.stringify(resolve('src/lib/w0-webhook-transport.ts'))});
      const response = await client.postW0Webhook('https://n8n.example.test/webhook/w0', {orderId:'TEST-SYNTHETIC'});
      if (!response.ok) throw Error('W0 dispatch failed (HTTP '+response.status+')');
      return Response.json(await response.json());
    }
      const client = await import(${JSON.stringify(resolve('src/lib/n8n-recovery-client.ts'))});
      const result = path === '/history' ? await client.listN8NExecutionPage(100)
        : path === '/workflow' ? await client.readN8NWorkflow('fixture') : await client.readN8NExecution('101');
      const runs = result.data?.resultData?.runData?.['Execute SW1 - Pose Generation'];
      return Response.json({id:result.id, status:result.status, entries:result.entries?.length,
        runCount:runs?.length, imageCharacters:runs?.reduce((sum, run) => sum + run.data.main[0][0].json.inlineData.data.length, 0),
        paddingLength:result.padding?.length, cancelled});
    } catch (error) { return Response.json({error:error.message, cancelled}, {status:502}); }
    finally { globalThis.fetch = transport; }
  }};`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false,
    format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'], external: ['node:*'], logLevel: 'silent' });
  let status = 200, location = 'https://foreign.example.test/never-follow';
  let responseBytes: number | null = null, realisticGraph = false;
  // Build a bounded synthetic execution graph, including repeated pose image payloads, then stream
  // it in 64 KiB pieces. The tested Worker returns only counts, never the large graph itself.
  function streamedDetails(url: string): WorkerResponse {
    const history = url.includes('/executions?'), workflow = url.includes('/workflows/');
    const runCount = realisticGraph ? 52 : 0;
    const imageLength = runCount ? Math.floor((responseBytes! - 64 * 1024) / runCount) : 0;
    const image = 'A'.repeat(imageLength);
    const runs = Array.from({length:runCount}, (_, index) => ({data:{main:[[{json:{
      poseNumber:index % 13, orderId:'SYNTHETIC-BOOK', workflowParentClaim:{orderRowId:44,orderId:'SYNTHETIC-BOOK',executionId:'101',startedAt:'2026-11-17T00:00:00.000000Z'},
      inlineData:{mimeType:'image/png',data:image}
    }}]]}}));
    const root = history ? {data:[{id:'101'}],nextCursor:null} : workflow ? {id:'fixture',name:'Fixture',active:true}
      : {id:'101',status:'error',data:{resultData:{runData:{'Execute SW1 - Pose Generation':runs}}}};
    const prefix = JSON.stringify(root).slice(0,-1) + ',"padding":"', suffix = '"}';
    const padding = responseBytes! - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
    assert(padding >= 0);
    const segments = [prefix, 'B'.repeat(padding), suffix];
    let segment = 0, offset = 0;
    return new WorkerResponse(new NodeReadableStream<Uint8Array>({pull(controller) {
      while (segment < segments.length && offset === segments[segment].length) { segments[segment] = ''; segment++; offset = 0; }
      if (segment === segments.length) { controller.close(); return; }
      const chunk = segments[segment].slice(offset, offset + 64 * 1024); offset += chunk.length;
      controller.enqueue(new TextEncoder().encode(chunk));
    }}), {headers:{'Content-Type':'application/json'}});
  }
  const calls: { url: string; method: string }[] = [];
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: date, compatibilityFlags: flags,
    bindings: { N8N_API_URL: 'https://n8n.example.test/api/v1', N8N_API_KEY: 'synthetic-worker-n8n' },
    outboundService: async request => {
      calls.push({ url: request.url, method: request.method });
      assert.ok(['https://n8n.example.test/api/v1/executions/101?includeData=true','https://n8n.example.test/api/v1/executions?limit=100&includeData=false','https://n8n.example.test/api/v1/workflows/fixture','https://n8n.example.test/webhook/w0'].includes(request.url), 'No redirect destination or live traffic');
      if (request.url.endsWith('/w0')) {
        assert.equal(request.method, 'POST'); assert.equal(request.headers.get('X-N8N-API-KEY'), null);
        assert.equal(request.headers.get('Content-Type'), 'application/json');
        assert.deepEqual(await request.json(), {orderId:'TEST-SYNTHETIC'});
      } else {
        assert.equal(request.method, 'GET');
        assert.equal(request.headers.get('X-N8N-API-KEY'), 'synthetic-worker-n8n');
        assert.equal(request.headers.get('Cache-Control'), 'no-store');
      }
      return status === 200 ? responseBytes === null ? WorkerResponse.json({ id: '101', status: 'error' }) : streamedDetails(request.url)
        : new WorkerResponse(null, { status, headers: location ? { Location: location } : {} });
    },
  }));
  try {
    for (const path of ['/inspect','/w0']) {
    status = 200; calls.length = 0;
    const success = await worker.dispatchFetch('https://local.example.test'+path);
    const body = await success.json();
    assert.equal(success.status, 200, JSON.stringify({body,calls}));
    assert.deepEqual(body, path === '/w0' ? { id: '101', status: 'error' } : { id: '101', status: 'error', cancelled:0 });
    assert.equal(calls.length, 1);
    for (status of [301, 302, 303, 307, 308, 401, 503]) for (location of ['https://foreign.example.test/never-follow', 'https://n8n.example.test/never-follow', '']) {
      calls.length = 0;
      const refused = await worker.dispatchFetch('https://local.example.test'+path);
      assert.equal(refused.status, 502, 'Upstream failure/redirect must fail closed');
      assert.equal(calls.length, 1, 'No following Location, retry, or credential forwarding');
      assert.match((await refused.json() as { error: string }).error, /(?:lookup|dispatch) failed/);
    }
    }
    status = 200;
    responseBytes = 23_198_010; realisticGraph = true; calls.length = 0;
    const large = await worker.dispatchFetch('https://local.example.test/inspect');
    const largeBody = await large.json() as {runCount?:number;imageCharacters?:number;cancelled?:number};
    assert.equal(large.status,200,JSON.stringify(largeBody));
    assert.equal(largeBody.runCount,52); assert(largeBody.imageCharacters! > 23_000_000);
    assert.equal(largeBody.cancelled,0); assert.equal(calls.length,1);
    realisticGraph = false;
    for (const [path, limit] of [['/inspect',32*1024*1024],['/history',16*1024*1024],['/workflow',16*1024*1024]] as const) {
      responseBytes = limit; calls.length = 0;
      const exact = await worker.dispatchFetch('https://local.example.test'+path);
      const exactBody = await exact.json() as {paddingLength?:number;cancelled?:number};
      assert.equal(exact.status,200,JSON.stringify(exactBody)); assert.equal(exactBody.cancelled,0);
      if(path !== '/history')assert(exactBody.paddingLength! > limit-1024);
      assert.equal(calls.length,1);
      responseBytes = limit+1; calls.length = 0;
      const refused = await worker.dispatchFetch('https://local.example.test'+path);
      const refusedBody = await refused.json() as {error:string;cancelled:number};
      assert.equal(refused.status,502); assert.match(refusedBody.error,/exceed the inspection limit/);
      assert.equal(refusedBody.cancelled,1,'Bounded reader cancels on first over-limit chunk');
      assert.equal(calls.length,1);
    }
  } finally { await worker.dispose(); }
  console.log('Actual production-config Workerd n8n lookup and W0 POST: streamed23,198,010-byte52-run graph; exact32MiB execution/16MiB history+workflow bounds and+1 cancellation; native fetch fences and redirects/errors refused; zero live traffic');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
