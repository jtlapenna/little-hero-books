import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';
// Note: Cron jobs require Node.js runtime, not Edge

// Read environment variables at module load time (same pattern as router cron)
// This matches how the router cron route works, which successfully accesses CRON_SECRET
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake';

// Amazon SP-API credentials (check production-specific vars first, then fallback)
const amazonClientId = process.env.AMZ_LWA_CLIENT_ID_PROD 
  || process.env.AMZ_APP_CLIENT_ID 
  || process.env.AMAZON_SP_API_CLIENT_ID;
const amazonClientSecret = process.env.AMZ_LWA_CLIENT_SECRET_PROD
  || process.env.AMZ_APP_CLIENT_SECRET 
  || process.env.AMAZON_SP_API_CLIENT_SECRET;
const amazonRefreshToken = process.env.AMZ_APP_PROD_REFRESH_TOKEN
  || process.env.AMZ_REFRESH_TOKEN 
  || process.env.AMAZON_SP_API_REFRESH_TOKEN;
const amazonSellerId = process.env.AMZ_SELLER_ID || process.env.AMAZON_SP_API_SELLER_ID;
const amazonMarketplaceId = process.env.AMZ_MARKETPLACE_ID || process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';
const amazonRegion = process.env.AMZ_REGION || process.env.AMAZON_SP_API_REGION || 'na';
const amazonSandboxMode = process.env.AMAZON_SANDBOX_MODE === 'true';

/**
 * Process Amazon orders - exportable function for use in router cron
 */
export async function processAmazonOrders(
  supabase: any,
  options: {
    testMode?: boolean;
    executionId?: string;
    supabaseUrl: string;
    supabaseKey: string;
    n8nW0WebhookUrl: string;
    amazonClientId?: string;
    amazonClientSecret?: string;
    amazonRefreshToken?: string;
    amazonSellerId?: string;
    amazonMarketplaceId?: string;
    amazonRegion?: string;
    amazonSandboxMode?: boolean;
  }
): Promise<{
  ordersFound: number;
  ordersProcessed: number;
  errors?: Array<{ orderId: string; error: string }>;
  metrics?: any;
}> {
  const {
    testMode = false,
    executionId = `amazon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    supabaseUrl,
    supabaseKey,
    n8nW0WebhookUrl,
    amazonClientId,
    amazonClientSecret,
    amazonRefreshToken,
    amazonSellerId,
    amazonMarketplaceId = 'ATVPDKIKX0DER',
    amazonRegion = 'na',
    amazonSandboxMode = false,
  } = options;

  const startTime = Date.now();
  const metrics = {
    tokenFetchMs: 0,
    ordersFetchMs: 0,
    ordersProcessed: 0,
    webhookCallsMs: 0,
    totalMs: 0
  };

  console.log(`[Cron Amazon Orders] [${executionId}] Starting execution at ${new Date().toISOString()}`);
  if (testMode) {
    console.log(`[Cron Amazon Orders] [${executionId}] ⚠️ TEST MODE ENABLED - Using mock Amazon order data`);
  }

  try {
    let amazonOrders: any[] = [];
    let accessToken: string | null = null;
    
    if (testMode) {
      const ordersFetchStart = Date.now();
      amazonOrders = getMockAmazonOrders();
      metrics.ordersFetchMs = Date.now() - ordersFetchStart;
      metrics.tokenFetchMs = 0;
      console.log(`[Cron Amazon Orders] [${executionId}] TEST MODE: Generated ${amazonOrders.length} mock order(s)`);
    } else {
      if (!amazonClientId || !amazonClientSecret || !amazonRefreshToken) {
        throw new Error('Amazon SP-API credentials not configured');
      }

      const tokenStart = Date.now();
      accessToken = await getAmazonAccessTokenInternal(amazonClientId, amazonClientSecret, amazonRefreshToken);
      metrics.tokenFetchMs = Date.now() - tokenStart;

      if (!accessToken) {
        throw new Error('Failed to get Amazon access token');
      }

      console.log(`[Cron Amazon Orders] [${executionId}] Got Amazon access token (${metrics.tokenFetchMs}ms)`);

      const ordersFetchStart = Date.now();
      amazonOrders = await fetchAmazonOrdersInternal(accessToken, amazonMarketplaceId, amazonRegion, amazonSandboxMode);
      metrics.ordersFetchMs = Date.now() - ordersFetchStart;
    }

    if (!amazonOrders || amazonOrders.length === 0) {
      metrics.totalMs = Date.now() - startTime;
      console.log(`[Cron Amazon Orders] [${executionId}] No new orders found:`, {
        totalDuration: `${metrics.totalMs}ms`
      });
      return {
        ordersFound: 0,
        ordersProcessed: 0,
        metrics
      };
    }

    console.log(`[Cron Amazon Orders] [${executionId}] Found ${amazonOrders.length} new order(s):`, {
      orderIds: amazonOrders.map(o => o.AmazonOrderId),
      fetchDuration: `${metrics.ordersFetchMs}ms`
    });

    const webhookCallsStart = Date.now();
    const processedOrders: string[] = [];
    const errors: Array<{ orderId: string; error: string }> = [];

    for (const amazonOrder of amazonOrders) {
      try {
        let orderItems: any[] = [];
        if (testMode) {
          orderItems = amazonOrder.OrderItems || [];
          console.log(`[Cron Amazon Orders] [${executionId}] TEST MODE: Using mock order items for ${amazonOrder.AmazonOrderId}`);
        } else {
          if (!accessToken) {
            throw new Error('Access token not available for fetching order items');
          }
          orderItems = await fetchOrderItemsInternal(accessToken, amazonOrder.AmazonOrderId, amazonRegion, amazonSandboxMode);
        }
        
        const customization = parseCustomizationFromItems(orderItems);
        
        if (orderItems.length === 0 || Object.keys(customization).length === 0) {
          console.warn(`[Cron Amazon Orders] [${executionId}] Order ${amazonOrder.AmazonOrderId} has no customization data - skipping (will retry on next cron run)`);
          
          const rawRetryOrderId = amazonOrder.AmazonOrderId;
          const retryOrderIdValue = String(rawRetryOrderId || '').trim();
          
          if (!retryOrderIdValue || retryOrderIdValue.length === 0) {
            console.error(`[Cron Amazon Orders] [${executionId}] Invalid order ID for retry: ${rawRetryOrderId}`);
            errors.push({ orderId: rawRetryOrderId, error: 'Invalid order ID: cannot be empty after trimming' });
            continue;
          }
          
          const { error: storeError } = await supabase
            .from('orders')
            .upsert({
              orderId: retryOrderIdValue,
              amazon_order_id: retryOrderIdValue,
              execution_status: 'pending_w0',
              next_workflow: null,
              status: 'new',
              customer_email: amazonOrder.BuyerInfo?.BuyerEmail || null,
              marketplace_id: amazonOrder.MarketplaceId || amazonMarketplaceId,
              purchase_date: amazonOrder.PurchaseDate || new Date().toISOString(),
              updated_at: new Date().toISOString(),
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
          
          continue;
        }
        
        const orderData = await normalizeAmazonOrderInternal(amazonOrder, orderItems, customization, amazonMarketplaceId);
        
        const rawOrderId = orderData.amazon_order_id || orderData.amazonOrderId || orderData.orderId || amazonOrder.AmazonOrderId;
        const orderIdValue = String(rawOrderId || '').trim();
        
        if (!orderIdValue || orderIdValue.length === 0) {
          throw new Error(`Invalid order ID: cannot be empty after trimming. Original: ${rawOrderId}`);
        }
        
        const characterSpecs = orderData.character_specs || orderData.characterSpecs || orderData.CharacterSpecs || {};
        const characterHash = calculateCharacterHash(characterSpecs, orderIdValue);
        
        // Check if order already exists to avoid overwriting w0's progress
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('execution_status, next_workflow, workflow_step')
          .eq('amazon_order_id', orderIdValue)
          .single();
        
        // Only set execution_status and next_workflow if order is new or still in initial state
        // Don't overwrite if w0 has already processed it
        const isNewOrInitial = !existingOrder || 
          (existingOrder.execution_status === 'pending_w0' && existingOrder.next_workflow === null);
        
        const supabaseOrderData: any = {
          orderId: orderIdValue,
          amazon_order_id: orderIdValue,
          character_hash: characterHash,
          order_status: orderData.status || 'Unshipped',
          purchase_date: orderData.purchaseDate || orderData.orderDate,
          marketplace_id: orderData.marketplaceId,
          customer_email: orderData.customerEmail || orderData.buyer?.email,
          customer_name: orderData.buyer?.name || orderData.shippingAddress?.name,
          shipping_address: orderData.shippingAddress,
          character_specs: orderData.character_specs || orderData.characterSpecs || orderData.CharacterSpecs,
          dedication_text: orderData.dedication || orderData.Dedication,
          product_info: orderData.items || orderData.lineItems || orderItems,
          updated_at: new Date().toISOString(),
        };
        
        // Only set status/execution_status/next_workflow if order is new or still in initial state
        // This prevents overwriting w0's progress if it has already run
        if (isNewOrInitial) {
          supabaseOrderData.status = 'pending_w0';
          supabaseOrderData.execution_status = 'pending_w0';
          supabaseOrderData.next_workflow = null;
        }
        // If order already exists and w0 has processed it, don't overwrite those fields
        
        const { data: storedOrder, error: storeError } = await supabase
          .from('orders')
          .upsert(supabaseOrderData, {
            onConflict: 'amazon_order_id',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (storeError) {
          throw new Error(`Supabase store failed: ${storeError.message}`);
        }

        console.log(`[Cron Amazon Orders] [${executionId}] Stored order ${orderIdValue} in Supabase with character_hash: ${characterHash}`);

        // PSEUDOCODE (avoid W0 re-processing existing orders)
        // - Only call W0 if the order is actually pending W0 (or doesn't exist yet).
        // - If it's already moved past W0, do NOT call W0 again (it can reset next_workflow).
        const shouldTriggerW0 = !existingOrder || existingOrder.execution_status === 'pending_w0';
        if (!shouldTriggerW0) {
          console.log(
            `[Cron Amazon Orders] [${executionId}] Skipping W0 webhook for existing order ${orderIdValue} (execution_status=${existingOrder.execution_status}, next_workflow=${existingOrder.next_workflow})`
          );
          continue;
        }

        const webhookPayload = {
          ...orderData,
          characterHash: characterHash,
          character_hash: characterHash,
        };
        
        const webhookResponse = await fetch(n8nW0WebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
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

    return {
      ordersFound: amazonOrders.length,
      ordersProcessed: metrics.ordersProcessed,
      errors: errors.length > 0 ? errors : undefined,
      metrics
    };

  } catch (error: any) {
    metrics.totalMs = Date.now() - startTime;
    console.error(`[Cron Amazon Orders] [${executionId}] Unexpected error:`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
      metrics,
      totalDuration: `${metrics.totalMs}ms`
    });
    throw error;
  }
}

/**
 * Internal helper functions (extracted from original functions)
 */
async function getAmazonAccessTokenInternal(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    // Read response body once - can't read it twice in Cloudflare Workers
    const responseText = await response.text();
    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      const errorText = typeof data === 'string' ? data : (data.error || data.error_description || responseText || 'Unknown error');
      throw new Error(`Amazon token request failed (${response.status}): ${errorText}`);
    }
    if (!data.access_token) {
      throw new Error('Amazon token response missing access_token');
    }

    return data.access_token;
  } catch (error: any) {
    console.error('[Cron Amazon Orders] Failed to get access token:', error.message);
    throw error;
  }
}

async function fetchAmazonOrdersInternal(
  accessToken: string,
  marketplaceId: string,
  region: string,
  sandboxMode: boolean
): Promise<any[]> {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const createdAfter = yesterday.toISOString();

    const baseUrl = sandboxMode
      ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
      : (region === 'na'
          ? 'https://sellingpartnerapi-na.amazon.com'
          : `https://sellingpartnerapi-${region}.amazon.com`);

    const url = new URL(`${baseUrl}/orders/v0/orders`);
    url.searchParams.set('MarketplaceIds', marketplaceId || 'ATVPDKIKX0DER');
    
    if (!sandboxMode) {
      url.searchParams.set('CreatedAfter', createdAfter);
      url.searchParams.set('OrderStatuses', 'Unshipped');
      url.searchParams.set('MaxResultsPerPage', '50');
    }

    console.log(`[Cron Amazon Orders] Fetching orders from: ${url.toString()}`);
    console.log(`[Cron Amazon Orders] Sandbox mode: ${sandboxMode}, MarketplaceId: ${marketplaceId}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    // Read response body once - can't read it twice in Cloudflare Workers
    const responseText = await response.text();
    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      const errorText = responseText;
      
      if (sandboxMode && response.status === 400) {
        try {
          const errorJson = typeof data === 'object' ? data : JSON.parse(errorText);
          if (errorJson.errors?.[0]?.code === 'InvalidInput') {
            console.warn('[Cron Amazon Orders] Sandbox Orders API returned InvalidInput - endpoint may not be fully supported in sandbox');
            return [];
          }
        } catch (e) {
          // Continue with normal error handling
        }
      }
      
      // Log full error details for debugging
      let errorDetails = '';
      try {
        const errorJson = typeof data === 'object' ? data : JSON.parse(errorText);
        errorDetails = JSON.stringify(errorJson, null, 2);
        console.error(`[Cron Amazon Orders] Full error response (${response.status}):`, errorDetails);
        
        if (errorJson.errors && Array.isArray(errorJson.errors)) {
          errorJson.errors.forEach((err: any, i: number) => {
            console.error(`[Cron Amazon Orders] Error ${i + 1}:`, {
              code: err.code,
              message: err.message,
              details: err.details,
            });
          });
        }
      } catch (e) {
        errorDetails = errorText.substring(0, 500);
        console.error(`[Cron Amazon Orders] Error response (${response.status}, non-JSON):`, errorDetails);
      }
      
      if (response.status === 401) {
        throw new Error('Amazon authentication failed. Check your credentials.');
      }
      if (response.status === 429) {
        throw new Error('Amazon rate limit exceeded. Wait 60 seconds and retry.');
      }
      if (response.status === 403) {
        const errorMsg = errorDetails 
          ? `Amazon access forbidden. Check your SP-API permissions. Details: ${errorDetails.substring(0, 200)}`
          : 'Amazon access forbidden. Check your SP-API permissions.';
        throw new Error(errorMsg);
      }
      throw new Error(`Amazon API request failed (${response.status}): ${errorText.substring(0, 200)}`);
    }
    return data.payload?.Orders || [];
  } catch (error: any) {
    console.error('[Cron Amazon Orders] Failed to fetch orders:', error.message);
    throw error;
  }
}

async function fetchOrderItemsInternal(
  accessToken: string,
  orderId: string,
  region: string,
  sandboxMode: boolean
): Promise<any[]> {
  try {
    const baseUrl = sandboxMode
      ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
      : (region === 'na'
          ? 'https://sellingpartnerapi-na.amazon.com'
          : `https://sellingpartnerapi-${region}.amazon.com`);

    const url = `${baseUrl}/orders/v0/orders/${orderId}/orderItems`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    // Read response body once - can't read it twice in Cloudflare Workers
    const responseText = await response.text();
    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      const errorText = responseText;
      if (response.status === 404) {
        console.warn(`[Cron Amazon Orders] Order ${orderId} items not available yet (404)`);
        return [];
      }
      throw new Error(`Failed to fetch order items (${response.status}): ${errorText}`);
    }
    const orderItems = data.payload?.OrderItems || [];
    console.log(`[Cron Amazon Orders] Fetched ${orderItems.length} items for order ${orderId}`);
    return orderItems;
  } catch (error: any) {
    console.error(`[Cron Amazon Orders] Error fetching items for order ${orderId}:`, error.message);
    return [];
  }
}

async function normalizeAmazonOrderInternal(
  amazonOrder: any,
  orderItems: any[] = [],
  customization: Record<string, any> = {},
  marketplaceId: string
): Promise<any> {
  const amazonOrderId = amazonOrder.AmazonOrderId;
  const purchaseDate = amazonOrder.PurchaseDate || new Date().toISOString();
  const buyerEmail = amazonOrder.BuyerInfo?.BuyerEmail || null;
  const buyerName = amazonOrder.BuyerInfo?.BuyerName || null;

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

  const characterSpecs = parseCharacterSpecs(customization);
  const dedication = characterSpecs.dedication || '';

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
    character_specs: characterSpecs,
    CharacterSpecs: characterSpecs,
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
    Dedication: dedication,
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
    _rawAmazonOrder: amazonOrder,
    _rawOrderItems: orderItems,
    _rawCustomization: customization,
  };
}

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
  // Check for test mode (via query parameter ?test=true)
  const url = new URL(request.url);
  const testMode = url.searchParams.get('test') === 'true' || process.env.AMAZON_CRON_TEST_MODE === 'true';
  
  // Verify cron secret (security)
  // Try module load time first (matches router cron), fallback to runtime if needed
  const secretToUse = cronSecret || process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  
  if (!secretToUse) {
    const allEnvKeys = Object.keys(process.env || {});
    const envSample = allEnvKeys.slice(0, 10).join(', ');
    
    console.error('[Cron Amazon Orders] CRON_SECRET is undefined at both module load and runtime');
    console.error('[Cron Amazon Orders] Module load time:', !!cronSecret);
    console.error('[Cron Amazon Orders] Runtime check:', !!process.env.CRON_SECRET);
    console.error('[Cron Amazon Orders] Total env vars:', allEnvKeys.length);
    console.error('[Cron Amazon Orders] Sample env vars:', envSample);
    console.error('[Cron Amazon Orders] Router cron works, so CRON_SECRET should be available');
    
    return NextResponse.json({ 
      error: 'Server configuration error',
      message: 'CRON_SECRET is undefined. Check Vercel environment variables are set for Production.',
      debug: {
        moduleLoadTime: !!cronSecret,
        runtime: !!process.env.CRON_SECRET,
        envVarCount: allEnvKeys.length
      }
    }, { status: 500 });
  }
  
  if (authHeader !== `Bearer ${secretToUse}`) {
    console.error('[Cron Amazon Orders] Unauthorized - missing or invalid CRON_SECRET', {
      hasHeader: !!authHeader,
      headerLength: authHeader?.length || 0,
      cronSecretSet: !!secretToUse,
      cronSecretLength: secretToUse?.length || 0,
      headerValue: authHeader?.substring(0, 30) + '...',
      expectedPrefix: `Bearer ${secretToUse?.substring(0, 10)}...`
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

  try {
    const result = await processAmazonOrders(supabase, {
      testMode,
      executionId,
      supabaseUrl,
      supabaseKey,
      n8nW0WebhookUrl,
      amazonClientId,
      amazonClientSecret,
      amazonRefreshToken,
      amazonSellerId,
      amazonMarketplaceId,
      amazonRegion,
      amazonSandboxMode,
    });

    if (result.ordersFound === 0) {
      return NextResponse.json({
        skipped: true,
        reason: 'no_orders',
        executionId,
        metrics: result.metrics,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Amazon orders processed',
      executionId,
      ordersFound: result.ordersFound,
      ordersProcessed: result.ordersProcessed,
      errors: result.errors,
      metrics: result.metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error(`[Cron Amazon Orders] [${executionId}] Unexpected error:`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      {
        error: 'Internal server error',
        executionId,
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * Generate mock Amazon order data for testing
 * Returns orders in the same format as Amazon SP-API Orders API
 */
function getMockAmazonOrders(): any[] {
  const now = new Date();
  const orderId = `TEST-${now.getTime()}`;
  
  return [{
    AmazonOrderId: orderId,
    PurchaseDate: now.toISOString(),
    OrderStatus: 'Unshipped',
    MarketplaceId: amazonMarketplaceId || 'ATVPDKIKX0DER',
    BuyerInfo: {
      BuyerEmail: 'test@example.com',
      BuyerName: 'Test Customer'
    },
    ShippingAddress: {
      Name: 'Test Customer',
      AddressLine1: '123 Test Street',
      City: 'San Francisco',
      StateOrRegion: 'CA',
      PostalCode: '94102',
      CountryCode: 'US',
      Phone: '555-123-4567'
    },
    NumberOfItemsShipped: 1,
    NumberOfItemsUnshipped: 1,
    OrderTotal: {
      CurrencyCode: 'USD',
      Amount: '24.99'
    },
    // Mock order items with customization data (Amazon Custom format)
    OrderItems: [{
      OrderItemId: `${orderId}-ITEM-001`,
      SellerSKU: 'LHB-8X10-SOFTCOVER',
      Title: 'Little Hero Book - Custom Personalized',
      QuantityOrdered: 1,
      ItemPrice: {
        CurrencyCode: 'USD',
        Amount: '24.99'
      },
      // Amazon Custom customization fields
      BuyerCustomizedInfo: {
        CustomizedInfo: {
          "Child's Name": "Alex",
          "Child's Age": "5",
          "Skin Tone": "skin-medium",
          "Hair Color": "brown-light",
          "Hair Style": "curly-crop",
          "Pronouns": "they/them",
          "Favorite Color": "blue",
          "Animal Guide": "dog",
          "Clothing Style": "tee-shorts",
          "Hometown": "San Francisco",
          "Dedication Message": "To my amazing child, Alex! Love, Mom and Dad"
        }
      }
    }]
  }];
}

/**
 * Get Amazon SP-API access token using refresh token
 * (Legacy function - now calls internal version)
 */
async function getAmazonAccessToken(): Promise<string | null> {
  if (!amazonClientId || !amazonClientSecret || !amazonRefreshToken) {
    throw new Error('Amazon SP-API credentials not configured');
  }
  return getAmazonAccessTokenInternal(amazonClientId, amazonClientSecret, amazonRefreshToken);
}

/**
 * Fetch unshipped orders from Amazon SP-API
 * (Legacy function - now calls internal version)
 */
async function fetchAmazonOrders(accessToken: string): Promise<any[]> {
  return fetchAmazonOrdersInternal(
    accessToken,
    amazonMarketplaceId || 'ATVPDKIKX0DER',
    amazonRegion || 'na',
    amazonSandboxMode
  );
}

/**
 * Fetch order items from Amazon SP-API to get customization data
 * (Legacy function - now calls internal version)
 */
async function fetchOrderItems(accessToken: string, orderId: string): Promise<any[]> {
  return fetchOrderItemsInternal(
    accessToken,
    orderId,
    amazonRegion || 'na',
    amazonSandboxMode
  );
}

/**
 * Parse customization data from order items
 * 
 * EXPECTED AMAZON CUSTOM STRUCTURE:
 * OrderItems[0].BuyerCustomizedInfo.CustomizedInfo = {
 *   "Child's Name": "Alex",
 *   "Child's Age": "5",
 *   "Skin Tone": "skin-medium",
 *   "Hair Color": "brown-light",
 *   "Hair Style": "curly-crop",
 *   "Pronouns": "they/them",
 *   "Favorite Color": "blue",
 *   "Animal Guide": "dog",
 *   "Clothing Style": "tee-shorts",
 *   "Hometown": "San Francisco",
 *   "Dedication Message": "To my amazing child..."
 * }
 * 
 * NOTE: We log the actual structure when it differs from expected to help verify mapping
 */
function parseCustomizationFromItems(orderItems: any[]): Record<string, any> {
  if (!orderItems || orderItems.length === 0) {
    return {};
  }

  const firstItem = orderItems[0];
  
  // Log the actual structure for verification (first time we see it)
  // This helps us verify the real Amazon API structure matches our expectations
  if (process.env.AMAZON_DEBUG_STRUCTURE === 'true') {
    console.log('[Cron Amazon Orders] 🔍 DEBUG: Full order item structure:', JSON.stringify(firstItem, null, 2));
    console.log('[Cron Amazon Orders] 🔍 DEBUG: Available paths:', {
      'BuyerCustomizedInfo?.CustomizedInfo': !!firstItem?.BuyerCustomizedInfo?.CustomizedInfo,
      'CustomizedInfo': !!firstItem?.CustomizedInfo,
      'BuyerInfo?.BuyerCustomizedInfo': !!firstItem?.BuyerInfo?.BuyerCustomizedInfo,
      'CustomizationInfo': !!firstItem?.CustomizationInfo,
    });
  }

  // Try multiple locations for customization data (Amazon API structure can vary)
  const customization =
    firstItem?.BuyerCustomizedInfo?.CustomizedInfo ||
    firstItem?.CustomizedInfo ||
    firstItem?.BuyerInfo?.BuyerCustomizedInfo ||
    firstItem?.CustomizationInfo ||
    {};

  if (Object.keys(customization).length > 0) {
    const fields = Object.keys(customization);
    console.log(`[Cron Amazon Orders] ✅ Found customization fields (${fields.length}): ${fields.join(', ')}`);
    
    // Log unexpected field names to help identify mapping issues
    const expectedFields = [
      "Child's Name", "Child's Age", "Skin Tone", "Hair Color", "Hair Style",
      "Pronouns", "Favorite Color", "Animal Guide", "Clothing Style", 
      "Hometown", "Dedication Message"
    ];
    const unexpectedFields = fields.filter(f => !expectedFields.some(ef => 
      ef.toLowerCase().replace(/\s+/g, '') === f.toLowerCase().replace(/\s+/g, '')
    ));
    if (unexpectedFields.length > 0) {
      console.warn(`[Cron Amazon Orders] ⚠️  Unexpected customization fields (may need mapping): ${unexpectedFields.join(', ')}`);
    }
  } else {
    console.warn(`[Cron Amazon Orders] ⚠️  No customization data found in order items`);
    console.warn(`[Cron Amazon Orders] ⚠️  Item structure keys: ${Object.keys(firstItem || {}).join(', ')}`);
    
    // Log the structure if we can't find customization (helps debug)
    if (process.env.AMAZON_DEBUG_STRUCTURE === 'true') {
      console.warn('[Cron Amazon Orders] 🔍 DEBUG: First item structure:', JSON.stringify(firstItem, null, 2));
    }
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
 * (Legacy function - now calls internal version)
 */
async function normalizeAmazonOrder(
  amazonOrder: any,
  orderItems: any[] = [],
  customization: Record<string, any> = {}
): Promise<any> {
  const marketplaceId = amazonOrder.MarketplaceId || amazonMarketplaceId || 'ATVPDKIKX0DER';
  return normalizeAmazonOrderInternal(amazonOrder, orderItems, customization, marketplaceId);
}

/**
 * Calculate character hash from character specs and order ID
 * Includes orderId in hash to ensure uniqueness per order (prevents collisions)
 * Format: MD5 hash of (characterSpecs + orderId), first 16 characters
 */
function calculateCharacterHash(characterSpecs: Record<string, any>, orderId: string): string {
  // Sort character specs keys for consistent hashing
  const sortedSpecs = Object.keys(characterSpecs)
    .sort()
    .reduce((acc, key) => {
      acc[key] = characterSpecs[key];
      return acc;
    }, {} as Record<string, any>);
  
  // Include orderId in hash to make it unique per order
  // This prevents collisions when multiple orders have identical character specs
  const hashInput = JSON.stringify({ ...sortedSpecs, orderId });
  
  return createHash('md5')
    .update(hashInput)
    .digest('hex')
    .substring(0, 16);
}

