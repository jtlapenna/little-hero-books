export const GELATO_PREPRODUCTION_STATUSES = ['created', 'uploading', 'passed', 'pending_approval', 'pending_personalization', 'not_connected', 'on_hold'] as const;
export const GELATO_STATUSES = [...GELATO_PREPRODUCTION_STATUSES, 'draft', 'digitizing', 'in_production', 'printed', 'shipped', 'in_transit', 'delivered', 'canceled', 'failed', 'returned'] as const;
export type GelatoStatus = typeof GELATO_STATUSES[number];
const preproduction = [...GELATO_PREPRODUCTION_STATUSES, 'in_production', 'printed', 'shipped', 'in_transit', 'delivered', 'canceled', 'failed'];
const transitions: Record<string, readonly string[]> = {
  created: preproduction, uploading: preproduction, passed: preproduction, pending_approval: preproduction,
  pending_personalization: preproduction, not_connected: preproduction,
  in_production: ['in_production', 'on_hold', 'printed', 'shipped', 'in_transit', 'delivered', 'canceled', 'failed'],
  printed: ['printed', 'on_hold', 'shipped', 'in_transit', 'delivered', 'canceled', 'failed'],
  shipped: ['shipped', 'on_hold', 'in_transit', 'delivered', 'returned', 'failed'],
  in_transit: ['in_transit', 'on_hold', 'delivered', 'returned', 'failed'],
  delivered: ['delivered', 'returned'], canceled: ['canceled'], failed: ['failed'], returned: ['returned'],
};
export function isGelatoStatus(value: string): value is GelatoStatus { return (GELATO_STATUSES as readonly string[]).includes(value); }
export function gelatoTransitionReason(previous: string | null, next: string, previousType: string | null, nextType: 'draft' | 'order', progress?: string | null): string | null {
  if (!isGelatoStatus(next)) return 'unknown_provider_status';
  if (next === 'digitizing') return 'unsupported_photobook_status';
  if (previousType === 'order' && nextType === 'draft') return 'provider_type_regression';
  if (nextType === 'order' && next === 'draft') return 'unexpected_draft_status';
  if (previous && ['canceled', 'returned', 'failed'].includes(previous) && previous !== next) return 'terminal_status_conflict';
  if (previousType === 'draft' || previous === null) return null;
  if (!isGelatoStatus(previous)) return 'previous_status_requires_review';
  const baseline = previous === 'on_hold' ? progress : previous;
  if (!baseline) return next === 'on_hold' ? null : 'hold_resume_requires_review';
  return transitions[baseline]?.includes(next) ? null : baseline === 'delivered' ? 'terminal_status_conflict' : 'provider_status_regression';
}
export function canCancelGelatoOrder(orderType: string, statuses: string[]): boolean {
  return orderType === 'order' && statuses.length > 0 && statuses.every((status) => (GELATO_PREPRODUCTION_STATUSES as readonly string[]).includes(status));
}
export function gelatoStatusLabel(status: string | null | undefined, orderType?: string | null, reason?: string | null): string {
  if (reason && reason !== 'awaiting_draft_review') return 'Gelato needs attention';
  if (orderType === 'draft') return 'Gelato draft awaiting review';
  const labels: Record<string, string> = { in_production: 'Printing', printed: 'Printed', shipped: 'Shipped', in_transit: 'In transit', delivered: 'Delivered', canceled: 'Canceled', failed: 'Print failed', returned: 'Returned', on_hold: 'Gelato on hold' };
  return labels[status ?? ''] ?? (status && isGelatoStatus(status) ? 'Preparing for print' : 'Gelato awaiting status');
}
