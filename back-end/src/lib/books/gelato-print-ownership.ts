export function assertGelatoPrintOwnership(...sources: Array<unknown>): void {
  let hasAssignment = false;
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const value = source as Record<string, unknown>;
    for (const provider of [value.print_provider, value.provider]) {
      if (provider == null) continue;
      if (provider !== 'gelato') throw new Error('Gelato print path refuses a non-Gelato provider assignment');
      hasAssignment = true;
    }
  }
  if (!hasAssignment) throw new Error('Gelato print path requires a verified Gelato provider assignment');
}

export function assertGelatoPrintOwnershipForOrder(
  expectedOrderId: string,
  source: unknown,
  expectedAssignment?: {
    configVersion: number;
    productUid: string;
    innerPageCount: number;
    apiPageCount: number;
    expectedPdfPageCount: number;
  },
): void {
  if (!source || typeof source !== 'object') {
    throw new Error('Gelato print path could not verify the persisted order row');
  }
  const value = source as Record<string, unknown>;
  const persistedOrderId = typeof value.orderId === 'string' ? value.orderId
    : typeof value.order_id === 'string' ? value.order_id : null;
  if (persistedOrderId !== expectedOrderId) throw new Error('Gelato print path order identity mismatch');
  assertGelatoPrintOwnership(value);
  if (expectedAssignment) {
    const fields: Array<[string, unknown]> = [
      ['print_config_version', expectedAssignment.configVersion],
      ['print_product_uid', expectedAssignment.productUid],
      ['print_inner_page_count', expectedAssignment.innerPageCount],
      ['print_api_page_count', expectedAssignment.apiPageCount],
      ['print_expected_pdf_page_count', expectedAssignment.expectedPdfPageCount],
    ];
    for (const [field, expected] of fields) {
      if (value[field] !== expected) throw new Error(`Gelato print path frozen assignment mismatch: ${field}`);
    }
  }
}

export function assertGelatoPrintOrderRowIdentity(
  expectedOrderId: string,
  expectedOrderDbId: number,
  source: unknown,
  expectedAssignment?: Parameters<typeof assertGelatoPrintOwnershipForOrder>[2],
): void {
  if (!source || typeof source !== 'object') {
    throw new Error('Gelato print path could not verify the persisted order row');
  }
  const rowId = Number((source as Record<string, unknown>).id);
  if (!Number.isSafeInteger(expectedOrderDbId) || rowId !== expectedOrderDbId) {
    throw new Error('Gelato print path order database identity mismatch');
  }
  assertGelatoPrintOwnershipForOrder(expectedOrderId, source, expectedAssignment);
}

export function assertNoNonGelatoPrintOwnership(...sources: Array<unknown>): void {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const value = source as Record<string, unknown>;
    for (const provider of [value.print_provider, value.provider]) {
      if (provider != null && provider !== 'gelato') {
        throw new Error('Gelato print path refuses a non-Gelato provider assignment');
      }
    }
  }
}
