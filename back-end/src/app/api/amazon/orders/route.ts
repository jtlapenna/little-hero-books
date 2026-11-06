import { preserveOvernightTestMarker } from '@/lib/messaging/test-order-guard';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { withErrorHandling } from '@/lib/api-wrapper';
import { supabase } from '@/lib/supabase-client';
import { readBoundedRequestText, RequestBodyError } from '@/lib/request-body';
import { canonicalCsvCustomizationIdentity } from '@/lib/csv-upload-helpers';
import { downloadAndExtractCustomizationZip } from '@/lib/zip-downloader';
import { parseAmazonCustomization } from '@/lib/amazon-customization-parser';
import { buildSiblingOrderId, buildSiblingOrderRow } from '@/lib/sibling-order-helpers';
import { buildPendingW0Payload } from '@/lib/w0-payload';
import { readAmazonReplacementAuthority, readAmazonReplacementItems, buildFreshAmazonReplacementChoices,
  assertAmazonUnclassifiedStubAdmission, readCsvRootRows, resolveCsvRootItemSelections, reconcileCsvRoot,
  resolveCsvOriginalItemContext, updateExactCsvRow, assertCompleteCsvRootUnits, validateCsvItemBookRow,
  csvItemBookChoiceKey, csvItemBookSpecs, CsvBookSelectionError,
  type CsvItemBookChoice, type CsvUnitDescriptor } from '@/lib/csv-book-selection';

type Row = Record<string, unknown>;
const inspection = { existingMemberPolicy: 'inspect-preserved' } as const;
const object = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
function refuse(message: string): never { throw new CsvBookSelectionError(message, 409); }
function rows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.length > 200 || !Array.from(value).every(object)) refuse('Invalid Amazon item list');
  return value as Row[];
}
function textAliases(sources: Row[], aliases: string[], required = false): string | undefined {
  const values = sources.flatMap(source => aliases.filter(key => Object.hasOwn(source, key) && source[key] !== undefined).map(key => source[key]));
  if (!values.length) { if (required) refuse('Missing Amazon source identity'); return undefined; }
  if (values.some(value => typeof value !== 'string' || !value || value !== value.trim() || value !== values[0])) refuse('Conflicting Amazon source aliases');
  return values[0] as string;
}
function completeItemResponse(value: unknown, rootId: string): Row {
  if (!object(value) || (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length !== 0)) ||
      !object(value.payload)) refuse('Incomplete Amazon item response');
  const payload = value.payload;
  if (payload.AmazonOrderId !== rootId || (payload.NextToken !== undefined && payload.NextToken !== '')) refuse('Incomplete Amazon item response');
  rows(payload.OrderItems); return payload;
}
function byItemId(items: Row[]): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const item of items) {
    const id = textAliases([item], ['OrderItemId', 'orderItemId', 'order_item_id'], true)!;
    if (result.has(id)) refuse('Duplicate Amazon source item');
    result.set(id, item);
  }
  return result;
}
function customizationPointers(source: Row): string[] {
  const values: unknown[] = [];
  const visit = (value: unknown, depth: number) => {
    if (value === undefined) return;
    if (!object(value) || depth > 4) refuse('Malformed Amazon customization source');
    for (const key of ['CustomizedURL', 'CustomizedUrl', 'customization_url', 'customizationUrl']) if (Object.hasOwn(value, key)) values.push(value[key]);
    for (const key of ['BuyerInfo', 'BuyerCustomizedInfo', 'customization', 'CustomizedInfo']) if (Object.hasOwn(value, key)) visit(value[key], depth + 1);
  };
  visit(source, 0);
  if (values.some(value => typeof value !== 'string' || !value || value !== value.trim())) refuse('Invalid Amazon customization URL');
  const urls = values as string[];
  if (urls.some(url => canonicalCsvCustomizationIdentity(url) !== canonicalCsvCustomizationIdentity(urls[0]))) refuse('Conflicting Amazon customization URLs');
  return urls;
}
function parseCustomization(value: unknown): Row | null {
  if (!object(value)) refuse('Malformed Amazon customization');
  if (Object.hasOwn(value, 'version3.0') || Object.hasOwn(value, 'customizationData')) return parseAmazonCustomization(value);
  const fields: Array<[string, string[]]> = [
    ['Child Name', ["Child's Name", 'Child Name', 'childName', 'ChildName']],
    ["Child's Age", ["Child's Age", 'Child Age', 'age', 'Age']],
    ['Pronouns', ['Pronouns', 'pronouns']], ['Skin Tone', ['Skin Tone', 'skinTone', 'SkinTone']],
    ['Hair Color', ['Hair Color', 'hairColor', 'HairColor']], ['Hair Style', ['Hair Style', 'hairStyle', 'HairStyle']],
    ['Favorite Color', ['Favorite Color', 'favoriteColor', 'FavoriteColor']], ['Animal Guide', ['Animal Guide', 'animalGuide', 'AnimalGuide']],
    ['Hometown', ['Hometown', 'hometown', 'Home Town']], ['Dedication', ['Dedication Message', 'dedication', 'Dedication']],
  ];
  const areas: Row[] = [];
  for (const [label, aliases] of fields) {
    const values = aliases.filter(key => Object.hasOwn(value, key) && value[key] !== undefined).map(key => value[key]);
    if (!values.length) continue;
    if (values.some(item => !['string', 'number'].includes(typeof item) || String(item) !== String(values[0]))) refuse('Conflicting Amazon customization fields');
    areas.push({ label, text: String(values[0]), optionValue: String(values[0]) });
  }
  return parseAmazonCustomization({ 'version3.0': { customizationInfo: { surfaces: [{ areas }] } } });
}
async function sourceSpecs(sources: Row[], url: string | undefined, rootId: string, itemId: string,
  authoritative: Row[]): Promise<Row | null> {
  const parseCarriers = (inputs: Row[]) => {
    const parsed: Row[] = [], seen = new Set<Row>();
    const visit = (value: unknown, depth: number) => {
      if (value === undefined) return;
      if (!object(value) || depth > 4) refuse('Malformed Amazon customization source');
      if (seen.has(value)) return; seen.add(value);
      const result = parseCustomization(value); if (result) parsed.push(result);
      for (const key of ['BuyerInfo', 'BuyerCustomizedInfo', 'customization', 'CustomizedInfo']) {
        if (Object.hasOwn(value, key)) visit(value[key], depth + 1);
      }
    };
    for (const input of inputs) visit(input, 0);
    return parsed;
  };
  const originals = parseCarriers(authoritative), candidates = parseCarriers(sources);
  if (url) {
    const data = await downloadAndExtractCustomizationZip(url);
    if (!object(data)) refuse('Invalid Amazon customization archive');
    textAliases([data, { orderId: rootId }], ['orderId', 'amazonOrderId', 'AmazonOrderId']);
    textAliases([data, { orderItemId: itemId }], ['orderItemId', 'OrderItemId', 'order_item_id']);
    const parsed = parseCustomization(data); if (parsed) originals.push(parsed);
  }
  if (candidates.length && !originals.length) refuse('Amazon normalized customization has no original source');
  if ([...originals, ...candidates].some(candidate => !isDeepStrictEqual(candidate, originals[0]))) refuse('Conflicting Amazon parsed customization');
  // Match the JSON shape retained by stored rows and webhook bodies.
  return originals[0] ? JSON.parse(JSON.stringify(originals[0])) as Row : null;
}
function describeUnits(lines: Row[], rootId: string): CsvUnitDescriptor[] {
  let total = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 || (line.quantity as number) > 200) refuse('Invalid Amazon source quantity');
    total += line.quantity as number;
  }
  if (total > 200) refuse('Excessive Amazon source quantity');
  return lines.flatMap(line => {
    const id = textAliases([line], ['order_item_id']);
    const url = textAliases([line], ['customization_url']);
    const hash = url ? createHash('sha256').update(canonicalCsvCustomizationIdentity(url)).digest('hex').slice(0, 12) : undefined;
    if (!id && !hash) refuse('Missing Amazon source item identity');
    const count = line.quantity as number;
    return Array.from({ length: count }, (_, offset) => {
      const unitIndex = offset + 1, suffix = `${id ?? hash}${count > 1 ? `-unit-${unitIndex}` : ''}`;
      return { orderId: total === 1 ? rootId : buildSiblingOrderId(rootId, suffix),
        lineItem: { ...line, quantity: 1, source_quantity: count, quantity_unit_index: unitIndex },
        unitIndex, unitCount: count, itemKey: id ? `item:${id}` : `custom:${hash}` };
    });
  });
}
function sameRows(left: Row[], right: Row[]): boolean {
  return left.length === right.length && left.every(row => right.some(other => row.id === other.id && isDeepStrictEqual(row, other)));
}

async function postAmazonOrder(request: NextRequest) {
  try {
    let json: unknown;
    try { json = JSON.parse(await readBoundedRequestText(request, 2 * 1024 * 1024, { fatal: true })); }
    catch (error) { if (error instanceof RequestBodyError) throw error; refuse('Invalid Amazon intake JSON'); }
    if (!object(json) || !object(json._raw) || !object(json._raw.order) || !object(json._raw.itemResponses)) refuse('Missing Amazon original response provenance');
    const raw = json._raw, responses = raw.itemResponses as Row;
    const rootId = textAliases([json, raw.order as Row], ['amazonOrderId', 'AmazonOrderId', 'rootOrderId', 'root_order_id', 'orderId', 'order_id', 'id'], true)!;
    if (responses.requestedOrderId !== rootId) refuse('Conflicting Amazon requested root');
    for (const key of ['bookId', 'book_id', 'bookSpecs', 'book_specs', 'formatId', 'format_id', 'configVersion', 'characterSpecs', 'character_specs', 'characterHash', 'character_hash']) {
      if (Object.hasOwn(json, key)) refuse('Amazon intake cannot select a book or character context');
    }
    const authority = readAmazonReplacementAuthority(rootId, [json, raw.order as Row]);
    const itemResponse = completeItemResponse(responses.items, rootId), buyerResponse = completeItemResponse(responses.buyerInfo, rootId);
    if (!isDeepStrictEqual(raw.items, itemResponse.OrderItems) || !isDeepStrictEqual(raw.itemsBuyerInfo, buyerResponse)) refuse('Conflicting Amazon original item responses');
    const sourceItems = rows(itemResponse.OrderItems), normalized = byItemId(rows(json.items)), normalizedLines = byItemId(rows(json.lineItems));
    const originalItems = byItemId(sourceItems), buyerItems = byItemId(rows(buyerResponse.OrderItems));
    if (normalized.size !== originalItems.size || normalizedLines.size !== originalItems.size ||
        [...buyerItems.keys(), ...normalized.keys(), ...normalizedLines.keys()].some(id => !originalItems.has(id))) refuse('Incomplete Amazon source item join');
    if (Object.hasOwn(json, 'customization') && sourceItems.length !== 1) refuse('Ambiguous Amazon root customization');
    for (const [id, item] of normalized) {
      if (!object(item.customization)) refuse('Malformed Amazon normalized customization');
      const expectedFields = Object.entries(item.customization).map(([name, value]) => ({ name, text: String(value) }));
      const expectedCustomizations = Object.entries(item.customization).map(([name, value]) => ({ name, label: name, type: 'text', value: String(value) }));
      if (!isDeepStrictEqual(normalizedLines.get(id)!.customizationFields, expectedFields) ||
          !isDeepStrictEqual(item.customizations, expectedCustomizations)) refuse('Conflicting Amazon normalized customization fields');
    }
    const itemSources = sourceItems.map(item => {
      const id = textAliases([item], ['OrderItemId'], true)!;
      const sources = [item, normalized.get(id)!, normalizedLines.get(id)!, ...(buyerItems.has(id) ? [buyerItems.get(id)!] : []),
        ...(sourceItems.length === 1 && Object.hasOwn(json, 'customization') ? [{ customization: json.customization }] : [])];
      const authoritative = [item, ...(buyerItems.has(id) ? [buyerItems.get(id)!] : [])];
      const originalUrls = authoritative.flatMap(customizationPointers), urls = sources.flatMap(customizationPointers);
      if (urls.length && !originalUrls.length) refuse('Amazon customization URL has no original source');
      if (urls.some(url => canonicalCsvCustomizationIdentity(url) !== canonicalCsvCustomizationIdentity(originalUrls[0]))) refuse('Conflicting Amazon customization URLs');
      return { id, sources, authoritative, url: originalUrls[0] };
    });
    const listing = sourceItems.length ? readAmazonReplacementItems(itemSources.map(item => [...item.sources,
      ...(item.url ? [{ customization_url: item.url }] : [])])) : undefined;
    let lines: Row[] = itemSources.map((item, index) => ({ order_item_id: item.id,
      sku: listing![index].sku ?? '', ...(listing![index].asin ? { asin: listing![index].asin } : {}), product_name: textAliases(item.sources, ['Title', 'title', 'product_name']) ?? '',
      quantity: listing![index].quantity, ...(item.url ? { customization_url: item.url } : {}) }));
    let units = describeUnits(lines, rootId);
    const members = await readCsvRootRows(supabase, rootId, [{ orderId: rootId }, ...units]);
    if (members.length) readAmazonReplacementAuthority(rootId, [json, raw.order as Row, ...members]);
    const shipping = json.shippingAddress;
    const parsed = new Map<string, Row | null>();
    // Frozen members use stored specs only. New or pure-stub roots may consume source customization.
    const frozen = members.some(row => validateCsvItemBookRow(row));
    if (frozen) {
      const first = members.find(row => validateCsvItemBookRow(row))!;
      const originalLines = rows((first.product_info as Row).line_items);
      if (!lines.length) assertCompleteCsvRootUnits(members, rootId);
      else {
        if (lines.length !== originalLines.length) refuse('Amazon original source partition changed');
        for (const line of lines) {
          const original = originalLines.find(value => value.order_item_id === line.order_item_id);
          if (!original || original.quantity !== line.quantity || (line.sku && original.sku !== line.sku) ||
              (line.customization_url && (typeof original.customization_url !== 'string' ||
                canonicalCsvCustomizationIdentity(line.customization_url as string) !== canonicalCsvCustomizationIdentity(original.customization_url)))) {
            refuse('Amazon original source partition changed');
          }
        }
      }
      lines = JSON.parse(JSON.stringify(originalLines)) as Row[];
      units = describeUnits(lines, rootId);
    }
    const total = units.length;
    if (!frozen) for (const item of itemSources) parsed.set(item.id, await sourceSpecs(item.sources, item.url, rootId, item.id, item.authoritative));
    if (!frozen && (!listing || [...parsed.values()].some(value => value === null))) {
      assertAmazonUnclassifiedStubAdmission(authority, members, listing, true);
      const confirmed = await readCsvRootRows(supabase, rootId, [{ orderId: rootId }, ...units]);
      if (!sameRows(members, confirmed)) refuse('Amazon root changed before unclassified storage');
      if (!members.length) {
        const now = new Date().toISOString();
        const { error } = await supabase.from('orders').insert({ orderId: rootId, root_order_id: rootId, amazon_order_id: rootId,
          platform: 'amazon', status: 'new', execution_status: 'pending_w0', next_workflow: null,
          purchase_date: authority.purchaseDate, marketplace_id: authority.marketplaceId,
          product_info: { _customization_missing: true, _retry_on_next_cron: true }, created_at: now, updated_at: now });
        if (error) refuse('Amazon unclassified storage conflicted');
      }
      return NextResponse.json({ success: true, amazonOrderId: rootId, unclassified: true, w0Attempted: false }, { status: members.length ? 200 : 201 });
    }
    let choices: readonly CsvItemBookChoice[];
    if (frozen) {
      const row = members.find(member => validateCsvItemBookRow(member))!;
      const info = row.product_info as Row;
      choices = rows(info.line_items).map(line => {
        const tuple = line.bookSelection;
        if (!object(tuple)) refuse('Missing frozen Amazon source book');
        const id = textAliases([line], ['order_item_id']);
        const url = textAliases([line], ['customization_url']);
        if (!id && !url) refuse('Missing frozen Amazon source identity');
        return { rootOrderId: rootId, source: id ? { kind: 'order-item-id', value: id } :
          { kind: 'customization-key', value: createHash('sha256').update(canonicalCsvCustomizationIdentity(url!)).digest('hex').slice(0, 12) },
          bookId: tuple.bookId, formatId: tuple.formatId, configVersion: tuple.configVersion } as CsvItemBookChoice;
      });
    } else choices = buildFreshAmazonReplacementChoices(authority, listing!, members, process.env.AMAZON_INNER_VOICE_CUTOVER_AT);
    const selections = await resolveCsvRootItemSelections(rootId, choices, lines, members);
    for (const line of lines) {
      const selection = selections.get(csvItemBookChoiceKey(rootId, line));
      if (!selection) refuse('Missing resolved Amazon source book');
      if (!frozen && selection.configured?.totalPages !== 32) refuse('Amazon replacement requires published 32-page format');
      line.bookSelection = selection.tuple;
    }
    units = units.map(unit => ({ ...unit, lineItem: { ...unit.lineItem, bookSelection: selections.get(csvItemBookChoiceKey(rootId, unit.lineItem))!.tuple }, lineItems: lines }));
    const plan = reconcileCsvRoot(members, rootId, units, undefined, selections, inspection); units = plan.units;
    const originals = new Map<string, { specs: Row; hash: string }>();
    for (const unit of units) {
      const original = plan.matches.get(unit.orderId), bindStub = plan.placeholderOrderId === unit.orderId;
      const sourceId = unit.lineItem.order_item_id as string;
      if ((!original || bindStub) && !parsed.has(sourceId)) {
        const source = itemSources.find(item => item.id === sourceId);
        if (!source) refuse('Missing Amazon recovery customization source');
        parsed.set(sourceId, await sourceSpecs(source.sources, source.url, rootId, sourceId, source.authoritative));
      }
      originals.set(unit.orderId, await resolveCsvOriginalItemContext(unit.selection!, unit, original,
        original && !bindStub ? null : parsed.get(sourceId) ?? null, rootId, bindStub, inspection));
    }
    for (const unit of units) {
      if (!plan.matches.has(unit.orderId) && units.some(other => other.orderId !== unit.orderId &&
          other.lineItem.order_item_id === unit.lineItem.order_item_id &&
          !isDeepStrictEqual(originals.get(other.orderId)!.specs, originals.get(unit.orderId)!.specs))) {
        refuse('Amazon recovery customization differs from its frozen source');
      }
    }
    const confirmed = await readCsvRootRows(supabase, rootId, [{ orderId: rootId }, ...units]);
    if (!sameRows(members, confirmed)) refuse('Amazon root changed before writes');
    const expected = new Map<string, Row>();
    const pending = units.filter(unit => plan.dispositions.get(unit.orderId) !== 'preserved');
    if (pending.length && !object(shipping)) refuse('Missing Amazon shipping address');
    pending.sort((a, b) => a.orderId === plan.placeholderOrderId ? -1 : b.orderId === plan.placeholderOrderId ? 1 : a.orderId.localeCompare(b.orderId));
    for (const unit of pending) {
      const context = originals.get(unit.orderId)!, selection = unit.selection!, original = plan.matches.get(unit.orderId);
      const metadata = csvItemBookSpecs(selection, context.specs);
      const row = buildSiblingOrderRow({ orderId: unit.orderId, parentOrderId: rootId, platform: 'amazon', shippingAddress: shipping,
        customerName: object(json.buyer) && typeof json.buyer.name === 'string' ? json.buyer.name : null,
        customerEmail: object(json.buyer) && typeof json.buyer.email === 'string' ? json.buyer.email : null,
        characterSpecs: context.specs, characterHash: context.hash, marketplaceId: authority.marketplaceId, purchaseDate: authority.purchaseDate,
        orderItemId: unit.lineItem.order_item_id as string, isSibling: total > 1, bookId: selection.tuple.bookId,
        formatId: selection.tuple.formatId, selection: selection.configured, lineItem: unit.lineItem, lineItems: unit.lineItems,
        unitIndex: unit.unitIndex, unitCount: unit.unitCount });
      row.book_specs = metadata;
      row.product_info = { ...(row.product_info as Row), ...selection.tuple, bookSpecs: metadata, book_specs: metadata,
        _customized_url_hash: unit.lineItem.customization_url ? createHash('sha256').update(canonicalCsvCustomizationIdentity(unit.lineItem.customization_url as string)).digest('hex').slice(0, 12) : null };
      const clean = JSON.parse(JSON.stringify(row)) as Row;
      if (original) {
        const updates: Row = { shipping_address: clean.shipping_address, customer_name: clean.customer_name,
          customer_email: clean.customer_email, character_specs: clean.character_specs, character_hash: clean.character_hash,
          dedication_text: clean.dedication_text, book_specs: clean.book_specs, product_info: preserveOvernightTestMarker(original, clean.product_info),
          root_order_id: rootId, amazon_order_id: rootId, updated_at: clean.updated_at };
        await updateExactCsvRow(supabase, original, unit.orderId, updates, true);
        expected.set(unit.orderId, { ...original, ...updates });
      } else {
        const result = await supabase.from('orders').insert(clean).select('*').single();
        if (result.error || !object(result.data) || !Number.isSafeInteger(result.data.id)) refuse('Amazon root insert conflicted; saved books remain pending');
        for (const [key, value] of Object.entries(clean)) {
          const timestamp = ['purchase_date', 'created_at', 'updated_at'].includes(key);
          const canonical = (input: unknown) => timestamp && typeof input === 'string' ? new Date(input).toISOString() : input;
          if (!isDeepStrictEqual(canonical(result.data[key]), canonical(value))) refuse('Amazon inserted context differs from its validated plan');
        }
        expected.set(unit.orderId, result.data);
      }
    }
    const stored = await readCsvRootRows(supabase, rootId, [{ orderId: rootId }, ...units]);
    assertCompleteCsvRootUnits(stored, rootId);
    const verified = reconcileCsvRoot(stored, rootId, units, undefined, selections, inspection);
    if (verified.placeholderOrderId !== null || verified.matches.size !== units.length || verified.units.some((unit, index) => unit.orderId !== units[index].orderId)) refuse('Amazon saved root is incomplete');
    const payloads: Row[] = [];
    for (const unit of units) {
      const row = verified.matches.get(unit.orderId)!;
      const prior = plan.matches.get(unit.orderId), preserved = plan.dispositions.get(unit.orderId) === 'preserved';
      const wanted = preserved ? prior! : expected.get(unit.orderId)!;
      const normalizeRevision = (value: Row) => ({ ...value, updated_at: typeof value.updated_at === 'string' ? new Date(value.updated_at).toISOString() : value.updated_at });
      if (!isDeepStrictEqual(normalizeRevision(row), normalizeRevision(wanted)) ||
          (preserved ? verified.dispositions.get(unit.orderId) !== 'preserved' : verified.dispositions.get(unit.orderId) !== 'initial')) refuse('Amazon saved member changed before W0');
      await resolveCsvOriginalItemContext(unit.selection!, unit, row, null, rootId, false, inspection);
      if (!preserved) payloads.push(buildPendingW0Payload(row));
    }
    const webhook = process.env.N8N_W0_WEBHOOK_URL;
    let succeeded = 0;
    if (webhook) for (const payload of payloads) {
      const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) refuse('Amazon W0 dispatch failed; saved books remain pending');
      succeeded++;
    }
    return NextResponse.json({ success: true, amazonOrderId: rootId, orderIds: units.map(unit => unit.orderId),
      preserved: units.length - pending.length, w0Attempted: !!webhook && payloads.length > 0, w0Called: succeeded }, { status: members.length ? 200 : 201 });
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status
      : error instanceof CsvBookSelectionError && error.status !== 400 ? error.status : 409;
    // Storage, transport and customer payloads never enter logs or error responses.
    return NextResponse.json({ success: false, error: status === 413 ? 'Request body too large' : 'Amazon intake held for verified source or stored context' }, { status });
  }
}
export const POST = withErrorHandling(postAmazonOrder);
