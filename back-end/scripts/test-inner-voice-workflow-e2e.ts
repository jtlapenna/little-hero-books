/** Offline generated-art handoff through real W0, W3 and Gelato W4 boundaries. */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { finalArtFixture } from './final-art-fixture';
import { prepareFinalArtCandidate, validateFinalArtCandidate } from '../src/lib/books/final-art-candidate';
import { BookConfigSchema, type BookConfig } from '../src/lib/books/types';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { buildW4PrintInput } from '../src/lib/books/w4-print-input';
import { assertW4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

async function journey(config: BookConfig, formatId: string, name: string, guide: string, orderId: string, rootOrderId = orderId,
  expectedReadingZ = name.length >= 15 ? 0 : 9) {
  config = BookConfigSchema.parse(JSON.parse(JSON.stringify(config)));
  const testMode = config.status === 'draft';
  const bookId = config.bookId;
  const hash = `synthetic-${orderId}`;
  const w0 = JSON.parse(JSON.stringify(buildW0RunManifestFromConfig(config, {
    orderId, rootOrderId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', formatId, characterHash: hash,
    input: { bookSpecs: { testMode }, characterSpecs: { childName: name, animalGuide: guide, pronouns: 'they/them', hometown: 'Grass Valley' } },
  })));
  const intake = normalizeW0Manifest(w0);
  assert.equal(intake.renderSnapshot?.bookConfig.version, config.version);
  assert.deepEqual(intake.renderSnapshot?.bookConfig.rendering.recipe, config.rendering.recipe);
  assert.deepEqual(intake.renderSnapshot?.bookConfig.assets.guideBackgrounds, config.assets.guideBackgrounds);
  const twoB = { characterHash: hash, order: { orderId, bookId }, entries: Object.values(config.rendering.recipe!.poses).map(pose => ({
    poseNumber: pose.poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, pose.poseNumber, bookId),
  })) };
  const assembly = await buildW3AssemblyInput({ orderId, bookId, formatId, testMode, testModePages: 0 }, {
    loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? twoB : null,
  });
  const preview = buildW3PreviewPlan({ ...assembly, backendUrl: 'https://offline.example.test' });
  assert.equal(preview.pagePreviewItems.length, 32);
  assert.deepEqual(preview.pagePreviewItems.map(page => page.pageLabel), config.formats[formatId].interior.pageSequence.map(page => page.label));
  const page = preview.pagePreviewItems.find(item => item.pageLabel === 'p04')!.pageHtml;
  const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  // Long-name variants retain the name as one phrase with nonbreaking spaces.
  assert(page.includes((name.length >= 15 ? escaped.replace(/\s+/g, '\u00a0') : escaped)));
  assert.match(page, /data-copy-block-id="fixture-name"/);
  assert.match(page, new RegExp(`data-copy-block-id="fixture-name"[^>]+font-size:${name.length >= 15 ? 52 : 80}px;`));
  assert.match(page, /data-copy-block-id="fixture-second"/);
  assert.match(page, /lhb-reading-area/);
  assert.match(page, new RegExp(`lhb-reading-area[^>]+z-index:${expectedReadingZ};`), 'Reading panels stay below resolved copy placement');
  assert.match(page, /text-shadow:|text-stroke:/);
  assert.match(preview.coverPreviewItem.coverHTML, /filter:drop-shadow/);
  assert.match(preview.coverPreviewItem.coverHTML, /-webkit-text-stroke:4px/);
  const expectedCoverSize = name.length > 15 ? 100 * Math.max(0.5, 15 / name.length) : 100;
  assert.match(preview.coverPreviewItem.coverHTML, new RegExp(`font-size:${String(expectedCoverSize).replace('.', '\\.')}px;`));
  const guideSlot = config.formats[formatId].interior.pageSequence.find(item => item.label === 'p08')!.backgroundSlot!;
  assert(preview.pagePreviewItems.find(item => item.pageLabel === 'p08')!.pageHtml.includes(config.assets.guideBackgrounds![guideSlot][guide]));
  for (const label of ['p05', 'p06']) assert(preview.pagePreviewItems.find(item => item.pageLabel === label)!.pageHtml.includes('/review-candidates/'));
  assert(!/\[(?:Child Name|animal guide|subject pronoun|object pronoun)\]/i.test(preview.pages_html));
  const images = preview.pagePreviewItems.map(item => ({ pageNumber: item.pageNumber, pageLabel: item.pageLabel, r2Key: item.pageImageR2Key }));
  const manifest = buildW3Manifest({ ...preview, pagePreviewImages: images, coverPngR2Key: preview.coverPreviewItem.coverPngR2Key }, { intake });
  assert.equal((manifest.manifest.summary as Record<string, unknown>).readyForBook, !testMode);
  assert.equal(manifest.manifest.testOnly, testMode);
  const prefix = `${bookId}/orders/${orderId}`;
  const print = config.formats[formatId].print;
  assert.equal(print.provider, 'gelato');
  const row = { orderId, root_order_id: rootOrderId, print_provider: 'gelato', print_config_version: config.version,
    print_product_uid: print.productUid, print_inner_page_count: print.innerPageCount,
    print_api_page_count: print.apiPageCount, print_expected_pdf_page_count: print.expectedPdfPageCount };
  const consume = (three = manifest.manifest, one = w0) => buildW4PrintInput({ orderId, bookId, formatId, backendUrl: 'https://offline.example.test' }, {
    expectedProvider: 'gelato', loadOrder: async () => row,
    loadManifest: async key => key === `${prefix}/manifests/1-manifest.json` ? one : key === `${prefix}/manifests/3-manifest.json` ? three : null,
  });
  if (testMode) await assert.rejects(consume(), /saved summary.readyForBook is false/);
  else {
    const printInput = assertW4GelatoPrintInput(await consume());
    assert.equal(printInput.pagePlan.length, 32); assert.equal(printInput.bookConfigVersion, config.version);
  }
  await assert.rejects(consume({ ...manifest.manifest, orderId: 'OTHER-ORDER' }), /canonical order\/book identity/);
  await assert.rejects(consume({ ...manifest.manifest, formatId: formatId === 'standard' ? 'amazon' : 'standard' }), /canonical order\/book identity/);
  await assert.rejects(consume({ ...manifest.manifest, pageLabels: [...manifest.manifest.pageLabels as string[]].reverse() }), /frozen W0 sequence/);
  const incomplete = buildW3Manifest({ ...preview, pagePreviewImages: images.slice(1), coverPngR2Key: preview.coverPreviewItem.coverPngR2Key }, { intake });
  assert.equal((incomplete.manifest.summary as Record<string, unknown>).readyForBook, false);
  await assert.rejects(consume(incomplete.manifest), /saved summary.readyForBook is false/);
  return { w0, manifest, consume };
}

async function main() {
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Offline journey forbids external network'); };
  const root = mkdtempSync(resolve(tmpdir(), 'lhb-inner-voice-e2e-'));
  try {
    const fixture = await finalArtFixture(root);
    const inventoryFile = await prepareFinalArtCandidate({ root, output: resolve(root, 'candidate'), ...fixture });
    const candidate = await validateFinalArtCandidate(root, inventoryFile);
    const config = candidate.config;
    const names = ['A', 'Alexandra', 'James', 'Alexandria Isabella Montgomery', 'm'.repeat(30), "O'Neil & <Joy>"];
    const guides = ['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 't-rex', 'unicorn'];
    let cases = 0;
    for (const format of ['standard', 'amazon']) for (const guide of guides) for (const [index, name] of names.entries()) {
      await journey(config, format, name, guide, `LOCAL-${format}-${guide}-${index}`); cases++;
    }
    const active = BookConfigSchema.parse({ ...config, status: 'active' }); // Test memory only; never publish this fixture.
    for (const length of [15, 16]) await journey(config, 'standard', 'A'.repeat(length), 'cat', `LOCAL-NAME-THRESHOLD-${length}`);
    for (const format of ['standard', 'amazon']) await journey(active, format, 'Active fixture', 'cat', `LOCAL-CONTROL-${format}`);
    const first = await journey(active, 'amazon', 'Sibling A', 'owl', 'LOCAL-SIB-A', 'LOCAL-SIBLINGS');
    const second = await journey(active, 'amazon', 'Sibling B', 'dog', 'LOCAL-SIB-B', 'LOCAL-SIBLINGS');
    await assert.rejects(first.consume(second.manifest.manifest), /canonical order\/book identity/);
    await assert.rejects(first.consume(first.manifest.manifest, second.w0), /canonical order\/book identity/);
    for (const [label, zIndex, longNameZ, expected] of [
      ['default', undefined, undefined, 9], ['zero', 0, undefined, 0],
      ['long-low', 50, 1, 0], ['long-default', 50, undefined, 9],
    ] as const) {
      const regression = structuredClone(config);
      const blocks = regression.rendering.recipe!.copy['page-05']; assert(Array.isArray(blocks));
      blocks[0].placement.zIndex = zIndex;
      if (label.startsWith('long')) blocks[0].longName!.placement = { ...blocks[0].placement, zIndex: longNameZ };
      regression.rendering.recipe!.readingAreas!['page-05'][0].opacity = 1;
      const id = `LOCAL-STACK-${label}`;
      await journey(regression, 'standard', label.startsWith('long') ? 'Alexandria Montgomery' : 'A', 'cat', id, id, expected);
    }
    const different = structuredClone(config);
    different.formats.amazon.interior.pageSequence.find(page => page.label === 'p08')!.backgroundSlot = 'amazon_only';
    different.assets.backgrounds.amazon_only = different.assets.backgrounds.page_09;
    different.assets.guideBackgrounds!.amazon_only = Object.fromEntries(guides.map(guide => [guide, `${config.bookId}/v2/backgrounds/amazon-${guide}.png`]));
    for (const format of ['standard', 'amazon']) await journey(different, format, 'Alexandra', 'owl', `LOCAL-DISTINCT-${format}`);
    different.assets.guideBackgrounds!.unused = different.assets.guideBackgrounds!.amazon_only;
    assert.throws(() => validateBookRenderRecipe(different, 'standard'), /not used/);
    const legacy = loadBundledBookConfig({ bookId: config.bookId, version: 1 });
    assert.equal(legacy.rendering.recipe!.copy['page-05'] instanceof Array, false);
    assert.equal(BookConfigSchema.parse(legacy).assets.guideBackgrounds, undefined);
    assert.equal(config.status, 'draft'); assert.equal(loadBundledBookConfig({ bookId: config.bookId, version: 2 }).status, 'draft');
    const version3Root = resolve(root, 'version3'); mkdirSync(version3Root);
    const fixture3 = await finalArtFixture(version3Root, 3);
    const inventory3 = await prepareFinalArtCandidate({ root, output: resolve(version3Root, 'candidate'), ...fixture3 });
    const version3 = (await validateFinalArtCandidate(root, inventory3)).config;
    for (const format of ['standard', 'amazon']) {
      await journey(version3, format, 'Alexandra', 'owl', `LOCAL-V3-DRAFT-${format}`);
      await journey(BookConfigSchema.parse({ ...version3, status: 'active' }), format, 'Active fixture', 'dog', `LOCAL-V3-CONTROL-${format}`);
    }
    assert.equal(networkAttempts, 0);
    console.log(`Inner Voice offline journey: ${cases} draft cases, 2 name thresholds, 2 active controls, 2 sibling identities, 4 stacking, 2 edition-slot and 4 version-3 cases; W0/W3/Gelato W4 passed; network attempts 0`);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
