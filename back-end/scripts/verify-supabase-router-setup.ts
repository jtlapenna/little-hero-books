/**
 * Verify Supabase is set up correctly for W1.1 Router
 * Checks for required columns, indexes, and RPC function
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySupabaseSetup() {
  console.log('\n🔍 Verifying Supabase Router Setup...\n');
  console.log('='.repeat(60));
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  // Required columns for router
  const requiredColumns = [
    'id',
    'amazon_order_id',
    'execution_status',
    'next_workflow',
    'current_workflow',
    'priority',
    'queued_at',
    'started_at',
    'one_manifest_url',
    'dedication_text'
  ];

  console.log('📋 Checking Required Columns...\n');

  // Try to get schema by querying a single row
  const { data: sampleOrder, error: queryError } = await supabase
    .from('orders')
    .select('*')
    .limit(1)
    .single();

  if (queryError && queryError.code !== 'PGRST116') {
    console.error('❌ Error querying orders table:', queryError.message);
    console.error('   Code:', queryError.code);
    return;
  }

  if (sampleOrder) {
    const existingColumns = Object.keys(sampleOrder);
    let found = 0;
    const missing: string[] = [];

    for (const col of requiredColumns) {
      if (existingColumns.includes(col)) {
        console.log(`  ✅ ${col}`);
        found++;
      } else {
        console.log(`  ❌ ${col} - MISSING`);
        missing.push(col);
      }
    }

    console.log(`\n📊 Columns: ${found}/${requiredColumns.length} found`);

    if (missing.length > 0) {
      console.log(`\n❌ Missing columns: ${missing.join(', ')}`);
      console.log('\n📝 Run migration: docs/database/migration-w0-w1-support.sql\n');
    } else {
      console.log('\n✅ All required columns exist!\n');
    }
  } else {
    console.log('⚠️  No orders found - cannot verify columns via query');
    console.log('📝 Run this SQL in Supabase SQL Editor to check:\n');
    console.log(`
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN (${requiredColumns.map(c => `'${c}'`).join(', ')})
ORDER BY column_name;
    `);
  }

  // Check get_queue_status function
  console.log('\n📋 Checking RPC Function: get_queue_status...\n');

  try {
    const { data, error } = await supabase.rpc('get_queue_status');

    if (error) {
      if (error.code === '42883' || error.message?.includes('does not exist')) {
        console.log('  ❌ Function does not exist');
        console.log('\n📝 Create function: docs/n8n-workflow-files/end-to-end-testing/create-get-queue-status-function.sql\n');
      } else {
        console.log('  ⚠️  Function exists but error calling:', error.message);
      }
    } else {
      console.log('  ✅ Function exists and works!');
      console.log(`     Processing: ${data?.processing_count || 0}`);
      console.log(`     Queued: ${data?.queued_count || 0}\n`);
    }
  } catch (err: any) {
    console.log('  ❌ Error calling function:', err.message);
    console.log('\n📝 Create function: docs/n8n-workflow-files/end-to-end-testing/create-get-queue-status-function.sql\n');
  }

  // Test router query
  console.log('📋 Testing Router Query...\n');

  const { data: readyOrders, error: routerError } = await supabase
    .from('orders')
    .select('id, amazon_order_id, next_workflow, execution_status, priority, queued_at')
    .eq('execution_status', 'ready_for_processing')
    .order('priority', { ascending: false, nullsFirst: false })
    .order('queued_at', { ascending: true })
    .limit(5);

  if (routerError) {
    console.log('  ⚠️  Router query error:', routerError.message);
    if (routerError.code === '42703') {
      console.log('     This suggests missing columns or indexes\n');
    }
  } else {
    console.log(`  ✅ Router query works! Found ${readyOrders?.length || 0} ready orders\n`);
  }

  console.log('='.repeat(60));
  console.log('\n💡 For complete verification, run SQL queries from:');
  console.log('   docs/n8n-workflow-files/end-to-end-testing/SUPABASE_ROUTER_VERIFICATION.md\n');
}

verifySupabaseSetup().catch(console.error);

