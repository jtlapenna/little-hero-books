import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildW0RunManifestFromConfig, buildW0RunManifestRuntime } from '@/lib/books/build-run-manifest';
import { loadBundledBookConfig } from '@/lib/books/load-book-config';
import { buildW3Manifest } from '@/lib/books/w3-manifest';
import { normalizeW0Manifest } from '@/lib/books/normalize-w0-manifest';
import { BookConfigSchema } from '@/lib/books/types';
import { buildBookConfigPublishPayload, loadRuntimeBookConfig, parsePublishedBookConfigRow } from '@/lib/books/runtime-book-config';
import { assertCompletePrintRoutingMembership, canonicalW0RoutingKey, resolveFrozenPrintRouting, resolvePrintRoutingGroup, type PrintRoutingOrder } from '@/lib/books/print-routing';
import { parseW0ManifestRequest } from '@/lib/w0-manifest-request';
import { buildOrderIntakeManifestFromNormalizedInputRuntime, buildW0OrderUpsertPayload } from '@/lib/w0-manifest-builder';
import { buildW4SubmitInput } from '@/lib/books/w4-submit-input';
import { buildW4SiblingSubmitInput } from '@/lib/books/w4-sibling-print-input';
import { loadPrintRoutingGroupMembers, resolvePrintRoutingRequest } from '@/lib/books/print-routing-endpoint';
import { assertPrintAssignmentCompatible } from '@/lib/books/print-assignment';
import { buildW4PrintInput } from '@/lib/books/w4-print-input';
import { assertW4GelatoPrintInput } from '@/lib/books/w4-gelato-print-input';
import { assertGelatoPrintOrderRowIdentity } from '@/lib/books/gelato-print-ownership';
import { buildManifestKeyFromOrderPrefix, buildOrderPrefix, buildPreviewImageAssetKey } from '@/lib/order-paths';

type MutableRoutingManifest = { book: { resolved: { print: Record<string, unknown> } } };
const mutableRoutingManifest = (value: unknown) => value as MutableRoutingManifest;

async function main() {
  const identityRow = { id: 7, orderId: 'IDENTITY-7', print_provider: 'gelato', print_config_version: 2,
    print_product_uid: 'synthetic-gelato-product', print_inner_page_count: 32, print_api_page_count: 32,
    print_expected_pdf_page_count: 35 };
  assertGelatoPrintOrderRowIdentity('IDENTITY-7', 7, identityRow, { configVersion: 2,
    productUid: 'synthetic-gelato-product', innerPageCount: 32, apiPageCount: 32, expectedPdfPageCount: 35 });
  assert.throws(() => assertGelatoPrintOrderRowIdentity('IDENTITY-7', 8, identityRow), /database identity mismatch/);
  assert.throws(() => assertGelatoPrintOrderRowIdentity('OTHER-ORDER', 7, identityRow), /order identity mismatch/);
  const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 1 });
  const gelatoConfig = structuredClone(loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 }));
  gelatoConfig.version = 2;
  const unverifiedGelatoConfig = structuredClone(gelatoConfig);
  for (const format of Object.values(unverifiedGelatoConfig.formats)) {
    if (format.print.provider === 'gelato') format.print.apiPageCountVerified = false;
  }
  for (const format of Object.values(gelatoConfig.formats)) {
    if (format.print.provider !== 'gelato') throw new Error('Expected bundled Gelato v2 print config');
    format.print = {
      ...format.print,
      apiPageCountVerified: true,
      productUid: 'synthetic-gelato-product',
      shipmentMethodPolicy: { version: 1, destinationCountries: ['US'], tiers: {} },
    };
  }
  const v2 = BookConfigSchema.parse(gelatoConfig);
  const input = { orderId: 'TEST-GELATO-1', platform: 'd2c' as const, formatId: 'standard',
    input: { bookSpecs: { testMode: true } } };
  const order: PrintRoutingOrder = { id: 1, orderId: input.orderId,
    one_manifest_url: `${config.bookId}/orders/${input.orderId}/manifests/1-manifest.json`,
    shipping_address: { name: 'Synthetic Recipient', address_line_1: '123 Test St', city: 'Test City',
      state_code: 'CA', postcode: '90001', country_code: 'US' } };
  const lulu = buildW0RunManifestFromConfig(config, input);
  const gelato = buildW0RunManifestFromConfig(v2, input);
  const unverifiedManifest = buildW0RunManifestFromConfig(BookConfigSchema.parse(unverifiedGelatoConfig), input);
  assert.throws(() => resolveFrozenPrintRouting(order, unverifiedManifest), /verified API page count/);
  const gelatoUpsert = buildW0OrderUpsertPayload({ normalizedInput: input, manifest: gelato,
    manifestKey: `${config.bookId}/orders/${input.orderId}/manifests/1-manifest.json` });
  assert.equal(gelatoUpsert.print_provider, 'gelato');
  assert.equal(gelatoUpsert.print_config_version, 2);
  assert.equal(gelatoUpsert.print_product_uid, 'synthetic-gelato-product');
  assert.equal(gelatoUpsert.print_inner_page_count, 32);
  assert.equal(gelatoUpsert.print_api_page_count, 32);
  assert.equal(gelatoUpsert.print_expected_pdf_page_count, 35);
  assertPrintAssignmentCompatible({ print_provider: 'gelato', print_config_version: 2,
    print_product_uid: 'synthetic-gelato-product', print_inner_page_count: 32, print_api_page_count: 32,
    print_expected_pdf_page_count: 35 }, gelatoUpsert);
  assert.throws(() => assertPrintAssignmentCompatible({ print_provider: 'gelato', print_config_version: 2 },
    { ...gelatoUpsert, print_provider: 'lulu', print_config_version: 1 }), /Frozen print assignment mismatch/);
  assert.equal(resolveFrozenPrintRouting(order, lulu).provider, 'lulu');
  const resolvedGelato = resolveFrozenPrintRouting(order, gelato);
  assert.equal(resolvedGelato.provider, 'gelato');
  assert.equal(resolvedGelato.configVersion, 2);
  assert.equal(resolvedGelato.innerPageCount, 32);
  assert.equal(resolvedGelato.apiPageCount, 32);
  assert.equal(resolvedGelato.expectedPdfPageCount, 35);
  assert.deepEqual(normalizeW0Manifest(gelato).print, v2.formats.standard.print);
  assert.equal(normalizeW0Manifest(gelato).configVersion, 2);
  assert.equal(normalizeW0Manifest(gelato).productUid, 'synthetic-gelato-product');
  const printOrderId = 'TEST-GELATO-PRINT-INPUT';
  const printOrderPrefix = buildOrderPrefix(printOrderId, config.bookId);
  const printOneKey = buildManifestKeyFromOrderPrefix(printOrderPrefix, '1');
  const printThreeKey = buildManifestKeyFromOrderPrefix(printOrderPrefix, '3');
  const printOne = buildW0RunManifestFromConfig(v2, { ...input, orderId: printOrderId });
  const printThree = {
    schema: 'lhb.run-manifest@v2.0', stage: '3-book-assembly', orderId: printOrderId,
    rootOrderId: printOrderId, bookId: config.bookId, formatId: 'standard',
    orderR2BaseKey: printOrderPrefix,
    pagePlan: printOne.book.resolved.pagePlan, pageLabels: printOne.book.resolved.pageLabels, summary: { readyForBook: true },
    pages: Object.fromEntries(v2.formats.standard.interior.pageSequence.map((page) =>
      [page.label, buildPreviewImageAssetKey(printOrderPrefix, page.label)])),
    pngGeneration: { coverSpreadImage: `${printOrderPrefix}/preview-images/cover-spread.png` },
  };
  const gelatoPrintInput = await buildW4PrintInput({
    orderId: printOrderId, bookId: config.bookId, formatId: 'standard', manifest3Key: printThreeKey,
  }, {
    expectedProvider: 'gelato',
    loadManifest: async (key) => key === printOneKey ? printOne : key === printThreeKey ? printThree : null,
    loadOrder: async (id) => id === printOrderId ? {
      orderId: printOrderId, print_provider: 'gelato', print_config_version: 2,
      print_product_uid: 'synthetic-gelato-product', print_inner_page_count: 32,
      print_api_page_count: 32, print_expected_pdf_page_count: 35,
    } : null,
  });
  assert.equal(assertW4GelatoPrintInput(gelatoPrintInput).providerPrintConfig.productUid, 'synthetic-gelato-product');
  const canonicalRow = { id: 1, orderId: printOrderId, print_provider: 'gelato', print_config_version: 2,
    print_product_uid: 'synthetic-gelato-product', print_inner_page_count: 32, print_api_page_count: 32, print_expected_pdf_page_count: 35 };
  const sourceInput = { orderId: printOrderId, bookId: config.bookId, formatId: 'standard', manifest3Key: printThreeKey };
  const testSources = (one: unknown, three: unknown) => buildW4PrintInput(sourceInput, {
    expectedProvider: 'gelato', loadManifest: async (key) => key === printOneKey ? one : key === printThreeKey ? three : null,
    loadOrder: async () => canonicalRow,
  });
  await assert.rejects(testSources(printOne, { ...printThree, summary: { readyForBook: false } }), /original W3 source/);
  await assert.rejects(buildW4PrintInput({ ...sourceInput, body: { ...sourceInput, summary: { readyForBook: true }, pages: printThree.pages } }, {
    expectedProvider: 'gelato', loadOrder: async () => canonicalRow,
    loadManifest: async (key) => key === printOneKey ? printOne : key === printThreeKey ? { ...printThree, summary: { readyForBook: false } } : null,
  }), /original W3 source/);
  const oldCover = await testSources(printOne, { ...printThree, pngGeneration: { coverSpreadImage: `${printOrderPrefix}/preview-images/older-cover-spread.png` } });
  assert.throws(() => assertW4GelatoPrintInput(oldCover), /canonical cover raster/);
  const activeFixture = BookConfigSchema.parse({ ...v2, status: 'active' });
  const activeOne = buildW0RunManifestFromConfig(activeFixture, { ...input, orderId: printOrderId, input: {} });
  const producedThree = buildW3Manifest({ orderId: printOrderId, bookId: config.bookId, formatId: 'standard',
    orderR2BaseKey: printOrderPrefix, coverPngR2Key: `${printOrderPrefix}/preview-images/cover-spread.png`,
    renderSnapshot: activeOne.book.resolved.renderSnapshot,
    pagePreviewImages: printOne.book.resolved.pageLabels.map((pageLabel, pageNumber) => ({ pageLabel, pageNumber,
      r2Key: buildPreviewImageAssetKey(printOrderPrefix, pageLabel), imageUrl: `https://admin.example.test/api/assets/${buildPreviewImageAssetKey(printOrderPrefix, pageLabel)}` })),
  }, { intake: normalizeW0Manifest(activeOne) });
  assert.equal(assertW4GelatoPrintInput(await testSources(activeOne, producedThree.manifest)).pagePlan.length, 32);
  const incompleteProduced = buildW3Manifest({ orderId: printOrderId, bookId: config.bookId, formatId: 'standard',
    orderR2BaseKey: printOrderPrefix, renderSnapshot: activeOne.book.resolved.renderSnapshot,
    pagePreviewImages: producedThree.pagePreviewImages.slice(0, -1),
  }, { intake: normalizeW0Manifest(activeOne) });
  await assert.rejects(testSources(activeOne, incompleteProduced.manifest), /original W3 source/);
  const otherOne = buildW0RunManifestFromConfig(v2, { ...input, orderId: 'OTHER-SOURCE-ORDER' });
  await assert.rejects(testSources(otherOne, printThree), /canonical order\/book identity/);
  await assert.rejects(testSources(printOne, { ...printThree, orderId: 'OTHER-SOURCE-ORDER' }), /canonical order\/book identity/);
  const changedPages = { ...printThree.pages };
  delete changedPages.p31;
  changedPages.p99 = buildPreviewImageAssetKey(printOrderPrefix, 'p99');
  await assert.rejects(testSources(printOne, { ...printThree, pages: changedPages }), /missing a preview image/);
  await assert.rejects(testSources(printOne, { ...printThree, pageLabels: [...printOne.book.resolved.pageLabels].reverse() }), /frozen W0 sequence/);
  const wrongRaster = await testSources(printOne, { ...printThree, pages: { ...printThree.pages, p31: buildPreviewImageAssetKey(printOrderPrefix, 'p99') } });
  assert.throws(() => assertW4GelatoPrintInput(wrongRaster), /canonical page rasters/);
  await assert.rejects(buildW4PrintInput({
    orderId: printOrderId, bookId: config.bookId, formatId: 'standard', manifest3Key: printThreeKey,
  }, {
    expectedProvider: 'gelato',
    loadManifest: async (key) => key === printOneKey ? printOne : key === printThreeKey ? printThree : null,
    loadOrder: async () => ({
      orderId: printOrderId, print_provider: 'gelato', print_config_version: 2,
      print_product_uid: 'different-product', print_inner_page_count: 32,
      print_api_page_count: 32, print_expected_pdf_page_count: 35,
    }),
  }), /frozen assignment mismatch: print_product_uid/);
  await assert.rejects(buildW4PrintInput({
    orderId: printOrderId, bookId: config.bookId, formatId: 'standard', manifest3Key: printThreeKey,
  }, {
    expectedProvider: 'gelato',
    loadManifest: async (key) => key === printOneKey ? buildW0RunManifestFromConfig(config, { ...input, orderId: printOrderId }) : key === printThreeKey ? printThree : null,
    loadOrder: async () => ({ orderId: printOrderId, print_provider: 'lulu' }),
  }), /non-Gelato provider assignment/);
  await assert.rejects(buildW0RunManifestRuntime({ ...input, bookId: config.bookId, configSource: 'published' }), /explicit positive configVersion/);
  assert.throws(() => resolveFrozenPrintRouting({ ...order, print_provider: 'lulu' }, gelato));
  for (const [field, value] of Object.entries({ print_config_version: 1, print_product_uid: 'different',
    print_inner_page_count: 30, print_api_page_count: 30, print_expected_pdf_page_count: 33 })) {
    assert.throws(() => resolveFrozenPrintRouting({ ...order, [field]: value }, gelato));
  }
  const missingV1 = mutableRoutingManifest(structuredClone(lulu));
  delete missingV1.book.resolved.print.provider;
  assert.equal(resolveFrozenPrintRouting(order, missingV1).provider, 'lulu');
  assert.equal(normalizeW0Manifest(missingV1).provider, 'lulu');
  assert.equal(missingV1.book.resolved.print.provider, undefined);
  const missingV2 = mutableRoutingManifest(structuredClone(gelato));
  delete missingV2.book.resolved.print.provider;
  assert.throws(() => resolveFrozenPrintRouting(order, missingV2));
  const unknown = mutableRoutingManifest(structuredClone(gelato));
  unknown.book.resolved.print.provider = 'unknown';
  assert.throws(() => resolveFrozenPrintRouting(order, unknown));
  const wrongId = structuredClone(gelato);
  wrongId.order.orderDbId = 2;
  assert.throws(() => resolveFrozenPrintRouting(order, wrongId));
  const amazonRoot = structuredClone(lulu);
  amazonRoot.order.rootOrderId = 'TEST-AMAZON-ROOT';
  assert.equal(resolveFrozenPrintRouting({ ...order, root_order_id: null, amazon_order_id: 'TEST-AMAZON-ROOT' }, amazonRoot).rootOrderId, 'TEST-AMAZON-ROOT');
  assert.throws(() => canonicalW0RoutingKey({ ...order, one_manifest_url: 'https://untrusted.invalid/manifest.json' }));
  const wrongCount = mutableRoutingManifest(structuredClone(gelato));
  wrongCount.book.resolved.print.innerPageCount = 30;
  assert.throws(() => resolveFrozenPrintRouting(order, wrongCount));
  const legacy = JSON.parse(readFileSync('src/lib/books/fixtures/w0-manifests/book1-amazon-legacy-v2_1.json', 'utf8'));
  const legacyOrder = { ...order, root_order_id: legacy.amazonOrderId, amazon_order_id: legacy.amazonOrderId };
  assert.throws(() => resolveFrozenPrintRouting(legacyOrder, legacy));
  assert.equal(resolveFrozenPrintRouting({ ...legacyOrder, print_provider: 'lulu' }, legacy).provider, 'lulu');
  assert.throws(() => resolveFrozenPrintRouting({ ...legacyOrder, print_provider: 'lulu' }, { ...legacy, schema: 'unknown' }));

  const child1 = { ...order, root_order_id: 'TEST-GROUP' };
  const child2 = { ...order, id: 2, orderId: 'TEST-GELATO-2', root_order_id: 'TEST-GROUP',
    one_manifest_url: `${config.bookId}/orders/TEST-GELATO-2/manifests/1-manifest.json` };
  const manifests = new Map([child1, child2].map((child) => [child.one_manifest_url,
    buildW0RunManifestFromConfig(v2, { ...input, orderId: child.orderId, rootOrderId: child.root_order_id })]));
  const load = async (key: string) => { assert.ok(manifests.has(key)); return manifests.get(key); };
  assert.equal((await resolvePrintRoutingGroup([child1, child2], load)).length, 2);
  assert.throws(() => assertCompletePrintRoutingMembership([child1.id], [{ id: child1.id, orderId: 'TEST-GROUP' }, { id: child2.id, orderId: child2.orderId }]), /complete sibling group/);
  assert.doesNotThrow(() => assertCompletePrintRoutingMembership([child1.id, child2.id], [{ id: child1.id, orderId: child1.orderId }, { id: child2.id, orderId: child2.orderId }]));
  const rootOrder: PrintRoutingOrder = { ...order, id: 9, orderId: 'TEST-GROUP', root_order_id: null,
    one_manifest_url: `${config.bookId}/orders/TEST-GROUP/manifests/1-manifest.json` };
  const rootManifest = buildW0RunManifestFromConfig(v2, { ...input, orderId: rootOrder.orderId, rootOrderId: rootOrder.orderId });
  await assert.rejects(resolvePrintRoutingRequest([rootOrder.id], async () => [rootOrder], async () => [
    { id: rootOrder.id, orderId: rootOrder.orderId }, { id: child2.id, orderId: child2.orderId },
  ], async (key) => { assert.equal(key, rootOrder.one_manifest_url); return rootManifest; }), /complete sibling group/);
  const soloOrder = { ...rootOrder, id: 12, orderId: 'TEST-SOLO', one_manifest_url: `${config.bookId}/orders/TEST-SOLO/manifests/1-manifest.json` };
  const soloManifest = buildW0RunManifestFromConfig(config, { ...input, orderId: soloOrder.orderId, rootOrderId: soloOrder.orderId });
  let selfRootLookup = false;
  const soloMembers = await loadPrintRoutingGroupMembers(soloOrder.orderId, {
    byRootOrderId: async () => [],
    byAmazonOrderId: async () => [],
    selfRoot: async (rootId) => { selfRootLookup = rootId === soloOrder.orderId; return [{ id: soloOrder.id, orderId: soloOrder.orderId }]; },
  });
  assert.equal(selfRootLookup, true);
  assert.equal((await resolvePrintRoutingRequest([soloOrder.id], async () => [soloOrder], async () => soloMembers,
    async () => soloManifest)).length, 1);
  await assert.rejects(resolvePrintRoutingGroup([child1, child1], load));
  await assert.rejects(resolvePrintRoutingGroup([child1, { ...child2, shipping_address: { ...order.shipping_address as object, city: 'Elsewhere' } }], load));
  const street = { name: 'Test', street1: '123 Test St', street2: 'Unit 1', city: 'Test', state: 'CA', zip: '90001', country: 'US' };
  assert.equal((await resolvePrintRoutingGroup([{ ...child1, shipping_address: street }, { ...child2, shipping_address: street }], load)).length, 2);
  await assert.rejects(resolvePrintRoutingGroup([{ ...child1, shipping_address: street }, { ...child2, shipping_address: { ...street, street2: 'Unit 2' } }], load));
  manifests.set(child2.one_manifest_url, buildW0RunManifestFromConfig(config, { ...input, orderId: child2.orderId, rootOrderId: child2.root_order_id }));
  await assert.rejects(resolvePrintRoutingGroup([child1, child2], load));
  const mvp = loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure', version: 1 });
  const differentCounts = [child1, child2].map((child, index) => ({ ...child, one_manifest_url: `${mvp.bookId}/orders/${child.orderId}/manifests/1-manifest.json`, formatId: index ? 'amazon' : 'standard' }));
  const countManifests = new Map(differentCounts.map((child) => [child.one_manifest_url,
    buildW0RunManifestFromConfig(mvp, { ...input, orderId: child.orderId, rootOrderId: child.root_order_id, formatId: child.formatId })]));
  await assert.rejects(resolvePrintRoutingGroup(differentCounts, async (key) => countManifests.get(key)), /innerPageCount/);
  let signed = false;
  await assert.rejects(buildW4SubmitInput({ orderId: order.orderId, provider: 'lulu', pdfR2Key: 'synthetic/interior.pdf', coverPdfR2Key: 'synthetic/cover.pdf' }, {
    loadOrder: async () => ({ orderId: order.orderId, print_provider: 'gelato' }), signObjectUrl: async () => { signed = true; return 'synthetic'; },
  }), /non-Lulu/);
  assert.equal(signed, false);
  await assert.rejects(buildW4SubmitInput({ orderId: order.orderId, pdfR2Key: 'synthetic/interior.pdf', coverPdfR2Key: 'synthetic/cover.pdf' }, {
    loadOrder: async () => { throw new Error('database unavailable'); }, signObjectUrl: async () => { signed = true; return 'synthetic'; },
  }), /database unavailable/);
  await assert.rejects(buildW4SubmitInput({ orderId: order.orderId, pdfR2Key: 'synthetic/interior.pdf', coverPdfR2Key: 'synthetic/cover.pdf' }, {
    loadOrder: async () => ({ orderId: 'OTHER-ROOT', print_provider: 'lulu' }), signObjectUrl: async () => { signed = true; return 'synthetic'; },
  }), /order identity mismatch/);
  await assert.rejects(buildW4SubmitInput({ orderId: order.orderId, pdfR2Key: 'synthetic/interior.pdf', coverPdfR2Key: 'synthetic/cover.pdf' }, {
    loadOrder: async () => ({ orderId: order.orderId }), signObjectUrl: async () => { signed = true; return 'synthetic'; },
  }), /verified Lulu provider assignment/);
  assert.equal(signed, false);
  await assert.rejects(buildW4SiblingSubmitInput({ siblings: [child1, child2], rootGroupId: 'TEST-GROUP', rootOrderId: 'TEST-GROUP' }, {
    loadOrder: async (id) => ({ orderId: id, print_provider: 'gelato' }), signObjectUrl: async () => { signed = true; return 'synthetic'; },
  }), /non-Lulu/);
  assert.equal(signed, false);

  const selected = { bookId: config.bookId, formatId: 'standard', configVersion: 2, configSource: 'published' };
  assert.throws(() => parseW0ManifestRequest({ payload: input }));
  assert.throws(() => parseW0ManifestRequest({ ...selected, configVersion: '2', payload: input }));
  assert.throws(() => parseW0ManifestRequest({ ...selected, configVersion: 0, payload: input }));
  assert.throws(() => parseW0ManifestRequest({ ...selected, payload: { ...input, configVersion: 1 } }));
  assert.throws(() => parseW0ManifestRequest({ ...selected, configSource: 'published-first', payload: input }));
  assert.equal(parseW0ManifestRequest({ ...selected, payload: input }).options.configVersion, 2);
  const row = buildBookConfigPublishPayload(v2, { activate: false });
  assert.equal(parsePublishedBookConfigRow(row).config.version, 2);
  for (const bad of [{ ...row, checksum: '' }, { ...row, version: '2garbage' }, { ...row, book_id: null }]) {
    assert.throws(() => parsePublishedBookConfigRow(bad));
  }

  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'http://127.0.0.1:9999';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  const rows = [buildBookConfigPublishPayload(config), row,
    buildBookConfigPublishPayload(loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure', version: 1 }))];
  globalThis.fetch = async (request) => {
    const url = new URL(String(request));
    assert.equal(url.origin, 'http://127.0.0.1:9999');
    assert.equal(url.pathname, '/rest/v1/book_configs');
    const matches = rows.filter((candidate) =>
      (!url.searchParams.has('version') || url.searchParams.get('version') === `eq.${candidate.version}`) &&
      url.searchParams.get('book_id') === `eq.${candidate.book_id}` &&
      (!url.searchParams.has('is_active') || candidate.is_active));
    return new Response(JSON.stringify(matches), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    assert.equal((await loadRuntimeBookConfig({ bookId: config.bookId, source: 'published' })).version, 1);
    for (const version of [1, 2]) {
      const manifest = await buildW0RunManifestRuntime({ ...input, bookId: config.bookId, configVersion: version, configSource: 'published' });
      assert.equal(manifest.book.bookConfigRef.version, version);
      assert.equal(resolveFrozenPrintRouting(order, manifest).provider, version === 1 ? 'lulu' : 'gelato');
    }
    const workflow = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json', 'utf8'));
    const node = workflow.nodes.find((candidate: { name: string; parameters: { jsCode: string } }) => candidate.name === 'Prepare Build 1 Manifest Body');
    const callerInput = { orderId: 'TEST-PINNED-W0', characterSpecs: {}, bookSpecs: {}, orderDetails: {} };
    const emitted = new Function('$json', node.parameters.jsCode)(callerInput)[0].json.requestBody;
    const parsed = parseW0ManifestRequest(JSON.parse(emitted));
    const built = await buildOrderIntakeManifestFromNormalizedInputRuntime(parsed.input, parsed.options);
    const builtManifest = built.manifest as { book: { bookConfigRef: { version: number }; resolved: { print: { provider: string } } } };
    assert.equal(builtManifest.book.bookConfigRef.version, 1);
    assert.equal(builtManifest.book.resolved.print.provider, 'lulu');
    const newBookEmitted = new Function('$json', node.parameters.jsCode)({
      ...callerInput, bookSpecs: { bookId: 'book-finding-our-inner-voice', configVersion: 2 },
    })[0].json.requestBody;
    const newBookParsed = parseW0ManifestRequest(JSON.parse(newBookEmitted));
    assert.equal(newBookParsed.options.bookId, 'book-finding-our-inner-voice');
    assert.equal(newBookParsed.options.configVersion, 2);
    const normalize = workflow.nodes.find((candidate: { name: string }) => candidate.name === 'Normalize Payload');
    const dedication = workflow.nodes.find((candidate: { name: string }) => candidate.name === 'Extract & Validate Dedication');
    assert.ok(normalize && dedication);
    for (const selection of [
      { bookId: config.bookId, configVersion: 2, formatId: 'amazon' },
      { bookSpecs: { bookId: config.bookId, configVersion: 2, formatId: 'amazon' } },
    ]) {
      let current = { ...callerInput, ...selection, bookSpecs: { testMode: true, ...('bookSpecs' in selection ? selection.bookSpecs : {}) } };
      for (const producer of [normalize, dedication]) {
        current = new Function('$input', '$item', '$json', producer.parameters.jsCode)(
          { first: () => ({ json: current }) }, () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }), current,
        )[0].json;
      }
      const emittedBody = new Function('$json', node.parameters.jsCode)(current)[0].json.requestBody;
      const completeRequest = parseW0ManifestRequest(JSON.parse(emittedBody));
      assert.equal(completeRequest.options.bookId, config.bookId);
      assert.equal(completeRequest.options.configVersion, 2);
      assert.equal(completeRequest.options.formatId, 'amazon');
      const completeBuilt = await buildOrderIntakeManifestFromNormalizedInputRuntime(completeRequest.input, completeRequest.options);
      const ref = (completeBuilt.manifest as { book: { bookConfigRef: { version: number; formatId: string } } }).book.bookConfigRef;
      assert.equal(ref.version, 2);
      assert.equal(ref.formatId, 'amazon');
    }
    assert.throws(() => new Function('$json', node.parameters.jsCode)({
      ...callerInput, bookId: config.bookId, bookSpecs: { bookId: 'book-mvp-simple-adventure' },
    }), /Conflicting W0 selection/);
    assert.throws(() => parseW0ManifestRequest({ ...selected, payload: { ...input, bookSpecs: { configVersion: 1 } } }), /Conflicting W0 selection/);
    rows[1].is_active = true;
    assert.equal((await loadRuntimeBookConfig({ bookId: config.bookId, version: 1, source: 'published' })).version, 1);
  } finally { globalThis.fetch = originalFetch; }
  console.log('test-gelato-print-routing: ok');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
