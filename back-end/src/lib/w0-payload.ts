/**
 * Build W0 webhook payload for D2C orders.
 * Shape matches Amazon path (n8n W0) but omits amazon_order_id and marketplaceId.
 * See docs/D2C-planning/implementation-plan/D2C-phase-0-orders-only.md Section 6.
 */

/**
 * Build payload for n8n W0 from a D2C order record (Supabase row or mapped order).
 * Do not include amazonOrderId or marketplaceId.
 */
export function buildD2CW0Payload(order: Record<string, unknown>): Record<string, unknown> {
  const orderId = order.orderId ?? order.order_id ?? order.id;
  const orderDate = typeof order.purchase_date === 'string'
    ? order.purchase_date
    : (order.order_date as string) ?? new Date().toISOString();
  const customerEmail = order.customer_email as string | undefined;
  const customerName = order.customer_name as string | undefined;
  const characterSpecs = order.character_specs ?? order.characterSpecs ?? {};
  const characterHash = order.character_hash ?? order.characterHash;
  const shippingAddress = order.shipping_address ?? order.shippingAddress ?? {};
  const dedication = order.dedication_text ?? order.dedication ?? '';
  const productInfo = (order.product_info ?? order.productInfo) as Record<string, unknown> | undefined;

  const bookSpecs = productInfo?.totalPages != null
    ? { totalPages: productInfo.totalPages, format: productInfo.format ?? '8.5x8.5_softcover', bookType: 'adventure' }
    : { title: `${(characterSpecs as Record<string, unknown>).childName ?? 'Child'} and the Adventure Compass`, totalPages: 16, format: '8.5x8.5_softcover', bookType: 'adventure' };

  return {
    orderId,
    id: orderId,
    orderDate,
    purchaseDate: orderDate,
    status: 'queued_for_processing',
    customerEmail: customerEmail ?? '',
    buyer: {
      email: customerEmail ?? '',
      name: customerName ?? (shippingAddress as Record<string, unknown>)?.name ?? '',
    },
    // Purpose: match Amazon payload shape for downstream workflow compatibility.
    shippingAddress,
    shipping_address: shippingAddress,
    characterSpecs,
    character_specs: characterSpecs,
    bookSpecs,
    book_specs: bookSpecs,
    orderDetails: {
      quantity: 1,
      shippingAddress,
    },
    dedication,
    characterHash: characterHash ?? '',
    character_hash: characterHash ?? '',
  };
}
