#!/usr/bin/env node

/**
 * Comprehensive diagnostic script for W0 and router cron issues
 * 
 * Usage:
 *   node scripts/diagnose-w0-and-routing.js <orderId>
 * 
 * Example:
 *   node scripts/diagnose-w0-and-routing.js 111-0060602-1283417
 * 
 * Environment variables required:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - N8N_W0_WEBHOOK_URL (optional, will use default)
 */

const https = require('https');
const http = require('http');

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
    break;
  }
}

const orderId = process.argv[2];
if (!orderId) {
  console.error('❌ Order ID required');
  console.error('Usage: node scripts/diagnose-w0-and-routing.js <orderId>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not configured');
  process.exit(1);
}

// Fetch order from Supabase
async function fetchOrder() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .or(`amazon_order_id.eq.${orderId},orderId.eq.${orderId}`)
    .single();
  
  if (error) {
    throw new Error(`Failed to fetch order: ${error.message}`);
  }
  
  if (!data) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  return data;
}

// Test W0 webhook
async function testW0Webhook(orderData) {
  return new Promise((resolve, reject) => {
    const characterSpecs = typeof orderData.character_specs === 'string' 
      ? JSON.parse(orderData.character_specs) 
      : orderData.character_specs;
    const shippingAddress = typeof orderData.shipping_address === 'string'
      ? JSON.parse(orderData.shipping_address)
      : orderData.shipping_address;
    
    // Calculate character_hash if missing
    const { createHash } = require('crypto');
    let characterHash = orderData.character_hash;
    if (!characterHash && characterSpecs) {
      const orderIdValue = orderData.orderId || orderData.amazon_order_id;
      const sortedSpecs = Object.keys(characterSpecs)
        .sort()
        .reduce((acc, key) => {
          acc[key] = characterSpecs[key];
          return acc;
        }, {});
      const hashInput = JSON.stringify({ ...sortedSpecs, orderId: orderIdValue });
      characterHash = createHash('md5').update(hashInput).digest('hex').substring(0, 16);
    }
    
    const w0Payload = {
      amazonOrderId: orderData.amazon_order_id,
      orderId: orderData.orderId || orderData.amazon_order_id,
      id: orderData.orderId || orderData.amazon_order_id,
      orderDate: orderData.purchase_date,
      purchaseDate: orderData.purchase_date,
      status: 'pending_w0',
      marketplaceId: orderData.marketplace_id,
      customerEmail: orderData.customer_email,
      buyer: {
        email: orderData.customer_email,
        name: orderData.customer_name,
      },
      shippingAddress: shippingAddress,
      characterSpecs: characterSpecs,
      character_specs: characterSpecs,
      CharacterSpecs: characterSpecs,
      bookSpecs: {
        title: `${characterSpecs?.childName || 'Child'} and the Adventure Compass`,
        totalPages: 16,
        format: '8.5x8.5_softcover',
        bookType: 'adventure',
      },
      orderDetails: {
        quantity: 1,
        shippingAddress: shippingAddress,
      },
      dedication: characterSpecs?.dedication || orderData.dedication_text || null,
      Dedication: characterSpecs?.dedication || orderData.dedication_text || null,
      items: Array.isArray(orderData.product_info) ? orderData.product_info : [],
      characterHash: characterHash,
      character_hash: characterHash,
    };
    
    const url = new URL(n8nW0WebhookUrl);
    const payload = JSON.stringify(w0Payload);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    
    console.log('📡 Testing W0 webhook...');
    console.log(`   URL: ${n8nW0WebhookUrl}`);
    console.log(`   Payload size: ${Buffer.byteLength(payload)} bytes`);
    
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Check router cron criteria
function checkRouterCriteria(order) {
  const issues = [];
  
  if (order.execution_status !== 'ready_for_processing') {
    issues.push(`❌ execution_status is "${order.execution_status}" (needs: "ready_for_processing")`);
  } else {
    console.log('   ✅ execution_status = "ready_for_processing"');
  }
  
  if (order.next_workflow === null || order.next_workflow === undefined) {
    issues.push(`❌ next_workflow is null (needs: a workflow number like "2A")`);
  } else {
    console.log(`   ✅ next_workflow = "${order.next_workflow}"`);
  }
  
  return issues;
}

// Main diagnostic flow
(async () => {
  try {
    console.log('🔍 W0 and Router Cron Diagnostic Tool');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Order ID: ${orderId}`);
    console.log(`W0 Webhook URL: ${n8nW0WebhookUrl}`);
    console.log('');
    
    // Step 1: Fetch order
    console.log('Step 1: Fetching order from Supabase...');
    const order = await fetchOrder();
    console.log(`✅ Found order: ${order.amazon_order_id || order.orderId}`);
    console.log('');
    
    // Step 2: Check current state
    console.log('Step 2: Checking current order state...');
    console.log(`   execution_status: ${order.execution_status}`);
    console.log(`   next_workflow: ${order.next_workflow}`);
    console.log(`   workflow_step: ${order.workflow_step}`);
    console.log(`   one_manifest_url: ${order.one_manifest_url || 'null'}`);
    console.log(`   dedication_text: ${order.dedication_text || 'null'}`);
    console.log(`   updated_at: ${order.updated_at}`);
    console.log('');
    
    // Step 3: Check data completeness
    console.log('Step 3: Checking data completeness...');
    const hasShipping = order.shipping_address && 
      (typeof order.shipping_address === 'object' ? Object.keys(order.shipping_address).length > 0 : true);
    const hasCharacterSpecs = order.character_specs && 
      (typeof order.character_specs === 'object' ? Object.keys(order.character_specs).length > 0 : true);
    
    console.log(`   shipping_address: ${hasShipping ? '✅ Present' : '❌ Missing'}`);
    console.log(`   character_specs: ${hasCharacterSpecs ? '✅ Present' : '❌ Missing'}`);
    console.log('');
    
    if (!hasShipping || !hasCharacterSpecs) {
      console.log('❌ Order is missing required data. Please upload CSV file first.');
      process.exit(1);
    }
    
    // Step 4: Check router criteria
    console.log('Step 4: Checking router cron criteria...');
    const routerIssues = checkRouterCriteria(order);
    console.log('');
    
    if (routerIssues.length > 0) {
      console.log('⚠️  Order does NOT meet router cron criteria:');
      routerIssues.forEach(issue => console.log(`   ${issue}`));
      console.log('');
      console.log('💡 This means W0 needs to process the order first.');
      console.log('');
    } else {
      console.log('✅ Order meets router cron criteria!');
      console.log('   Router cron should pick it up on next run.');
      console.log('');
      process.exit(0);
    }
    
    // Step 5: Test W0 webhook
    console.log('Step 5: Testing W0 webhook...');
    const w0Response = await testW0Webhook(order);
    
    console.log(`   Status: ${w0Response.statusCode}`);
    if (w0Response.statusCode === 200 || w0Response.statusCode === 201) {
      console.log('   ✅ W0 webhook responded successfully');
      if (w0Response.body) {
        try {
          const json = JSON.parse(w0Response.body);
          console.log(`   Response: ${JSON.stringify(json, null, 2)}`);
        } catch (e) {
          console.log(`   Response: ${w0Response.body.substring(0, 500)}`);
        }
      }
      console.log('');
      console.log('✅ W0 webhook call succeeded!');
      console.log('   W0 should process the order and update Supabase.');
      console.log('   Wait 10-30 seconds, then check Supabase again.');
      console.log('   The order should have:');
      console.log('     - execution_status = "ready_for_processing"');
      console.log('     - next_workflow = "2A"');
      console.log('     - one_manifest_url populated');
    } else {
      console.log('   ❌ W0 webhook failed');
      if (w0Response.body) {
        console.log(`   Error: ${w0Response.body.substring(0, 500)}`);
      }
      console.log('');
      console.log('💡 Troubleshooting:');
      console.log('   1. Check if N8N_W0_WEBHOOK_URL is correct');
      console.log('   2. Check n8n workflow is active and webhook is enabled');
      console.log('   3. Check n8n logs for errors');
    }
    
    // Step 6: Summary
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log(`   Order has data: ${hasShipping && hasCharacterSpecs ? '✅' : '❌'}`);
    console.log(`   Router ready: ${routerIssues.length === 0 ? '✅' : '❌'}`);
    console.log(`   W0 webhook: ${w0Response.statusCode === 200 || w0Response.statusCode === 201 ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌ Diagnostic failed:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();

