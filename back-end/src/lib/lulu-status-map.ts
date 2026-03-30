/**
 * Shared Lulu-to-order status mapping.
 * Used by the Lulu webhook, manual refresh endpoint, and cron polling fallback.
 */

export const LULU_TO_ORDER_STATUS: Record<string, string> = {
  CREATED: 'pending_print',
  UNPAID: 'pending_print',
  PAYMENT_IN_PROGRESS: 'pending_print',
  PRODUCTION_DELAYED: 'pending_print',
  PRODUCTION_READY: 'pending_print',
  IN_PRODUCTION: 'in_production',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  REJECTED: 'action_required',
  CANCELED: 'cancelled',
};

export function isTerminalLuluStatus(s: string): boolean {
  return s === 'SHIPPED' || s === 'DELIVERED' || s === 'CANCELED' || s === 'REJECTED';
}

type LuluLifecycleOrderLike = {
  shipped_at?: string | null;
  delivered_at?: string | null;
  error_type?: string | null;
};

type BuildLuluOrderUpdateInput = {
  statusName: string;
  order?: LuluLifecycleOrderLike | null;
  changedAt?: string | null;
  errorMessage?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  carrier?: string | null;
  now?: string;
};

export function buildLuluOrderUpdate({
  statusName,
  order,
  changedAt,
  errorMessage,
  trackingNumber,
  trackingUrl,
  carrier,
  now,
}: BuildLuluOrderUpdateInput): Record<string, unknown> {
  const normalizedStatus = String(statusName || '').trim().toUpperCase();
  const nowIso = now || new Date().toISOString();
  const terminalAt = typeof changedAt === 'string' && changedAt.trim() ? changedAt.trim() : nowIso;

  const updates: Record<string, unknown> = {
    lulu_status: normalizedStatus,
    updated_at: nowIso,
    status: LULU_TO_ORDER_STATUS[normalizedStatus] ?? 'pending_print',
  };

  if (trackingNumber) {
    updates.tracking_number = trackingNumber;
  }
  if (trackingUrl) {
    updates.tracking_url = trackingUrl;
  }
  if (carrier) {
    updates.carrier = carrier;
  }

  if (isTerminalLuluStatus(normalizedStatus)) {
    updates.print_fulfillment_finished_at = terminalAt;
  }

  if (order?.error_type === 'workflow_timeout' && isTerminalLuluStatus(normalizedStatus)) {
    updates.error_type = null;
    updates.error_message = null;
  }

  if (normalizedStatus === 'SHIPPED') {
    if (!order?.shipped_at) {
      updates.shipped_at = terminalAt;
    }
    updates.workflow_step = 'done';
    updates.execution_status = 'done';
    return updates;
  }

  if (normalizedStatus === 'DELIVERED') {
    if (!order?.shipped_at) {
      updates.shipped_at = terminalAt;
    }
    if (!order?.delivered_at) {
      updates.delivered_at = terminalAt;
    }
    updates.lifecycle_status = 'recently_delivered';
    updates.assumed_delivered_at = terminalAt;
    updates.workflow_step = 'done';
    updates.execution_status = 'done';
    return updates;
  }

  if (normalizedStatus === 'REJECTED') {
    updates.error_type = 'lulu_rejected';
    if (errorMessage) {
      updates.error_message = errorMessage;
    }
    return updates;
  }

  if (normalizedStatus === 'CANCELED') {
    updates.error_type = null;
    updates.error_message = null;
  }

  return updates;
}
