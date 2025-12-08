#!/usr/bin/env node

/**
 * Test Amazon Orders Cron Job
 * 
 * This script tests the Amazon orders cron endpoint directly
 * to help troubleshoot why orders aren't coming through.
 * 
 * Usage:
 *   node scripts/test-amazon-orders-cron.js
 * 
 * Environment variables required:
 *   - VERCEL_URL (or use --url flag)
 *   - CRON_SECRET (or use --secret flag)
 *   - VERCEL_BYPASS_TOKEN (or use --bypass flag) - Required if deployment protection is enabled
 * 
 * Examples:
 *   node scripts/test-amazon-orders-cron.js
 *   node scripts/test-amazon-orders-cron.js --secret=abc123 --bypass=bypass_xyz
 *   node scripts/test-amazon-orders-cron.js --test
 */

const https = require('https');
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const urlArg = args.find(arg => arg.startsWith('--url='))?.split('=')[1];
const secretArg = args.find(arg => arg.startsWith('--secret='))?.split('=')[1];
const bypassArg = args.find(arg => arg.startsWith('--bypass='))?.split('=')[1];
const testModeArg = args.includes('--test');

const vercelUrl = urlArg || process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL || 'little-hero-books-dvvaz6omr-jeffs-projects-5810cd55.vercel.app';
const cronSecret = secretArg || process.env.CRON_SECRET;
const bypassToken = bypassArg || process.env.VERCEL_BYPASS_TOKEN;
const testMode = testModeArg || process.env.AMAZON_CRON_TEST_MODE === 'true';

if (!cronSecret) {
  console.error('❌ CRON_SECRET is required');
  console.error('   Set it as environment variable: export CRON_SECRET="your-secret"');
  console.error('   Or pass as argument: --secret=your-secret');
  process.exit(1);
}

// Build endpoint URL with query parameters
const urlParams = new URLSearchParams();
if (testMode) {
  urlParams.append('test', 'true');
}
if (bypassToken) {
  urlParams.append('x-vercel-protection-bypass', bypassToken);
}
const queryString = urlParams.toString();
const endpoint = `https://${vercelUrl}/api/cron/amazon-orders${queryString ? '?' + queryString : ''}`;

console.log('🧪 Testing Amazon Orders Cron Job');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`URL: ${endpoint}`);
console.log(`Test Mode: ${testMode ? '✅ ENABLED (using mock data)' : '❌ DISABLED (using real Amazon API)'}`);
console.log(`Cron Secret: ${cronSecret.substring(0, 10)}...`);
if (bypassToken) {
  console.log(`Bypass Token: ${bypassToken.substring(0, 10)}...`);
} else {
  console.log(`Bypass Token: ❌ NOT SET (may fail if deployment protection is enabled)`);
}
console.log('');

const startTime = Date.now();

const url = new URL(endpoint);
const options = {
  hostname: url.hostname,
  port: url.port || 443,
  path: url.pathname + url.search,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${cronSecret}`,
    'Content-Type': 'application/json',
  },
};

console.log('📡 Sending request...');
console.log('');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const duration = Date.now() - startTime;
    
    console.log(`📥 Response (${res.statusCode} ${res.statusMessage})`);
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    try {
      const json = JSON.parse(data);
      
      // Pretty print response
      console.log(JSON.stringify(json, null, 2));
      console.log('');

      // Interpret response
      if (res.statusCode === 200) {
        if (json.skipped) {
          console.log('✅ Cron executed successfully');
          console.log(`   Reason: ${json.reason}`);
          if (json.reason === 'no_orders') {
            console.log('   ℹ️  No new orders found in last 24 hours');
            console.log('   ℹ️  This is normal if:');
            console.log('      - No orders were placed in last 24 hours');
            console.log('      - Orders are older than 24 hours');
            console.log('      - Orders have status other than "Unshipped"');
          }
        } else if (json.success) {
          console.log('✅ Cron executed successfully');
          console.log(`   Orders found: ${json.ordersFound || 0}`);
          console.log(`   Orders processed: ${json.ordersProcessed || 0}`);
          if (json.orderIds && json.orderIds.length > 0) {
            console.log(`   Order IDs: ${json.orderIds.join(', ')}`);
          }
          if (json.errors && json.errors.length > 0) {
            console.log(`   ⚠️  Errors: ${json.errors.length}`);
            json.errors.forEach((err, i) => {
              console.log(`      ${i + 1}. Order ${err.orderId}: ${err.error}`);
            });
          }
        } else {
          console.log('⚠️  Unexpected response format');
        }
      } else if (res.statusCode === 401) {
        console.log('❌ Authentication failed');
        console.log('   Check CRON_SECRET is correct');
      } else if (res.statusCode === 403) {
        console.log('❌ Access forbidden - Deployment protection is blocking the request');
        console.log('   Solution: Use --bypass=YOUR_BYPASS_TOKEN or set VERCEL_BYPASS_TOKEN');
        console.log('   Get bypass token from: Vercel Dashboard → Settings → Deployment Protection');
      } else if (res.statusCode === 500) {
        console.log('❌ Server error');
        if (json.error) {
          console.log(`   Error: ${json.error}`);
        }
        if (json.details) {
          console.log(`   Details: ${json.details}`);
        }
      } else {
        console.log(`❌ Unexpected status code: ${res.statusCode}`);
      }

      // Show metrics if available
      if (json.metrics) {
        console.log('');
        console.log('📊 Metrics:');
        if (json.metrics.tokenFetchMs) {
          console.log(`   Token fetch: ${json.metrics.tokenFetchMs}ms`);
        }
        if (json.metrics.ordersFetchMs) {
          console.log(`   Orders fetch: ${json.metrics.ordersFetchMs}ms`);
        }
        if (json.metrics.totalMs) {
          console.log(`   Total: ${json.metrics.totalMs}ms`);
        }
      }

    } catch (e) {
      console.log('❌ Failed to parse response as JSON');
      console.log('Raw response:');
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:');
  console.error(error.message);
  process.exit(1);
});

req.end();

