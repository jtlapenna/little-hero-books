import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { deflateRawSync } from 'node:zlib';
import { archive, amazonV3 } from './test-customization-zip';
import { PUBLIC_BODY_LIMITS } from '../src/lib/request-body';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { resolve, join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions, Response as WorkerResponse } from 'miniflare';

async function main() {
  const settings = await readFile('wrangler.toml', 'utf8');
  const date = settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags = [...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(date && flags.length);
  let outbound = 0, syntheticIdempotency = 0;
  let allowSyntheticIdempotency = false;
  let csvMode: string | undefined, csvArchive: Buffer, csvDownloads = 0, csvInserts = 0, csvUpdates = 0, csvTriggers = 0;
  const storedCsvRow = { id: 1, orderId: 'TEST-COMPILED-ZIP', character_specs: { childName: 'Stored Synthetic Child', age: '5' }, product_info: {} };
  const packageRoot = resolve('.open-next/cloudflare');
  const temporary = await mkdtemp(join(tmpdir(), 'lhl-compiled-worker-'));
  try {
    // Pages upload applies Wrangler's Node compatibility transform after OpenNext.
    // Use the same local Pages compiler, with no upload or account access.
    execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'pages', 'functions', 'build',
      '--project-directory', resolve('.'), '--build-output-directory', packageRoot,
      '--outdir', join(temporary, 'modules'), '--compatibility-date', date,
      ...flags.flatMap(flag => ['--compatibility-flags', flag])], {
      cwd: temporary, stdio: 'pipe',
      env: { NODE_ENV: 'production', PATH: process.env.PATH, HOME: temporary, TMPDIR: process.env.TMPDIR,
        WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(temporary, 'wrangler.log') },
    });
    const worker = new Miniflare(convertV4MiniflareOptions({
      modules: true, scriptPath: join(temporary, 'modules/_worker.js'), modulesRoot: join(temporary, 'modules'),
      compatibilityDate: date, compatibilityFlags: flags,
      bindings: {
        SUPABASE_URL: 'https://compiled-worker-db.example.test', NEXT_PUBLIC_SUPABASE_URL: 'https://compiled-worker-db.example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'synthetic-compiled-worker-key', BACKEND_API_TOKEN: 'synthetic-compiled-worker-machine',
        CRON_SECRET: 'synthetic-compiled-cron-replacement',
        ADMIN_SITE_ORIGIN: 'https://admin.littleherolabs.com',
        N8N_W0_WEBHOOK_URL: 'https://compiled-worker-w0.example.test/hook',
        STRIPE_SECRET_KEY: 'sk_test_synthetic_compiled_body', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic_compiled_body',
        GELATO_DRAFT_SUBMISSION_ENABLED: 'false', GELATO_CANCEL_ENABLED: 'false', GELATO_STATUS_RELAY_ENABLED: 'false',
        GELATO_STATUS_POLLING_ENABLED: 'false', GELATO_SCHEDULED_STATUS_ENABLED: 'false', GELATO_NOTIFICATIONS_ENABLED: 'false',
      },
      serviceBindings: { ASSETS: async () => new WorkerResponse('Missing synthetic asset', { status: 404 }) },
      outboundService: async request => {
        const url = new URL(request.url);
        if (allowSyntheticIdempotency && url.origin === 'https://compiled-worker-db.example.test' && url.pathname === '/rest/v1/idempotency_keys' && ['GET', 'POST'].includes(request.method)) {
          syntheticIdempotency++;
          return new WorkerResponse(request.method === 'GET' ? 'null' : null, { status: request.method === 'GET' ? 200 : 201, headers: { 'content-type': 'application/json' } });
        }
        if (csvMode && url.origin === 'https://compiled-worker-download.example.test' && url.pathname === '/synthetic.zip' && request.method === 'GET') {
          csvDownloads++;return new WorkerResponse(new Uint8Array(csvArchive));
        }
        if (csvMode && url.origin === 'https://compiled-worker-db.example.test' && url.pathname === '/rest/v1/orders') {
          let rows: unknown[];
          if (request.method === 'GET') rows = csvMode === 'rejected-existing' ? [storedCsvRow] : [];
          else if (request.method === 'POST') { csvInserts++;const inserted = await request.json() as { character_specs: { childName: string } };assert.equal(inserted.character_specs.childName, 'Synthetic Child');rows = [{ id: 2, ...inserted }]; }
          else { assert.equal(request.method, 'PATCH');csvUpdates++;rows = [{ id: 1 }]; }
          return new WorkerResponse(JSON.stringify(request.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows), { status: request.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
        }
        if (csvMode && url.origin === 'https://compiled-worker-w0.example.test' && url.pathname === '/hook' && request.method === 'POST') {
          csvTriggers++;const payload = await request.json() as { characterSpecs: { childName: string } };assert.equal(payload.characterSpecs.childName, csvMode === 'rejected-existing' ? 'Stored Synthetic Child' : 'Synthetic Child');return new WorkerResponse('{}');
        }
        outbound++; throw new Error('Outbound blocked: ' + url.origin);
      },
    }));
    try {
      const local = await worker.ready;
      assert.equal(local.hostname, '127.0.0.1');
      // Raw loopback HTTP preserves browser navigation headers. Miniflare's
      // fetch transport replaces sec-fetch-mode with cors before Worker entry.
      const compiledFetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => new Promise<Response>((resolveResponse, reject) => {
        const target = new URL(url);
        const failed = (error: Error) => reject(new Error(`Synthetic Worker transport failed for ${target.pathname}`, { cause: error }));
        const request = httpRequest(new URL(target.pathname + target.search, local), {
          agent: false, method: init.method ?? 'GET', headers: { ...init.headers, 'MF-Original-URL': url, 'MF-Disable-Pretty-Error': 'true' },
        }, response => {
          const chunks: Buffer[] = [];
          response.on('data', chunk => chunks.push(Buffer.from(chunk)));
          response.on('error', failed);
          response.on('end', () => {
            const headers = new Headers();
            for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
            const bytes = Buffer.concat(chunks);
            resolveResponse(new Response(bytes.length ? bytes : null, { status: response.statusCode!, headers }));
          });
        });
        request.on('error', failed);
        request.setTimeout(15000, () => request.destroy(new Error('Local Worker request timed out')));
        request.end(init.body);
      });
      const origin = 'https://admin.littleherolabs.com';
      // The actual emitted boundary, OpenNext init and full Next route must agree on
      // the synthetic replacement, while disabled scheduling has no business effects.
      const cronEffects = () => ({ outbound, syntheticIdempotency, csvDownloads, csvInserts, csvUpdates, csvTriggers });
      const beforeCron = cronEffects();
      assert.deepEqual(beforeCron, { outbound: 0, syntheticIdempotency: 0, csvDownloads: 0, csvInserts: 0, csvUpdates: 0, csvTriggers: 0 });
      assert.equal(allowSyntheticIdempotency, false); assert.equal(csvMode, undefined);
      for (const authorization of [undefined, 'Bearer synthetic-compiled-cron-previous', 'Bearer synthetic-compiled-cron-replacement']) {
        const accepted = authorization === 'Bearer synthetic-compiled-cron-replacement';
        const response = await compiledFetch(origin + '/api/cron/gelato-status', {
          method: 'POST', headers: authorization ? { authorization } : {},
        });
        assert.equal(response.status, accepted ? 200 : 401, await response.clone().text());
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.deepEqual(await response.json(), accepted ? { disabled: true, checked: 0, delivered: 0, customerMessages: false } : { error: 'Unauthorized' });
        assert.deepEqual(cronEffects(), beforeCron, 'disabled cron must not reach any outbound or synthetic business effect');
      }
      console.log('Compiled cron: missing/previous authority denied, replacement returns exact disabled payload; all effect counters zero');
      const nav = { accept: 'text/html', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
      const login = await compiledFetch(origin + '/__access_setup', { headers: nav });
      assert.equal(login.status, 401);
      assert.match(await login.text(), /Sign-in could not be verified/);
      const denied = await compiledFetch(origin + '/api/orders');
      assert.equal(denied.status, 401);
      assert.match(denied.headers.get('cache-control')!, /private.*no-store/);
      const routeCheckPath = origin + '/api/internal/w0/build-manifest';
      const deniedRouteCheck = await compiledFetch(routeCheckPath);
      assert.equal(deniedRouteCheck.status, 401);
      const routeCheck = await compiledFetch(routeCheckPath, {
        headers: { authorization: 'Bearer synthetic-compiled-worker-machine' },
      });
      assert.equal(routeCheck.status, 200, await routeCheck.clone().text());
      assert.match(routeCheck.headers.get('cache-control')!, /private.*no-store/);
      assert.deepEqual(await routeCheck.json(), {
        schema: 'lhl.w0-route-check@1',
        w0Setting: { configured: true, target: 'other' },
        selectedWorkflowId: '9E0oVs46bMoiyRIP',
      });
      const queryRouteCheck = await compiledFetch(routeCheckPath + '?probe=1', {
        headers: { authorization: 'Bearer synthetic-compiled-worker-machine' },
      });
      assert.equal(queryRouteCheck.status, 400);
      const redirect = await compiledFetch(origin + '/orders', { headers: nav });
      assert.equal(redirect.status, 303);
      assert.equal(new URL(redirect.headers.get('location')!).pathname, '/__access_setup');
      // Public route must reach compiled Next middleware/router and actual validation.
      const invalidCheckout = await compiledFetch(origin + '/api/checkout/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'synthetic-compiled-invalid' }, body: '{}',
      });
      assert.equal(invalidCheckout.status, 400, await invalidCheckout.clone().text());
      assert.match(JSON.stringify(await invalidCheckout.json()), /invalid|required|validation/i);
      // Exercise the new bounded multipart parser in the actual Worker runtime.
      const boundary = 'lhl-compiled-csv';
      const csvPath = origin + '/api/admin/amazon-orders/upload-csv';
      const multipart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.csv"\r\nContent-Type: text/csv\r\n\r\namazon-order-id,ship-address-1,ship-city,ship-state,ship-postal-code\n\r\n--${boundary}--\r\n`;
      console.log('Compiled CSV case: anonymous denial');
      const deniedCsv = await compiledFetch(csvPath, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: multipart });
      assert.equal(deniedCsv.status, 401);
      console.log('Compiled CSV case: header-only file');
      const emptyCsv = await compiledFetch(csvPath, { method: 'POST', headers: { authorization: 'Bearer synthetic-compiled-worker-machine', 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: multipart });
      assert.equal(emptyCsv.status, 200, await emptyCsv.clone().text());
      assert.equal((await emptyCsv.json()).summary.total_rows, 0);
      const fieldOnly = `--${boundary}\r\nContent-Disposition: form-data; name="file"\r\n\r\nnot a file\r\n--${boundary}--\r\n`;
      console.log('Compiled CSV case: text field');
      const invalidCsv = await compiledFetch(csvPath, { method: 'POST', headers: { authorization: 'Bearer synthetic-compiled-worker-machine', 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: fieldOnly });
      assert.equal(invalidCsv.status, 400);
      assert.deepEqual(await invalidCsv.json(), { error: 'No file provided. Please upload a CSV file.' });
      const cacheNull = await compiledFetch(origin + '/api/preview/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
      assert.equal(cacheNull.status, 400);assert.deepEqual(await cacheNull.json(), { error: 'Invalid request body', exists: false });
      const cacheMissing = await compiledFetch(origin + '/api/preview/check?hash=1234567890abcdef');assert.equal(cacheMissing.status, 400);
      for (const scenario of ['valid-deflated', 'valid-stored', 'rejected-new', 'rejected-existing', 'zero-declared', 'over-expanded']) {
        csvMode = scenario;csvDownloads = 0;csvInserts = 0;csvUpdates = 0;csvTriggers = 0;
        const valid = scenario.startsWith('valid');
        csvArchive = archive([['customization.json', Buffer.from(valid ? JSON.stringify(amazonV3) : scenario === 'zero-declared' || scenario === 'over-expanded' ? '"' + 'x'.repeat(3 * 1024 * 1024) + '"' : 'invalid synthetic JSON'), scenario === 'valid-stored' ? 0 : 8]]);
        if (scenario === 'zero-declared' || scenario === 'over-expanded') {
          const central = csvArchive.readUInt32LE(csvArchive.length - 22 + 16), declared = scenario === 'zero-declared' ? 0 : 1024 * 1024;
          csvArchive.writeUInt32LE(declared, central + 24);csvArchive.writeUInt32LE(declared, 22);
        }
        const csv = ['amazon-order-id,ship-address-1,ship-city,ship-state,ship-postal-code,customized-url,recipient-name,buyer-email', 'TEST-COMPILED-ZIP,1 Test Lane,Test City,CA,00000,https://compiled-worker-download.example.test/synthetic.zip,Synthetic Parent,parent@example.test', ''].join('\n');
        const csvBody = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`;
        const response = await compiledFetch(csvPath, { method: 'POST', headers: { authorization: 'Bearer synthetic-compiled-worker-machine', 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: csvBody });
        assert.equal(response.status, 200, scenario + ': ' + await response.clone().text());const summary = (await response.json()).summary;
        assert.equal(csvDownloads, 1, scenario);assert.equal(csvInserts, valid ? 1 : 0, scenario);assert.equal(csvUpdates, scenario === 'rejected-existing' ? 1 : 0, scenario);assert.equal(csvTriggers, valid || scenario === 'rejected-existing' ? 1 : 0, scenario);
        assert.equal(summary.errors, valid || scenario === 'rejected-existing' ? 0 : 1, scenario);console.log('Compiled customization archive case: ' + scenario);
      }
      csvMode = undefined;
      // Machine authentication reaches the compiled escaped login route, then rejects its mode.
      const machineLogin = await compiledFetch(origin + '/__access_setup', {
        headers: { authorization: 'Bearer synthetic-compiled-worker-machine' },
      });
      assert.equal(machineLogin.status, 403);
      assert.deepEqual(await machineLogin.json(), { error: 'Human sign-in required' });
      const page = await compiledFetch(origin + '/orders', {
        headers: { ...nav, authorization: 'Bearer synthetic-compiled-worker-machine' },
      });
      assert.equal(page.status, 200, await page.clone().text());
      assert.match(page.headers.get('content-type')!, /text\/html/);
      assert.match(await page.text(), /Orders|Loading orders/);
      // All requests travel through the actual compiled middleware and route handlers.
      for (const [path, limit, headers] of [
        ['/api/preview/generate', PUBLIC_BODY_LIMITS.preview, {}],
        ['/api/preview/check', PUBLIC_BODY_LIMITS.preview, {}],
        ['/api/checkout/create', PUBLIC_BODY_LIMITS.checkout, { 'idempotency-key': 'synthetic-compiled-body' }],
        ['/api/webhooks/stripe', PUBLIC_BODY_LIMITS.stripeWebhook, { 'stripe-signature': 'synthetic-invalid-signature' }],
      ] as const) {
        const rejected = await compiledFetch(origin + path, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'transfer-encoding': 'chunked' }, body: ' '.repeat(limit + 1) });
        assert.equal(rejected.status, 413, path + ': ' + await rejected.clone().text());
        assert.deepEqual(await rejected.json(), { error: 'Request body too large', ...(path === '/api/preview/check' ? { exists: false } : {}) });
      }
      const stripe = new Stripe('sk_test_synthetic_compiled_body');
      const event = JSON.stringify({ id: 'evt_compiled_body', object: 'event', type: 'synthetic.unsupported', data: { object: { name: 'é🐕' } } }, null, 2) + '\n';
      const secret = 'whsec_synthetic_compiled_body';
      // Signed whitespace, multibyte data and a body exactly at the Stripe cap.
      for (const payload of [event, event + ' '.repeat(PUBLIC_BODY_LIMITS.stripeWebhook - Buffer.byteLength(event))]) {
        const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
        allowSyntheticIdempotency = true;
        const verified = await compiledFetch(origin + '/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': signature }, body: payload });
        allowSyntheticIdempotency = false;
        assert.equal(verified.status, 200, await verified.clone().text());
        assert.deepEqual(await verified.json(), { received: true });
        const before = syntheticIdempotency;
        const tampered = await compiledFetch(origin + '/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': signature }, body: payload.length < 2000 ? payload + ' ' : event });
        assert.equal(tampered.status, 401); assert.equal(syntheticIdempotency, before);
        const bom = await compiledFetch(origin + '/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: event, secret }) }, body: '\uFEFF' + event });
        assert.equal(bom.status, 401); assert.equal(syntheticIdempotency, before);
      }
      assert.equal(syntheticIdempotency, 4, 'only the two verified synthetic events may reach intercepted idempotency transport');
      assert.equal(outbound, 0, 'compiled validation and rejected auth must not contact providers');
    } finally { await worker.dispose(); }
    // Verify the native Worker output ceiling independently of ZIP metadata.
    const exactDeflate = [...deflateRawSync(Buffer.from('1234'))], oversizedDeflate = [...deflateRawSync(Buffer.alloc(4096, 0x61))];
    const inflateProbe = new Miniflare(convertV4MiniflareOptions({ modules: true,
      script: `import {crc32,inflateRawSync} from 'node:zlib';export default {fetch(){const exact=inflateRawSync(Uint8Array.from(${JSON.stringify(exactDeflate)}),{maxOutputLength:4});let rejected=false;try{inflateRawSync(Uint8Array.from(${JSON.stringify(oversizedDeflate)}),{maxOutputLength:4});}catch{rejected=true;}return Response.json({exact:exact.length,rejected,crc:crc32(new TextEncoder().encode('123456789'))});}}`,
      compatibilityDate: date, compatibilityFlags: flags, outboundService: () => { throw new Error('Native inflater probe forbids outbound traffic'); },
    }));
    try { const response = await inflateProbe.dispatchFetch('http://example.test/');assert.deepEqual(await response.json(), { exact: 4, rejected: true, crc: 0xcbf43926 }); }
    finally { await inflateProbe.dispose(); }

  } finally { await rm(temporary, { recursive: true, force: true }); }
  console.log('Actual compiled Pages Worker: disabled scheduled cron with synthetic replacement, login denial, navigation redirect, protected API denial, bounded CSV multipart and remote archive parsing, preview cache caps, checkout validation, escaped login routing, React page rendering, streamed body caps and exact signed Stripe text; synthetic idempotency only, zero live traffic');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
