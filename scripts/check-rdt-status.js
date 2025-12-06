#!/usr/bin/env node
/**
 * Check RDT (Restricted Data Token) Status
 * 
 * This script tests if you have RDT access by attempting to fetch
 * buyer info and shipping address for a test order.
 * 
 * Usage:
 *   node scripts/check-rdt-status.js <orderId>
 * 
 * Example:
 *   node scripts/check-rdt-status.js 123-4567890-1234567
 */

const axios = require('axios');
require('dotenv').config();

const ORDER_ID = process.argv[2];
const AMAZON_ENV = process.env.AMAZON_ENV || 'production';
const IS_SANDBOX = process.env.AMAZON_SANDBOX_MODE === 'true' || AMAZON_ENV === 'sandbox';

const BASE_URL = IS_SANDBOX
  ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
  : 'https://sellingpartnerapi-na.amazon.com';

const MARKETPLACE_ID = process.env.AMAZON_MARKETPLACE_ID || 'ATVPDKIKX0DER';

if (!ORDER_ID) {
  console.error('❌ Error: Order ID required');
  console.log('\nUsage: node scripts/check-rdt-status.js <orderId>');
  console.log('Example: node scripts/check-rdt-status.js 123-4567890-1234567');
  process.exit(1);
}

async function getAccessToken() {
  // This is a simplified version - you'll need to implement your actual token generation
  // For now, this assumes you have an access token in your environment
  const accessToken = process.env.AMAZON_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.error('❌ Error: AMAZON_ACCESS_TOKEN not found in environment');
    console.log('You need to set up SP-API authentication first.');
    process.exit(1);
  }
  
  return accessToken;
}

async function testRDTEndpoint(endpoint, description) {
  try {
    const accessToken = await getAccessToken();
    
    console.log(`\n🔍 Testing ${description}...`);
    console.log(`   Endpoint: ${endpoint}`);
    
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers: {
        'x-amz-access-token': accessToken,
        'x-amz-date': new Date().toISOString().replace(/[:\-]|\.\d{3}/g, ''),
      },
      validateStatus: () => true, // Don't throw on any status
    });
    
    if (response.status === 200) {
      console.log(`   ✅ SUCCESS (200 OK) - RDT is working!`);
      console.log(`   Response:`, JSON.stringify(response.data, null, 2));
      return { success: true, status: 200 };
    } else if (response.status === 403) {
      console.log(`   ❌ FORBIDDEN (403) - RDT not approved or not requested`);
      console.log(`   Response:`, response.data);
      return { success: false, status: 403, error: 'RDT not approved' };
    } else if (response.status === 401) {
      console.log(`   ⚠️  UNAUTHORIZED (401) - Authentication issue (not RDT issue)`);
      console.log(`   Response:`, response.data);
      return { success: false, status: 401, error: 'Authentication failed' };
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
      console.log(`   Response:`, response.data);
      return { success: false, status: response.status, error: 'Unexpected error' };
    }
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    if (error.response) {
      console.error(`   Status:`, error.response.status);
      console.error(`   Data:`, error.response.data);
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('RDT (Restricted Data Token) Status Check');
  console.log('='.repeat(60));
  console.log(`Order ID: ${ORDER_ID}`);
  console.log(`Environment: ${IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION'}`);
  console.log(`Base URL: ${BASE_URL}`);
  
  // Test buyer info endpoint
  const buyerInfoResult = await testRDTEndpoint(
    `/orders/v0/orders/${ORDER_ID}/buyerInfo`,
    'Buyer Info Endpoint'
  );
  
  // Test address endpoint
  const addressResult = await testRDTEndpoint(
    `/orders/v0/orders/${ORDER_ID}/address`,
    'Shipping Address Endpoint'
  );
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  if (buyerInfoResult.success && addressResult.success) {
    console.log('✅ RDT STATUS: APPROVED AND WORKING');
    console.log('   - You can access buyer info');
    console.log('   - You can access shipping addresses');
    console.log('   - FBM fulfillment should work');
  } else if (buyerInfoResult.status === 403 || addressResult.status === 403) {
    console.log('❌ RDT STATUS: NOT APPROVED');
    console.log('   - You need to apply for Restricted Roles in SP-API app');
    console.log('   - See docs/amazon/RDT_APPLICATION_GUIDE.md for instructions');
    console.log('   - Application typically takes 7-14 business days');
  } else if (buyerInfoResult.status === 401 || addressResult.status === 401) {
    console.log('⚠️  AUTHENTICATION ISSUE');
    console.log('   - Check your SP-API credentials');
    console.log('   - Verify access token is valid');
  } else {
    console.log('⚠️  UNKNOWN STATUS');
    console.log('   - Check the error messages above');
  }
  
  console.log('\nNext Steps:');
  if (!buyerInfoResult.success || !addressResult.success) {
    console.log('1. Review docs/amazon/RDT_APPLICATION_GUIDE.md');
    console.log('2. Apply for Restricted Roles in Amazon Developer Console');
    console.log('3. Wait for approval (7-14 business days)');
    console.log('4. Re-run this script after approval');
  } else {
    console.log('1. ✅ RDT is working - no action needed');
    console.log('2. Verify shipping addresses are being stored in database');
    console.log('3. Test Workflow 4 (Lulu submission)');
  }
}

main().catch(console.error);

