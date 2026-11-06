import { gelatoApprovalBlocker, hasGelatoPrintSubmission } from './books/gelato-print-admission';
type OrderLike = Record<string, unknown>;

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getPerBookOrderId(order: OrderLike): string {
  return (
    toTrimmedString(order.orderId) ||
    toTrimmedString(order.order_id) ||
    toTrimmedString(order.amazon_order_id)
  );
}

export function getRootOrderId(order: OrderLike): string {
  return (
    toTrimmedString(order.root_order_id) ||
    toTrimmedString(order.amazon_order_id)
  );
}

export function isSiblingChildOrder(order: OrderLike): boolean {
  const orderId = getPerBookOrderId(order);
  const rootOrderId = getRootOrderId(order);
  return !!orderId && !!rootOrderId && orderId !== rootOrderId;
}

export function getSiblingChildMembers(
  orders: OrderLike[],
  rootOrderId: string,
): OrderLike[] {
  const normalizedRoot = toTrimmedString(rootOrderId);
  if (!normalizedRoot) return [];

  return orders.filter((order) => {
    const memberOrderId = getPerBookOrderId(order);
    return (
      !!memberOrderId &&
      getRootOrderId(order) === normalizedRoot &&
      memberOrderId !== normalizedRoot
    );
  });
}

export function hasWorkflow3Complete(order: OrderLike): boolean {
  return (
    !!toTrimmedString(order.manifest_3_url) ||
    toTrimmedString(order.workflow_step) === 'book_assembly_completed'
  );
}

export function getShippingAddressMissingFields(shippingAddress: unknown): string[] {
  if (!shippingAddress || typeof shippingAddress !== 'object' || Array.isArray(shippingAddress)) {
    return ['shipping_address'];
  }

  const address = shippingAddress as Record<string, unknown>;
  const missing: string[] = [];

  const addressLine =
    toTrimmedString(address.street1) ||
    toTrimmedString(address.street) ||
    toTrimmedString(address.address) ||
    toTrimmedString(address.address1) ||
    toTrimmedString(address.address_line_1) ||
    toTrimmedString(address.address_line1);
  const city = toTrimmedString(address.city);
  const state =
    toTrimmedString(address.state) ||
    toTrimmedString(address.state_code) ||
    toTrimmedString(address.stateCode);
  const zip =
    toTrimmedString(address.postcode) ||
    toTrimmedString(address.zip) ||
    toTrimmedString(address.postal_code) ||
    toTrimmedString(address.postalCode);

  if (!addressLine) missing.push('address');
  if (!city) missing.push('city');
  if (!state) missing.push('state');
  if (!zip) missing.push('zip');

  return missing;
}

export function hasLuluSubmission(order: OrderLike): boolean {
  return !!toTrimmedString(order.lulu_job_id) || !!toTrimmedString(order.lulu_status);
}

export function isReadyForSiblingPrintRouting(order: OrderLike): boolean {
  const nextWorkflow = toTrimmedString(order.next_workflow);
  const approvalRequired = order.customer_approval_required === true;
  const approved = toTrimmedString(order.customer_approval_status) === 'approved';

  return (
    toTrimmedString(order.execution_status) === 'ready_for_processing' &&
    !toTrimmedString(order.current_workflow) &&
    !order.started_at &&
    (nextWorkflow === '4' || nextWorkflow === '4-aggregate') &&
    !hasLuluSubmission(order) &&
    !(order.print_provider === 'gelato' && (hasGelatoPrintSubmission(order) || gelatoApprovalBlocker(order))) &&
    (!approvalRequired || approved)
  );
}

export function describeSiblingPrintSubmissionBlockers(order: OrderLike): string[] {
  const blockers: string[] = [];
  const missingShippingFields = getShippingAddressMissingFields(order.shipping_address);

  if (missingShippingFields.length > 0) {
    blockers.push(
      missingShippingFields[0] === 'shipping_address'
        ? 'shipping info missing'
        : `shipping missing ${missingShippingFields.join(', ')}`,
    );
  }

  if (!hasWorkflow3Complete(order)) {
    blockers.push('workflow 3 not complete');
  }

  const currentWorkflow = toTrimmedString(order.current_workflow);
  if (currentWorkflow) {
    blockers.push(`currently processing ${currentWorkflow}`);
  }

  if (order.print_provider === 'gelato' && hasGelatoPrintSubmission(order)) blockers.push('existing Gelato submission requires inspection');
  if (order.print_provider === 'gelato' && gelatoApprovalBlocker(order)) blockers.push('customer approval not current');

  if (hasLuluSubmission(order)) {
    blockers.push('already submitted to Lulu');
  }

  return blockers;
}

// Full membership is required before a detail view or print action can name its targets.
export function assertOrderGroupMembers(
  rows: OrderLike[], rootOrderId: string, currentOrderId: string, currentRowId: unknown,
): void {
  if (!rootOrderId || !currentOrderId || !rows.length || rows.length > 200) {
    throw new Error('Order group membership is unavailable or exceeds the safe lookup limit');
  }
  const businessIds = new Set<string>();
  const physicalIds = new Set<number>();
  for (const row of rows) {
    const id = getPerBookOrderId(row);
    const aliases = [row.orderId, row.order_id].filter(value => value !== undefined && value !== null && value !== '');
    const roots = [row.root_order_id, row.amazon_order_id, row.rootOrderId, row.amazonOrderId]
      .filter(value => value !== undefined && value !== null && value !== '');
    if (!id || (aliases.length === 0 && id !== rootOrderId) ||
        aliases.some(value => typeof value !== 'string' || value !== id) ||
        roots.some(value => typeof value !== 'string' || value !== rootOrderId) ||
        (roots.length === 0 && id !== rootOrderId) ||
        typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0 ||
        businessIds.has(id) || physicalIds.has(row.id)) {
      throw new Error('Conflicting or duplicate order group identity');
    }
    businessIds.add(id); physicalIds.add(row.id);
  }
  const current = rows.find(row => getPerBookOrderId(row) === currentOrderId);
  if (!current || current.id !== currentRowId) throw new Error('Current order is missing from the verified group');
}

export async function readCompleteOrderGroup(
  db: import('@supabase/supabase-js').SupabaseClient, current: OrderLike,
): Promise<OrderLike[]> {
  const orderId = getPerBookOrderId(current);
  const rootId = getRootOrderId(current) || orderId;
  assertOrderGroupMembers([current], rootId, orderId, current.id);
  const { readCsvRootRows, assertCompleteCsvRootUnits, csvRootNeedsCompleteUnits, isPurePlaceholder } = await import('./csv-book-selection');
  const rows = await readCsvRootRows(db, rootId, [{ orderId }, { orderId: rootId }]);
  assertOrderGroupMembers(rows, rootId, orderId, current.id);
  if (current.platform === 'amazon') assertCompleteCsvRootUnits(rows, rootId);
  // Legacy Amazon roots keep an empty placeholder parent beside their per-book children; it is not a printable member
  // (HEAD excluded every root row here). Only the canonical pure-placeholder predicate qualifies, on an Amazon row.
  // Roots needing complete unit context stay strict (the canonical CSV contract makes a placeholder the sole root
  // member there) and the placeholder as the current order stays strict. Legacy children store the per-line quantity in
  // _quantity_unit_count, so that value cannot be compared with the group size.
  if (orderId !== rootId && !csvRootNeedsCompleteUnits(rows as Parameters<typeof csvRootNeedsCompleteUnits>[0])) {
    const members = rows.filter(row => !(row.platform === 'amazon' && isPurePlaceholder(row as Parameters<typeof isPurePlaceholder>[0], rootId)));
    if (members.length !== rows.length && members.length > 0) {
      assertOrderGroupMembers(members, rootId, orderId, current.id);
      return members;
    }
  }
  return rows;
}

export async function assertNoArchivedOrderGroupMembers(
  db: import('@supabase/supabase-js').SupabaseClient, rootId: string, currentId: string,
): Promise<void> {
  const archivedIds = new Set<string>();
  for (const [column, value] of [
    ['root_order_id', rootId], ['amazon_order_id', rootId],
    ['orderId', rootId], ['order_id', rootId],
    ['orderId', currentId], ['order_id', currentId],
  ]) {
    const result = await db.from('archived_orders').select('order_data')
      .eq(`order_data->>${column}`, value).limit(201);
    if (result.error || !Array.isArray(result.data) || result.data.length >= 201) {
      throw new Error('Unable to verify archived order group membership; no orders were queued');
    }
    for (const stored of result.data) {
      const member = stored.order_data;
      if (!member || typeof member !== 'object' || Array.isArray(member) || !getPerBookOrderId(member)) {
        throw new Error('Invalid archived order group member; no orders were queued');
      }
      archivedIds.add(getPerBookOrderId(member));
    }
  }
  if (archivedIds.size) {
    throw new Error(`Order group ${rootId} includes archived orders (${[...archivedIds].sort().join(', ')}); verify the complete group before queueing print`);
  }
}

export function assertExactOrderLookup(requestedId: string, row: OrderLike, allowGroupAlias: boolean): void {
  const requested = requestedId.trim();
  if (!requested || (requested !== getPerBookOrderId(row) && requested !== String(row.id) &&
      !(allowGroupAlias && requested === getRootOrderId(row)))) {
    throw new Error('Order lookup did not match the requested book or group');
  }
}
