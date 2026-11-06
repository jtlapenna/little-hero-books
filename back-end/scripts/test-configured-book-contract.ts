import assert from 'node:assert/strict';
import { configuredBookFixture, configuredBookRaw } from './configured-book-fixture';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { resolvePagePlan } from '../src/lib/books/resolve-page-plan';
import { buildW2APoseWorklist } from '../src/lib/books/review-page-plan';
import { BookConfigSchema } from '../src/lib/books/types';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { BookCopyBlockSchema, BookPageLayerSchema } from '../src/lib/books/book-render-contract';
const config = configuredBookFixture();
const w0 = buildW0RunManifestFromConfig(config, { orderId: 'CONTRACT-01', platform: 'd2c', formatId: 'standard', characterHash: 'test-character', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
assert.ok('renderSnapshot' in w0.book.resolved, 'W0 must freeze configured rendering for the actual order');
const snapshot = normalizeW0Manifest(w0);
assert.deepEqual(buildW2APoseWorklist(snapshot.pagePlan, { includeZeroPose: true, coverLayers: snapshot.renderSnapshot?.bookConfig.rendering.recipe?.covers.standard.layers }).map(p => p.poseNumber), [0, 13, 17, 18], 'W0-to-worklist must include secondary, repeated and cover-only poses exactly once');
assert.deepEqual(snapshot.requiredPoseNumbers, [13, 17, 18]);
const frozenTitle = snapshot.renderSnapshot?.bookConfig.rendering.recipe?.copy.title;
const title = config.rendering.recipe!.copy.title;
assert.ok(frozenTitle && !Array.isArray(frozenTitle));
assert.ok(!Array.isArray(title));
assert.equal(frozenTitle.text, 'A configured title');
title.text = 'LATEST MUTATION';
assert.equal(frozenTitle.text, 'A configured title', 'Snapshot must be a deep copy');
const bad = structuredClone(w0); bad.book.bookConfigRef.version = 99;
assert.throws(() => normalizeW0Manifest(bad), /snapshot|identity/i, 'Normalization must reject conflicting version');
const duplicate = configuredBookRaw(); duplicate.rendering.recipe.poses['duplicate-run'] = { poseNumber: 13, referenceKey: 'book-contract-fixture/other.png' };
assert.throws(() => resolvePagePlan(BookConfigSchema.parse(duplicate), 'standard'), /duplicate.*pose|pose.*duplicate/i);
const missing = configuredBookRaw(); missing.formats.standard.interior.pageSequence[1].layers[0].poseId = 'missing';
assert.throws(() => resolvePagePlan(BookConfigSchema.parse(missing), 'standard'), /pose/i);
const outOfRange = configuredBookRaw(); outOfRange.rendering.recipe.poses['custom-run'].poseNumber = 100;
assert.throws(() => BookConfigSchema.parse(outOfRange));
const unsafe = configuredBookRaw(); unsafe.rendering.recipe.poses['custom-run'].referenceKey = '../private.png';
assert.throws(() => BookConfigSchema.parse(unsafe));
assert.throws(() => BookCopyBlockSchema.parse({ text: 'x', placement: { left: 0, top: 0, width: 100 }, fontSize: 30, edgeStyle: 'url(evil)' }));
assert.throws(() => BookPageLayerSchema.parse({ id: 'logo', kind: 'overlay', assetSlot: 'logo', placement: { left: 0, top: 0, width: 100 }, effect: 'url(evil)' }));
const distinct = configuredBookFixture();
distinct.assets.guideBackgrounds = { story_01: Object.fromEntries(['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 't-rex', 'unicorn']
  .map(guide => [guide, `${distinct.bookId}/backgrounds/${guide}.png`])) };
distinct.assets.guideBackgroundRequiredSlots = ['story_01'];
distinct.formats.amazon.interior.pageSequence[1].backgroundSlot = 'story_02';
for (const formatId of ['standard', 'amazon']) validateBookRenderRecipe(distinct, formatId);
delete distinct.assets.guideBackgrounds.story_01.cat;
assert.throws(() => validateBookRenderRecipe(distinct, 'standard'), /Incomplete guide background mapping/);
const clippedRaw = configuredBookRaw();
const clip = { left: 0.25, top: 0.125, width: 0.5, height: 0.375, cornerRadiusPercent: 12 };
clippedRaw.formats.standard.interior.pageSequence[1].layers[1].clip = clip;
const clippedConfig = BookConfigSchema.parse(clippedRaw);
const clippedW0 = buildW0RunManifestFromConfig(clippedConfig, { orderId: 'CLIP-01', platform: 'd2c',
  characterHash: 'clip-child', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
const clippedIntake = normalizeW0Manifest(clippedW0);
assert.deepEqual(clippedIntake.pagePlan[1].layers?.[1].clip, clip, 'W0 must preserve the secondary-layer crop');
const clippedRender = buildW3PreviewPlan({ orderId: 'CLIP-01', bookId: clippedConfig.bookId, formatId: 'standard',
  configVersion: clippedConfig.version, renderSnapshot: clippedIntake.renderSnapshot, pagePlan: clippedIntake.pagePlan,
  characterSpecs: { childName: 'Ada', animalGuide: 'owl' }, backendUrl: 'https://local.invalid', characterHash: 'clip-child',
  processedImages: [13, 17, 18].map(poseNumber => ({ poseNumber, publicUrl: `https://local.invalid/pose${poseNumber}.png` })) });
const html = clippedRender.pagePreviewItems.map(page => page.pageHtml).join('');
assert.match(html, /clip-path:inset\(12.5% 25% 50% 25% round 6% \/ 4.5%\)/);
assert.equal((html.match(/clip-path:/g) ?? []).length, 1, 'Only the chosen vignette is cropped');
for (const invalid of [{ ...clip, width: 0 }, { ...clip, left: .8 }, { ...clip, top: .9 },
  { ...clip, left: -1 }, { ...clip, cornerRadiusPercent: 51 }]) {
  assert.throws(() => BookPageLayerSchema.parse({ id: 'vignette', kind: 'pose', poseId: 'custom-breath',
    poseNumber: 17, placement: { left: 0, top: 0, width: 100 }, clip: invalid }));
}
console.log('Configured book contract tests passed');
