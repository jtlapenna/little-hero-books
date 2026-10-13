export type PrintProvider = 'lulu' | 'gelato';

type AnalyticsOrderLike = {
  print_provider?: string | null;
  gelato_order_type?: string | null;
  gelato_status?: string | null;
  status?: string | null;
  execution_status?: string | null;
};

type AttentionOrderLike = Record<string, unknown>;
type PrintGroupOrderLike = Record<string, unknown>;

const RESOLVED_PRINT_PROVIDER_KEY = '__resolved_print_provider';

export function isGelatoOrderShipped(order: AnalyticsOrderLike): boolean {
  return order.print_provider === 'gelato' &&
    order.gelato_order_type === 'order' &&
    ['shipped', 'in_transit', 'delivered'].includes(order.gelato_status ?? '');
}

export function isGelatoOrderCompleted(order: AnalyticsOrderLike): boolean {
  // Gelato state is canonical for Gelato orders. Stale shared status fields
  // must not mark drafts, returns, or unsubmitted orders complete.
  return order.print_provider === 'gelato' && isGelatoOrderShipped(order);
}

export function hasExistingGelatoSubmission(order: Record<string, unknown>): boolean {
  return order.print_provider === 'gelato' &&
    [order.print_submission_id, order.gelato_order_id].some((value) =>
      typeof value === 'string' && value.trim().length > 0,
    );
}

export function getGelatoNotificationChildOrderIds(notifications: Array<Record<string, unknown>>): number[] {
  const childIds = new Set<number>();
  for (const notification of notifications) {
    const rowId = Number(notification.child_order_id);
    if (Number.isSafeInteger(rowId) && rowId > 0) childIds.add(rowId);
    const payload = notification.payload && typeof notification.payload === 'object' && !Array.isArray(notification.payload)
      ? notification.payload as Record<string, unknown>
      : null;
    const payloadIds = payload?.childOrderIds;
    if (Array.isArray(payloadIds)) {
      for (const value of payloadIds) {
        const id = Number(value);
        if (Number.isSafeInteger(id) && id > 0) childIds.add(id);
      }
    }
  }
  return [...childIds];
}

export function isActionableGelatoAttention(order: AttentionOrderLike): boolean {
  if (order.gelato_notification_attention === true) return true;
  return order.print_provider === 'gelato' &&
    typeof order.gelato_action_reason === 'string' &&
    order.gelato_action_reason.trim().length > 0 &&
    order.gelato_action_reason !== 'awaiting_draft_review';
}

export function shouldExcludeFromPrintPhaseAttention(order: AttentionOrderLike): boolean {
  if (isActionableGelatoAttention(order)) return false;
  const hasLulu = Boolean(order.lulu_job_id || order.lulu_status);
  return hasLulu || order.workflow_step === 'print_fulfillment' ||
    (order.next_workflow === '4' && order.customer_approval_status === 'approved');
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPrintProvider(order: PrintGroupOrderLike): PrintProvider | null {
  const value = toTrimmedString(order[RESOLVED_PRINT_PROVIDER_KEY] ?? order.print_provider);
  return value === 'gelato' || value === 'lulu' ? value : null;
}

export function getPrintGroupProviderBlocker(orders: PrintGroupOrderLike[]): string | null {
  const providers = orders.map(readPrintProvider);
  if (providers.some((provider) => provider === null)) {
    return 'Print provider could not be resolved for every order in the group';
  }
  if (new Set(providers).size > 1) {
    return 'Sibling orders resolve to different print providers';
  }
  if (providers[0] === 'gelato' && orders.some((order) =>
    hasExistingGelatoSubmission({ ...order, print_provider: 'gelato' }),
  )) {
    return 'Existing Gelato submission must be inspected or recovered before another print request';
  }
  return null;
}

export function getPrintQueueSuccessMessage(provider: PrintProvider, grouped: boolean, count: number): string {
  if (provider === 'gelato') {
    return grouped
      ? `Queued ${count} sibling orders for a held Gelato draft. The draft will wait for review; printing will not start.`
      : 'Order queued for a held Gelato draft. The draft will wait for review; printing will not start.';
  }
  return grouped
    ? `Queued ${count} sibling orders for print fulfillment. Router will process the group together when capacity is available.`
    : 'Order queued for print fulfillment workflow. Router will process it when capacity is available.';
}
