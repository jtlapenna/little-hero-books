import { isDeepStrictEqual } from 'node:util';
import { OrderStatus, WorkflowStep } from '@/constants/statuses';
import { canonicalCsvCustomizationIdentity } from './csv-upload-helpers';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookConfig } from '@/lib/books/types';
import { collectOrderPathLikes, extractBookIdFromOrderPathLike, extractBookIdFromPathLike } from '@/lib/order-paths';
import { calculateCharacterHash } from '@/lib/character-hash';

export const CSV_INNER_VOICE_BOOK_ID = 'book-finding-our-inner-voice';
export const CSV_LEGACY_BOOK_ID = 'book-mvp-simple-adventure';
type Row = Record<string, unknown>;
export type CsvBookSelection = Readonly<{
  bookId: typeof CSV_INNER_VOICE_BOOK_ID;
  formatId: 'amazon';
  configVersion: number;
  title: 'Finding Our Inner Voice';
  totalPages: number;
  format: 'amazon';
  bookType: 'inner-voice';
  channel: 'amazon';
}>;
export type CsvItemBookTuple = Readonly<{
  bookId: typeof CSV_INNER_VOICE_BOOK_ID | typeof CSV_LEGACY_BOOK_ID;
  formatId: 'amazon';
  configVersion: number;
}>;

export function assertCsvItemBookTuple(value: unknown): asserts value is CsvItemBookTuple {
  if (!record(value) || Object.keys(value).length !== 3 ||
      !['bookId', 'formatId', 'configVersion'].every(key => Object.hasOwn(value, key)) ||
      value.formatId !== 'amazon' || !Number.isSafeInteger(value.configVersion) ||
      (value.bookId === CSV_INNER_VOICE_BOOK_ID ? (value.configVersion as number) < 2 :
        value.bookId !== CSV_LEGACY_BOOK_ID || value.configVersion !== 1)) {
    fail('Invalid CSV item book selection');
  }
}

// Detect declarations separately from the book owned by the enclosing row.
export function csvHasItemBookSelections(sources: Row[]): boolean {
  const seen = new Set<object>();
  const declared = (value: unknown, depth: number): boolean => {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    if (depth > 32 || seen.size >= 20000) fail('CSV item selection inspection exceeds supported context');
    seen.add(value);
    if (Array.isArray(value)) return value.some(item => declared(item, depth + 1));
    if (Object.hasOwn(value, 'bookSelection')) return true;
    return Object.values(value).some(item => declared(item, depth + 1));
  };
  return sources.some(source => ['line_item', 'lineItem', 'line_items', 'items', 'lineItems']
    .some(key => declared(source[key], 0)));
}

export function csvRowHasItemBookSelections(row: Row): boolean {
  const sources = carriers(row, false);
  // Historical array-shaped product_info has no mixed contract. A nested declaration there is malformed.
  for (const key of ['product_info', 'productInfo']) {
    if (Array.isArray(row[key])) sources.push({ items: row[key] });
  }
  return csvHasItemBookSelections(sources);
}

export function csvRootNeedsCompleteUnits(rows: Row[]): boolean {
  return rows.some(csvRowDeclaresInnerVoice) || rows.some(csvRowHasItemBookSelections);
}

export function validateCsvItemBookContext(sources: Row[], expected?: CsvItemBookTuple): CsvItemBookTuple | undefined {
  if (!csvHasItemBookSelections(sources)) return undefined;
  const line = readCsvUnitField(sources, ['line_item', 'lineItem']);
  const items = readCsvUnitField(sources, ['line_items', 'items', 'lineItems']);
  if (!record(line) || !Array.isArray(items) || items.length === 0 || items.length > 200) {
    fail('Missing CSV item book selection context');
  }
  for (const source of sources) if (source.quantity !== undefined && source.quantity !== 1) fail('Mixed CSV physical quantity must be one');
  assertCsvItemBookTuple(line.bookSelection);
  const selected = csvSourceIdentity(line);
  const keys = new Set<string>();
  let matches = 0;
  for (const item of items) {
    if (!record(item)) fail('Invalid CSV item book selection context');
    assertCsvItemBookTuple(item.bookSelection);
    const source = csvSourceIdentity(item);
    if (keys.has(source.key)) fail('Duplicate CSV source book selection');
    keys.add(source.key);
    if (source.key === selected.key) {
      if (source.itemId !== selected.itemId || source.hash !== selected.hash ||
          !isDeepStrictEqual(item.bookSelection, line.bookSelection)) {
        fail('Conflicting CSV selected item book');
      }
      matches++;
    }
  }
  if (matches !== 1) fail('Missing CSV selected source book');
  if (expected !== undefined) {
    assertCsvItemBookTuple(expected);
    if (!isDeepStrictEqual(line.bookSelection, expected)) fail('CSV selected item book differs from canonical selection');
  }
  return line.bookSelection;
}

export function validateCsvItemBookRow(row: Row, expected?: CsvItemBookTuple): CsvItemBookTuple | undefined {
  if (!csvRowHasItemBookSelections(row)) return undefined;
  const info = row.product_info;
  if (!record(info) || (row.productInfo !== undefined && !isDeepStrictEqual(row.productInfo, info)) ||
      !record(info.line_item) || !Array.isArray(info.line_items) ||
      !Number.isSafeInteger(info._quantity_unit_index) || !Number.isSafeInteger(info._quantity_unit_count)) {
    fail('Mixed CSV storage requires canonical unit context');
  }
  const tuple = validateCsvItemBookContext(carriers(row, true), expected);
  if (!tuple || !validateCsvItemBookContext([info], tuple)) fail('Missing mixed CSV canonical item context');
  assertTuple(row, tuple);
  return tuple;
}

export type CsvItemBookChoice = Readonly<{
  rootOrderId: string;
  source: Readonly<{ kind: 'order-item-id' | 'customization-key'; value: string }>;
  bookId: CsvItemBookTuple['bookId'];
  formatId: 'amazon';
  configVersion?: number;
}>;

export function readCsvItemBookSelections(form: FormData): readonly CsvItemBookChoice[] | undefined {
  const fields = form.getAll('itemBookSelections');
  if (fields.length === 0) return undefined;
  function reject(message: string): never { throw new CsvBookSelectionError(message); }
  if (fields.length !== 1 || typeof fields[0] !== 'string' ||
      new TextEncoder().encode(fields[0]).length > 512 * 1024) reject('Invalid item book selection field');
  for (const [key] of form.entries()) if (!['file', 'itemBookSelections'].includes(key)) reject('Mixed CSV selection cannot include file-wide selectors or extra fields');
  if (form.getAll('file').length !== 1) reject('Mixed CSV intake requires exactly one file');
  const raw = fields[0] as string;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
    // UI sends JSON.stringify output. This also rejects duplicate JSON object keys.
    if (JSON.stringify(parsed) !== raw) reject('Item book selections must use canonical JSON');
  } catch (error) {
    if (error instanceof CsvBookSelectionError) throw error;
    reject('Invalid item book selection JSON');
  }
  const keys = (value: Row, required: string[], optional: string[] = []) =>
    required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
  if (!record(parsed) || !keys(parsed, ['schemaVersion', 'items']) || parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.items) || parsed.items.length === 0 || parsed.items.length > 2000) reject('Invalid item book selection envelope');
  const result: CsvItemBookChoice[] = [], seen = new Set<string>();
  for (const value of parsed.items) {
    if (!record(value) || !keys(value, ['rootOrderId', 'source', 'bookId', 'formatId'], ['configVersion']) ||
        !text(value.rootOrderId) || value.rootOrderId !== value.rootOrderId.trim() ||
        !record(value.source) || !keys(value.source, ['kind', 'value']) || !text(value.source.value) ||
        value.source.value !== value.source.value.trim() ||
        !['order-item-id', 'customization-key'].includes(value.source.kind as string) ||
        (value.source.kind === 'customization-key' && !/^[a-f0-9]{12}$/.test(value.source.value)) ||
        ![CSV_INNER_VOICE_BOOK_ID, CSV_LEGACY_BOOK_ID].includes(value.bookId as typeof CSV_INNER_VOICE_BOOK_ID) ||
        value.formatId !== 'amazon') reject('Invalid per-item book selection');
    if (Object.hasOwn(value, 'configVersion')) {
      try { assertCsvItemBookTuple({ bookId: value.bookId, formatId: value.formatId, configVersion: value.configVersion }); }
      catch { reject('Invalid per-item book version'); }
    }
    const key = JSON.stringify([value.rootOrderId, value.source.kind, value.source.value]);
    if (seen.has(key)) reject('Duplicate CSV source book selection');
    seen.add(key);
    result.push(Object.freeze({ rootOrderId: value.rootOrderId, source: Object.freeze({
      kind: value.source.kind, value: value.source.value }), bookId: value.bookId, formatId: value.formatId,
      ...(value.configVersion !== undefined ? { configVersion: value.configVersion } : {}) }) as CsvItemBookChoice);
  }
  return Object.freeze(result);
}

export function csvItemBookChoiceKey(rootOrderId: string, lineItem: Row): string {
  const source = csvSourceIdentity(lineItem);
  return JSON.stringify([rootOrderId, source.itemId ? 'order-item-id' : 'customization-key', source.itemId ?? source.hash]);
}

export function validateCsvItemBookChoiceCoverage(choices: readonly CsvItemBookChoice[], items: Array<{ rootOrderId: string; lineItem: Row }>): Map<string, CsvItemBookChoice> {
  const declarations = new Map(choices.map(choice => [JSON.stringify([choice.rootOrderId, choice.source.kind, choice.source.value]), choice]));
  const actual = new Set<string>(), rootQuantities = new Map<string, number>();
  if (items.length === 0 || items.length > 2000 || declarations.size !== choices.length) fail('Invalid mixed CSV source item count');
  for (const item of items) {
    if (!text(item.rootOrderId) || item.rootOrderId !== item.rootOrderId.trim()) fail('Invalid mixed CSV source root');
    const key = csvItemBookChoiceKey(item.rootOrderId, item.lineItem);
    if (actual.has(key) || !declarations.has(key)) fail('Missing or duplicate mixed CSV source declaration');
    actual.add(key);
    const quantity = item.lineItem.quantity;
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1) fail('Invalid mixed CSV source quantity');
    const total = (rootQuantities.get(item.rootOrderId) ?? 0) + quantity;
    if (total > 200) fail('Mixed Amazon root exceeds supported unit count');
    rootQuantities.set(item.rootOrderId, total);
  }
  if (actual.size !== declarations.size) fail('Unexpected mixed CSV source declaration');
  return declarations;
}

export type CsvResolvedItemSelection = Readonly<{
  tuple: CsvItemBookTuple;
  configured?: CsvBookSelection;
}>;

export async function resolveCsvRootItemSelections(
  rootId: string,
  choices: readonly CsvItemBookChoice[],
  sourceItems: Row[],
  rows: Row[],
): Promise<Map<string, CsvResolvedItemSelection>> {
  const declared = validateCsvItemBookChoiceCoverage(choices, sourceItems.map(lineItem => ({ rootOrderId: rootId, lineItem })));
  const incoming = new Map(sourceItems.map(item => [csvItemBookChoiceKey(rootId, item), item]));
  const frozen = new Map<string, CsvItemBookTuple>();
  let originalItems: Row[] | undefined;
  const sourceSignature = (item: Row): unknown[] => {
    const source = csvSourceIdentity(item);
    return [source.itemId, source.hash, item.sku, item.product_name, item.quantity];
  };
  for (const row of rows) {
    const id = row.orderId ?? row.order_id;
    physicalId(row);
    if (!text(id) || id !== id.trim()) fail('Missing or invalid mixed CSV stored identity');
    assertCsvRootIdentity(row, rootId, id);
    if (isPurePlaceholder(row, rootId)) {
      assertInitial(row, rootId, id);
      if (rows.length !== 1) fail('CSV placeholder must be the sole existing root member');
      continue;
    }
    if (!validateCsvItemBookRow(row)) fail('This root retains its original single-book CSV contract');
    const items = readCsvUnitField(carriers(row, true), ['line_items', 'items', 'lineItems']);
    if (!Array.isArray(items) || items.length !== incoming.size) fail('Mixed CSV original source partition changed');
    const seen = new Set<string>();
    for (const item of items) {
      if (!record(item)) fail('Invalid mixed CSV original source declaration');
      assertCsvItemBookTuple(item.bookSelection);
      const key = csvItemBookChoiceKey(rootId, item), submitted = incoming.get(key), choice = declared.get(key);
      if (!submitted || !choice || seen.has(key) || !isDeepStrictEqual(sourceSignature(item), sourceSignature(submitted))) {
        fail('Mixed CSV original source partition changed');
      }
      seen.add(key);
      if (choice.bookId !== item.bookSelection.bookId || choice.formatId !== item.bookSelection.formatId ||
          (choice.configVersion !== undefined && choice.configVersion !== item.bookSelection.configVersion)) {
        fail('Mixed CSV selection differs from its frozen source declaration');
      }
      const prior = frozen.get(key);
      if (prior && !isDeepStrictEqual(prior, item.bookSelection)) fail('Conflicting mixed CSV original book declarations');
      frozen.set(key, item.bookSelection);
    }
    if (seen.size !== declared.size) fail('Incomplete mixed CSV original declarations');
    if (originalItems && !isDeepStrictEqual(originalItems, items)) fail('Conflicting mixed CSV original aggregates');
    originalItems = items as Row[];
  }
  const resolved = new Map<string, CsvResolvedItemSelection>();
  const configs = new Map<string, CsvResolvedItemSelection>();
  for (const [key, choice] of declared) {
    if (![CSV_INNER_VOICE_BOOK_ID, CSV_LEGACY_BOOK_ID].includes(choice.bookId) || choice.formatId !== 'amazon') fail('Unsupported mixed CSV book selection');
    const original = frozen.get(key);
    if (frozen.size && !original) fail('Missing mixed CSV frozen source book');
    if (choice.bookId === CSV_LEGACY_BOOK_ID) {
      const tuple: CsvItemBookTuple = Object.freeze({ bookId: CSV_LEGACY_BOOK_ID, formatId: 'amazon', configVersion: 1 });
      if ((choice.configVersion !== undefined && choice.configVersion !== 1) || (original && !isDeepStrictEqual(original, tuple))) {
        fail('Conflicting mixed CSV legacy selection');
      }
      resolved.set(key, Object.freeze({ tuple }));
      continue;
    }
    const cacheKey = JSON.stringify([choice.bookId, original?.configVersion ?? 'active']);
    let selection = configs.get(cacheKey);
    if (!selection) {
      try {
        const { loadPublishedBookConfigRecord } = await import('@/lib/books/runtime-book-config');
        const published = await loadPublishedBookConfigRecord({ bookId: choice.bookId,
          ...(original ? { version: original.configVersion } : {}) });
        const config = published.config, format = config.formats.amazon;
        if (config.bookId !== CSV_INNER_VOICE_BOOK_ID || config.version < 2 || !format?.channels.includes('amazon') ||
            config.status === 'draft' || (original && (!['active', 'archived'].includes(published.row.status) || config.version !== original.configVersion)) ||
            (!original && (published.row.is_active !== true || published.row.status !== 'active' || config.status !== 'active'))) {
          throw new CsvBookSelectionError('The selected item book is not available for this intake.', 409);
        }
        const configured: CsvBookSelection = Object.freeze({ bookId: CSV_INNER_VOICE_BOOK_ID, formatId: 'amazon',
          configVersion: config.version, title: 'Finding Our Inner Voice', totalPages: format.interior.expectedPageCount,
          format: 'amazon', bookType: 'inner-voice', channel: 'amazon' });
        assertCsvBookSelection(configured);
        selectedConfigs.set(configured, config);
        selection = Object.freeze({ tuple: Object.freeze({ bookId: configured.bookId, formatId: configured.formatId,
          configVersion: configured.configVersion }), configured });
        configs.set(cacheKey, selection);
      } catch (error) {
        if (error instanceof CsvBookSelectionError) throw error;
        throw new CsvBookSelectionError('The frozen or active item book config could not be verified.', 503);
      }
    }
    if (choice.configVersion !== undefined && choice.configVersion !== selection.tuple.configVersion) {
      throw new CsvBookSelectionError('The selected item version differs from its authoritative config.', 409);
    }
    resolved.set(key, selection);
  }
  return resolved;
}

export function csvItemBookSpecs(selection: CsvResolvedItemSelection, specs: Row): Row {
  assertCsvItemBookTuple(selection.tuple);
  if (selection.tuple.bookId === CSV_INNER_VOICE_BOOK_ID) {
    if (!selection.configured || !isDeepStrictEqual(selection.tuple, {
      bookId: selection.configured.bookId, formatId: selection.configured.formatId,
      configVersion: selection.configured.configVersion,
    })) fail('Mixed CSV selection is not bound to its configured book');
    return csvBookSpecs(selection.configured);
  }
  if (selection.configured) fail('Legacy CSV selection cannot carry configured-book metadata');
  if (!text(specs.childName)) fail('Missing legacy mixed CSV child name');
  return { ...selection.tuple, title: `${specs.childName as string} and the Adventure Compass`,
    totalPages: 16, format: '8.5x8.5_softcover', bookType: 'adventure', channel: 'amazon' };
}

export async function resolveCsvOriginalItemContext(
  selection: CsvResolvedItemSelection, unit: CsvUnitDescriptor, existing: Row | undefined,
  parsed: Row | null, rootId: string, bindPlaceholder = false,
  options: CsvExistingMemberOptions = {},
): Promise<{ specs: Row; hash: string }> {
  assertCsvItemBookTuple(selection.tuple);
  if (bindPlaceholder && (!existing || unit.orderId !== rootId || !isPurePlaceholder(existing, rootId))) fail('Invalid mixed CSV placeholder decision');
  if (existing) {
    const disposition = bindPlaceholder ? (assertInitial(existing, rootId, unit.orderId), 'initial')
      : inspectCsvExistingMember(existing, rootId, unit.orderId, options);
    if (disposition === 'preserved' && parsed !== null) fail('Preserved Amazon members require stored customization only');
    if (!bindPlaceholder && !validateCsvItemBookRow(existing, selection.tuple)) fail('Missing original mixed CSV book context');
  }
  if (selection.tuple.bookId === CSV_INNER_VOICE_BOOK_ID) {
    if (!selection.configured) fail('Missing configured mixed CSV selection');
    const result = await resolveCsvOriginalContext(selection.configured, unit, existing, parsed, rootId, bindPlaceholder);
    const expected = csvItemBookSpecs(selection, result.specs);
    if (existing && !bindPlaceholder) assertMixedCsvBookMetadata(existing, expected);
    return result;
  }
  const { calculateSiblingCharacterHash } = await import('@/lib/sibling-order-helpers');
  let specs = parsed;
  if (existing && !bindPlaceholder) {
    const original = existing.character_specs;
    if (!record(original) || !Object.keys(original).length) fail('Missing original legacy mixed CSV character specs');
    for (const name of ['characterSpecs', 'CharacterSpecs']) {
      if (Object.hasOwn(existing, name) && !isDeepStrictEqual(existing[name], original)) fail('Conflicting original legacy mixed CSV specs');
    }
    if (typeof existing.character_hash !== 'string' || existing.character_hash !== calculateSiblingCharacterHash(original) ||
        (Object.hasOwn(existing, 'characterHash') && existing.characterHash !== existing.character_hash)) {
      fail('Invalid original legacy mixed CSV character hash');
    }
    if (parsed && !isDeepStrictEqual(JSON.parse(JSON.stringify(parsed)), original)) fail('Mixed CSV customization differs from original specs');
    if (existing.dedication_text != null && existing.dedication_text !== original.dedication) fail('Conflicting original legacy mixed CSV dedication');
    specs = original;
  }
  if (!record(specs) || !text(specs.childName) || !present(specs.age) ||
      (present(specs.dedication) && typeof specs.dedication !== 'string')) fail('Missing or malformed legacy mixed CSV customization');
  if (existing && !bindPlaceholder) assertMixedCsvBookMetadata(existing, csvItemBookSpecs(selection, specs));
  return { specs, hash: calculateSiblingCharacterHash(specs) };
}


function assertMixedCsvBookMetadata(row: Row, expected: Row): void {
  const info = row.product_info;
  if (!record(info) || !isDeepStrictEqual(row.book_specs, expected)) fail('Mixed CSV original book metadata changed');
  for (const value of [row.bookSpecs, info.bookSpecs, info.book_specs]) {
    if (value !== undefined && !isDeepStrictEqual(value, expected)) fail('Conflicting mixed CSV original book metadata');
  }
}
const selectedConfigs = new WeakMap<CsvBookSelection, BookConfig>();
export class CsvBookSelectionError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
function record(value: unknown): value is Row {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function fail(message: string): never { throw new Error(message); }
function present(value: unknown): boolean { return value !== undefined && value !== null; }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }

export function assertCsvBookSelection(value: CsvBookSelection): void {
  if (!record(value) || value.bookId !== CSV_INNER_VOICE_BOOK_ID || value.formatId !== 'amazon' ||
      !Number.isSafeInteger(value.configVersion) || value.configVersion < 2 ||
      value.title !== 'Finding Our Inner Voice' || !Number.isSafeInteger(value.totalPages) || value.totalPages <= 0 ||
      value.format !== 'amazon' || value.bookType !== 'inner-voice' || value.channel !== 'amazon') {
    fail('Invalid resolved CSV book selection');
  }
}
export function csvBookSpecs(selection: CsvBookSelection): Row {
  assertCsvBookSelection(selection);
  return { bookId: selection.bookId, formatId: selection.formatId, configVersion: selection.configVersion,
    title: selection.title, totalPages: selection.totalPages, format: selection.format,
    bookType: selection.bookType, channel: selection.channel };
}
export function assertCsvHelperSelection(bookId: unknown, formatId: unknown, selection?: CsvBookSelection, platform?: string): void {
  if (selection === undefined) {
    if (typeof bookId === 'string' && bookId.trim() === CSV_INNER_VOICE_BOOK_ID) fail('Inner Voice CSV helpers require a resolved book selection');
    return;
  }
  assertCsvBookSelection(selection);
  if (platform !== 'amazon') fail('Configured CSV selection requires Amazon platform');
  if ((present(bookId) && bookId !== selection.bookId) || (present(formatId) && formatId !== selection.formatId)) {
    fail('Conflicting CSV helper book selection');
  }
}

export async function resolveCsvBookSelection(form: FormData): Promise<CsvBookSelection | undefined> {
  for (const alias of ['book_id', 'format_id', 'config_version', 'version', 'bookSpecs', 'book_specs', 'product_info', 'productInfo',
    'print_book_id', 'printBookId', 'print_config_version', 'printConfigVersion', 'print_format_id', 'printFormatId', 'bookConfigRef']) {
    if (form.has(alias)) throw new CsvBookSelectionError('Unsupported CSV book selection field');
  }
  const values: Record<string, string | undefined> = {};
  for (const key of ['bookId', 'formatId', 'configVersion']) {
    const all = form.getAll(key);
    if (all.length > 1 || (all.length && (typeof all[0] !== 'string' || !all[0].trim()))) {
      throw new CsvBookSelectionError('Invalid CSV book selection');
    }
    values[key] = all[0] as string | undefined;
  }
  const { bookId, formatId, configVersion } = values;
  if (bookId === undefined && formatId === undefined && configVersion === undefined) return undefined;
  let hint: number | undefined;
  if (configVersion !== undefined) {
    if (!/^[1-9][0-9]*$/.test(configVersion) || !Number.isSafeInteger(Number(configVersion))) {
      throw new CsvBookSelectionError('Invalid CSV configVersion');
    }
    hint = Number(configVersion);
  }
  if (bookId === CSV_LEGACY_BOOK_ID && formatId === 'amazon' && (hint === undefined || hint === 1)) return undefined;
  if (bookId !== CSV_INNER_VOICE_BOOK_ID || formatId !== 'amazon') {
    throw new CsvBookSelectionError('Unsupported CSV book or format');
  }
  try {
    // Load only for the explicit configured-book path; legacy imports keep their existing behavior.
    const { loadPublishedBookConfigRecord } = await import('@/lib/books/runtime-book-config');
    const published = await loadPublishedBookConfigRecord({ bookId });
    const config = published.config;
    const format = config.formats.amazon;
    if (published.row.is_active !== true || published.row.status !== 'active' || config.bookId !== bookId || config.version < 2 ||
        config.status !== 'active' || !format?.channels.includes('amazon')) {
      throw new CsvBookSelectionError('This book is not available for Amazon CSV intake.', 409);
    }
    if (hint !== undefined && hint !== config.version) {
      throw new CsvBookSelectionError('The selected book version has changed. Refresh and try again.', 409);
    }
    const selection: CsvBookSelection = Object.freeze({ bookId, formatId: 'amazon', configVersion: config.version,
      title: 'Finding Our Inner Voice', totalPages: format.interior.expectedPageCount,
      format: 'amazon', bookType: 'inner-voice', channel: 'amazon' });
    assertCsvBookSelection(selection);
    selectedConfigs.set(selection, config);
    return selection;
  } catch (error) {
    if (error instanceof CsvBookSelectionError) throw error;
    throw new CsvBookSelectionError('Book availability could not be verified.', 503);
  }
}

const BOOK_FIELDS = ['bookId', 'book_id', 'project', 'print_book_id', 'printBookId'];
const FORMAT_FIELDS = ['formatId', 'format_id', 'print_format_id', 'printFormatId'];
const VERSION_FIELDS = ['configVersion', 'config_version', 'version', 'print_config_version', 'printConfigVersion'];
const DB_NULLABLE = new Set(['book_id', 'project', 'print_book_id', 'print_config_version', 'print_format_id']);
const CONTEXT_FIELDS = ['orderContext', '_compatSnapshot', 'orderData', 'ctx'];
const PROGRESS_FIELDS = ['one_manifest_key', 'lulu_job_id', 'lulu_status', 'print_submission_id', 'print_claim_token',
  'gelato_order_id', 'gelato_status', 'current_workflow', 'workflow_step', 'one_manifest_url', 'oneManifestUrl', 'oneManifestKey', 'print_manifest_key',
  'manifest_2a_url', 'manifest_2b_url', 'manifest_3_url', 'manifest_4_url', 'final_book_url', 'final_cover_url',
  'asset_prefix', 'renderSnapshot', 'render_snapshot', 'manifest', 'runManifest', 'bookConfigRef',
  'queued_at', 'started_at', 'completed_at', 'orderPrefix', 'order_prefix', '_order_prefix',
  'assetPrefix', 'manifest2aUrl', 'manifest2bUrl', 'manifest3Url', '_manifest_2a_url', '_manifest_2b_url',
  '_manifest_3_url', 'finalBookUrl', 'finalCoverUrl', 'cover_image_url'];

function carriers(row: Row, strict: boolean): Row[] {
  const result: Row[] = [];
  const seen = new Set<Row>();
  const queue = [{ value: row, depth: 0 }];
  const containers = ['book_specs', 'bookSpecs', 'product_info', 'productInfo', ...CONTEXT_FIELDS,
    '__meta', 'snapshot', 'deriveQaPass', 'bookContext', 'bookConfigRef', 'configRef', 'renderSnapshot',
    'render_snapshot', 'manifest', 'runManifest', 'book'];
  for (let index = 0; index < queue.length; index++) {
    const { value, depth } = queue[index];
    if (seen.has(value)) continue;
    if (depth > 8) fail('CSV identity carrier nesting exceeds supported context');
    seen.add(value);
    result.push(value);
    for (const key of containers) {
      if (!Object.hasOwn(value, key) || value[key] === undefined ||
          (value === row && ['book_specs', 'product_info'].includes(key) && value[key] === null)) continue;
      let nested = value[key];
      if (!strict && typeof nested === 'string') {
        const serialized = nested;
        try { nested = JSON.parse(serialized); }
        catch { if (serialized.includes(CSV_INNER_VOICE_BOOK_ID)) result.push({ bookId: CSV_INNER_VOICE_BOOK_ID }); }
      }
      if (!record(nested)) { if (strict) fail(`Malformed CSV identity carrier: ${key}`); continue; }
      queue.push({ value: nested, depth: depth + 1 });
    }
  }
  return result;
}
export function csvRowHasProgress(row: Row): boolean {
  return carriers(row, true).some(item => [...PROGRESS_FIELDS, ...CONTEXT_FIELDS, '__meta'].some(key => present(item[key])));
}
export function csvRowDeclaresInnerVoice(row: Row): boolean {
  return carriers(row, false).some(item => BOOK_FIELDS.some(key => typeof item[key] === 'string' &&
      (item[key] as string).trim() === CSV_INNER_VOICE_BOOK_ID) ||
    [...collectOrderPathLikes(item), ...collectOrderPathLikes({ product_info: item }),
      ...collectOrderPathLikes({ bookContext: item }),
      ...PROGRESS_FIELDS.flatMap(key => typeof item[key] === 'string' ? [item[key] as string] : [])]
      .some(value => extractBookIdFromOrderPathLike(value) === CSV_INNER_VOICE_BOOK_ID ||
        extractBookIdFromPathLike(value) === CSV_INNER_VOICE_BOOK_ID));
}
function assertTuple(row: Row, selection: CsvItemBookTuple): void {
  for (const item of carriers(row, true)) {
    for (const [fields, expected] of [[BOOK_FIELDS, selection.bookId], [FORMAT_FIELDS, selection.formatId],
      [VERSION_FIELDS, selection.configVersion]] as const) {
      for (const key of fields) {
        if (!Object.hasOwn(item, key) || item[key] === undefined || (item === row && DB_NULLABLE.has(key) && item[key] === null)) continue;
        if (item[key] !== expected) fail(`Conflicting CSV frozen selection: ${key}`);
      }
    }
  }
  const info = row.product_info;
  const specs = row.book_specs;
  if (!record(info) || !record(specs)) fail('CSV row is missing its canonical frozen selection');
  for (const item of [info, specs]) {
    if (item.bookId !== selection.bookId || item.formatId !== selection.formatId || item.configVersion !== selection.configVersion) {
      fail('CSV row is missing its canonical frozen selection');
    }
  }
}
function assertCsvRootIdentity(row: Row, rootId: string, orderId: string): void {
  if (row.platform !== 'amazon') fail('Conflicting CSV root platform');
  for (const key of ['orderId', 'order_id']) {
    if (present(row[key]) && row[key] !== orderId) fail('Conflicting CSV per-item identity');
  }
  if (row.orderId !== orderId && row.order_id !== orderId) fail('Missing CSV per-item identity');
  for (const key of ['root_order_id', 'amazon_order_id']) {
    if (row[key] !== rootId) fail('Conflicting CSV root identity');
  }
  for (const key of ['rootOrderId', 'amazonOrderId']) {
    if (present(row[key]) && row[key] !== rootId) fail('Conflicting CSV root alias');
  }
  if (record(row.product_info)) for (const key of ['_parent_root_order_id', '_parent_amazon_order_id', '_root_order_id']) {
    if (present(row.product_info[key]) && row.product_info[key] !== rootId) fail('Conflicting CSV parent identity');
  }
}
function assertInitial(row: Row, rootId: string, orderId: string): void {
  if (row.platform !== 'amazon' || row.status !== 'new' || row.execution_status !== 'pending_w0' ||
      present(row.next_workflow) || present(row.workflow_step) || present(row.current_workflow)) fail('CSV row has progressed beyond initial intake');
  assertCsvRootIdentity(row, rootId, orderId);
  for (const item of carriers(row, true)) for (const key of [...PROGRESS_FIELDS, ...CONTEXT_FIELDS, '__meta']) {
    if (present(item[key])) fail(`CSV row has frozen or progressed context: ${key}`);
  }
}
export type CsvExistingMemberOptions = Readonly<{
  existingMemberPolicy?: 'initial-only' | 'inspect-preserved';
}>;
export type CsvExistingMemberDisposition = 'initial' | 'preserved';
function inspectCsvExistingMember(row: Row, rootId: string, orderId: string,
  options: CsvExistingMemberOptions): CsvExistingMemberDisposition {
  if (options.existingMemberPolicy !== undefined && options.existingMemberPolicy !== 'initial-only' &&
      options.existingMemberPolicy !== 'inspect-preserved') fail('Invalid Amazon existing-member policy');
  if (options.existingMemberPolicy !== 'inspect-preserved') {
    assertInitial(row, rootId, orderId); return 'initial';
  }
  physicalId(row); assertCsvRootIdentity(row, rootId, orderId);
  for (const source of carriers(row, true)) {
    for (const key of ['next_workflow', 'current_workflow']) {
      if (present(source[key]) && !['0', '2A', '2B', '3', '4', '4.1', '4-aggregate'].includes(source[key] as string)) {
        fail('Unclassified Amazon stored workflow state');
      }
    }
    if (present(source.workflow_step) && !Object.values(WorkflowStep).includes(source.workflow_step as WorkflowStep)) {
      fail('Unclassified Amazon stored workflow state');
    }
  }
  if (row.status === 'new' && row.execution_status === 'pending_w0' &&
      !present(row.next_workflow) && !csvRowHasProgress(row)) {
    assertInitial(row, rootId, orderId); return 'initial';
  }
  if (!Object.values(OrderStatus).includes(row.status as OrderStatus) ||
      !['pending_w0', 'ready_for_processing', 'processing', 'error', 'error_requires_manual_review', 'done', 'completed']
        .includes(row.execution_status as string) ||
      (row.execution_status === 'pending_w0' && !csvRowHasProgress(row) && !present(row.next_workflow))) {
    fail('Unclassified Amazon stored workflow state');
  }
  // Inspection grants no write or dispatch authority, including when the row has frozen progress.
  return 'preserved';
}
export type CsvUnitDescriptor = {
  orderId: string; lineItem: Row; lineItems?: Row[]; unitIndex: number; unitCount: number; itemKey: string | null;
  selection?: CsvResolvedItemSelection;
};
function physicalId(row: Row): number {
  if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0) fail('CSV row requires an unambiguous database row ID');
  return row.id;
}
function csvSourceIdentity(item: Row) {
    const id = item.order_item_id;
    if (present(id) && id !== '' && (!text(id) || id !== id.trim())) fail('Invalid Amazon source item identity');
    const url = item.customization_url;
    if (present(url) && url !== '' && !text(url)) fail('Invalid Amazon customization identity');
    const stableUrl = typeof url === 'string' && url ? canonicalCsvCustomizationIdentity(url) : null;
    const hash = stableUrl ? createHash('sha256').update(stableUrl).digest('hex').slice(0, 12) : null;
    const itemId = typeof id === 'string' && id ? id : null;
    if (!itemId && !hash) fail('Missing Amazon source item identity');
    return { key: JSON.stringify(itemId ? ['item', itemId] : ['custom', hash]), itemId, hash };
}
function readCsvUnitField(sources: Row[], aliases: string[]): unknown {
      const values = sources.flatMap(source => aliases.filter(key => Object.hasOwn(source, key) && source[key] !== undefined).map(key => source[key]));
      if (values.some(value => !isDeepStrictEqual(value, values[0]))) fail('Conflicting Amazon unit context');
      return values[0];
}
function sameUnit(row: Row, unit: CsvUnitDescriptor): boolean {
  const sources = carriers(row, true), line = readCsvUnitField(sources, ['line_item', 'lineItem']);
  if (!record(line)) return false;
  const actual = csvSourceIdentity(line), planned = csvSourceIdentity(unit.lineItem);
  for (const source of sources) {
    if (present(source.quantity) && source.quantity !== 1) fail('Conflicting CSV physical book quantity');
    for (const key of ['_order_item_id', 'order_item_id']) {
      if (present(source[key]) && source[key] !== '' && source[key] !== actual.itemId) fail('Conflicting CSV source item alias');
    }
    if (present(source._customized_url_hash) && source._customized_url_hash !== actual.hash) fail('Conflicting CSV customization alias');
  }
  return actual.key === planned.key && actual.itemId === planned.itemId && actual.hash === planned.hash &&
    readCsvUnitField(sources, ['_quantity_unit_index', 'unitIndex']) === unit.unitIndex &&
    readCsvUnitField(sources, ['_quantity_unit_count', 'unitCount']) === unit.unitCount &&
    line.source_quantity === unit.unitCount && line.quantity_unit_index === unit.unitIndex && line.quantity === 1 &&
    isDeepStrictEqual(line.sku, unit.lineItem.sku) && isDeepStrictEqual(line.product_name, unit.lineItem.product_name);
}
export function isPurePlaceholder(row: Row, rootId: string): boolean {
  if ((row.orderId ?? row.order_id) !== rootId) return false;
  if (['character_specs', 'characterSpecs', 'CharacterSpecs', 'character_hash', 'characterHash', 'dedication_text', 'dedication', 'Dedication']
      .some(key => present(row[key]))) return false;
  if (present(row.book_specs) || Object.hasOwn(row, 'bookSpecs') || Object.hasOwn(row, 'productInfo')) return false;
  if ([...BOOK_FIELDS, ...FORMAT_FIELDS, ...VERSION_FIELDS].some(key =>
      Object.hasOwn(row, key) && (present(row[key]) || (!DB_NULLABLE.has(key) && row[key] === null)))) return false;
  const info = row.product_info;
  if (!record(info) || info._customization_missing !== true || info._retry_on_next_cron !== true ||
      Object.keys(info).some(key => !['_customization_missing', '_retry_on_next_cron'].includes(key))) return false;
  return !carriers(row, true).some(item => (present(item.quantity) && item.quantity !== 1) ||
    [...BOOK_FIELDS, ...FORMAT_FIELDS, ...VERSION_FIELDS].some(key => present(item[key])));
}
export async function readCsvRootRows(db: SupabaseClient, rootId: string, units: Pick<CsvUnitDescriptor, 'orderId'>[]): Promise<Row[]> {
  const rows = new Map<number, Row>();
  const add = (row: Row) => {
    const id = physicalId(row);
    const prior = rows.get(id);
    if (prior && !isDeepStrictEqual(prior, row)) fail('CSV row changed during identity lookup');
    rows.set(id, row);
  };
  let rootColumns = 0;
  for (const column of ['root_order_id', 'amazon_order_id']) {
    const result = await db.from('orders').select('*').eq(column, rootId).limit(201);
    if (result.error?.code === '42703') continue;
    if (result.error) throw result.error;
    rootColumns++;
    if (!Array.isArray(result.data) || result.data.length >= 201) fail('CSV root membership is incomplete');
    result.data.forEach(add);
  }
  if (!rootColumns) fail('CSV root membership columns are unavailable');
  for (const unit of units) {
    let exactColumns = 0;
    for (const column of ['orderId', 'order_id']) {
      const result = await db.from('orders').select('*').eq(column, unit.orderId).limit(2);
      if (result.error?.code === '42703') continue;
      if (result.error) throw result.error;
      exactColumns++;
      if (!Array.isArray(result.data) || result.data.length > 1) fail('Ambiguous CSV per-item identity');
      result.data.forEach(add);
    }
    if (!exactColumns) fail('CSV per-item identity columns are unavailable');
  }
  return [...rows.values()];
}

// A stored root can dispatch only after every declared physical unit exists.
export function assertCompleteCsvRootUnits(rows: Row[], rootId: string): void {
  if (!csvRootNeedsCompleteUnits(rows)) return;
  const itemSelections = rows.some(csvRowHasItemBookSelections);
  if (!rows.length || rows.length > 200) fail('Incomplete Amazon root unit partition');
  const positive = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 200;

  const expected = new Map<string, { count: number; signature: unknown[] }>();
  const actual = new Set<string>();
  const ids = new Set<string>(), physicalIds = new Set<number>();
  for (const row of rows) {
    const id = row.orderId ?? row.order_id;
    const databaseId = physicalId(row);
    if (!text(id) || id !== id.trim() || ids.has(id) || physicalIds.has(databaseId) ||
        [row.orderId, row.order_id].some(value => present(value) && value !== id)) fail('Ambiguous Amazon root book identity');
    ids.add(id); physicalIds.add(databaseId);
    if (row.platform !== 'amazon' || ![row.root_order_id, row.amazon_order_id].includes(rootId) ||
        [row.root_order_id, row.amazon_order_id, row.rootOrderId, row.amazonOrderId]
          .some(value => present(value) && value !== rootId)) fail('Conflicting Amazon root identity');
    const sources = carriers(row, true);
    if (itemSelections) {
      const tuple = validateCsvItemBookRow(row);
      if (!tuple) fail('Missing mixed Amazon item book declaration');
      assertTuple(row, tuple);
    }
    if (sources.some(source => present(source.quantity) && source.quantity !== 1)) fail('Conflicting Amazon physical book quantity');
    for (const source of sources) for (const key of ['_parent_root_order_id', '_parent_amazon_order_id', '_root_order_id']) {
      if (present(source[key]) && source[key] !== rootId) fail('Conflicting Amazon parent identity');
    }

    const line = readCsvUnitField(sources, ['line_item', 'lineItem']), items = readCsvUnitField(sources, ['line_items', 'items', 'lineItems']);
    const index = readCsvUnitField(sources, ['_quantity_unit_index', 'unitIndex']), count = readCsvUnitField(sources, ['_quantity_unit_count', 'unitCount']);
    if (!record(line) || !Array.isArray(items) || !items.length || items.length > 200 ||
        !positive(index) || !positive(count) || index > count || line.quantity !== 1 ||
        line.source_quantity !== count || line.quantity_unit_index !== index ||
        (present(row.quantity) && row.quantity !== 1)) fail('Invalid Amazon root unit context');
    const unit = csvSourceIdentity(line);
    for (const source of sources) {
      for (const alias of ['_order_item_id', 'order_item_id']) {
        if (present(source[alias]) && source[alias] !== '' && source[alias] !== unit.itemId) fail('Conflicting Amazon source item identity');
      }
      if (present(source._customized_url_hash) && source._customized_url_hash !== unit.hash) fail('Conflicting Amazon customization identity');
    }
    const declared = new Set<string>();
    let selected = false;
    for (const item of items) {
      if (!record(item) || !positive(item.quantity)) fail('Invalid Amazon source quantity');
      const source = csvSourceIdentity(item);
      if (declared.has(source.key)) fail('Duplicate Amazon source item declaration');
      declared.add(source.key);
      const signature = [source.itemId, source.hash, item.sku, item.product_name, item.quantity,
        ...(itemSelections ? [item.bookSelection] : [])];
      const prior = expected.get(source.key);
      if (prior && !isDeepStrictEqual(prior.signature, signature)) fail('Conflicting Amazon source item partition');
      expected.set(source.key, { count: item.quantity, signature });
      if (source.key === unit.key) {
        if (!isDeepStrictEqual(signature, [unit.itemId, unit.hash, line.sku, line.product_name, count,
          ...(itemSelections ? [line.bookSelection] : [])])) fail('Conflicting Amazon unit descriptor');
        selected = true;
      }
    }
    if (!selected) fail('Missing Amazon unit source declaration');
    const unitKey = JSON.stringify([unit.key, index]);
    if (actual.has(unitKey)) fail('Duplicate Amazon physical unit');
    actual.add(unitKey);
    let total = 0;
    for (const item of expected.values()) total += item.count;
    if (total > 200) fail('Amazon root exceeds supported unit count');
  }
  let total = 0;
  for (const [key, item] of expected) {
    total += item.count;
    for (let index = 1; index <= item.count; index++) {
      if (!actual.has(JSON.stringify([key, index]))) fail('Incomplete Amazon root unit partition');
    }
  }
  if (actual.size !== total) fail('Unexpected Amazon root units');
}

export type CsvRootPlan = {
  units: CsvUnitDescriptor[]; matches: Map<string, Row>; placeholderOrderId: string | null;
  dispositions: Map<string, CsvExistingMemberDisposition>;
};
export function reconcileCsvRoot(rows: Row[], rootId: string, submitted: CsvUnitDescriptor[], selection?: CsvBookSelection,
  itemSelections?: Map<string, CsvResolvedItemSelection>, options: CsvExistingMemberOptions = {}): CsvRootPlan {
  if (selection && itemSelections) fail('CSV root cannot combine file-wide and per-item selections');
  if (!itemSelections && (rows.some(csvRowHasItemBookSelections) || submitted.some(unit => csvHasItemBookSelections([{ line_item: unit.lineItem, line_items: unit.lineItems }])))) {
    fail('This root requires its original per-item book declarations');
  }
  const units = submitted.map(unit => itemSelections ? { ...unit,
    selection: itemSelections.get(csvItemBookChoiceKey(rootId, unit.lineItem)) } : { ...unit });
  const matches = new Map<string, Row>();
  const dispositions = new Map<string, CsvExistingMemberDisposition>();
  if (options.existingMemberPolicy === 'inspect-preserved' && !selection && !itemSelections) {
    fail('Amazon preserved inspection requires canonical selected-book context');
  }
  if (new Set(units.map(unit => unit.orderId)).size !== units.length) fail('Duplicate CSV per-unit identity');
  if (!selection && !itemSelections) {
    if (rows.some(csvRowDeclaresInnerVoice)) fail('This Amazon root contains Inner Voice; use its complete selected-book intake');
    return { units, matches, placeholderOrderId: null, dispositions };
  }
  if (!units.length || units.length > 200) fail('CSV root exceeds supported unit count');
  const declarations = new Map<string, { signature: unknown[]; count: number; indices: Set<number> }>();
  for (const unit of units) {
    const source = csvSourceIdentity(unit.lineItem);
    const key = source.itemId ? `item:${source.itemId}` : `custom:${source.hash}`;
    if (unit.itemKey !== key || !Number.isSafeInteger(unit.unitCount) || unit.unitCount < 1 || unit.unitCount > 200 ||
        !Number.isSafeInteger(unit.unitIndex) || unit.unitIndex < 1 || unit.unitIndex > unit.unitCount ||
        unit.lineItem.quantity !== 1 || unit.lineItem.source_quantity !== unit.unitCount || unit.lineItem.quantity_unit_index !== unit.unitIndex) fail('Invalid CSV item descriptor');
    if (itemSelections) {
      if (!unit.selection) fail('Missing resolved CSV per-item selection');
      assertCsvItemBookTuple(unit.selection.tuple);
      if (!isDeepStrictEqual(unit.lineItem.bookSelection, unit.selection.tuple) ||
          !validateCsvItemBookContext([{ line_item: unit.lineItem, line_items: unit.lineItems }], unit.selection.tuple)) {
        fail('CSV unit differs from its resolved item book');
      }
    }
    const signature = [source.itemId, source.hash, unit.lineItem.sku, unit.lineItem.product_name, unit.unitCount,
      ...(itemSelections ? [unit.selection!.tuple] : [])];
    const prior = declarations.get(source.key);
    if (prior && (!isDeepStrictEqual(prior.signature, signature) || prior.indices.has(unit.unitIndex))) fail('Conflicting or duplicate CSV item descriptor');
    const declaration = prior ?? { signature, count: unit.unitCount, indices: new Set<number>() };
    declaration.indices.add(unit.unitIndex); declarations.set(source.key, declaration);
  }
  for (const declaration of declarations.values()) if (declaration.indices.size !== declaration.count) fail('Incomplete CSV source quantity partition');
  if (itemSelections) {
    if (itemSelections.size !== declarations.size) fail('Unexpected resolved CSV source books');
    for (const unit of units) {
      const items = unit.lineItems;
      if (!Array.isArray(items) || items.length !== declarations.size) fail('Incomplete mixed CSV aggregate');
      const seen = new Set<string>();
      for (const item of items) {
        const source = csvSourceIdentity(item), expected = declarations.get(source.key);
        if (!expected || seen.has(source.key) || !isDeepStrictEqual(expected.signature,
            [source.itemId, source.hash, item.sku, item.product_name, item.quantity, item.bookSelection])) fail('Mixed CSV aggregate differs from resolved unit partition');
        seen.add(source.key);
      }
    }
  }
  let placeholderOrderId: string | null = null;
  const used = new Set<CsvUnitDescriptor>();
  const originalDeclarations = new Set<string>();
  let originalItems: Row[] | undefined;
  for (const row of rows) {
    physicalId(row);
    const id = row.orderId ?? row.order_id;
    if (!text(id) || id !== id.trim()) fail('Missing CSV per-book identity');
    const placeholder = isPurePlaceholder(row, rootId);
    const disposition = placeholder ? (assertInitial(row, rootId, id), 'initial')
      : inspectCsvExistingMember(row, rootId, id, options);
    let unit: CsvUnitDescriptor;
    if (placeholder) {
      if (rows.length !== 1) fail('CSV placeholder must be the sole existing root member');
      unit = units.reduce((first, item) => item.orderId < first.orderId ? item : first);
      placeholderOrderId = rootId;
    } else {
      if (!itemSelections) assertTuple(row, selection!);
      const candidates = units.filter(item => sameUnit(row, item));
      if (candidates.length !== 1) fail('CSV original line-item or quantity partition changed');
      unit = candidates[0];
      if (itemSelections && !validateCsvItemBookRow(row, unit.selection!.tuple)) fail('Missing original CSV per-item selection');
      const items = readCsvUnitField(carriers(row, true), ['line_items', 'items', 'lineItems']);
      if (!Array.isArray(items) || !items.length || items.length > 200) fail('Missing CSV original source declarations');
      const seen = new Set<string>();
      for (const item of items) {
        if (!record(item)) fail('Malformed CSV original source declaration');
        const source = csvSourceIdentity(item), planned = declarations.get(source.key);
        if (!planned || seen.has(source.key) || !isDeepStrictEqual(planned.signature,
            [source.itemId, source.hash, item.sku, item.product_name, item.quantity,
              ...(itemSelections ? [item.bookSelection] : [])])) fail('CSV original source partition changed');
        seen.add(source.key); originalDeclarations.add(source.key);
      }
      if (!seen.has(csvSourceIdentity(unit.lineItem).key)) fail('Missing CSV original unit source declaration');
      if (itemSelections) {
        if (originalItems && !isDeepStrictEqual(originalItems, items)) fail('Conflicting mixed CSV original aggregates');
        originalItems = items as Row[];
      }
      const originalLine = readCsvUnitField(carriers(row, true), ['line_item', 'lineItem']);
      if (!record(originalLine)) fail('Missing CSV original line item');
      unit.lineItem = { ...originalLine };
      unit.lineItems = items.map(item => ({ ...(item as Row) }));
    }
    if (used.has(unit) || matches.has(id)) fail('CSV root has duplicate existing units');
    used.add(unit); unit.orderId = id; matches.set(id, row); dispositions.set(id, disposition);
  }
  if (originalDeclarations.size && originalDeclarations.size !== declarations.size) fail('CSV original source partition changed');
  if (itemSelections && originalItems) for (const unit of units) {
    if (used.has(unit)) continue;
    const key = csvSourceIdentity(unit.lineItem).key;
    const source = originalItems.find(item => csvSourceIdentity(item).key === key);
    if (!source) fail('Missing original mixed CSV unit declaration');
    unit.lineItem = { ...source, quantity: 1, source_quantity: unit.unitCount, quantity_unit_index: unit.unitIndex };
    unit.lineItems = originalItems.map(item => ({ ...item }));
  }
  if (new Set(units.map(unit => unit.orderId)).size !== units.length) fail('CSV final per-book identity collision');
  return { units, matches, placeholderOrderId, dispositions };
}
export async function resolveCsvOriginalContext(selection: CsvBookSelection, unit: CsvUnitDescriptor, existing: Row | undefined,
  parsed: Row | null, rootId: string, bindPlaceholder = false): Promise<{ specs: Row; hash: string }> {
  const config = selectedConfigs.get(selection);
  if (!config) fail('CSV selection is not bound to a published config');
  const { assertBookIntakeLimits } = await import('@/lib/books/book-legacy-compatibility');
  let specs = parsed;
  if (bindPlaceholder && (!existing || unit.orderId !== rootId || !isPurePlaceholder(existing, rootId))) fail('Invalid CSV placeholder binding decision');
  if (bindPlaceholder) assertInitial(existing!, rootId, rootId);
  const placeholder = bindPlaceholder;
  if (existing && !placeholder) {
    const original = existing.character_specs;
    if (!record(original) || !Object.keys(original).length) fail('Missing original CSV character specs');
    for (const key of ['characterSpecs', 'CharacterSpecs']) {
      if (Object.hasOwn(existing, key) && !isDeepStrictEqual(existing[key], original)) fail('Conflicting original CSV character specs');
    }
    if (typeof existing.character_hash !== 'string' || existing.character_hash !== calculateCharacterHash(original, unit.orderId)) {
      fail('Invalid original CSV order-scoped character hash');
    }
    for (const key of ['characterHash']) {
      if (Object.hasOwn(existing, key) && existing[key] !== existing.character_hash) fail('Conflicting original CSV character hash');
    }
    if (parsed && !isDeepStrictEqual(JSON.parse(JSON.stringify(parsed)), original)) fail('CSV customization differs from original character specs');
    specs = original;
  }
  if (!record(specs) || !Object.keys(specs).length || !text(specs.childName) || !present(specs.age)) fail('Missing CSV character customization');
  const dedicationText = specs.dedication;
  if (present(dedicationText) && typeof dedicationText !== 'string') fail('Malformed CSV dedication');
  if (existing && !placeholder && present(existing.dedication_text) && existing.dedication_text !== dedicationText) fail('Conflicting original CSV dedication');
  assertBookIntakeLimits(config, { characterSpecs: specs, dedicationText: dedicationText as string | null | undefined });
  return { specs, hash: calculateCharacterHash(specs, unit.orderId) };
}
export async function updateExactCsvRow(db: SupabaseClient, row: Row, requestedId: string, updates: Row, initialOnly = false): Promise<void> {
  const id = physicalId(row);
  if ((present(row.orderId) && row.orderId !== requestedId) || (present(row.order_id) && row.order_id !== requestedId) ||
      (row.orderId !== requestedId && row.order_id !== requestedId)) fail('CSV update target does not match the requested item');
  if (!text(row.updated_at)) fail('CSV update requires its original updated_at revision');
  let query = db.from('orders').update(updates).eq('id', id).eq('updated_at', row.updated_at);
  if (initialOnly) query = query.eq('status', 'new').eq('execution_status', 'pending_w0')
    .is('next_workflow', null).is('workflow_step', null).is('one_manifest_url', null);
  if (text(row.orderId)) query = query.eq('orderId', row.orderId);
  if (text(row.order_id)) query = query.eq('order_id', row.order_id);
  const result = await query.select('id').single();
  if (result.error) throw result.error;
  if (result.data?.id !== id) fail('CSV update did not return the validated row');
}

// Replacement admission verifies listing and original sale provenance before selection.
export const AMAZON_REPLACEMENT_ASIN = 'B0G4QPLWKH';
export const AMAZON_REPLACEMENT_SKU = 'KE-3QPF-VN03';
export const AMAZON_REPLACEMENT_MARKETPLACE = 'ATVPDKIKX0DER';
export type AmazonReplacementAuthority = Readonly<{
  rootId: string;
  marketplaceId: typeof AMAZON_REPLACEMENT_MARKETPLACE;
  purchaseDate: string;
  purchaseTimestamp: number;
}>;
export type AmazonReplacementItemAuthority = Readonly<{
  itemKey: string;
  source: CsvItemBookChoice['source'];
  quantity: number;
  asin?: typeof AMAZON_REPLACEMENT_ASIN;
  sku?: typeof AMAZON_REPLACEMENT_SKU;
}>;
const amazonReplacementAuthorities = new WeakSet<AmazonReplacementAuthority>();
const amazonReplacementItemSets = new WeakSet<readonly AmazonReplacementItemAuthority[]>();

function amazonReplacementValues(sources: readonly Row[], aliases: readonly string[]): unknown[] {
  if (!Array.isArray(sources) || sources.length === 0 || !Array.from(sources).every(record)) {
    throw new CsvBookSelectionError('Missing Amazon source authority');
  }
  return sources.flatMap(source => aliases.filter(key => Object.hasOwn(source, key) && source[key] !== undefined)
    .map(key => source[key]));
}
function amazonReplacementText(values: unknown[], label: string, required = true): string | undefined {
  if (!values.length) {
    if (required) throw new CsvBookSelectionError(`Missing Amazon ${label}`);
    return undefined;
  }
  if (values.some(value => typeof value !== 'string' || !value || value !== value.trim() ||
      /[\u0000-\u001f\u007f]/.test(value) || value !== values[0])) {
    throw new CsvBookSelectionError(`Conflicting or invalid Amazon ${label}`);
  }
  return values[0] as string;
}
function amazonReplacementTime(value: unknown, label: string, utcOnly = false): number {
  if (typeof value !== 'string' || value !== value.trim()) throw new CsvBookSelectionError(`Invalid Amazon ${label}`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || (utcOnly && match[8] !== 'Z')) throw new CsvBookSelectionError(`Invalid Amazon ${label}`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'));
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day); wall.setUTCHours(hour, minute, second, millisecond);
  if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day ||
      wall.getUTCHours() !== hour || wall.getUTCMinutes() !== minute || wall.getUTCSeconds() !== second ||
      wall.getUTCMilliseconds() !== millisecond) throw new CsvBookSelectionError(`Invalid Amazon ${label}`);
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);
  if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
    throw new CsvBookSelectionError(`Invalid Amazon ${label}`);
  }
  const offset = (offsetHour * 60 + offsetMinute) * 60000 * (match[9] === '-' ? -1 : 1);
  const timestamp = wall.getTime() - offset;
  const utcYear = new Date(timestamp).getUTCFullYear();
  if (!Number.isSafeInteger(timestamp) || utcYear < 0 || utcYear > 9999) throw new CsvBookSelectionError(`Invalid Amazon ${label}`);
  return timestamp;
}

export function readAmazonReplacementAuthority(
  rootId: string,
  originalSources: readonly Row[],
  pollingMarketplace?: unknown,
): AmazonReplacementAuthority {
  const roots = amazonReplacementValues(originalSources, ['AmazonOrderId', 'amazonOrderId', 'amazon_order_id', 'root_order_id', 'rootOrderId']);
  if (typeof rootId !== 'string' || !rootId || rootId !== rootId.trim() || rootId.length > 200 ||
      /[\u0000-\u0020\u007f]/.test(rootId) || /[/?#\\]|\.\./.test(rootId) || amazonReplacementText(roots, 'root identity') !== rootId) {
    throw new CsvBookSelectionError('Conflicting or invalid Amazon root identity');
  }
  const marketplaces = amazonReplacementValues(originalSources, ['MarketplaceId', 'marketplaceId', 'marketplace_id']);
  if (pollingMarketplace !== undefined) marketplaces.push(pollingMarketplace);
  if (amazonReplacementText(marketplaces, 'marketplace') !== AMAZON_REPLACEMENT_MARKETPLACE) {
    throw new CsvBookSelectionError('Unsupported Amazon replacement marketplace');
  }
  const purchases = amazonReplacementValues(originalSources, ['PurchaseDate', 'purchaseDate', 'purchase_date', 'orderDate']);
  if (!purchases.length) throw new CsvBookSelectionError('Missing Amazon original purchase date');
  const timestamps = purchases.map(value => amazonReplacementTime(value, 'original purchase date'));
  if (timestamps.some(value => value !== timestamps[0])) throw new CsvBookSelectionError('Conflicting Amazon original purchase date');
  const authority: AmazonReplacementAuthority = Object.freeze({ rootId, marketplaceId: AMAZON_REPLACEMENT_MARKETPLACE,
    purchaseDate: new Date(timestamps[0]).toISOString(), purchaseTimestamp: timestamps[0] });
  amazonReplacementAuthorities.add(authority);
  return authority;
}

export function readAmazonReplacementItems(
  itemSources: readonly (readonly Row[])[],
): readonly AmazonReplacementItemAuthority[] {
  if (!Array.isArray(itemSources) || itemSources.length === 0 || itemSources.length > 2000) {
    throw new CsvBookSelectionError('Missing or excessive Amazon source items');
  }
  const keys = new Set<string>(); let quantity = 0;
  const items = Array.from(itemSources, sources => {
    const asin = amazonReplacementText(amazonReplacementValues(sources, ['ASIN', 'asin']), 'ASIN', false);
    const sku = amazonReplacementText(amazonReplacementValues(sources, ['SellerSKU', 'sellerSku', 'sku', 'seller_sku']), 'SKU', false);
    if ((!asin && !sku) || (asin !== undefined && asin !== AMAZON_REPLACEMENT_ASIN) ||
        (sku !== undefined && sku !== AMAZON_REPLACEMENT_SKU)) throw new CsvBookSelectionError('Unsupported Amazon replacement listing');
    const id = amazonReplacementText(amazonReplacementValues(sources, ['OrderItemId', 'orderItemId', 'order_item_id']), 'source item ID', false);
    if (id !== undefined && /[/?#\\]|\.\./.test(id)) throw new CsvBookSelectionError('Invalid canonical Amazon source item ID');
    const url = amazonReplacementText(amazonReplacementValues(sources, ['customization_url', 'customizationUrl']), 'customization URL', false);
    const amounts = amazonReplacementValues(sources, ['QuantityOrdered', 'quantity', 'quantity_purchased']);
    if (!amounts.length || amounts.some(value => typeof value !== 'number' || !Number.isSafeInteger(value) ||
        value < 1 || value > 200 || value !== amounts[0])) throw new CsvBookSelectionError('Invalid Amazon source quantity');
    const amount = amounts[0] as number; quantity += amount;
    if (quantity > 200) throw new CsvBookSelectionError('An Amazon order cannot exceed 200 books in this intake');
    const identity = csvSourceIdentity({ ...(id === undefined ? {} : { order_item_id: id }),
      ...(url === undefined ? {} : { customization_url: url }) });
    if (keys.has(identity.key)) throw new CsvBookSelectionError('Duplicate Amazon source item');
    keys.add(identity.key);
    const source: CsvItemBookChoice['source'] = identity.itemId
      ? Object.freeze({ kind: 'order-item-id', value: identity.itemId })
      : Object.freeze({ kind: 'customization-key', value: identity.hash as string });
    return Object.freeze({ itemKey: identity.key, source, quantity: amount,
      ...(asin === undefined ? {} : { asin: AMAZON_REPLACEMENT_ASIN }),
      ...(sku === undefined ? {} : { sku: AMAZON_REPLACEMENT_SKU }) });
  });
  const result = Object.freeze(items);
  amazonReplacementItemSets.add(result);
  return result;
}

function assertAmazonReplacementOriginalStub(authority: AmazonReplacementAuthority, rows: readonly Row[]): void {
  if (!amazonReplacementAuthorities.has(authority) || !Array.isArray(rows) || rows.length > 1) {
    throw new CsvBookSelectionError('Invalid fresh Amazon root authority');
  }
  for (const row of rows) {
    if (!record(row) || !isPurePlaceholder(row, authority.rootId)) {
      throw new CsvBookSelectionError('Existing Amazon root requires its frozen original context');
    }
    physicalId(row); assertInitial(row, authority.rootId, authority.rootId);
    const stored = readAmazonReplacementAuthority(authority.rootId, [row]);
    if (stored.purchaseTimestamp !== authority.purchaseTimestamp || stored.marketplaceId !== authority.marketplaceId) {
      throw new CsvBookSelectionError('Amazon stub original purchase or marketplace changed');
    }
  }
}

export function buildFreshAmazonReplacementChoices(
  authority: AmazonReplacementAuthority,
  items: readonly AmazonReplacementItemAuthority[],
  originalRows: readonly Row[],
  cutoverAt: unknown,
): readonly CsvItemBookChoice[] {
  assertAmazonReplacementOriginalStub(authority, originalRows);
  if (!amazonReplacementItemSets.has(items)) throw new CsvBookSelectionError('Unverified Amazon source item set');
  const cutoff = amazonReplacementTime(cutoverAt, 'replacement cutover', true);
  if (authority.purchaseTimestamp < cutoff) throw new CsvBookSelectionError('Historical Amazon sale requires explicit book assignment', 409);
  return Object.freeze(items.map(item => Object.freeze({ rootOrderId: authority.rootId, source: item.source,
    bookId: CSV_INNER_VOICE_BOOK_ID, formatId: 'amazon' as const })));
}

export function assertAmazonUnclassifiedStubAdmission(
  authority: AmazonReplacementAuthority,
  originalRows: readonly Row[],
  items: readonly AmazonReplacementItemAuthority[] | undefined,
  customizationMissing: boolean,
): void {
  assertAmazonReplacementOriginalStub(authority, originalRows);
  if (typeof customizationMissing !== 'boolean' ||
      (items !== undefined && (!amazonReplacementItemSets.has(items) || customizationMissing !== true))) {
    throw new CsvBookSelectionError('Amazon unclassified stub requires absent items or missing customization');
  }
  // No book selection, character hash, published config or W0 call occurs here.
}
