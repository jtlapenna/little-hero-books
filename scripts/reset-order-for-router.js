#!/usr/bin/env node
/**
 * Reset an order to ready_for_processing state so router cron can pick it up
 * 
 * Usage: node scripts/reset-order-for-router.js <orderId>
 * Example: node scripts/reset-order-for-router.js 111-0060602-1283417
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const ORDER_ID = process.argv[2] || '111-0060602-1283417';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Simple determineNextWorkflow logic (matches back-end/src/lib/determine-next-workflow.ts)
function determineNextWorkflow(order) {
  // Check if order has completed workflow 3
  if (order.manifest_3_url || order.workflow_step === 'book_assembly_completed') {
    const postPdfStatus = order.review_stages?.postPdf?.status;
    if (postPdfStatus === 'approved') {
      return '4';
    }
    return '3';
  }
  
  // Check if order has completed workflow 2B
  if (order.manifest_2b_url || order.workflow_step === 'bria_processing_complete' || order.workflow_step === '2B-complete') {
    const postBriaStatus = order.review_stages?.postBria?.status;
    if (postBriaStatus === 'approved') {
      return '3';
    }
    return '2B';
  }
  
  // Check if order has completed workflow 2A
  if (order.manifest_2a_url || order.workflow_step === '2A-complete' || order.workflow_step === 'ai_generation_completed') {
    const preBriaStatus = order.review_stages?.preBria?.status;
    if (preBriaStatus === 'approved') {
      return '2B';
    }
    return '2A';
  }
  
  // Check if order has 1-manifest (from W0)
  if (order.one_manifest_url) {
    return '2A';
  }
  
  // No progress - keep current next_workflow or return null
  return order.next_workflow || null;
}

async function resetOrder() {
  console.log('=========================================');
  console.log('Reset Order for Router Cron');
  console.log('=========================================');
  console.log(`Order ID: ${ORDER_ID}\n`);

  try {
    // Fetch order data
    console.log('📋 Fetching order data...');
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('amazon_order_id, next_workflow, one_manifest_url, manifest_2a_url, manifest_2b_url, manifest_3_url, workflow_step, review_stages, execution_status, current_workflow, started_at')
      .eq('amazon_order_id', ORDER_ID)
      .single();

    if (fetchError || !order) {
      console.error(`❌ Order not found: ${fetchError?.message || 'Unknown error'}`);
      process.exit(1);
    }

    console.log('✅ Order found');
    console.log(`   Current execution_status: ${order.execution_status}`);
    console.log(`   Current next_workflow: ${order.next_workflow}`);
    console.log(`   Current workflow_step: ${order.workflow_step || 'null'}`);
    console.log(`   Current current_workflow: ${order.current_workflow || 'null'}`);

    // Determine next workflow
    const nextWorkflow = determineNextWorkflow({
      one_manifest_url: order.one_manifest_url,
      manifest_2a_url: order.manifest_2a_url,
      manifest_2b_url: order.manifest_2b_url,
      manifest_3_url: order.manifest_3_url,
      workflow_step: order.workflow_step,
      review_stages: order.review_stages,
      next_workflow: order.next_workflow
    });

    if (!nextWorkflow) {
      console.error('❌ Could not determine next_workflow. Order may not have completed W0.');
      process.exit(1);
    }

    console.log(`\n🔄 Determined next_workflow: ${nextWorkflow}`);

    // Reset order
    console.log('\n🔄 Resetting order to ready_for_processing...');
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        execution_status: 'ready_for_processing',
        next_workflow: nextWorkflow,
        error_message: null,
        error_type: null,
        retry_count: 0,
        next_retry_at: null,
        last_error_at: null,
        current_workflow: null,
        started_at: null,
        queued_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('amazon_order_id', ORDER_ID);

    if (updateError) {
      console.error(`❌ Failed to reset order: ${updateError.message}`);
      process.exit(1);
    }

    // Verify the update
    console.log('✅ Order updated, verifying...');
    const { data: updatedOrder, error: verifyError } = await supabase
      .from('orders')
      .select('execution_status, next_workflow, current_workflow, started_at, queued_at')
      .eq('amazon_order_id', ORDER_ID)
      .single();

    if (verifyError) {
      console.error(`❌ Failed to verify update: ${verifyError.message}`);
      process.exit(1);
    }

    console.log('\n=========================================');
    console.log('✅ Reset Complete!');
    console.log('=========================================');
    console.log(`\nOrder ${ORDER_ID} is now ready for router cron:`);
    console.log(`   execution_status: ${updatedOrder.execution_status}`);
    console.log(`   next_workflow: ${updatedOrder.next_workflow}`);
    console.log(`   current_workflow: ${updatedOrder.current_workflow || 'null'}`);
    console.log(`   started_at: ${updatedOrder.started_at || 'null'}`);
    console.log(`   queued_at: ${updatedOrder.queued_at || 'null'}`);
    console.log(`\nThe router cron will pick up this order and send it to workflow ${nextWorkflow}.`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

resetOrder();

