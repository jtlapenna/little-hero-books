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
import { z } from 'zod';

export const ExactAmazonPackageSchema = z.object({
  packageReferenceId: z.string().regex(/^[1-9]\d*$/), shipDate: z.string().datetime({ offset: true }),
  orderItems: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
});
export function buildExactAmazonShipmentPackage(params: { trackingNumber?: string | null; carrier?: string | null; exactPackage: z.infer<typeof ExactAmazonPackageSchema> }) {
  const exact = ExactAmazonPackageSchema.parse(params.exactPackage);
  if (!params.trackingNumber?.trim() || !params.carrier?.trim() || new Set(exact.orderItems.map((item) => item.orderItemId)).size !== exact.orderItems.length) throw new Error('Exact shipment tracking and item mapping required');
  const mapped = mapCarrierCode(params.carrier);
  if (mapped.carrierCode === 'Other') throw new Error('Exact shipment carrier is not supported');
  return { ...exact, ...mapped, shippingMethod: 'SHIPPING', trackingNumber: params.trackingNumber.trim() };
}

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
    const parsed = z.object({ OrderItems: z.array(z.object({ OrderItemId: z.string() })).optional() }).safeParse(response.payload ?? response);
    return parsed.success ? parsed.data.OrderItems?.[0]?.OrderItemId ?? null : null;
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
  exactPackage?: z.infer<typeof ExactAmazonPackageSchema>;
  signal?: AbortSignal;
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
  const orderItemId = params.exactPackage ? null : await resolveOrderItemId(params.order, config);
  if (!params.exactPackage && !orderItemId) return { success: false, error: 'Unable to resolve orderItemId' };

  const { carrierCode, carrierName } = mapCarrierCode(params.carrier);
  const trackingNumber = params.trackingNumber?.trim() || 'N/A';
  if (!params.trackingNumber?.trim()) {
    console.warn(`[confirmShipment] No tracking number for order ${parentOrderId} — using placeholder 'N/A'`);
  }

  try {
    const accessToken = await getAccessToken(config, { signal: params.signal, safeLogging: Boolean(params.exactPackage) });
    await callSellingPartnerApi({
      method: 'POST',
      signal: params.signal, safeLogging: Boolean(params.exactPackage),
      path: `/orders/v0/orders/${parentOrderId}/shipmentConfirmation`,
      accessToken,
      config,
      body: {
        marketplaceId: config.marketplaceId,
        codCollectionMethod: '',
        packageDetail: params.exactPackage ? buildExactAmazonShipmentPackage({ ...params, exactPackage: params.exactPackage }) : {
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
    if (params.exactPackage) return { success: false, error: 'Exact shipment confirmation was not confirmed' };
    const msg = err instanceof AmazonSpApiError ? err.message : (err instanceof Error ? err.message : String(err));
    console.error('[confirmShipment] Failed:', msg);
    return { success: false, error: msg };
  }
}
