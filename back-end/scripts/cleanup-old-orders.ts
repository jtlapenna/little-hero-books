#!/usr/bin/env tsx
/**
 * Cleanup script for old orders
 * 
 * This script helps identify and delete old orders from Supabase.
 * 
 * Usage:
 *   # List orders created before a date (dry run)
 *   npm run cleanup:orders -- --list --before "2025-11-01"
 * 
 *   # Delete orders created before a date (REAL DELETION)
 *   npm run cleanup:orders -- --delete --before "2025-11-01"
 * 
 *   # List all orders with their dates
 *   npm run cleanup:orders -- --list
 * 
 *   # Delete specific order IDs
 *   npm run cleanup:orders -- --delete --order-ids "ORDER-001,ORDER-002"
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface OrderRecord {
  id: string;
  order_id?: string;
  orderId?: string;
  amazon_order_id?: string;
  amazonOrderId?: string;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_email?: string;
  execution_status?: string;
  order_status?: string;
}

async function listOrders(beforeDate?: string) {
  console.log('\n📋 Listing orders...\n');
  
  let query = supabase
    .from('orders')
    .select('id, "orderId", amazon_order_id, created_at, updated_at, customer_name, customer_email, execution_status, order_status')
    .order('created_at', { ascending: false });

  if (beforeDate) {
    query = query.lt('created_at', beforeDate);
    console.log(`   Filter: created_at < ${beforeDate}\n`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ Error fetching orders:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('   No orders found.\n');
    return [];
  }

  console.log(`   Found ${data.length} order(s):\n`);
  console.log('   ID'.padEnd(20) + 'Order ID'.padEnd(25) + 'Created At'.padEnd(25) + 'Customer'.padEnd(30) + 'Status');
  console.log('   ' + '-'.repeat(120));

  data.forEach((order: OrderRecord) => {
    const orderId = order.orderId || order.order_id || order.amazon_order_id || order.amazonOrderId || order.id || 'N/A';
    const customer = (order.customer_name || order.customer_email || 'Unknown').substring(0, 28);
    const status = order.execution_status || order.order_status || 'N/A';
    const createdAt = new Date(order.created_at).toLocaleString();
    
    console.log(
      `   ${String(order.id).substring(0, 18).padEnd(20)}` +
      `${orderId.substring(0, 23).padEnd(25)}` +
      `${createdAt.substring(0, 23).padEnd(25)}` +
      `${customer.padEnd(30)}` +
      `${status}`
    );
  });

  console.log('\n');

  // Group by date
  const byDate = data.reduce((acc: Record<string, number>, order: OrderRecord) => {
    const date = order.created_at.split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  console.log('   Orders by date:');
  Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([date, count]) => {
      console.log(`   ${date}: ${count} order(s)`);
    });

  console.log('\n');

  return data;
}

async function deleteOrders(beforeDate?: string, orderIds?: string[]) {
  if (!beforeDate && !orderIds) {
    console.error('❌ Must specify either --before date or --order-ids');
    process.exit(1);
  }

  // First, list what will be deleted
  console.log('\n⚠️  DELETION MODE - This will permanently delete orders!\n');
  
  let ordersToDelete: OrderRecord[] = [];

  if (orderIds) {
    const ids = orderIds.split(',').map(id => id.trim());
    console.log(`   Fetching orders with IDs: ${ids.join(', ')}\n`);
    
    // Try to find orders by orderId (camelCase) or amazon_order_id (snake_case)
    // The database uses camelCase for orderId, but snake_case for amazon_order_id
    const { data: data1, error: error1 } = await supabase
      .from('orders')
      .select('id, "orderId", amazon_order_id, created_at, updated_at, customer_name, customer_email')
      .in('orderId', ids);

    const { data: data2, error: error2 } = await supabase
      .from('orders')
      .select('id, "orderId", amazon_order_id, created_at, updated_at, customer_name, customer_email')
      .in('amazon_order_id', ids);

    if (error1 || error2) {
      console.error('❌ Error fetching orders:', error1 || error2);
      process.exit(1);
    }

    // Combine and deduplicate by id
    const allOrders = [...(data1 || []), ...(data2 || [])];
    const uniqueOrders = Array.from(
      new Map(allOrders.map(o => [o.id, o])).values()
    );
    ordersToDelete = uniqueOrders;
  } else if (beforeDate) {
    ordersToDelete = await listOrders(beforeDate);
  }

  if (ordersToDelete.length === 0) {
    console.log('   No orders to delete.\n');
    return;
  }

  console.log(`\n   Will delete ${ordersToDelete.length} order(s):\n`);
  ordersToDelete.forEach((order: OrderRecord) => {
    const orderId = order.orderId || order.order_id || order.amazon_order_id || order.amazonOrderId || order.id;
    const customer = order.customer_name || order.customer_email || 'Unknown';
    console.log(`   - ${orderId} (${customer}) - Created: ${new Date(order.created_at).toLocaleString()}`);
  });

  console.log('\n   ⚠️  This action cannot be undone!\n');
  
  // In a real script, you might want to add a confirmation prompt
  // For now, we'll proceed with deletion
  
  const idsToDelete = ordersToDelete.map(o => o.id);
  
  console.log('   Deleting orders...\n');
  
  const { data, error } = await supabase
    .from('orders')
    .delete()
    .in('id', idsToDelete)
    .select();

  if (error) {
    console.error('❌ Error deleting orders:', error);
    process.exit(1);
  }

  console.log(`   ✅ Successfully deleted ${data?.length || 0} order(s)\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const listMode = args.includes('--list');
  const deleteMode = args.includes('--delete');
  const beforeIndex = args.indexOf('--before');
  const orderIdsIndex = args.indexOf('--order-ids');

  if (!listMode && !deleteMode) {
    console.log('Usage:');
    console.log('  tsx scripts/cleanup-old-orders.ts --list [--before "YYYY-MM-DD"]');
    console.log('  tsx scripts/cleanup-old-orders.ts --delete [--before "YYYY-MM-DD" | --order-ids "ID1,ID2"]');
    process.exit(1);
  }

  const beforeDate = beforeIndex >= 0 && args[beforeIndex + 1] ? args[beforeIndex + 1] : undefined;
  const orderIds = orderIdsIndex >= 0 && args[orderIdsIndex + 1] ? args[orderIdsIndex + 1] : undefined;

  if (listMode) {
    await listOrders(beforeDate);
  } else if (deleteMode) {
    await deleteOrders(beforeDate, orderIds);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

