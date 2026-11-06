#!/usr/bin/env node

/**
 * Little Hero Books - Amazon SP-API Middleware
 * Handles LWA authentication and API calls to Amazon Selling Partner API
 * Modern SP-API uses LWA tokens only (no SigV4 signing required)
 */

import express from 'express';
import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
config({ path: '../.env' });

const app = express();
app.use(express.json());

// Determine environment (sandbox or production)
const isSandbox = process.env.AMAZON_ENV === 'sandbox' || process.env.AMAZON_SANDBOX_MODE === 'true';

// Amazon SP-API Configuration - supports both sandbox and production
// Supports both new (AMZ_LWA_*) and legacy (AMZ_APP_*) variable names
const AMZ_CONFIG = {
  sandbox: {
    clientId: process.env.AMZ_LWA_CLIENT_ID_SANDBOX || process.env.AMZ_APP_CLIENT_ID_SANDBOX,
    clientSecret: process.env.AMZ_LWA_CLIENT_SECRET_SANDBOX || process.env.AMZ_APP_CLIENT_SECRET_SANDBOX,
    refreshToken: process.env.AMZ_LWA_REFRESH_TOKEN_SANDBOX || process.env.AMZ_APP_SANDBOX_REFRESH_TOKEN || process.env.AMZ_REFRESH_TOKEN,
    baseUrl: 'https://sandbox.sellingpartnerapi-na.amazon.com',
  },
  production: {
    clientId: process.env.AMZ_LWA_CLIENT_ID_PROD || process.env.AMZ_APP_CLIENT_ID_PROD || process.env.AMZ_APP_CLIENT_ID,
    clientSecret: process.env.AMZ_LWA_CLIENT_SECRET_PROD || process.env.AMZ_APP_CLIENT_SECRET_PROD || process.env.AMZ_APP_CLIENT_SECRET,
    refreshToken: process.env.AMZ_LWA_REFRESH_TOKEN_PROD || process.env.AMZ_APP_PROD_REFRESH_TOKEN || process.env.AMZ_REFRESH_TOKEN,
    baseUrl: process.env.AMZ_REGION === 'na' 
      ? 'https://sellingpartnerapi-na.amazon.com'
      : `https://sellingpartnerapi-${process.env.AMZ_REGION || 'na'}.amazon.com`,
  },
};

const currentConfig = isSandbox ? AMZ_CONFIG.sandbox : AMZ_CONFIG.production;
const marketplaceId = process.env.AMZ_MARKETPLACE_ID || 'ATVPDKIKX0DER';
const backendApiUrl = process.env.BACKEND_API_URL || 'http://localhost:3000';

// Access token cache (separate for sandbox and production)
const tokenCache = {
  sandbox: { token: null, expiry: null },
  production: { token: null, expiry: null },
};

/**
 * Get access token using LWA refresh token flow
 * Modern SP-API does NOT require SigV4/AWS IAM signing
 */
async function getAccessToken(useSandbox = isSandbox) {
  const cache = useSandbox ? tokenCache.sandbox : tokenCache.production;
  const config = useSandbox ? AMZ_CONFIG.sandbox : AMZ_CONFIG.production;

  // Return cached token if still valid
  if (cache.token && cache.expiry && Date.now() < cache.expiry) {
    return cache.token;
  }

  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error(`Missing LWA credentials for ${useSandbox ? 'sandbox' : 'production'}`);
  }
  
  try {
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LWA token request failed (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    if (!data.access_token) {
      throw new Error('LWA token response missing access_token');
    }
    
    // Cache token with 1 minute buffer before expiry
    cache.token = data.access_token;
    cache.expiry = Date.now() + (data.expires_in * 1000) - 60000;
    
    return cache.token;
  } catch (error) {
    console.error(`[Amazon Middleware] Failed to get ${useSandbox ? 'sandbox' : 'production'} access token:`, error.message);
    throw error;
  }
}

/**
 * Make authenticated SP-API request (no SigV4 signing required)
 */
async function makeSPAPIRequest(method, path, query = {}, body = null, useSandbox = isSandbox) {
  try {
    const accessToken = await getAccessToken(useSandbox);
    const config = useSandbox ? AMZ_CONFIG.sandbox : AMZ_CONFIG.production;

    const url = new URL(`${config.baseUrl}${path}`);
    Object.keys(query).forEach(key => {
      if (Array.isArray(query[key])) {
        // Handle array parameters (e.g., MarketplaceIds) - Amazon expects comma-separated
        url.searchParams.append(key, query[key].join(','));
      } else if (query[key] !== undefined && query[key] !== null) {
        // For MarketplaceIds as single string, pass as-is
        url.searchParams.append(key, String(query[key]));
      }
    });
    
    const headers = {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
    };
    
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `SP-API request failed (${response.status}): ${errorText}`;
      
      // Parse error if possible
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.errors?.[0]?.message || errorMessage;
      } catch (e) {
        // Use raw error text
      }
      
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error('[Amazon Middleware] SP-API request error:', error.message);
    throw error;
  }
}

/**
 * Parse customization into characterSpecs (matches W0's expected format)
 */
function parseCharacterSpecs(customization) {
  const getField = (keys) => {
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
    age: parseInt(getField(['Child\'s Age', 'Child Age', 'age', 'Age']) || '5', 10),
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
 * Normalize Amazon order data to internal payload format (W0-compatible)
 */
function normalizeOrderPayload(amazonOrder, orderItems = [], buyerInfo = null, shippingAddress = null, itemsBuyerInfo = null, itemResponses = null) {
  if (!amazonOrder || typeof amazonOrder !== 'object' || Array.isArray(amazonOrder) || !Array.isArray(orderItems)) {
    throw new Error('Invalid Amazon normalization source');
  }
  const normalizedShipping = shippingAddress ? {
    name: shippingAddress.Name,
    address: shippingAddress.AddressLine1 || '',
    address2: shippingAddress.AddressLine2 || '',
    city: shippingAddress.City || '',
    state: shippingAddress.StateOrRegion || '',
    zip: shippingAddress.PostalCode || '',
    country: shippingAddress.CountryCode || 'US',
    phone: shippingAddress.Phone || '',
  } : null;
  const items = Array.from(orderItems).map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid Amazon source item');
    const customization = item.BuyerCustomizedInfo?.CustomizedInfo || item.CustomizedInfo || item.BuyerInfo?.BuyerCustomizedInfo || {};
    if (typeof customization !== 'object' || customization === null || Array.isArray(customization)) {
      throw new Error('Invalid Amazon source customization');
    }
    return {
      orderItemId: item.OrderItemId,
      asin: item.ASIN,
      sku: item.SellerSKU,
      title: item.Title,
      quantity: item.QuantityOrdered,
      price: item.ItemPrice,
      customization,
      customizations: Object.entries(customization).map(([name, value]) => ({
        name, label: name, type: 'text', value: String(value),
      })),
    };
  });
  const total = items.reduce((sum, item) => sum + (typeof item.quantity === 'number' ? item.quantity : NaN), 0);
  const validTotal = items.length > 0 && items.every(item => Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 200)
    && Number.isSafeInteger(total) && total <= 200;
  return {
    amazonOrderId: amazonOrder.AmazonOrderId,
    orderId: amazonOrder.AmazonOrderId,
    id: amazonOrder.AmazonOrderId,
    purchaseDate: amazonOrder.PurchaseDate,
    orderDate: amazonOrder.PurchaseDate,
    orderStatus: amazonOrder.OrderStatus,
    status: 'pending_w0',
    marketplaceId: amazonOrder.MarketplaceId,
    customerEmail: buyerInfo?.BuyerEmail || null,
    buyer: buyerInfo ? { email: buyerInfo.BuyerEmail, name: buyerInfo.BuyerName } : null,
    ShippingAddress: shippingAddress,
    shippingAddress: normalizedShipping,
    orderDetails: { ...(validTotal ? { quantity: total } : {}), shippingAddress: normalizedShipping },
    items,
    lineItems: items.map(item => ({
      orderItemId: item.orderItemId,
      asin: item.asin,
      sku: item.sku,
      quantity: item.quantity,
      customizationFields: Object.entries(item.customization).map(([name, value]) => ({ name, text: String(value) })),
    })),
    ...(items.length === 1 ? { customization: items[0].customization } : {}),
    _raw: { order: amazonOrder, items: orderItems, itemsBuyerInfo, itemResponses, buyerInfo, shippingAddress },
  };
}

function normalizationForCaller(normalizedOrder) {
  const { itemsBuyerInfo: _backendOnly, itemResponses: _backendResponses, ...originalRawFields } = normalizedOrder._raw;
  return { ...normalizedOrder, _raw: originalRawFields };
}

// OrdersV0 uses OrderItems for both item endpoints. Preserve each complete response for backend checks.
function readCompleteOrderItemResponse(response, orderId) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(response) || (response.errors !== undefined &&
      (!Array.isArray(response.errors) || response.errors.length !== 0))) throw new Error('Incomplete Amazon item response');
  const payload = response.payload;
  if (!object(payload) || payload.AmazonOrderId !== orderId || !Array.isArray(payload.OrderItems) ||
      !Array.from(payload.OrderItems).every(object) ||
      (payload.NextToken !== undefined && (typeof payload.NextToken !== 'string' || payload.NextToken !== ''))) {
    throw new Error('Incomplete Amazon item response');
  }
  return payload;
}

/**
 * POST normalized order to backend API
 * Idempotent: uses amazonOrderId as key
 */
function backendSubmissionConfig() {
  const token = process.env.BACKEND_API_TOKEN?.trim();
  if (!token || /[\r\n]/.test(token)) throw new Error('Backend submission is not configured');
  if (backendApiUrl !== backendApiUrl.trim()) throw new Error('Invalid backend intake destination');
  const base = new URL(backendApiUrl);
  const permitted = base.origin === 'https://admin.littleherolabs.com' || base.origin === 'http://localhost:3000';
  if (!permitted || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Invalid backend intake destination');
  }
  const destination = new URL('/api/amazon/orders', base);
  if (destination.origin !== base.origin || destination.pathname !== '/api/amazon/orders') {
    throw new Error('Invalid backend intake destination');
  }
  return { destination: destination.href, token };
}

async function postOrderToBackend(normalizedOrder) {
  try {
    const { destination, token } = backendSubmissionConfig();
    const response = await fetch(destination, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(normalizedOrder),
      redirect: 'error',
    });
    if (!response.ok || ![200, 201].includes(response.status)) throw new Error('Backend intake refused submission');
    const acknowledgement = await response.json();
    if (!acknowledgement || acknowledgement.success !== true) throw new Error('Invalid backend intake acknowledgement');
    return { success: true };
  } catch {
    console.error('[Amazon Middleware] Backend submission failed');
    throw new Error('Backend submission failed');
  }
}

// ==================== ENDPOINTS ====================

// Health check
app.get('/health', (req, res) => {
  const config = isSandbox ? AMZ_CONFIG.sandbox : AMZ_CONFIG.production;
  res.json({
    ok: true,
    service: 'little-hero-books-amazon-middleware',
    version: '2.0.0',
    environment: isSandbox ? 'sandbox' : 'production',
    amazonConfig: {
      hasSandboxCreds: !!(AMZ_CONFIG.sandbox.clientId && AMZ_CONFIG.sandbox.clientSecret),
      hasProdCreds: !!(AMZ_CONFIG.production.clientId && AMZ_CONFIG.production.clientSecret),
      currentMode: isSandbox ? 'sandbox' : 'production',
      marketplaceId,
      baseUrl: config.baseUrl,
    },
    timestamp: new Date().toISOString(),
  });
});

// Sandbox connectivity test
app.get('/test-sandbox', async (req, res) => {
  try {
    console.log('[Amazon Middleware] Testing sandbox connectivity...');
    
    // Get sandbox access token
    const accessToken = await getAccessToken(true);
    console.log('[Amazon Middleware] ✅ Got sandbox access token');

    // Sandbox Orders API may have limited support - try minimal parameters first
    // Some sandbox endpoints don't support all query parameters
    const testParams = {
      MarketplaceIds: marketplaceId, // Single value, not array for sandbox
    };

    try {
      const result = await makeSPAPIRequest('GET', '/orders/v0/orders', testParams, null, true);
      
      res.json({
        success: true,
        message: 'Sandbox connectivity test passed',
        ordersFound: result.payload?.Orders?.length || 0,
        hasOrders: (result.payload?.Orders?.length || 0) > 0,
        timestamp: new Date().toISOString(),
      });
    } catch (ordersError) {
      // If Orders API fails, try a simpler endpoint to verify connectivity
      // Just getting the token is already a good connectivity test
      console.warn('[Amazon Middleware] Orders API test failed, but token was obtained:', ordersError.message);
      
      res.json({
        success: true,
        message: 'Sandbox connectivity verified (token obtained)',
        note: 'Orders API may have limited sandbox support',
        ordersApiError: ordersError.message,
        tokenObtained: true,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('[Amazon Middleware] Sandbox test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Get orders (polling endpoint)
app.get('/orders', async (req, res) => {
  try {
    const { 
      createdAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      orderStatuses = 'Unshipped,PartiallyShipped',
      maxResultsPerPage = 50,
      useSandbox: querySandbox = isSandbox,
    } = req.query;
    
    const params = {
      MarketplaceIds: [marketplaceId],
      CreatedAfter: createdAfter,
      OrderStatuses: orderStatuses,
      MaxResultsPerPage: parseInt(maxResultsPerPage, 10),
    };

    const result = await makeSPAPIRequest('GET', '/orders/v0/orders', params, null, querySandbox === 'true');
    const orders = result.payload?.Orders || [];

    res.json({
      success: true,
      orders,
      totalCount: orders.length,
      requestedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Amazon Middleware] Error fetching orders:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Get single order
app.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { useSandbox: querySandbox = isSandbox } = req.query;

    const result = await makeSPAPIRequest(
      'GET',
      `/orders/v0/orders/${orderId}`,
      { MarketplaceIds: [marketplaceId] },
      null,
      querySandbox === 'true'
    );
    
    res.json({
      success: true,
      order: result.payload,
      requestedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Amazon Middleware] Error fetching order ${req.params.orderId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      orderId: req.params.orderId,
      timestamp: new Date().toISOString(),
    });
  }
});

// Get order items
app.get('/orders/:orderId/items', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { useSandbox: querySandbox = isSandbox } = req.query;

    const result = await makeSPAPIRequest(
      'GET',
      `/orders/v0/orders/${orderId}/orderItems`,
      {},
      null,
      querySandbox === 'true'
    );

    res.json({
      success: true,
      orderId,
      items: result.payload?.OrderItems || [],
      requestedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Amazon Middleware] Error fetching items for order ${req.params.orderId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      orderId: req.params.orderId,
      timestamp: new Date().toISOString(),
    });
  }
});

// Get order items buyer info (for customizations)
app.get('/orders/:orderId/items/buyer-info', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { useSandbox: querySandbox = isSandbox } = req.query;

    const result = await makeSPAPIRequest(
      'GET',
      `/orders/v0/orders/${orderId}/orderItems/buyerInfo`,
      {},
      null,
      querySandbox === 'true'
    );
    
    res.json({
      success: true,
      orderId,
      buyerInfo: result.payload,
      requestedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Amazon Middleware] Error fetching buyer info for order ${req.params.orderId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      orderId: req.params.orderId,
      timestamp: new Date().toISOString(),
    });
  }
});

// Get order buyer info (PII - may require RDT)
app.get('/orders/:orderId/buyer-info', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { useSandbox: querySandbox = isSandbox } = req.query;

    const result = await makeSPAPIRequest(
      'GET',
      `/orders/v0/orders/${orderId}/buyerInfo`,
      {},
      null,
      querySandbox === 'true'
    );

    res.json({
      success: true,
      orderId,
      buyerInfo: result.payload,
      requestedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Amazon Middleware] Error fetching buyer info for order ${req.params.orderId}:`, error.message);
    res.status(500).json({
        success: false,
      error: error.message,
      orderId: req.params.orderId,
      timestamp: new Date().toISOString(),
    });
  }
});

// Get order address (PII - may require RDT)
app.get('/orders/:orderId/address', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { useSandbox: querySandbox = isSandbox } = req.query;

    const result = await makeSPAPIRequest(
      'GET',
      `/orders/v0/orders/${orderId}/address`,
      {},
      null,
      querySandbox === 'true'
    );
    
    res.json({
      success: true,
      orderId,
      address: result.payload,
      requestedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Amazon Middleware] Error fetching address for order ${req.params.orderId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      orderId: req.params.orderId,
      timestamp: new Date().toISOString(),
    });
  }
});

// Process order end-to-end: fetch all data, normalize, POST to backend
app.post('/orders/:orderId/process', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { useSandbox: querySandbox = isSandbox } = req.query;

    console.log(`[Amazon Middleware] Processing order ${orderId} (${querySandbox === 'true' ? 'sandbox' : 'production'})...`);

    // 1. Get order
    const orderResult = await makeSPAPIRequest(
      'GET',
      `/orders/v0/orders/${orderId}`,
      { MarketplaceIds: [marketplaceId] },
      null,
      querySandbox === 'true'
    );
    const order = orderResult.payload;

    // 2. Retain complete item responses. A failed or paginated read cannot become an empty order.
    const itemsResult = await makeSPAPIRequest('GET', `/orders/v0/orders/${orderId}/orderItems`, {}, null, querySandbox === 'true');
    const itemPayload = readCompleteOrderItemResponse(itemsResult, orderId);
    const orderItems = itemPayload.OrderItems;

    // 3. Buyer customization ZIP pointers join by OrderItemId in backend intake.
    const itemsBuyerResult = await makeSPAPIRequest('GET', `/orders/v0/orders/${orderId}/orderItems/buyerInfo`, {}, null, querySandbox === 'true');
    const itemsBuyerInfo = readCompleteOrderItemResponse(itemsBuyerResult, orderId);
    const itemResponses = { requestedOrderId: orderId, items: itemsResult, buyerInfo: itemsBuyerResult };

    // 4. Get order buyer info (PII)
    let buyerInfo = null;
    try {
      const buyerResult = await makeSPAPIRequest(
        'GET',
        `/orders/v0/orders/${orderId}/buyerInfo`,
        {},
        null,
        querySandbox === 'true'
      );
      buyerInfo = buyerResult.payload;
    } catch (error) {
      console.warn(`[Amazon Middleware] Could not fetch buyer info: ${error.message}`);
      // Continue without buyer info
    }

    // 5. Get order address (PII)
    let shippingAddress = null;
    try {
      const addressResult = await makeSPAPIRequest(
        'GET',
        `/orders/v0/orders/${orderId}/address`,
        {},
        null,
        querySandbox === 'true'
      );
      shippingAddress = addressResult.payload;
    } catch (error) {
      console.warn(`[Amazon Middleware] Could not fetch address: ${error.message}`);
      // Fallback to order.ShippingAddress if available
      shippingAddress = order.ShippingAddress || null;
    }

    // 6. Normalize order data
    const normalizedOrder = normalizeOrderPayload(order, orderItems, buyerInfo, shippingAddress, itemsBuyerInfo, itemResponses);

    // 7. POST to backend API (idempotent)
    const backendResult = await postOrderToBackend(normalizedOrder);
    
    res.json({
      success: true,
      orderId,
      normalized: normalizationForCaller(normalizedOrder),
      backendResponse: backendResult,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Amazon Middleware] Order processing failed');
    res.status(500).json({
      success: false,
      error: 'Order processing failed',
      orderId: req.params.orderId,
      timestamp: new Date().toISOString(),
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('[Amazon Middleware] Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

// Start server
const port = process.env.AMAZON_MIDDLEWARE_PORT || 4000;
app.listen(port, () => {
  console.log(`🚀 Amazon SP-API Middleware running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🧪 Sandbox test: http://localhost:${port}/test-sandbox`);
  console.log(`📦 Orders: http://localhost:${port}/orders`);
  console.log(`🌍 Environment: ${isSandbox ? 'SANDBOX' : 'PRODUCTION'}`);
});

export default app;
