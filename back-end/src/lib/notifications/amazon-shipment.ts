/**
 * Amazon confirmShipment — confirms shipment with tracking in Seller Central.
 * Triggers Amazon's built-in "Your order has shipped" email to the buyer.
 */

import {
  type AmazonSpApiConfig,
  AmazonSpApiError,
  getAmazonSpApiConfig,
  getAccessToken,
  callSellingPartnerApi,
  resolveAmazonOrderId,
} from '@/lib/amazon-sp-api';

// ---------------------------------------------------------------------------
// Carrier mapping (Lulu → Amazon)
// ---------------------------------------------------------------------------

const CARRIER_MAP: Record<string, { carrierCode: string; carrierName: string }> = {
  USPS:  { carrierCode: 'USPS',  carrierName: 'USPS' },
  UPS:   { carrierCode: 'UPS',   carrierName: 'UPS' },
  FEDEX: { carrierCode: 'FedEx', carrierName: 'FedEx' },
  DHL:   { carrierCode: 'DHL',   carrierName: 'DHL' },
  OSM:   { carrierCode: 'OSM',   carrierName: 'OSM' },
  'OSM WORLDWIDE': { carrierCode: 'OSM', carrierName: 'OSM' },
};

export function mapCarrierCode(luluCarrier: string | null | undefined): { carrierCode: string; carrierName: string } {
  if (!luluCarrier) return { carrierCode: 'Other', carrierName: 'Unknown' };
  const key = luluCarrier.trim().toUpperCase();
  return CARRIER_MAP[key] ?? { carrierCode: 'Other', carrierName: luluCarrier.trim() };
}

// ---------------------------------------------------------------------------
// Resolve orderItemId (two-tier: local DB → SP-API getOrderItems)
// ---------------------------------------------------------------------------

export async function resolveOrderItemId(
  order: { amazon_order_id?: string | null; product_info?: unknown },
  config: AmazonSpApiConfig,
): Promise<string | null> {
  // Tier 1: local product_info
  let pi: any = order.product_info;
  if (typeof pi === 'string') {
    try { pi = JSON.parse(pi); } catch { pi = null; }
  }
  const localId =
    pi?.line_items?.[0]?.order_item_id ??
    pi?._order_item_id ??
    pi?.order_item_id ??
    (Array.isArray(pi) ? pi[0]?.order_item_id : null);
  if (localId) return String(localId);

  // Tier 2: SP-API getOrderItems
  const parentOrderId = resolveAmazonOrderId(order);
  if (!parentOrderId) return null;

  try {
    const accessToken = await getAccessToken(config);
    const response = await callSellingPartnerApi({
      method: 'GET',
      path: `/orders/v0/orders/${parentOrderId}/orderItems`,
      accessToken,
      config,
      query: { MarketplaceIds: config.marketplaceId },
    });
    const items = response?.payload?.OrderItems ?? response?.OrderItems ?? [];
    return items[0]?.OrderItemId ?? null;
  } catch (err) {
    console.warn('[confirmShipment] Failed to fetch orderItems from SP-API:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// confirmAmazonShipment
// ---------------------------------------------------------------------------

export interface ConfirmShipmentParams {
  amazonOrderId: string;
  order: { amazon_order_id?: string | null; product_info?: unknown };
  trackingNumber?: string | null;
  carrier?: string | null;
  trackingUrl?: string | null;
}

export interface ConfirmShipmentResult {
  success: boolean;
  error?: string;
}

export async function confirmAmazonShipment(params: ConfirmShipmentParams): Promise<ConfirmShipmentResult> {
  const cfgResult = getAmazonSpApiConfig();
  if (!cfgResult.ok) return { success: false, error: cfgResult.error };
  const config = cfgResult.config;

  // Resolve parent Amazon order ID
  const parentOrderId = resolveAmazonOrderId(params.order) ?? params.amazonOrderId;
  if (!parentOrderId) return { success: false, error: 'No Amazon order ID available' };

  // Resolve orderItemId (required by API)
  const orderItemId = await resolveOrderItemId(params.order, config);
  if (!orderItemId) return { success: false, error: 'Unable to resolve orderItemId' };

  const { carrierCode, carrierName } = mapCarrierCode(params.carrier);
  const trackingNumber = params.trackingNumber?.trim() || 'N/A';
  if (!params.trackingNumber?.trim()) {
    console.warn(`[confirmShipment] No tracking number for order ${parentOrderId} — using placeholder 'N/A'`);
  }

  try {
    const accessToken = await getAccessToken(config);
    await callSellingPartnerApi({
      method: 'POST',
      path: `/orders/v0/orders/${parentOrderId}/shipmentConfirmation`,
      accessToken,
      config,
      body: {
        marketplaceId: config.marketplaceId,
        codCollectionMethod: '',
        packageDetail: {
          packageReferenceId: '1',
          carrierCode,
          carrierName,
          shippingMethod: 'SHIPPING',
          trackingNumber,
          shipDate: new Date().toISOString(),
          orderItems: [{ orderItemId, quantity: 1 }],
        },
      },
    });
    return { success: true };
  } catch (err) {
    const msg = err instanceof AmazonSpApiError ? err.message : (err instanceof Error ? err.message : String(err));
    console.error('[confirmShipment] Failed:', msg);
    return { success: false, error: msg };
  }
}
