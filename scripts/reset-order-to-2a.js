#!/usr/bin/env node
/**
 * Reset an order to start from workflow 2A
 * Clears lulu fields and sets next_workflow to '2a'
 * 
 * Usage: node scripts/reset-order-to-2a.js <orderId>
 * Example: node scripts/reset-order-to-2a.js 112-7311035-1437035
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const ORDER_ID = process.argv[2];

if (!ORDER_ID) {
  console.error('❌ Order ID is required');
  console.error('Usage: node scripts/reset-order-to-2a.js <orderId>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetOrderTo2A() {
  console.log('=========================================');
  console.log('Reset Order to Start from Workflow 2A');
  console.log('=========================================');
  console.log(`Order ID: ${ORDER_ID}\n`);

  try {
    // Fetch order data
    console.log('📋 Fetching order data...');
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, amazon_order_id, execution_status, next_workflow, lulu_job_id, lulu_status')
      .or(`amazon_order_id.eq.${ORDER_ID},orderId.eq.${ORDER_ID}`)
      .single();

    if (fetchError || !order) {
      console.error(`❌ Order not found: ${fetchError?.message || 'Unknown error'}`);
      process.exit(1);
    }

    console.log('✅ Order found');
    console.log(`   ID: ${order.id}`);
    console.log(`   Amazon Order ID: ${order.amazon_order_id}`);
    console.log(`   Current execution_status: ${order.execution_status}`);
    console.log(`   Current next_workflow: ${order.next_workflow}`);
    console.log(`   Current lulu_job_id: ${order.lulu_job_id || 'null'}`);
    console.log(`   Current lulu_status: ${order.lulu_status || 'null'}`);

    // Reset order to start from 2A
    console.log('\n🔄 Resetting order to start from workflow 2A...');
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        execution_status: 'ready_for_processing',
        next_workflow: '2a',
        lulu_job_id: null, // Clear lulu_job_id so router can pick it up
        lulu_status: null, // Clear lulu_status so router can pick it up
        current_workflow: null,
        started_at: null,
        queued_at: nowIso,
        updated_at: nowIso,
        error_message: null,
        error_type: null,
        retry_count: 0,
        next_retry_at: null,
        last_error_at: null
      })
      .eq('id', order.id);

    if (updateError) {
      console.error(`❌ Failed to update order: ${updateError.message}`);
      process.exit(1);
    }

    console.log('✅ Order reset successfully!');
    console.log(`\n📝 Updated fields:`);
    console.log(`   - execution_status: ready_for_processing`);
    console.log(`   - next_workflow: 2a`);
    console.log(`   - lulu_job_id: null (cleared)`);
    console.log(`   - lulu_status: null (cleared)`);
    console.log(`   - queued_at: ${nowIso}`);
    console.log(`\n🚀 The router cron will pick up this order on its next run (every 60 seconds)`);
    console.log(`   Order will be routed to workflow 2A (Character Generation)`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetOrderTo2A();
