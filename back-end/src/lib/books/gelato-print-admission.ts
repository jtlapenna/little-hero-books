/** Shared admission checks; no network, environment reads, authorization minting or provider effects. */
export function gelatoApprovalBlocker(order: Record<string, unknown>): string | null {
  if (order.customer_approval_required != null && typeof order.customer_approval_required !== 'boolean') return 'invalid_customer_approval_requirement';
  if (order.customer_approval_status === 'revision_requested') return 'customer_revision_requested';
  if (order.customer_approval_required === true && order.customer_approval_status !== 'approved') return 'customer_approval_pending';
  return null;
}
export function assertGelatoCustomerApproval(order: Record<string, unknown>): void {
  if (gelatoApprovalBlocker(order)) throw new Error('Gelato print requires current customer approval');
}
export function hasGelatoPrintSubmission(order: Record<string, unknown>): boolean {
  return ['print_submission_id', 'print_claim_token', 'gelato_order_id', 'gelato_status'].some(key =>
    typeof order[key] === 'string' && Boolean((order[key] as string).trim()));
}
/** Ordinary scheduled dispatch only. Existing engineering authorities use their separate reviewed path. */
export function ordinaryPrintRoutingBlocker(order: Record<string, unknown>, gelatoDraftsEnabled: boolean): string | null {
  if (!['4', '4-aggregate'].includes(String(order.next_workflow ?? ''))) return null;
  if (order.print_provider !== 'gelato' && order.print_provider !== 'lulu') return 'print_provider_unassigned';
  if (order.print_provider !== 'gelato') return null;
  if (!gelatoDraftsEnabled) return 'gelato_draft_submission_disabled';
  if (hasGelatoPrintSubmission(order)) return 'existing_gelato_submission_requires_inspection';
  return gelatoApprovalBlocker(order);
}
