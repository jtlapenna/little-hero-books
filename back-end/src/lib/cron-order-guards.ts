import type { AnalyticsOrderLike } from '@/lib/analytics-helpers';
import { getExplicitAnalyticsTestMarkerReason } from '@/lib/analytics-helpers';

export interface CronGuardOrderLike extends AnalyticsOrderLike {
  id?: number | string | null;
  next_workflow?: string | number | null;
  current_workflow?: string | number | null;
  execution_status?: string | null;
}

export interface CronExcludedOrderSummary {
  id: number | string | null;
  orderId: string | null;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  customerEmail: string | null;
  reason: string;
}

export interface CronExcludedOrder<T extends CronGuardOrderLike> {
  order: T;
  summary: CronExcludedOrderSummary;
}

const EXCLUDED_ID_PREFIXES = ['DIRECT-', 'STATUS-TEST-'];
const EXCLUDED_EMAIL_MARKERS = ['repo-smoke', 'repo-norm', '+repo-', '+codex-'];
const EXCLUDED_NAME_MARKERS = ['repo smoke', 'smoke test', 'test fixture'];

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toLowerString(value: unknown): string | null {
  const trimmed = toTrimmedString(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function getOrderIdentityCandidates(order: CronGuardOrderLike): string[] {
  return [
    toTrimmedString(order.orderId),
    toTrimmedString(order.amazon_order_id),
    toTrimmedString(order.root_order_id),
    toTrimmedString(order.display_order_id),
  ].filter((value): value is string => Boolean(value));
}

export function getCronExcludedOrderReason(
  order: CronGuardOrderLike,
): string | null {
  const analyticsReason = getExplicitAnalyticsTestMarkerReason(order);
  if (analyticsReason) {
    return `analytics_${analyticsReason}`;
  }

  for (const candidate of getOrderIdentityCandidates(order)) {
    const upper = candidate.toUpperCase();
    const prefix = EXCLUDED_ID_PREFIXES.find((value) => upper.startsWith(value));
    if (prefix) {
      return `order_id_prefix_${prefix.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    }
  }

  const customerEmail = toLowerString(order.customer_email);
  if (customerEmail) {
    if (customerEmail.endsWith('@example.com')) {
      return 'customer_email_example_domain';
    }

    const marker = EXCLUDED_EMAIL_MARKERS.find((value) =>
      customerEmail.includes(value),
    );
    if (marker) {
      return `customer_email_marker_${marker.replace(/[^a-z0-9]+/g, '_')}`;
    }
  }

  const customerName = toLowerString(order.customer_name);
  if (customerName) {
    const marker = EXCLUDED_NAME_MARKERS.find((value) =>
      customerName.includes(value),
    );
    if (marker) {
      return `customer_name_marker_${marker.replace(/[^a-z0-9]+/g, '_')}`;
    }
  }

  return null;
}

export function summarizeCronExcludedOrder(
  order: CronGuardOrderLike,
  reason = getCronExcludedOrderReason(order),
): CronExcludedOrderSummary | null {
  if (!reason) {
    return null;
  }

  return {
    id: order.id ?? null,
    orderId: toTrimmedString(order.orderId),
    amazonOrderId: toTrimmedString(order.amazon_order_id),
    rootOrderId: toTrimmedString(order.root_order_id),
    customerEmail: toTrimmedString(order.customer_email),
    reason,
  };
}

export function splitCronExcludedOrders<T extends CronGuardOrderLike>(
  orders: readonly T[],
): {
  included: T[];
  excluded: CronExcludedOrder<T>[];
} {
  const included: T[] = [];
  const excluded: CronExcludedOrder<T>[] = [];

  for (const order of orders) {
    const reason = getCronExcludedOrderReason(order);
    if (!reason) {
      included.push(order);
      continue;
    }

    excluded.push({
      order,
      summary: summarizeCronExcludedOrder(order, reason)!,
    });
  }

  return {
    included,
    excluded,
  };
}
