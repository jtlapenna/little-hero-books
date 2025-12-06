#!/usr/bin/env node
/**
 * Recover Manifest URLs from R2 to Supabase
 * 
 * This script:
 * 1. Finds orders in Supabase missing manifest URLs
 * 2. Checks R2 for existing manifests
 * 3. Updates Supabase with correct manifest URLs
 * 
 * Usage:
 *   node scripts/recover-manifest-urls.js [--dry-run] [orderId]
 * 
 * Example:
 *   node scripts/recover-manifest-urls.js --dry-run
 *   node scripts/recover-manifest-urls.js JESSICA-CUNT
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'back-end', '.env.local') });
const { createClient } = require(path.join(__dirname, '..', 'back-end', 'node_modules', '@supabase', 'supabase-js'));
const axios = require('axios');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ORDER_ID = args.find(arg => arg !== '--dry-run');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

const backendUrl = process.env.BACKEND_URL || 'https://admin.littleherolabs.com';
const publicR2Url = process.env.R2_PUBLIC_URL || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase credentials not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function buildManifestKey(orderId, stage) {
  return `book-mvp-simple-adventure/orders/${orderId}/manifests/${stage}-manifest.json`;
}

function buildManifestUrl(manifestKey) {
  return `${publicR2Url}/${manifestKey}`;
}

async function checkManifestInR2(orderId, stage) {
  const key = buildManifestKey(orderId, stage);
  try {
    // Use backend API to check if manifest exists
    const response = await axios.get(`${backendUrl}/api/manifests/${key}`, {
      validateStatus: (status) => status < 500, // Don't throw on 404
    });
    if (response.status === 200) {
      return { exists: true, key };
    }
    return { exists: false, key };
  } catch (error) {
    if (error.response?.status === 404) {
      return { exists: false, key };
    }
    throw error;
  }
}

async function recoverOrder(orderId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Recovering: ${orderId}`);
  console.log('='.repeat(60));

  // Get order from Supabase
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .or(`amazon_order_id.eq.${orderId},orderId.eq.${orderId}`)
    .single();

  if (error || !order) {
    console.log(`   ❌ Order not found in Supabase`);
    console.log(`   ⚠️  Cannot recover - order needs to be recreated from manifest`);
    return { recovered: false, reason: 'not_in_supabase' };
  }

  console.log(`   ✅ Order found in Supabase (ID: ${order.id})`);

  // Check what manifests exist in R2
  const checks = {
    '1': await checkManifestInR2(orderId, '1'),
    '2a': await checkManifestInR2(orderId, '2a'),
    '2b': await checkManifestInR2(orderId, '2b'),
    '3': await checkManifestInR2(orderId, '3'),
  };

  const updates = {};
  let hasUpdates = false;

  // Check each manifest
  if (checks['1'].exists && !order.one_manifest_url) {
    updates.one_manifest_url = buildManifestUrl(checks['1'].key);
    hasUpdates = true;
    console.log(`   ✅ Found 1-manifest.json in R2`);
  }

  if (checks['2a'].exists && !order.manifest_2a_url) {
    updates.manifest_2a_url = buildManifestUrl(checks['2a'].key);
    hasUpdates = true;
    console.log(`   ✅ Found 2a-manifest.json in R2`);
  }

  if (checks['2b'].exists && !order.manifest_2b_url) {
    updates.manifest_2b_url = buildManifestUrl(checks['2b'].key);
    hasUpdates = true;
    console.log(`   ✅ Found 2b-manifest.json in R2`);
  }

  if (checks['3'].exists && !order.manifest_3_url) {
    updates.manifest_3_url = buildManifestUrl(checks['3'].key);
    hasUpdates = true;
    console.log(`   ✅ Found 3-manifest.json in R2`);
  }

  if (!hasUpdates) {
    console.log(`   ℹ️  No updates needed (all manifest URLs already set or manifests don't exist)`);
    return { recovered: false, reason: 'no_updates_needed' };
  }

  // Update Supabase
  if (DRY_RUN) {
    console.log(`\n   [DRY RUN] Would update Supabase with:`);
    Object.entries(updates).forEach(([key, value]) => {
      console.log(`   - ${key}: ${value}`);
    });
    return { recovered: true, dryRun: true, updates };
  }

  console.log(`\n   Updating Supabase...`);
  const { error: updateError } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', order.id);

  if (updateError) {
    console.error(`   ❌ Error updating Supabase:`, updateError.message);
    return { recovered: false, reason: 'update_failed', error: updateError };
  }

  console.log(`   ✅ Successfully updated Supabase`);
  return { recovered: true, updates };
}

async function recoverAll() {
  console.log('='.repeat(60));
  console.log('Recovering All Orders');
  console.log(DRY_RUN ? '(DRY RUN MODE - No changes will be made)' : '');
  console.log('='.repeat(60));

  // Get all orders missing manifest URLs
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, orderId, amazon_order_id, one_manifest_url, manifest_2a_url, manifest_2b_url, manifest_3_url')
    .or('one_manifest_url.is.null,manifest_2a_url.is.null,manifest_2b_url.is.null,manifest_3_url.is.null')
    .order('id', { ascending: false })
    .limit(100);

  if (error) {
    console.error('❌ Error fetching orders:', error.message);
    process.exit(1);
  }

  if (!orders || orders.length === 0) {
    console.log('✅ No orders need recovery');
    return;
  }

  console.log(`\nFound ${orders.length} orders that may need recovery\n`);

  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of orders) {
    const orderId = order.orderId || order.order_id || order.amazon_order_id;
    if (!orderId) {
      console.log(`⚠️  Skipping order ID ${order.id} (no orderId found)`);
      skipped++;
      continue;
    }

    const result = await recoverOrder(orderId);
    if (result.recovered) {
      recovered++;
    } else if (result.reason === 'no_updates_needed') {
      skipped++;
    } else {
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Recovery Summary:');
  console.log(`   - Recovered: ${recovered}`);
  console.log(`   - Skipped: ${skipped}`);
  console.log(`   - Failed: ${failed}`);
  console.log('='.repeat(60));
}

async function main() {
  if (ORDER_ID) {
    await recoverOrder(ORDER_ID);
  } else {
    await recoverAll();
  }
}

main().catch(console.error);

