/**
 * Script to find orders with unused preview tokens
 * Run with: npx tsx scripts/find-unapproved-orders.ts
 */

import { supabase } from '../src/lib/supabase-client';

async function findUnapprovedOrders() {
  try {
    // Find preview tokens that haven't been used yet and aren't expired
    const now = new Date().toISOString();
    
    const { data: tokens, error: tokenError } = await supabase
      .from('preview_tokens')
      .select('token, order_id, created_at, expires_at, used_at')
      .is('used_at', null)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(10);

    if (tokenError) {
      console.error('Error fetching tokens:', tokenError);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log('No unused tokens found. Checking for orders with pending approval status...');
      
      // Fallback: Check for orders with pending approval status
      const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('order_id, amazon_order_id, customer_approval_status, execution_status, created_at')
        .eq('customer_approval_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      if (orderError) {
        console.error('Error fetching orders:', orderError);
        return;
      }

      if (!orders || orders.length === 0) {
        console.log('No orders with pending approval found.');
        return;
      }

      console.log('\n=== Orders with Pending Approval ===\n');
      orders.forEach((order: any) => {
        console.log(`Order ID: ${order.order_id || order.amazon_order_id}`);
        console.log(`Amazon Order ID: ${order.amazon_order_id}`);
        console.log(`Approval Status: ${order.customer_approval_status}`);
        console.log(`Execution Status: ${order.execution_status}`);
        console.log(`Created: ${order.created_at}`);
        console.log('---');
      });

      return;
    }

    console.log(`\n=== Found ${tokens.length} unused preview tokens ===\n`);

    // For each token, get the order details
    for (const token of tokens) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('order_id, amazon_order_id, customer_name, character_specs, customer_approval_status, execution_status, created_at')
        .eq('order_id', token.order_id)
        .single();

      if (orderError) {
        console.log(`Token: ${token.token}`);
        console.log(`Order ID: ${token.order_id}`);
        console.log(`Error fetching order: ${orderError.message}`);
        console.log('---');
        continue;
      }

      const childName = order.character_specs?.childName || 'N/A';
      const customerName = order.customer_name || 'N/A';

      console.log(`Order ID: ${order.order_id || order.amazon_order_id}`);
      console.log(`Amazon Order ID: ${order.amazon_order_id}`);
      console.log(`Customer: ${customerName}`);
      console.log(`Child: ${childName}`);
      console.log(`Approval Status: ${order.customer_approval_status || 'N/A'}`);
      console.log(`Execution Status: ${order.execution_status || 'N/A'}`);
      console.log(`Preview Token: ${token.token}`);
      console.log(`Preview URL: http://localhost:4555/approve/${token.token}`);
      console.log(`Created: ${order.created_at}`);
      console.log(`Token Expires: ${token.expires_at}`);
      console.log('---\n');
    }

  } catch (error: any) {
    console.error('Error:', error.message || error);
  }
}

findUnapprovedOrders().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

