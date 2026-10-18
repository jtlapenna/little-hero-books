import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as WorkerResponse } from 'miniflare';

async function main() {
  const source = await fs.readFile('wrangler.toml', 'utf8');
  const date = source.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flagBlock = source.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1];
  assert.ok(date && flagBlock);
  const flags = [...flagBlock.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const verifierPath = resolve('src/lib/books/gelato-stored-file.ts'), r2Path = resolve('src/lib/r2-client.ts');
  const entry = `import {createGelatoStoredFileVerifier,GELATO_STORED_FILE_HOST} from ${JSON.stringify(verifierPath)};
import {getObject,R2_ORDERS_BUCKET} from ${JSON.stringify(r2Path)};
export default {async fetch(request) {
 const legacy=new URL(request.url).pathname==='/legacy';
 if(legacy){try{await fetch('https://legacy.example/synthetic',{redirect:'error'});return Response.json({unsupported:false});}catch(e){return Response.json({unsupported:e instanceof TypeError});}}
 const key='book/orders/TEST-SYNTHETIC/gelato/print/v2/'+'a'.repeat(24)+'.pdf';
 const member={child_order_key:'TEST-SYNTHETIC',artifact_key:key,artifact_fingerprint:'a'.repeat(24),artifact_claim_token:'synthetic-token',pdf_page_count:35};
 const verifier=createGelatoStoredFileVerifier({loadArtifact:(key,signal)=>getObject(R2_ORDERS_BUCKET,key,{signal,redirect:'manual',allowErrorResponse:true})});
 try{return Response.json({verified:await verifier(member,'https://'+GELATO_STORED_FILE_HOST+'/synthetic.pdf','https://admin.littleherolabs.com/api/pdf/'+key)});}
 catch{return Response.json({rejected:true});}
}};`;
  const bundled = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'], external: ['node:*'], logLevel: 'silent' });
  let scenario = 'match', redirectStatus = 302; const calls: string[] = [];
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: date, compatibilityFlags: flags,
    bindings: { CLOUDFLARE_ACCOUNT_ID: 'synthetic-worker', CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-access', CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-secret' },
    outboundService: async request => {
      const url = new URL(request.url), leg = url.hostname === 'little-hero-orders.synthetic-worker.r2.cloudflarestorage.com' ? 'r2' :
        url.hostname === 'gelato-api-live.s3.eu-west-1.amazonaws.com' ? 'provider' : 'forbidden';
      calls.push(leg); // Count forbidden attempts before throwing: the Worker may catch transport errors.
      assert.notEqual(leg, 'forbidden', 'Engine must never follow a redirect or use an external service'); assert.equal(request.method, 'GET');
      if (scenario === `${leg}-redirect`) return new WorkerResponse('identical', { status: redirectStatus, headers: { Location: 'https://unapproved.example/never-follow' } });
      return new WorkerResponse(scenario === 'mismatch' && leg === 'provider' ? 'changed' : 'identical');
    } }));
  try {
    assert.deepEqual(await (await worker.dispatchFetch('http://local/legacy')).json(), { unsupported: true }); assert.equal(calls.length, 0, 'Old redirect mode fails in real engine before outbound access');
    assert.deepEqual(await (await worker.dispatchFetch('http://local/verify')).json(), { verified: true }); assert.deepEqual(calls, ['r2', 'provider']);
    scenario = 'mismatch'; calls.length = 0; assert.deepEqual(await (await worker.dispatchFetch('http://local/verify')).json(), { verified: false });
    for (const leg of ['r2', 'provider']) for (const status of [301, 302, 303, 307, 308]) {
      scenario = `${leg}-redirect`; redirectStatus = status; calls.length = 0;
      assert.deepEqual(await (await worker.dispatchFetch('http://local/verify')).json(), { rejected: true }, `${leg} ${status}`);
      assert.deepEqual(calls, leg === 'r2' ? ['r2'] : ['r2', 'provider'], 'No follow-up redirect request');
    }
  } finally { await worker.dispose(); }
  console.log('Actual production-config Worker engine: legacy redirect error, real R2/provider byte equality, mismatch and all five redirect statuses reject without following');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
