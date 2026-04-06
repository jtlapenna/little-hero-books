/**
 * Analytics helper functions
 */

export type AnalyticsOrderClassification = 'production' | 'test' | 'unknown';

export interface AnalyticsOrderLike {
  platform?: string | null;
  amazon_order_id?: string | null;
  orderId?: string | null;
  root_order_id?: string | null;
  display_order_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  lulu_job_id?: string | null;
  lulu_status?: string | null;
  print_submitted_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  manifest_2a_url?: string | null;
  manifest_2b_url?: string | null;
  manifest_3_url?: string | null;
  one_manifest_url?: string | null;
  customer_approval_status?: string | null;
  customer_approval_requested_at?: string | null;
  customer_approval_approved_at?: string | null;
  execution_status?: string | null;
  status?: string | null;
  workflow_step?: string | null;
  current_workflow?: string | null;
  next_workflow?: string | null;
  classification?: AnalyticsOrderClassification;
}

export interface AnalyticsClassificationResult {
  classification: AnalyticsOrderClassification;
  reason: string;
}

const AMAZON_ORDER_ID_PATTERN = /^\d{3}-\d{7}-\d{7}$/;
const AMAZON_ITEM_ORDER_ID_PATTERN = /^\d{3}-\d{7}-\d{7}-item-[A-Za-z0-9-]+$/;
const TEST_MARKERS = ['test', 'qa', 'e2e', 'sandbox', 'demo', 'dummy', 'internal'];

function hasValue(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim().length > 0);
}

export function isCanonicalAmazonOrderId(value: string | null | undefined): boolean {
  return AMAZON_ORDER_ID_PATTERN.test(String(value ?? '').trim());
}

export function isAmazonItemOrderId(value: string | null | undefined): boolean {
  return AMAZON_ITEM_ORDER_ID_PATTERN.test(String(value ?? '').trim());
}

export function getParentAmazonOrderId(value: string | null | undefined): string | null {
  const orderId = String(value ?? '').trim();
  const match = orderId.match(/^(\d{3}-\d{7}-\d{7})-item-/);
  return match?.[1] ?? null;
}

export function hasFulfillmentSignal(order: AnalyticsOrderLike): boolean {
  return Boolean(
    order.lulu_job_id ||
      order.lulu_status ||
      order.print_submitted_at ||
      order.shipped_at ||
      order.delivered_at
  );
}

export function hasProgressSignal(order: AnalyticsOrderLike): boolean {
  return Boolean(
    hasFulfillmentSignal(order) ||
      order.manifest_2a_url ||
      order.manifest_2b_url ||
      order.manifest_3_url ||
      order.one_manifest_url ||
      order.customer_approval_status ||
      order.customer_approval_requested_at ||
      order.customer_approval_approved_at ||
      order.workflow_step ||
      order.current_workflow ||
      order.next_workflow ||
      order.execution_status ||
      order.status
  );
}

function hasExplicitTestMarker(order: AnalyticsOrderLike): string | null {
  const values = [
    order.orderId,
    order.amazon_order_id,
    order.root_order_id,
    order.display_order_id,
    order.customer_name,
    order.customer_email,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  const marker = TEST_MARKERS.find((candidate) => values.some((value) => value.includes(candidate)));
  return marker ?? null;
}

export function getExplicitAnalyticsTestMarkerReason(
  order: AnalyticsOrderLike,
): string | null {
  const marker = hasExplicitTestMarker(order);
  return marker ? `explicit_${marker}_marker` : null;
}

function hasCustomerIdentity(order: AnalyticsOrderLike): boolean {
  return hasValue(order.customer_name) || hasValue(order.customer_email);
}

export function getCanonicalGroupKey(order: AnalyticsOrderLike): string | null {
  if (hasValue(order.root_order_id)) return String(order.root_order_id).trim();

  const itemAmazonParent =
    getParentAmazonOrderId(order.orderId) || getParentAmazonOrderId(order.amazon_order_id);
  if (itemAmazonParent) return itemAmazonParent;

  if (isCanonicalAmazonOrderId(order.amazon_order_id)) return String(order.amazon_order_id).trim();
  if (isCanonicalAmazonOrderId(order.orderId)) return String(order.orderId).trim();
  if (hasValue(order.display_order_id)) return String(order.display_order_id).trim();
  if (hasValue(order.orderId)) return String(order.orderId).trim();

  return null;
}

export function classifyAnalyticsOrder(order: AnalyticsOrderLike): AnalyticsClassificationResult {
  if (order.classification) {
    return { classification: order.classification, reason: 'preclassified' };
  }

  const explicitTestReason = getExplicitAnalyticsTestMarkerReason(order);
  if (explicitTestReason) {
    return { classification: 'test', reason: explicitTestReason };
  }

  if (order.platform === 'amazon') {
    const hasAmazonIdentity =
      isCanonicalAmazonOrderId(order.amazon_order_id) ||
      isCanonicalAmazonOrderId(order.orderId) ||
      isAmazonItemOrderId(order.amazon_order_id) ||
      isAmazonItemOrderId(order.orderId);

    if (hasAmazonIdentity && hasCustomerIdentity(order) && hasProgressSignal(order)) {
      return {
        classification: 'production',
        reason: isAmazonItemOrderId(order.amazon_order_id) || isAmazonItemOrderId(order.orderId)
          ? 'amazon_multi_item_order'
          : 'amazon_customer_order',
      };
    }
  }

  if (order.platform === 'd2c') {
    const hasD2CIdentity =
      hasCustomerIdentity(order) &&
      hasValue(order.display_order_id) &&
      String(order.display_order_id).trim().startsWith('LH-');

    if (hasD2CIdentity && (hasValue(order.shipped_at) || hasValue(order.delivered_at))) {
      return { classification: 'production', reason: 'd2c_customer_order' };
    }
  }

  return {
    classification: hasProgressSignal(order) ? 'unknown' : 'test',
    reason: hasProgressSignal(order) ? 'insufficient_production_evidence' : 'no_progress_signal',
  };
}

export function isProductionOrder(order: AnalyticsOrderLike): boolean {
  return classifyAnalyticsOrder(order).classification === 'production';
}

export function isTestOrder(order: AnalyticsOrderLike): boolean {
  return classifyAnalyticsOrder(order).classification === 'test';
}

export function extractBookId(
  manifestUrl: string | null | undefined,
  bookSpecs: Record<string, unknown> | null | undefined
): string {
  if (manifestUrl) {
    const match = manifestUrl.match(/^([^/]+)\//);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (bookSpecs) {
    return String(bookSpecs.bookType || bookSpecs.project || 'unknown');
  }

  return 'unknown';
}

export function getLastNDays(n: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - n);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function groupByTimePeriod(
  data: Array<{ date: string | Date; [key: string]: unknown }>,
  period: 'day' | 'week' | 'month'
): Record<string, Array<{ date: string | Date; [key: string]: unknown }>> {
  const grouped: Record<string, Array<{ date: string | Date; [key: string]: unknown }>> = {};

  data.forEach((item) => {
    const date = new Date(item.date);
    let key: string;

    switch (period) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      }
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        key = date.toISOString().split('T')[0];
    }

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  });

  return grouped;
}
