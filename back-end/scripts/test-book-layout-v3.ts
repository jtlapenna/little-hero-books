import assert from 'node:assert/strict';
import { configuredBookRaw } from './configured-book-fixture';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { renderW3PreviewDocument } from '../src/lib/w3-pdfmonkey-preview';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { publishW3Manifest } from '../src/lib/workers/w3-manifest-publish';
import { buildW4PrintInput } from '../src/lib/books/w4-print-input';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { bookCanvasDeltaToAuthor, resolveBookPlacement } from '../src/lib/books/book-layout-geometry';
import { BookLayerPlacementSchema } from '../src/lib/books/book-render-contract';
import { parseCharacterPlacementOverride } from '../src/lib/books/character-placement';
import { parseAnimalPlacementOverride } from '../src/lib/books/animal-placement';


const composedControl = process.argv.includes('--composed-source-control');
type Raw = ReturnType<typeof rawV3>;
function freezeContract(raw: Raw, id: string) {
  return buildW0RunManifestFromConfig(BookConfigSchema.parse(structuredClone(raw)), {
    orderId: `QA2-CONTRACT-${id}`, platform: 'd2c', characterHash: 'qa2-contract-child',
    createdAt: '2026-10-30T00:00:00.000Z', runId: `qa2-${id}`,
    input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } },
  });
}
function fittedRaw() {
  const raw = rawV3();
  Object.assign(raw.rendering.recipe.copy.title, { placement: { left: 100, top: 100, width: 1200, height: 120 },
    typography: { wrap: 'single-line' }, fit: { minFontSize: 20, softMinFontSize: 30, maxFontSize: 80 } });
  return raw;
}
function stackText(id: string) {
  return { id, kind: 'text', text: 'For [child name]', fontSize: 40, lineHeight: 1.3, color: '#fff4d7', align: 'left', padding: 0 };
}
function stackRaw(depth = 2, nodes = 2, roots = 1) {
  const raw = rawV3();
  raw.rendering.recipe.covers.standard.stacks = Array.from({ length: roots }, (_, root) => {
    let children: any[] = Array.from({ length: nodes - 1 }, (_, index) => stackText(`text-${root}-${index}`));
    for (let level = depth - 1; level >= 2; level--) children = [{ kind: 'stack', id: `nested-${root}-${level}`, children }];
    return { id: `root-${root}`, placement: { left: 0, top: 0, width: 2200 }, children };
  });
  return raw;
}
function configRejectionMatrix() {
  let checks = 0;
  const outcomes: Array<{ id: string; boundary: string; outcome: string }> = [];
  const cases: Array<{ id: string; valid: () => Raw; mutate: (raw: Raw) => void; boundary: 'schema' | 'w0'; expected: RegExp }> = [
    { id: 'unknown-recipe-version', valid: rawV3, mutate: raw => { raw.rendering.recipe.schema = 'lhb.book-render@v99'; }, boundary: 'schema', expected: /schema/ },
    { id: 'unknown-recipe-field', valid: rawV3, mutate: raw => { raw.rendering.recipe.unsupportedFeature = true; }, boundary: 'schema', expected: /unsupportedFeature/ },
    { id: 'unknown-fit-field', valid: fittedRaw, mutate: raw => { raw.rendering.recipe.copy.title.fit.unsupportedFit = true; }, boundary: 'schema', expected: /unsupportedFit/ },
    { id: 'unknown-stack-field', valid: stackRaw, mutate: raw => { raw.rendering.recipe.covers.standard.stacks[0].unsupportedStack = true; }, boundary: 'schema', expected: /unsupportedStack/ },
    { id: 'fit-without-single-line-wrap', valid: fittedRaw, mutate: raw => { raw.rendering.recipe.copy.title.typography.wrap = 'balanced'; }, boundary: 'schema', expected: /fit requires single-line wrap/ },
    { id: 'fit-without-height', valid: fittedRaw, mutate: raw => { delete raw.rendering.recipe.copy.title.placement.height; }, boundary: 'schema', expected: /valid explicit box/ },
    { id: 'fit-zero-height', valid: fittedRaw, mutate: raw => { raw.rendering.recipe.copy.title.placement.height = 0; }, boundary: 'schema', expected: /height/ },
    { id: 'fit-soft-below-min', valid: fittedRaw, mutate: raw => { raw.rendering.recipe.copy.title.fit.softMinFontSize = 19; }, boundary: 'schema', expected: /font bounds are inconsistent/ },
    { id: 'fit-soft-above-max', valid: fittedRaw, mutate: raw => { raw.rendering.recipe.copy.title.fit.softMinFontSize = 81; }, boundary: 'schema', expected: /font bounds are inconsistent/ },
    { id: 'fit-max-below-min', valid: fittedRaw, mutate: raw => { raw.rendering.recipe.copy.title.fit.maxFontSize = 19; }, boundary: 'schema', expected: /font bounds are inconsistent/ },
    { id: 'fit-font-over-limit', valid: fittedRaw, mutate: raw => { raw.rendering.recipe.copy.title.fit.maxFontSize = 513; }, boundary: 'schema', expected: /512/ },
    { id: 'vertical-align-without-box', valid: fittedRaw, mutate: raw => { delete raw.rendering.recipe.copy.title.fit; delete raw.rendering.recipe.copy.title.placement.height; raw.rendering.recipe.copy.title.typography.verticalAlign = 'center'; }, boundary: 'schema', expected: /valid explicit box/ },
    { id: 'unknown-layout-units', valid: rawV3, mutate: raw => { raw.formats.standard.interior.pageSequence[1].layers[0].placement.layout.units = 'viewport'; }, boundary: 'schema', expected: /units/ },
    { id: 'invalid-reference-width', valid: rawV3, mutate: raw => { raw.formats.standard.interior.pageSequence[1].layers[0].placement.layout.referenceCanvas.w = 0; }, boundary: 'schema', expected: /referenceCanvas/ },
    { id: 'anchor-over-limit', valid: rawV3, mutate: raw => { raw.formats.standard.interior.pageSequence[1].layers[0].placement.layout.anchorXPercent = 101; }, boundary: 'schema', expected: /anchorXPercent/ },
    { id: 'excess-stack-depth', valid: () => stackRaw(4), mutate: raw => { raw.rendering.recipe.covers.standard.stacks = stackRaw(5).rendering.recipe.covers.standard.stacks; }, boundary: 'schema', expected: /Cover stacks exceed depth, root or node limits/ },
    { id: 'excess-stack-nodes', valid: () => stackRaw(2, 64), mutate: raw => { raw.rendering.recipe.covers.standard.stacks[0].children.push(stackText('one-too-many')); }, boundary: 'schema', expected: /Cover stacks exceed depth, root or node limits/ },
    { id: 'excess-stack-roots', valid: () => stackRaw(2, 2, 8), mutate: raw => { raw.rendering.recipe.covers.standard.stacks.push({ id: 'root-extra', placement: { left: 0, top: 0, width: 100 }, children: [stackText('text-extra')] }); }, boundary: 'schema', expected: /Cover stacks exceed depth, root or node limits/ },
    { id: 'unknown-v3-token', valid: rawV3, mutate: raw => { raw.rendering.recipe.copy.title.text = '[unsupported token]'; }, boundary: 'w0', expected: /Unknown copy token \[unsupported token\]/ },
    { id: 'missing-primary-font', valid: rawV3, mutate: raw => { delete raw.assets.fonts.primary; }, boundary: 'w0', expected: /Missing configured asset: primary font/ },
    { id: 'missing-fallback-font-role', valid: () => { const raw = rawV3(); raw.rendering.recipe.fontRoles = ['primary', 'fallback']; raw.assets.fonts.fallback = `${raw.bookId}/fonts/fallback.ttf`; return raw; }, mutate: raw => { delete raw.assets.fonts.fallback; }, boundary: 'w0', expected: /Missing configured asset: font fallback/ },
    { id: 'missing-guide-role', valid: rawV3, mutate: raw => { delete raw.rendering.recipe.animals.owl.trail; }, boundary: 'w0', expected: /Missing configured asset: owl\/trail/ },
    { id: 'duplicate-page-copy-id', valid: rawV3, mutate: raw => { raw.rendering.recipe.copy['scene-a'][1].id = raw.rendering.recipe.copy['scene-a'][0].id; }, boundary: 'w0', expected: /Configured copy IDs must be unique/ },
    { id: 'duplicate-cover-copy-id', valid: () => { const raw = rawV3(); raw.rendering.recipe.covers.standard.texts = [{ ...raw.rendering.recipe.copy.title, id: 'cover-first' }, { ...raw.rendering.recipe.copy.title, id: 'cover-second' }]; return raw; }, mutate: raw => { raw.rendering.recipe.covers.standard.texts[1].id = 'cover-first'; }, boundary: 'w0', expected: /Configured copy IDs must be unique/ },
    { id: 'duplicate-cover-stack-id', valid: stackRaw, mutate: raw => { raw.rendering.recipe.covers.standard.stacks[0].children[0].id = raw.rendering.recipe.covers.standard.stacks[0].id; }, boundary: 'w0', expected: /Configured cover text\/stack IDs must be unique/ },
    { id: 'duplicate-layer-id', valid: rawV3, mutate: raw => { raw.formats.standard.interior.pageSequence[1].layers[1].id = 'hero'; }, boundary: 'w0', expected: /Duplicate layer ID hero/ },
  ];
  for (const token of ['child name possessive', 'hometown return']) {
    cases.push({ id: `legacy-token-${token.replaceAll(' ', '-')}`, valid: configuredBookRaw,
      mutate: raw => { raw.rendering.recipe.copy.title.text = `[${token}]`; }, boundary: 'w0', expected: /Unknown copy token/ });
    const valid = rawV3(); valid.rendering.recipe.copy.title.text = `[${token}]`;
    assert.doesNotThrow(() => freezeContract(valid, 'v3-token-control')); checks++;
  }
  for (const entry of cases) {
    const raw = structuredClone(entry.valid());
    assert.doesNotThrow(() => freezeContract(raw, `${entry.id}-valid`), entry.id + ': adjacent valid control'); checks++;
    entry.mutate(raw);
    const parsed = BookConfigSchema.safeParse(raw);
    if (entry.boundary === 'schema') {
      assert.equal(parsed.success, false, entry.id + ': schema must reject'); checks++;
      if (parsed.success) throw new Error(entry.id + ': unexpected schema success');
      assert.match(JSON.stringify(parsed.error.issues), entry.expected, entry.id + ': intended schema boundary'); checks++;
    } else {
      assert.equal(parsed.success, true, entry.id + ': must reach W0 semantic boundary'); checks++;
      assert.throws(() => freezeContract(raw, `${entry.id}-invalid`), entry.expected, entry.id); checks++;
    }
    outcomes.push({ id: entry.id, boundary: entry.boundary, outcome: 'rejected-after-valid-control' });
  }
  return { checks, outcomes };
}
function holdRaw(v3: boolean, provider: 'lulu' | 'gelato') {
  const raw = configuredBookRaw();
  if (v3) {
    raw.rendering.recipe.schema = 'lhb.book-render@v3';
    for (const [id, block] of Object.entries(raw.rendering.recipe.copy) as Array<[string, any]>) Object.assign(block, { id, lineHeight: 1.3, color: '#fff4d7', align: 'left', padding: 0 });
  }
  if (provider === 'gelato') raw.formats.standard.print = {
    provider: 'gelato', productUid: 'synthetic-local-book', innerPageCount: 3, apiPageCount: 6, apiPageCountVerified: true,
    expectedPdfPageCount: 6, defaultQuantity: 1,
    printGeometryMm: { trim: { w: 100, h: 100 }, bleed: 3, interiorCanvas: { w: 106, h: 106 }, coverCanvas: { w: 211, h: 106 },
      backPanel: { x: 3, y: 3, w: 100, h: 100 }, spine: { x: 103, y: 3, w: 5, h: 100 }, frontPanel: { x: 108, y: 3, w: 100, h: 100 } },
    shipmentMethodPolicy: { version: 1, destinationCountries: ['US'], tiers: { standard: { kind: 'uid', uid: 'synthetic-local-shipping' } } },
  };
  return raw;
}
async function holdFixture(v3: boolean, provider: 'lulu' | 'gelato') {
  const config = BookConfigSchema.parse(structuredClone(holdRaw(v3, provider))), orderId = `QA2-HOLD-${provider}`, characterHash = 'qa2-hold-child';
  const w0 = buildW0RunManifestFromConfig(config, { orderId, rootOrderId: orderId, formatId: 'standard', platform: 'd2c', characterHash,
    createdAt: '2026-10-30T00:00:00.000Z', runId: 'qa2-hold', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' }, bookSpecs: { testMode: false } } });
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId: 'standard', oneManifestKey: w0.artifacts.manifestKey }, {
    loadManifest: async key => key.endsWith('/1-manifest.json') ? structuredClone(w0) : key.endsWith('/2b-manifest.json') ? {
      characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber,
        bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) } : null,
  });
  const prefix = w0.artifacts.orderPrefix;
  const built = buildW3Manifest({ ...assembly, pagePreviewImages: config.formats.standard.interior.pageSequence.map(page => ({ pageNumber: page.index,
    r2Key: `${prefix}/qa-only-page-${page.index}.png` })), coverPngR2Key: `${prefix}/qa-only-cover.png` });
  assert.equal(config.status, 'active');
  assert.equal(w0.book.resolved.renderSnapshot?.testOnly, false);
  assert.equal((built.manifest.renderSnapshot as { testOnly?: boolean } | undefined)?.testOnly, false);
  assert.equal(config.formats.standard.print.provider, provider);
  return { config, w0, built, orderId, prefix };
}
async function printHoldMatrix() {
  let checks = 0, providerReadyResults = 0;
  const outcomes: Array<{ provider: string; sourceVariant: string; snapshots: string; claim: string; error: string; manifestReads: number; orderReads: number }> = [];
  const layoutHold = 'Configured layout print preparation is not yet available';
  const mismatch = 'W4 print input rejected because the frozen render snapshot does not match W0';
  for (const provider of ['lulu', 'gelato'] as const) {
    const legacy = await holdFixture(false, provider), configured = await holdFixture(true, provider);
    assert.deepEqual(legacy.w0.book.resolved.pagePlan, configured.w0.book.resolved.pagePlan); checks++;
    for (const snapshots of ['w0-only', 'w3-only', 'matching-v3'] as const) {
      const one = snapshots === 'w3-only' ? legacy : configured;
      const three = snapshots === 'w0-only' ? legacy : configured;
      assert.equal(one.orderId, three.orderId); checks++;
      assert.equal(one.w0.artifacts.manifestKey, three.built.manifest.oneManifestKey); checks++;
      assert.deepEqual(one.w0.book.resolved.pageLabels, three.built.manifest.pageLabels); checks++;
      assert.deepEqual(one.w0.book.resolved.pagePlan, three.built.manifest.pagePlan); checks++;
      for (const claim of ['legacy-top-level', 'test-top-level']) {
        let manifestReads = 0, orderReads = 0;
        const expected = composedControl && snapshots !== 'matching-v3' ? mismatch : layoutHold;
        const stored = { ...structuredClone(three.built.manifest), summary: { ...(three.built.manifest.summary as Record<string, unknown>), readyForBook: true },
          renderingSchema: claim === 'legacy-top-level' ? 'lhb.book-render@v1' : 'lhb.book-render@v2', testOnly: claim === 'test-top-level' };
        const order = { orderId: one.orderId, root_order_id: one.orderId, one_manifest_url: one.w0.artifacts.manifestKey };
        await assert.rejects(async () => {
          const result = await buildW4PrintInput({ orderId: one.orderId, rootOrderId: one.orderId, bookId: one.config.bookId,
            formatId: 'standard', manifest3Key: three.built.manifest3Key, oneManifestKey: one.w0.artifacts.manifestKey,
            renderingSchema: stored.renderingSchema, testOnly: stored.testOnly }, {
            expectedProvider: provider,
            loadManifest: async key => { manifestReads++; return key === one.w0.artifacts.manifestKey ? structuredClone(one.w0) : key === three.built.manifest3Key ? structuredClone(stored) : null; },
            loadOrder: async id => { orderReads++; assert.equal(id, one.orderId); return structuredClone(order); },
          });
          providerReadyResults++; return result;
        }, (error: unknown) => error instanceof Error && error.message === expected, `${provider}/${snapshots}/${claim}: exact guarded boundary`); checks++;
        assert.ok(manifestReads >= 2 && orderReads >= 1); checks++;
        assert.equal(providerReadyResults, 0); checks++;
        outcomes.push({ provider, sourceVariant: composedControl ? 'composed' : 'clean', snapshots, claim, error: expected, manifestReads, orderReads });
      }
    }
  }
  return { checks, outcomes, providerReadyResults };
}

async function canonicalAnchorMatrix() {
  let checks = 0;
  const outcomes: Array<{ role: string; formatId: string; scope: string; normalizationCalls: number }> = [];
  const error = 'Anchor override requires an explicit v3 layout';
  const target = (config: any, role: string, formatId: string) => role === 'cover'
    ? config.rendering.recipe.covers[formatId].layers.find((layer: any) => layer.kind === 'pose')
    : config.formats[formatId].interior.pageSequence.find((page: any) => page.storyPageNumber === 1)
      .layers.find((layer: any) => layer.kind === (role === 'child' ? 'pose' : 'animal'));
  for (const role of ['child', 'animal', 'cover']) for (const formatId of ['standard', 'amazon']) {
    for (const scope of ['default', 'format']) {
      const raw = rawV3();
      const entry = { left: 100, top: 200, width: 700, anchorXPercent: 50 };
      if (role === 'cover') raw.rendering.coverCharacterPlacement = {
        default: scope === 'default' ? entry : null, overridesByFormat: scope === 'format' ? { [formatId]: entry } : {},
      };
      else raw.rendering[role === 'child' ? 'characterPlacement' : 'animalPlacement'] = {
        defaultByStoryPage: scope === 'default' ? { 1: entry } : {}, overridesByFormat: scope === 'format' ? { [formatId]: { 1: entry } } : {},
      };
      target(raw, role, formatId).placement.layout = { units: 'px' };
      const config = BookConfigSchema.parse(structuredClone(raw));
      const orderId = `QA3-ANCHOR-${role}-${formatId}-${scope}`, characterHash = 'qa3-anchor-child';
      const build = (value: typeof config) => buildW0RunManifestFromConfig(value, { orderId, formatId, platform: 'd2c', characterHash,
        createdAt: '2026-10-30T00:00:00.000Z', runId: 'qa3-anchor', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
      const one = build(config); checks++;
      const invalid = structuredClone(config);
      delete target(invalid, role, formatId).placement.layout;
      assert.doesNotThrow(() => BookConfigSchema.parse(invalid)); checks++;
      assert.throws(() => build(invalid), (value: unknown) => value instanceof Error && value.message === error); checks++;
      const two = { characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber,
        bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) };
      let normalizationCalls = 0;
      const assemble = (packet: typeof one) => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, oneManifestKey: one.artifacts.manifestKey }, {
        loadManifest: async key => key.endsWith('/1-manifest.json') ? structuredClone(packet) : key.endsWith('/2b-manifest.json') ? structuredClone(two) : null,
        normalizePoseScale: async ({ poseNumber, imageKey }) => {
          normalizationCalls++;
          return { success: true, normalized: false, imageKey, refKey: '', poseNumber, bookId: config.bookId, scaleFactor: 1,
            verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0, sourceAnchorMetrics: null, referenceAnchorMetrics: null,
            sourceBBoxFound: true, referenceBBoxFound: true, message: 'Synthetic normalization boundary' };
        },
      });
      const valid = await assemble(one);
      assert.ok(normalizationCalls > 0); checks++;
      assert.doesNotThrow(() => buildW3PreviewPlan({ ...valid })); checks++;
      normalizationCalls = 0;
      const malformed = structuredClone(one);
      // Model a previously accepted frozen packet without rebuilding it through the corrected W0 guard.
      delete target(malformed.book.resolved.renderSnapshot!.bookConfig, role, formatId).placement.layout;
      malformed.book.resolved.pagePlan = structuredClone(malformed.book.resolved.renderSnapshot!.bookConfig.formats[formatId].interior.pageSequence);
      await assert.rejects(() => assemble(malformed), (value: unknown) => value instanceof Error && value.message === error); checks++;
      assert.equal(normalizationCalls, 0); checks++;
      outcomes.push({ role, formatId, scope, normalizationCalls });
    }
  }
  for (const role of ['child', 'animal']) {
    const raw = rawV3(), placement = { left: 100, top: 200, width: 700 };
    delete target(raw, role, 'standard').placement.layout;
    raw.rendering[role === 'child' ? 'characterPlacement' : 'animalPlacement'] = {
      defaultByStoryPage: { 1: { ...placement, anchorXPercent: 50 }, 99: { ...placement, anchorXPercent: 50 } },
      overridesByFormat: { standard: { 1: placement } },
    };
    assert.doesNotThrow(() => freezeContract(raw, `${role}-shadowed-default`)); checks++;
  }
  const cover = rawV3(), placement = { left: 100, top: 200, width: 700 };
  delete target(cover, 'cover', 'standard').placement.layout;
  cover.rendering.coverCharacterPlacement = { default: { ...placement, anchorXPercent: 50 }, overridesByFormat: { standard: placement } };
  assert.throws(() => freezeContract(cover, 'cover-retained-default'), (value: unknown) => value instanceof Error && value.message === error); checks++;
  for (const role of ['child', 'animal']) {
    const raw = rawV3(), first = target(raw, role, 'standard');
    raw.rendering[role === 'child' ? 'characterPlacement' : 'animalPlacement'] = {
      defaultByStoryPage: { 1: { ...placement, anchorYPercent: 100 } }, overridesByFormat: {},
    };
    const secondary = structuredClone(first); secondary.id += '-secondary'; delete secondary.placement.layout;
    raw.formats.standard.interior.pageSequence[1].layers.push(secondary);
    assert.doesNotThrow(() => freezeContract(raw, `${role}-secondary-untouched`)); checks++;
  }
  return { checks, outcomes };
}

async function main() {
  let checks = 0, requests = 0, externalAttempts = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { externalAttempts++; throw new Error('Unexpected external request'); };
  try {
    const placement = BookLayerPlacementSchema.parse({ left: 893, top: 1836, width: 920, rotateDeg: 20, flipX: true,
      layout: { units: 'px', referenceCanvas: { w: 2550, h: 2550 }, rounding: 'nearest', anchorXPercent: 50, anchorYPercent: 100 } });
    const resolved = resolveBookPlacement(placement, { w: 2625, h: 2625 });
    assert.deepEqual([resolved.left, resolved.top, resolved.width], [919, 1890, 947]); checks++;
    assert.match(resolved.transform, /translate\(-50%,-100%\) rotate\(20deg\) scale\(1\) scaleX\(-1\)/); checks++;
    const inverse = bookCanvasDeltaToAuthor(placement, { w: 2625, h: 2625 }, { x: 2625, y: 2625 });
    assert.ok(Math.abs(inverse.x - 2550) < 1e-9 && Math.abs(inverse.y - 2550) < 1e-9); checks++;
    for (const parse of [parseCharacterPlacementOverride, parseAnimalPlacementOverride]) {
      assert.equal(parse({ 1: { left: 1, top: 2, width: 3, anchorXPercent: 27 } })[1].anchorXPercent, undefined); checks++;
      assert.equal(parse({ 1: { left: 1, top: 2, width: 3, anchorXPercent: 27 } }, 'lhb.book-render@v3')[1].anchorXPercent, 27); checks++;
    }
    for (const mutate of [
      (raw: ReturnType<typeof rawV3>) => { raw.formats.standard.interior.pageSequence[1].layers[0].placement.layout = {}; },
      (raw: ReturnType<typeof rawV3>) => { raw.formats.standard.interior.pageSequence[1].layers[0].placement.layout.units = 'viewport'; },
      (raw: ReturnType<typeof rawV3>) => { raw.formats.standard.interior.pageSequence[1].layers[0].placement.layout.extra = true; },
      (raw: ReturnType<typeof rawV3>) => { raw.rendering.recipe.copy.title.typography = { extra: true }; },
      (raw: ReturnType<typeof rawV3>) => { raw.rendering.recipe.copy.title.fit = { minFontSize: 100, maxFontSize: 50 }; },
    ]) {
      const raw = rawV3(); mutate(raw); assert.equal(BookConfigSchema.safeParse(raw).success, false); checks++;
    }
    for (const layout of [{ units: 'percent' }, { units: 'px', referenceCanvas: { w: 100, h: 100 } }]) {
      const raw = rawV3();
      Object.assign(raw.rendering.recipe.copy.title, { padding: 30, placement: { left: 0, top: 0, width: 50, height: 20, layout } });
      const config = BookConfigSchema.parse(raw);
      assert.doesNotThrow(() => buildW0RunManifestFromConfig(config, { orderId: 'PADDING-CANVAS', platform: 'd2c', characterHash: 'padding-child',
        input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } })); checks++;
      raw.rendering.recipe.copy.title.placement.width = 0.01;
      assert.throws(() => buildW0RunManifestFromConfig(BookConfigSchema.parse(raw), { orderId: 'BAD-PADDING-CANVAS', platform: 'd2c', characterHash: 'padding-child',
        input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } }), /padding.*resolved text space/); checks++;
    }
    for (const formatId of ['standard', 'amazon']) {
      const config = BookConfigSchema.parse(rawV3());
      const orderId = `LAYOUT-V3-${formatId}`, characterHash = 'synthetic-layout-child';
      const specs = { childName: 'James', animalGuide: 'owl', pronouns: 'they/them', hometown: 'Oak & Pine' };
      const w0 = buildW0RunManifestFromConfig(config, { orderId, formatId, platform: formatId === 'amazon' ? 'amazon' : 'd2c',
        characterHash, input: { characterSpecs: specs } });
      const twoB = { characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({
        poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) };
      const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId,
        oneManifestKey: w0.artifacts.manifestKey, manifest2bKey: `${config.bookId}/orders/${orderId}/manifests/2b-manifest.json` }, {
        loadManifest: async key => key.endsWith('/1-manifest.json') ? w0 : key.endsWith('/2b-manifest.json') ? twoB : null,
        normalizePoseScale: async ({ poseNumber, imageKey }) => ({ success: true, normalized: false, imageKey, refKey: '', poseNumber, bookId: config.bookId,
          scaleFactor: 1, verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0, sourceAnchorMetrics: null, referenceAnchorMetrics: null,
          sourceBBoxFound: true, referenceBBoxFound: true, message: 'Synthetic normalization boundary' }),
      });
      const plan = buildW3PreviewPlan({ ...assembly });
      assert.match(plan.pages_html, /left:919px;top:1890px;width:947px/); checks++;
      assert.match(plan.pages_html, /James&#39; path to Oak &amp; Pine/); checks++;
      assert.equal(plan.pronounsResolved.subject, 'they'); checks++;
      assert.deepEqual(plan.storyTexts.map(value => value.text), ['A configured title', "James' path to Oak & Pine.\nthey saw Owl.", 'James paused.\nthem listened.']); checks++;
      const pageResults = [];
      let coverKey = '';
      for (const [kind, items] of [['page-preview', plan.pagePreviewItems], ['cover-preview', [plan.coverPreviewItem]]] as const) {
        for (const item of items) {
          let captured: Record<string, any> | undefined;
          const result = await renderW3PreviewDocument({ ...item, documentKind: kind }, {
            pdfMonkeyApiKey: 'synthetic-local-layout-key',
            fetchImpl: async (url, init) => {
              assert.equal(String(url), 'https://api.pdfmonkey.io/api/v1/documents');
              captured = JSON.parse(String(init?.body)); requests++;
              return Response.json({ document: { id: `synthetic-layout-${requests}`, status: 'success', download_url: 'https://layout.example.test/local.png' } });
            }, sleep: async () => { throw new Error('Unexpected polling'); }, recordWorkflowEvent: async () => { throw new Error('Unexpected event persistence'); },
          });
          assert.ok(captured);
          assert.match(captured.document.payload.pages_html, /data-lhb-v3-root/); checks++;
          assert.match(captured.document.payload.pages_html, /__lhbV3LayoutReady/); checks++;
          if (kind === 'page-preview') pageResults.push({ pageNumber: item.pageNumber, r2Key: result.pageImageR2Key });
          else coverKey = String(result.coverPngR2Key);
        }
      }
      const artifacts = { ...assembly, pagePreviewImages: pageResults, coverPngR2Key: coverKey };
      const built = buildW3Manifest(artifacts);
      assert.equal((built.manifest.summary as Record<string, unknown>).readyForBook, false); checks++;
      let effects = 0;
      await assert.rejects(() => publishW3Manifest(artifacts, {
        invalidateReviewImpl: async () => { effects++; }, putObjectImpl: async () => { effects++; },
        getOrderImpl: async () => { effects++; return null; }, updateOrderImpl: async () => { effects++; return true; },
      }), /Configured layout publication is not yet available/); checks++;
      assert.equal(effects, 0); checks++;
      for (const includeW0 of [true, false]) {
        await assert.rejects(() => buildW4PrintInput({ orderId, bookId: config.bookId, manifest3Key: built.manifest3Key }, {
          loadManifest: async key => key.endsWith('/1-manifest.json') && includeW0 ? w0 : key.endsWith('/3-manifest.json') ? { ...built.manifest, summary: { readyForBook: true } } : null,
        }), includeW0 ? /Configured layout print preparation is not yet available/ : /Configured layout print preparation is not yet available|requires.*frozen W0/i); checks++;
      }
    }
    const anchorMatrix = await canonicalAnchorMatrix(); checks += anchorMatrix.checks;
    const rejectionMatrix = configRejectionMatrix(); checks += rejectionMatrix.checks;
    const holdMatrix = await printHoldMatrix(); checks += holdMatrix.checks;
    assert.equal(externalAttempts, 0); checks++;
    console.log(JSON.stringify({ result: 'PASS', checks, interceptedRequests: requests,
      sourceVariant: composedControl ? 'composed' : 'clean', anchorMatrix, rejectionMatrix, holdMatrix, externalAttempts,
      boundaries: ['Synthetic poses/normalization', 'Local intercepted PDFMonkey response'], calibrationRoundtripComplete: false, visualQaComplete: false }));
  } finally { globalThis.fetch = previous; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
