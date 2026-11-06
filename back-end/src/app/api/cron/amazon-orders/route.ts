import { NextRequest, NextResponse } from 'next/server';
import { isDeepStrictEqual } from 'node:util';
import { readCsvRootRows, csvRowDeclaresInnerVoice, csvRowHasProgress, assertCompleteCsvRootUnits, csvRootNeedsCompleteUnits } from '@/lib/csv-book-selection';
import { buildSelectedAmazonPendingW0Payload } from '@/lib/w0-payload';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// Note: Cron jobs require Node.js runtime, not Edge

// Read environment variables at module load time (same pattern as router cron)
// This matches how the router cron route works, which successfully accesses CRON_SECRET
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL || '';

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
 * Recover stored Amazon orders. Fresh intake belongs to the middleware/API path.
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
        const rawRetryOrderId = amazonOrder.AmazonOrderId;
        const retryOrderIdValue = String(rawRetryOrderId || '').trim();

        if (typeof rawRetryOrderId !== 'string' || !retryOrderIdValue || rawRetryOrderId !== retryOrderIdValue) {
          console.error(`[Cron Amazon Orders] [${executionId}] Invalid order ID for retry: ${rawRetryOrderId}`);
          errors.push({ orderId: rawRetryOrderId, error: 'Invalid order ID: cannot be empty after trimming' });
          continue;
        }

        const rootRows = await readCsvRootRows(supabase, retryOrderIdValue, [{ orderId: retryOrderIdValue }]);
        if (!rootRows.length) throw new Error('Amazon fresh intake requires verified middleware/API admission');
        assertCompleteCsvRootUnits(rootRows, retryOrderIdValue);
        const inspectAll = csvRootNeedsCompleteUnits(rootRows);
        const ids = new Set<string>();
        const prepared: Array<{ orderId: string; payload: Record<string, unknown> }> = [];
        const object = (value: unknown): value is Record<string, unknown> =>
          value !== null && typeof value === 'object' && !Array.isArray(value);
        const present = (value: unknown) => value !== null && value !== undefined;
        const selectors = {
          bookId: ['bookId', 'book_id', 'project', 'print_book_id', 'printBookId'],
          formatId: ['formatId', 'format_id', 'print_format_id', 'printFormatId'],
          configVersion: ['configVersion', 'config_version', 'version', 'print_config_version', 'printConfigVersion'],
        };
        const nullableSelectors = new Set(['book_id', 'project', 'print_book_id', 'print_format_id', 'print_config_version']);
        for (const row of rootRows) {
          const orderId = row.orderId ?? row.order_id;
          if (typeof orderId !== 'string' || !orderId || orderId !== orderId.trim() ||
              [row.orderId, row.order_id].some(value => present(value) && value !== orderId) || ids.has(orderId)) {
            throw new Error('Ambiguous Amazon retry per-book identity');
          }
          ids.add(orderId);
          if (![row.root_order_id, row.amazon_order_id].includes(retryOrderIdValue) ||
              [row.root_order_id, row.amazon_order_id].some(value => present(value) && value !== retryOrderIdValue) ||
              (present(row.platform) && row.platform !== 'amazon')) {
            throw new Error('Conflicting Amazon retry root or platform');
          }
          const info = row.product_info;
          const progressRow = { ...row, ...(Array.isArray(info) ? { product_info: undefined } : {}),
            ...(Array.isArray(row.productInfo) ? { productInfo: undefined } : {}) };
          const progressed = csvRowHasProgress(progressRow) ||
            row.execution_status !== 'pending_w0' || present(row.next_workflow);
          if (progressed && !inspectAll) continue;
          const configured = csvRowDeclaresInnerVoice(row);
          if (configured && row.platform !== 'amazon') throw new Error('Missing frozen Amazon platform');
          if (Object.hasOwn(row, 'productInfo') && !isDeepStrictEqual(row.productInfo, info)) {
            throw new Error('Conflicting Amazon retry product info');
          }
          const hasRetryFlag = object(info) && ['_customization_missing', '_retry_on_next_cron'].some(key => Object.hasOwn(info, key));
          if (hasRetryFlag) {
            const emptyFields = ['character_specs', 'characterSpecs', 'CharacterSpecs', 'character_hash', 'characterHash',
              'dedication_text', 'dedication', 'Dedication', 'book_specs', 'bookSpecs'];
            const placeholder = orderId === retryOrderIdValue && row.status === 'new' &&
              !configured && emptyFields.every(key => !present(row[key])) &&
              Object.values(selectors).flat().every(key => !Object.hasOwn(row, key) ||
                row[key] === undefined || (nullableSelectors.has(key) && row[key] === null)) &&
              !Object.hasOwn(row, 'bookSpecs') && !Object.hasOwn(row, 'productInfo') &&
              info._customization_missing === true && info._retry_on_next_cron === true &&
              Object.keys(info).length === 2;
            if (!placeholder) throw new Error('Malformed Amazon retry placeholder');
            throw new Error('Amazon fresh intake requires verified middleware/API admission');
          }
          let shipping = row.shipping_address;
          if (!configured && typeof shipping === 'string') shipping = JSON.parse(shipping);
          const specs = row.character_specs;
          if (!object(shipping) || !Object.keys(shipping).length || !object(specs) || !Object.keys(specs).length) {
            throw new Error('Missing Amazon retry original customization or shipping');
          }
          if (Object.hasOwn(row, 'CharacterSpecs') && !isDeepStrictEqual(row.CharacterSpecs, specs)) {
            throw new Error('Conflicting Amazon retry original character specs');
          }
          const payload = buildSelectedAmazonPendingW0Payload({ ...row, platform: 'amazon', shipping_address: shipping });
          if (configured) {
            if (payload.bookId !== 'book-finding-our-inner-voice') throw new Error('Missing frozen Inner Voice selection');
            for (const [key, aliases] of Object.entries(selectors)) for (const alias of aliases) {
              if (Object.hasOwn(row, alias) && row[alias] !== undefined &&
                  !(nullableSelectors.has(alias) && row[alias] === null) && row[alias] !== payload[key]) {
                throw new Error('Conflicting Amazon retry frozen selection');
              }
            }
          } else {
            if (payload.bookId != null && payload.bookId !== 'book-mvp-simple-adventure') {
              throw new Error('Unsupported Amazon retry frozen book');
            }
            const legacyTuple: Record<string, unknown> = { bookId: 'book-mvp-simple-adventure',
              formatId: payload.formatId ?? 'amazon', configVersion: payload.configVersion ?? 1 };
            for (const [key, aliases] of Object.entries(selectors)) for (const alias of aliases) {
              if (Object.hasOwn(row, alias) && row[alias] !== undefined &&
                  !(nullableSelectors.has(alias) && row[alias] === null) && row[alias] !== legacyTuple[key]) {
                throw new Error('Unsupported Amazon retry legacy declaration');
              }
            }
            if (Array.isArray(info)) payload.items = info;
            payload.dedication = specs.dedication || row.dedication_text || null;
          }
          payload.CharacterSpecs = specs;
          payload.Dedication = payload.dedication;
          if (progressed) continue;
          prepared.push({ orderId, payload });
        }
        for (const item of prepared) {
          try {
            if (!n8nW0WebhookUrl) throw new Error('W0 webhook is not configured');
            const response = await fetch(n8nW0WebhookUrl, { method: 'POST',
              headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload),
              redirect: 'error', signal: AbortSignal.timeout(30_000) });
            if (!response.ok) throw new Error(`W0 retry failed: ${response.status}`);
            processedOrders.push(item.orderId);
            metrics.ordersProcessed++;
          } catch (error) {
            errors.push({ orderId: item.orderId, error: error instanceof Error ? error.message : 'W0 retry failed' });
          }
        }

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
    console.error('[Cron Amazon Orders] Unauthorized - missing or invalid CRON_SECRET');
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
