import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// Note: Cron jobs require Node.js runtime, not Edge

// Read environment variables at module load time (same pattern as router cron)
// This matches how the router cron route works, which successfully accesses CRON_SECRET
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake';

// Amazon SP-API credentials
const amazonClientId = process.env.AMZ_APP_CLIENT_ID || process.env.AMAZON_SP_API_CLIENT_ID;
const amazonClientSecret = process.env.AMZ_APP_CLIENT_SECRET || process.env.AMAZON_SP_API_CLIENT_SECRET;
const amazonRefreshToken = process.env.AMZ_REFRESH_TOKEN || process.env.AMAZON_SP_API_REFRESH_TOKEN;
const amazonSellerId = process.env.AMZ_SELLER_ID || process.env.AMAZON_SP_API_SELLER_ID;
const amazonMarketplaceId = process.env.AMZ_MARKETPLACE_ID || process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';
const amazonRegion = process.env.AMZ_REGION || process.env.AMAZON_SP_API_REGION || 'na';
const amazonSandboxMode = process.env.AMAZON_SANDBOX_MODE === 'true';

/**
 * GET /api/cron/amazon-orders
 * 
 * Vercel Cron job that polls Amazon SP-API for new orders and triggers W0 processing.
 * Runs once per day (free tier) or manually triggered.
 * 
 * Flow:
 * 1. Poll Amazon SP-API for new orders (last 24 hours)
 * 2. For each new order:
 *    a. Store in Supabase via POST /api/orders (with execution_status='pending_w0')
 *    b. Call W0 webhook with order data
 * 
 * Returns early (0 n8n executions) if:
 * - No new orders found
 * 
 * Calls n8n webhook (1 execution per order) if:
 * - New orders exist
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (security) - same pattern as router cron route
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Cron Amazon Orders] Unauthorized - missing or invalid CRON_SECRET', {
      hasHeader: !!authHeader,
      headerLength: authHeader?.length || 0,
      cronSecretSet: !!cronSecret,
      cronSecretLength: cronSecret?.length || 0
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('[Cron Amazon Orders] Supabase credentials not configured');
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  if (!n8nW0WebhookUrl) {
    console.error('[Cron Amazon Orders] N8N_W0_WEBHOOK_URL not configured');
    return NextResponse.json(
      { error: 'N8N W0 webhook URL not configured' },
      { status: 500 }
    );
  }

  if (!amazonClientId || !amazonClientSecret || !amazonRefreshToken) {
    console.error('[Cron Amazon Orders] Amazon SP-API credentials not configured');
    return NextResponse.json(
      { error: 'Amazon SP-API credentials not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const executionId = `amazon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const metrics = {
    tokenFetchMs: 0,
    ordersFetchMs: 0,
    ordersProcessed: 0,
    webhookCallsMs: 0,
    totalMs: 0
  };

  console.log(`[Cron Amazon Orders] [${executionId}] Starting execution at ${new Date().toISOString()}`);

  try {
    // 1. Get Amazon access token
    const tokenStart = Date.now();
    const accessToken = await getAmazonAccessToken();
    metrics.tokenFetchMs = Date.now() - tokenStart;

    if (!accessToken) {
      throw new Error('Failed to get Amazon access token');
    }

    console.log(`[Cron Amazon Orders] [${executionId}] Got Amazon access token (${metrics.tokenFetchMs}ms)`);

    // 2. Fetch orders from Amazon SP-API
    const ordersFetchStart = Date.now();
    const amazonOrders = await fetchAmazonOrders(accessToken);
    
    // 2a. Also check for orders in Supabase that need retry (customization data missing)
    // These are orders that were previously skipped because customization wasn't available
    const { data: retryOrders, error: retryError } = await supabase
      .from('orders')
      .select('amazon_order_id, purchase_date')
      .eq('execution_status', 'pending_w0')
      .is('next_workflow', null) // Orders that haven't been processed yet
      .or('product_info->>_customization_missing.is.true')
      .order('purchase_date', { ascending: true }) // Retry oldest first
      .limit(20); // Limit retries to avoid overwhelming the system
    
    if (!retryError && retryOrders && retryOrders.length > 0) {
      const retryOrderIds = retryOrders.map(o => o.amazon_order_id).filter(Boolean);
      console.log(`[Cron Amazon Orders] [${executionId}] Found ${retryOrderIds.length} orders needing retry:`, retryOrderIds);
      
      // Note: These orders will be retried when we process orders below
      // We'll check if they're in the amazonOrders list, and if not, we'll try to fetch their items
      // For now, the retry happens automatically when the cron runs again and finds them in Supabase
    }
    
    metrics.ordersFetchMs = Date.now() - ordersFetchStart;

    if (!amazonOrders || amazonOrders.length === 0) {
      metrics.totalMs = Date.now() - startTime;
      console.log(`[Cron Amazon Orders] [${executionId}] No new orders found:`, {
        totalDuration: `${metrics.totalMs}ms`
      });
      return NextResponse.json({
        skipped: true,
        reason: 'no_orders',
        executionId,
        metrics,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[Cron Amazon Orders] [${executionId}] Found ${amazonOrders.length} new order(s):`, {
      orderIds: amazonOrders.map(o => o.AmazonOrderId),
      fetchDuration: `${metrics.ordersFetchMs}ms`
    });

    // 3. Process each order: fetch items, parse customization, store in Supabase and trigger W0
    const webhookCallsStart = Date.now();
    const processedOrders: string[] = [];
    const errors: Array<{ orderId: string; error: string }> = [];

    for (const amazonOrder of amazonOrders) {
      try {
        // 3a. Fetch order items to get customization data
        const orderItems = await fetchOrderItems(accessToken, amazonOrder.AmazonOrderId);
        
        // 3b. Parse customization data from order items
        const customization = parseCustomizationFromItems(orderItems);
        
        // 3c. Check if customization data is available
        // If order items returned 404 or customization is empty, skip processing
        // Amazon sometimes takes a few minutes to populate order items after order creation
        if (orderItems.length === 0 || Object.keys(customization).length === 0) {
          console.warn(`[Cron Amazon Orders] [${executionId}] Order ${amazonOrder.AmazonOrderId} has no customization data - skipping (will retry on next cron run)`);
          
          // Store order in Supabase with a flag indicating it needs retry
          // This prevents it from being processed with defaults
          const { error: storeError } = await supabase
            .from('orders')
            .upsert({
              amazon_order_id: amazonOrder.AmazonOrderId,
              execution_status: 'pending_w0',
              next_workflow: null,
              status: 'new',
              // Store basic order info but mark that customization is missing
              customer_email: amazonOrder.BuyerInfo?.BuyerEmail || null,
              marketplace_id: amazonOrder.MarketplaceId || amazonMarketplaceId,
              purchase_date: amazonOrder.PurchaseDate || new Date().toISOString(),
              updated_at: new Date().toISOString(),
              // Add a note that customization data is missing
              product_info: { _customization_missing: true, _retry_on_next_cron: true },
            }, {
              onConflict: 'amazon_order_id',
              ignoreDuplicates: false,
            });

          if (storeError) {
            console.error(`[Cron Amazon Orders] [${executionId}] Failed to store order ${amazonOrder.AmazonOrderId} for retry:`, storeError.message);
            errors.push({ orderId: amazonOrder.AmazonOrderId, error: `Store for retry failed: ${storeError.message}` });
          } else {
            console.log(`[Cron Amazon Orders] [${executionId}] Stored order ${amazonOrder.AmazonOrderId} for retry (customization data not available yet)`);
          }
          
          // Skip W0 webhook call - will retry on next cron run
          continue;
        }
        
        // 3d. Normalize order data with customization
        const orderData = await normalizeAmazonOrder(amazonOrder, orderItems, customization);
        
        const { data: storedOrder, error: storeError } = await supabase
          .from('orders')
          .upsert({
            ...orderData,
            execution_status: 'pending_w0', // W0 will update to 'ready_for_processing'
            next_workflow: null, // W0 will set to '2A'
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'amazon_order_id',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (storeError) {
          throw new Error(`Supabase store failed: ${storeError.message}`);
        }

        console.log(`[Cron Amazon Orders] [${executionId}] Stored order ${amazonOrder.AmazonOrderId} in Supabase`);

        // 3b. Call W0 webhook with order data
        const webhookResponse = await fetch(n8nW0WebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(orderData),
        });

        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          throw new Error(`W0 webhook failed (${webhookResponse.status}): ${errorText.substring(0, 200)}`);
        }

        processedOrders.push(amazonOrder.AmazonOrderId);
        metrics.ordersProcessed++;
        console.log(`[Cron Amazon Orders] [${executionId}] ✅ Processed order ${amazonOrder.AmazonOrderId}`);

      } catch (error: any) {
        const orderId = amazonOrder.AmazonOrderId || 'unknown';
        const errorMsg = error?.message || String(error);
        errors.push({ orderId, error: errorMsg });
        console.error(`[Cron Amazon Orders] [${executionId}] ❌ Failed to process order ${orderId}:`, errorMsg);
        // Continue processing other orders even if one fails
      }
    }

    metrics.webhookCallsMs = Date.now() - webhookCallsStart;
    metrics.totalMs = Date.now() - startTime;

    console.log(`[Cron Amazon Orders] [${executionId}] Completed:`, {
      total: amazonOrders.length,
      processed: metrics.ordersProcessed,
      errors: errors.length,
      totalDuration: `${metrics.totalMs}ms`
    });

    return NextResponse.json({
      success: true,
      message: 'Amazon orders processed',
      executionId,
      ordersFound: amazonOrders.length,
      ordersProcessed: metrics.ordersProcessed,
      orderIds: processedOrders,
      errors: errors.length > 0 ? errors : undefined,
      metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    metrics.totalMs = Date.now() - startTime;
    console.error(`[Cron Amazon Orders] [${executionId}] Unexpected error:`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
      metrics,
      totalDuration: `${metrics.totalMs}ms`
    });
    return NextResponse.json(
      {
        error: 'Internal server error',
        executionId,
        details: error.message,
        metrics,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * Get Amazon SP-API access token using refresh token
 */
async function getAmazonAccessToken(): Promise<string | null> {
  try {
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: amazonRefreshToken!,
        client_id: amazonClientId!,
        client_secret: amazonClientSecret!,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Amazon token request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('Amazon token response missing access_token');
    }

    return data.access_token;
  } catch (error: any) {
    console.error('[Cron Amazon Orders] Failed to get access token:', error.message);
    throw error;
  }
}

/**
 * Fetch unshipped orders from Amazon SP-API
 */
async function fetchAmazonOrders(accessToken: string): Promise<any[]> {
  try {
    // Calculate time window (last 24 hours)
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const createdAfter = yesterday.toISOString();

    // SP-API endpoint (sandbox or production)
    const baseUrl = amazonSandboxMode
      ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
      : (amazonRegion === 'na'
          ? 'https://sellingpartnerapi-na.amazon.com'
          : `https://sellingpartnerapi-${amazonRegion}.amazon.com`);

    const url = new URL(`${baseUrl}/orders/v0/orders`);
    url.searchParams.set('MarketplaceIds', amazonMarketplaceId);
    url.searchParams.set('CreatedAfter', createdAfter);
    url.searchParams.set('OrderStatuses', 'Unshipped');
    url.searchParams.set('MaxResultsPerPage', '50');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error('Amazon authentication failed. Check your credentials.');
      }
      if (response.status === 429) {
        throw new Error('Amazon rate limit exceeded. Wait 60 seconds and retry.');
      }
      if (response.status === 403) {
        throw new Error('Amazon access forbidden. Check your SP-API permissions.');
      }
      throw new Error(`Amazon API request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const orders = data.payload?.Orders || [];

    // Check if we need to fetch order items for each order
    // For now, return basic order data - W0 will fetch items if needed
    return orders;
  } catch (error: any) {
    console.error('[Cron Amazon Orders] Failed to fetch orders:', error.message);
    throw error;
  }
}

/**
 * Fetch order items from Amazon SP-API to get customization data
 */
async function fetchOrderItems(accessToken: string, orderId: string): Promise<any[]> {
  try {
    // SP-API endpoint (sandbox or production)
    const baseUrl = amazonSandboxMode
      ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
      : (amazonRegion === 'na'
          ? 'https://sellingpartnerapi-na.amazon.com'
          : `https://sellingpartnerapi-${amazonRegion}.amazon.com`);

    const url = `${baseUrl}/orders/v0/orders/${orderId}/orderItems`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) {
        console.warn(`[Cron Amazon Orders] Order ${orderId} items not available yet (404)`);
        return []; // Return empty array if items not ready
      }
      throw new Error(`Failed to fetch order items (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const orderItems = data.payload?.OrderItems || [];

    console.log(`[Cron Amazon Orders] Fetched ${orderItems.length} items for order ${orderId}`);
    return orderItems;
  } catch (error: any) {
    console.error(`[Cron Amazon Orders] Error fetching items for order ${orderId}:`, error.message);
    // Return empty array on error - order can still be processed without customization
    return [];
  }
}

/**
 * Parse customization data from order items
 */
function parseCustomizationFromItems(orderItems: any[]): Record<string, any> {
  if (!orderItems || orderItems.length === 0) {
    return {};
  }

  // Try multiple locations for customization data (Amazon API structure can vary)
  const firstItem = orderItems[0];
  const customization =
    firstItem?.BuyerCustomizedInfo?.CustomizedInfo ||
    firstItem?.CustomizedInfo ||
    firstItem?.BuyerInfo?.BuyerCustomizedInfo ||
    firstItem?.CustomizationInfo ||
    {};

  if (Object.keys(customization).length > 0) {
    console.log(`[Cron Amazon Orders] Found customization fields: ${Object.keys(customization).join(', ')}`);
  } else {
    console.warn(`[Cron Amazon Orders] No customization data found in order items`);
  }

  return customization;
}

/**
 * Parse Amazon customization into character specs
 */
function parseCharacterSpecs(customization: Record<string, any>): any {
  const getField = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = customization[key];
      if (value !== undefined && value !== null && value !== '') {
        return String(value);
      }
    }
    return null;
  };

  return {
    childName: getField(['Child\'s Name', 'Child Name', 'childName', 'ChildName']) || 'Hero',
    age: parseInt(getField(['Child\'s Age', 'Child Age', 'age', 'Age']) || '5'),
    pronouns: getField(['Pronouns', 'pronouns']) || 'they/them',
    skinTone: (getField(['Skin Tone', 'skinTone', 'SkinTone']) || 'medium').toLowerCase(),
    hairColor: (getField(['Hair Color', 'hairColor', 'HairColor']) || 'brown').toLowerCase(),
    hairStyle: (getField(['Hair Style', 'hairStyle', 'HairStyle']) || 'short/straight').toLowerCase(),
    favoriteColor: (getField(['Favorite Color', 'favoriteColor', 'FavoriteColor']) || 'blue').toLowerCase(),
    animalGuide: getField(['Animal Guide', 'animalGuide', 'AnimalGuide']) || 'dog',
    clothingStyle: (getField(['Clothing Style', 'clothingStyle', 'ClothingStyle']) || 't-shirt and shorts').toLowerCase(),
    hometown: getField(['Hometown', 'hometown', 'Home Town']) || null,
    dedication: getField(['Dedication Message', 'dedication', 'Dedication']) || '',
  };
}

/**
 * Normalize Amazon order data to match W0's expected format
 */
async function normalizeAmazonOrder(
  amazonOrder: any,
  orderItems: any[] = [],
  customization: Record<string, any> = {}
): Promise<any> {
  // Extract basic order info
  const amazonOrderId = amazonOrder.AmazonOrderId;
  const purchaseDate = amazonOrder.PurchaseDate || new Date().toISOString();
  const marketplaceId = amazonOrder.MarketplaceId || amazonMarketplaceId;
  const buyerEmail = amazonOrder.BuyerInfo?.BuyerEmail || null;
  const buyerName = amazonOrder.BuyerInfo?.BuyerName || null;

  // Extract shipping address
  const shippingAddress = amazonOrder.ShippingAddress || {};
  const normalizedShipping = {
    name: shippingAddress.Name || buyerName || 'Unknown',
    address: shippingAddress.AddressLine1 || '',
    address2: shippingAddress.AddressLine2 || '',
    city: shippingAddress.City || '',
    state: shippingAddress.StateOrRegion || '',
    zip: shippingAddress.PostalCode || '',
    phone: shippingAddress.Phone || '',
    country: shippingAddress.CountryCode || 'US',
  };

  // Parse character specs from customization data
  const characterSpecs = parseCharacterSpecs(customization);
  const dedication = characterSpecs.dedication || '';

  // Build standardized order object matching W0's expected format
  return {
    amazon_order_id: amazonOrderId,
    orderId: amazonOrderId,
    id: amazonOrderId,
    amazonOrderId: amazonOrderId,
    orderDate: purchaseDate,
    purchaseDate: purchaseDate,
    createdAt: new Date().toISOString(),
    status: 'pending_w0',
    marketplaceId: marketplaceId,
    customerEmail: buyerEmail,
    buyer: {
      email: buyerEmail,
      name: buyerName,
    },
    ShippingAddress: shippingAddress,
    shippingAddress: normalizedShipping,
    characterSpecs: characterSpecs,
    CharacterSpecs: characterSpecs, // Support both camelCase and PascalCase
    bookSpecs: {
      title: `${characterSpecs.childName} and the Adventure Compass`,
      totalPages: 16,
      format: '8.5x8.5_softcover',
      bookType: 'adventure',
    },
    orderDetails: {
      quantity: parseInt(amazonOrder.NumberOfItemsShipped || amazonOrder.NumberOfItemsUnshipped || '1'),
      shippingAddress: normalizedShipping,
    },
    dedication: dedication,
    Dedication: dedication, // Support both formats
    items: orderItems.length > 0 ? [{
      sku: orderItems[0]?.SellerSKU || 'LHB-8X10-SOFTCOVER',
      quantity: 1,
      customizations: Object.entries(customization).map(([name, value]) => ({
        name: name,
        label: name,
        type: 'text',
        value: String(value),
      })),
    }] : [],
    lineItems: [{
      customizationFields: Object.entries(customization).map(([name, value]) => ({
        name: name,
        text: String(value),
      })),
    }],
    // Store raw data for reference
    _rawAmazonOrder: amazonOrder,
    _rawOrderItems: orderItems,
    _rawCustomization: customization,
  };
}

