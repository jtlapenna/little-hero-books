import { NextRequest, NextResponse } from 'next/server';
import { getAvailableCharacterHashes, getCharacterAssets, getAvailableOrderIds, downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';
import { OrderStatus } from '@/constants/statuses';
import { listOrdersFromSupabase } from '@/lib/supabase-client';
import { mapSupabaseOrderToOrder, mapManifestToOrder, mergeOrderData } from '@/lib/order-mapper';

async function getOrders(_request: NextRequest) {
  console.log('[GET /api/orders] Starting orders fetch (Supabase first)...');

  try {
    const supabaseRecords = await listOrdersFromSupabase();

    if (supabaseRecords.length > 0) {
      console.log('[GET /api/orders] Supabase returned', supabaseRecords.length, 'orders');
      const supabaseOrders = await Promise.all(
        supabaseRecords.map((record) => mapSupabaseOrderToOrder(record))
      );

      const orders = await Promise.all(
        supabaseOrders.map(async (order) => {
          if (!needsCustomerEnrichment(order)) {
            return order;
          }

          try {
            const manifestOrder = await buildOrderFromManifest(order.orderId);
            return mergeOrderData(order, manifestOrder);
          } catch (error: any) {
            console.warn(
              `[GET /api/orders] Failed to enrich customer data for ${order.orderId}:`,
              error?.message || error
            );
            return order;
          }
        })
      );

      const existingOrderIds = new Set(
        orders.map((order) => order.orderId.toLowerCase())
      );
      const existingAmazonIds = new Set(
        supabaseRecords
          .map((record) => (record.amazon_order_id || record.orderId || record.order_id || '').toString().toLowerCase())
          .filter(Boolean)
      );

      const supplementalOrders = await loadMissingOrdersFromR2(existingOrderIds, existingAmazonIds);

      if (supplementalOrders.length > 0) {
        console.log('[GET /api/orders] Added', supplementalOrders.length, 'orders from R2 manifests to supplement Supabase list');
      }

      return NextResponse.json([...orders, ...supplementalOrders]);
    }

    console.warn('[GET /api/orders] Supabase returned 0 orders. Falling back to R2 manifests.');
  } catch (error) {
    console.error('[GET /api/orders] Error loading orders from Supabase. Falling back to R2 manifests.', error);
  }

  const fallback = await buildOrdersFromR2();

  const response = NextResponse.json(fallback.orders);

  if (fallback.debugInfo) {
    response.headers.set('X-Debug-Info', JSON.stringify(fallback.debugInfo));
  }

  return response;
}

export const GET = withErrorHandling(getOrders);

async function loadMissingOrdersFromR2(
  existingOrderIds: Set<string>,
  existingAmazonIds: Set<string>
) {
  const orders: Order[] = [];

  try {
    const orderIds = await getAvailableOrderIds();
    console.log('[GET /api/orders] (supplement) Found', orderIds.length, 'order IDs from R2');

    for (const orderId of orderIds) {
      if (!orderId || orderId.toLowerCase() === 'undefined') {
        continue;
      }

      const normalizedId = orderId.toLowerCase();

      if (existingOrderIds.has(normalizedId) || existingAmazonIds.has(normalizedId)) {
        continue;
      }

      try {
        const order = await buildOrderFromManifest(orderId);
        orders.push(order);
      } catch (error: any) {
        console.warn(`[GET /api/orders] (supplement) Failed to build order ${orderId} from manifest:`, error?.message || error);
      }
    }
  } catch (error: any) {
    console.error('[GET /api/orders] (supplement) Error fetching order IDs from R2:', error?.message || error);
  }

  return orders;
}

async function buildOrdersFromR2(): Promise<{
  orders: Order[];
  debugInfo?: {
    orderIdsFound: number;
    characterHashesFound: number;
    orderIds: string[];
    characterHashes: string[];
  };
}> {
  let orderIds: string[] = [];
  let characterHashes: string[] = [];

  try {
    orderIds = await getAvailableOrderIds();
    console.log('[GET /api/orders] (fallback) Found', orderIds.length, 'order IDs from orders bucket');
  } catch (error: any) {
    console.error('[GET /api/orders] (fallback) Error fetching order IDs from orders bucket:', error?.message || error);
  }

  if (orderIds.length === 0) {
    try {
      characterHashes = await getAvailableCharacterHashes();
      console.log('[GET /api/orders] (fallback) Found', characterHashes.length, 'character hashes');
    } catch (error: any) {
      console.error('[GET /api/orders] (fallback) Error fetching character hashes:', error?.message || error);
    }
  }
  
  if (orderIds.length === 0 && characterHashes.length === 0) {
    console.warn('[GET /api/orders] (fallback) No orders found in R2.');
    return { orders: [], debugInfo: { orderIdsFound: 0, characterHashesFound: 0, orderIds: [], characterHashes: [] } };
  }
  
  const orders: Order[] = [];
  
  if (orderIds.length > 0) {
    for (const orderId of orderIds) {
      if (!orderId || orderId.toLowerCase() === 'undefined') {
        continue;
      }

      try {
        const order = await buildOrderFromManifest(orderId);
        orders.push(order);
      } catch (error: any) {
        console.error(`[GET /api/orders] (fallback) Error loading manifest for order ${orderId}:`, error?.message || error);
      }
    }
        } else {
    orders.push(
      ...characterHashes.map((hash, index) => ({
        orderId: `book-${String(index + 1).padStart(3, '0')}-20250116-${hash.substring(0, 6)}`,
            platform: 'amazon',
        amazonOrderId: `TEST-ORDER-${String(index + 1).padStart(3, '0')}`,
        project: 'personalized-book',
            customer: {
          firstName: `Customer${index + 1}`,
          lastName: 'Test',
          email: `customer${index + 1}@example.com`,
            },
        customerEmail: `customer${index + 1}@example.com`,
        orderDate: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString(),
        status: OrderStatus.QUEUED_FOR_PROCESSING,
        characterHash: hash,
        characterPath: `characters/${hash}`,
            templatePath: 'templates',
            characterSpecs: {},
            bookSpecs: {},
            orderDetails: {
              quantity: 1,
              pages: 16,
          format: '8.5x8.5_softcover',
            },
        assetPrefix: `book-mvp-simple-adventure/orders/book-${String(index + 1).padStart(3, '0')}/`,
            reviewStages: {
              preBria: { status: 'pending' },
              postBria: { status: 'pending' },
          postPdf: { status: 'pending' },
            },
            webhooks: {
          onApprove: 'https://n8n.example.com/webhook/approve',
        },
      }))
    );
        }

  return {
    orders,
    debugInfo: {
      orderIdsFound: orderIds.length,
      characterHashesFound: characterHashes.length,
      orderIds: orderIds.slice(0, 10),
      characterHashes: characterHashes.slice(0, 10),
    },
  };
}

async function buildOrderFromManifest(orderId: string): Promise<Order> {
  let manifest: any = null;

  for (const stage of ['2a', '2b', '3'] as const) {
    try {
      const manifestKey = buildManifestKey(orderId, stage);
      manifest = await downloadManifest(manifestKey);
      console.log(`[GET /api/orders] (fallback) Loaded ${stage} manifest for order ${orderId}`);
      break;
      } catch (error: any) {
      console.log(`[GET /api/orders] (fallback) Failed to load ${stage} manifest for ${orderId}:`, error?.message || error);
      }
    }

  if (!manifest) {
    console.warn(`[GET /api/orders] (fallback) No manifest found for ${orderId}. Returning placeholder order.`);
    return {
      orderId,
      platform: 'amazon',
      amazonOrderId: orderId,
      project: 'book-mvp-simple-adventure',
      customer: {
        firstName: 'Unknown',
        lastName: 'Customer',
        email: 'unknown@example.com',
      },
      customerEmail: 'unknown@example.com',
      orderDate: new Date().toISOString(),
      status: OrderStatus.QUEUED_FOR_PROCESSING,
      templatePath: 'templates',
      characterSpecs: {},
      bookSpecs: {},
      orderDetails: {
        quantity: 1,
        pages: 16,
        format: '8.5x8.5_softcover',
      },
      assetPrefix: `book-mvp-simple-adventure/orders/${orderId}/`,
      reviewStages: {
        preBria: { status: 'pending' },
        postBria: { status: 'pending' },
        postPdf: { status: 'pending' },
      },
      webhooks: {
        onApprove: 'https://n8n.example.com/webhook/approve',
      },
    };
  }

  return mapManifestToOrder(orderId, manifest);
}

function needsCustomerEnrichment(order: Order): boolean {
  if (!order?.customer?.firstName) {
    return true;
  }

  const first = order.customer.firstName.trim().toLowerCase();
  const last = (order.customer.lastName || '').trim().toLowerCase();
  const combined = `${first} ${last}`.trim();

  const placeholderNames = new Set([
    'customer',
    'customer customer',
    'customer unknown',
    'customer pending',
    'unknown',
    'unknown customer',
  ]);

  return placeholderNames.has(first) || placeholderNames.has(combined);
}
