#!/usr/bin/env node
/**
 * Recover Orders from R2 Manifests
 * 
 * This script:
 * 1. Scans R2 for all order manifests
 * 2. Extracts order data from manifests
 * 3. Recreates orders in Supabase
 * 4. Sets manifest URLs correctly
 * 
 * This is for when orders have been deleted from Supabase but manifests still exist in R2.
 * 
 * Usage:
 *   node scripts/recover-orders-from-r2.js [--dry-run] [orderId]
 * 
 * Example:
 *   node scripts/recover-orders-from-r2.js --dry-run
 *   node scripts/recover-orders-from-r2.js JESSICA-CUNT
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ORDER_ID = args.find(arg => arg !== '--dry-run');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2Bucket = process.env.R2_ORDERS_BUCKET || 'little-hero-orders';
const publicR2Url = process.env.R2_PUBLIC_URL || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase credentials not found');
  process.exit(1);
}

if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
  console.error('❌ Error: R2 credentials not found');
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

function buildManifestUrl(manifestKey) {
  return `${publicR2Url}/${manifestKey}`;
}

async function downloadManifest(key) {
  try {
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    }));
    
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return JSON.parse(buffer.toString('utf-8'));
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

function extractOrderIdFromKey(key) {
  // Format: book-mvp-simple-adventure/orders/{orderId}/manifests/{stage}-manifest.json
  const match = key.match(/orders\/([^\/]+)\/manifests\//);
  return match ? match[1] : null;
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

async function findManifestsInR2() {
  console.log('Scanning R2 for manifests...');
  
  const manifests = new Map(); // orderId -> { 1, 2a, 2b, 3 }
  let continuationToken = null;
  let totalScanned = 0;

  do {
    const command = new ListObjectsV2Command({
      Bucket: r2Bucket,
      Prefix: 'book-mvp-simple-adventure/orders/',
      ContinuationToken: continuationToken,
    });

    const response = await r2Client.send(command);
    totalScanned += response.Contents?.length || 0;

    for (const object of response.Contents || []) {
      const key = object.Key;
      if (!key.includes('/manifests/') || !key.endsWith('-manifest.json')) {
        continue;
      }

      const orderId = extractOrderIdFromKey(key);
      if (!orderId) continue;

      if (!manifests.has(orderId)) {
        manifests.set(orderId, {});
      }

      const orderManifests = manifests.get(orderId);
      if (key.includes('/1-manifest.json')) {
        orderManifests['1'] = key;
      } else if (key.includes('/2a-manifest.json')) {
        orderManifests['2a'] = key;
      } else if (key.includes('/2b-manifest.json')) {
        orderManifests['2b'] = key;
      } else if (key.includes('/3-manifest.json')) {
        orderManifests['3'] = key;
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`   ✅ Scanned ${totalScanned} objects, found ${manifests.size} unique orders`);
  return manifests;
}

async function recoverOrderFromR2(orderId, manifestKeys) {
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

  // Try to load manifests (priority: 2b > 2a > 3 > 1)
  let manifest = null;
  let manifestStage = null;
  let manifestKey = null;

  for (const stage of ['2b', '2a', '3', '1']) {
    if (manifestKeys[stage]) {
      manifestKey = manifestKeys[stage];
      manifest = await downloadManifest(manifestKey);
      if (manifest) {
        manifestStage = stage;
        console.log(`   ✅ Loaded ${stage}-manifest.json`);
        break;
      }
    }
  }

  if (!manifest) {
    console.log(`   ❌ No valid manifest found in R2`);
    return { recovered: false, reason: 'no_manifest' };
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

  // Prepare Supabase insert (using snake_case for database)
  const insertData = {
    amazon_order_id: orderData.amazonOrderId,
    orderId: orderData.orderId, // Keep camelCase for orderId field
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
    status: 'new', // Default status
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

  // Find all manifests in R2
  const manifests = await findManifestsInR2();
  
  if (manifests.size === 0) {
    console.log('\n✅ No manifests found in R2');
    return;
  }

  console.log(`\nFound ${manifests.size} orders with manifests in R2\n`);

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

  for (const [orderId, manifestKeys] of manifests.entries()) {
    if (existingIds.has(orderId.toLowerCase())) {
      skipped++;
      continue;
    }

    const result = await recoverOrderFromR2(orderId, manifestKeys);
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
    // Find manifests for specific order
    const manifestKeys = {};
    for (const stage of ['1', '2a', '2b', '3']) {
      const key = buildManifestKey(ORDER_ID, stage);
      try {
        const response = await r2Client.send(new GetObjectCommand({
          Bucket: r2Bucket,
          Key: key,
        }));
        manifestKeys[stage] = key;
      } catch {
        // Manifest doesn't exist
      }
    }

    if (Object.keys(manifestKeys).length === 0) {
      console.error(`❌ No manifests found for order ${ORDER_ID}`);
      process.exit(1);
    }

    await recoverOrderFromR2(ORDER_ID, manifestKeys);
  } else {
    await recoverAll();
  }
}

main().catch(console.error);

