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
    (nextWorkflow === '4' || nextWorkflow === '4-aggregate') &&
    !hasLuluSubmission(order) &&
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

  if (hasLuluSubmission(order)) {
    blockers.push('already submitted to Lulu');
  }

  return blockers;
}
