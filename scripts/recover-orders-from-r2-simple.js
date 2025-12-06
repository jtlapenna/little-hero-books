#!/usr/bin/env node
/**
 * Simple Order Recovery from R2 Manifests
 * 
 * Uses the backend API to list orders (which loads from R2 as fallback)
 * Then recreates missing orders in Supabase
 * 
 * This avoids R2 credential issues by using the backend API.
 * 
 * Usage:
 *   node scripts/recover-orders-from-r2-simple.js [--dry-run] [orderId]
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

async function getOrderFromBackend(orderId) {
  try {
    const response = await axios.get(`${backendUrl}/api/orders/${orderId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function getAllOrdersFromBackend() {
  try {
    const response = await axios.get(`${backendUrl}/api/orders`);
    return response.data || [];
  } catch (error) {
    console.error('Error fetching orders from backend:', error.message);
    return [];
  }
}

async function downloadManifestFromBackend(orderId, stage) {
  const manifestKey = buildManifestKey(orderId, stage);
  try {
    const response = await axios.get(`${backendUrl}/api/manifests/${manifestKey}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

function extractOrderDataFromManifest(manifest, orderId) {
  const order = manifest.order || {};
  const characterSpecs = order.characterSpecs || {};
  const bookSpecs = order.bookSpecs || {};
  const orderDetails = order.orderDetails || {};
  const customer = order.buyer || order.customer || {};
  
  return {
    orderId: orderId || order.orderId || manifest.amazonOrderId,
    amazonOrderId: manifest.amazonOrderId || orderId || order.orderId,
    customerEmail: customer.email || order.customerEmail || null,
    customerName: customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null,
    characterHash: manifest.characterHash || order.characterHash || null,
    characterSpecs: characterSpecs,
    bookSpecs: bookSpecs,
    orderDetails: orderDetails,
    purchaseDate: order.purchaseDate || manifest.runStamp || new Date().toISOString(),
    marketplaceId: manifest.marketplaceId || 'ATVPDKIKX0DER',
    project: manifest.project || 'book-mvp-simple-adventure',
    platform: manifest.platform || 'amazon',
    assetPrefix: manifest.assetPrefix || 'book-mvp-simple-adventure',
    templatePath: manifest.templatePath || 'templates',
  };
}

async function checkManifestsExist(orderId) {
  const manifests = {};
  for (const stage of ['1', '2a', '2b', '3']) {
    const manifest = await downloadManifestFromBackend(orderId, stage);
    if (manifest) {
      manifests[stage] = buildManifestKey(orderId, stage);
    }
  }
  return manifests;
}

async function recoverOrder(orderId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Recovering Order: ${orderId}`);
  console.log('='.repeat(60));

  // Check if order already exists in Supabase
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id, amazon_order_id, orderId, order_id')
    .or(`amazon_order_id.eq.${orderId},orderId.eq.${orderId},order_id.eq.${orderId}`)
    .single();

  if (existingOrder) {
    console.log(`   ⚠️  Order already exists in Supabase (ID: ${existingOrder.id})`);
    console.log(`   ℹ️  Skipping - use recover-manifest-urls.js to update manifest URLs`);
    return { recovered: false, reason: 'already_exists' };
  }

  // Get order from backend (loads from R2)
  console.log(`   Fetching order data from backend...`);
  const backendOrder = await getOrderFromBackend(orderId);
  
  if (!backendOrder) {
    console.log(`   ❌ Order not found in backend (no manifests in R2)`);
    return { recovered: false, reason: 'not_found' };
  }

  console.log(`   ✅ Order found in backend (loaded from R2)`);

  // Check which manifests exist
  const manifestKeys = await checkManifestsExist(orderId);
  const manifestStages = Object.keys(manifestKeys);
  
  if (manifestStages.length === 0) {
    console.log(`   ❌ No manifests found in R2`);
    return { recovered: false, reason: 'no_manifests' };
  }

  console.log(`   ✅ Found manifests: ${manifestStages.join(', ')}`);

  // Try to load the best manifest (priority: 2b > 2a > 3 > 1)
  let manifest = null;
  let manifestStage = null;
  
  for (const stage of ['2b', '2a', '3', '1']) {
    if (manifestKeys[stage]) {
      manifest = await downloadManifestFromBackend(orderId, stage);
      if (manifest) {
        manifestStage = stage;
        console.log(`   ✅ Loaded ${stage}-manifest.json`);
        break;
      }
    }
  }

  if (!manifest) {
    console.log(`   ❌ Could not load manifest`);
    return { recovered: false, reason: 'manifest_load_failed' };
  }

  // Extract order data
  const orderData = extractOrderDataFromManifest(manifest, orderId);
  console.log(`   📋 Extracted order data:`);
  console.log(`      - Order ID: ${orderData.orderId}`);
  console.log(`      - Amazon Order ID: ${orderData.amazonOrderId}`);
  console.log(`      - Character Hash: ${orderData.characterHash || 'N/A'}`);
  console.log(`      - Customer: ${orderData.customerName || orderData.customerEmail || 'N/A'}`);

  // Build manifest URLs
  const manifestUrls = {};
  if (manifestKeys['1']) manifestUrls.one_manifest_url = buildManifestUrl(manifestKeys['1']);
  if (manifestKeys['2a']) manifestUrls.manifest_2a_url = buildManifestUrl(manifestKeys['2a']);
  if (manifestKeys['2b']) manifestUrls.manifest_2b_url = buildManifestUrl(manifestKeys['2b']);
  if (manifestKeys['3']) manifestUrls.manifest_3_url = buildManifestUrl(manifestKeys['3']);

  // Prepare Supabase insert
  const insertData = {
    amazon_order_id: orderData.amazonOrderId,
    orderId: orderData.orderId,
    customer_email: orderData.customerEmail,
    customer_name: orderData.customerName,
    character_hash: orderData.characterHash,
    character_specs: orderData.characterSpecs || {},
    product_info: {
      bookSpecs: orderData.bookSpecs || {},
      orderDetails: orderData.orderDetails || {},
    },
    purchase_date: orderData.purchaseDate || new Date().toISOString(),
    marketplace_id: orderData.marketplaceId || 'ATVPDKIKX0DER',
    execution_status: 'ready_for_processing',
    next_workflow: manifestStage === '3' ? '4' : manifestStage === '2b' ? '3' : manifestStage === '2a' ? '2B' : '2A',
    status: 'new',
    ...manifestUrls,
  };

  if (DRY_RUN) {
    console.log(`\n   [DRY RUN] Would create order in Supabase:`);
    console.log(JSON.stringify(insertData, null, 2));
    return { recovered: true, dryRun: true, orderData: insertData };
  }

  // Insert into Supabase
  console.log(`\n   Creating order in Supabase...`);
  const { data: newOrder, error } = await supabase
    .from('orders')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error(`   ❌ Error creating order:`, error.message);
    return { recovered: false, reason: 'insert_failed', error };
  }

  console.log(`   ✅ Order created in Supabase (ID: ${newOrder.id})`);
  return { recovered: true, orderId: newOrder.id, orderData: insertData };
}

async function recoverAll() {
  console.log('='.repeat(60));
  console.log('Recovering All Orders from R2');
  console.log(DRY_RUN ? '(DRY RUN MODE - No changes will be made)' : '');
  console.log('='.repeat(60));

  // Get all orders from backend (includes R2 fallback)
  console.log('\nFetching orders from backend...');
  const backendOrders = await getAllOrdersFromBackend();
  
  if (backendOrders.length === 0) {
    console.log('\n✅ No orders found in backend');
    return;
  }

  console.log(`   ✅ Found ${backendOrders.length} orders in backend\n`);

  // Get existing orders from Supabase
  const { data: existingOrders } = await supabase
    .from('orders')
    .select('amazon_order_id, orderId, order_id');

  const existingIds = new Set();
  (existingOrders || []).forEach(o => {
    if (o.amazon_order_id) existingIds.add(o.amazon_order_id.toLowerCase());
    if (o.orderId) existingIds.add(o.orderId.toLowerCase());
    if (o.order_id) existingIds.add(o.order_id.toLowerCase());
  });

  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of backendOrders) {
    const orderId = order.orderId || order.amazonOrderId;
    if (!orderId) {
      skipped++;
      continue;
    }

    if (existingIds.has(orderId.toLowerCase())) {
      skipped++;
      continue;
    }

    const result = await recoverOrder(orderId);
    if (result.recovered) {
      recovered++;
    } else if (result.reason === 'already_exists') {
      skipped++;
    } else {
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Recovery Summary:');
  console.log(`   - Recovered: ${recovered}`);
  console.log(`   - Skipped (already exist): ${skipped}`);
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

