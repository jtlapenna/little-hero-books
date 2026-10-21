import assert from 'node:assert/strict';
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
  let outbound = 0;
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
      env: { PATH: process.env.PATH, HOME: temporary, TMPDIR: process.env.TMPDIR,
        WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(temporary, 'wrangler.log') },
    });
    const worker = new Miniflare(convertV4MiniflareOptions({
      modules: true, scriptPath: join(temporary, 'modules/_worker.js'), modulesRoot: join(temporary, 'modules'),
      compatibilityDate: date, compatibilityFlags: flags,
      bindings: {
        SUPABASE_URL: 'https://compiled-worker-db.example.test', NEXT_PUBLIC_SUPABASE_URL: 'https://compiled-worker-db.example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'synthetic-compiled-worker-key', BACKEND_API_TOKEN: 'synthetic-compiled-worker-machine',
        ADMIN_SITE_ORIGIN: 'https://admin.littleherolabs.com',
        GELATO_DRAFT_SUBMISSION_ENABLED: 'false', GELATO_CANCEL_ENABLED: 'false', GELATO_STATUS_RELAY_ENABLED: 'false',
        GELATO_STATUS_POLLING_ENABLED: 'false', GELATO_SCHEDULED_STATUS_ENABLED: 'false', GELATO_NOTIFICATIONS_ENABLED: 'false',
      },
      serviceBindings: { ASSETS: async () => new WorkerResponse('Missing synthetic asset', { status: 404 }) },
      outboundService: async request => { outbound++; throw new Error('Outbound blocked: ' + new URL(request.url).origin); },
    }));
    try {
      const local = await worker.ready;
      assert.equal(local.hostname, '127.0.0.1');
      // Raw loopback HTTP preserves browser navigation headers. Miniflare's
      // fetch transport replaces sec-fetch-mode with cors before Worker entry.
      const compiledFetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => new Promise<Response>((resolveResponse, reject) => {
        const target = new URL(url);
        const request = httpRequest(new URL(target.pathname + target.search, local), {
          method: init.method ?? 'GET', headers: { ...init.headers, 'MF-Original-URL': url, 'MF-Disable-Pretty-Error': 'true' },
        }, response => {
          const chunks: Buffer[] = [];
          response.on('data', chunk => chunks.push(Buffer.from(chunk)));
          response.on('error', reject);
          response.on('end', () => {
            const headers = new Headers();
            for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
            const bytes = Buffer.concat(chunks);
            resolveResponse(new Response(bytes.length ? bytes : null, { status: response.statusCode!, headers }));
          });
        });
        request.on('error', reject);
        request.setTimeout(15000, () => request.destroy(new Error('Local Worker request timed out')));
        request.end(init.body);
      });
      const origin = 'https://admin.littleherolabs.com';
      const nav = { accept: 'text/html', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
      const login = await compiledFetch(origin + '/__access_setup', { headers: nav });
      assert.equal(login.status, 401);
      assert.match(await login.text(), /Sign-in could not be verified/);
      const denied = await compiledFetch(origin + '/api/orders');
      assert.equal(denied.status, 401);
      assert.match(denied.headers.get('cache-control')!, /private.*no-store/);
      const redirect = await compiledFetch(origin + '/orders', { headers: nav });
      assert.equal(redirect.status, 303);
      assert.equal(new URL(redirect.headers.get('location')!).pathname, '/__access_setup');
      // Public route must reach compiled Next middleware/router and actual validation.
      const invalidCheckout = await compiledFetch(origin + '/api/checkout/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'synthetic-compiled-invalid' }, body: '{}',
      });
      assert.equal(invalidCheckout.status, 400, await invalidCheckout.clone().text());
      assert.match(JSON.stringify(await invalidCheckout.json()), /invalid|required|validation/i);
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
      assert.equal(outbound, 0, 'compiled validation and rejected auth must not contact providers');
    } finally { await worker.dispose(); }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  console.log('Actual compiled Pages Worker: login denial, navigation redirect, protected API denial, checkout validation, escaped login routing, React page rendering; zero outbound traffic');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
