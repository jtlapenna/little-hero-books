#!/usr/bin/env node

/**
 * Trigger W0 for all orders in a D2C multi-book group.
 * Use when Stripe webhook missed and orders are stuck in pending_payment or pending_w0.
 *
 * Usage:
 *   NODE_PATH=back-end/node_modules node scripts/trigger-w0-for-d2c-group.js --latest
 *   NODE_PATH=back-end/node_modules node scripts/trigger-w0-for-d2c-group.js <root_order_id>
 *
 * Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_W0_WEBHOOK_URL
 */

const fs = require('fs');
const path = require('path');

// Load .env
const envPaths = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', 'back-end', '.env'),
  path.join(__dirname, '..', 'back-end', '.env.local'),
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
      const t = line.trim();
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...v] = t.split('=');
        const val = v.join('=').replace(/^["']|["']$/g, '').trim();
        if (k && val && !process.env[k]) process.env[k] = val;
      }
    });
    break;
  }
}

let rootOrderId = process.argv[2]?.trim();
const autoDetect = process.argv[2] === '--latest' || (!rootOrderId && process.argv.length === 2);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake';

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}
if (!n8nW0WebhookUrl) {
  console.error('N8N_W0_WEBHOOK_URL required');
  process.exit(1);
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (autoDetect) {
    const { data: recent } = await supabase
      .from('orders')
      .select('root_order_id')
      .eq('platform', 'd2c')
      .eq('execution_status', 'pending_w0')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    rootOrderId = recent?.root_order_id;
    if (!rootOrderId) {
      console.error('No pending_w0 D2C order found. Usage: node scripts/trigger-w0-for-d2c-group.js <root_order_id>');
      process.exit(1);
    }
    console.log('Auto-detected root_order_id:', rootOrderId);
  } else if (!rootOrderId) {
    console.error('Usage: node scripts/trigger-w0-for-d2c-group.js <root_order_id>');
    console.error('       node scripts/trigger-w0-for-d2c-group.js --latest   # use most recent pending_w0 D2C order');
    process.exit(1);
  }

  // Find all orders: single book (orderId = root) or multi-book (orderId like root-item-%)
  const { data: byRoot, error: e1 } = await supabase
    .from('orders')
    .select('id,"orderId",execution_status,character_specs,shipping_address,customer_email,customer_name,purchase_date,dedication_text,product_info,character_hash')
    .eq('root_order_id', rootOrderId);

  if (e1) {
    console.error('Supabase error:', e1.message);
    process.exit(1);
  }
  if (!byRoot || byRoot.length === 0) {
    console.error('No orders found for root_order_id:', rootOrderId);
    process.exit(1);
  }

  // Sort by orderId for consistent ordering (item-1, item-2, item-3)
  byRoot.sort((a, b) => (a.orderId || '').localeCompare(b.orderId || ''));

  console.log(`Found ${byRoot.length} order(s) for root ${rootOrderId}\n`);

  // Build W0 payload (matches back-end buildD2CW0Payload)
  function parseJson(val) {
    if (val == null) return {};
    if (typeof val === 'object') return val;
    try {
      return typeof val === 'string' ? JSON.parse(val) : {};
    } catch {
      return {};
    }
  }
  function buildPayload(order) {
    const characterSpecs = parseJson(order.character_specs);
    const shippingAddress = parseJson(order.shipping_address);
    const orderDate = order.purchase_date || new Date().toISOString();
    const productInfo = parseJson(order.product_info);
    const bookSpecs = productInfo.totalPages != null
      ? { totalPages: productInfo.totalPages, format: productInfo.format ?? '8.5x8.5_softcover', bookType: 'adventure' }
      : { title: `${characterSpecs.childName ?? 'Child'} and the Adventure Compass`, totalPages: 16, format: '8.5x8.5_softcover', bookType: 'adventure' };
    return {
      orderId: order.orderId ?? order.order_id ?? order.id,
      id: order.orderId ?? order.order_id ?? order.id,
      orderDate,
      purchaseDate: orderDate,
      status: 'queued_for_processing',
      customerEmail: order.customer_email ?? '',
      buyer: { email: order.customer_email ?? '', name: order.customer_name ?? shippingAddress?.name ?? '' },
      shippingAddress,
      shipping_address: shippingAddress,
      characterSpecs,
      character_specs: characterSpecs,
      bookSpecs,
      book_specs: bookSpecs,
      orderDetails: { quantity: 1, shippingAddress },
      dedication: order.dedication_text ?? '',
      characterHash: order.character_hash ?? '',
      character_hash: order.character_hash ?? '',
    };
  }

  for (let i = 0; i < byRoot.length; i++) {
    const order = byRoot[i];
    const oid = order.orderId || order.order_id || order.id;
    console.log(`[${i + 1}/${byRoot.length}] ${oid} (execution_status: ${order.execution_status})`);

    // Update to pending_w0 if still pending_payment
    if (order.execution_status === 'pending_payment') {
      const { error: ue } = await supabase
        .from('orders')
        .update({
          execution_status: 'pending_w0',
          status: 'pending_w0',
          purchase_date: order.purchase_date || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (ue) {
        console.error('  Failed to update:', ue.message);
        continue;
      }
      console.log('  Updated to pending_w0');
    }

    const payload = buildPayload(order);
    const res = await fetch(n8nW0WebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`  W0 failed ${res.status}:`, text.slice(0, 200));
    } else {
      console.log('  W0 triggered OK');
    }
  }

  console.log('\nDone. W0 should process each order; workflow-0-complete will set ready_for_processing.');
  console.log('Run the router cron to pick them up.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
