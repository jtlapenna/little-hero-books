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
function normalizeOrderPayload(amazonOrder, orderItems = [], buyerInfo = null, shippingAddress = null) {
  // Extract customization from order items
  const customization = {};
  if (orderItems && orderItems.length > 0) {
    const firstItem = orderItems[0];
    const customInfo = 
      firstItem?.BuyerCustomizedInfo?.CustomizedInfo ||
      firstItem?.CustomizedInfo ||
      firstItem?.BuyerInfo?.BuyerCustomizedInfo ||
      {};
    
    Object.assign(customization, customInfo);
  }

  // Parse character specs (W0-compatible format)
  const characterSpecs = parseCharacterSpecs(customization);
  const dedication = characterSpecs.dedication || '';

  // Normalize shipping address
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

  // Build normalized payload (matches W0's expected format)
  return {
    amazonOrderId: amazonOrder.AmazonOrderId,
    orderId: amazonOrder.AmazonOrderId,
    id: amazonOrder.AmazonOrderId,
    amazonOrderId: amazonOrder.AmazonOrderId,
    purchaseDate: amazonOrder.PurchaseDate,
    orderDate: amazonOrder.PurchaseDate,
    orderStatus: amazonOrder.OrderStatus,
    status: 'pending_w0',
    marketplaceId: amazonOrder.MarketplaceId || marketplaceId,
    customerEmail: buyerInfo?.BuyerEmail || null,
    buyer: buyerInfo ? {
      email: buyerInfo.BuyerEmail,
      name: buyerInfo.BuyerName,
    } : null,
    ShippingAddress: shippingAddress,
    shippingAddress: normalizedShipping,
    // W0-compatible fields
    characterSpecs: characterSpecs,
    character_specs: characterSpecs, // Supabase format
    CharacterSpecs: characterSpecs, // Alternative format
    bookSpecs: {
      title: `${characterSpecs.childName} and the Adventure Compass`,
      totalPages: 16,
      format: '8.5x8.5_softcover',
      bookType: 'adventure',
    },
    orderDetails: {
      quantity: parseInt(amazonOrder.NumberOfItemsShipped || amazonOrder.NumberOfItemsUnshipped || '1', 10),
      shippingAddress: normalizedShipping,
    },
    dedication: dedication,
    Dedication: dedication,
    items: orderItems.map(item => ({
      orderItemId: item.OrderItemId,
      asin: item.ASIN,
      sku: item.SellerSKU,
      title: item.Title,
      quantity: item.QuantityOrdered,
      price: item.ItemPrice,
      customizations: Object.entries(item.BuyerCustomizedInfo?.CustomizedInfo || item.CustomizedInfo || {}).map(([name, value]) => ({
        name: name,
        label: name,
        type: 'text',
        value: String(value),
      })),
    })),
    lineItems: [{
      customizationFields: Object.entries(customization).map(([name, value]) => ({
        name: name,
        text: String(value),
      })),
    }],
    customization, // Raw customization for reference
    // Raw data for reference
    _raw: {
      order: amazonOrder,
      items: orderItems,
      buyerInfo,
      shippingAddress,
    },
  };
}

/**
 * POST normalized order to backend API
 * Idempotent: uses amazonOrderId as key
 */
async function postOrderToBackend(normalizedOrder) {
  try {
    const response = await fetch(`${backendApiUrl}/api/amazon/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(normalizedOrder),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API failed (${response.status}): ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Amazon Middleware] Failed to POST order to backend:', error.message);
    throw error;
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

    // 2. Get order items
    let orderItems = [];
    try {
      const itemsResult = await makeSPAPIRequest(
        'GET',
        `/orders/v0/orders/${orderId}/orderItems`,
        {},
        null,
        querySandbox === 'true'
      );
      orderItems = itemsResult.payload?.OrderItems || [];
    } catch (error) {
      console.warn(`[Amazon Middleware] Could not fetch order items: ${error.message}`);
      // Continue without items
    }

    // 3. Get order items buyer info (for customizations)
    let itemsBuyerInfo = null;
    try {
      const itemsBuyerResult = await makeSPAPIRequest(
        'GET',
        `/orders/v0/orders/${orderId}/orderItems/buyerInfo`,
        {},
        null,
        querySandbox === 'true'
      );
      itemsBuyerInfo = itemsBuyerResult.payload;
    } catch (error) {
      console.warn(`[Amazon Middleware] Could not fetch items buyer info: ${error.message}`);
      // Continue without buyer info
    }

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
    const normalizedOrder = normalizeOrderPayload(order, orderItems, buyerInfo, shippingAddress);

    // 7. POST to backend API (idempotent)
    const backendResult = await postOrderToBackend(normalizedOrder);
    
    res.json({
      success: true,
      orderId,
      normalized: normalizedOrder,
      backendResponse: backendResult,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Amazon Middleware] Error processing order ${req.params.orderId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
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
