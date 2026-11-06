import assert from 'node:assert/strict';
import { LocalNoOrderAdmission, stageEndpoints, type Adapter, type Identity, type Request, type Scope } from '../src/lib/inner-voice-no-order/admission';

const identity: Identity = {
  scopeId: 'test-scope', rootId: 'test-root', memberId: 'test-member', childId: 'test-child',
  bookId: 'inner-voice', version: 2, format: 'standard', configSha256: 'a'.repeat(64),
  artifactPrefix: 'no-order/test-scope/test-root/test-member/test-child/',
};
const scope: Scope = { identity, startsAtMs: 1000, expiresAtMs: 3000, generationInputDispatchLimit: 1, previewDispatchLimit: 1, totalDispatchLimit: 3 };
const request: Request = { identity, stage: 'base', endpoint: stageEndpoints.base, operationId: 'operation-1' };
const calls: string[] = [];
const record = (stage: string) => async () => { calls.push(stage); };
const adapter: Adapter = {
  intake: record('intake'), freeze: record('freeze'), base: record('base'),
  pose: record('pose'), normalize: record('normalize'), preview: record('preview'),
};
const create = (s: Scope = scope, a: Adapter = adapter, now = () => 2000) => new LocalNoOrderAdmission(s, a, now);

async function rejectWithoutCall(r: Request, s: Scope = scope, now = () => 2000) {
  calls.length = 0;
  const admission = create(s, adapter, now);
  await assert.rejects(admission.dispatch(r));
  assert.deepEqual(calls, []);
  await assert.rejects(admission.dispatch(request));
  assert.deepEqual(calls, []);
}

async function main() {
await create().dispatch(request);
assert.deepEqual(calls, ['base']);
for (const key of ['scopeId', 'rootId', 'memberId', 'childId', 'bookId', 'configSha256', 'artifactPrefix'] as const) {
  await rejectWithoutCall({ ...request, identity: { ...identity, [key]: 'foreign' } });
}
for (const changed of [{ version: 1 }, { version: 0 }, { version: undefined }, { format: 'amazon' }] as const) {
  await rejectWithoutCall({ ...request, identity: { ...identity, ...changed } as Identity });
}
for (const stage of ['draft', 'print', 'message', 'email', '__proto__', 'constructor']) {
  await rejectWithoutCall({ ...request, stage, endpoint: '/api/internal/w4/materialize-print-pdf' });
}
for (const stage of ['base', 'preview'] as const) {
  await rejectWithoutCall({ ...request, stage: [stage] as unknown as string, endpoint: stageEndpoints[stage] });
}
for (const endpoint of ['/api/internal/w4/materialize-print-pdf', '/api/internal/w2a/build-base-input?other=1', 'https://example.invalid/', '/api/internal/w2a/build-pose-input']) {
  await rejectWithoutCall({ ...request, endpoint });
}
for (const time of [999, 3000, NaN]) await rejectWithoutCall(request, scope, () => time);
for (const bad of [
  { ...scope, expiresAtMs: scope.startsAtMs },
  { ...scope, expiresAtMs: scope.startsAtMs + 3600001 },
  { ...scope, generationInputDispatchLimit: -1 }, { ...scope, previewDispatchLimit: NaN },
  { ...scope, totalDispatchLimit: 0 }, { ...scope, totalDispatchLimit: 10001 },
  { ...scope, identity: { ...identity, rootId: 'customer-order' } },
]) assert.throws(() => create(bad), /invalid scope/);

calls.length = 0;
const a = create();
await a.dispatch(request);
await assert.rejects(a.dispatch({ ...request, operationId: 'operation-2' }), /dispatch limit exceeded/);
assert.deepEqual(calls, ['base']);
await assert.rejects(a.dispatch({ ...request, stage: 'preview', endpoint: stageEndpoints.preview, operationId: 'operation-3' }), /scope closed/);
const renderLimited = create({ ...scope, previewDispatchLimit: 0 });
await assert.rejects(renderLimited.dispatch({ ...request, stage: 'preview', endpoint: stageEndpoints.preview }), /dispatch limit exceeded/);
const attemptsLimited = create({ ...scope, totalDispatchLimit: 1 });
await attemptsLimited.dispatch({ ...request, stage: 'intake', endpoint: stageEndpoints.intake });
await assert.rejects(attemptsLimited.dispatch({ ...request, stage: 'freeze', endpoint: stageEndpoints.freeze, operationId: 'operation-2' }), /dispatch limit exceeded/);
const repeated = create({ ...scope, generationInputDispatchLimit: 2 });
await repeated.dispatch(request);
await assert.rejects(repeated.dispatch(request), /repeated operation/);

let release!: () => void;
const pending = new Promise<void>(resolve => { release = resolve; });
let dispatched = 0;
let completed = 0;
const slow = { ...adapter, base: async () => { dispatched++; await pending; completed++; } };
const concurrent = create(scope, slow);
const first = concurrent.dispatch(request);
await assert.rejects(concurrent.dispatch({ ...request, operationId: 'operation-2' }), /dispatch limit exceeded/);
release();
await first;
assert.equal(dispatched, 1);
assert.equal(completed, 1); // Closing on the rejected call does not cancel the first call.
await assert.rejects(concurrent.dispatch({ ...request, stage: 'intake', endpoint: stageEndpoints.intake, operationId: 'operation-3' }), /scope closed/);

// Identical scopes in different instances have independent counters and operation sets.
calls.length = 0;
await create().dispatch(request);
await create().dispatch(request);
assert.deepEqual(calls, ['base', 'base']);

// An adapter may perform any number of external actions. One input dispatch is
// counted once, regardless of what the trusted adapter does internally.
let simulatedProviderCalls = 0;
const unboundedAdapter = { ...adapter, base: async () => { simulatedProviderCalls += 3; } };
await create(scope, unboundedAdapter).dispatch(request);
assert.equal(simulatedProviderCalls, 3);

const uncertain = create(scope, { ...adapter, base: async () => { throw new Error('timeout'); } });
await assert.rejects(uncertain.dispatch(request), /timeout/);
await assert.rejects(uncertain.dispatch({ ...request, operationId: 'operation-2' }), /scope closed/);

const mutableScope = { ...scope, identity: { ...identity } };
const snapshot = create(mutableScope);
mutableScope.identity.version = 9;
await assert.rejects(snapshot.dispatch({ ...request, identity: mutableScope.identity }), /identity mismatch/);
assert.equal(Object.isFrozen(stageEndpoints), true);
console.log('No-order local admission tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
