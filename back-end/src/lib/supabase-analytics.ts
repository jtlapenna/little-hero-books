import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  AnalyticsOrderClassification,
  classifyAnalyticsOrder,
  extractBookId,
  getCanonicalGroupKey,
} from './analytics-helpers';

export type AnalyticsHistoryScope = 'all' | 'live' | 'archived';
export type AnalyticsRecordSource = 'orders' | 'archived_orders';
export type AnalyticsSourcePresence = 'live' | 'archived' | 'both';

export interface AnalyticsFilters {
  startDate: string;
  endDate: string;
  isTest?: boolean;
  bookId?: string;
  historyScope?: AnalyticsHistoryScope;
}

export interface AnalyticsReportingRow {
  id: number | string;
  record_source: AnalyticsRecordSource;
  platform: string | null;
  orderId: string | null;
  display_order_id: string | null;
  root_order_id: string | null;
  amazon_order_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  lulu_job_id: string | null;
  lulu_status: string | null;
  print_submitted_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  assumed_delivered_at: string | null;
  lifecycle_status: string | null;
  created_at: string | null;
  purchase_date: string | null;
  updated_at: string | null;
  queued_at: string | null;
  started_at: string | null;
  status: string | null;
  execution_status: string | null;
  error_type: string | null;
  error_message: string | null;
  retry_count: number | null;
  regeneration_attempt: number | null;
  character_specs: Record<string, unknown> | null;
  book_specs: Record<string, unknown> | null;
  one_manifest_url: string | null;
  manifest_2a_url: string | null;
  manifest_2b_url: string | null;
  manifest_3_url: string | null;
  previous_character_images: unknown[] | null;
  rejection_history: unknown[] | null;
  workflow_step: string | null;
  current_workflow: string | null;
  next_workflow: string | null;
  customer_approval_status: string | null;
  customer_approval_requested_at: string | null;
  customer_approval_approved_at: string | null;
  review_stages: {
    preBria?: { status?: string };
    postBria?: { status?: string };
    postPdf?: { status?: string };
  } | null;
}

export interface AnalyticsCanonicalOrder extends AnalyticsReportingRow {
  source_presence: AnalyticsSourcePresence;
  classification: AnalyticsOrderClassification;
  classification_reason: string;
  dedupe_key: string;
  canonical_group_key: string | null;
  duplicate_row_count: number;
  duplicate_source_ids: Array<number | string>;
  is_multi_item_order: boolean;
  item_count_in_group: number;
}

export type AnalyticsReportingRecord = AnalyticsCanonicalOrder;

type SourceOrderRecord = Record<string, unknown>;

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function normalizeReportingRecord(
  row: SourceOrderRecord,
  source: AnalyticsRecordSource
): AnalyticsReportingRow {
  const orderData = source === 'archived_orders' ? toObject(row.order_data) ?? {} : row;
  const record = source === 'archived_orders' ? { ...orderData, ...row } : row;

  return {
    id:
      toNumberOrNull(record.id) ??
      toStringOrNull(record.orderId) ??
      toStringOrNull(record.order_id) ??
      toStringOrNull(record.amazon_order_id) ??
      `${source}-${toStringOrNull(record.created_at) ?? 'unknown'}`,
    record_source: source,
    platform: toStringOrNull(record.platform),
    orderId: toStringOrNull(record.orderId) ?? toStringOrNull(record.order_id),
    display_order_id: toStringOrNull(record.display_order_id),
    root_order_id: toStringOrNull(record.root_order_id),
    amazon_order_id: toStringOrNull(record.amazon_order_id),
    customer_name: toStringOrNull(record.customer_name),
    customer_email: toStringOrNull(record.customer_email),
    lulu_job_id: toStringOrNull(record.lulu_job_id),
    lulu_status: toStringOrNull(record.lulu_status),
    print_submitted_at: toStringOrNull(record.print_submitted_at),
    shipped_at: toStringOrNull(record.shipped_at),
    delivered_at: toStringOrNull(record.delivered_at),
    assumed_delivered_at: toStringOrNull(record.assumed_delivered_at),
    lifecycle_status:
      source === 'archived_orders' ? 'archived' : (toStringOrNull(record.lifecycle_status) ?? 'active'),
    created_at: toStringOrNull(record.created_at) ?? toStringOrNull(record.purchase_date),
    purchase_date: toStringOrNull(record.purchase_date),
    updated_at: toStringOrNull(record.updated_at),
    queued_at: toStringOrNull(record.queued_at),
    started_at: toStringOrNull(record.started_at),
    status: toStringOrNull(record.status),
    execution_status: toStringOrNull(record.execution_status),
    error_type: toStringOrNull(record.error_type),
    error_message: toStringOrNull(record.error_message),
    retry_count: toNumberOrNull(record.retry_count),
    regeneration_attempt: toNumberOrNull(record.regeneration_attempt),
    character_specs: toObject(record.character_specs),
    book_specs: toObject(record.book_specs),
    one_manifest_url: toStringOrNull(record.one_manifest_url),
    manifest_2a_url: toStringOrNull(record.manifest_2a_url),
    manifest_2b_url: toStringOrNull(record.manifest_2b_url),
    manifest_3_url: toStringOrNull(record.manifest_3_url),
    previous_character_images: toArray(record.previous_character_images),
    rejection_history: toArray(record.rejection_history),
    workflow_step: toStringOrNull(record.workflow_step),
    current_workflow: toStringOrNull(record.current_workflow),
    next_workflow: toStringOrNull(record.next_workflow),
    customer_approval_status: toStringOrNull(record.customer_approval_status),
    customer_approval_requested_at: toStringOrNull(record.customer_approval_requested_at),
    customer_approval_approved_at: toStringOrNull(record.customer_approval_approved_at),
    review_stages: toObject(record.review_stages) as AnalyticsReportingRow['review_stages'],
  };
}

function isWithinDateRange(value: string | null, startDate: string, endDate: string): boolean {
  if (!value) return false;
  const candidate = new Date(value);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(candidate.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  return candidate >= start && candidate <= end;
}

function normalizeStartDateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function normalizeEndDateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function getSourcePresence(rows: AnalyticsReportingRow[]): AnalyticsSourcePresence {
  const hasLive = rows.some((row) => row.record_source === 'orders');
  const hasArchived = rows.some((row) => row.record_source === 'archived_orders');

  if (hasLive && hasArchived) return 'both';
  return hasLive ? 'live' : 'archived';
}

function getRecordCompletenessScore(row: AnalyticsReportingRow): number {
  const valuedFields = [
    row.lulu_job_id,
    row.lulu_status,
    row.print_submitted_at,
    row.shipped_at,
    row.delivered_at,
    row.customer_name,
    row.customer_email,
    row.manifest_2a_url,
    row.manifest_2b_url,
    row.manifest_3_url,
    row.one_manifest_url,
    row.customer_approval_status,
    row.current_workflow,
    row.next_workflow,
    row.workflow_step,
    row.error_type,
  ];

  return (
    valuedFields.filter(Boolean).length +
    (row.record_source === 'orders' ? 5 : 0) +
    (row.delivered_at ? 4 : 0) +
    (row.shipped_at ? 3 : 0) +
    (row.print_submitted_at ? 2 : 0)
  );
}

function choosePreferredRow(rows: AnalyticsReportingRow[]): AnalyticsReportingRow {
  return [...rows].sort((a, b) => getRecordCompletenessScore(b) - getRecordCompletenessScore(a))[0];
}

function getDedupeKey(row: AnalyticsReportingRow): string {
  if (row.orderId) return `order:${row.orderId}`;
  if (row.amazon_order_id) return `amazon:${row.amazon_order_id}`;
  return `row:${row.record_source}:${row.id}`;
}

function buildCanonicalOrders(rows: AnalyticsReportingRow[]): AnalyticsCanonicalOrder[] {
  const byDedupeKey = new Map<string, AnalyticsReportingRow[]>();

  rows.forEach((row) => {
    const key = getDedupeKey(row);
    const existing = byDedupeKey.get(key) || [];
    existing.push(row);
    byDedupeKey.set(key, existing);
  });

  const canonicalOrders = Array.from(byDedupeKey.entries()).map(([dedupeKey, duplicates]) => {
    const preferred = choosePreferredRow(duplicates);
    const classification = classifyAnalyticsOrder(preferred);

    return {
      ...preferred,
      classification: classification.classification,
      classification_reason: classification.reason,
      source_presence: getSourcePresence(duplicates),
      dedupe_key: dedupeKey,
      canonical_group_key: getCanonicalGroupKey(preferred),
      duplicate_row_count: duplicates.length,
      duplicate_source_ids: duplicates.map((row) => row.id),
      is_multi_item_order: false,
      item_count_in_group: 1,
    };
  });

  const byGroupKey = new Map<string, AnalyticsCanonicalOrder[]>();

  canonicalOrders.forEach((order) => {
    if (!order.canonical_group_key) return;
    const existing = byGroupKey.get(order.canonical_group_key) || [];
    existing.push(order);
    byGroupKey.set(order.canonical_group_key, existing);
  });

  byGroupKey.forEach((group) => {
    if (group.length < 2) return;
    group.forEach((order) => {
      order.is_multi_item_order = true;
      order.item_count_in_group = group.length;
    });
  });

  return canonicalOrders.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

async function getLiveOrdersForAnalytics(
  supabase: SupabaseClient,
  filters: AnalyticsFilters
): Promise<AnalyticsReportingRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .gte('created_at', filters.startDate)
    .lte('created_at', filters.endDate)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Analytics] Supabase live query error:', error);
    throw new Error(`Failed to fetch live orders: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeReportingRecord(row as SourceOrderRecord, 'orders'));
}

async function getArchivedOrdersForAnalytics(
  supabase: SupabaseClient,
  filters: AnalyticsFilters
): Promise<AnalyticsReportingRow[]> {
  const { data, error } = await supabase
    .from('archived_orders')
    .select('*')
    .order('archived_at', { ascending: false });

  if (error) {
    console.error('[Analytics] Supabase archived query error:', error);
    throw new Error(`Failed to fetch archived orders: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => normalizeReportingRecord(row as SourceOrderRecord, 'archived_orders'))
    .filter((row) => isWithinDateRange(row.created_at, filters.startDate, filters.endDate));
}

async function getAnalyticsRows(filters: AnalyticsFilters): Promise<AnalyticsReportingRow[]> {
  const supabase = createSupabaseClient();
  const historyScope = filters.historyScope ?? 'all';
  const normalizedFilters: AnalyticsFilters = {
    ...filters,
    startDate: normalizeStartDateInput(filters.startDate),
    endDate: normalizeEndDateInput(filters.endDate),
  };

  const [liveRows, archivedRows] = await Promise.all([
    historyScope === 'archived' ? Promise.resolve([]) : getLiveOrdersForAnalytics(supabase, normalizedFilters),
    historyScope === 'live' ? Promise.resolve([]) : getArchivedOrdersForAnalytics(supabase, normalizedFilters),
  ]);

  return [...liveRows, ...archivedRows].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
}

export async function getOrdersForAnalytics(filters: AnalyticsFilters): Promise<AnalyticsCanonicalOrder[]> {
  let filtered = buildCanonicalOrders(await getAnalyticsRows(filters));

  if (filters.isTest !== undefined) {
    filtered = filtered.filter((order) =>
      filters.isTest ? order.classification === 'test' : order.classification === 'production'
    );
  }

  if (filters.bookId) {
    filtered = filtered.filter((order) => {
      const bookId = extractBookId(order.one_manifest_url, order.book_specs);
      return bookId === filters.bookId;
    });
  }

  return filtered;
}

export async function getAnalyticsRowsForDebug(filters: AnalyticsFilters): Promise<AnalyticsReportingRow[]> {
  const rows = await getAnalyticsRows(filters);

  if (filters.bookId) {
    return rows.filter((row) => extractBookId(row.one_manifest_url, row.book_specs) === filters.bookId);
  }

  return rows;
}

export async function getAvailableBookIds(startDate: string, endDate: string): Promise<string[]> {
  const orders = await getOrdersForAnalytics({ startDate, endDate, historyScope: 'all' });
  const bookIds = new Set<string>();

  orders.forEach((order) => {
    bookIds.add(extractBookId(order.one_manifest_url, order.book_specs));
  });

  return Array.from(bookIds).sort();
}
