#!/usr/bin/env tsx
/**
 * Fetch all orders with all columns from Supabase
 * 
 * This script fetches all orders and displays all columns to help
 * identify data inconsistencies and compare against documentation.
 * 
 * Usage:
 *   npm run fetch:all-orders
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fetchAllOrders() {
  console.log('📊 Fetching all orders from Supabase...\n');

  try {
    // Fetch all orders with all columns
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching orders:', error);
      process.exit(1);
    }

    if (!orders || orders.length === 0) {
      console.log('⚠️  No orders found in database');
      return;
    }

    console.log(`✅ Found ${orders.length} orders\n`);
    console.log('=' .repeat(80));
    console.log('ALL ORDERS WITH ALL COLUMNS');
    console.log('=' .repeat(80));
    console.log('');

    // Display each order with all its data
    orders.forEach((order, index) => {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`ORDER ${index + 1} of ${orders.length}`);
      console.log('─'.repeat(80));
      console.log(JSON.stringify(order, null, 2));
    });

    // Summary statistics
    console.log('\n\n');
    console.log('=' .repeat(80));
    console.log('SUMMARY STATISTICS');
    console.log('=' .repeat(80));
    console.log('');

    // Count orders by status
    const statusCounts: Record<string, number> = {};
    const executionStatusCounts: Record<string, number> = {};
    const hasCharacterHash = orders.filter(o => o.character_hash).length;
    const hasReviewStages = orders.filter(o => o.review_stages).length;
    const hasFlags = orders.filter(o => o.has_flags).length;

    orders.forEach(order => {
      const status = order.order_status || 'null';
      const execStatus = order.execution_status || 'null';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      executionStatusCounts[execStatus] = (executionStatusCounts[execStatus] || 0) + 1;
    });

    console.log(`Total Orders: ${orders.length}`);
    console.log(`Orders with character_hash: ${hasCharacterHash}`);
    console.log(`Orders with review_stages: ${hasReviewStages}`);
    console.log(`Orders with has_flags=true: ${hasFlags}`);
    console.log('');

    console.log('Order Status Distribution:');
    Object.entries(statusCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
    console.log('');

    console.log('Execution Status Distribution:');
    Object.entries(executionStatusCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
    console.log('');

    // Check for orders with preBria status
    const preBriaStatuses: Record<string, number> = {};
    orders.forEach(order => {
      const preBriaStatus = order.review_stages?.preBria?.status || 'null';
      preBriaStatuses[preBriaStatus] = (preBriaStatuses[preBriaStatus] || 0) + 1;
    });

    console.log('PreBria Stage Status Distribution:');
    Object.entries(preBriaStatuses)
      .sort(([, a], [, b]) => b - a)
      .forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });

    console.log('\n');
    console.log('=' .repeat(80));
    console.log('✅ Done!');
    console.log('=' .repeat(80));

  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script
fetchAllOrders();

