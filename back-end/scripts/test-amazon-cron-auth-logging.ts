/** Offline regression: complete canonical handlers, real Next HTTP objects, no business transport. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';

type Log = { level: string; args: unknown[] };
type Exports = {
  GET?: (request: NextRequest) => Promise<Response>;
  authorizeBackendBoundary?: (request: Request) => Promise<Response | null>;
};
const captured = 'SYNTHETIC-CAPTURED-ONLY-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const replacement = 'SYNTHETIC-REPLACEMENT-ONLY-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const supplied = 'SYNTHETIC-SUPPLIED-ONLY-cccccccccccccccccccccccccccccccccccccccc';
const message = '[Cron Amazon Orders] Unauthorized - missing or invalid CRON_SECRET';
const sourceRoot = path.resolve(__dirname, '../src');
let cases = 0;

function load(relative: string, secret: string | undefined) {
  const source = readFileSync(path.join(sourceRoot, relative), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const env: Record<string, string | undefined> = { NODE_ENV: 'test' };
  if (secret !== undefined) env.CRON_SECRET = secret;
  const exports: Exports = {}, logs: Log[] = [];
  let businessCalls = 0, transportCalls = 0;
  const forbidden = () => { businessCalls++; throw Error('Business dependency must not execute'); };
  const businessImports: Record<string, Record<string, unknown>> = {
    '@supabase/supabase-js': { createClient: forbidden },
    '@/lib/character-hash': { calculateCharacterHash: forbidden },
    '@/lib/supabase-client': { upsertOrderByPerBookId: forbidden },
    './printer-file-grants': { authorizePrinterFileRequest: forbidden },
    './admin-auth': { requireAdminAuth: forbidden },
    './preview-file-grants': { verifyPreviewImageGrant: forbidden },
    './order-paths': { isOrderAssetKey: forbidden },
    './admin-login-target': { ADMIN_LOGIN_PATH: '/__access_setup', ADMIN_SIGN_IN_HEADER: 'x-lhl-admin-sign-in',
      adminReturnPath: forbidden, adminLoginHref: forbidden, canonicalAdminOrigin: forbidden },
  };
  vm.runInNewContext(compiled.outputText, {
    exports, process: { env }, Request, Response, Headers, URL,
    require: (name: string) => {
      if (name === 'next/server') return { NextRequest, NextResponse };
      assert(Object.hasOwn(businessImports, name), 'Unapproved import: ' + name);
      return businessImports[name];
    },
    fetch: () => { transportCalls++; throw Error('Network forbidden'); },
    console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level =>
      [level, (...args: unknown[]) => { logs.push({ level, args }); }])),
  }, { timeout: 1000, filename: relative });
  return { exports, env, logs, assertNoEffects: () => {
    assert.equal(businessCalls, 0); assert.equal(transportCalls, 0);
  } };
}

function request(authorization?: string, query = '') {
  return new NextRequest('https://offline.example.test/api/cron/amazon-orders' + query, {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });
}
function assertPrivateLogs(logs: Log[]) {
  const serialized = JSON.stringify(logs);
  for (const marker of ['SYNTHETIC-', 'CAPTURED-ONLY', 'SUPPLIED-ONLY', 'REPLACEMENT-ONLY']) {
    assert(!serialized.includes(marker), 'Authorization diagnostics must not disclose token material');
  }
}
async function denied(header?: string, query = '') {
  const route = load('app/api/cron/amazon-orders/route.ts', captured);
  assert(route.exports.GET);
  const response = await route.exports.GET(request(header, query));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  assert.deepEqual(route.logs, [{ level: 'error', args: [message] }], 'Rejected auth emits only its fixed diagnostic');
  assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
}

async function main() {
  for (const header of [undefined, '', 'Bearer ' + supplied, 'bearer ' + captured,
    'Basic ' + supplied, 'Bearer ' + captured + ', Bearer ' + supplied, 'Bearer ' + 'x'.repeat(4096)]) {
    await denied(header);
  }
  await denied('Bearer ' + supplied, '?test=true');
  // Exercise the real central-boundary/handler seam without changing either auth contract.
  {
    const boundary = load('lib/access-boundary.ts', captured);
    assert(boundary.exports.authorizeBackendBoundary);
    assert.equal(await boundary.exports.authorizeBackendBoundary(request('bearer ' + captured)), null);
    boundary.assertNoEffects(); assert.deepEqual(boundary.logs, []);
    await denied('bearer ' + captured); cases++;
  }
  // The module-captured key still wins after a runtime key change. Never log either value.
  {
    const route = load('app/api/cron/amazon-orders/route.ts', captured);
    route.env.CRON_SECRET = replacement; assert(route.exports.GET);
    const response = await route.exports.GET(request('Bearer ' + replacement));
    assert.equal(response.status, 401);
    assert.deepEqual(route.logs, [{ level: 'error', args: [message] }]);
    assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
    const capturedResponse = await route.exports.GET(request('Bearer ' + captured));
    assert.equal(capturedResponse.status, 500);
    assert.deepEqual(await capturedResponse.json(), { error: 'Supabase credentials not configured' });
    assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
  }
  // Legitimate auth progresses only to the existing missing-database gate, never a job.
  for (const runtimeFallback of [false, true]) {
    const route = load('app/api/cron/amazon-orders/route.ts', runtimeFallback ? undefined : captured);
    if (runtimeFallback) route.env.CRON_SECRET = replacement;
    assert(route.exports.GET);
    const response = await route.exports.GET(request('Bearer ' + (runtimeFallback ? replacement : captured)));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Supabase credentials not configured' });
    assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
  }
  for (const missing of [undefined, '']) {
    const route = load('app/api/cron/amazon-orders/route.ts', missing); assert(route.exports.GET);
    const response = await route.exports.GET(request('Bearer ' + supplied));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'Server configuration error');
    assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
  }
  console.log(JSON.stringify({ cases, externalRequests: 0, businessDependencyCalls: 0, credentialFilesRead: 0,
    actualFullRouteCompiled: true, actualFullBoundaryCompiled: true, realNextHttpObjects: true,
    coverage: 'Offline auth rejection/logging and configuration gates; no business processing or deployed Worker test' }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
