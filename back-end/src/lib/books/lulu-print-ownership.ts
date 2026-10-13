export function assertLuluPrintOwnership(...sources: Array<unknown>): void {
  assertNoNonLuluPrintOwnership(...sources);
  let hasAssignment = false;
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const value = source as Record<string, unknown>;
    for (const provider of [value.print_provider, value.provider]) {
      if (provider != null) {
        hasAssignment = true;
      }
    }
  }
  if (!hasAssignment) throw new Error('Lulu print path requires a verified Lulu provider assignment');
}

export function assertLuluPrintOwnershipForOrder(expectedOrderId: string, source: unknown): void {
  if (!source || typeof source !== 'object') {
    throw new Error('Lulu print path could not verify the persisted order row');
  }
  const value = source as Record<string, unknown>;
  const persistedOrderId = typeof value.orderId === 'string' ? value.orderId
    : typeof value.order_id === 'string' ? value.order_id : null;
  if (persistedOrderId !== expectedOrderId) {
    throw new Error('Lulu print path order identity mismatch');
  }
  assertLuluPrintOwnership(value);
}

export function assertNoNonLuluPrintOwnership(...sources: Array<unknown>): void {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const value = source as Record<string, unknown>;
    for (const provider of [value.print_provider, value.provider]) {
      if (provider != null && provider !== 'lulu') {
        throw new Error('Lulu print path refuses a non-Lulu provider assignment');
      }
    }
  }
}
