import { isDeepStrictEqual } from 'node:util';
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
const PROGRESS_FIELDS = ['one_manifest_url', 'oneManifestUrl', 'oneManifestKey', 'print_manifest_key',
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
export function csvRowDeclaresInnerVoice(row: Row): boolean {
  return carriers(row, false).some(item => BOOK_FIELDS.some(key => typeof item[key] === 'string' &&
      (item[key] as string).trim() === CSV_INNER_VOICE_BOOK_ID) ||
    [...collectOrderPathLikes(item), ...collectOrderPathLikes({ product_info: item }),
      ...collectOrderPathLikes({ bookContext: item }),
      ...PROGRESS_FIELDS.flatMap(key => typeof item[key] === 'string' ? [item[key] as string] : [])]
      .some(value => extractBookIdFromOrderPathLike(value) === CSV_INNER_VOICE_BOOK_ID ||
        extractBookIdFromPathLike(value) === CSV_INNER_VOICE_BOOK_ID));
}
function assertTuple(row: Row, selection: CsvBookSelection): void {
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
function assertInitial(row: Row, rootId: string, orderId: string): void {
  if (row.platform !== 'amazon' || row.status !== 'new' || row.execution_status !== 'pending_w0' ||
      present(row.next_workflow) || present(row.workflow_step) || present(row.current_workflow)) fail('CSV row has progressed beyond initial intake');
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
  for (const item of carriers(row, true)) for (const key of [...PROGRESS_FIELDS, ...CONTEXT_FIELDS, '__meta']) {
    if (present(item[key])) fail(`CSV row has frozen or progressed context: ${key}`);
  }
}
export type CsvUnitDescriptor = {
  orderId: string; lineItem: Row; unitIndex: number; unitCount: number; itemKey: string | null;
};
function physicalId(row: Row): number {
  if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0) fail('CSV row requires an unambiguous database row ID');
  return row.id;
}
function sameUnit(row: Row, unit: CsvUnitDescriptor): boolean {
  const info = row.product_info;
  if (!record(info) || !record(info.line_item)) return false;
  return info._quantity_unit_index === unit.unitIndex && info._quantity_unit_count === unit.unitCount &&
    (text(info.line_item.order_item_id) ? `item:${info.line_item.order_item_id}` :
      text(info._customized_url_hash) ? `custom:${info._customized_url_hash}` : null) === unit.itemKey &&
    info.line_item.source_quantity === unit.unitCount && info.line_item.quantity_unit_index === unit.unitIndex &&
    info.line_item.quantity === 1 && info.line_item.sku === unit.lineItem.sku &&
    info.line_item.product_name === unit.lineItem.product_name;
}
function isPurePlaceholder(row: Row, rootId: string, units: CsvUnitDescriptor[]): boolean {
  if (units.length !== 1 || units[0].orderId !== rootId) return false;
  if (['character_specs', 'characterSpecs', 'CharacterSpecs', 'character_hash', 'characterHash', 'dedication_text', 'dedication', 'Dedication']
      .some(key => present(row[key]))) return false;
  if (present(row.book_specs) || Object.hasOwn(row, 'bookSpecs') || Object.hasOwn(row, 'productInfo')) return false;
  if ([...BOOK_FIELDS, ...FORMAT_FIELDS, ...VERSION_FIELDS].some(key =>
      Object.hasOwn(row, key) && (present(row[key]) || (!DB_NULLABLE.has(key) && row[key] === null)))) return false;
  const info = row.product_info;
  if (!record(info) || info._customization_missing !== true || info._retry_on_next_cron !== true ||
      Object.keys(info).some(key => !['_customization_missing', '_retry_on_next_cron'].includes(key))) return false;
  return !carriers(row, true).some(item => [...BOOK_FIELDS, ...FORMAT_FIELDS, ...VERSION_FIELDS].some(key => present(item[key])));
}
export async function readCsvRootRows(db: SupabaseClient, rootId: string, units: CsvUnitDescriptor[]): Promise<Row[]> {
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
export function reconcileCsvRoot(rows: Row[], rootId: string, units: CsvUnitDescriptor[], selection?: CsvBookSelection): Map<string, Row> {
  if (new Set(units.map(unit => unit.orderId)).size !== units.length) fail('Duplicate CSV per-unit identity');
  if (selection && (units.some(unit => !unit.itemKey) ||
      new Set(units.map(unit => `${unit.itemKey}/${unit.unitIndex}`)).size !== units.length)) fail('Missing or duplicate CSV item descriptor');
  const matches = new Map<string, Row>();
  for (const row of rows) {
    if (!selection) {
      if (csvRowDeclaresInnerVoice(row)) fail('This Amazon root contains Inner Voice; use its complete selected-book intake');
      continue;
    }
    const unit = units.find(item => row.orderId === item.orderId || row.order_id === item.orderId);
    if (!unit || matches.has(unit.orderId)) fail('CSV root has unmatched or duplicate existing units');
    assertInitial(row, rootId, unit.orderId);
    if (!isPurePlaceholder(row, rootId, units)) {
      assertTuple(row, selection);
      if (!sameUnit(row, unit)) fail('CSV original line-item or quantity partition changed');
    }
    matches.set(unit.orderId, row);
  }
  return matches;
}
export async function resolveCsvOriginalContext(selection: CsvBookSelection, unit: CsvUnitDescriptor, existing: Row | undefined,
  parsed: Row | null, rootId: string, totalUnits: number): Promise<{ specs: Row; hash: string }> {
  const config = selectedConfigs.get(selection);
  if (!config) fail('CSV selection is not bound to a published config');
  const { assertBookIntakeLimits } = await import('@/lib/books/book-legacy-compatibility');
  let specs = parsed;
  const placeholder = existing && isPurePlaceholder(existing, rootId, totalUnits === 1 ? [unit] : []);
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
