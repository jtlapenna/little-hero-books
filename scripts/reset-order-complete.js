#!/usr/bin/env node

/**
 * Reset order to pre-w0 state - keeps Amazon API data, removes w0 processing
 * Usage: node scripts/reset-order-complete.js <order-id>
 * Example: node scripts/reset-order-complete.js 111-0060602-1283417
 * 
 * This script:
 * - Deletes w0-generated files from R2 (manifests)
 * - Resets Supabase order to state after Amazon API but before w0
 * - Preserves all Amazon API data (shipping, character specs, etc.)
 */

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const https = require('https');

// Load .env file
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv not available
}

const ORDER_ID = process.argv[2];

if (!ORDER_ID) {
  console.error('❌ Usage: node scripts/reset-order-complete.js <order-id>');
  console.error('   Example: node scripts/reset-order-complete.js 111-0060602-1283417');
  process.exit(1);
}

// R2 Configuration
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || process.env.CLOUDEFLARE_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_ID_KEY || process.env.CLOUDFLARE_R2_ACCESS_KEY;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ Error: R2 credentials not found');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Supabase credentials not found');
  process.exit(1);
}

const BUCKET_NAME = 'little-hero-orders';
const PREFIX = `book-mvp-simple-adventure/orders/${ORDER_ID}/`;
const ENDPOINT = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Create S3 client for R2
const s3Client = new S3Client({
  endpoint: ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

// List all objects with prefix
async function listAllObjects(prefix) {
  const objects = [];
  let continuationToken = undefined;

  do {
    try {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const response = await s3Client.send(command);
      
      if (response.Contents && response.Contents.length > 0) {
        objects.push(...response.Contents.map(obj => obj.Key));
      }

      continuationToken = response.NextContinuationToken;
    } catch (error) {
      console.error(`❌ Error listing objects: ${error.message}`);
      throw error;
    }
  } while (continuationToken);

  return objects;
}

// Delete objects in batches
async function deleteObjects(objectKeys, batchSize = 100) {
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < objectKeys.length; i += batchSize) {
    const batch = objectKeys.slice(i, i + batchSize);
    
    try {
      const command = new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: batch.map(key => ({ Key: key })),
          Quiet: false,
        },
      });

      const response = await s3Client.send(command);
      
      if (response.Deleted) {
        deleted += response.Deleted.length;
      }
      if (response.Errors) {
        failed += response.Errors.length;
        response.Errors.forEach(error => {
          console.log(`  ⚠️  Failed to delete: ${error.Key} - ${error.Message}`);
        });
      }
    } catch (error) {
      console.error(`❌ Error deleting batch: ${error.message}`);
      failed += batch.length;
    }
  }

  return { deleted, failed };
}

// Reset order in Supabase to pre-w0 state (keep Amazon API data)
async function resetSupabaseOrder(orderId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/orders`);
    url.searchParams.append('amazon_order_id', 'eq.' + orderId);
    url.searchParams.append('orderId', 'eq.' + orderId);
    url.searchParams.append('select', '*');

    // Reset to state after Amazon API but before w0 processing
    const resetData = {
      execution_status: 'pending_w0',
      next_workflow: null,
      workflow_step: null,
      status: 'new',
      one_manifest_url: null,
      one_manifest_key: null,
      queued_at: null,
      started_at: null,
      current_workflow: null,
      error_message: null,
      error_type: null,
      retry_count: 0,
      last_error_at: null,
      next_retry_at: null,
      updated_at: new Date().toISOString(),
    };

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(resetData));
    req.end();
  });
}

// Main reset function
async function resetOrder() {
  console.log('=========================================');
  console.log('Reset Order to Pre-w0 State');
  console.log('=========================================');
  console.log(`Order ID: ${ORDER_ID}`);
  console.log('');
  console.log('This will:');
  console.log('  - Delete w0-generated files from R2');
  console.log('  - Reset Supabase order to state after Amazon API');
  console.log('  - Preserve all Amazon API data');
  console.log('');

  try {
    // Step 1: Delete from R2
    console.log('📋 Step 1: Listing R2 objects...');
    const r2Objects = await listAllObjects(PREFIX);
    
    if (r2Objects.length > 0) {
      console.log(`Found ${r2Objects.length} objects in R2:`);
      r2Objects.forEach(obj => {
        console.log(`  - ${obj}`);
      });
      console.log('');

      console.log('🗑️  Deleting R2 objects...');
      const r2Result = await deleteObjects(r2Objects, 100);
      console.log(`✅ Deleted ${r2Result.deleted} objects from R2`);
      if (r2Result.failed > 0) {
        console.log(`⚠️  Failed to delete ${r2Result.failed} objects`);
      }
    } else {
      console.log('✅ No R2 objects found (already clean)');
    }
    console.log('');

    // Step 2: Reset Supabase order to pre-w0 state
    console.log('🔄 Step 2: Resetting Supabase order to pre-w0 state...');
    const supabaseResult = await resetSupabaseOrder(ORDER_ID);
    
    if (supabaseResult.status === 200 || supabaseResult.status === 204) {
      const updatedCount = Array.isArray(supabaseResult.data) ? supabaseResult.data.length : 1;
      console.log(`✅ Reset ${updatedCount} record(s) in Supabase`);
      console.log('   Reset fields:');
      console.log('     - execution_status: pending_w0');
      console.log('     - next_workflow: null');
      console.log('     - workflow_step: null');
      console.log('     - one_manifest_url: null');
      console.log('     - queued_at: null');
      console.log('     - All error/retry fields cleared');
    } else if (supabaseResult.status === 404) {
      console.log('⚠️  Order not found in Supabase');
      console.log('   The order may need to be created via Amazon API first');
    } else {
      console.log(`⚠️  Supabase reset returned status ${supabaseResult.status}`);
      console.log(`   Response: ${JSON.stringify(supabaseResult.data)}`);
    }
    console.log('');

    console.log('=========================================');
    console.log('✅ Reset Complete!');
    console.log('=========================================');
    console.log('');
    console.log(`Order ${ORDER_ID} has been reset to pre-w0 state:`);
    console.log('  ✅ R2: Deleted w0-generated files (manifests)');
    console.log('  ✅ Supabase: Reset to state after Amazon API, before w0');
    console.log('');
    console.log('The order retains all Amazon API data and is ready for w0 processing.');

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the reset
resetOrder().catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});

