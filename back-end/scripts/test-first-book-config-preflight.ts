import assert from 'node:assert/strict';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { validateRunManifest } from '../src/lib/books/validate-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildBgRemovedPoseAssetKey, buildOrderPrefix, buildManifestKeyFromOrderPrefix } from '../src/lib/order-paths';

const bookId = 'book-mvp-simple-adventure';
const orderId = 'LOCAL-CONFIG-PREFLIGHT-A';
const hash = 'synthetic-preflight-appearance';
const clone = <T,>(value: T): T => structuredClone(value);
const raw = JSON.parse(JSON.stringify(rawV3()).replaceAll('book-contract-fixture', bookId));
raw.version = 2; raw.status = 'draft';
const config = BookConfigSchema.parse(raw);
const specs = { childName: 'Ada', animalGuide: 'cat', pronouns: 'they/them' };
const prefix = buildOrderPrefix(orderId, bookId);
function fixture(legacy = false) {
  const selected = legacy ? loadBundledBookConfig({ bookId, version: 1 }) : config;
  const w0 = buildW0RunManifestFromConfig(selected, { orderId, platform: 'd2c', formatId: 'standard', characterHash: hash,
    input: { characterSpecs: specs, bookSpecs: { testMode: true } }, runId: 'fixed-preflight', createdAt: '2026-10-30T00:00:00Z' });
  const numbers = legacy ? Array.from({ length: 12 }, (_, i) => i + 1) : [13, 17, 18];
  const w2b = { characterHash: hash, order: { orderId, bookId }, entries: numbers.map(poseNumber => ({ poseNumber,
    characterHash: hash, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, poseNumber, bookId) })) };
  const input: Record<string, any> = { orderId, bookId, formatId: 'standard', configVersion: legacy ? 1 : 2,
    characterHash: hash, backendUrl: 'https://local-proof.example.test', characterSpecs: clone(specs), testMode: true,
    oneManifestKey: buildManifestKeyFromOrderPrefix(prefix, '1'), manifest2bKey: buildManifestKeyFromOrderPrefix(prefix, '2b') };
  return { w0: w0 as Record<string, any>, w2b: w2b as Record<string, any>, input, noW0: false };
}
const observations: Array<Record<string, unknown>> = [];
const policy = process.env.PREFLIGHT_EXPECTATION ?? 'safe';
assert.ok(['observe', 'safe'].includes(policy));
let globalTransport = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { globalTransport++; throw new Error('Unexpected IP/provider transport'); };
async function journey(id: string, mutate: (f: ReturnType<typeof fixture>) => void, expectedError: RegExp | null, legacy = false) {
  const f = fixture(legacy); mutate(f);
  const normalized: Array<{ imageKey: string; poseNumber: number }> = []; let reads = 0; let error = ''; let result: any;
  try {
    result = await buildW3AssemblyInput(f.input, { loadManifest: async key => {
      reads++;
      if (key.endsWith('/1-manifest.json')) return f.noW0 ? null : clone(f.w0);
      if (key.endsWith('/2b-manifest.json')) return clone(f.w2b);
      return null;
    }, normalizePoseScale: async args => {
      normalized.push({ imageKey: args.imageKey, poseNumber: args.poseNumber });
      return { success: true, normalized: false, imageKey: args.imageKey, refKey: args.referenceKey ?? '',
        poseNumber: args.poseNumber, bookId, message: 'Synthetic no-byte boundary',
        scaleFactor: 1, verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0,
        sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true };
    } });
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const safe = expectedError ? Boolean(error && expectedError.test(error) && normalized.length === 0) : Boolean(result && !error);
  observations.push({ id, expected: expectedError ? String(expectedError) : 'valid journey', safe, error,
    reads, resultPresent: Boolean(result), frozenOrderId: f.w0.order.orderId, returnedOrderId: result?.orderId ?? null, normalizations: normalized, configVersion: result?.configVersion ?? null, snapshot: Boolean(result?.renderSnapshot), legacy });
  if (policy === 'safe' || !expectedError) assert.ok(safe, `${id}: expected ${expectedError ?? 'success'} before effects; error=${error}; normalizations=${normalized.length}`);
  if (!expectedError) {
    assert.equal(result.orderId, orderId); assert.equal(result.bookId, bookId); assert.equal(result.characterHash, hash);
    if (!legacy) {
      assert.equal(result.configVersion, 2); assert.equal(result.renderSnapshot.bookConfig.version, 2);
      assert.deepEqual(result.pageLabels, ['p00', 'p01', 'p02']);
      assert.deepEqual(normalized.map(x => x.poseNumber).sort((a,b) => a-b), [13,17,18]);
      for (const entry of normalized) assert.equal(entry.imageKey, buildBgRemovedPoseAssetKey(hash, entry.poseNumber, bookId));
    } else assert.equal(result.renderSnapshot, undefined);
  }
  return result;
}
async function main() {
  try {
    await journey('valid configured carrier', () => {}, null);
    await journey('valid historical v1', () => {}, null, true);
    await journey('valid alias-only default historical v1', f => { f.noW0 = true; delete f.input.configVersion; delete f.input.formatId; f.input._compatSnapshot = { print_config_version: 1, print_format_id: 'standard' }; }, null, true);
    await journey('reused source-order metadata', f => { f.w2b.orderId = 'OLDER-SOURCE-ORDER'; }, null);
    await journey('foreign background-removed key', f => { f.w2b.entries[0].bgRemovedKey = buildBgRemovedPoseAssetKey('other-hash', 13, bookId); }, /W3.*(pose|character).*identity|W3.*pose key/);
    await journey('wrong same-character source pose', f => { f.w2b.entries[0].sourceApprovedKey = `${bookId}/order-generated-assets/characters/${hash}/poses/pose17.png`; }, /W3.*(source pose|generated pose|pose identity)/);
    await journey('valid generated source revision', f => { f.w2b.entries[0].sourceApprovedKey = `${bookId}/order-generated-assets/characters/${hash}/poses/pose13_r2.png`; }, null);
    await journey('missing cover-only pose', f => { f.w2b.entries = f.w2b.entries.filter((x: any) => x.poseNumber !== 18); }, /W3 configured required pose 18.*missing/);
    await journey('wrong current W2B child', f => { f.w2b.order.orderId = 'SIBLING-B'; }, /W3.*(child order|order identity)|Frozen W0 manifest order identity/);
    await journey('valid sibling W0 under requested child', f => {
      const other = 'SIBLING-B'; f.w0.order.orderId = other; f.w0.order.rootOrderId = other;
      const otherPrefix = buildOrderPrefix(other, bookId);
      f.w0.artifacts.manifestKey = buildManifestKeyFromOrderPrefix(otherPrefix, '1');
      f.input.oneManifestKey = f.w0.artifacts.manifestKey;
    }, /W3.*(manifest key|child order)|Frozen W0 manifest order identity/);
    await journey('contradictory nested request child', f => { f.input.body = { orderId: 'SIBLING-B' }; }, /W3.*child order|Frozen W0 manifest order identity/);
    await journey('conflicting character specs', f => { f.input.characterSpecs.childName = 'Another Child'; }, /W3 character specs conflict/);
    await journey('wrong explicit output prefix', f => { f.input.orderPrefix = buildOrderPrefix('SIBLING-B', bookId); }, /W3.*(prefix|manifest key|child order)|Frozen W0 manifest order identity/);
    await journey('deleted configured snapshot', f => { delete f.w0.book.resolved.renderSnapshot; }, /Configured W0 manifest requires its frozen render snapshot/);
    await journey('missing W0 explicit v2', f => { f.noW0 = true; }, /Missing bundled book config version 2|frozen W0 snapshot/);
    await journey('missing W0 configured alias version', f => { f.noW0 = true; delete f.input.configVersion; f.input._compatSnapshot = { print_config_version: 2 }; }, /Missing bundled book config version 2|frozen W0 snapshot/);
    await journey('missing W0 original snapshot carrier', f => { f.noW0 = true; delete f.input.configVersion; f.input.renderSnapshot = clone(f.w0.book.resolved.renderSnapshot); }, /frozen W0/);
    await journey('missing W0 contradictory version carriers', f => { f.noW0 = true; f.input.configVersion = 1; f.input.orderContext = { print_config_version: 2 }; }, /Conflicting.*version identity|Conflicting W3 configVersion identity/);
    await journey('historical W0 contradictory configured alias', f => { delete f.input.configVersion; f.input._compatSnapshot = { print_config_version: 2 }; }, /Conflicting W3 configVersion identity/, true);
    await journey('historical W0 declared configured snapshot', f => { delete f.input.configVersion; f.input.renderSnapshot = clone(fixture().w0.book.resolved.renderSnapshot); }, /frozen W0/, true);
    for (const version of [2, 999]) {
      let output = false; let error = '';
      try { output = Boolean(buildW3PreviewPlan({ orderId, bookId, configVersion: version, formatId: 'standard', characterHash: hash,
        characterSpecs: specs, backendUrl: 'https://local-proof.example.test', runStamp: 'fixed-preflight' }).pagePreviewItems.length); }
      catch (e) { error = e instanceof Error ? e.message : String(e); }
      const safe = !output && /Missing bundled book config version|frozen W0 snapshot/.test(error);
      observations.push({ id: `standalone declared version ${version}`, safe, output, error });
      if (policy === 'safe') assert.ok(safe, `standalone version ${version} must reject before output`);
    }
    const stripped = fixture().w0; delete stripped.book.resolved.renderSnapshot;
    let validatorError = ''; try { validateRunManifest(stripped); } catch (e) { validatorError = e instanceof Error ? e.message : String(e); }
    const validatorSafe = /Configured W0 manifest requires its frozen render snapshot/.test(validatorError);
    observations.push({ id: 'public validator deleted snapshot', safe: validatorSafe, error: validatorError });
    if (policy === 'safe') assert.ok(validatorSafe);
    assert.equal(globalTransport, 0);
    console.log(JSON.stringify({ schema: 'lhb.configured-w3-preflight-local@1', expectation: policy, observations,
      checked: observations.length, allSafe: observations.every(x => x.safe), externalAttempts: globalTransport,
      fixture: 'Synthetic three-page configured first-book identity v2; not the production book config or geometry proof',
      artworkOrFontParity: false, unmeasuredEffects: ['outputWrites', 'hostedCalls'] }));
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
