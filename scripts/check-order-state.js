#!/usr/bin/env node

/**
 * Quick script to check order state in Supabase
 * 
 * Usage:
 *   node scripts/check-order-state.js <amazonOrderId>
 */

const fs = require('fs');
const path = require('path');

// Load .env file if it exists
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

const orderId = process.argv[2] || '111-0060602-1283417';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not configured');
  process.exit(1);
}

(async () => {
  try {
    // Try to load from back-end node_modules
    let createClient;
    try {
      const supabaseModule = require('../back-end/node_modules/@supabase/supabase-js');
      createClient = supabaseModule.createClient;
    } catch (e) {
      // Fallback: try direct require
      const supabaseModule = require('@supabase/supabase-js');
      createClient = supabaseModule.createClient;
    }
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Supabase credentials not found in environment');
      console.error('   SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
      console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅' : '❌');
      process.exit(1);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .or(`amazon_order_id.eq.${orderId},orderId.eq.${orderId}`)
      .single();
    
    if (error) {
      console.error('❌ Error fetching order:', error.message);
      process.exit(1);
    }
    
    if (!data) {
      console.error(`❌ Order ${orderId} not found`);
      process.exit(1);
    }
    
    console.log('📦 Order State:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Order ID: ${data.orderId || data.amazon_order_id}`);
    console.log(`Amazon Order ID: ${data.amazon_order_id}`);
    console.log(`Status: ${data.status}`);
    console.log(`Execution Status: ${data.execution_status}`);
    console.log(`Next Workflow: ${data.next_workflow || 'null'}`);
    console.log(`Workflow Step: ${data.workflow_step || 'null'}`);
    console.log('');
    console.log('📋 Data Completeness:');
    console.log(`  shipping_address: ${data.shipping_address ? '✅ Present' : '❌ Missing'}`);
    if (data.shipping_address) {
      const shipping = typeof data.shipping_address === 'string' 
        ? JSON.parse(data.shipping_address) 
        : data.shipping_address;
      console.log(`    ${JSON.stringify(shipping, null, 2).split('\n').join('\n    ')}`);
    }
    console.log(`  character_specs: ${data.character_specs ? '✅ Present' : '❌ Missing'}`);
    if (data.character_specs) {
      const specs = typeof data.character_specs === 'string' 
        ? JSON.parse(data.character_specs) 
        : data.character_specs;
      console.log(`    ${JSON.stringify(specs, null, 2).split('\n').join('\n    ')}`);
    }
    console.log(`  character_hash: ${data.character_hash || 'null'}`);
    console.log(`  customer_name: ${data.customer_name || 'null'}`);
    console.log(`  customer_email: ${data.customer_email || 'null'}`);
    console.log('');
    console.log('🔍 W0 Trigger Check:');
    const hasShipping = data.shipping_address && 
      (typeof data.shipping_address === 'object' ? Object.keys(data.shipping_address).length > 0 : true);
    const hasCharacterSpecs = data.character_specs && 
      (typeof data.character_specs === 'object' ? Object.keys(data.character_specs).length > 0 : true);
    const hasWebhookUrl = !!process.env.N8N_W0_WEBHOOK_URL;
    
    console.log(`  hasShipping: ${hasShipping ? '✅' : '❌'}`);
    console.log(`  hasCharacterSpecs: ${hasCharacterSpecs ? '✅' : '❌'}`);
    console.log(`  hasWebhookUrl: ${hasWebhookUrl ? '✅' : '❌'}`);
    console.log(`  W0 Should Trigger: ${hasShipping && hasCharacterSpecs && hasWebhookUrl ? '✅ YES' : '❌ NO'}`);
    
    if (!hasShipping) {
      console.log('  ⚠️  Missing shipping_address - upload CSV with shipping info');
    }
    if (!hasCharacterSpecs) {
      console.log('  ⚠️  Missing character_specs - CSV should download customization ZIP from customized-url');
    }
    if (!hasWebhookUrl) {
      console.log('  ⚠️  Missing N8N_W0_WEBHOOK_URL environment variable');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();

