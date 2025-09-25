#!/usr/bin/env node

/**
 * Little Hero Books - Amazon SP-API Middleware
 * Handles authentication, signing, and API calls to Amazon Selling Partner API
 */

import express from 'express';
import { createHash, createHmac } from 'crypto';
import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
config({ path: '../.env' });

const app = express();
app.use(express.json());

// Amazon SP-API Configuration
const AMZ_CONFIG = {
  region: process.env.AMZ_REGION || 'us-east-1',
  marketplaceId: process.env.AMZ_MARKETPLACE_ID || 'ATVPDKIKX0DER',
  sellerId: process.env.AMZ_SELLER_ID,
  clientId: process.env.AMZ_APP_CLIENT_ID,
  clientSecret: process.env.AMZ_APP_CLIENT_SECRET,
  refreshToken: process.env.AMZ_REFRESH_TOKEN,
  baseUrl: `https://sellingpartnerapi-${process.env.AMZ_REGION || 'us-east-1'}.amazon.com`
};

// Access token cache
let accessToken = null;
let tokenExpiry = null;

// AWS Signature V4 implementation
function createSignatureV4(method, uri, query, headers, payload, region = 'us-east-1') {
  const algorithm = 'AWS4-HMAC-SHA256';
  const service = 'execute-api';
  const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const date = timestamp.substr(0, 8);
  
  // Create canonical request
  const canonicalUri = uri;
  const canonicalQueryString = Object.keys(query)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`)
    .join('&');
  
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(key => `${key.toLowerCase()}:${headers[key]}\n`)
    .join('');
  
  const signedHeaders = Object.keys(headers)
    .sort()
    .map(key => key.toLowerCase())
    .join(';');
  
  const payloadHash = createHash('sha256').update(payload || '').digest('hex');
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  // Create string to sign
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');
  
  // Calculate signature
  const kDate = createHmac('sha256', `AWS4${process.env.AWS_SECRET_ACCESS_KEY || 'dummy'}`, date).digest();
  const kRegion = createHmac('sha256', kDate, region).digest();
  const kService = createHmac('sha256', kRegion, service).digest();
  const kSigning = createHmac('sha256', kService, 'aws4_request').digest();
  const signature = createHmac('sha256', kSigning, stringToSign).digest('hex');
  
  // Create authorization header
  const authorization = `${algorithm} Credential=${process.env.AWS_ACCESS_KEY_ID || 'dummy'}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    authorization,
    'x-amz-date': timestamp,
    'x-amz-content-sha256': payloadHash
  };
}

// Get access token using refresh token
async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }
  
  try {
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: AMZ_CONFIG.refreshToken,
        client_id: AMZ_CONFIG.clientId,
        client_secret: AMZ_CONFIG.clientSecret
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
    }
    
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute buffer
    
    return accessToken;
  } catch (error) {
    console.error('Failed to get access token:', error.message);
    throw error;
  }
}

// Make authenticated SP-API request
async function makeSPAPIRequest(method, path, query = {}, body = null) {
  try {
    const accessToken = await getAccessToken();
    
    const url = new URL(`${AMZ_CONFIG.baseUrl}${path}`);
    Object.keys(query).forEach(key => url.searchParams.append(key, query[key]));
    
    const headers = {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json'
    };
    
    const payload = body ? JSON.stringify(body) : '';
    
    // Add AWS signature
    const signature = createSignatureV4(method, path, query, headers, payload, AMZ_CONFIG.region);
    Object.assign(headers, signature);
    
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: payload || undefined
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(`SP-API request failed: ${responseData.errors?.[0]?.message || responseData.message || 'Unknown error'}`);
    }
    
    return responseData;
  } catch (error) {
    console.error('SP-API request error:', error.message);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'little-hero-books-amazon-middleware',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    amazonConfig: {
      region: AMZ_CONFIG.region,
      marketplaceId: AMZ_CONFIG.marketplaceId,
      sellerId: AMZ_CONFIG.sellerId ? 'configured' : 'missing',
      clientId: AMZ_CONFIG.clientId ? 'configured' : 'missing',
      refreshToken: AMZ_CONFIG.refreshToken ? 'configured' : 'missing'
    },
    timestamp: new Date().toISOString()
  });
});

// Get orders (with filtering for Little Hero Books products)
app.get('/orders', async (req, res) => {
  try {
    const { 
      createdAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
      orderStatuses = 'Unshipped,PartiallyShipped',
      maxResultsPerPage = 10
    } = req.query;
    
    const orders = await makeSPAPIRequest('GET', '/orders/v0/orders', {
      MarketplaceIds: AMZ_CONFIG.marketplaceId,
      CreatedAfter: createdAfter,
      OrderStatuses: orderStatuses,
      MaxResultsPerPage: maxResultsPerPage
    });
    
    // Filter for Little Hero Books orders (custom products)
    const filteredOrders = orders.payload?.Orders?.filter(order => 
      order.OrderType === 'StandardOrder' && 
      order.SalesChannel?.includes('Custom') // Amazon Custom orders
    ) || [];
    
    res.json({
      success: true,
      orders: filteredOrders,
      totalCount: filteredOrders.length,
      requestedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching orders:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get order items with customization data
app.get('/orders/:orderId/items', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const orderItems = await makeSPAPIRequest('GET', `/orders/v0/orders/${orderId}/orderItems`);
    
    // Extract customization data from Amazon Custom orders
    const itemsWithCustomization = orderItems.payload?.OrderItems?.map(item => {
      const customization = {};
      
      // Parse Amazon Custom fields (these vary by listing setup)
      if (item.CustomizedInfo) {
        // Direct customization info
        Object.assign(customization, item.CustomizedInfo);
      }
      
      // Parse from product info or other fields
      if (item.ProductInfo?.NumberOfItems) {
        // Look for customization in product info
        const productInfo = item.ProductInfo;
        if (productInfo.Title?.includes('Personalized')) {
          // Extract customization from title or other fields
          // This depends on how your Amazon Custom listing is configured
        }
      }
      
      return {
        ...item,
        customization
      };
    }) || [];
    
    res.json({
      success: true,
      orderId,
      items: itemsWithCustomization,
      requestedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching order items:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      orderId: req.params.orderId,
      timestamp: new Date().toISOString()
    });
  }
});

// Confirm shipment with tracking
app.post('/orders/:orderId/confirm-shipment', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { 
      carrierCode = 'USPS',
      trackingNumber,
      shipDate = new Date().toISOString()
    } = req.body;
    
    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        error: 'trackingNumber is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const shipmentData = {
      packageDetail: {
        carrierCode,
        trackingNumber,
        shipDate
      }
    };
    
    const result = await makeSPAPIRequest('POST', `/orders/v0/orders/${orderId}/shipmentConfirmation`, shipmentData);
    
    res.json({
      success: true,
      orderId,
      trackingNumber,
      carrierCode,
      confirmedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error confirming shipment:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      orderId: req.params.orderId,
      timestamp: new Date().toISOString()
    });
  }
});

// Parse customization data from Amazon Custom order
app.post('/orders/:orderId/parse-customization', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Get order items first
    const orderItemsResponse = await makeSPAPIRequest('GET', `/orders/v0/orders/${orderId}/orderItems`);
    const items = orderItemsResponse.payload?.OrderItems || [];
    
    // Parse customization data (this is where you'd extract the specific fields)
    const customizationData = items.map(item => {
      // This is a template - customize based on your actual Amazon Custom listing fields
      const customization = {
        childName: null,
        childAge: null,
        hairColor: null,
        skinTone: null,
        favoriteAnimal: null,
        favoriteFood: null,
        favoriteColor: null,
        hometown: null,
        dedication: null
      };
      
      // Parse from item data - this depends on your Amazon Custom setup
      if (item.CustomizedInfo) {
        // Example parsing - adjust based on your actual field names
        const customInfo = item.CustomizedInfo;
        customization.childName = customInfo.child_name || customInfo.name;
        customization.childAge = customInfo.age;
        customization.hairColor = customInfo.hair_color || customInfo.hair;
        customization.skinTone = customInfo.skin_tone || customInfo.skin;
        customization.favoriteAnimal = customInfo.favorite_animal || customInfo.animal;
        customization.favoriteFood = customInfo.favorite_food || customInfo.food;
        customization.favoriteColor = customInfo.favorite_color || customInfo.color;
        customization.hometown = customInfo.hometown || customInfo.city;
        customization.dedication = customInfo.dedication || customInfo.message;
      }
      
      return {
        asin: item.ASIN,
        sku: item.SellerSKU,
        customization
      };
    });
    
    res.json({
      success: true,
      orderId,
      customizationData,
      parsedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error parsing customization:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      orderId: req.params.orderId,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Middleware error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
const port = process.env.AMAZON_MIDDLEWARE_PORT || 4000;
app.listen(port, () => {
  console.log(`🚀 Amazon SP-API Middleware running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`📦 Orders: http://localhost:${port}/orders`);
});

export default app;
