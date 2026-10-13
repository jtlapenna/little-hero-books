import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { NextRequest } from 'next/server';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
    BACKEND_API_TOKEN: 'synthetic-backend', CLOUDFLARE_ACCOUNT_ID: 'synthetic-account',
    CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-access', CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-secret' });
  // Read only the legacy producer node. Never print CONFIG or header literals.
  const workflow = JSON.parse(execFileSync('git', ['show', '46c1f81f00f70de5ec04766bcf406de9735d40dd:docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json'], { encoding: 'utf8', maxBuffer: 2_000_000 }));
  const producer = workflow.nodes.find((node: { name: string }) => node.name === 'Prepare Build 1 Manifest Body');
  const prepare = new Function('$json', producer.parameters.jsCode);
  const upsertNode = workflow.nodes.find((node: { name: string }) => node.name === 'Prepare w0 Upsert Node');
  const prepareUpsert = new Function('$item', upsertNode.parameters.jsCode);
  let storedRow: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  let writes = 0;
  let objectWrites = 0;
  let manualCollision = false;
  let manualFailure = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname.endsWith('.r2.cloudflarestorage.com')) {
      if ((input instanceof Request ? input.method : init?.method) === 'PUT') {
        objectWrites++;
        assert.equal((input as Request).headers.get('If-None-Match'), '*', 'Manual publication must create only');
        return new Response(null, { status: manualCollision ? 412 : 200 });
      }
      return new Response('Synthetic missing manifest', { status: 404 });
    }
    assert.equal(url.origin, 'https://db.example.test');
    if (init?.method && init.method !== 'GET') {
      writes++;
      if (manualFailure && init.method === 'PATCH') return new Response(JSON.stringify({ code: 'P0001', message: 'Synthetic frozen assignment rejected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      assert.equal(init.method, 'POST', 'Completed stale retry must not PATCH downstream fields');
      const payload = JSON.parse(String(init.body));
      assert.equal(payload.print_provider, 'lulu'); assert.equal(payload.print_config_version, 1);
      assert.equal(payload.print_manifest_key, payload.one_manifest_url);
      storedRow = { id: 71, ...payload };
      return new Response(JSON.stringify(storedRow), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/rest/v1/orders' && storedRow) {
      return new Response(JSON.stringify([manualCollision || manualFailure ? { ...storedRow, print_manifest_key: null, print_submission_id: null, print_provider: 'lulu' } : storedRow]), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/rest/v1/book_configs') assert.equal(url.searchParams.get('version'), 'eq.1');
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { POST } = await import('../src/app/api/internal/w0/build-manifest/route');
    const manual = await import('../src/app/api/admin/orders/[orderId]/create-manifest/route');
    const upsert = await import('../src/app/api/internal/w0/upsert-order/route');
    const publish = await import('../src/app/api/internal/w0/publish-manifest/route');
    const send = (body: string) => new NextRequest('https://admin.example.test/api/internal/w0/build-manifest', {
      method: 'POST', headers: { Authorization: 'Bearer synthetic-backend', 'Content-Type': 'application/json' }, body,
    });
    for (const amazon of [false, true]) {
      storedRow = null;
      const payload = { orderId: `LEGACY-W0-${amazon}`, ...(amazon ? { amazonOrderId: 'LEGACY-AMAZON-ROOT' } : {}), bookSpecs: {} };
      const requestBody = prepare(payload)[0].json.requestBody;
      const response = await POST(send(requestBody));
      assert.equal(response.status, 200, 'Existing W0 producer must survive backend-first deployment');
      const result = await response.json();
      assert.equal(result.orderUpsert.print_provider, 'lulu');
      assert.equal(result.orderUpsert.print_config_version, 1);
      assert.equal(result.formatId, amazon ? 'amazon' : 'standard');
      const upsertRequest = prepareUpsert(() => ({ $node: { 'Create Binary (manifest.json)': { json: result } } }))[0].json.requestBody;
      assert.equal((await upsert.POST(send(upsertRequest))).status, 200);
      storedRow = { ...storedRow!, execution_status: 'done', status: 'shipped', next_workflow: '4', customer_email: 'corrected@example.test' };
      const replay = await upsert.POST(send(upsertRequest));
      assert.equal(replay.status, 200); const replayBody = await replay.json();
      assert.equal(replayBody.execution_status, 'done'); assert.equal(replayBody.status, 'shipped');
      assert.equal(replayBody.customer_email, 'corrected@example.test');
      const manualResponse = await manual.POST(new NextRequest('https://admin.example.test/api/admin/orders/test/create-manifest', { method: 'POST' }), { params: Promise.resolve({ orderId: payload.orderId }) });
      assert.equal(manualResponse.status, 409, 'Manual recreation must not overwrite frozen W0 before its rejected DB update');
      assert.equal(objectWrites, 0);
      assert.equal((await publish.POST(send(requestBody))).status, 409, 'New publication endpoint remains strict');
      const changed = JSON.parse(requestBody); changed.configVersion = 2;
      assert.equal((await POST(send(JSON.stringify(changed)))).status, 400, 'Compatibility must not infer a new config version');
      changed.configVersion = undefined; changed.bookId = 'book-finding-our-inner-voice';
      assert.equal((await POST(send(JSON.stringify(changed)))).status, 400, 'Compatibility restricted to existing MVP book');
    }
    manualCollision = true;
    const before = writes;
    const colliding = await manual.POST(new NextRequest('https://admin.example.test/api/admin/orders/test/create-manifest', { method: 'POST' }), { params: Promise.resolve({ orderId: String(storedRow!.orderId) }) });
    assert.equal(colliding.status, 409); assert.equal(writes, before); assert.equal(objectWrites, 1);
    manualCollision = false; manualFailure = true;
    const failed = await manual.POST(new NextRequest('https://admin.example.test/api/admin/orders/test/create-manifest', { method: 'POST' }), { params: Promise.resolve({ orderId: String(storedRow!.orderId) }) });
    assert.equal(failed.status, 500, 'Rejected database write must not report successful manual recovery');
    assert.equal(writes, before + 1);
    assert.equal(writes, 3, 'Two initial upserts and one rejected manual update; stale retries and collision must not write');
  } finally { globalThis.fetch = originalFetch; }
  console.log('Existing W0 producer rollout compatibility regression passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
