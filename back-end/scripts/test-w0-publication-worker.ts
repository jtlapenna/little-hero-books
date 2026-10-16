import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildBookConfigPublishPayload } from '../src/lib/books/runtime-book-config';

type Built = { manifest: Record<string, unknown>; manifestKey: string; orderUpsert: Record<string, unknown>; created: boolean; reused: boolean; error?: string };
async function main() {
  const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
  const published = buildBookConfigPublishPayload(config, { activate: true });
  const entry = `import {buildOrderIntakeManifestFromNormalizedInputRuntime} from ${JSON.stringify(resolve('src/lib/w0-manifest-builder.ts'))};
import {prepareFrozenW0Manifest} from ${JSON.stringify(resolve('src/lib/books/freeze-w0-manifest.ts'))};
import {w0ManifestStorage} from ${JSON.stringify(resolve('src/lib/books/w0-manifest-storage.ts'))};
export default {async fetch(request){try{const x=await request.json();const candidate=await buildOrderIntakeManifestFromNormalizedInputRuntime(x.input,x.options);const result=await prepareFrozenW0Manifest(x.input,candidate,w0ManifestStorage,new URL(request.url).pathname==='/publish');return Response.json(result);}catch(error){return Response.json({error:error instanceof Error?error.message:String(error)},{status:409});}}};`;
  const settings = await fs.readFile('wrangler.toml', 'utf8');
  const date = settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags = [...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(m => m[1]);
  assert(date && flags.length);
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'], external: ['node:*'], logLevel: 'silent' });
  let row: Record<string, unknown> | null = null;
  const objects = new Map<string, unknown>();
  let objectWrites = 0; let databaseWrites = 0; let denied = false; let scenario = 'normal';
  const calls: string[] = [];
  const worker = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: date, compatibilityFlags: flags,
    bindings: { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only', CLOUDFLARE_ACCOUNT_ID: 'synthetic-intake', CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-access', CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-secret' },
    outboundService: async request => {
      const url = new URL(request.url); calls.push(request.method + ' ' + url.hostname + url.pathname);
      if (url.hostname === 'db.example.test') {
        assert(['/rest/v1/book_configs', '/rest/v1/orders'].includes(url.pathname));
        if (request.method === 'PATCH' && url.searchParams.get('execution_status') === 'eq.pending_w0' && row?.execution_status !== 'pending_w0') return WorkerResponse.json({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'JSON object requested, multiple (or no) rows returned' }, { status: 406 });
        if (request.method !== 'GET') { databaseWrites++; assert.equal(url.pathname, '/rest/v1/orders'); assert(['POST', 'PATCH'].includes(request.method)); row = { id: 1, ...row, ...await request.json() as Record<string, unknown> }; }
        const rows = url.pathname.endsWith('book_configs') ? [published] : row ? [row] : [];
        return WorkerResponse.json(request.headers.get('Accept')?.includes('vnd.pgrst.object') ? rows[0] : rows);
      }
      assert.equal(url.hostname, 'little-hero-orders.synthetic-intake.r2.cloudflarestorage.com', 'No external service');
      assert(request.headers.get('Authorization')?.startsWith('AWS4-HMAC-SHA256'));
      if (request.method === 'GET') return objects.has(url.pathname) ? WorkerResponse.json(objects.get(url.pathname)) : new WorkerResponse('absent', { status: 404 });
      assert.equal(request.method, 'PUT'); objectWrites++; assert.equal(request.headers.get('If-None-Match'), '*');
      if (denied) return new WorkerResponse('synthetic forbidden', { status: 403 });
      if (objects.has(url.pathname)) return new WorkerResponse(null, { status: 412 });
      objects.set(url.pathname, await request.json());
      if (scenario === 'collision') return new WorkerResponse(null, { status: 412 });
      if (scenario === 'lost-response') return new WorkerResponse('Receipt unavailable after accepted synthetic write', { status: 503 });
      return new WorkerResponse(null, { status: 200 });
    } });
  try {
    for (const formatId of ['standard', 'amazon']) {
      row = null; objects.clear(); objectWrites = 0; databaseWrites = 0; calls.length = 0;
      const orderId = `TEST-GELATO-WORKER-INTAKE-${formatId}`;
      const input = { orderId, ...(formatId === 'amazon' ? { amazonOrderId: orderId } : {}), bookSpecs: { testMode: true } };
      const options = { schemaVersion: 'v3', bookId: config.bookId, formatId, configVersion: 2, configSource: 'published' };
      const send = (mode: 'build' | 'publish') => worker.dispatchFetch('http://local/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, options }) });
      const builtResponse = await send('build'); const built = await builtResponse.json() as Built;
      assert.equal(builtResponse.status, 200, 'Actual production-config Worker must build: ' + built.error);
      assert.equal(objectWrites, 0); assert.equal(databaseWrites, 0);
      row = { id: 1, ...built.orderUpsert, execution_status: 'done', next_workflow: null };
      const before = structuredClone(row);
      const publicationResponse = await send('publish'); const publication = await publicationResponse.json() as Built;
      assert.equal(publicationResponse.status, 200, 'Actual production-config Worker must publish held intake: ' + publication.error);
      assert.equal(publication.created, true); assert.equal(objectWrites, 1); assert.equal(databaseWrites, 0); assert.deepEqual(row, before);
      const repeat = await send('publish'); assert.equal(repeat.status, 200); assert.equal(objectWrites, 1); assert.equal(databaseWrites, 0); assert.deepEqual(row, before);
      objects.clear(); denied = true;
      const rejected = await send('publish'); assert.equal(rejected.status, 409); assert.equal(databaseWrites, 0); assert.deepEqual(row, before); denied = false;
      objects.clear(); scenario = 'collision';
      const collision = await send('publish'); assert.equal(collision.status, 200); assert.equal((await collision.json() as Built).created, false); assert.deepEqual(row, before);
      objects.clear(); scenario = 'lost-response';
      const lost = await send('publish'); assert.equal(lost.status, 409); const afterLostWrites = objectWrites;
      const observed = await send('build'); assert.equal(observed.status, 200); assert.equal((await observed.json() as Built).reused, true); assert.equal(objectWrites, afterLostWrites, 'GET-only build must reconcile accepted-but-unconfirmed creation without another PUT');
      objects.clear(); scenario = 'normal';
      row = { ...before, one_manifest_url: null };
      const partial = await send('publish'); assert.equal(partial.status, 409, 'Publication must not report success while canonical manifest link is absent');
      assert.equal((await partial.json() as Built).error, 'Persisted canonical W0 manifest reference was not confirmed');
      assert.equal(row.one_manifest_url, null); assert.equal(row.execution_status, 'done'); assert.equal(row.next_workflow, null);
    }
  } finally { await worker.dispose(); }
  console.log('Production-config Worker: actual published-config builder -> signed conditional W0 creation; website/Amazon held state preserved, frozen reuse and denied write fail closed; zero real service calls');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
