import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { archive, amazonV3, amazonNested } from './test-customization-zip';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://zip-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-zip-server', BACKEND_API_TOKEN: 'synthetic-zip-machine', N8N_W0_WEBHOOK_URL: 'https://zip-w0.example.test/hook' });
  const originalFetch = globalThis.fetch, originalLog = console.log, originalWarn = console.warn, originalError = console.error;
  const logs: string[] = [], marker = 'SYNTHETIC_PRIVATE_ZIP_CONSUMER_48791';
  let existing = false, broken = false, fixture = amazonV3 as unknown, inserts = 0, updates = 0, triggers = 0, downloads = 0, checks = 0;
  const specs = { childName: 'Stored Synthetic Child', age: '5', skinTone: 'light', hairColor: 'brown', hairStyle: 'short-straight', favoriteColor: 'blue', animalGuide: 'dog', pronouns: 'they/them' };
  const row = { id: 1, orderId: 'TEST-ZIP-CONSUMER', platform: 'amazon', character_specs: specs, customer_name: 'Synthetic Parent', customer_email: 'parent@example.test', shipping_address: { address_line1: '1 Test Lane', city: 'Test City', state: 'CA', postal_code: '00000', country: 'US' }, product_info: {} };
  const capture = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.log = capture;console.warn = capture;console.error = capture;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init), url = new URL(request.url);
    if (url.origin === 'https://download.example.test') { assert.equal(request.method, 'GET');downloads++;return new Response(new Uint8Array(archive([['customization.json', Buffer.from(broken ? marker : JSON.stringify(fixture))]]))); }
    if (url.origin === 'https://zip-db.example.test') {
      assert.equal(url.pathname, '/rest/v1/orders');let rows: unknown[];
      if (request.method === 'GET') rows = existing ? [row] : [];
      else if (request.method === 'POST') { inserts++;const inserted = await request.json();assert.equal(inserted.character_specs.childName, 'Synthetic Child');rows = [{ id: 2, ...inserted }]; }
      else { assert.equal(request.method, 'PATCH');updates++;rows = [{ id: 1 }]; }
      return Response.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows, { status: request.method === 'POST' ? 201 : 200 });
    }
    assert.equal(url.origin, 'https://zip-w0.example.test');assert.equal(request.method, 'POST');triggers++;
    const payload = await request.json();assert.equal(payload.characterSpecs.childName, broken ? specs.childName : 'Synthetic Child');return Response.json({ ok: true });
  };
  try {
    const { POST } = await import('../src/app/api/admin/amazon-orders/upload-csv/route');
    for (const scenario of ['valid-v3', 'valid-nested', 'rejected-new', 'rejected-existing']) {
      existing = scenario === 'rejected-existing';broken = scenario.startsWith('rejected');fixture = scenario === 'valid-nested' ? amazonNested : amazonV3;
      inserts = 0;updates = 0;triggers = 0;downloads = 0;logs.length = 0;
      const csv = 'amazon-order-id,ship-address-1,ship-city,ship-state,ship-postal-code,customized-url,recipient-name,buyer-email\nTEST-ZIP-CONSUMER,1 Test Lane,Test City,CA,00000,https://download.example.test/synthetic.zip,Synthetic Parent,parent@example.test\n';
      const form = new FormData();form.set('file', new Blob([csv], { type: 'text/csv' }), 'synthetic.csv');
      const response = await POST(new NextRequest('https://admin.example.test/api/admin/amazon-orders/upload-csv', { method: 'POST', headers: { authorization: 'Bearer synthetic-zip-machine' }, body: form }));
      assert.equal(response.status, 200);const body = await response.json();assert.equal(downloads, 1);assert.ok(!JSON.stringify(body).includes(marker));assert.ok(!logs.join('\n').includes(marker));
      assert.equal(inserts, broken ? 0 : 1);assert.equal(updates, existing ? 1 : 0);assert.equal(triggers, scenario === 'rejected-new' ? 0 : 1);
      assert.equal(body.summary.created, broken ? 0 : 1);assert.equal(body.summary.matched, existing ? 1 : 0);assert.equal(body.summary.errors, scenario === 'rejected-new' ? 1 : 0);
      if (scenario === 'rejected-new') assert.match(body.details.errors[0].error, /Invalid JSON in customization ZIP/);
      checks++;
    }
    // Execute the real repair CLI only with a mandatory preload that intercepts
    // every transport, a minimal synthetic environment and no dotenv loader.
    for (const corrupt of [false, true]) {
      const bytes = archive([['customization.json', Buffer.from(corrupt ? marker : JSON.stringify(amazonV3))]]).toString('base64');
      const preload = `import assert from 'node:assert/strict';let inserts=0,triggers=0,downloads=0;globalThis.fetch=async(input,init)=>{const r=input instanceof Request?input:new Request(input,init),u=new URL(r.url);if(u.origin==='https://download.example.test'){assert.equal(r.method,'GET');downloads++;return new Response(Buffer.from('${bytes}','base64'));}if(u.origin==='https://zip-db.example.test'){assert.equal(u.pathname,'/rest/v1/orders');if(r.method==='GET')return Response.json(r.headers.get('accept')?.includes('vnd.pgrst.object')?${JSON.stringify(row)}:[${JSON.stringify(row)}]);assert.equal(r.method,'POST');inserts++;const b=await r.json();assert.equal(b.character_specs.childName,'Synthetic Child');return Response.json(r.headers.get('accept')?.includes('vnd.pgrst.object')?{id:2,...b}:[{id:2,...b}],{status:201});}assert.equal(u.origin,'https://zip-w0.example.test');assert.equal(r.method,'POST');triggers++;return Response.json({ok:true});};process.on('exit',()=>{console.log('SYNTHETIC_CLI_RESULT '+JSON.stringify({inserts,triggers,downloads}));});`;
      const child = spawnSync(process.execPath, ['--import', 'tsx', '--import', 'data:text/javascript,' + encodeURIComponent(preload), 'scripts/create-sibling-order-from-line-item.ts', 'TEST-ZIP-CONSUMER', '--url', 'https://download.example.test/synthetic.zip'], { cwd: process.cwd(), encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH, HOME: '/private/tmp', SUPABASE_URL: 'https://zip-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-zip-server', N8N_W0_WEBHOOK_URL: 'https://zip-w0.example.test/hook' } });
      assert.equal(child.error, undefined);assert.equal(child.status, corrupt ? 1 : 0, child.stdout + child.stderr);
      const result = JSON.parse(child.stdout.match(/SYNTHETIC_CLI_RESULT (.+)/)![1]);assert.deepEqual(result, { inserts: corrupt ? 0 : 1, triggers: corrupt ? 0 : 1, downloads: 1 });
      assert.ok(!child.stderr.includes(marker));checks++;
    }
    originalLog(`Customization consumers: ${checks} actual CSV/repair-CLI cases passed; all writes and W0 calls intercepted, zero live requests`);
  } finally { globalThis.fetch = originalFetch;console.log = originalLog;console.warn = originalWarn;console.error = originalError; }
}
void main().catch(error => { console.error(error);process.exitCode = 1; });
