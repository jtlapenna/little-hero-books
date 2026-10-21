/** Exercise the real deployment shell against public-page fixtures on loopback only. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = await readFile(path.join(root, '.github/workflows/deploy-frontend-cloudflare-pages.yml'), 'utf8');
const match = workflow.match(/^      - name: Smoke-check customer site\r?\n        run: \|\r?\n((?:          [^\n]*\r?\n?)+)/m);
assert(match, 'The actual frontend deployment smoke step must be tested');
const shell = match[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'lhl-frontend-smoke-'));
const curl = '/usr/bin/curl';
let fixture;
const requests = [];
const largeHome = Buffer.from('<!doctype html><title>Little Hero Labs</title>\n' + 'x'.repeat(4 * 1024 * 1024));
const sitemap = Buffer.from('<?xml version="1.0"?><urlset><url><loc>https://www.littleherolabs.com/personalized-birthday-book</loc></url></urlset>');
const server = http.createServer((request, response) => {
  const key = request.method + ' ' + request.url;
  requests.push(key);
  assert(['GET /', 'GET /sitemap.xml', 'HEAD /'].includes(key), 'No application, customer, order or provider route is permitted');
  response.on('error', () => {}); // A failing pipe may make curl disconnect early.
  const body = request.url === '/sitemap.xml' ? fixture.sitemap : fixture.home;
  const status = request.url === '/sitemap.xml' ? fixture.sitemapStatus : fixture.homeStatus;
  const headers = { 'content-length': body.length };
  if (fixture.hsts) headers['sTrIcT-TrAnSpOrT-SeCuRiTy'] = 'max-age=31536000; includeSubDomains';
  response.writeHead(status, headers);
  if (request.method === 'HEAD') return response.end();
  if (fixture.truncated && request.url === '/') {
    response.write(body.subarray(0, 1024));
    return setTimeout(() => response.destroy(), 20);
  }
  response.end(body);
});

const passed = [];
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const bin = path.join(scratch, 'bin');
  await mkdir(bin);
  // Keep the workflow shell unchanged. Intercept only curl's two fixed public URLs.
  // The real curl binary still exercises buffering, broken pipes, HTTP failures and HEAD.
  await writeFile(path.join(bin, 'curl'), `#!${process.execPath}\n` +
    `const {spawnSync}=require('node:child_process');\n` +
    `const allowed=new Map([['https://www.littleherolabs.com/',${JSON.stringify(origin + '/')}],['https://www.littleherolabs.com/sitemap.xml',${JSON.stringify(origin + '/sitemap.xml')}] ]);\n` +
    `const args=process.argv.slice(2).map(a=>{if(/^https?:/.test(a)){if(!allowed.has(a))throw Error('External URL forbidden');return allowed.get(a);}return a;});\n` +
    `if(!args.some(a=>a.startsWith(${JSON.stringify(origin + '/')})))throw Error('A loopback fixture URL is required');\n` +
    `const r=spawnSync(${JSON.stringify(curl)},['-q',...args],{stdio:'inherit'});process.exit(r.status??1);\n`, {mode: 0o700});

  async function run(label, change, succeeds, expectedRequests) {
    fixture = {home: largeHome, sitemap, hsts: true, homeStatus: 200, sitemapStatus: 200, truncated: false, ...change};
    requests.length = 0;
    const temp = path.join(scratch, String(passed.length));
    await mkdir(temp);
    const result = await new Promise((resolve, reject) => {
      const child = spawn('/bin/bash', ['-c', shell], {
        env: {PATH: bin + ':/usr/bin:/bin', RUNNER_TEMP: temp},
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const errors = [];
      child.stdout.resume();
      child.stderr.on('data', chunk => errors.push(chunk));
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('Local smoke shell timed out')); }, 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve({code, stderr: Buffer.concat(errors).toString()}); });
    });
    if (succeeds) assert.equal(result.code, 0, `${label}: valid responses must pass; ${result.stderr}`);
    else assert.notEqual(result.code, 0, `${label}: a genuine failure must fail the deployment smoke step`);
    assert.deepEqual(requests, expectedRequests, label + ': failure must stop later requests');
    if (succeeds) assert.equal((await readFile(path.join(temp, 'lhl-frontend-home.html'))).length, fixture.home.length, 'The entire homepage must finish downloading');
    passed.push(label);
    console.log('PASS ' + label);
  }

  const all = ['GET /', 'GET /sitemap.xml', 'HEAD /'];
  await run('Large valid homepage, sitemap and case-insensitive HSTS pass without a broken pipe', {}, true, all);
  await run('Missing homepage brand fails before sitemap or HEAD', {home: Buffer.from('wrong homepage')}, false, ['GET /']);
  await run('Homepage HTTP 503 fails before content checks', {homeStatus: 503}, false, ['GET /']);
  await run('Truncated homepage fails even when expected brand arrived first', {truncated: true}, false, ['GET /']);
  await run('Missing sitemap entry fails before HEAD', {sitemap: Buffer.from('<urlset/>')}, false, ['GET /', 'GET /sitemap.xml']);
  await run('Sitemap HTTP 404 fails before HEAD', {sitemapStatus: 404}, false, ['GET /', 'GET /sitemap.xml']);
  await run('Missing HSTS fails after successful content checks', {hsts: false}, false, all);
  await run('A later healthy invocation passes independently', {}, true, all);
  console.log(JSON.stringify({checks: passed.length, externalRequests: 0, deployments: 0, orderOrProviderRequests: 0}));
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(scratch, {recursive: true, force: true});
}
