import assert from 'node:assert/strict';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { BookConfigSchema, type BookCharacterPlacementEntry } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3CalibrationResponse, type W3CalibrationRequest } from '../src/lib/w3-calibration';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { dragBookPlacement, mergeBookPlacement, resolveBookPlacement, bookPlacementStyle } from '../src/lib/books/book-layout-geometry';

async function main() {
  let checks = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  try {
    for (const formatId of ['standard', 'amazon']) {
      for (const mode of ['reference', 'percent', 'native']) {
        const raw = rawV3();
        for (const format of Object.values(raw.formats) as Array<{ interior: { pageSequence: any[] } }>) {
          const layer = format.interior.pageSequence[1].layers[0];
          layer.placement.zIndex = 0;
          if (mode === 'percent') Object.assign(layer.placement, { left: 40, top: 70, width: 30, layout: {
            units: 'percent', anchorXPercent: 30, anchorYPercent: 80, originXPercent: 50, originYPercent: 50, scale: 0.8,
          } });
          if (mode === 'native') delete layer.placement.layout;
          format.interior.pageSequence[1].layers.push({ id: 'second-trail', kind: 'animal', role: 'trail',
            placement: { left: 10, top: 10, width: 20, layout: { units: 'percent', anchorXPercent: 25, anchorYPercent: 85 } } });
          format.interior.pageSequence[2].poseNumber = null;
          format.interior.pageSequence[2].layers = [{ id: 'only-guide', kind: 'animal', role: 'trail',
            placement: { left: 60, top: 70, width: 20, zIndex: 0, layout: { units: 'percent', anchorXPercent: 50, anchorYPercent: 100 } } }];
        }
        for (const cover of Object.values(raw.rendering.recipe.covers) as any[]) {
          cover.layers[0].placement.zIndex = 0;
          if (mode !== 'native') cover.layers[0].placement = { left: mode === 'percent' ? 80 : 3000,
            top: mode === 'percent' ? 75 : 2100, width: mode === 'percent' ? 20 : 1000, zIndex: 0,
            layout: { units: mode === 'percent' ? 'percent' : 'px', anchorXPercent: 37, anchorYPercent: 82, originXPercent: 50, originYPercent: 50, scale: 0.8 } };
        }
        if (mode === 'reference') raw.rendering.characterPlacement = {
          defaultByStoryPage: { 1: { left: 700, top: 1600, width: 900, anchorXPercent: 40, anchorYPercent: 80, zIndex: 2 } },
          overridesByFormat: { amazon: { 1: { left: 760, top: 1610, width: 910, anchorXPercent: 43, anchorYPercent: 83, zIndex: 3 } } },
        };
        const config = BookConfigSchema.parse(raw), orderId = `V3-CALIBRATION-${formatId}-${mode}`, characterHash = 'synthetic-calibration-child';
        const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: 'd2c', formatId, characterHash,
          input: { characterSpecs: { childName: 'James', animalGuide: 'owl', pronouns: 'they/them' } } });
        const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, oneManifestKey: w0.artifacts.manifestKey }, {
          loadManifest: async key => key.endsWith('/1-manifest.json') ? w0 : key.endsWith('/2b-manifest.json') ? {
            characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber,
              bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) } : null,
          normalizePoseScale: async ({ imageKey, poseNumber }) => ({ success: true, normalized: false, imageKey, refKey: '',
            poseNumber, bookId: config.bookId, scaleFactor: 1, horizontalOffset: 0, verticalOffset: 0, groundContactOffset: 0,
            sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true, message: 'Synthetic normalization boundary' }),
        });
        const build = (overrides?: Record<string, unknown>, extra: Partial<W3CalibrationRequest> = {}) => buildW3CalibrationResponse({ sourceType: 'order', orderId,
          selectedStoryPageNumber: 1, characterPlacementOverrideByStoryPage: overrides, ...extra }, {
          buildAssemblyInput: async () => assembly, inspectPose: async () => { throw new Error('Synthetic pose inspection boundary'); },
        });
        const first = await build();
        const page = first.selectedPage!;
        assert.equal(page.renderingSchema, 'lhb.book-render@v3'); checks++;
        const rawPlacement = page.editableLayerPlacement!;
        const current = page.currentPlacement!;
        const configuredDefault: BookCharacterPlacementEntry = mode === 'reference'
          ? config.rendering.characterPlacement.overridesByFormat[formatId]?.['1'] ?? config.rendering.characterPlacement.defaultByStoryPage['1'] : rawPlacement;
        assert.equal(current.left, configuredDefault.left); checks++;
        assert.equal(current.top, configuredDefault.top); checks++;
        assert.equal(current.width, configuredDefault.width); checks++;
        if (mode !== 'native') {
          assert.equal(current.anchorXPercent, mode === 'reference' ? configuredDefault.anchorXPercent : rawPlacement.layout!.anchorXPercent); checks++;
          assert.equal(current.anchorYPercent, mode === 'reference' ? configuredDefault.anchorYPercent : rawPlacement.layout!.anchorYPercent); checks++;
        } else assert.equal(current.anchorXPercent, undefined);
        const replayed = await build(JSON.parse(JSON.stringify({ 1: current })));
        assert.deepEqual(replayed.selectedPage!.currentPlacement, current); checks++;
        const canvas = { w: page.viewport.width, h: page.viewport.height };
        const merged = mergeBookPlacement(rawPlacement, current);
        const display = resolveBookPlacement(merged, canvas);
        assert.match(buildW3PreviewPlan({ ...assembly }).pages_html, new RegExp(`left:${display.left}px;top:${display.top}px;width:${display.width}px`)); checks++;
        const style = bookPlacementStyle(display, canvas);
        assert.ok(page.currentSrcDoc!.includes(`left:${display.left}px;top:${display.top}px;width:${display.width}px`)); checks++;
        assert.equal(parseFloat(style.width), display.width / canvas.w * 100); checks++;
        const dragged = dragBookPlacement(merged, canvas, { width: 525, height: 525 }, { x: 21, y: -10.5 });
        const expectedDelta = mode === 'percent' ? { x: 4, y: -2 } : mode === 'reference' ? { x: 102, y: -51 } : { x: 105, y: -52.5 };
        assert.ok(Math.abs(dragged.left - current.left - expectedDelta.x) < 1e-9); checks++;
        assert.ok(Math.abs(dragged.top - current.top - expectedDelta.y) < 1e-9); checks++;
        const dragResponse = await build({ 1: { ...current, ...dragged } });
        assert.equal(dragResponse.selectedPage!.currentPlacement!.left, dragged.left); checks++;
        assert.equal(dragResponse.selectedPage!.currentPlacement!.top, dragged.top); checks++;
        if (mode !== 'native') {
          const anchored = await build({ 1: { ...current, anchorXPercent: 17, anchorYPercent: 63 } });
          assert.equal(anchored.exportHints.characterPlacementOverrideByStoryPage['1'].anchorXPercent, 17); checks++;
          assert.equal(anchored.selectedPage!.currentPlacement!.anchorYPercent, 63); checks++;
          assert.match(anchored.selectedPage!.currentSrcDoc!, /translate\(-17%,-63%\)/); checks++;
        }
        const trail = page.fixedLayers!.find(layer => layer.id === 'trail')!;
        assert.equal(trail.placement.layout!.units, 'percent'); checks++;
        assert.equal(resolveBookPlacement(trail.placement, canvas).width, canvas.w); checks++;
        const animalOverride = { left: 20, top: 30, width: 55, zIndex: 0, anchorXPercent: 17, anchorYPercent: 63 };
        const animalFixed = await build(undefined, { animalPlacementOverrideByStoryPage: { 1: animalOverride } });
        const fixed = animalFixed.selectedPage!.fixedLayers!.find(layer => layer.id === 'trail')!;
        const fixedDisplay = resolveBookPlacement(fixed.placement, canvas);
        assert.equal(fixed.placement.left, 20); checks++;
        assert.equal(fixed.placement.zIndex, 0); checks++;
        assert.equal(fixed.placement.layout!.anchorXPercent, 17); checks++;
        assert.ok(animalFixed.selectedPage!.currentSrcDoc!.includes(`left:${fixedDisplay.left}px;top:${fixedDisplay.top}px;width:${fixedDisplay.width}px`)); checks++;
        const secondTrail = animalFixed.selectedPage!.fixedLayers!.find(layer => layer.id === 'second-trail')!;
        assert.equal(secondTrail.placement.left, 10); checks++;
        assert.equal(secondTrail.placement.layout!.anchorXPercent, 25); checks++;
        assert.equal(animalFixed.selectedPage!.fixedLayers!.find(layer => layer.id === 'vignette')!.placement.left, 100); checks++;
        const animalOnly = await build(undefined, { selectedStoryPageNumber: 2, animalPlacementOverrideByStoryPage: { 2: animalOverride } });
        assert.equal(animalOnly.selectedPage!.editableAssetType, 'animal'); checks++;
        assert.equal(animalOnly.selectedPage!.currentPlacement!.anchorXPercent, 17); checks++;
        const animalReplay = await build(undefined, { selectedStoryPageNumber: 2,
          animalPlacementOverrideByStoryPage: JSON.parse(JSON.stringify({ 2: animalOnly.selectedPage!.currentPlacement })) });
        assert.deepEqual(animalReplay.selectedPage!.currentPlacement, animalOnly.selectedPage!.currentPlacement); checks++;
        const cover = await build(undefined, { selectedStoryPageNumber: 0 });
        assert.equal(cover.selectedPage!.currentPlacement!.zIndex, 0); checks++;
        assert.equal(cover.selectedPage!.legacyPlacement!.left, cover.selectedPage!.editableLayerPlacement!.left); checks++;
        const coverReplay = await build(undefined, { selectedStoryPageNumber: 0,
          coverCharacterPlacementOverride: JSON.parse(JSON.stringify(cover.selectedPage!.currentPlacement)) });
        assert.deepEqual(coverReplay.selectedPage!.currentPlacement, cover.selectedPage!.currentPlacement); checks++;
        if (mode !== 'native') {
          assert.equal(coverReplay.selectedPage!.currentPlacement!.anchorXPercent, 37); checks++;
          assert.match(coverReplay.selectedPage!.legacySrcDoc!, /translate\(-37%,-82%\)/); checks++;
        }
      }
    }
    console.log(JSON.stringify({ result: 'PASS', checks, boundaries: ['Synthetic pose assets and inspection', 'No browser in this suite'] }));
  } finally { globalThis.fetch = previous; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
