import { NextRequest, NextResponse } from 'next/server';
import { getAvailableCharacterHashes, getAvailableOrderIds, getCharacterAssets, downloadManifest } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';
import { OrderStatus, ReviewStageStatus } from '@/constants/statuses';
import { listOrdersFromSupabase, upsertOrderByPerBookId } from '@/lib/supabase-client';
import { mapSupabaseOrderToOrder, mapManifestToOrder, mergeOrderData } from '@/lib/order-mapper';
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
  resolveOrderPathContext,
} from '@/lib/order-paths';
import { cleanPhoneNumber } from '@/lib/phone-utils';

function isChildBookRow(order: Order): boolean {
  return !!(order.rootOrderId && order.rootOrderId !== order.orderId);
}

function isRootGroupRow(order: Order): boolean {
  return !!(order.rootOrderId && order.rootOrderId === order.orderId);
}

function attachListSiblingMetadata(orders: Order[]): Order[] {
  const childGroupSizes = new Map<string, number>();

  for (const order of orders) {
    if (!isChildBookRow(order) || !order.rootOrderId) continue;
    childGroupSizes.set(
      order.rootOrderId,
      (childGroupSizes.get(order.rootOrderId) || 0) + 1
    );
  }

  return orders
    .filter((order) => {
      if (!isRootGroupRow(order) || !order.rootOrderId) {
        return true;
      }

      return (childGroupSizes.get(order.rootOrderId) || 0) === 0;
    })
    .map((order) => {
    if (!order.rootOrderId) {
      return order;
    }

    const groupSize = childGroupSizes.get(order.rootOrderId) || 0;
    return {
      ...order,
      isSibling: isChildBookRow(order) ? true : order.isSibling,
      totalSiblings: groupSize > 1 ? groupSize : order.totalSiblings,
    };
  });
}

/**
 * Create a minimal order with error indicator when mapping fails
 * This ensures orders with bad data still appear in the UI with error indicators
 */
function createErrorOrder(record: any, error: any): Order {
  const orderId = record.orderId || record.order_id || record.amazon_order_id || (record.id ? String(record.id) : 'unknown');
  const errorMessage = error?.message || String(error) || 'Unknown mapping error';
  const manifestHints = buildManifestKeyHintOptionsFromOrderLike(record);
  const project = manifestHints.bookId || record.project || 'unknown-book';
  const assetPrefix = manifestHints.orderPrefix || `${project}/orders/${orderId}`;
  
  return {
    orderId,
    platform: record.platform || 'amazon',
    amazonOrderId: record.amazon_order_id || undefined,
    rootOrderId:
      typeof record.root_order_id === 'string' && record.root_order_id.trim().length > 0
        ? record.root_order_id.trim()
        : undefined,
    isSibling:
      typeof record.root_order_id === 'string' &&
      record.root_order_id.trim().length > 0 &&
      record.root_order_id.trim() !== orderId,
    itemNumber:
      typeof orderId === 'string'
        ? (() => {
            const match = /-item-(\d+)$/.exec(orderId);
            if (!match) return undefined;
            const parsed = Number.parseInt(match[1], 10);
            return Number.isFinite(parsed) ? parsed : undefined;
          })()
        : undefined,
    project,
    customer: {
      firstName: record.customer_name ? String(record.customer_name).split(' ')[0] || 'Unknown' : 'Unknown',
      lastName: record.customer_name ? String(record.customer_name).split(' ').slice(1).join(' ') || '' : '',
      email: record.customer_email || 'unknown@example.com',
    },
    customerEmail: record.customer_email || undefined,
    orderDate: record.purchase_date || record.created_at || new Date().toISOString(),
    status: OrderStatus.ACTION_REQUIRED, // Mark as action required to show error
    characterSpecs: record.character_specs || {},
    bookSpecs: record.book_specs || {},
    orderDetails: {
      quantity: 1,
      pages: 16,
      format: '8.5x8.5_softcover',
      shippingAddress: record.shipping_address || {},
    },
    assetPrefix: `${assetPrefix.replace(/\/+$/, '')}/`,
    reviewStages: {
      preBria: { status: ReviewStageStatus.PENDING },
      postBria: { status: ReviewStageStatus.PENDING },
      postPdf: { status: ReviewStageStatus.PENDING },
    },
    executionStatus: record.execution_status || 'error',
    errorMessage: `Mapping error: ${errorMessage}`,
    errorType: 'mapping_error',
    webhooks: {
      onApprove: 'https://n8n.example.com/webhook/approve',
    },
  };
}

async function getOrders(request: NextRequest) {
  // Parse query parameters for lifecycle filtering
  const { searchParams } = new URL(request.url);
  const lifecycle = searchParams.get('lifecycle') as 'active' | 'recently_delivered' | 'all' | null;
  const includeArchived = searchParams.get('include_archived') === 'true';
  
  console.log(`[GET /api/orders] Starting orders fetch (lifecycle=${lifecycle || 'all'}, includeArchived=${includeArchived})...`);

  const safeFallback = (err?: unknown) => {
    console.warn('[GET /api/orders] Returning empty orders due to error.', err);
    return NextResponse.json([]);
  };

  try {
    let supabaseRecords: any[] = [];
    try {
      supabaseRecords = await listOrdersFromSupabase({
        lifecycle: lifecycle || undefined,
        includeArchived,
      });
    } catch (supabaseError) {
      console.error('[GET /api/orders] Supabase listOrdersFromSupabase failed:', supabaseError);
      supabaseRecords = [];
    }

    if (supabaseRecords.length > 0) {
      console.log('[GET /api/orders] Supabase returned', supabaseRecords.length, 'orders');
      // Map orders individually with error handling to prevent one bad order from breaking all orders
      // If mapping fails, create a minimal order with error indicators so it still appears in UI
      const supabaseOrders = await Promise.all(
        supabaseRecords.map(async (record) => {
          try {
            return await mapSupabaseOrderToOrder(record);
          } catch (error: any) {
            const orderId = record.orderId || record.order_id || record.amazon_order_id || record.id || 'unknown';
            console.error(
              `[GET /api/orders] Failed to map Supabase order ${orderId}:`,
              error?.message || error
            );
            // Create error order so it still appears in UI with error indicators
            return createErrorOrder(record, error);
          }
        })
      );
      
      const errorOrderCount = supabaseOrders.filter(o => o.errorType === 'mapping_error').length;
      if (errorOrderCount > 0) {
        console.warn(
          `[GET /api/orders] ${errorOrderCount} order(s) had mapping errors but are still visible with error indicators`
        );
      }

      const orders = await Promise.all(
        supabaseOrders.map(async (order) => {
          if (!needsCustomerEnrichment(order)) {
            return order;
          }

          try {
            const manifestOrder = await buildOrderFromManifest(order.orderId, order);
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

      return NextResponse.json(attachListSiblingMetadata(orders));
    }

    console.warn('[GET /api/orders] Supabase returned 0 orders. Returning empty list.');
    return NextResponse.json([]);
  } catch (error) {
    console.error('[GET /api/orders] Error in main orders flow:', error);
    return safeFallback(error);
  }
}

// Wrap in additional safety: always return 200 with [] if anything throws
async function getOrdersSafe(request: NextRequest) {
  try {
    return await getOrders(request);
  } catch (err) {
    console.error('[GET /api/orders] Unhandled error:', err);
    return NextResponse.json([]);
  }
}

export const GET = withErrorHandling(getOrdersSafe);

// POST /api/orders - Receive Amazon Custom orders and store in Supabase immediately
// This ensures orders are tracked in the backend even if n8n fails
async function postOrder(request: NextRequest) {
  console.log('[POST /api/orders] Received Amazon order');

  try {
    const json = await request.json();
    
    // Extract root/group Amazon order ID (required for Amazon-origin payloads).
    const amazonOrderId = json.amazonOrderId || json.AmazonOrderId || json.orderId || json.id;
    if (!amazonOrderId) {
      throw createValidationError('Missing amazonOrderId. Required field.');
    }
    // Sibling-safe identity: per-book order id is the write key; root id can be shared.
    const perBookOrderId = String(json.orderId || json.order_id || amazonOrderId).trim();

    // Normalize Amazon order data to Supabase schema
    // This matches what W0 expects, but stores immediately without waiting for n8n
    // Allow caller to specify execution_status (default: 'ready_for_processing')
    // Amazon cron will use 'pending_w0' to prevent router from picking up orders before W0 processes them
    const requestedStatus = json.execution_status || json.executionStatus;
    const orderData: any = {
      orderId: perBookOrderId,
      amazon_order_id: amazonOrderId,
      execution_status: requestedStatus || 'ready_for_processing', // Default or caller-specified
      next_workflow: requestedStatus === 'pending_w0' ? null : (json.next_workflow || json.nextWorkflow || '2A'), // W0 will set to '2A' if pending_w0
      queued_at: requestedStatus === 'pending_w0' ? null : new Date().toISOString(), // Don't queue if pending W0
      
      // Store raw Amazon order data for reference
      order_status: json.OrderStatus || json.orderStatus || 'Unshipped',
      purchase_date: json.PurchaseDate || json.purchaseDate || json.orderDate || new Date().toISOString(),
      marketplace_id: json.MarketplaceId || json.marketplaceId || 'ATVPDKIKX0DER',
      customer_email: json.BuyerInfo?.BuyerEmail || json.buyer?.email || json.customerEmail,
      customer_name: json.BuyerInfo?.BuyerName || json.buyer?.name || json.shippingAddress?.name,
      
      // Shipping address (required for Lulu API)
      // Clean phone number to remove extensions (Lulu API doesn't accept extensions)
      shipping_address: (() => {
        const amazonShipping = json.ShippingAddress || json.shippingAddress;
        if (amazonShipping) {
          const rawPhone = amazonShipping.Phone || amazonShipping.phone || amazonShipping.phoneNumber || amazonShipping.phone_number;
          const cleanedPhone = cleanPhoneNumber(rawPhone);
          return {
            ...amazonShipping,
            phone: cleanedPhone || amazonShipping.phone,
            phone_number: cleanedPhone || amazonShipping.phone_number
          };
        }
        // Fallback if no shipping address provided
        const rawPhone = json.ShippingAddress?.Phone || json.shippingAddress?.phone || json.shippingAddress?.phoneNumber || json.shippingAddress?.phone_number;
        return {
          name: json.shippingAddress?.name || json.BuyerInfo?.BuyerName,
          address: json.ShippingAddress?.AddressLine1 || json.shippingAddress?.address,
          city: json.ShippingAddress?.City || json.shippingAddress?.city,
          state: json.ShippingAddress?.StateOrRegion || json.shippingAddress?.state,
          zip: json.ShippingAddress?.PostalCode || json.shippingAddress?.zip,
          phone: cleanPhoneNumber(rawPhone),
          country: json.ShippingAddress?.CountryCode || json.shippingAddress?.country || 'US',
        };
      })(),
      
      // Character specs from Amazon Custom fields
      character_specs: json.characterSpecs || json.CharacterSpecs || {
        childName: json.childName || json.ChildName,
        age: json.childAge || json.ChildAge,
        skinTone: json.skinTone || json.SkinTone,
        hairColor: json.hairColor || json.HairColor,
        hairStyle: json.hairStyle || json.HairStyle,
        pronouns: json.pronouns || json.Pronouns,
        favoriteColor: json.favoriteColor || json.FavoriteColor,
        animalGuide: json.animalGuide || json.AnimalGuide || json.favoriteAnimal || json.FavoriteAnimal,
        clothingStyle: json.clothingStyle || json.ClothingStyle,
        hometown: json.hometown || json.Hometown,
      },
      
      // Book specs
      book_specs: json.bookSpecs || json.BookSpecs || {
        title: json.title || json.Title,
        totalPages: json.totalPages || json.TotalPages || 16,
        format: json.format || json.Format || '8.5x8.5_softcover',
        bookType: json.bookType || json.BookType || 'adventure',
      },
      
      // Dedication text
      dedication_text: json.dedication || json.Dedication || json.dedicationText || null,
      
      // Store full raw order data for debugging/reference
      product_info: json.Items || json.items || json.lineItems || json,
    };

    // Ensure timestamps are set
    const now = new Date().toISOString();
    if (!orderData.created_at) orderData.created_at = now;
    orderData.updated_at = now;

    const { data: result, error } = await upsertOrderByPerBookId(orderData);

    if (error) {
      console.error('[POST /api/orders] Supabase upsert error:', error);
      throw new Error(`Failed to store order in Supabase: ${error.message}`);
    }

    console.log(`[POST /api/orders] ✅ Order ${perBookOrderId} stored in Supabase`);

    return NextResponse.json({
      success: true,
      orderId: perBookOrderId,
      amazonOrderId,
      message: 'Order received and stored in Supabase',
      storedAt: new Date().toISOString(),
      executionStatus: orderData.execution_status,
      nextWorkflow: orderData.next_workflow,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[POST /api/orders] Error storing order:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to store order',
    }, { status: error?.status || 500 });
  }
}

export const POST = withErrorHandling(postOrder);

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
        assetPrefix: `unknown-book/orders/book-${String(index + 1).padStart(3, '0')}/`,
            reviewStages: {
              preBria: { status: ReviewStageStatus.PENDING },
              postBria: { status: ReviewStageStatus.PENDING },
              postPdf: { status: ReviewStageStatus.PENDING },
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

async function buildOrderFromManifest(
  orderId: string,
  orderLike?: unknown,
): Promise<Order> {
  let manifest: any = null;
  const manifestHints = buildManifestKeyHintOptionsFromOrderLike(orderLike);

  for (const stage of ['2a', '2b', '3'] as const) {
    for (const manifestKey of buildManifestKeyCandidates(orderId, stage, manifestHints)) {
      try {
        manifest = await downloadManifest(manifestKey);
        console.log(`[GET /api/orders] (fallback) Loaded ${stage} manifest for order ${orderId} from ${manifestKey}`);
        break;
      } catch (error: any) {
        console.log(
          `[GET /api/orders] (fallback) Failed to load ${stage} manifest for ${orderId} from ${manifestKey}:`,
          error?.message || error,
        );
      }
    }

    if (manifest) {
      break;
    }
  }

  const { bookId, orderPrefix } = resolveOrderPathContext(orderId, manifestHints);

  if (!manifest) {
    console.warn(`[GET /api/orders] (fallback) No manifest found for ${orderId}. Returning placeholder order.`);
    return {
      orderId,
      platform: 'amazon',
      amazonOrderId: orderId,
      project: bookId,
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
      assetPrefix: `${orderPrefix}/`,
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
