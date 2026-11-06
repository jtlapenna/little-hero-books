import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildD2CW0Payload, buildPendingW0Payload } from '../src/lib/w0-payload';
import { buildW0Payload } from '../src/lib/sibling-order-helpers';
import type { CsvBookSelection } from '../src/lib/csv-book-selection';
import { parseW0ManifestRequest } from '../src/lib/w0-manifest-request';
import { buildOrderIntakeManifestFromNormalizedInputRuntime, buildOrderIntakeManifestFromOrderRuntime, buildOrderIntakeManifestFromOrder, buildW0OrderUpsertPayload } from '../src/lib/w0-manifest-builder';
import { buildBookConfigPublishPayload } from '../src/lib/books/runtime-book-config';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';

type JsonRecord = Record<string, unknown>;
const graph = JSON.parse(readFileSync(path.resolve('../docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json'), 'utf8')) as { nodes: Array<{ name: string; parameters?: { jsCode?: string } }> };
function runCode(name: string, context: JsonRecord): JsonRecord {
  const source = graph.nodes.find(node => node.name === name)?.parameters?.jsCode;
  assert.equal(typeof source, 'string', `Missing actual W0 node: ${name}`);
  return vm.runInNewContext(`(() => { ${source}\n })()`, context, { timeout: 1000 })[0].json;
}
async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://w0-character-config.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-config-only' });
  const originalFetch = globalThis.fetch;
  const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
  const published = buildBookConfigPublishPayload(config, { activate: true });
  let configReads = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    assert.equal(url.origin, 'https://w0-character-config.example.test', 'Every other host is forbidden');
    assert.equal(request.method, 'GET', 'Hash handoff must not write');
    assert.equal(url.pathname, '/rest/v1/book_configs');
    assert.equal(url.searchParams.get('book_id'), `eq.${config.bookId}`);
    assert.equal(url.searchParams.get('version'), 'eq.2');
    configReads++;
    return Response.json([published]);
  };
  const specs = { childName: 'Alex', animalGuide: 'cat', skinTone: 'medium', hairStyle: 'short', hairColor: 'brown', clothingStyle: 'tee-shorts' };
  const cases: Array<{ name: string; raw?: JsonRecord; normalized?: JsonRecord; expected?: string }> = [
    { name: 'canonical-producer', raw: { characterHash: 'producer-hash', character_hash: 'producer-hash' }, expected: 'producer-hash' },
    { name: 'normalized-camel', normalized: { characterHash: 'camel-hash' }, expected: 'camel-hash' },
    { name: 'normalized-snake', normalized: { character_hash: 'snake-hash' }, expected: 'snake-hash' },
    { name: 'raw-camel', raw: { characterHash: 'raw-camel-hash' }, expected: 'raw-camel-hash' },
    { name: 'raw-snake', raw: { character_hash: 'raw-snake-hash' }, expected: 'raw-snake-hash' },
    { name: 'conflicting-precedence', raw: { characterHash: 'raw-camel-hash', character_hash: 'raw-snake-hash' }, normalized: { characterHash: 'first-hash', character_hash: 'second-hash' }, expected: 'first-hash' },
    { name: 'raw-conflicting-precedence', raw: { characterHash: 'first-raw-hash', character_hash: 'second-raw-hash' }, expected: 'first-raw-hash' },
    { name: 'blank-explicit', raw: { characterHash: ' ', character_hash: '' }, normalized: { characterHash: '', character_hash: '  ' } },
    { name: 'missing-hash' },
  ];
  let checks = 0;
  try {
    for (const formatId of ['standard', 'amazon']) {
      let fallbackHash: string | null = null;
      for (const scenario of cases) {
        const orderId = `SYNTHETIC-W0-HASH-${formatId}-${scenario.name}`;
        const raw = buildD2CW0Payload({ orderId, character_specs: specs, product_info: { bookId: config.bookId, formatId, configVersion: 2, totalPages: 32 } });
        delete raw.characterHash; delete raw.character_hash; Object.assign(raw, scenario.raw);
        raw.bookSpecs = { ...raw.bookSpecs as JsonRecord, testMode: true }; raw.book_specs = raw.bookSpecs;
        const normalized = runCode('Normalize Payload', { $input: { first: () => ({ json: raw }) }, $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }) });
        // Exercise supported alias placements after the actual producer normalizer.
        Object.assign(normalized, scenario.normalized);
        const prepared = runCode('Prepare Build 1 Manifest Body', { $json: normalized });
        const parsed = parseW0ManifestRequest(JSON.parse(String(prepared.requestBody)));
        const built = await buildOrderIntakeManifestFromNormalizedInputRuntime(parsed.input, parsed.options);
        const prefix = (built.manifest as { artifacts: { characterPrefix?: string } }).artifacts.characterPrefix;
        const upsert = buildW0OrderUpsertPayload({ normalizedInput: parsed.input, manifest: built.manifest, manifestKey: built.manifestKey });
        assert.equal(typeof prefix, 'string', `${formatId}/${scenario.name}: actual normalized producer must freeze the character hash`);
        const frozenHash = prefix?.split('/').filter(Boolean).at(-1);
        assert.equal(frozenHash, upsert.character_hash, `${formatId}/${scenario.name}: persisted and frozen hash must match before W1`);
        if (scenario.expected) assert.equal(frozenHash, scenario.expected, 'Existing alias precedence must remain');
        else { assert.match(String(frozenHash), /^[a-f0-9]{16}$/, 'Blank and missing values use the existing visual hash'); if (fallbackHash) assert.equal(frozenHash, fallbackHash); fallbackHash = String(frozenHash); }
        checks++;
      }
      const row = { orderId: `SYNTHETIC-DIRECT-W0-HASH-${formatId}`, character_specs: specs, book_specs: { testMode: true }, product_info: { bookId: config.bookId, formatId } };
      const direct = await buildOrderIntakeManifestFromOrderRuntime(row, row.orderId, { schemaVersion: 'v3', bookId: config.bookId, formatId, configVersion: 2, configSource: 'published' });
      const prefix = (direct.manifest as { artifacts: { characterPrefix?: string } }).artifacts.characterPrefix;
      assert.equal(prefix?.split('/').at(-1), fallbackHash, 'Direct rows use the same visual fallback');
      assert.equal(buildW0OrderUpsertPayload({ normalizedInput: { characterSpecs: specs }, manifest: direct.manifest, manifestKey: direct.manifestKey }).character_hash, fallbackHash);
      checks++;
    }
    const recovery = JSON.parse(readFileSync(path.resolve('scripts/fixtures/inner-voice-w0-recovery.json'), 'utf8')) as { cases: Array<{ caseId: string; rowIndex: number; row: JsonRecord }> };
    let recoveryChecks = 0, directChecks = 0;
    const assertUnitContext = (row: JsonRecord, manifest: JsonRecord, upsert: JsonRecord, label: string) => {
      const info = row.product_info as JsonRecord, context = (manifest.input as JsonRecord).orderDetails as JsonRecord;
      const expected = { line_item: info.line_item, line_items: info.line_items,
        _quantity_unit_index: info._quantity_unit_index, _quantity_unit_count: info._quantity_unit_count,
        _order_item_id: (info.line_item as JsonRecord).order_item_id ?? null, _customized_url_hash: info._customized_url_hash };
      console.log(JSON.stringify({ kind: 'w0-unit-context', label, producer: row, manifestContext: context, upsert }));
      for (const [key, value] of Object.entries(expected)) { assert.deepEqual(context[key], value, label + '/' + key); assert.deepEqual((upsert.product_info as JsonRecord)[key], value, label + '/persisted/' + key); }
      assert.equal(context.quantity, 1); assert.equal((upsert.product_info as JsonRecord).quantity, 1);
    };
    for (const fixture of recovery.cases) {
      const row = fixture.row, expectedRow = structuredClone(fixture.row);
      console.log(JSON.stringify({ kind: 'w0-unit-producer', label: fixture.caseId, producer: expectedRow }));
      const raw = buildPendingW0Payload(row);
      console.log(JSON.stringify({ kind: 'w0-unit-payload', label: fixture.caseId, raw }));
      assert.equal(raw.orderId, row.orderId); assert.equal(raw.amazonOrderId, row.root_order_id);
      assert.equal(raw.rootOrderId, row.root_order_id); assert.equal(raw.marketplaceId, row.marketplace_id);
      assert.deepEqual(raw.bookSpecs, row.book_specs); assert.equal(raw.characterHash, row.character_hash);
      if (recoveryChecks === 0) {
        const draftNormalized = runCode('Normalize Payload', { $input: { first: () => ({ json: raw }) }, $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }) });
        const draftPrepared = runCode('Prepare Build 1 Manifest Body', { $json: draftNormalized });
        const draftParsed = parseW0ManifestRequest(JSON.parse(String(draftPrepared.requestBody)));
        await assert.rejects(buildOrderIntakeManifestFromNormalizedInputRuntime(draftParsed.input, draftParsed.options), /Draft configured book intake requires bookSpecs.testMode:true/);
      }
      // Explicit synthetic variant; the frozen stored row stays unchanged.
      raw.bookSpecs = { ...raw.bookSpecs as JsonRecord, testMode: true }; raw.book_specs = raw.bookSpecs;
      const normalized = runCode('Normalize Payload', { $input: { first: () => ({ json: raw }) }, $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }) });
      console.log(JSON.stringify({ kind: 'w0-unit-normalized', label: fixture.caseId, normalized }));
      const withDedication = runCode('Extract & Validate Dedication', { $input: { first: () => ({ json: normalized }) } });
      const prepared = runCode('Prepare Build 1 Manifest Body', { $json: withDedication });
      console.log(JSON.stringify({ kind: 'w0-unit-prepared', label: fixture.caseId, prepared }));
      const parsed = parseW0ManifestRequest(JSON.parse(String(prepared.requestBody)));
      console.log(JSON.stringify({ kind: 'w0-unit-request', label: fixture.caseId, parsed }));
      const built = await buildOrderIntakeManifestFromNormalizedInputRuntime(parsed.input, parsed.options);
      console.log(JSON.stringify({ kind: 'w0-unit-manifest', label: fixture.caseId, built }));
      const manifest = built.manifest as unknown as { order: JsonRecord; book: { bookConfigRef: { version: number }; resolved: { expectedPageCount: number } }; artifacts: { characterPrefix: string } };
      const upsert = buildW0OrderUpsertPayload({ normalizedInput: parsed.input, manifest: built.manifest, manifestKey: built.manifestKey });
      assertUnitContext(expectedRow, built.manifest as unknown as JsonRecord, upsert, fixture.caseId + '/pending');
      assert.deepEqual(row, expectedRow, 'Pending W0 must preserve original row');
      assert.equal(manifest.order.platform, 'amazon'); assert.equal(manifest.order.amazonOrderId, row.root_order_id);
      assert.equal(manifest.order.rootOrderId, row.root_order_id); assert.equal(manifest.order.orderId, row.orderId);
      assert.equal(manifest.book.bookConfigRef.version, 2); assert.equal(manifest.book.resolved.expectedPageCount, 32);
      assert.equal(upsert.marketplace_id, row.marketplace_id); assert.equal(upsert.root_order_id, row.root_order_id);
      assert.equal(upsert.character_hash, row.character_hash); assert.equal(manifest.artifacts.characterPrefix.split('/').at(-1), row.character_hash);
      for (const key of ['bookId', 'formatId', 'configVersion', 'title', 'totalPages', 'format', 'bookType']) assert.deepEqual((upsert.book_specs as JsonRecord)[key], (row.book_specs as JsonRecord)[key], 'Supported book metadata must survive retry');
      const info = row.product_info as JsonRecord;
      assert.deepEqual(raw.items, info.line_items); assert.equal(raw.unitIndex, info._quantity_unit_index); assert.equal(raw.unitCount, info._quantity_unit_count);
      const directPayload = buildW0Payload({ orderId: row.orderId as string, amazonOrderId: row.amazon_order_id as string,
        purchaseDate: row.purchase_date as string, marketplaceId: row.marketplace_id as string,
        customerEmail: row.customer_email as string, customerName: row.customer_name as string,
        shippingAddress: row.shipping_address as JsonRecord, characterSpecs: row.character_specs as JsonRecord,
        characterHash: row.character_hash as string, bookId: 'book-finding-our-inner-voice', formatId: 'amazon',
        selection: { ...(row.book_specs as JsonRecord) } as CsvBookSelection,
        lineItem: info.line_item as JsonRecord, lineItems: info.line_items as JsonRecord[],
        unitIndex: info._quantity_unit_index as number, unitCount: info._quantity_unit_count as number });
      directPayload.bookSpecs = { ...directPayload.bookSpecs as JsonRecord, testMode: true }; directPayload.book_specs = directPayload.bookSpecs;
      console.log(JSON.stringify({ kind: 'w0-unit-direct-payload', label: fixture.caseId, directPayload }));
      const directNormalized = runCode('Normalize Payload', { $input: { first: () => ({ json: directPayload }) }, $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }) });
      console.log(JSON.stringify({ kind: 'w0-unit-direct-normalized', label: fixture.caseId, directNormalized }));
      const directDedication = runCode('Extract & Validate Dedication', { $input: { first: () => ({ json: directNormalized }) } });
      const directPrepared = runCode('Prepare Build 1 Manifest Body', { $json: directDedication });
      console.log(JSON.stringify({ kind: 'w0-unit-direct-prepared', label: fixture.caseId, directPrepared }));
      const directParsed = parseW0ManifestRequest(JSON.parse(String(directPrepared.requestBody)));
      console.log(JSON.stringify({ kind: 'w0-unit-direct-request', label: fixture.caseId, directParsed }));
      const directBuilt = await buildOrderIntakeManifestFromNormalizedInputRuntime(directParsed.input, directParsed.options);
      console.log(JSON.stringify({ kind: 'w0-unit-direct-manifest', label: fixture.caseId, directBuilt }));
      const directUpsert = buildW0OrderUpsertPayload({ normalizedInput: directParsed.input, manifest: directBuilt.manifest, manifestKey: directBuilt.manifestKey });
      assertUnitContext(expectedRow, directBuilt.manifest as unknown as JsonRecord, directUpsert, fixture.caseId + '/direct');
      assert.deepEqual(row, expectedRow, 'Direct W0 must preserve original row');
      const missingFrozenContext = structuredClone(built.manifest) as unknown as JsonRecord;
      for (const key of ['line_item', 'line_items', '_quantity_unit_index', '_quantity_unit_count', '_order_item_id', '_customized_url_hash']) delete ((missingFrozenContext.input as JsonRecord).orderDetails as JsonRecord)[key];
      console.log(JSON.stringify({ kind: 'w0-frozen-unit-rejection', label: fixture.caseId, missingFrozenContext }));
      assert.throws(() => buildW0OrderUpsertPayload({ normalizedInput: parsed.input, manifest: missingFrozenContext, manifestKey: built.manifestKey }), /Frozen W0 unit context mismatch/);
      directChecks++; recoveryChecks++;
    }
    const legacy = { orderId: 'SYNTHETIC-D2C-UNIT', root_order_id: 'SYNTHETIC-D2C-ROOT', amazon_order_id: 'SYNTHETIC-D2C-ROOT', platform: 'd2c', purchase_date: '2026-01-02T03:04:05.000Z', character_specs: specs };
    const legacyRecovered = buildPendingW0Payload(legacy), legacyOriginal = buildD2CW0Payload(legacy);
    assert.equal(legacyRecovered.amazonOrderId, undefined); assert.equal(legacyRecovered.marketplaceId, undefined);
    assert.equal(legacyRecovered.rootOrderId, legacy.root_order_id);
    delete legacyRecovered.rootOrderId; delete legacyRecovered.root_order_id; assert.deepEqual(legacyRecovered, legacyOriginal);
    const exemplar = recovery.cases[0].row;
    for (const bad of [
      { ...exemplar, platform: 'unknown' },
      { ...exemplar, marketplace_id: null },
      { ...exemplar, amazon_order_id: 'WRONG-ROOT' },
      { ...exemplar, book_specs: [] },
      { ...exemplar, book_specs: { ...exemplar.book_specs as JsonRecord, totalPages: 16 } },
      { ...exemplar, product_info: { ...exemplar.product_info as JsonRecord, configVersion: 3 } },
    ]) assert.throws(() => buildPendingW0Payload(bad), /pending W0/);
    const missingPerBook = structuredClone(recovery.cases.find(entry => entry.caseId === 'iv-quantity')!.row);
    delete missingPerBook.orderId; delete missingPerBook.order_id;
    assert.throws(() => buildPendingW0Payload(missingPerBook), /per-book identity/);
    const missingVersion = structuredClone(exemplar);
    delete (missingVersion.product_info as JsonRecord).configVersion;
    for (const candidate of [missingVersion.book_specs, (missingVersion.product_info as JsonRecord).bookSpecs, (missingVersion.product_info as JsonRecord).book_specs]) delete (candidate as JsonRecord).configVersion;
    assert.throws(() => buildPendingW0Payload(missingVersion), /Incomplete pending W0 frozen selection/);
    const otherUnit = recovery.cases.find(entry => entry.caseId === 'iv-items')!.row;
    const badContexts: Array<{ label: string; change: (row: JsonRecord) => void }> = [
      { label: 'stale-other-unit-hash', change: row => { row.character_hash = otherUnit.character_hash; } },
      { label: 'changed-original-specs', change: row => { (row.character_specs as JsonRecord).childName = 'Changed'; } },
      { label: 'missing-original-specs', change: row => { delete row.character_specs; } },
      { label: 'empty-original-specs', change: row => { row.character_specs = {}; } },
      { label: 'malformed-original-specs', change: row => { row.character_specs = []; } },
      { label: 'missing-original-hash', change: row => { delete row.character_hash; } },
      { label: 'empty-original-hash', change: row => { row.character_hash = ''; } },
      { label: 'conflicting-version-alias', change: row => { (row.product_info as JsonRecord).config_version = 3; } },
      { label: 'padded-book-alias-without-tuple', change: row => { row.book_specs = null; row.product_info = { print_book_id: ' book-finding-our-inner-voice ' }; } },
      { label: 'null-nested-book-specs', change: row => { (row.product_info as JsonRecord).book_specs = null; } },
      { label: 'malformed-product-info', change: row => { row.product_info = []; } },
    ];
    for (const { label, change } of badContexts) {
      const row = structuredClone(exemplar); change(row); const before = structuredClone(row);
      let returned: unknown, failure: unknown;
      try { returned = buildPendingW0Payload(row); } catch (error) { failure = error; }
      console.log(JSON.stringify({ kind: 'pending-context-rejection', label, row: before, returned: returned ?? null, error: failure instanceof Error ? failure.message : String(failure) }));
      assert(failure instanceof Error, label); assert.match(failure.message, /pending W0/, label);
      assert.deepEqual(row, before, label + ' original row unchanged');
    }
    const matchingAlias = structuredClone(exemplar);
    (matchingAlias.product_info as JsonRecord).config_version = 2;
    assert.deepEqual(buildPendingW0Payload(matchingAlias), buildPendingW0Payload(exemplar));
    const nullableRootSpecs = structuredClone(exemplar); nullableRootSpecs.book_specs = null;
    assert.deepEqual(buildPendingW0Payload(nullableRootSpecs), buildPendingW0Payload(exemplar));
    assert.equal(badContexts.length, 11);
    const unitFailures: Array<{ label: string; change: (payload: JsonRecord) => void }> = [
      { label: 'conflicting-line-item', change: value => { value.lineItem = { ...(value.lineItem as JsonRecord), order_item_id: 'wrong' }; } },
      { label: 'partial-unit-partition', change: value => { delete value.unitCount; } },
      { label: 'wrong-source-quantity', change: value => { (value.lineItem as JsonRecord).source_quantity = 99; } },
      { label: 'wrong-source-item', change: value => { value.items = [{ ...(value.items as JsonRecord[])[0], order_item_id: 'wrong' }]; } },
      { label: 'wrong-physical-quantity', change: value => { (value.orderDetails as JsonRecord).quantity = 2; } },
      { label: 'conflicting-source-item-id', change: value => { value._order_item_id = 'wrong'; } },
      { label: 'conflicting-snake-unit-context', change: value => { value.order_details = { _quantity_unit_count: 99 }; } },
    ];
    for (const { label, change } of unitFailures) {
      const payload = buildPendingW0Payload(structuredClone(exemplar)); change(payload);
      payload.bookSpecs = { ...payload.bookSpecs as JsonRecord, testMode: true }; payload.book_specs = payload.bookSpecs;
      const normalized = runCode('Normalize Payload', { $input: { first: () => ({ json: payload }) }, $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }) });
      const withDedication = runCode('Extract & Validate Dedication', { $input: { first: () => ({ json: normalized }) } });
      const prepared = runCode('Prepare Build 1 Manifest Body', { $json: withDedication }); const parsed = parseW0ManifestRequest(JSON.parse(String(prepared.requestBody)));
      let failure: unknown; try { await buildOrderIntakeManifestFromNormalizedInputRuntime(parsed.input, parsed.options); } catch (error) { failure = error; }
      console.log(JSON.stringify({ kind: 'w0-unit-rejection', label, payload, error: failure instanceof Error ? failure.message : String(failure) }));
      assert(failure instanceof Error, label); assert.match(failure.message, /W0/, label);
    }
    let optionalContextChecks = 0;
    for (const mode of ['url-without-id', 'id-without-url']) {
      const row = structuredClone(exemplar), info = row.product_info as JsonRecord;
      const line = info.line_item as JsonRecord, lines = info.line_items as JsonRecord[];
      if (mode === 'url-without-id') { delete line.order_item_id; for (const item of lines) delete item.order_item_id; delete info._order_item_id; }
      else { delete line.customization_url; for (const item of lines) delete item.customization_url; delete info._customized_url_hash; }
      row.book_specs = { ...row.book_specs as JsonRecord, testMode: true }; info.bookSpecs = row.book_specs; info.book_specs = row.book_specs;
      const built = await buildOrderIntakeManifestFromOrderRuntime(row, String(row.orderId), { schemaVersion: 'v3', bookId: 'book-finding-our-inner-voice', formatId: 'amazon', configVersion: 2, configSource: 'published' });
      const context = (built.manifest as unknown as { input: { orderDetails: JsonRecord } }).input.orderDetails;
      console.log(JSON.stringify({ kind: 'w0-optional-unit-context', mode, derivedFixture: row, context }));
      assert.deepEqual(context.line_item, line); assert.deepEqual(context.line_items, lines);
      assert.equal(mode === 'url-without-id' ? context._order_item_id : context._customized_url_hash, null);
      optionalContextChecks++;
    }
    let aliasContextChecks = 0, partialContextChecks = 0;
    const aliasRow = structuredClone(recovery.cases.find(entry => entry.caseId === 'iv-quantity' && (entry.row.product_info as JsonRecord)._quantity_unit_index === 2)!.row);
    const aliasInfo = aliasRow.product_info as JsonRecord;
    const aliasContext = Object.fromEntries(['line_item', 'line_items', '_quantity_unit_index', '_quantity_unit_count', '_order_item_id', '_customized_url_hash'].map(key => [key, aliasInfo[key]]));
    for (const mode of ['normalized-snake', 'raw-snake']) {
      const payload = buildPendingW0Payload(structuredClone(aliasRow));
      for (const key of ['items', 'lineItem', 'line_item', 'unitIndex', 'unitCount']) delete payload[key];
      if (mode === 'raw-snake') payload.order_details = aliasContext;
      payload.bookSpecs = { ...payload.bookSpecs as JsonRecord, testMode: true }; payload.book_specs = payload.bookSpecs;
      const normalized = runCode('Normalize Payload', { $input: { first: () => ({ json: payload }) }, $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }) });
      const withDedication = runCode('Extract & Validate Dedication', { $input: { first: () => ({ json: normalized }) } });
      const prepared = runCode('Prepare Build 1 Manifest Body', { $json: withDedication }); const parsed = parseW0ManifestRequest(JSON.parse(String(prepared.requestBody)));
      if (mode === 'normalized-snake') {
        parsed.input.order_details = { ...parsed.input.orderDetails, ...aliasContext }; delete parsed.input.orderDetails; delete parsed.input.items;
      }
      console.log(JSON.stringify({ kind: 'w0-unit-alias-request', mode, source: aliasRow, parsed }));
      const built = await buildOrderIntakeManifestFromNormalizedInputRuntime(parsed.input, parsed.options);
      const upsert = buildW0OrderUpsertPayload({ normalizedInput: parsed.input, manifest: built.manifest, manifestKey: built.manifestKey });
      assertUnitContext(aliasRow, built.manifest as unknown as JsonRecord, upsert, mode);
      const missing = structuredClone(built.manifest) as unknown as JsonRecord;
      for (const key of Object.keys(aliasContext)) delete ((missing.input as JsonRecord).orderDetails as JsonRecord)[key];
      assert.throws(() => buildW0OrderUpsertPayload({ normalizedInput: parsed.input, manifest: missing, manifestKey: built.manifestKey }), /Frozen W0 unit context mismatch/);
      aliasContextChecks++;
    }
    for (const [label, context] of [['marker-only', { _order_item_id: 'line-a' }], ['malformed-aggregate-only', { line_items: { bad: true } }]] as Array<[string, JsonRecord]>) {
      const row = structuredClone(exemplar); row.book_specs = { ...row.book_specs as JsonRecord, testMode: true };
      row.product_info = { bookSpecs: row.book_specs, ...context }; let failure: unknown;
      try { await buildOrderIntakeManifestFromOrderRuntime(row, String(row.orderId), { schemaVersion: 'v3', bookId: 'book-finding-our-inner-voice', formatId: 'amazon', configVersion: 2, configSource: 'published' }); } catch (error) { failure = error; }
      console.log(JSON.stringify({ kind: 'w0-partial-unit-rejection', label, row, error: failure instanceof Error ? failure.message : String(failure) }));
      assert(failure instanceof Error, label); assert.match(failure.message, /W0/, label); partialContextChecks++;
    }
    const websiteSpecs = { ...exemplar.book_specs as JsonRecord, formatId: 'standard', format: 'standard', channel: 'd2c', testMode: true };
    const website = { orderId: 'SYNTHETIC-NULLABLE-WEBSITE-CONTEXT', platform: 'd2c', character_specs: specs,
      book_specs: websiteSpecs, product_info: { bookSpecs: websiteSpecs, line_items: [], _order_item_id: null, _customized_url_hash: '' } };
    console.log(JSON.stringify({ kind: 'w0-website-context-input', website }));
    const websiteBuilt = await buildOrderIntakeManifestFromOrderRuntime(website, website.orderId, { schemaVersion: 'v3', bookId: 'book-finding-our-inner-voice', formatId: 'standard', configVersion: 2, configSource: 'published' });
    const websiteContext = (websiteBuilt.manifest as unknown as { input: { orderDetails: JsonRecord } }).input.orderDetails;
    console.log(JSON.stringify({ kind: 'w0-website-context-result', websiteContext }));
    assert.equal(Object.hasOwn(websiteContext, 'line_item'), false); assert.equal(Object.hasOwn(websiteContext, '_quantity_unit_index'), false);
    const legacySource = { orderId: 'LEGACY-UNIT-CONTROL', platform: 'amazon', character_specs: specs,
      product_info: { quantity: 1, shippingAddress: {}, line_item: (exemplar.product_info as JsonRecord).line_item,
        line_items: (exemplar.product_info as JsonRecord).line_items, _quantity_unit_index: 1, _quantity_unit_count: 1,
        bookSpecs: { bookId: 'book-mvp-simple-adventure', formatId: 'amazon' } } };
    const legacyManifest = buildOrderIntakeManifestFromOrder(legacySource, legacySource.orderId, { schemaVersion: 'v2.1', bookId: 'book-mvp-simple-adventure', formatId: 'amazon' });
    assert.deepEqual(((legacyManifest.manifest as JsonRecord).order as JsonRecord).orderDetails, { quantity: 1, shippingAddress: {} });
    assert.equal(unitFailures.length, 7); assert.equal(directChecks, 5); assert.equal(optionalContextChecks, 2); assert.equal(aliasContextChecks, 2); assert.equal(partialContextChecks, 2);
    assert.equal(recoveryChecks, 5);
    assert.equal(checks, 20); assert.equal(configReads, checks + recoveryChecks + directChecks + optionalContextChecks + aliasContextChecks + 2);
    console.log(`Actual W0 producer -> published-config manifest -> persisted hash: ${checks} standard/Amazon checks passed; read-only synthetic transport; ${recoveryChecks} stored-row recovery checks; ${badContexts.length} stored-context rejection checks; ${directChecks} direct unit-context checks; ${unitFailures.length} unit-context rejections; ${aliasContextChecks} snake unit-context checks; ${partialContextChecks} partial-context rejections; ordinary draft intake refused, explicit synthetic test mode only`);
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
