/**
 * Outbound-message guard for explicitly marked test orders.
 *
 * An order is "marked" only when its stored product_info carries
 * `_overnight_test === true` (set by the admin CSV upload through the explicit
 * `overnight_test` form field, and preserved by later product_info rewrites).
 * No other signal (ids, emails, names) is consulted, so unmarked orders are
 * never affected.
 *
 * Semantics for a marked order: every customer/buyer message path SKIPS with the
 * reason below. A skip is not an error and never records a "sent" state
 * (preview_reminder_sent, notification_logs 'sent', delivered flags), so the
 * order does not look notified and nothing is retried into a send.
 */

export const OVERNIGHT_TEST_MARKER = '_overnight_test';
/** Admin CSV upload form field that sets the marker (exact value 'true'; default off). */
export const OVERNIGHT_TEST_FORM_FIELD = 'overnight_test';
export const OVERNIGHT_TEST_SKIP_REASON = 'overnight_test_order';
export const OVERNIGHT_TEST_SKIP_MESSAGE = 'Skipped: overnight test order (customer messaging suppressed)';

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try { return parseObject(JSON.parse(value)); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** True only when `order.product_info._overnight_test === true` (object or JSON string). */
export function isOvernightTestOrder(order: unknown): boolean {
  const row = parseObject(order);
  if (!row) return false;
  return parseObject(row.product_info)?.[OVERNIGHT_TEST_MARKER] === true;
}

/** True when any order in the group is marked (a group can share one buyer). */
export function anyOvernightTestOrder(orders: readonly unknown[]): boolean {
  return orders.some(isOvernightTestOrder);
}

/** Carry the marker from an existing row onto a replacement product_info. */
export function preserveOvernightTestMarker(existingRow: unknown, nextProductInfo: unknown): unknown {
  if (!isOvernightTestOrder(existingRow)) return nextProductInfo;
  const next = parseObject(nextProductInfo);
  if (!next || next[OVERNIGHT_TEST_MARKER] === true) return nextProductInfo;
  return { ...next, [OVERNIGHT_TEST_MARKER]: true };
}

type QueryResult = { data?: unknown; error?: unknown };
type MarkerLookupClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): { limit(count: number): PromiseLike<QueryResult> };
    };
  };
};

/**
 * Backstop used inside the lowest-level send functions, which only know ids.
 * Looks for a marked row by per-book orderId and/or the Amazon root. Fails OPEN
 * (returns false) on any lookup problem: the producer guards are primary, and a
 * transient read error must not suppress a real customer's message.
 */
export async function lookupOvernightTestOrder(
  database: unknown,
  ids: { orderId?: string | null; amazonOrderId?: string | null },
): Promise<boolean> {
  const db = database as MarkerLookupClient;
  const probes: Array<[string, string]> = [];
  const orderId = ids.orderId?.trim();
  const amazonOrderId = ids.amazonOrderId?.trim();
  if (orderId) probes.push(['orderId', orderId]);
  if (amazonOrderId) probes.push(['amazon_order_id', amazonOrderId], ['root_order_id', amazonOrderId]);
  for (const [column, value] of probes) {
    try {
      const result = await db.from('orders').select('product_info').eq(column, value).limit(50);
      if (result.error || !Array.isArray(result.data)) continue;
      if (anyOvernightTestOrder(result.data)) return true;
    } catch { /* fail open */ }
  }
  return false;
}

/** Public intake must never let a caller set the marker; only the admin CSV upload may. */
export function stripOvernightTestMarker<T extends Record<string, unknown>>(productInfo: T): T {
  if (!Object.prototype.hasOwnProperty.call(productInfo, OVERNIGHT_TEST_MARKER)) return productInfo;
  const { [OVERNIGHT_TEST_MARKER]: _dropped, ...rest } = productInfo;
  return rest as T;
}
