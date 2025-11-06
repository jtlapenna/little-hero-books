/**
 * Quick script to check if migration-status-system.sql has been run
 * This helps verify which columns exist in the database
 */

// Load environment variables
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { supabase } from '../src/lib/supabase-client';

async function checkMigrationStatus() {
  console.log('\n🔍 Checking Migration Status...\n');
  console.log('='.repeat(60));
  
  // Check for new columns from migration-status-system.sql
  const newColumns = [
    'review_stages',
    'has_flags',
    'flags',
    'customer_approval_status',
    'customer_approval_required',
    'customer_approval_requested_at',
    'customer_approval_approved_at',
    'delivered_at'
  ];
  
  console.log('\n📋 Checking for NEW columns (from migration-status-system.sql):\n');
  
  // Get all columns from orders table
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .limit(1);
  
  if (ordersError && ordersError.code === 'PGRST116') {
    // No rows, but table exists - try to get schema info differently
    console.log('⚠️  Cannot query directly (no rows or permissions).');
    console.log('📝 Please run this query in Supabase SQL Editor:\n');
    console.log(`
SELECT 
  column_name, 
  data_type,
  column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN (
    'review_stages', 
    'has_flags', 
    'flags', 
    'customer_approval_status',
    'customer_approval_required',
    'customer_approval_requested_at',
    'customer_approval_approved_at',
    'delivered_at'
  )
ORDER BY column_name;
    `);
    return;
  }
  
  if (ordersError) {
    console.error('❌ Error querying orders table:', ordersError.message);
    return;
  }
  
  if (orders && orders.length > 0) {
    const order = orders[0];
    const existingColumns = Object.keys(order);
    
    console.log('✅ Found existing order. Checking columns...\n');
    
    let found = 0;
    let missing: string[] = [];
    
    for (const col of newColumns) {
      if (existingColumns.includes(col)) {
        console.log(`  ✅ ${col} - EXISTS`);
        found++;
      } else {
        console.log(`  ❌ ${col} - MISSING`);
        missing.push(col);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Found: ${found}/${newColumns.length} columns`);
    
    if (missing.length > 0) {
      console.log(`\n❌ MIGRATION NEEDED: ${missing.length} columns are missing\n`);
      console.log('📝 Next steps:');
      console.log('   1. Open Supabase Dashboard → SQL Editor');
      console.log('   2. Copy contents of database/migration-status-system.sql');
      console.log('   3. Paste and click "Run"');
      console.log('   4. Re-run this check: npm run check:migration\n');
    } else {
      console.log(`\n✅ All migration columns exist! Migration has been run.\n`);
    }
  } else {
    console.log('⚠️  No orders found in database.');
    console.log('📝 Cannot verify columns without at least one row.');
    console.log('💡 Try creating a test order first, or run the migration anyway.\n');
  }
  
  // Also check for existing columns we expect
  console.log('\n📋 Checking for EXISTING columns (should already exist):\n');
  const existingColumns = ['status', 'workflow_step', 'lulu_status', 'human_approved'];
  const order = orders?.[0];
  
  if (order) {
    for (const col of existingColumns) {
      if (order[col] !== undefined) {
        console.log(`  ✅ ${col} - EXISTS`);
      } else {
        console.log(`  ⚠️  ${col} - NOT FOUND (may be NULL)`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

checkMigrationStatus().catch(console.error);

