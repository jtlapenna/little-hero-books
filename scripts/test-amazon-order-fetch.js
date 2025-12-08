#!/usr/bin/env node
/**
 * Test Amazon Order Fetch
 * 
 * Manually test fetching orders from Amazon SP-API to diagnose why orders aren't appearing
 * 
 * Usage:
 *   node scripts/test-amazon-order-fetch.js
 * 
 * Requires .env.local with:
 *   AMZ_APP_CLIENT_ID
 *   AMZ_APP_CLIENT_SECRET
 *   AMZ_REFRESH_TOKEN
 *   AMZ_MARKETPLACE_ID (optional, defaults to ATVPDKIKX0DER)
 *   AMAZON_SANDBOX_MODE (optional, defaults to false)
 */

require('dotenv').config({ path: '.env.local' });

const amazonClientId = process.env.AMZ_APP_CLIENT_ID || process.env.AMAZON_SP_API_CLIENT_ID;
const amazonClientSecret = process.env.AMZ_APP_CLIENT_SECRET || process.env.AMAZON_SP_API_CLIENT_SECRET;
const amazonRefreshToken = process.env.AMZ_REFRESH_TOKEN || process.env.AMAZON_SP_API_REFRESH_TOKEN;
const amazonMarketplaceId = process.env.AMZ_MARKETPLACE_ID || process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';
const amazonSandboxMode = process.env.AMAZON_SANDBOX_MODE === 'true';
const amazonRegion = process.env.AMZ_REGION || process.env.AMAZON_SP_API_REGION || 'na';

async function getAmazonAccessToken() {
  console.log('🔑 Getting Amazon access token...');
  
  const response = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: amazonRefreshToken,
      client_id: amazonClientId,
      client_secret: amazonClientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Token response missing access_token');
  }

  console.log('✅ Got access token');
  return data.access_token;
}

async function fetchAmazonOrders(accessToken) {
  console.log('📦 Fetching orders from Amazon SP-API...');
  
  // Calculate time window (last 7 days to be safe)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const createdAfter = sevenDaysAgo.toISOString();

  const baseUrl = amazonSandboxMode
    ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
    : (amazonRegion === 'na'
        ? 'https://sellingpartnerapi-na.amazon.com'
        : `https://sellingpartnerapi-${amazonRegion}.amazon.com`);

  const url = new URL(`${baseUrl}/orders/v0/orders`);
  url.searchParams.set('MarketplaceIds', amazonMarketplaceId);
  
  if (!amazonSandboxMode) {
    url.searchParams.set('CreatedAfter', createdAfter);
    url.searchParams.set('OrderStatuses', 'Unshipped');
    url.searchParams.set('MaxResultsPerPage', '50');
  }

  console.log(`📍 Fetching from: ${url.toString()}`);
  console.log(`   Sandbox mode: ${amazonSandboxMode}`);
  console.log(`   Marketplace: ${amazonMarketplaceId}`);
  console.log(`   Time window: Last 7 days (from ${createdAfter})`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  console.log(`📊 Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Error response:', errorText);
    
    if (response.status === 401) {
      throw new Error('Authentication failed. Check your credentials.');
    }
    if (response.status === 403) {
      throw new Error('Access forbidden. Check SP-API app permissions (needs "Orders" role).');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Wait 60 seconds and retry.');
    }
    throw new Error(`API request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const orders = data.payload?.Orders || [];

  console.log(`✅ Found ${orders.length} order(s)`);
  
  if (orders.length > 0) {
    console.log('\n📋 Order IDs:');
    orders.forEach((order, index) => {
      console.log(`   ${index + 1}. ${order.AmazonOrderId}`);
      console.log(`      Status: ${order.OrderStatus}`);
      console.log(`      Purchase Date: ${order.PurchaseDate}`);
      console.log(`      Items: ${order.NumberOfItemsShipped + order.NumberOfItemsUnshipped}`);
    });
  } else {
    console.log('\n⚠️  No orders found. Possible reasons:');
    console.log('   1. No orders in last 7 days with "Unshipped" status');
    console.log('   2. Order is too new (Amazon may take 10-30 minutes to appear in API)');
    console.log('   3. Order status is not "Unshipped"');
    console.log('   4. Sandbox mode (sandbox may not return real orders)');
    console.log('   5. SP-API app missing "Orders" role/permission');
  }

  return orders;
}

async function main() {
  console.log('🧪 Amazon Order Fetch Diagnostic Test\n');
  console.log('Configuration:');
  console.log(`   Client ID: ${amazonClientId ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Client Secret: ${amazonClientSecret ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Refresh Token: ${amazonRefreshToken ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Marketplace ID: ${amazonMarketplaceId}`);
  console.log(`   Sandbox Mode: ${amazonSandboxMode}`);
  console.log(`   Region: ${amazonRegion}\n`);

  if (!amazonClientId || !amazonClientSecret || !amazonRefreshToken) {
    console.error('❌ Missing required Amazon credentials in .env.local');
    console.error('   Required: AMZ_APP_CLIENT_ID, AMZ_APP_CLIENT_SECRET, AMZ_REFRESH_TOKEN');
    process.exit(1);
  }

  try {
    const accessToken = await getAmazonAccessToken();
    const orders = await fetchAmazonOrders(accessToken);
    
    if (orders.length === 0) {
      console.log('\n💡 Next steps:');
      console.log('   1. Check Amazon Seller Central - is the order there?');
      console.log('   2. What is the order status? (must be "Unshipped")');
      console.log('   3. When was the order placed? (may take 10-30 min to appear in API)');
      console.log('   4. Is this a Custom product order?');
      console.log('   5. Check SP-API app permissions in Amazon Developer Console');
    } else {
      console.log('\n✅ Orders found! They should appear in Supabase after cron processes them.');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

