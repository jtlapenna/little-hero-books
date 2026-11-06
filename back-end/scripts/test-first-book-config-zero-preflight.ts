import assert from 'node:assert/strict';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
const bookId = 'book-mvp-simple-adventure', orderId = 'LOCAL-ZERO-PREFLIGHT', hash = 'synthetic-zero-appearance';
const variant = process.env.PREFLIGHT_EXPECTATION;
assert.ok(['old-clean', 'old-composed', 'fixed-clean', 'fixed-composed'].includes(variant ?? ''));
const fixed = variant!.startsWith('fixed');
const raw = JSON.parse(JSON.stringify(rawV3()).replaceAll('book-contract-fixture', bookId));
raw.version = 2; raw.status = 'draft'; raw.qa.pose.requiredPoseNumbers = [13, 17];
raw.rendering.recipe.poses['cover-only'].poseNumber = 0;
for (const cover of Object.values(raw.rendering.recipe.covers) as any[]) cover.layers[0].poseNumber = 0;
const config = BookConfigSchema.parse(raw);
const clone = <T,>(value: T): T => structuredClone(value);
function fixture() {
  const w0 = buildW0RunManifestFromConfig(config, { orderId, formatId: 'standard', platform: 'd2c', characterHash: hash,
    input: { bookSpecs: { testMode: true }, characterSpecs: { childName: 'Ada', animalGuide: 'cat' } }, createdAt: '2026-10-30T00:00:00Z', runId: 'zero-proof' });
  const entries: Array<Record<string, any>> = [13, 17].map(poseNumber => ({ poseNumber, characterHash: hash, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, poseNumber, bookId) }));
  return { w0, w2b: { characterHash: hash, order: { orderId, bookId }, entries } };
}
const zero = () => ({ poseNumber: 0, characterHash: hash, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, 0, bookId) });
let externalAttempts = 0;
const original = globalThis.fetch;
globalThis.fetch = async () => { externalAttempts++; throw new Error('Unexpected external fetch'); };
const observations: Array<Record<string, any>> = [];
async function journey(id: string, mutate: (f: ReturnType<typeof fixture>) => void, valid: boolean) {
  const f = fixture(); mutate(f); const normalizations: Array<{ poseNumber: number; imageKey: string }> = [];
  let error = '', result: any;
  try {
    result = await buildW3AssemblyInput({ orderId, bookId, formatId: 'standard', configVersion: 2, characterHash: hash,
      oneManifestKey: f.w0.artifacts.manifestKey, manifest2bKey: `${f.w0.artifacts.orderPrefix}/manifests/2b-manifest.json`, testMode: true }, {
      loadManifest: async key => key.endsWith('/1-manifest.json') ? clone(f.w0) : key.endsWith('/2b-manifest.json') ? clone(f.w2b) : null,
      normalizePoseScale: async args => {
        normalizations.push({ poseNumber: args.poseNumber, imageKey: args.imageKey });
        return { success: true, normalized: false, imageKey: args.imageKey, refKey: args.referenceKey ?? '', poseNumber: args.poseNumber, bookId,
          message: 'Synthetic zero key boundary; bytes not inspected', scaleFactor: 1, verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0,
          sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true };
      },
    });
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const safe = valid ? Boolean(result && !error) : Boolean(!result && error && normalizations.length === 0 && /W3.*(pose|character)/.test(error));
  observations.push({ id, valid, safe, error, resultPresent: Boolean(result), normalizations });
  if (fixed) assert.ok(safe, `${id}: ${error}, effects=${normalizations.length}`);
  if (valid && (fixed || variant === 'old-clean' || id === 'explicit canonical zero')) {
    assert.equal(error, ''); assert.equal(result.orderId, orderId); assert.equal(result.characterHash, hash);
    assert.equal(result.configVersion, 2); assert.equal(result.renderSnapshot.bookConfig.version, 2);
    assert.deepEqual(normalizations.map(x => x.poseNumber).sort((a,b) => a-b), [0, 13, 17]);
    for (const entry of normalizations) assert.equal(entry.imageKey, buildBgRemovedPoseAssetKey(hash, entry.poseNumber, bookId));
  }
  if (variant === 'old-composed' && id === 'implicit canonical zero') {
    assert.match(error, /W3 configured required pose 0 is missing from the manifest/); assert.equal(result, undefined); assert.equal(normalizations.length, 0);
  }
}
async function main() {
  try {
    await journey('implicit canonical zero', () => {}, true);
    await journey('explicit canonical zero', f => { f.w2b.entries.push(zero()); }, true);
    await journey('explicit empty zero', f => { f.w2b.entries.push({ ...zero(), bgRemovedKey: '' }); }, false);
    await journey('explicit malformed zero', f => { f.w2b.entries.push({ ...zero(), bgRemovedKey: { invalid: true } }); }, false);
    await journey('explicit foreign zero', f => { f.w2b.entries.push({ ...zero(), bgRemovedKey: buildBgRemovedPoseAssetKey('foreign-hash', 0, bookId) }); }, false);
    await journey('explicit stale zero identity', f => { f.w2b.entries.push({ ...zero(), characterHash: 'stale-hash' }); }, false);
    await journey('explicit duplicate zero', f => { f.w2b.entries.push(zero(), zero()); }, false);
    await journey('explicit wrong source zero', f => { f.w2b.entries.push({ ...zero(), sourceApprovedKey: `${bookId}/order-generated-assets/characters/${hash}/poses/pose13.png` }); }, false);
    await journey('missing nonzero', f => { f.w2b.entries = f.w2b.entries.filter(entry => entry.poseNumber !== 17); }, false);
    assert.equal(observations.length, 9); assert.equal(externalAttempts, 0);
    if (variant === 'old-clean') {
      const empty = observations.find(x => x.id === 'explicit empty zero')!;
      assert.ok(empty.resultPresent && empty.normalizations.length > 0 && !empty.error);
    }
    console.log(JSON.stringify({ variant, cases: observations.length, allSafe: observations.every(x => x.safe), observations, externalAttempts,
      limitation: 'Synthetic config and no-byte normalization; identity/selection only, no base asset availability claim' }));
  } finally { globalThis.fetch = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
