/** Offline producer/consumer probe. Draft sources must remain barred from print. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { buildW4PrintInput } from '../src/lib/books/w4-print-input';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

async function main() {
  assert.ok(process.argv[2] && process.argv[4], 'Pass proof directory, guide, and source-freeze file');
  const proofRoot = resolve(process.argv[2]);
  const freeze = JSON.parse(readFileSync(resolve(process.argv[4]), 'utf8'));
  const hashFile = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  assert.equal(hashFile(resolve(__dirname, '../src/lib/books/configs/book-finding-our-inner-voice/v2.json')), freeze.configRawSha256, 'Wrong frozen renderer config');
  assert.equal(hashFile(join(proofRoot, 'manifest.json')), freeze.htmlManifestSha256, 'Wrong HTML manifest');
  for (const source of freeze.sourceFiles) assert.equal(hashFile(resolve(__dirname, '../..', source.path)), source.frozenSha256, 'Frozen renderer source changed');
  for (const asset of freeze.assets) assert.equal(hashFile(asset.frozen), asset.sha256, 'Frozen input asset changed');
  assert.equal(freeze.schema, 'lhb.cover-independent-source-freeze@v1');
  assert.equal(freeze.htmlFiles.length, 514, 'Require complete interior and cover HTML binding');
  for (const html of freeze.htmlFiles) assert.equal(hashFile(html.file), html.sha256, 'Frozen HTML changed');
  const renderRecord = JSON.parse(readFileSync(join(proofRoot, 'render-result-selected.json'), 'utf8'));
  assert.equal(renderRecord.failures.length, 0); assert.ok(renderRecord.rendered >= 64);
  const rasterLedger = JSON.parse(readFileSync(join(proofRoot, 'source-raster-ledger.json'), 'utf8'));
  assert.equal(rasterLedger.sourceFreezeSha256, hashFile(resolve(process.argv[4])));
  assert.equal(rasterLedger.sourceRenderResultSha256, hashFile(join(proofRoot, rasterLedger.sourceRenderResultFile)));
  assert.equal(rasterLedger.sourceManifestSha256, hashFile(join(proofRoot, 'manifest.json')));
  assert.equal(rasterLedger.pages.length, 64);
  const guide = process.argv[3] || 'cat';
  const childName = JSON.parse(readFileSync(join(proofRoot, 'manifest.json'), 'utf8')).childName;
  const bookId = 'book-finding-our-inner-voice';
  const backendUrl = 'https://offline.example.invalid';
  const config = loadBundledBookConfig({bookId, version: 2});
  const receipts: unknown[] = [];
  const pendingManifests: Array<{filename: string; value: unknown}> = [];
  for (const formatId of ['standard', 'amazon']) {
    const orderId = `PROOF-${formatId}-${guide}`;
    const characterHash = 'synthetic-proof-hash';
    const one = buildW0RunManifestFromConfig(config, {orderId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', formatId,
      characterHash, input: {bookSpecs: {testMode: true}, characterSpecs: {childName, animalGuide: guide, hometown: 'Grass Valley', pronouns: 'she/her'}}});
    const twoB = {characterHash, order: {orderId, bookId}, entries: Object.values(config.rendering.recipe!.poses).map(pose =>
      ({poseNumber: pose.poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, pose.poseNumber, bookId)}))};
    const assembly = await buildW3AssemblyInput({orderId, bookId, formatId, testMode: true, testModePages: 0},
      {loadManifest: async key => key.endsWith('1-manifest.json') ? one : key.endsWith('2b-manifest.json') ? twoB : null});
    const preview = buildW3PreviewPlan({...assembly, backendUrl});
    const pages = [];
    for (const item of preview.pagePreviewItems) {
      const file = join(proofRoot, 'raster', formatId, guide, `${item.pageLabel}.png`);
      assert.ok(existsSync(file), `Missing rendered page ${file}`);
      const ledgerRows = rasterLedger.pages.filter((row: any) => row.formatId === formatId && row.guide === guide && row.pageLabel === item.pageLabel);
      assert.equal(ledgerRows.length, 1);
      assert.equal(hashFile(file), ledgerRows[0].pngSha256);
      await sharp(file, {failOn: 'warning'}).raw().toBuffer();
      const metadata = await sharp(file).metadata();
      assert.equal(metadata.width, 2625); assert.equal(metadata.height, 2625);
      assert.equal(metadata.channels, 3);
      pages.push({pageNumber: item.pageNumber, r2Key: item.pageImageR2Key, pngSha256: hashFile(file)});
    }
    assert.equal(pages.length, 32);
    const result = buildW3Manifest({...preview, pagePreviewImages: pages,
      coverPngR2Key: preview.coverPreviewItem.coverPngR2Key});
    assert.equal(result.manifest.testOnly, true);
    assert.equal((result.manifest.summary as Record<string, unknown>).readyForBook, false);
    assert.deepEqual(result.manifest.pageLabels, preview.pagePreviewItems.map(item => item.pageLabel));
    assert.equal(Object.keys(result.manifest.pages as Record<string, unknown>).length, 32);
    const prefix = `${bookId}/orders/${orderId}`;
    const loadManifest = async (key: string) => key === `${prefix}/manifests/1-manifest.json` ? one
      : key === `${prefix}/manifests/3-manifest.json` ? result.manifest : null;
    const print = config.formats[formatId].print;
    assert.ok(print.provider === 'gelato');
    const row = {orderId, print_provider: 'gelato', print_config_version: 2,
      print_product_uid: print.productUid, print_inner_page_count: print.innerPageCount,
      print_api_page_count: print.apiPageCount, print_expected_pdf_page_count: print.expectedPdfPageCount};
    const call = (manifest = result.manifest) => buildW4PrintInput({orderId, bookId, formatId, backendUrl},
      {loadManifest: async key => key === `${prefix}/manifests/3-manifest.json` ? manifest : loadManifest(key),
        loadOrder: async () => row, expectedProvider: 'gelato'});
    await assert.rejects(() => call(), /not ready|readyForBook|draft|test.only/i);
    for (const changed of [
      {...result.manifest, orderId: 'WRONG-ORDER'},
      {...result.manifest, formatId: formatId === 'standard' ? 'amazon' : 'standard'},
      {...result.manifest, pageLabels: [...result.manifest.pageLabels].reverse()},
    ]) await assert.rejects(() => call(changed as typeof result.manifest), /identity|page labels|sequence|format/i);
    const incomplete = buildW3Manifest({...preview, pagePreviewImages: pages.slice(1),
      coverPngR2Key: preview.coverPreviewItem.coverPngR2Key});
    assert.equal((incomplete.manifest.summary as Record<string, unknown>).readyForBook, false);
    assert.equal((incomplete.manifest.summary as Record<string, unknown>).percentComplete, 97);
    receipts.push({formatId, pages: pages.length, sourceRasterHashes: pages, draft: true, testOnly: true, readyForBook: false,
      actualW3ManifestProducer: true, actualW4ConsumerRejected: true,
      wrongOrderRejected: true, wrongFormatRejected: true, reorderedLabelsRejected: true,
      missingPageNotReady: true, providerCalls: 0, poseInputs: 'retained reference fixtures, not current W2 output'});
    pendingManifests.push({filename: `${formatId}-${guide}-3-manifest.private.json`, value: result.manifest});
  }
  for (const item of pendingManifests) assert.ok(!existsSync(join(proofRoot, item.filename)), 'Refuse existing proof artifacts');
  for (const item of pendingManifests) writeFileSync(join(proofRoot, item.filename), JSON.stringify(item.value, null, 2)+'\n', {mode: 0o600, flag: 'wx'});
  writeFileSync(join(proofRoot, `${guide}-w3-w4-proof.json`), JSON.stringify({receipts, sourceFreezeSha256: hashFile(resolve(process.argv[4])), probeSha256: hashFile(__filename), liveRequests: 0}, null, 2)+'\n', {mode: 0o600, flag: 'wx'});
  console.log(JSON.stringify({formats: receipts.length, sourceRasters: 64, printBlockedAsExpected: true, liveRequests: 0}));
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
