import { NextRequest, NextResponse } from 'next/server';
import { getAvailableCharacterHashes, getCharacterAssets, getAvailableOrderIds, downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';
import { OrderStatus, ReviewStageStatus } from '@/constants/statuses';
import { listOrdersFromSupabase } from '@/lib/supabase-client';
import { mapSupabaseOrderToOrder, mapManifestToOrder, mergeOrderData } from '@/lib/order-mapper';
import { cleanPhoneNumber } from '@/lib/phone-utils';

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
        (supabaseRecords as any[])
          .map((record: any) => (record.amazon_order_id || record.orderId || record.order_id || '').toString().toLowerCase())
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

// POST /api/orders - Receive Amazon Custom orders and store in Supabase immediately
// This ensures orders are tracked in the backend even if n8n fails
async function postOrder(request: NextRequest) {
  console.log('[POST /api/orders] Received Amazon order');

  try {
    const json = await request.json();
    
    // Extract Amazon order ID (required)
    const amazonOrderId = json.amazonOrderId || json.AmazonOrderId || json.orderId || json.id;
    if (!amazonOrderId) {
      throw createValidationError('Missing amazonOrderId. Required field.');
    }

    // Normalize Amazon order data to Supabase schema
    // This matches what W0 expects, but stores immediately without waiting for n8n
    // Allow caller to specify execution_status (default: 'ready_for_processing')
    // Amazon cron will use 'pending_w0' to prevent router from picking up orders before W0 processes them
    const requestedStatus = json.execution_status || json.executionStatus;
    const orderData: any = {
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

    // Upsert to Supabase using native upsert (more reliable than update-then-insert)
    const { supabase } = await import('@/lib/supabase-client');

    // Ensure timestamps are set
    const now = new Date().toISOString();
    if (!orderData.created_at) orderData.created_at = now;
    orderData.updated_at = now;

    // Use upsert with conflict resolution on amazon_order_id
    const { data: result, error } = await supabase
      .from('orders')
      .upsert(orderData, {
        onConflict: 'amazon_order_id',
        ignoreDuplicates: false, // Update if exists
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/orders] Supabase upsert error:', error);
      throw new Error(`Failed to store order in Supabase: ${error.message}`);
    }

    console.log(`[POST /api/orders] ✅ Order ${amazonOrderId} stored in Supabase`);

    return NextResponse.json({
      success: true,
      orderId: amazonOrderId,
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
        assetPrefix: `book-mvp-simple-adventure/orders/book-${String(index + 1).padStart(3, '0')}/`,
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
