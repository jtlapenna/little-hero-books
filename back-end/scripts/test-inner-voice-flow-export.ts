import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BookConfigSchema } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { renderConfiguredBook } from '../src/lib/books/configured-book-rendering';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';

const path = process.argv[2];
if (!path) throw new Error('Pass the local provisional authoring config path');
const config = BookConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
const saved = config.rendering.recipe!.copy['page-26'];
assert.ok(Array.isArray(saved) && saved[0].flow, 'Exported flow group must survive config parsing');
const manifest = buildW0RunManifestFromConfig(config, { orderId: 'FLOW-LOCAL-EXPORT', platform: 'd2c', formatId: 'standard', characterHash: 'flow-local-child', input: { bookSpecs: { testMode: true }, characterSpecs: { childName: 'Alexandra', animalGuide: 'cat' } } });
const snapshot = normalizeW0Manifest(JSON.parse(JSON.stringify(manifest))).renderSnapshot!;
assert.deepEqual(snapshot.bookConfig.rendering.recipe!.copy['page-26'], saved);
const w3 = buildW3Manifest({ orderId: 'FLOW-LOCAL-EXPORT', bookId: config.bookId, formatId: 'standard', configVersion: config.version,
  renderSnapshot: snapshot, backendUrl: 'https://local.invalid',
  pagePreviewImages: config.formats.standard.interior.pageSequence.map(page => ({ pageNumber: page.index, r2Key: `${config.bookId}/orders/FLOW-LOCAL-EXPORT/${page.label}.png` })),
  coverPngR2Key: `${config.bookId}/orders/FLOW-LOCAL-EXPORT/cover.png` });
assert.equal((w3.manifest.summary as { readyForBook: boolean }).readyForBook, false, 'Provisional flow must remain on hold');
for (const guide of ['cat', 'owl', 'dog', 'lion', 'tiger', 'penguin', 't-rex', 'unicorn']) {
  const guideManifest = buildW0RunManifestFromConfig(config, { orderId: `FLOW-${guide}`, platform: 'd2c', formatId: 'standard', characterHash: `flow-${guide}`, input: { bookSpecs: { testMode: true }, characterSpecs: { childName: 'Alexandra', animalGuide: guide } } });
  const guideSnapshot = normalizeW0Manifest(JSON.parse(JSON.stringify(guideManifest))).renderSnapshot!;
  const rendered = renderConfiguredBook({ bookId: config.bookId, formatId: 'standard', configVersion: config.version,
    backendUrl: 'https://local.invalid', characterHash: 'flow-local-child', characterSpecs: { childName: 'Alexandra', animalGuide: guide },
    processedImages: Array.from({length: 13}, (_, poseNumber) => ({ poseNumber, publicUrl: `https://local.invalid/${poseNumber}.png` })) }, guideSnapshot);
  const html = rendered.pageBlocks.find(block => block.page.id === 'page-26')!.html;
  const label = guide === 't-rex' ? 'T-Rex' : guide[0].toUpperCase() + guide.slice(1);
  assert.match(html, new RegExp(`Alexandra and ${label} `));
  assert.match(html, /<p class="lhb-flow-paragraph">/);
  assert.match(html, /rotate\(-4deg\)/);
  assert.doesNotMatch(html, /\[animal guide\]/i);
}
console.log('Exported candidate passed config, W0 serialization and W3 HTML checks');
