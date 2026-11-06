import assert from 'node:assert/strict';
import { configuredBookFixture, configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { buildW0RunManifest, buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { buildW4PrintInput } from '../src/lib/books/w4-print-input';

async function main() {
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Offline test forbids network'); };
  const orderId = 'LOCAL-FROZEN-SNAPSHOT-GUARD';
  const config = configuredBookFixture();
  const prefix = `${config.bookId}/orders/${orderId}`;
  const produce = async (book: typeof config, id = orderId, rootOrderId = id, characterHash = 'fixture') => {
    const producerPrefix = `${book.bookId}/orders/${id}`;
    const one = JSON.parse(JSON.stringify(buildW0RunManifestFromConfig(book, {
      orderId: id, rootOrderId, platform: 'd2c', formatId: 'standard', characterHash,
      input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } },
    })));
    const twoB = { characterHash, order: { orderId: id, rootOrderId, bookId: book.bookId }, entries: [13, 17, 18].map(poseNumber => ({
      poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, book.bookId),
    })) };
    const assembly = await buildW3AssemblyInput({ orderId: id, rootOrderId, bookId: book.bookId, formatId: 'standard' }, {
      loadManifest: async key => key.endsWith('1-manifest.json') ? one : key.endsWith('2b-manifest.json') ? twoB : null,
    });
    const three = JSON.parse(JSON.stringify(buildW3Manifest({ ...assembly, backendUrl: 'https://offline.invalid',
      pagePreviewImages: assembly.pagePlan.map(page => ({ pageNumber: page.index, r2Key: `${producerPrefix}/${page.label}.png` })),
      coverPngR2Key: `${producerPrefix}/cover.png`,
    }).manifest));
    return { one, three };
  };
  const consume = (one: unknown, three: unknown, bookId = config.bookId, id = orderId, body: Record<string, unknown> = {}) => {
    const root = `${bookId}/orders/${id}`;
    return buildW4PrintInput({ orderId: id, bookId, formatId: 'standard', backendUrl: 'https://offline.invalid', body }, {
      loadManifest: async key => key === `${root}/manifests/1-manifest.json` ? one : key === `${root}/manifests/3-manifest.json` ? three : null,
      loadOrder: async () => ({ orderId: id, print_provider: 'lulu' }),
    });
  };
  const { one, three } = await produce(config);
  assert.equal(three.summary.readyForBook, true);
  await consume(one, three);
  const d2cWithRoot = await produce(config, 'LOCAL-D2C-CHILD', 'LOCAL-D2C-ROOT');
  assert.equal(d2cWithRoot.one.order.rootOrderId, 'LOCAL-D2C-ROOT');
  assert.equal(d2cWithRoot.three.rootOrderId, 'LOCAL-D2C-CHILD');
  const reordered = structuredClone(three);
  reordered.renderSnapshot = Object.fromEntries(Object.entries(reordered.renderSnapshot).reverse());
  await consume(one, reordered); // Object key order is not part of the frozen contract.
  await assert.rejects(consume(null, three), /configured.*W0.*snapshot/i, 'Configured W3 requires frozen W0');
  const injected = { renderSnapshot: { injected: true }, pages: { p00: 'attacker/p00.png' },
    pngGeneration: { pages: Object.fromEntries(three.pageLabels.map((label: string) => [label, `attacker/${label}.png`])), coverSpreadImage: 'attacker/cover.png' } };
  const result = await consume(one, three, config.bookId, orderId, injected);
  assert.deepEqual(result.renderSnapshot, three.renderSnapshot);
  assert.deepEqual(result.pagePreviewImageKeys, three.pageLabels.map((label: string) => three.pngGeneration.pages[label]));
  assert.equal(result.coverPreviewImageKey, three.pngGeneration.coverSpreadImage);
  const missing = structuredClone(three); delete missing.renderSnapshot;
  await assert.rejects(consume(one, missing), /frozen render snapshot/i, 'Configured W3 cannot lose frozen snapshot');
  for (const invalid of [null, {}, '']) {
    await assert.rejects(consume(one, { ...three, renderSnapshot: invalid }), /frozen render snapshot/i);
  }
  for (const change of [
    (s: any) => { s.bookConfig.bookId = 'other-book'; },
    (s: any) => { s.bookConfig.version++; },
    (s: any) => { s.bookConfig.rendering.recipe.copy.title.text = 'Different text'; },
    (s: any) => { s.testOnly = true; },
  ]) {
    const changed = structuredClone(three); change(changed.renderSnapshot);
    await assert.rejects(consume(one, changed), /frozen render snapshot/i, 'Different configured snapshot must fail');
  }
  const rawV2 = configuredBookRaw(); rawV2.rendering.recipe.schema = 'lhb.book-render@v2';
  const { one: oneV2, three: threeV2 } = await produce(BookConfigSchema.parse(rawV2));
  assert.equal(threeV2.summary.readyForBook, false);
  await assert.rejects(consume(oneV2, { ...threeV2, summary: { readyForBook: true } }), /flow layout fit is not yet verified/i);
  const missingV2 = structuredClone(threeV2); delete missingV2.renderSnapshot;
  await assert.rejects(consume(oneV2, missingV2), /frozen render snapshot/i);
  await assert.rejects(consume(null, { ...threeV2, summary: { readyForBook: true } }), /flow layout fit is not yet verified/i);
  await assert.rejects(consume(oneV2, three), /frozen render snapshot/i);
  const legacyBook = 'book-mvp-simple-adventure', legacyId = 'LOCAL-LEGACY-SNAPSHOT-CONTROL';
  const legacyRoot = `${legacyBook}/orders/${legacyId}`;
  const legacyOne = buildW0RunManifest({ orderId: legacyId, platform: 'd2c', bookId: legacyBook, formatId: 'standard', characterHash: 'fixture', input: {} });
  const labels = Array.from({ length: 15 }, (_, i) => `p${String(i).padStart(2, '0')}`);
  const pages = Object.fromEntries(labels.map(label => [label, `${legacyRoot}/preview-images/${label}.png`]));
  const legacyThree = { schema: 'lhb.run-manifest@v2.0', orderId: legacyId, bookId: legacyBook, formatId: 'standard', orderR2BaseKey: legacyRoot,
    pages, pngGeneration: { pages, coverSpreadImage: `${legacyRoot}/preview-images/cover-spread.png` }, summary: { readyForBook: true } };
  await consume(legacyOne, legacyThree, legacyBook, legacyId);
  await assert.rejects(consume(legacyOne, { ...legacyThree, summary: { readyForBook: false } }, legacyBook, legacyId, { summary: { readyForBook: true } }), /saved summary\.readyForBook is false/i);
  await consume(legacyOne, { ...legacyThree, summary: {} }, legacyBook, legacyId);
  assert.equal(networkAttempts, 0);
  console.log('Frozen snapshot guard passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
