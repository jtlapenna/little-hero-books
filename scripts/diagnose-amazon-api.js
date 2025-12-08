#!/usr/bin/env node

/**
 * Diagnostic script for Amazon SP-API 403 errors
 * 
 * This script tests various Amazon API endpoints to diagnose permission issues.
 * 
 * Usage:
 *   node scripts/diagnose-amazon-api.js
 * 
 * Environment variables required (from .env or environment):
 *   - AMZ_APP_CLIENT_ID (or AMAZON_SP_API_CLIENT_ID)
 *   - AMZ_APP_CLIENT_SECRET (or AMAZON_SP_API_CLIENT_SECRET)
 *   - AMZ_REFRESH_TOKEN (or AMAZON_SP_API_REFRESH_TOKEN)
 *   - AMZ_MARKETPLACE_ID (optional, defaults to ATVPDKIKX0DER)
 *   - AMZ_REGION (optional, defaults to na)
 */

// Load .env file if it exists
const fs = require('fs');
const path = require('path');

const envPaths = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', 'back-end', '.env'),
  path.join(__dirname, '..', 'back-end', '.env.local'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '').trim();
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    break; // Use first found .env file
  }
}

const https = require('https');

// Get environment variables (check production first, then fallback)
const clientId = process.env.AMZ_LWA_CLIENT_ID_PROD 
  || process.env.AMZ_APP_CLIENT_ID 
  || process.env.AMAZON_SP_API_CLIENT_ID;
const clientSecret = process.env.AMZ_LWA_CLIENT_SECRET_PROD
  || process.env.AMZ_APP_CLIENT_SECRET 
  || process.env.AMAZON_SP_API_CLIENT_SECRET;
const refreshToken = process.env.AMZ_APP_PROD_REFRESH_TOKEN
  || process.env.AMZ_REFRESH_TOKEN 
  || process.env.AMAZON_SP_API_REFRESH_TOKEN;
const marketplaceId = process.env.AMZ_MARKETPLACE_ID || process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';
const region = process.env.AMZ_REGION || process.env.AMAZON_SP_API_REGION || 'na';

if (!clientId || !clientSecret || !refreshToken) {
  console.error('❌ Missing required environment variables');
  console.error('   Required: AMZ_APP_CLIENT_ID, AMZ_APP_CLIENT_SECRET, AMZ_REFRESH_TOKEN');
  process.exit(1);
}

const baseUrl = region === 'na'
  ? 'https://sellingpartnerapi-na.amazon.com'
  : `https://sellingpartnerapi-${region}.amazon.com`;

console.log('🔍 Amazon SP-API Diagnostic Tool');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Client ID: ${clientId.substring(0, 10)}...`);
console.log(`Marketplace ID: ${marketplaceId}`);
console.log(`Region: ${region}`);
console.log(`Base URL: ${baseUrl}`);
console.log('');

// Step 1: Get access token
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString();

    const options = {
      hostname: 'api.amazon.com',
      path: '/auth/o2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            if (json.access_token) {
              resolve(json.access_token);
            } else {
              reject(new Error('No access_token in response: ' + JSON.stringify(json)));
            }
          } catch (e) {
            reject(new Error('Failed to parse token response: ' + data));
          }
        } else {
          reject(new Error(`Token request failed (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Step 2: Test API endpoint
async function testEndpoint(accessToken, endpoint, description) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
      },
    };

    console.log(`📡 Testing: ${description}`);
    console.log(`   Endpoint: ${endpoint}`);
    
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const result = {
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        };

        try {
          result.json = JSON.parse(data);
        } catch (e) {
          // Not JSON
        }

        resolve(result);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Main diagnostic flow
async function runDiagnostics() {
  try {
    console.log('Step 1: Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained');
    console.log(`   Token: ${accessToken.substring(0, 20)}...`);
    console.log('');

    // Test 1: Marketplace Participations (should work with basic access)
    console.log('Step 2: Testing basic API access...');
    const test1 = await testEndpoint(
      accessToken,
      '/sellers/v1/marketplaceParticipations',
      'Marketplace Participations (basic access test)'
    );
    
    console.log(`   Status: ${test1.statusCode}`);
    if (test1.statusCode === 200) {
      console.log('   ✅ Basic API access works');
      if (test1.json) {
        console.log(`   Marketplaces: ${JSON.stringify(test1.json.payload?.map(m => m.marketplace?.name) || [])}`);
      }
    } else {
      console.log('   ❌ Basic API access failed');
      if (test1.json) {
        console.log(`   Error: ${JSON.stringify(test1.json, null, 2)}`);
      } else {
        console.log(`   Response: ${test1.body.substring(0, 500)}`);
      }
    }
    console.log('');

    // Test 2: Orders API (the problematic one)
    console.log('Step 3: Testing Orders API...');
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const createdAfter = yesterday.toISOString();
    
    const ordersEndpoint = `/orders/v0/orders?MarketplaceIds=${marketplaceId}&CreatedAfter=${encodeURIComponent(createdAfter)}&OrderStatuses=Unshipped&MaxResultsPerPage=50`;
    const test2 = await testEndpoint(
      accessToken,
      ordersEndpoint,
      'Orders API (getOrders)'
    );
    
    console.log(`   Status: ${test2.statusCode}`);
    if (test2.statusCode === 200) {
      console.log('   ✅ Orders API access works');
      if (test2.json) {
        const orders = test2.json.payload?.Orders || [];
        console.log(`   Orders found: ${orders.length}`);
      }
    } else {
      console.log('   ❌ Orders API access failed');
      console.log('   Full error response:');
      if (test2.json) {
        console.log(JSON.stringify(test2.json, null, 2));
      } else {
        console.log(test2.body);
      }
      
      // Check for specific error codes
      if (test2.json?.errors) {
        test2.json.errors.forEach((err, i) => {
          console.log(`   Error ${i + 1}:`);
          console.log(`     Code: ${err.code}`);
          console.log(`     Message: ${err.message}`);
          if (err.details) {
            console.log(`     Details: ${JSON.stringify(err.details)}`);
          }
        });
      }
    }
    console.log('');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log(`   Basic API Access: ${test1.statusCode === 200 ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Orders API Access: ${test2.statusCode === 200 ? '✅ Working' : '❌ Failed'}`);
    
    if (test2.statusCode === 403) {
      console.log('');
      console.log('💡 Troubleshooting suggestions:');
      console.log('   1. Verify "Inventory and Order Tracking" role is enabled in app settings');
      console.log('   2. Verify role is enabled in Developer Profile (not just app)');
      console.log('   3. Re-authorize the app after enabling roles');
      console.log('   4. Check if your seller account is active and in good standing');
      console.log('   5. Verify marketplace participation using test above');
      console.log('   6. Contact Amazon Developer Support if issue persists');
    }

  } catch (error) {
    console.error('❌ Diagnostic failed:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runDiagnostics();

