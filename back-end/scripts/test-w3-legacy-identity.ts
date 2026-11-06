import assert from 'node:assert/strict';
import { buildW0RunManifest } from '../src/lib/books';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

const bookId = 'book-mvp-simple-adventure';
const orderId = 'LOCAL-CHILD-A';
const hash = 'sharedhash';
const w0 = buildW0RunManifest({ orderId, rootOrderId: 'LOCAL-ROOT', amazonOrderId: 'LOCAL-ROOT', platform: 'amazon', bookId, formatId: 'amazon', characterHash: hash, input: { characterSpecs: { childName: 'Ada' } } });
const entries = [1, 2].map(poseNumber => ({ poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, poseNumber, bookId) }));
async function run(manifest: Record<string, unknown>, one: unknown = w0, input: Record<string, unknown> = { orderId, rootOrderId: 'LOCAL-ROOT', amazonOrderId: 'LOCAL-ROOT', bookId }) {
  let writes = 0;
  const result = buildW3AssemblyInput(input, {
    loadManifest: async key => key.endsWith('1-manifest.json') ? one : key.endsWith('2b-manifest.json') ? manifest : null,
    normalizePoseScale: async ({ imageKey }) => { writes++; return { sourceBBoxFound: true, referenceBBoxFound: true, refKey: imageKey } as never; },
  });
  return { result, writes: () => writes };
}
async function main() {
  // Reuse keeps the source's asset keys but rewrites the nested order identity.
  const good = await run({ orderId: 'SOURCE-ORDER', order: { orderId, characterHash: hash }, characterHash: hash, entries });
  await good.result;
  assert.ok(good.writes() > 0);
  const sparse = await run({ characterHash: hash, entries });
  await sparse.result;
  const sparseW0 = await run({ characterHash: hash, entries }, { order: { orderId } });
  await sparseW0.result;
  const missingW0 = await run({ characterHash: hash, entries }, null);
  await missingW0.result;
  const differentLegacyRoots = await run({ characterHash: hash, order: { orderId, rootOrderId: 'LEGACY-ROOT', amazonOrderId: 'LEGACY-MARKETPLACE' }, entries });
  await differentLegacyRoots.result;
  const oddName = await run({ characterHash: hash, entries: [{ poseNumber: 1, bgRemovedKey: `${bookId}/order-generated-assets/characters/${hash}/repair/odd-name.png` }] });
  await oddName.result;
  for (const manifest of [
    { order: { orderId: 'LOCAL-CHILD-B', characterHash: hash }, characterHash: hash, entries },
    { order: { orderId, characterHash: 'otherhash' }, characterHash: 'otherhash', entries },
    { order: { orderId, characterHash: hash }, characterHash: hash, entries: [{ ...entries[0], bgRemovedKey: buildBgRemovedPoseAssetKey('otherhash', 1, bookId) }] },
    { order: { orderId, characterHash: hash }, characterHash: hash, entries: [{ ...entries[0], characterHash: 'otherhash' }] },
    { order: { orderId, characterHash: hash }, characterHash: hash, entries: [{ ...entries[0], sourceApprovedKey: `${bookId}/order-generated-assets/characters/otherhash/poses/pose01.png` }] },
    { characterHash: hash, entries: [{ poseNumber: 1, bgRemovedKey: 'opaque/pose01.png' }] },
  ]) {
    const attempt = await run(manifest);
    await assert.rejects(attempt.result, /identity|character|sibling/i);
    assert.equal(attempt.writes(), 0);
  }
  const aliases = await run({ characterHash: hash, entries }, { orderId, characterHash: hash, order: { orderId, characterHash: 'otherhash' } });
  await assert.rejects(aliases.result, /identity|character/i);
  assert.equal(aliases.writes(), 0);
  const snake = await run({ characterHash: hash, order: { orderId: 'LOCAL-CHILD-B' }, entries }, { orderId: 'LOCAL-CHILD-B', characterHash: hash }, { order_id: orderId, bookId });
  await assert.rejects(snake.result, /identity|sibling/i);
  assert.equal(snake.writes(), 0);
  console.log('W3 legacy identity tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
