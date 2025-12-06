#!/usr/bin/env node
/**
 * Diagnose Missing Manifest Issue
 * 
 * This script checks:
 * 1. What orders are in Supabase
 * 2. Which orders have manifest URLs in Supabase
 * 3. Which orders have manifests in R2
 * 4. Identifies the mismatch
 * 
 * Usage:
 *   node scripts/diagnose-missing-manifests.js [orderId]
 * 
 * Example:
 *   node scripts/diagnose-missing-manifests.js
 *   node scripts/diagnose-missing-manifests.js JESSICA-CUNT
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');

const ORDER_ID = process.argv[2];

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2Bucket = process.env.R2_ORDERS_BUCKET || 'little-hero-orders';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase credentials not found');
  console.log('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
  console.error('❌ Error: R2 credentials not found');
  console.log('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
});

function buildManifestKey(orderId, stage) {
  return `book-mvp-simple-adventure/orders/${orderId}/manifests/${stage}-manifest.json`;
}

async function checkManifestInR2(orderId, stage) {
  const key = buildManifestKey(orderId, stage);
  try {
    await r2Client.send(new HeadObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function diagnoseOrder(orderId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Diagnosing Order: ${orderId}`);
  console.log('='.repeat(60));

  // 1. Check Supabase
  console.log('\n1. Checking Supabase...');
  const { data: supabaseOrder, error: supabaseError } = await supabase
    .from('orders')
    .select('*')
    .or(`amazon_order_id.eq.${orderId},orderId.eq.${orderId},order_id.eq.${orderId}`)
    .single();

  if (supabaseError) {
    if (supabaseError.code === 'PGRST116') {
      console.log('   ❌ Order NOT FOUND in Supabase');
      console.log('   This explains why it disappeared!');
    } else {
      console.error('   ❌ Error querying Supabase:', supabaseError.message);
    }
  } else {
    console.log('   ✅ Order found in Supabase');
    console.log(`   - ID: ${supabaseOrder.id}`);
    console.log(`   - Order ID: ${supabaseOrder.orderId || supabaseOrder.order_id || supabaseOrder.amazon_order_id}`);
    console.log(`   - Status: ${supabaseOrder.execution_status || supabaseOrder.status}`);
    console.log(`   - one_manifest_url: ${supabaseOrder.one_manifest_url || 'NULL'}`);
    console.log(`   - manifest_2a_url: ${supabaseOrder.manifest_2a_url || 'NULL'}`);
    console.log(`   - manifest_2b_url: ${supabaseOrder.manifest_2b_url || 'NULL'}`);
    console.log(`   - manifest_3_url: ${supabaseOrder.manifest_3_url || 'NULL'}`);
    
    const hasAnyManifestUrl = !!(
      supabaseOrder.one_manifest_url ||
      supabaseOrder.manifest_2a_url ||
      supabaseOrder.manifest_2b_url ||
      supabaseOrder.manifest_3_url
    );
    
    if (!hasAnyManifestUrl) {
      console.log('   ⚠️  NO manifest URLs in Supabase (this causes "Missing Manifest" status)');
    }
  }

  // 2. Check R2
  console.log('\n2. Checking R2 Storage...');
  const manifests = {
    '1': await checkManifestInR2(orderId, '1'),
    '2a': await checkManifestInR2(orderId, '2a'),
    '2b': await checkManifestInR2(orderId, '2b'),
    '3': await checkManifestInR2(orderId, '3'),
  };

  console.log('   Manifests in R2:');
  Object.entries(manifests).forEach(([stage, exists]) => {
    console.log(`   - ${stage}-manifest.json: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
  });

  const hasAnyManifestInR2 = Object.values(manifests).some(exists => exists);
  if (!hasAnyManifestInR2) {
    console.log('   ⚠️  NO manifests found in R2');
  }

  // 3. Diagnosis
  console.log('\n3. Diagnosis:');
  if (!supabaseOrder) {
    console.log('   ❌ PROBLEM: Order missing from Supabase');
    console.log('   ✅ SOLUTION: Need to recover order from R2 manifests');
  } else if (!hasAnyManifestUrl && hasAnyManifestInR2) {
    console.log('   ❌ PROBLEM: Manifests exist in R2 but URLs not stored in Supabase');
    console.log('   ✅ SOLUTION: Update Supabase with manifest URLs from R2');
  } else if (hasAnyManifestUrl && !hasAnyManifestInR2) {
    console.log('   ❌ PROBLEM: Supabase has URLs but manifests missing from R2');
    console.log('   ⚠️  This is a data integrity issue - manifests may have been deleted');
  } else if (!hasAnyManifestUrl && !hasAnyManifestInR2) {
    console.log('   ❌ PROBLEM: No manifests anywhere');
    console.log('   ⚠️  Order may need to be reprocessed');
  } else {
    console.log('   ✅ Order looks healthy');
  }
}

async function diagnoseAll() {
  console.log('='.repeat(60));
  console.log('Diagnosing All Orders');
  console.log('='.repeat(60));

  // Get all orders from Supabase
  console.log('\n1. Fetching orders from Supabase...');
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, orderId, order_id, amazon_order_id, one_manifest_url, manifest_2a_url, manifest_2b_url, manifest_3_url, execution_status')
    .order('id', { ascending: false })
    .limit(100);

  if (error) {
    console.error('❌ Error fetching orders:', error.message);
    process.exit(1);
  }

  if (!orders || orders.length === 0) {
    console.log('   ⚠️  No orders found in Supabase');
    console.log('   This is the problem - orders have disappeared!');
    return;
  }

  console.log(`   ✅ Found ${orders.length} orders in Supabase`);

  // Check which have manifest URLs
  const ordersWithManifestUrls = orders.filter(o => 
    o.one_manifest_url || o.manifest_2a_url || o.manifest_2b_url || o.manifest_3_url
  );
  const ordersWithoutManifestUrls = orders.filter(o => 
    !o.one_manifest_url && !o.manifest_2a_url && !o.manifest_2b_url && !o.manifest_3_url
  );

  console.log(`\n2. Manifest URL Status:`);
  console.log(`   - Orders WITH manifest URLs: ${ordersWithManifestUrls.length}`);
  console.log(`   - Orders WITHOUT manifest URLs: ${ordersWithoutManifestUrls.length}`);

  if (ordersWithoutManifestUrls.length > 0) {
    console.log(`\n3. Orders missing manifest URLs (will show "Missing Manifest"):`);
    ordersWithoutManifestUrls.forEach(o => {
      const orderId = o.orderId || o.order_id || o.amazon_order_id || `ID:${o.id}`;
      console.log(`   - ${orderId} (status: ${o.execution_status || 'unknown'})`);
    });
  }

  // Check R2 for a sample
  console.log(`\n4. Checking R2 for sample orders...`);
  const sampleSize = Math.min(5, ordersWithoutManifestUrls.length);
  for (let i = 0; i < sampleSize; i++) {
    const order = ordersWithoutManifestUrls[i];
    const orderId = order.orderId || order.order_id || order.amazon_order_id;
    if (!orderId) continue;

    const has2a = await checkManifestInR2(orderId, '2a');
    const has2b = await checkManifestInR2(orderId, '2b');
    const has3 = await checkManifestInR2(orderId, '3');

    if (has2a || has2b || has3) {
      console.log(`   ⚠️  ${orderId}: Manifests EXIST in R2 but URLs missing in Supabase!`);
    } else {
      console.log(`   ✅ ${orderId}: No manifests in R2 (correctly marked as missing)`);
    }
  }
}

async function main() {
  if (ORDER_ID) {
    await diagnoseOrder(ORDER_ID);
  } else {
    await diagnoseAll();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Next Steps:');
  console.log('1. Run recovery script to sync manifest URLs from R2 to Supabase');
  console.log('2. Check why orders disappeared from Supabase (RLS policies, deletion, etc.)');
  console.log('3. Review Supabase logs for any deletion events');
  console.log('='.repeat(60));
}

main().catch(console.error);

