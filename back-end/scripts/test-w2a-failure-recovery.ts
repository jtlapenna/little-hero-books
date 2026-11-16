import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { buildW2AFailure, claimTime, originalW2AClaim, verifyFailureChild, W2A_ORCHESTRATOR_ID } from '../src/lib/w2a-execution-failure';
import { getCronExcludedOrderReason } from '../src/lib/cron-order-guards';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://w2a-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-w2a-service',
    CLOUDFLARE_ACCOUNT_ID: 'synthetic-w2a', R2_ACCESS_KEY_ID: 'synthetic-w2a-access', R2_SECRET_ACCESS_KEY: 'synthetic-w2a-secret',
    BACKEND_API_TOKEN: 'synthetic-w2a-machine', N8N_API_KEY: 'synthetic-n8n-key', N8N_API_URL: 'https://w2a-n8n.example.test/api/v1',
    CF_ACCESS_ISSUER: 'https://w2a-test.cloudflareaccess.com', CF_ACCESS_AUDIENCE: 'b'.repeat(64), ADMIN_SITE_ORIGIN: 'https://admin.littleherolabs.com', ADMIN_ALLOWED_EMAILS: 'operator@example.test' });
  const keys = await generateKeyPair('RS256'), jwk = { ...await exportJWK(keys.publicKey), kid: 'w2a-test', alg: 'RS256' };
  const jwt = await new SignJWT({ email: 'operator@example.test', type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: 'w2a-test' })
    .setIssuer(process.env.CF_ACCESS_ISSUER!).setAudience(process.env.CF_ACCESS_AUDIENCE!).setSubject('operator').setIssuedAt().setExpirationTime('10m').sign(keys.privateKey);
  const started = '2026-11-16T05:50:28.244', stopped = '2026-11-16T05:50:34.758Z';
  const initial = { id: 91, orderId: 'TEST-W2A-FAILURE', root_order_id: 'ROOT-W2A', execution_status: 'processing', current_workflow: '2A', next_workflow: '2A',
    workflow_step: 'order_intake', started_at: started, updated_at: '2026-11-16T05:50:28.553595Z', one_manifest_url: 'https://admin.littleherolabs.com/api/manifests/book-finding-our-inner-voice/orders/TEST-W2A-FAILURE/manifests/1-manifest.json',
    product_info: { title: 'Finding Our Inner Voice', _overnight_test: true, _admin_workflow_test: { signed: 'preserved' } }, character_hash: 'synthetic-retry-hash', character_specs: { childName: 'Fixture', age: 2, pronouns: 'he/him', animalGuide: 'tiger', favoriteColor: 'red', skinTone: 'light', hairColor: 'light-brown', hairStyle: 'side-part' },
    print_book_id: 'book-finding-our-inner-voice', print_format_id: 'amazon', print_config_version: 3, print_provider: 'gelato', retry_count: 0,
    review_stages: { preBria: { status: 'pending' } }, manifest_2a_url: null, manifest_2b_url: null, manifest_3_url: null, print_submission_id: null, print_claim_token: null, gelato_order_id: null };
  const { buildW0RunManifestFromConfig } = await import('../src/lib/books/build-run-manifest');
  const { loadBundledBookConfig } = await import('../src/lib/books/load-book-config');
  const one = buildW0RunManifestFromConfig(loadBundledBookConfig({ bookId: initial.print_book_id, version: 3 }), { orderId: initial.orderId, platform: 'amazon', formatId: 'amazon', characterHash: initial.character_hash, input: { characterSpecs: initial.character_specs, orderDetails: initial.product_info } });
  let bootstrap: unknown; let basePresent = false; let bootstrapPresent = true; let stopDuringPut = false; let servedOne: unknown = one; let completeAssets = false; let changeJobDuringHead = false;
  const root = { id: '101', workflowId: W2A_ORCHESTRATOR_ID, status: 'error', startedAt: '2026-11-16T05:50:28.300Z', stoppedAt: stopped,
    workflowData: { nodes: [{ type: 'n8n-nodes-base.executeWorkflow', parameters: { workflowId: { value: 'sw0' } } }] },
    data: { resultData: { error: { executionId: '102', message: 'Subworkflow failed' }, lastNodeExecuted: 'Execute SW0 - Base Character Gen',
      runData: { 'Webhook (Router)': [{ data: { main: [[{ json: { body: structuredClone(initial) } }]] } }] } } } };
  const child = { id: '102', workflowId: 'sw0', status: 'error', stoppedAt: '2026-11-16T05:50:34.664Z', data: { parentExecution: { executionId: '101', workflowId: W2A_ORCHESTRATOR_ID },
    resultData: { error: { message: 'W2A base result requires orderId' }, runData: { 'Generate Custom Base Character1': [{ data: { main: [[{ json: { error: { message: 'Payment required - perhaps check your payment details?', description: 'Your prepayment credits are depleted. PRIVATE_HEADER_VALUE' } } }]] } }] } } } };
  let row = {} as Record<string, unknown>, executions = {} as Record<string, unknown>, jobs = [] as Record<string, unknown>[], writes = 0, calls = 0, readOnly = false, race = false; let racePatch: Record<string, unknown> | null = null;
  const reset = () => { row = structuredClone(initial); executions = { '101': structuredClone(root), '102': structuredClone(child) }; jobs = []; writes = 0; race = false; };
  reset();
  const priorFetch = globalThis.fetch, priorError = console.error;
  const matches = (value: unknown, expression: string) => expression.startsWith('eq.') ? String(value) === expression.slice(3)
    : expression === 'is.null' ? value == null : expression.startsWith('in.') ? expression.slice(4, -1).split(',').map(v => v.replaceAll('"', '')).includes(String(value))
    : expression.startsWith('like.') ? String(value ?? '').startsWith(expression.slice(5).replace('%', '').replace('_', '_')) : true;
  globalThis.fetch = async (input, init) => {
    calls++; const request = new Request(input, init), url = new URL(request.url);
    assert.ok(['w2a-db.example.test', 'w2a-n8n.example.test', 'admin.littleherolabs.com', 'w2a-test.cloudflareaccess.com', 'little-hero-orders.synthetic-w2a.r2.cloudflarestorage.com', 'little-hero-assets.synthetic-w2a.r2.cloudflarestorage.com'].includes(url.hostname), 'unexpected external transport');
    if (url.hostname.endsWith('.r2.cloudflarestorage.com')) {
      if (request.method === 'HEAD') { if (completeAssets && changeJobDuringHead) { jobs![0].status='claimed'; jobs![0].attempt_count=2; changeJobDuringHead=false; } return new Response(null, { status: basePresent || completeAssets ? 200 : 404 }); }
      if (request.method === 'PUT') { assert.equal(request.headers.get('if-none-match'), '*'); if (bootstrapPresent) return new Response(null, { status: 412 }); bootstrap=await request.json(); bootstrapPresent=true; if (stopDuringPut) { row!.execution_status='error_requires_manual_review'; row!.current_workflow=null; row!.started_at=null; row!.updated_at='2099-01-01T00:00:00Z'; } return new Response(null,{status:200}); }
      assert.equal(request.method, 'GET');
      if (url.pathname.endsWith('/1-manifest.json')) return Response.json(servedOne);
      if (url.pathname.endsWith('/2a-manifest.json')) return bootstrapPresent ? Response.json(bootstrap) : new Response(null,{status:404});
      throw Error('Unexpected synthetic artifact lookup');
    }
    if (url.pathname.endsWith('/cdn-cgi/access/certs')) return Response.json({ keys: [jwk] });
    if (url.hostname === 'w2a-n8n.example.test') {
      assert.equal(request.method, 'GET', 'recovery must not dispatch n8n'); assert.equal(init?.redirect, 'error');
      assert.equal(request.headers.get('X-N8N-API-KEY'), 'synthetic-n8n-key'); assert.ok(!url.pathname.includes('/api/v1/api/v1'));
      if (url.pathname === '/api/v1/executions') {
        assert.equal(url.searchParams.get('workflowId'), W2A_ORCHESTRATOR_ID);
        return Response.json({ data: Object.values(executions!).filter((v: any) => v.workflowId === W2A_ORCHESTRATOR_ID) });
      }
      if (url.pathname.startsWith('/api/v1/executions/')) return Response.json(executions![url.pathname.split('/').pop()!]);
      if (url.pathname.startsWith('/api/v1/workflows/')) return Response.json({ id: W2A_ORCHESTRATOR_ID, name: 'W2A', active: true });
      throw Error('unexpected n8n path');
    }
    if (url.hostname === 'admin.littleherolabs.com') { assert.equal(request.method, 'GET'); return Response.json({ error: 'No 2A manifest' }, { status: 404 }); }
    if (url.pathname.endsWith('/workflow_jobs')) {
      return Response.json(jobs!.filter(j => [...url.searchParams].every(([k, v]) => ['select', 'order', 'limit', 'updated_at'].includes(k) || matches(j[k], v))));
    }
    assert.ok(url.pathname.endsWith('/orders'), `unexpected DB path ${url.pathname}`);
    const select = url.searchParams.get('select') ?? '';
    if (select.split(',').some(k => k.trim() === 'order_id')) return Response.json({ code: '42703', message: 'column order_id does not exist' }, { status: 400 });
    if (race && request.method === 'PATCH') { row!.updated_at = '2026-11-16T06:00:00.123456Z'; if(racePatch){Object.assign(row!,racePatch);racePatch=null;} race = false; }
    const found = () => [...url.searchParams].every(([k,v]) => ['select','order','limit','updated_at','or'].includes(k) && !v.startsWith('eq.') || matches(row![k], v));
    const project = () => select === '*' || !select ? row : Object.fromEntries(select.split(',').map(key => key.trim().replaceAll('\"','')).map(key => [key,row![key]]));
    if (request.method === 'PATCH') {
      assert.equal(readOnly, false, 'inspection mutated the order');
      const patch = await request.json();
      if (!found()) return Response.json(null);
      writes++; Object.assign(row!, patch); return Response.json(request.headers.get('accept')?.includes('object') ? project() : [project()]);
    }
    assert.equal(request.method, 'GET');
    return Response.json(request.headers.get('accept')?.includes('object') ? found() ? project() : null : found() ? [project()] : []);
  };
  console.error = () => {};
  try {
    const { buildValidatedW2ABootstrapManifest } = await import('../src/app/api/internal/w2a/bootstrap-manifest/route');
    bootstrap = (await buildValidatedW2ABootstrapManifest({ orderId: initial.orderId, rootOrderId: initial.root_order_id, amazonOrderId: initial.root_order_id, oneManifestUrl: initial.one_manifest_url, orderDetails: initial.product_info }, { downloadOneManifest: async () => one })).manifest;
    const { POST: report } = await import('../src/app/api/internal/w2a/report-failure/route');
    const { GET, POST } = await import('../src/app/api/admin/w2a-recovery/route');
    const { recordW2AExecutionFailure, queueEarlyW2ARetry } = await import('../src/lib/w2a-failure-recovery');
    const req = (path: string, body?: unknown, access = false, authorized = true) => new NextRequest('https://admin.littleherolabs.com'+path, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(authorized ? access ? { 'cf-access-jwt-assertion': jwt, origin: 'https://admin.littleherolabs.com' } : { authorization: 'Bearer synthetic-w2a-machine' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const handler of [report, POST]) { const before = calls; assert.equal((await handler(req('/api/unused', { executionId: '101' }, false, false))).status, 401); assert.equal(calls, before); }
    assert.equal((await report(req('/api/internal/w2a/report-failure', { executionId: '101', spoof: { id: 91 } }))).status, 400);
    assert.equal((await report(req('/api/internal/w2a/report-failure', { executionId: '1'.repeat(2000) }))).status, 413);
    const failure = buildW2AFailure(root, [child]); assert.equal(failure.code, 'w2a_provider_billing'); assert.ok(!JSON.stringify(failure).includes('PRIVATE_HEADER_VALUE'));
    assert.equal(claimTime('2026-11-16T05:50:28.244001'), '2026-11-16T05:50:28.244001Z');
    assert.equal(originalW2AClaim({ ...root, workflowId: 'other' }), null);
    assert.equal(verifyFailureChild(root, { ...child, status: 'running' }), false);
    assert.equal(verifyFailureChild(root, { ...child, workflowId: 'other' }), false);
    readOnly = true;
    let inspection = await GET(req('/api/admin/w2a-recovery?orderId=TEST-W2A-FAILURE')); let dto = await inspection.json();
    assert.equal(inspection.status, 200); assert.equal(dto.candidates.length, 1, JSON.stringify(dto)); assert.equal(dto.inspectedOrder.canRecordFailure, true); assert.equal(writes, 0); readOnly = false;
    const sync = { action: 'record_failure', orderId: initial.orderId, executionId: '101', claimStartedAt: failure.claimStartedAt, updatedAt: row!.updated_at };
    const result = await POST(req('/api/admin/w2a-recovery', sync)); assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
    assert.equal(row!.execution_status, 'error_requires_manual_review'); assert.equal(row!.current_workflow, null); assert.equal(row!.started_at, null); assert.equal(writes, 1);
    assert.equal(getCronExcludedOrderReason(row!), 'w2a_failure_hold');
    assert.deepEqual((row!.product_info as any)._admin_workflow_test, initial.product_info._admin_workflow_test);
    for (const key of ['character_specs','one_manifest_url','print_book_id','print_format_id','print_config_version','print_provider']) assert.deepEqual(row![key], initial[key as keyof typeof initial]);
    await recordW2AExecutionFailure('101'); assert.equal(writes, 1, 'duplicate report is idempotent');
    const priorLog = console.log; console.log = () => {};
    try {
      const { POST: resetAdmin } = await import('../src/app/api/admin/orders/[orderId]/reset/route');
      const { resetOrderToInitialState } = await import('../src/lib/order-reset');
      const { POST: orphaned } = await import('../src/app/api/admin/orphaned-orders/route');
      assert.equal((await resetAdmin(req('/api/admin/orders/TEST-W2A-FAILURE/reset', {}), { params: Promise.resolve({ orderId: initial.orderId }) })).status, 409);
      await assert.rejects(resetOrderToInitialState(initial.orderId), /W2A_FAILURE_HOLD/);
      for (const action of ['schedule_retry','manual_review','reset_processing']) assert.equal((await orphaned(req('/api/admin/orphaned-orders', { orderIds: [91], action }))).status, 409);
      for (const path of ['regenerate-2a','regenerate-2b','regenerate-4']) {
        const {POST: regenerate} = await import('../src/app/api/admin/orders/[orderId]/'+path+'/route');
        assert.equal((await regenerate(req('/api/admin/orders/'+initial.orderId+'/'+path, {}), {params:Promise.resolve({orderId:initial.orderId})})).status,409,'force controls preserve W2A hold');
      }
      assert.equal(writes, 1, 'generic reset/orphan actions preserve the hold');
    } finally { console.log = priorLog; }
    dto = await (await GET(req('/api/admin/w2a-recovery?orderId=TEST-W2A-FAILURE'))).json(); assert.equal(dto.inspectedOrder.safeToRetry, true);
    const retry = { action: 'retry', orderId: initial.orderId, executionId: '101', claimStartedAt: failure.claimStartedAt, updatedAt: row!.updated_at };
    assert.equal((await POST(req('/api/admin/w2a-recovery', { ...retry, resolvedCause: true }))).status, 403, 'machine cannot acknowledge resolved cause');
    assert.equal((await POST(req('/api/admin/w2a-recovery', retry, true))).status, 400); assert.equal(writes, 1);
    assert.equal((await POST(req('/api/admin/w2a-recovery', { ...retry, resolvedCause: true }, true))).status, 200);
    assert.equal(writes, 2); assert.equal(row!.execution_status, 'ready_for_processing'); assert.equal(row!.retry_count, 1);
    assert.equal((await POST(req('/api/admin/w2a-recovery', { ...retry, resolvedCause: true }, true))).status, 400); assert.equal(writes, 2);
    assert.equal((await recordW2AExecutionFailure('101')).recorded, false, 'late report cannot reclaim queued order');
    for (const mutate of [
      () => { row!.started_at = '2026-11-16T05:50:28.244001'; },
      () => { row!.orderId = 'SIBLING'; }, () => { row!.execution_status = 'done'; }, () => { row!.current_workflow = '2B'; },
      () => { row!.print_submission_id = 'owned'; }, () => { row!.print_claim_token = 'foreign-owner'; },
    ]) { reset(); mutate(); assert.equal((await recordW2AExecutionFailure('101')).recorded, false); assert.equal(writes, 0); }
    for (const [index, mutate] of [
      () => { (executions!['101'] as any).status = 'running'; }, () => { (executions!['101'] as any).workflowId = 'other'; },
      () => { (executions!['102'] as any).status = 'running'; }, () => { (executions!['102'] as any).data.parentExecution.executionId = '999'; },
      () => { executions!['103'] = { ...structuredClone(root), id: '103', status: 'running' }; },
    ].entries()) { reset(); mutate(); await assert.rejects(recordW2AExecutionFailure('101'), `execution case ${index}`); assert.equal(writes, 0); }
    reset(); race = true; await assert.rejects(recordW2AExecutionFailure('101')); assert.equal(writes, 0, 'CAS claim revision prevents racing report');
    for (const mutate of [
      () => { jobs = [{ id: 1, order_id: initial.orderId, stage: '2a' }]; },
      () => { row!.manifest_2a_url = 'already-created'; }, () => { row!.workflow_step = '2A-complete'; },
      () => { row!.review_stages = { preBria: { status: 'approved' } }; }, () => { row!.print_submission_id = 'owned'; }, () => { row!.print_claim_token = 'foreign-owner'; },
      () => { row!.updated_at = '2026-11-16T06:00:00Z'; },
      () => { row!.print_format_id = null; }, () => { row!.print_config_version = null; }, () => { row!.print_book_id = null; }, () => { row!.character_hash = null; },
    ]) { reset(); await recordW2AExecutionFailure('101'); const revision = String(row!.updated_at); mutate(); await assert.rejects(queueEarlyW2ARetry({ ...retry, updatedAt: revision, resolvedCause: true, actor: 'operator@example.test' })); assert.equal(writes, 1); }
    reset(); await recordW2AExecutionFailure('101'); const revision = String(row!.updated_at);
    const parallel = await Promise.allSettled([1,2].map(() => queueEarlyW2ARetry({ ...retry, updatedAt: revision, resolvedCause: true, actor: 'operator@example.test' })));
    assert.equal(parallel.filter(p => p.status === 'fulfilled').length, 1); assert.equal(writes, 2);
    const top = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json','utf8'));
    const sw0 = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w2A-SW0-Base_Character_Generation.repo-centric.json','utf8'));
    assert.equal(top.settings.saveDataErrorExecution, 'all'); assert.equal(sw0.settings.saveDataErrorExecution, 'all');
    for (const name of ['Generate Custom Base Character1', 'Process Gemini API response and extract generated image1']) assert.ok(!sw0.nodes.find((n: any) => n.name === name).onError);
    assert.ok(top.nodes.find((n: any) => n.type === 'n8n-nodes-base.errorTrigger'));
    assert.equal(top.settings.errorWorkflow, undefined, 'Self error trigger must not be overridden');
    assert.deepEqual(top.connections['W2A Error Trigger'].main, [[{ node: 'Report W2A Execution Failure', type: 'main', index: 0 }]]);
    assert.equal(top.nodes.find((n: any) => n.name === 'Execute SW0 - Base Character Gen').parameters.options.waitForSubWorkflow, true);
    const reporter = top.nodes.find((n: any) => n.name === 'Report W2A Execution Failure');
    assert.equal(reporter.parameters.body, '={{ JSON.stringify({ executionId: String($json.execution.id) }) }}');
    assert.equal(reporter.parameters.options.redirect.redirect.followRedirects, false);
    assert.equal(reporter.parameters.authentication, 'genericCredentialType');
    assert.equal(reporter.credentials.httpHeaderAuth.id, '__LHL_BACKEND_HEADER_AUTH_CREDENTIAL_ID__');
    const { upsertOrderByPerBookId } = await import('../src/lib/supabase-client');
    reset(); await recordW2AExecutionFailure('101');
    const blockedRewrite = await upsertOrderByPerBookId({ orderId: initial.orderId, execution_status: 'ready_for_processing', next_workflow: '2A', product_info: { replacement: true } });
    assert.ok(blockedRewrite.error); assert.equal(writes, 1);
    row!.execution_status = 'ready_for_processing'; row!.error_type = null;
    assert.equal(getCronExcludedOrderReason(row!), 'w2a_failure_hold', 'durable unresolved evidence survives an old writer clearing status');
    // Actual acknowledged queue → exported router claim/context → existing bootstrap reuse.
    reset(); await recordW2AExecutionFailure('101');
    const queuedRevision = String(row!.updated_at);
    basePresent = true;
    await assert.rejects(queueEarlyW2ARetry({ ...retry, updatedAt: queuedRevision, resolvedCause: true, actor: 'operator@example.test' }), /base character already exists/);
    basePresent = false;
    const savedBootstrap = structuredClone(bootstrap);
    (bootstrap as Record<string, unknown>).entries = [{ poseNumber: 0, uploadKey: 'already-generated.png' }];
    await assert.rejects(queueEarlyW2ARetry({ ...retry, updatedAt: queuedRevision, resolvedCause: true, actor: 'operator@example.test' }), /progress or changed identity/);
    bootstrap = savedBootstrap;
    await queueEarlyW2ARetry({ ...retry, updatedAt: queuedRevision, resolvedCause: true, actor: 'operator@example.test' });
    const router = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json','utf8'));
    const claimExpression = router.nodes.find((n: {name:string}) => n.name === 'Mark as Processing (2A)').parameters.jsonBody;
    const claimedPatch = vm.runInNewContext('('+claimExpression.slice(3,-2)+')', { $json: { workflow: '2A' } });
    Object.assign(row!, claimedPatch, { updated_at: new Date().toISOString() });
    const runTop = (name:string,input:unknown,extra:Record<string,unknown>={}) => vm.runInNewContext('(function(){'+top.nodes.find((n:{name:string})=>n.name===name).parameters.jsCode+'\n})()', {
      $json: input, $input:{first:()=>({json:input})}, $execution:{id:'103',customData:{}}, $getWorkflowStaticData:()=>({}), console:{log(){},warn(){},error(){}}, ...extra,
    });
    const normalized = runTop('Normalize Router Payload',{body:structuredClone(row)})[0].json;
    const captured = runTop('Capture Order Context',normalized)[0].json;
    const payload = JSON.parse(runTop('Prepare Bootstrap 2A Manifest Body',captured)[0].json.requestBody).payload;
    const { POST: bootstrapRoute } = await import('../src/app/api/internal/w2a/bootstrap-manifest/route');
    const previousObjects = JSON.stringify(bootstrap);
    const alternateEdition = structuredClone(loadBundledBookConfig({bookId:initial.print_book_id,version:3})); alternateEdition.version=2;
    servedOne = buildW0RunManifestFromConfig(alternateEdition, {orderId:initial.orderId,platform:'amazon',formatId:'amazon',characterHash:initial.character_hash,input:{characterSpecs:initial.character_specs,orderDetails:initial.product_info}});
    assert.notEqual((await bootstrapRoute(req('/api/internal/w2a/bootstrap-manifest',{payload}))).status,200,'a valid same-order W0 from a different edition cannot replace row frozen assignment');
    servedOne = one;
    for (const field of ['print_book_id','print_format_id','print_config_version','character_hash']) {
      const value = row![field]; row![field]=null;
      assert.notEqual((await bootstrapRoute(req('/api/internal/w2a/bootstrap-manifest',{payload}))).status,200,'configured bootstrap requires complete '+field);
      row![field]=value;
    }
    const reused = await bootstrapRoute(req('/api/internal/w2a/bootstrap-manifest',{payload}));
    assert.equal(reused.status,200,await reused.clone().text());
    assert.equal((await reused.json()).manifestBootstrapReady,true);
    assert.equal(JSON.stringify(bootstrap),previousObjects,'existing bootstrap bytes are preserved');
    assert.equal((row!.product_info as { _w2a_failure: {bootstrapExecutionId:string} })._w2a_failure.bootstrapExecutionId,'103');
    const duplicatePayload = structuredClone(payload); duplicatePayload.orderContext.workflowParentClaim.executionId='104'; duplicatePayload.workflowParentClaim.executionId='104';
    const duplicate = await bootstrapRoute(req('/api/internal/w2a/bootstrap-manifest',{payload:duplicatePayload}));
    assert.notEqual(duplicate.status,200,'a second parent execution cannot share acknowledged restart');
    // A successful conditional first-create must still refuse ownership lost during PUT.
    reset(); bootstrapPresent=false; await recordW2AExecutionFailure('101');
    await queueEarlyW2ARetry({...retry,updatedAt:String(row!.updated_at),resolvedCause:true,actor:'operator@example.test'});
    Object.assign(row!,vm.runInNewContext('('+claimExpression.slice(3,-2)+')',{$json:{workflow:'2A'}}),{updated_at:new Date().toISOString()});
    const firstCapture=runTop('Capture Order Context',runTop('Normalize Router Payload',{body:structuredClone(row)})[0].json)[0].json;
    const firstPayload=JSON.parse(runTop('Prepare Bootstrap 2A Manifest Body',firstCapture)[0].json.requestBody).payload;
    stopDuringPut=true;
    assert.notEqual((await bootstrapRoute(req('/api/internal/w2a/bootstrap-manifest',{payload:firstPayload}))).status,200,'created=true cannot return readiness after claim changed');
    assert.equal(bootstrapPresent,true,'conditionally created empty object is retained on a stale caller');
    stopDuringPut=false;
    // Complete generation is a non-generating recovery, bound to canonical publication and failure revision.
    const { resolveW2APoseWorklistResponse } = await import('../src/app/api/internal/w2a/resolve-pose-worklist/route');
    const { buildW2ARunManifest } = await import('../src/lib/books/w2a-manifest');
    const { buildGeneratedPoseAssetKey } = await import('../src/lib/order-paths');
    const work = await resolveW2APoseWorklistResponse({ orderId: initial.orderId, oneManifestUrl: initial.one_manifest_url }, { instrumentPoseWorkItems: async payload => payload.poseWorklist });
    const published = buildW2ARunManifest({ orderId: initial.orderId, bookId: initial.print_book_id, oneManifestUrl: initial.one_manifest_url, characterHash: initial.character_hash,
      results: work.poseWorklist.map(item => ({ poseNumber: item.poseNumber, qaPass: true, approvedKey: buildGeneratedPoseAssetKey(initial.character_hash, item.poseNumber, initial.print_book_id) })) }).manifest;
    const prepareComplete = async () => {
      reset(); await recordW2AExecutionFailure('101');
      bootstrap = structuredClone(published); bootstrapPresent = true; completeAssets = true;
      jobs = work.poseWorklist.map((item,index) => ({ id:index+1,order_id:initial.orderId,stage:'2a',job_type:'w2a-single-pose',book_id:initial.print_book_id,logical_key:`pose-${String(item.poseNumber).padStart(2,'0')}`,status:'succeeded',updated_at:row!.updated_at,result_snapshot:{} }));
      return { action:'finalize',orderId:initial.orderId,executionId:'101',claimStartedAt:failure.claimStartedAt,updatedAt:row!.updated_at };
    };
    for (const mutate of [
      () => { (bootstrap as any).entries.pop(); }, () => { (bootstrap as any).entries[0].needsReview=true; },
      () => { (bootstrap as any).entries[0].approvedKey='other-book/pose00.png'; }, () => { jobs![0].status='running'; },
      () => { completeAssets=false; }, () => { row!.print_claim_token='owner'; }, () => { row!.manifest_2b_url='downstream'; },
      () => { row!.updated_at='2099-01-01T00:00:00Z'; },
    ]) { const scope=await prepareComplete(); mutate(); assert.equal((await POST(req('/api/admin/w2a-recovery',scope,true))).status,400); assert.equal(writes,1); }
    const racedJobScope=await prepareComplete(); changeJobDuringHead=true;
    assert.equal((await POST(req('/api/admin/w2a-recovery',racedJobScope,true))).status,400); assert.equal(writes,1,'final proof rejects changed jobs');
    const finalizeScope=await prepareComplete();
    const completeDTO=await (await GET(req('/api/admin/w2a-recovery?orderId='+initial.orderId))).json();
    assert.equal(completeDTO.inspectedOrder.safeToFinalize,true,JSON.stringify(completeDTO.inspectedOrder));
    race=true; assert.equal((await POST(req('/api/admin/w2a-recovery',finalizeScope,true))).status,400); assert.equal(writes,1,'completion CAS rejects a race');
    const acceptedScope=await prepareComplete();
    const finalized=await POST(req('/api/admin/w2a-recovery',acceptedScope,true));
    assert.equal(finalized.status,200,await finalized.clone().text()); assert.equal(row!.workflow_step,'2A-complete'); assert.equal(row!.execution_status,'done'); assert.equal(row!.next_workflow,null);
    assert.notEqual(getCronExcludedOrderReason(row!),'w2a_failure_hold'); assert.equal(writes,2);
    const {POST:normalCompletion}=await import('../src/app/api/webhooks/workflow-2a-complete/route');
    const savedCompleted=JSON.stringify(row);
    for (const needsReview of [true,false]) {
      const late=await normalCompletion(req('/api/webhooks/workflow-2a-complete',{orderId:initial.orderId,manifestUrl:row!.manifest_2a_url,needsReview}));
      assert.equal(late.status,200,await late.clone().text()); assert.equal((await late.json()).alreadyCompleted,true); assert.equal(JSON.stringify(row),savedCompleted,'late normal callback cannot reopen recovered completion');
    }
    assert.equal((await POST(req('/api/admin/w2a-recovery',acceptedScope,true))).status,400,'stale finalization is not reusable');
    // Ordinary parent admission prevents a duplicate execution's failure from holding its live owner.
    reset(); bootstrapPresent=false; completeAssets=false; basePresent=false;
    const ordinaryClaim={orderRowId:initial.id,orderId:initial.orderId,startedAt:failure.claimStartedAt,executionId:'101'};
    const ordinaryBody={orderId:initial.orderId,oneManifestUrl:initial.one_manifest_url,workflowParentClaim:ordinaryClaim};
    (executions!['101'] as any).status='running';
    const ordinaryStart=await bootstrapRoute(req('/api/internal/w2a/bootstrap-manifest',{payload:ordinaryBody}));
    assert.equal(ordinaryStart.status,200,await ordinaryStart.clone().text());
    const beforeDuplicate=JSON.stringify(row);
    const duplicateBody={...ordinaryBody,workflowParentClaim:{...ordinaryClaim,executionId:'103'}};
    assert.notEqual((await bootstrapRoute(req('/api/internal/w2a/bootstrap-manifest',{payload:duplicateBody}))).status,200);
    const failedDuplicate=structuredClone(root);failedDuplicate.id='103';failedDuplicate.data.resultData.error={message:'Duplicate bootstrap refused'} as any;
    executions!['103']=failedDuplicate;
    assert.equal((await recordW2AExecutionFailure('103')).recorded,false);assert.equal(JSON.stringify(row),beforeDuplicate);assert.equal(row!.execution_status,'processing');
    // Rejected duplicates never supersede the real owner's later saved failure.
    (executions!['101'] as any).status='error';
    assert.equal((await recordW2AExecutionFailure('101')).recorded,true);
    const ownedFailureDTO=await (await GET(req('/api/admin/w2a-recovery?orderId='+initial.orderId))).json();
    assert.equal(ownedFailureDTO.inspectedOrder.failure.executionId,'101');assert.equal(ownedFailureDTO.inspectedOrder.failureRecorded,true);
    reset();row!.product_info=[{title:'Synthetic original line item',sku:'fixture'}];
    const {admitW2AParentExecution}=await import('../src/lib/w2a-parent-claim');
    const rawItems=structuredClone(row!.product_info);
    await admitW2AParentExecution(row!,ordinaryClaim);
    assert.deepEqual((row!.product_info as any).items,rawItems,'raw API line-item provenance survives metadata reservation');
    // All intake/force writers CAS their original revision, even when that read preceded a failure.
    const lateHold={execution_status:'error_requires_manual_review',current_workflow:null,started_at:null,error_type:failure.code,error_message:failure.message,last_error_at:failure.failedAt,product_info:{...initial.product_info,_w2a_failure:failure}};
    reset();row!.execution_status='ready_for_processing';row!.current_workflow=null;row!.started_at=null;
    race=true;racePatch=lateHold;
    const intakeRace=await upsertOrderByPerBookId({orderId:initial.orderId,execution_status:'ready_for_processing',product_info:{replacement:true}});
    assert.ok(intakeRace.error);assert.equal(writes,0);assert.equal((row!.product_info as any)._w2a_failure.executionId,'101');
    for(const path of ['regenerate-2a','regenerate-2b','regenerate-4']){
      reset();row!.execution_status='done';row!.current_workflow=null;row!.started_at=null;bootstrap={};
      race=true;racePatch=lateHold;
      const {POST:regenerate}=await import('../src/app/api/admin/orders/[orderId]/'+path+'/route');
      assert.equal((await regenerate(req('/api/admin/orders/'+initial.orderId+'/'+path,{}),{params:Promise.resolve({orderId:initial.orderId})})).status,409,path+' late hold must win');
      assert.equal(writes,0);assert.equal(row!.execution_status,'error_requires_manual_review');
    }
    reset();await recordW2AExecutionFailure('101');row!.execution_status='ready_for_processing';row!.error_type=null;
    const {POST:durableReset}=await import('../src/app/api/admin/orders/[orderId]/reset/route');
    const {POST:durableOrphan}=await import('../src/app/api/admin/orphaned-orders/route');
    assert.equal((await durableReset(req('/api/admin/orders/'+initial.orderId+'/reset',{}),{params:Promise.resolve({orderId:initial.orderId})})).status,409);
    assert.equal((await durableOrphan(req('/api/admin/orphaned-orders',{orderIds:[91],action:'reset_processing'}))).status,409);assert.equal(writes,1);
    console.log('W2A actual report/admin handlers: early failure, human-only resolved retry, ownership, redaction, CAS races, zero-job candidates and workflow error wiring passed. No live transport.');
  } finally { globalThis.fetch = priorFetch; console.error = priorError; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
