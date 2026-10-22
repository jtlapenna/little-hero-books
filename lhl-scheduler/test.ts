import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mock } from 'node:test';

const root = fileURLToPath(new URL('.', import.meta.url));
const jobs = ['router', 'health-monitor', 'book-config-integrity'];
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
const handlers: Handler[] = [];
for (const job of jobs) {
  const dir = join(root, '.vercel/output/functions/api/cron', `${job}.func`);
  const metadata = JSON.parse(await readFile(join(dir, '.vc-config.json'), 'utf8'));
  assert.equal(metadata.runtime, 'nodejs22.x'); assert.equal(metadata.maxDuration, 300);
  assert.equal(metadata.shouldAddHelpers, false);
  assert.deepEqual((await readdir(dir)).sort(), ['.vc-config.json', 'api', 'lib', 'package.json']);
  assert.deepEqual(await readdir(join(dir, 'lib')), ['relay.js']);
  assert.deepEqual(await readdir(join(dir, 'api/cron')), [`${job}.js`]);
  const source = await readFile(join(dir, 'lib/relay.js'), 'utf8');
  assert.deepEqual([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(x => x[1]), ['node:crypto']);
  assert.ok(!/SUPABASE|BACKEND_API_TOKEN|R2_|n8n|stripe/i.test(source));
  handlers.push((await import(pathToFileURL(join(dir, metadata.handler)).href)).default);
}
const config = JSON.parse(await readFile(join(root, '.vercel/output/config.json'), 'utf8'));
const oldConfig = JSON.parse(await readFile(join(root, '../back-end/vercel.json'), 'utf8'));
assert.deepEqual(config.crons, oldConfig.crons);
assert.deepEqual(config.routes, [{ handle: 'filesystem' }, { src: '/.*', status: 404 }]);
assert.deepEqual((await readdir(join(root, '.vercel/output/functions/api/cron'))).sort(), jobs.map(x => `${x}.func`).sort());

const ingress = 'synthetic-vercel-ingress-secret-123';
const upstream = 'synthetic-backend-cron-secret-456';
const savedEnv = { CRON_SECRET: process.env.CRON_SECRET, LHL_BACKEND_CRON_SECRET: process.env.LHL_BACKEND_CRON_SECRET };
const savedFetch = globalThis.fetch, savedLog = console.info;
const logs: string[] = [];
let calls: Array<{ url: string; init: RequestInit }> = [];
let respond: () => Promise<Response> = async () => new Response('private-upstream-content');
let checks = 0;
class Req extends EventEmitter {
  method = 'GET'; aborted = false;
  url = '/attacker?url=https://attacker.invalid&secret=do-not-reflect';
  headers: Record<string, string | string[] | undefined> = {
    authorization: `Bearer ${ingress}`, cookie: 'private-cookie', 'cf-access-jwt-assertion': 'forged',
    host: 'attacker.invalid', 'x-request-id': 'do-not-reflect',
  };
  rawHeaders = ['Authorization', `Bearer ${ingress}`];
  get body(): never { throw new Error('must never read request body'); }
}
class Res extends EventEmitter {
  destroyed = false; writableEnded = false; status = 0; body = ''; headers: Record<string, string | number | string[]> = {};
  writeHead(status: number, headers: Record<string, string | number | string[]>) { this.status = status; this.headers = headers; return this; }
  end(body: string) { this.body = body; this.writableEnded = true; return this; }
}
function fresh() { process.env.CRON_SECRET = ingress; process.env.LHL_BACKEND_CRON_SECRET = upstream; calls = []; return { req: new Req(), res: new Res() }; }
async function invoke(handler: Handler, req: Req, res: Res) { await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse); }
function check(res: Res, status: number, attempts: number, outcome?: string) {
  assert.equal(res.status, status); assert.equal(calls.length, attempts);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(res.headers['CDN-Cache-Control'], 'no-store');
  if (outcome) assert.deepEqual(JSON.parse(res.body), { outcome });
  assert.ok(!/private|do-not-reflect|synthetic|attacker/.test(res.body)); checks++;
}
try {
  globalThis.fetch = async (input, init) => { calls.push({ url: String(input), init: init! }); return respond(); };
  console.info = (...args: unknown[]) => { logs.push(args.join(' ')); };
  for (let j = 0; j < handlers.length; j++) {
    const handler = handlers[j];
    for (const auth of [undefined, '', 'Bearer ', `bearer ${ingress}`, `Bearer ${ingress} `, 'Bearer forged', 'x'.repeat(1000), `Bearer ${ingress}, Bearer ${ingress}`, [`Bearer ${ingress}`], 'Bearer é'.repeat(25)]) {
      const { req, res } = fresh(); req.headers.authorization = auth;
      await invoke(handler, req, res); check(res, 401, 0, 'unauthorized');
    }
    for (const raw of [[], ['Authorization', `Bearer ${ingress}`, 'authorization', 'other']]) {
      const { req, res } = fresh(); req.rawHeaders = raw; await invoke(handler, req, res); check(res, 401, 0);
    }
    for (const value of [undefined, '', 'short', ' leading-space-secret', 'trailing-space-secret ', 'new-line-secret\r\n', 'non-ascii-secret-é', 'x'.repeat(515), upstream]) {
      const { req, res } = fresh();
      if (value === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = value;
      await invoke(handler, req, res); check(res, 503, 0);
    }
    for (const value of [undefined, '', 'short', ' trailing-secret', 'secret-with-newline\n', '非ASCII-secret-value', ingress]) {
      const { req, res } = fresh();
      if (value === undefined) delete process.env.LHL_BACKEND_CRON_SECRET; else process.env.LHL_BACKEND_CRON_SECRET = value;
      await invoke(handler, req, res); check(res, 503, 0);
    }
    for (const method of ['POST', 'HEAD', 'OPTIONS', 'DELETE']) {
      const { req, res } = fresh(); req.method = method; await invoke(handler, req, res); check(res, 405, 0); assert.equal(res.headers.Allow, 'GET');
    }
    let cancelled = 0;
    respond = async () => ({ status: 200, body: { cancel: () => { cancelled++; return Promise.resolve(); } },
      get headers(): never { throw Error('must not read response headers'); },
      get statusText(): never { throw Error('must not read status text'); },
      text: () => { throw Error('must not read body'); }, json: () => { throw Error('must not read body'); },
    } as unknown as Response);
    {
      const { req, res } = fresh(); await invoke(handler, req, res); check(res, 200, 1, 'upstream_accepted');
      assert.equal(cancelled, 1); assert.equal(calls[0].url, `https://admin.littleherolabs.com/api/cron/${jobs[j]}`);
      assert.deepEqual(calls[0].init.headers, { Authorization: `Bearer ${upstream}` });
      assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.redirect, 'manual');
      assert.equal(calls[0].init.body, undefined); assert.equal(calls[0].init.cache, 'no-store');
      assert.equal(req.listenerCount('error'), 0); assert.equal(req.listenerCount('aborted'), 0); assert.equal(res.listenerCount('close'), 0);
    }
    for (const status of [201, 204, 301, 302, 307, 400, 401, 403, 429, 500]) {
      respond = async () => new Response(status === 204 ? null : 'private-upstream-content', { status, headers: { Location: 'https://attacker.invalid', 'Set-Cookie': 'private-cookie' } });
      const { req, res } = fresh(); await invoke(handler, req, res);
      check(res, status < 300 ? 200 : 502, 1, status < 300 ? 'upstream_accepted' : status < 400 ? 'upstream_redirect_rejected' : 'upstream_failed');
      assert.equal(res.headers['Set-Cookie'], undefined);
    }
    respond = async () => { throw new Error('private-provider-error-with-secret'); };
    { const { req, res } = fresh(); await invoke(handler, req, res); check(res, 502, 1, 'upstream_failed'); }
    { const { req, res } = fresh(); req.aborted = true; await invoke(handler, req, res); check(res, 499, 0); }
    respond = () => new Promise(() => undefined); // Ignores AbortSignal deliberately.
    {
      const { req, res } = fresh(); mock.timers.enable({ apis: ['setTimeout'] });
      const pending = invoke(handler, req, res); assert.equal(calls.length, 1);
      mock.timers.tick(240_000); await pending; mock.timers.reset();
      check(res, 504, 1, 'upstream_timeout'); assert.equal(calls[0].init.signal!.aborted, true);
    }
    for (const event of ['aborted', 'error', 'close']) {
      const { req, res } = fresh(); const pending = invoke(handler, req, res);
      if (event === 'close') res.emit('close'); else req.emit(event, new Error('private-cancel-detail'));
      await pending; check(res, 499, 1, 'caller_cancelled'); assert.equal(calls[0].init.signal!.aborted, true);
    }
  }
  // Concurrent jobs/same-job calls keep their controllers and response outcomes separate.
  {
    const requests = [fresh(), fresh(), fresh()]; const releases: Array<(r: Response) => void> = [];
    respond = () => new Promise(resolve => { releases.push(resolve); });
    const pending = requests.map(({ req, res }, i) => invoke(handlers[i % 2], req, res));
    assert.equal(calls.length, 3); requests[0].req.emit('aborted'); releases[1](new Response(null, { status: 204 })); releases[2](new Response('private', { status: 500 }));
    await Promise.all(pending);
    assert.deepEqual(requests.map(x => x.res.status), [499, 200, 502]);
    assert.deepEqual(calls.map(x => x.init.signal!.aborted), [true, false, false]); checks++;
  }
  assert.ok(logs.every(line => !/private|attacker|do-not-reflect|synthetic/.test(line)));
  assert.ok(logs.every(line => Object.keys(JSON.parse(line)).sort().join(',') === 'job,outcome,status'));
  console.info = savedLog;
  console.log(`PASS: ${checks} compiled scheduler boundary cases; package closure and unchanged schedule verified; no network/provider/job calls`);
} finally {
  globalThis.fetch = savedFetch; console.info = savedLog; mock.timers.reset();
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
