import assert from 'node:assert/strict';
import { configuredBookFixture, configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { resolveW2APoseWorklistResponse } from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import { buildW2BWorklist } from '../src/lib/books/w2b-worklist';

const orderId = 'TEST-W3-WORKLIST';
const hash = 'testhash';
const makeEntries = (bookId: string, poses = [13, 17, 18]) => poses.map(poseNumber => ({
  poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, poseNumber, bookId),
  approvedKey: `${bookId}/order-generated-assets/characters/${hash}/poses/pose${String(poseNumber).padStart(2, '0')}.png`,
}));
const run = (config: ReturnType<typeof configuredBookFixture>, entries: unknown[], formatId = 'standard', existing?: Set<string>) => {
  const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', formatId, characterHash: hash,
    input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
  let writes = 0;
  const result = buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId }, {
    loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? { characterHash: hash, entries } : null,
    normalizePoseScale: async ({ imageKey }) => { if (existing && !existing.has(imageKey)) throw new Error('NoSuchKey'); writes++; return { sourceBBoxFound: true, referenceBBoxFound: true, refKey: imageKey } as never; },
  });
  return { result, writes: () => writes };
};
async function main() {
  const producerConfig = configuredBookFixture();
  const producerW0 = buildW0RunManifestFromConfig(producerConfig, { orderId, platform: 'd2c', formatId: 'standard', characterHash: hash,
    input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
  const prefix = `${producerConfig.bookId}/orders/${orderId}`;
  const w2a = await resolveW2APoseWorklistResponse({ orderId, bookId: producerConfig.bookId, formatId: 'standard', oneManifestUrl: `${prefix}/manifests/1-manifest.json` }, {
    downloadOneManifest: async () => producerW0, instrumentPoseWorkItems: async input => input.poseWorklist,
  });
  assert.deepEqual(w2a.poseWorklist.map(item => item.poseNumber), [0, 13, 17, 18]);
  const approved = { characterHash: hash, order: { orderId, bookId: producerConfig.bookId }, entries: w2a.poseWorklist.map(item => ({
    poseNumber: item.poseNumber, approved: true, status: 'approved', approvedKey: `${producerConfig.bookId}/order-generated-assets/characters/${hash}/poses/pose${String(item.poseNumber).padStart(2, '0')}.png`,
  })) };
  const w2b = await buildW2BWorklist({ orderId, bookId: producerConfig.bookId, orderPrefix: prefix, characterHash: hash }, {
    loadManifest: async key => key.endsWith('2a-manifest.json') ? approved : null,
  });
  assert.deepEqual(w2b.workItems.map(item => item.poseNumber), [0, 13, 17, 18]);
  // The worklist is produced by W2A and W2B. Processed results are local fixtures.
  const produced = w2b.workItems.map(item => ({ poseNumber: item.poseNumber, sourceApprovedKey: item.approvedKey,
    bgRemovedKey: buildBgRemovedPoseAssetKey(hash, item.poseNumber, producerConfig.bookId), briaStatus: 'completed' }));
  const normal = run(producerConfig, produced);
  await normal.result;
  assert.equal(normal.writes(), 3, 'Unused optional pose zero is not normalized');
  const badZero = run(producerConfig, produced.map(entry => entry.poseNumber === 0 ? { ...entry, bgRemovedKey: buildBgRemovedPoseAssetKey('wrong-child', 0, producerConfig.bookId) } : entry));
  await assert.rejects(badZero.result);
  assert.equal(badZero.writes(), 0);
  const duplicateZero = run(producerConfig, [...produced, produced[0]]);
  await assert.rejects(duplicateZero.result);
  assert.equal(duplicateZero.writes(), 0);
  for (const format of ['standard', 'amazon']) {
    const config = configuredBookFixture();
    const good = run(config, makeEntries(config.bookId), format);
    await good.result;
    assert.equal(good.writes(), 3);
    const entries = makeEntries(config.bookId);
    const cases: Array<[string, unknown[]]> = [
      ['missing processed', entries.map(e => e.poseNumber === 17 ? { ...e, bgRemovedKey: null } : e)],
      ['missing cover', entries.filter(e => e.poseNumber !== 18)],
      ['fractional', entries.map(e => e.poseNumber === 18 ? { ...e, poseNumber: 18.5 } : e)],
      ['fractional string', entries.map(e => e.poseNumber === 18 ? { ...e, poseNumber: '18.5' } : e)],
      ['duplicate', [...entries, entries[2]]],
      ['unknown', [...entries, { poseNumber: 19, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, 19, config.bookId) }]],
    ];
    for (const [name, altered] of cases) {
      const attempt = run(config, altered, format);
      await assert.rejects(attempt.result, undefined as never, `${format}: ${name} must hold`);
      assert.equal(attempt.writes(), 0, `${format}: ${name} normalized an asset`);
    }
  }
  const raw = configuredBookRaw();
  raw.rendering.recipe.poses.zero = { poseNumber: 0, referenceKey: `${raw.bookId}/characters/references/pose00.png` };
  for (const cover of Object.values(raw.rendering.recipe.covers) as any[]) cover.layers.push({ id: 'cover-zero', kind: 'pose', poseId: 'zero', poseNumber: 0, placement: { left: 100, top: 200, width: 700 } });
  const zeroConfig = BookConfigSchema.parse(raw);
  // A missing pose-0 manifest entry is deliberate: assembly falls back to the canonical book/hash key and the strict normalization step
  // is what holds when that processed asset does not exist. Prove both halves against a mock that can actually fail.
  const zeroKey = buildBgRemovedPoseAssetKey(hash, 0, zeroConfig.bookId);
  const allKeys = new Set(makeEntries(zeroConfig.bookId).map(entry => entry.bgRemovedKey));
  const absentZero = run(zeroConfig, makeEntries(zeroConfig.bookId), 'standard', new Set(allKeys));
  await assert.rejects(absentZero.result, /pose 00/, 'cover pose zero with no processed asset must hold');
  const fallbackZero = run(zeroConfig, makeEntries(zeroConfig.bookId), 'standard', new Set([...allKeys, zeroKey]));
  await fallbackZero.result;
  assert.equal(fallbackZero.writes(), 4, 'missing pose-0 entry uses the canonical key when the asset exists');
  const withZero = run(zeroConfig, makeEntries(zeroConfig.bookId, [0, 13, 17, 18]));
  await withZero.result;
  assert.equal(withZero.writes(), 4);
  console.log('W3 whole-worklist tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
