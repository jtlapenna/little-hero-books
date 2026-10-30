import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createW3CalibrationPostHandler } from '../src/lib/w3-calibration-http';
import { POST as productionPost } from '../src/app/api/admin/w3-calibration/route';
import { buildW3CalibrationResponse } from '../src/lib/w3-calibration';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { renderW3PreviewDocument } from '../src/lib/w3-pdfmonkey-preview';
import { parseCharacterPlacementOverride } from '../src/lib/books/character-placement';
import { parseAnimalPlacementOverride } from '../src/lib/books/animal-placement';
import { parseCoverCharacterPlacementOverride } from '../src/lib/books/cover-character-placement';

const roles = ['character', 'animal', 'cover'] as const;
type Role = typeof roles[number];
const fieldFor = (role: Role) => role === 'cover' ? 'coverCharacterPlacementOverride' : `${role}PlacementOverrideByStoryPage`;
const configuredEntry = { left: 100, top: 200, width: 300, rotateDeg: 20, zIndex: 7, anchorXPercent: 50, anchorYPercent: 100 };
function placementRaw() {
  const raw = rawV3();
  const placement = { left: 1, top: 2, width: 3, rotateDeg: -11, zIndex: 4,
    layout: { units: 'px', anchorXPercent: 10, anchorYPercent: 20 } };
  for (const format of Object.values(raw.formats) as Array<Record<string, any>>) {
    for (const layer of format.interior.pageSequence[1].layers) layer.placement = structuredClone(placement);
  }
  for (const cover of Object.values(raw.rendering.recipe.covers) as Array<Record<string, any>>) cover.layers[0].placement = structuredClone(placement);
  raw.rendering.characterPlacement = { defaultByStoryPage: { 1: { ...configuredEntry }, 2: { left: 55, top: 66, width: 77, rotateDeg: 12, zIndex: 8 } }, overridesByFormat: {} };
  raw.rendering.animalPlacement = { defaultByStoryPage: { 1: { ...configuredEntry } }, overridesByFormat: {} };
  raw.rendering.coverCharacterPlacement = { default: { ...configuredEntry }, overridesByFormat: {} };
  return raw;
}
function saveEntry(raw: ReturnType<typeof rawV3>, role: Role, formatId: string, location: string, entry: Record<string, number>) {
  const container = raw.rendering[role === 'cover' ? 'coverCharacterPlacement' : `${role}Placement`];
  if (role === 'cover') {
    if (location === 'default') container.default = entry;
    else container.overridesByFormat[formatId] = entry;
  } else if (location === 'default') container.defaultByStoryPage[1] = entry;
  else container.overridesByFormat[formatId] = { 1: entry };
}
async function assemblyFrom(raw: ReturnType<typeof rawV3>, formatId: string) {
  const config = BookConfigSchema.parse(raw), orderId = `QA1-${formatId}`, characterHash = 'qa1-synthetic-child';
  const w0 = buildW0RunManifestFromConfig(config, { orderId, formatId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', characterHash,
    input: { characterSpecs: { childName: 'James', animalGuide: 'owl' } } });
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, oneManifestKey: w0.artifacts.manifestKey }, {
    loadManifest: async key => key.endsWith('/1-manifest.json') ? w0 : key.endsWith('/2b-manifest.json') ? {
      characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber,
        bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) } : null,
  });
  return { config, w0, assembly, orderId };
}
function calibrationHandler(assembly: Awaited<ReturnType<typeof assemblyFrom>>['assembly']) {
  return createW3CalibrationPostHandler((body, options) => buildW3CalibrationResponse(body, { ...options,
    buildAssemblyInput: async () => assembly, inspectPose: async () => { throw new Error('Synthetic inspection boundary'); },
  }));
}
function rolePlacement(result: any, role: Role) {
  if (role !== 'animal') return result.selectedPage.currentPlacement;
  const placement = result.selectedPage.fixedLayers.find((layer: any) => layer.id === 'trail').placement;
  return { ...placement, anchorXPercent: placement.layout.anchorXPercent, anchorYPercent: placement.layout.anchorYPercent };
}
async function serializedRoleStyle(assembly: Awaited<ReturnType<typeof assemblyFrom>>['assembly'], role: Role, hints: any, counted: () => void) {
  const schema = assembly.renderSnapshot!.bookConfig.rendering.recipe!.schema;
  const plan = buildW3PreviewPlan({ ...assembly }, {
    characterPlacementOverride: parseCharacterPlacementOverride(hints.characterPlacementOverrideByStoryPage, schema),
    animalPlacementOverride: parseAnimalPlacementOverride(hints.animalPlacementOverrideByStoryPage, schema),
    coverCharacterPlacementOverride: parseCoverCharacterPlacementOverride(hints.coverCharacterPlacementOverride, schema),
  });
  const item = role === 'cover' ? plan.coverPreviewItem : plan.pagePreviewItems.find(page => page.pageLabel === 'p01')!;
  let html = '';
  await renderW3PreviewDocument({ ...item, documentKind: role === 'cover' ? 'cover-preview' : 'page-preview' }, {
    pdfMonkeyApiKey: 'synthetic-qa1-key', fetchImpl: async (url, init) => {
      assert.equal(String(url), 'https://api.pdfmonkey.io/api/v1/documents'); counted();
      html = JSON.parse(String(init?.body)).document.payload.pages_html;
      return Response.json({ document: { id: 'synthetic-qa1', status: 'success', download_url: 'https://qa1.example.test/local.png' } });
    }, sleep: async () => { throw new Error('Unexpected polling'); }, recordWorkflowEvent: async () => { throw new Error('Unexpected persistence'); },
  });
  const id = role === 'cover' ? 'cover-child' : role === 'animal' ? 'trail' : 'hero';
  const tag = html.match(new RegExp(`<img[^>]*data-layer-id="${id}"[^>]*>`))?.[0];
  assert.ok(tag, `Missing serialized ${role} layer`);
  return tag.match(/style="([^"]*)"/)![1];
}
async function placementJourneys(request: (body: unknown) => NextRequest, group: string) {
  let checks = 0, interceptedRequests = 0;
  const count = () => { interceptedRequests++; };
  for (const formatId of ['standard', 'amazon']) for (const role of roles) {
    const { assembly, orderId } = await assemblyFrom(placementRaw(), formatId);
    const handler = calibrationHandler(assembly), field = fieldFor(role);
    const base = { sourceType: 'order', orderId, selectedStoryPageNumber: role === 'cover' ? 0 : 1 };
    if (group === 'zero') {
      const entry = { left: 111, top: 222, width: 333, zIndex: 0 };
      const response = await handler(request({ ...base, [field]: role === 'cover' ? entry : { 1: entry } }));
      assert.equal(response.status, 200); checks++;
      const exported = (await response.json()).exportHints;
      const saved = role === 'cover' ? exported[field] : exported[field]['1'];
      assert.equal(saved.zIndex, 0); checks++;
      for (const location of ['default', 'format']) {
        const raw = placementRaw(); saveEntry(raw, role, formatId, location, saved);
        assert.equal(BookConfigSchema.safeParse(raw).success, true, `F1 ${role}/${formatId}/${location}: exported zero must reload`); checks++;
        const reloaded = await assemblyFrom(raw, formatId);
        const result = await calibrationHandler(reloaded.assembly)(request({ ...base, orderId: reloaded.orderId }));
        assert.equal(result.status, 200); checks++;
        assert.equal(rolePlacement(await result.json(), role).zIndex, 0); checks++;
        assert.match(await serializedRoleStyle(reloaded.assembly, role, {}, count), /z-index:0;/); checks++;
        const legacy = structuredClone(BookConfigSchema.parse(configuredBookRaw())); saveEntry(legacy, role, formatId, location, saved);
        assert.equal(BookConfigSchema.safeParse(legacy).success, false, 'Legacy static config still rejects zero'); checks++;
      }
    } else {
      for (const explicit of [false, true]) {
        const entry = { left: 111, top: 222, width: 333, ...(explicit ? { rotateDeg: 0, zIndex: 0, anchorXPercent: 0, anchorYPercent: 0 } : {}) };
        const response = await handler(request({ ...base, [field]: role === 'cover' ? entry : { 1: entry } }));
        assert.equal(response.status, 200); checks++;
        const result = await response.json(), placement = rolePlacement(result, role);
        assert.deepEqual([placement.left, placement.top, placement.width], [111, 222, 333]); checks++;
        assert.deepEqual([placement.rotateDeg, placement.zIndex, placement.anchorXPercent, placement.anchorYPercent],
          explicit ? [0, 0, 0, 0] : [20, 7, 50, 100], `F3 ${role}/${formatId}: sparse runtime must retain configured optional values`); checks++;
        const style = await serializedRoleStyle(assembly, role, result.exportHints, count);
        assert.match(style, explicit ? /z-index:0;/ : /z-index:7;/); checks++;
        assert.match(style, explicit ? /translate\(-0%,-0%\) rotate\(0deg\)/ : /translate\(-50%,-100%\) rotate\(20deg\)/); checks++;
      }
      const otherPage = await handler(request({ ...base, selectedStoryPageNumber: 2, [field]: role === 'cover' ? { left: 111, top: 222, width: 333 } : { 1: { left: 111, top: 222, width: 333 } } }));
      assert.equal(otherPage.status, 200); checks++;
      const unchangedPage = (await otherPage.json()).selectedPage.currentPlacement;
      assert.deepEqual([unchangedPage.left, unchangedPage.top, unchangedPage.width, unchangedPage.rotateDeg, unchangedPage.zIndex], [55, 66, 77, 12, 8]); checks++;
      // Format entries retain their historical whole-entry selection before runtime overlays.
      const formatRaw = placementRaw(); saveEntry(formatRaw, role, formatId, 'format', { left: 9, top: 8, width: 7 });
      const formatAssembly = await assemblyFrom(formatRaw, formatId);
      const result = await calibrationHandler(formatAssembly.assembly)(request(base));
      assert.equal(result.status, 200); checks++;
      const selected = rolePlacement(await result.json(), role);
      assert.deepEqual([selected.rotateDeg, selected.zIndex], [-11, 4]); checks++;
    }
  }
  if (group === 'zero') {
    const zero = { left: 1, top: 2, width: 3, zIndex: 0 };
    assert.deepEqual(parseCharacterPlacementOverride({ 1: zero }), {}); checks++;
    assert.deepEqual(parseAnimalPlacementOverride({ 1: zero }), {}); checks++;
    assert.equal(parseCoverCharacterPlacementOverride(zero), null); checks++;
  }
  return { checks, interceptedRequests };
}

async function main() {
  let checks = 0, interceptedRequests = 0;
  const focus = process.argv.includes('--qa1-zero') ? 'zero' : process.argv.includes('--qa1-sparse') ? 'sparse' : null;
  const previousToken = process.env.BACKEND_API_TOKEN, previousFetch = globalThis.fetch;
  process.env.BACKEND_API_TOKEN = 'synthetic-calibration-http-authority';
  globalThis.fetch = async () => { throw new Error('Unexpected external HTTP request'); };
  const request = (body: unknown, authorized = true, literal = false) => new NextRequest('https://admin.example.test/api/admin/w3-calibration', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { authorization: 'Bearer synthetic-calibration-http-authority' } : {}) },
    body: literal ? String(body) : JSON.stringify(body),
  });
  try {
    if (!focus) {
    assert.equal((await productionPost(request({}, false))).status, 401); checks++;
    for (const v3 of [true, false]) {
      const config = BookConfigSchema.parse(v3 ? rawV3() : configuredBookRaw());
      const orderId = `LAYOUT-HTTP-${v3 ? 'V3' : 'V1'}`, characterHash = 'synthetic-http-child';
      const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: 'd2c', characterHash,
        input: { characterSpecs: { childName: 'James', animalGuide: 'owl' } } });
      const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, oneManifestKey: w0.artifacts.manifestKey }, {
        loadManifest: async key => key.endsWith('/1-manifest.json') ? w0 : key.endsWith('/2b-manifest.json') ? {
          characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber,
            bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) } : null,
      });
      let reads = 0, inspections = 0;
      const handler = createW3CalibrationPostHandler((body, options) => {
        assert.equal(options?.strictPlacementValidation, true);
        return buildW3CalibrationResponse(body, { ...options,
          buildAssemblyInput: async () => { reads++; return assembly; },
          inspectPose: async () => { inspections++; throw new Error('Synthetic inspection boundary'); },
        });
      });
      const base = { sourceType: 'order', orderId, selectedStoryPageNumber: 1 };
      assert.equal((await handler(request(base, false))).status, 401); checks++;
      assert.equal(reads, 0); checks++;
      assert.equal((await handler(request('{', true, true))).status, 400); checks++;
      assert.equal(reads, 0); checks++;
      for (const field of ['characterPlacementOverrideByStoryPage', 'animalPlacementOverrideByStoryPage', 'coverCharacterPlacementOverride']) {
        reads = 0; inspections = 0;
        const placement = { left: 20, top: 30, width: 55, zIndex: 0 };
        const value = field === 'coverCharacterPlacementOverride' ? placement : { 1: placement };
        const response = await handler(request({ ...base, [field]: value, renderingSchema: 'lhb.book-render@v3' }));
        assert.equal(response.status, v3 ? 200 : 400, field); checks++;
        assert.equal(reads, 1); checks++;
        if (!v3) { assert.equal(inspections, 0); checks++; }
        else {
          const result = await response.json();
          assert.equal(result.success, true); checks++;
          assert.equal((field === 'coverCharacterPlacementOverride' ? result.exportHints[field] : result.exportHints[field]['1']).zIndex, 0); checks++;
        }
      }
      if (v3) {
        reads = 0; inspections = 0;
        assert.equal((await handler(request({ ...base, characterPlacementOverrideByStoryPage: {
          1: { left: 20, top: 30, width: 55, zIndex: 1001 },
        } }))).status, 400); checks++;
        assert.equal(reads, 1); checks++;
        assert.equal(inspections, 0); checks++;
        reads = 0;
        assert.equal((await handler(request({ ...base, characterPlacementOverrideByStoryPage: {
          1: { left: 20, top: 30, width: -1 },
        } }))).status, 400); checks++;
        assert.equal(reads, 0); checks++;
      }
    }
    }
    for (const group of focus ? [focus] : ['zero', 'sparse']) {
      const result = await placementJourneys(request, group); checks += result.checks; interceptedRequests += result.interceptedRequests;
    }
    console.log(JSON.stringify({ result: 'PASS', checks, interceptedRequests, boundaries: ['Actual HTTP parser/auth/core builder', 'Injected authoritative assembly and pose inspection'], hostedCalls: 0 }));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.BACKEND_API_TOKEN; else process.env.BACKEND_API_TOKEN = previousToken;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
