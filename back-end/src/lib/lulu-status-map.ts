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
