#!/usr/bin/env node

/**
 * Manually trigger W0 webhook for a specific order
 * 
 * Usage:
 *   node scripts/trigger-w0-for-order.js <orderId>
 * 
 * Example:
 *   node scripts/trigger-w0-for-order.js 111-0060602-1283417
 * 
 * Environment variables required:
 *   - N8N_W0_WEBHOOK_URL (or defaults to https://thepeakbeyond.app.n8n.cloud/webhook/order-intake)
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
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
  console.error('Usage: node scripts/trigger-w0-for-order.js <orderId>');
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
  const { createClient } = await import('@supabase/supabase-js');
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

// Call W0 webhook
async function callW0Webhook(orderData) {
  return new Promise((resolve, reject) => {
    const url = new URL(n8nW0WebhookUrl);
    const payload = JSON.stringify({
      orderId: orderData.orderId || orderData.amazon_order_id,
      amazon_order_id: orderData.amazon_order_id,
      character_hash: orderData.character_hash,
      character_specs: orderData.character_specs,
      shipping_address: orderData.shipping_address,
      customer_name: orderData.customer_name,
      customer_email: orderData.customer_email,
      dedication_text: orderData.dedication_text,
      product_info: orderData.product_info,
      purchase_date: orderData.purchase_date,
      marketplace_id: orderData.marketplace_id,
    });
    
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

// Main
(async () => {
  try {
    console.log('🔍 Fetching order from Supabase...');
    const order = await fetchOrder();
    console.log(`✅ Found order: ${order.amazon_order_id || order.orderId}`);
    console.log(`   Status: ${order.execution_status}`);
    console.log(`   Has shipping: ${order.shipping_address ? '✅' : '❌'}`);
    console.log(`   Has character specs: ${order.character_specs ? '✅' : '❌'}`);
    console.log('');
    
    if (!order.shipping_address || !order.character_specs) {
      console.error('❌ Order is missing required data (shipping_address or character_specs)');
      console.error('   Please upload the CSV file first to populate this data.');
      process.exit(1);
    }
    
    console.log('📡 Calling W0 webhook...');
    console.log(`   URL: ${n8nW0WebhookUrl}`);
    const response = await callW0Webhook(order);
    
    console.log(`✅ W0 webhook called`);
    console.log(`   Status: ${response.statusCode}`);
    if (response.body) {
      try {
        const json = JSON.parse(response.body);
        console.log(`   Response: ${JSON.stringify(json, null, 2)}`);
      } catch (e) {
        console.log(`   Response: ${response.body.substring(0, 200)}`);
      }
    }
    console.log('');
    console.log('✅ Done! W0 should process the order and update it to ready_for_processing');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();

