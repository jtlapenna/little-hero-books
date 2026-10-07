import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { configuredBookFixture } from './configured-book-fixture';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { readOrderPoseContext } from '../src/lib/books/order-pose-context';
import { regeneratePoseResponse } from '../src/app/api/orders/[orderId]/regenerate-pose/route';
import { rejectRevisionResponse } from '../src/app/api/orders/[orderId]/reject-revision/route';

async function main() {
  const config = configuredBookFixture();
  const orderId = 'POSE-REVIEW-01';
  const params = { params: Promise.resolve({ orderId }) };
  const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: 'd2c', formatId: 'standard' });
  const bookId = config.bookId;
  const orderPrefix = `${bookId}/orders/${orderId}`;
  const readPoseContext: typeof readOrderPoseContext = input => readOrderPoseContext(input, async () => w0);
  const request = (body: Record<string, unknown>) => new NextRequest('https://fixture.example/api', { method: 'POST', body: JSON.stringify({ bookId, orderPrefix, ...body }), headers: { 'Content-Type': 'application/json' } });
  const manifest = { characterHash: 'testhash', order: { characterHash: 'testhash' }, entries: [], revisions: { history: [], pending: {} } };
  const fetched: string[] = [];
  const getObject = async (_bucket: string, key: string) => {
    fetched.push(key);
    if (key.endsWith('2a-manifest.json')) return Response.json(manifest);
    throw new Error('STOP_AFTER_REFERENCE_SELECTION');
  };
  const response = await regeneratePoseResponse(request({ poseNumber: 13, revisionPrompt: 'Fixture revision', includePoseReference: true }), params, { getObject, readPoseContext });
  assert.equal(response.status, 500);
  assert.ok(fetched.includes(`${bookId}/characters/references/custom-run.png`), 'Actual revision handler must fetch frozen named reference');
  fetched.length = 0;
  const rejected = await regeneratePoseResponse(request({ poseNumber: 99, revisionPrompt: 'Fixture revision', includePoseReference: true }), params, { getObject, readPoseContext });
  assert.equal(rejected.status, 400); assert.equal(fetched.length, 1);
  let effects = 0;
  const rejectedRevision = await rejectRevisionResponse(request({ poseNumber: 99, temporaryR2Key: 'temporary.png' }), params, { getObject, readPoseContext, deleteObject: async () => { effects++; return new Response(); }, putObject: async () => { effects++; return new Response(); } });
  assert.equal(rejectedRevision.status, 400); assert.equal(effects, 0);
  const legacyId = 'book-mvp-simple-adventure';
  const legacy = await readOrderPoseContext({ bookId: legacyId, orderPrefix: `${legacyId}/orders/${orderId}` }, async () => { throw new Error('R2 404 Not Found'); });
  assert.deepEqual(legacy.allowed, Array.from({ length: 13 }, (_, i) => i));
  const legacyContext: typeof readOrderPoseContext = input => readOrderPoseContext(input, async () => { throw new Error('R2 404 Not Found'); });
  const legacyRequest = new NextRequest('https://fixture.example/api', { method: 'POST', body: JSON.stringify({ bookId: legacyId, orderPrefix: `${legacyId}/orders/${orderId}`, poseNumber: 1, revisionPrompt: 'Legacy', includePoseReference: true }) });
  await regeneratePoseResponse(legacyRequest, params, { getObject, readPoseContext: legacyContext });
  assert.ok(fetched.includes(`${legacyId}/characters/poses/pose01.png`));
  await assert.rejects(() => readOrderPoseContext({ bookId, orderPrefix }, async () => { throw new Error('network unavailable'); }), /network/);
  await assert.rejects(() => readOrderPoseContext({ bookId, orderPrefix }, async () => null), /snapshot|frozen/);
  console.log('Configured and legacy revision-handler boundary tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
