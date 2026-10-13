import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json', 'utf8'));
const classifier = workflow.nodes.find((candidate: { name: string }) => candidate.name === 'Classify W4 Orders');
const node = workflow.nodes.find((candidate: { name: string }) => candidate.name === 'Claim and Route Gelato Groups');
assert.ok(classifier, 'W1.1 must hydrate complete sibling membership before claiming');
assert.ok(node, 'W1.1 must include provider-aware print claim routing');
const compileClassifier = new Function('$input', '$env', `return async function () { ${classifier.parameters.jsCode} }`);
const compileCode = new Function('$input', '$env', `return async function () { ${node.parameters.jsCode} }`);
const input = { all: () => [
  { json: { id: 42, orderDbId: 42, orderId: 'ROOT-item-1', rootOrderId: 'ROOT', amazonOrderId: 'ROOT', _route: 'sibling' } },
  { json: { id: 43, orderDbId: 43, orderId: 'ROOT-item-2', rootOrderId: 'ROOT', amazonOrderId: 'ROOT', _route: 'sibling' } },
] };
const rows = [
  { id: 41, orderId: 'ROOT', amazon_order_id: 'ROOT', root_order_id: null, execution_status: 'ready_for_processing', next_workflow: '4' },
  { id: 42, orderId: 'ROOT-item-1', amazon_order_id: 'ROOT', root_order_id: 'ROOT', execution_status: 'ready_for_processing', next_workflow: '4-aggregate' },
  { id: 43, orderId: 'ROOT-item-2', amazon_order_id: 'ROOT', root_order_id: 'ROOT', execution_status: 'ready_for_processing', next_workflow: '4-aggregate' },
];
const routeFor = (row: (typeof rows)[number]) => ({
  orderDbId: row.id, orderId: row.orderId, rootOrderId: 'ROOT', provider: 'gelato',
  bookId: 'book-finding-our-inner-voice', configVersion: 2, formatId: 'standard',
  productUid: 'gelato-product', innerPageCount: 32, apiPageCount: 32, expectedPdfPageCount: 35,
});
const routes = rows.map(routeFor);
const env = { BACKEND_BASE_URL: 'https://admin.example.test', BACKEND_API_TOKEN: 'synthetic-token' };

async function run() {
  const classify = compileClassifier(input, {
    SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-supabase-key',
  });
  const classified = await classify.call({ helpers: { request: async (options: Record<string, unknown>) => {
    const query = options.qs as Record<string, unknown>;
    if (query.root_order_id === 'eq.ROOT') return rows.filter((row) => row.root_order_id === 'ROOT');
    if (query.amazon_order_id === 'eq.ROOT') return rows.filter((row) => row.amazon_order_id === 'ROOT' && row.root_order_id == null);
    if (query.orderId === 'eq.ROOT') return [];
    throw new Error('Unexpected membership lookup');
  } } }, input, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-supabase-key' });
  assert.equal(classified.length, 3, 'classifier must emit root row and every child in complete group');
  assert.deepEqual(classified.map((item: { json: { orderDbId: number } }) => item.json.orderDbId).sort(), [41, 42, 43]);
  const claimInput = { all: () => classified };
  const code = compileCode(claimInput, env);
  let calls = 0;
  const dispatchOutput = await code.call({ helpers: { request: async (options: Record<string, unknown>) => {
    calls += 1;
    assert.equal(options.uri, 'https://admin.example.test/api/internal/orders/print-routing/claim');
    assert.deepEqual(options.body, { orderDbIds: [41, 42, 43], idempotencyKey: 'w1.1:ROOT:41-42-43' });
    return { success: true, provider: 'gelato', routes, claim: {
      dispatch: true, submissionId: 'submission-1', claimToken: 'token-1', orderReferenceId: 'ref-1',
    } };
  } } }, claimInput, env);
  assert.equal(calls, 1, 'W1.1 must claim complete root-plus-children group once');
  assert.equal(dispatchOutput.length, 1);
  assert.equal(dispatchOutput[0].json.provider, 'gelato');
  assert.equal(dispatchOutput[0].json.dispatchRoute, 'dispatch');
  assert.equal(dispatchOutput[0].json.routeKind, 'sibling');
  assert.equal(dispatchOutput[0].json.orderId, null, 'sibling envelope must not claim a single order ID');
  assert.equal(dispatchOutput[0].json.orders.length, 3);
  assert.equal(dispatchOutput[0].json.claimToken, 'token-1');

  const singleInput = { all: () => [{ json: { orderId: 'ROOT', orderDbId: 41, claimRootOrderId: 'ROOT' } }] };
  const singleRoutes = [routeFor(rows[0])];
  const singleOutput = await compileCode(singleInput, env).call({ helpers: { request: async (options: Record<string, unknown>) => {
    assert.deepEqual(options.body, { orderDbIds: [41], idempotencyKey: 'w1.1:ROOT:41' });
    return { success: true, provider: 'gelato', routes: singleRoutes, claim: {
      dispatch: true, submissionId: 'single-submission', claimToken: 'single-token', orderReferenceId: 'single-ref',
    } };
  } } }, singleInput, env);
  assert.equal(singleOutput.length, 1);
  assert.equal(singleOutput[0].json.routeKind, 'single');
  assert.equal(singleOutput[0].json.orderId, 'ROOT', 'single W4 envelope must include orderId required by print input');
  assert.equal(singleOutput[0].json.orders[0].orderId, 'ROOT');

  const batchInput = { all: () => [
    { json: { orderId: 'A', orderDbId: 71, rootOrderId: 'A' } },
    { json: { orderId: 'B', orderDbId: 72, rootOrderId: 'B' } },
  ] };
  const responseFor = (id: number) => ({ success: true, provider: 'gelato', routes: [{ ...routes[0], orderDbId: id, orderId: id === 71 ? 'A' : 'B' }],
    claim: { dispatch: true, submissionId: `submission-${id}`, claimToken: `token-${id}`, orderReferenceId: `ref-${id}` } });
  for (const failingId of [71, 72]) {
    const batch = await compileCode(batchInput, env).call({ helpers: { request: async (options: Record<string, unknown>) => {
      const id = (options.body as { orderDbIds: number[] }).orderDbIds[0];
      if (id === failingId) throw new Error('Synthetic HTTP 409');
      return responseFor(id);
    } } });
    assert.equal(batch.length, 2);
    assert.equal(batch.find((item: { json: { dispatchRoute: string } }) => item.json.dispatchRoute === 'dispatch')?.json.orderDbIds[0], failingId === 71 ? 72 : 71);
    const held = batch.find((item: { json: { dispatchRoute: string } }) => item.json.dispatchRoute === 'hold');
    assert.equal(held.json.provider, 'unresolved');
    const branchExpression = workflow.nodes.find((candidate: { name: string }) => candidate.name === 'IF Gelato Print Provider').parameters.conditions.conditions[0].leftValue;
    assert.equal(new Function('$json', 'return ' + branchExpression.slice(3, -2).trim())(held.json), 'gelato', 'Unresolved holds cannot reach Lulu dispatch');
  }
  for (const fenceFails of [false, true]) {
    let fencedId: string | undefined;
    const batch = await compileCode(batchInput, env).call({ helpers: { request: async (options: Record<string, unknown>) => {
      if (String(options.uri).endsWith('/fence')) {
        fencedId = (options.body as { submissionId: string }).submissionId;
        if (fenceFails) throw new Error('Synthetic fence unavailable');
        return { success: true, fenced: true };
      }
      const id = (options.body as { orderDbIds: number[] }).orderDbIds[0];
      const response = responseFor(id);
      if (id === 72) response.routes[0].orderDbId = 999;
      return response;
    } } });
    assert.equal(fencedId, 'submission-72');
    assert.equal(batch[0].json.dispatchRoute, 'dispatch');
    assert.equal(batch[1].json.holdReason, fenceFails ? 'routing_failed_fence_unconfirmed' : 'routing_failed_claim_fenced');
  }
  for (const invalidDispatch of [undefined, null, 'true']) {
    let fences = 0;
    const output = await compileCode(batchInput, env).call({ helpers: { request: async (options: Record<string, unknown>) => {
      if (String(options.uri).endsWith('/fence')) { fences++; return { success: true, fenced: true }; }
      const id = (options.body as { orderDbIds: number[] }).orderDbIds[0];
      const response = responseFor(id);
      if (id === 72) Object.assign(response.claim, { dispatch: invalidDispatch });
      return response;
    } } });
    assert.equal(fences, 1);
    assert.equal(output[0].json.dispatchRoute, 'dispatch');
    assert.equal(output[1].json.submissionId, 'submission-72');
    assert.equal(output[1].json.holdReason, 'routing_failed_claim_fenced');
  }

  const heldOutput = await code.call({ helpers: { request: async () => ({
    success: true, provider: 'gelato', routes, claim: { dispatch: false, reason: 'gate_closed' },
  }) } }, claimInput, env);
  assert.equal(heldOutput.length, 1);
  assert.equal(heldOutput[0].json.dispatchRoute, 'hold');
  assert.equal(heldOutput[0].json.holdReason, 'gate_closed');

  const luluOutput = await code.call({ helpers: { request: async () => ({
    success: true, provider: 'lulu', routes: routes.map((route) => ({ ...route, provider: 'lulu' })), claim: null,
  }) } }, claimInput, env);
  assert.equal(luluOutput.length, 3, 'Lulu orders continue through current per-order path');
  assert.ok(luluOutput.every((item: { json: { provider: string } }) => item.json.provider === 'lulu'));
  assert.equal(workflow.connections['Classify W4 Orders'].main[0][0].node, 'Claim and Route Gelato Groups');
  assert.equal(workflow.connections['IF Gelato Print Provider'].main[0][0].node, 'IF Gelato Claim Dispatch');
  assert.equal(workflow.connections['IF Gelato Print Provider'].main[1][0].node, 'Validate Shipping for w4');
  assert.equal(workflow.connections['IF Gelato Claim Dispatch'].main[1][0].node, 'Log Gelato Claim Held');
  assert.equal(workflow.connections['IF Gelato Sibling Group'].main[0][0].node, 'Trigger W4.1 Gelato');
  assert.equal(workflow.connections['IF Gelato Sibling Group'].main[1][0].node, 'Trigger W4 Gelato');
  for (const triggerName of ['Trigger W4 Gelato', 'Trigger W4.1 Gelato']) {
    const trigger = workflow.nodes.find((candidate: { name: string }) => candidate.name === triggerName);
    assert.equal(trigger.onError, 'continueErrorOutput', `${triggerName} must expose dispatch failure`);
    assert.equal(workflow.connections[triggerName].main[1][0].node, 'Fence Gelato Claim After Dispatch Failure');
  }
  const fenceNode = workflow.nodes.find((candidate: { name: string }) => candidate.name === 'Fence Gelato Claim After Dispatch Failure');
  assert.ok(fenceNode, 'W1.1 must fence claims when the Gelato webhook request fails');
  const fenceCode = new Function('$input', '$env', `return async function () { ${fenceNode.parameters.jsCode} }`);
  let fenceBody: unknown;
  await fenceCode({ first: () => ({ json: dispatchOutput[0].json }) }, env).call({ helpers: { request: async (options: Record<string, unknown>) => {
    assert.equal(options.uri, 'https://admin.example.test/api/internal/orders/print-routing/claim/fence');
    fenceBody = options.body;
    return { success: true, fenced: true };
  } } });
  assert.deepEqual(fenceBody, { submissionId: 'submission-1', claimToken: 'token-1' });
  console.log('W1.1 Gelato claim routing checks passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
