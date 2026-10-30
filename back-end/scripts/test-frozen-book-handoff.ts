import assert from 'node:assert/strict';
import { configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema, type BookConfig } from '../src/lib/books/types';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW2ABaseInput } from '../src/lib/books/w2a-base-input';
import { buildW2APoseInput } from '../src/lib/books/w2a-pose-input';
import { resolveWorkflowBookConfig } from '../src/lib/books/book-snapshot';
import { resolveW2APoseWorklistResponse } from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import { buildValidatedW2ABootstrapManifest } from '../src/app/api/internal/w2a/bootstrap-manifest/route';
import { inspectWorkflowBookIdentity } from '../src/lib/books/workflow-book-identity';

async function main() {
  let checks = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected external request'); };
  try {
    for (const provider of ['lulu', 'gelato'] as const) {
      const raw = JSON.parse(JSON.stringify(configuredBookRaw()).replaceAll('book-contract-fixture', `book-neutral-${provider}`));
      if (provider === 'gelato') {
        const print = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 }).formats.standard.print;
        for (const format of Object.values(raw.formats) as Array<{ print: unknown }>) {
          format.print = { ...print, innerPageCount: 3, apiPageCount: 3, expectedPdfPageCount: 6 };
        }
      }
      const config = BookConfigSchema.parse(raw);
      const orderId = `FROZEN-NEUTRAL-${provider}`;
      const characterSpecs = { childName: 'Ada', skinTone: 'deep', hairStyle: 'afro', animalGuide: 'owl' };
      const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: 'd2c', formatId: 'standard',
        characterHash: 'neutral-child', input: { characterSpecs } });
      const payload = { orderId, bookId: config.bookId, formatId: 'standard', configVersion: config.version,
        characterHash: 'neutral-child', characterSpecs, poseNumber: 13, oneManifestUrl: w0.artifacts.manifestKey,
        renderSnapshot: w0.book.resolved.renderSnapshot, includeZeroPose: false };
      const options = { loadConfig: async () => { throw new Error('Mutable config read'); }, loadManifest: async () => w0 };
      for (const build of [buildW2ABaseInput, buildW2APoseInput]) {
        const built = await build(payload, options);
        assert.equal(built.bookId, config.bookId); assert.equal(built.configVersion, config.version); checks++;
      }
      let admissions = 0;
      const worklist = await resolveW2APoseWorklistResponse(payload, {
        downloadOneManifest: async () => w0,
        instrumentPoseWorkItems: async value => { admissions++; return value.poseWorklist; },
      });
      assert.deepEqual(worklist.requiredPoseNumbers, [13, 17, 18]); checks++;
      const bootstrap = await buildValidatedW2ABootstrapManifest(payload, { downloadOneManifest: async () => w0 });
      assert.equal(bootstrap.characterHash, 'neutral-child'); checks++;
      for (const change of [
        (value: typeof w0) => { delete value.book.resolved.renderSnapshot; },
        (value: typeof w0) => { value.input.characterSpecs = {}; },
        (value: typeof w0) => { value.artifacts.characterPrefix = null; },
      ]) {
        const invalid = structuredClone(w0); change(invalid);
        const { renderSnapshot: omittedSnapshot, ...request } = payload;
        assert.ok(omittedSnapshot);
        await assert.rejects(() => resolveW2APoseWorklistResponse(request, { downloadOneManifest: async () => invalid,
          instrumentPoseWorkItems: async value => { admissions++; return value.poseWorklist; } }), /frozen.*snapshot|frozen W0 character/i); checks++;
        await assert.rejects(() => buildValidatedW2ABootstrapManifest(request, { downloadOneManifest: async () => invalid }), /frozen.*snapshot|frozen W0 character/i); checks++;
      }
      assert.equal(admissions, 1, 'Rejected requests must not admit jobs'); checks++;
      for (const wrap of [
        (value: object) => ({ orderData: value }), (value: object) => ({ ctx: value }),
        (value: object) => ({ __meta: { snapshot: value } }),
        (value: object) => ({ __meta: { deriveQaPass: { snapshot: value } } }),
        (value: object) => ({ orderContext: value }),
      ]) {
        for (const conflicting of [{ bookId: 'another-book' }, { configVersion: 2 }, { formatId: 'amazon' }, { orderId: 'ANOTHER-ORDER' }]) {
          const request = { ...payload, ...wrap(conflicting) };
          for (const build of [buildW2ABaseInput, buildW2APoseInput]) {
            await assert.rejects(() => build(request, options), /identity|snapshot/i); checks++;
          }
          await assert.rejects(() => resolveW2APoseWorklistResponse(request, { downloadOneManifest: async () => w0,
            instrumentPoseWorkItems: async value => { admissions++; return value.poseWorklist; } }), /identity|snapshot/i); checks++;
        }
      }
      for (const version of [1.5, '1partial', '1.5', 0, Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(() => buildW2APoseInput({ ...payload, configVersion: version }, options), /version identity/); checks++;
      }
      const changedSnapshot = structuredClone(w0.book.resolved.renderSnapshot!);
      changedSnapshot.bookConfig.rendering.recipe!.copy['scene-a'].text = 'Different frozen copy';
      await assert.rejects(() => buildW2ABaseInput({ ...payload, orderData: { renderSnapshot: changedSnapshot } }, options), /Conflicting workflow render snapshots/); checks++;
      await assert.rejects(() => buildW2ABaseInput({ ...payload, renderSnapshot: changedSnapshot }, options), /Conflicting workflow render snapshots/); checks++;
      await assert.rejects(() => buildW2ABaseInput({ ...payload, oneManifestKey: `${config.bookId}/orders/OTHER/manifests/1-manifest.json` }, options), /manifestKey identity/); checks++;
      const sibling = structuredClone(w0);
      sibling.order.orderId = 'SIBLING'; sibling.artifacts.manifestKey = `${config.bookId}/orders/SIBLING/manifests/1-manifest.json`;
      await assert.rejects(() => buildW2ABaseInput(payload, { ...options, loadManifest: async () => sibling }), /key|order identity/); checks++;
      const withoutFalse = structuredClone(w0.book.resolved.renderSnapshot!); delete withoutFalse.testOnly;
      const same = await buildW2ABaseInput({ ...payload, renderSnapshot: withoutFalse }, options);
      assert.equal(same.bookId, config.bookId); checks++;
      for (const missing of [async () => null, async () => undefined, async () => { throw new Error('Missing W0'); }]) {
        for (const build of [buildW2ABaseInput, buildW2APoseInput]) {
          await assert.rejects(() => build(payload, { ...options, loadManifest: missing }), /snapshot unavailable/); checks++;
        }
      }
      const retryWrappers = [
        (value: object) => ({ orderData: value }), (value: object) => ({ ctx: value }),
        (value: object) => ({ __meta: { snapshot: value } }),
        (value: object) => ({ __meta: { deriveQaPass: { snapshot: value } } }),
        (value: object) => ({ orderContext: value }),
      ];
      for (const wrap of retryWrappers) {
        for (const wrong of [{ characterHash: 'wrong-child', characterSpecs },
          { characterHash: 'neutral-child', characterSpecs: { ...characterSpecs, skinTone: 'light' } }]) {
          const request = { ...payload, characterHash: undefined, characterSpecs: undefined, ...wrap(wrong) };
          for (const build of [buildW2ABaseInput, buildW2APoseInput]) {
            await assert.rejects(() => build(request, options), /character.*identity/); checks++;
          }
        }
      }
      for (const build of [buildW2ABaseInput, buildW2APoseInput]) {
        const expected = await build(payload, options);
        const recovered = await build({ ...payload, characterSpecs: {} }, options);
        assert.equal(recovered.userPromptText, expected.userPromptText, 'Prompt must consume canonical W0 specs');
        assert.equal(recovered.hairStyleCanonical, expected.hairStyleCanonical); checks++;
      }
      const amazonW0 = buildW0RunManifestFromConfig(config, { orderId, platform: 'amazon', formatId: 'amazon',
        characterHash: 'neutral-child', input: { characterSpecs } });
      for (const wrap of [(value: object) => value, ...retryWrappers]) {
        const aliasRequest = { poseNumber: 13, characterHash: 'neutral-child', characterSpecs,
          oneManifestKey: amazonW0.artifacts.manifestKey,
          ...wrap({ orderId, print_book_id: config.bookId, print_format_id: 'amazon', print_config_version: config.version }) };
        for (const build of [buildW2ABaseInput, buildW2APoseInput]) {
          const built = await build(aliasRequest, { ...options, loadManifest: async () => amazonW0 });
          assert.equal(built.bookId, config.bookId); assert.equal(built.formatId, 'amazon'); checks++;
        }
      }
      await assert.rejects(() => buildW2ABaseInput({ ...payload, renderSnapshot: { ...withoutFalse, testOnly: true } }, options), /Conflicting workflow render snapshots/); checks++;
      const malformed = structuredClone(w0.book.resolved.renderSnapshot!);
      malformed.bookConfig.defaultFormatId = 'absent';
      assert.throws(() => inspectWorkflowBookIdentity({ renderSnapshot: malformed }), /Default book format/); checks++;
    }

    const legacy = loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure', version: 1 });
    const selection = { bookId: legacy.bookId, version: 1, formatId: 'standard' };
    const key = `${legacy.bookId}/orders/LEGACY/manifests/1-manifest.json`;
    for (const schema of [undefined, 'lhb.run-manifest@v2.0', 'lhb.run-manifest@v2.1']) {
      const manifest = { ...(schema ? { schema } : {}), bookId: legacy.bookId, orderId: 'LEGACY', formatId: 'standard' };
      assert.equal(normalizeW0Manifest(manifest).orderId, 'LEGACY'); checks++;
      const resolved = await resolveWorkflowBookConfig({ orderId: 'LEGACY', oneManifestKey: key }, selection,
        { loadConfig: async () => legacy, loadManifest: async () => manifest });
      assert.equal(resolved.config.bookId, legacy.bookId); checks++;
    }
    for (const schema of ['lhb.run-manifest@v4', 'unknown', 3, {}, false]) {
      let configReads = 0;
      await assert.rejects(() => resolveWorkflowBookConfig({ orderId: 'LEGACY', oneManifestKey: key }, selection,
        { loadConfig: async () => { configReads++; return legacy; }, loadManifest: async () => ({ schema }) }), /Unsupported W0 manifest schema/); checks++;
      assert.equal(configReads, 0); checks++;
    }
    const fallback = await resolveWorkflowBookConfig({ oneManifestKey: key }, selection,
      { loadConfig: async () => legacy, loadManifest: async () => { throw new Error('unavailable'); } });
    assert.equal(fallback.config.bookId, legacy.bookId); checks++;
    const changedLegacy = structuredClone(legacy); changedLegacy.version = 2;
    await assert.rejects(() => resolveWorkflowBookConfig({ oneManifestKey: key }, { ...selection, version: 2 },
      { loadConfig: async () => changedLegacy, loadManifest: async () => null }), /requires its frozen/); checks++;
    let admissions = 0;
    for (const wrap of [
      (value: object) => value, (value: object) => ({ orderContext: value }),
      (value: object) => ({ orderData: value }), (value: object) => ({ ctx: value }),
      (value: object) => ({ __meta: { snapshot: value } }),
      (value: object) => ({ __meta: { deriveQaPass: { snapshot: value } } }),
    ]) {
      for (const field of ['configVersion', 'version', 'print_config_version', 'printConfigVersion']) {
        const request = { orderId: 'LEGACY', bookId: legacy.bookId, characterHash: 'legacy-child', characterSpecs: { childName: 'Ada' },
          poseNumber: 1, oneManifestKey: key, ...wrap({ [field]: 2 }) };
        await assert.rejects(() => resolveW2APoseWorklistResponse(request, {
          downloadOneManifest: async () => null, loadBookConfig: async selected => {
            assert.equal(selected.version, 2, 'Canonical version must reach config lookup'); return changedLegacy;
          }, instrumentPoseWorkItems: async value => { admissions++; return value.poseWorklist; },
        }), /requires its frozen/); checks++;
        for (const build of [buildW2ABaseInput, buildW2APoseInput]) {
          await assert.rejects(() => build(request, { loadManifest: async () => null, loadConfig: async selected => {
            assert.equal(selected.version, 2); return legacy;
          } }), /Loaded book config identity mismatch/); checks++;
        }
      }
    }
    const changedPrint = structuredClone(legacy);
    if (changedPrint.formats.standard.print.provider === 'lulu') changedPrint.formats.standard.print.podPackageId = 'DIFFERENT';
    await assert.rejects(() => resolveW2APoseWorklistResponse({ orderId: 'LEGACY', bookId: legacy.bookId, formatId: 'standard' }, {
      downloadOneManifest: async () => null, loadBookConfig: async () => changedPrint,
      instrumentPoseWorkItems: async value => { admissions++; return value.poseWorklist; },
    }), /requires its frozen/); checks++;
    assert.equal(admissions, 0); checks++;

    const input = (name: string, dedicationText?: string) => ({ orderId: 'LIMITS', platform: 'd2c' as const, formatId: 'standard',
      input: { characterSpecs: { childName: name }, dedicationText, bookSpecs: { testMode: true } } });
    const innerVoice = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
    buildW0RunManifestFromConfig(innerVoice, input(` ${'W'.repeat(30)} `)); checks++;
    assert.throws(() => buildW0RunManifestFromConfig(innerVoice, input('W'.repeat(31))), /Inner Voice child name must be 30 characters or fewer/); checks++;
    assert.throws(() => buildW0RunManifestFromConfig(innerVoice, input('😀'.repeat(16))), /30 characters/); checks++;
    const declared: BookConfig = structuredClone(innerVoice);
    declared.intake = { customization: { childNameMaxLength: 40, dedicationMaxLength: 5 } };
    buildW0RunManifestFromConfig(declared, input('W'.repeat(40), '12345')); checks++;
    assert.throws(() => buildW0RunManifestFromConfig(declared, input('W'.repeat(41))), /Child name must be 40 characters/); checks++;
    assert.throws(() => buildW0RunManifestFromConfig(declared, input('Ada', '123456')), /Dedication must be 5 characters/); checks++;
    const emptyName = input(''); emptyName.input.characterSpecs = { childName: '', name: 'W'.repeat(100) } as typeof emptyName.input.characterSpecs;
    buildW0RunManifestFromConfig(innerVoice, emptyName); checks++;
    console.log(`Frozen book handoff: ${checks} checks passed; neutral Lulu/Gelato, legacy replay, zero external requests`);
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
