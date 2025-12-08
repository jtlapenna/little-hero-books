#!/usr/bin/env node

/**
 * Clean up R2 orders - keep only specified order
 * Uses S3-compatible API (same as list-r2-folders.js)
 * Usage: node scripts/cleanup-r2-orders-s3.js [order-id-to-keep]
 */

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const readline = require('readline');

// Load .env file
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv not available
}

const BUCKET_NAME = 'little-hero-orders';
const PREFIX = 'book-mvp-simple-adventure/orders/';
const KEEP_ORDER = process.argv[2] || '111-0060602-1283417';

// R2 Configuration from environment
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || process.env.CLOUDEFLARE_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_ID_KEY || process.env.CLOUDFLARE_R2_ACCESS_KEY;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ Error: R2 credentials not found');
  console.error('   Required environment variables:');
  console.error('   - CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID)');
  console.error('   - R2_ACCESS_KEY_ID (or R2_ACCESS_ID_KEY or CLOUDFLARE_R2_ACCESS_KEY)');
  console.error('   - R2_SECRET_ACCESS_KEY (or CLOUDFLARE_R2_SECRET_ACCESS_KEY)');
  process.exit(1);
}

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

// List all folders (order prefixes)
async function listOrderFolders() {
  const folders = [];
  let continuationToken = undefined;

  do {
    try {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: PREFIX,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
        Delimiter: '/',
      });

      const response = await s3Client.send(command);

      if (response.CommonPrefixes) {
        response.CommonPrefixes.forEach(prefix => {
          folders.push(prefix.Prefix);
        });
      }

      continuationToken = response.NextContinuationToken;
    } catch (error) {
      console.error(`❌ Error listing folders: ${error.message}`);
      throw error;
    }
  } while (continuationToken);

  return folders;
}

// List all objects in a prefix
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

      if ((i + batchSize) % (batchSize * 10) === 0 || i + batchSize >= objectKeys.length) {
        console.log(`  Progress: ${Math.min(i + batchSize, objectKeys.length)}/${objectKeys.length} processed...`);
      }
    } catch (error) {
      console.error(`❌ Error deleting batch: ${error.message}`);
      failed += batch.length;
    }
  }

  return { deleted, failed };
}

// Ask for confirmation
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

// Main cleanup function
async function cleanupOrders() {
  console.log('=========================================');
  console.log('R2 Order Cleanup Script');
  console.log('=========================================');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log(`Keeping order: ${KEEP_ORDER}`);
  console.log('');

  try {
    // List all order folders
    console.log('📋 Listing all orders in R2...');
    const allFolders = await listOrderFolders();
    console.log(`Found ${allFolders.length} order folders`);
    console.log('');

    // Filter out the order to keep
    const keepPrefix = `${PREFIX}${KEEP_ORDER}/`;
    const foldersToDelete = allFolders.filter(folder => !folder.includes(KEEP_ORDER));

    if (foldersToDelete.length === 0) {
      console.log(`✅ No orders to delete - only ${KEEP_ORDER} exists`);
      return;
    }

    console.log(`⚠️  Found ${foldersToDelete.length} order folders to delete:`);
    foldersToDelete.forEach((folder, idx) => {
      const orderId = folder.replace(PREFIX, '').replace('/', '');
      console.log(`  ${idx + 1}. ${orderId}`);
    });
    console.log('');

    // Get all objects to delete
    console.log('📋 Collecting all objects to delete...');
    const allObjectsToDelete = [];
    for (const folder of foldersToDelete) {
      const objects = await listAllObjects(folder);
      allObjectsToDelete.push(...objects);
      console.log(`  ${folder}: ${objects.length} objects`);
    }
    console.log(`\nTotal objects to delete: ${allObjectsToDelete.length}`);
    console.log('');

    // Ask for confirmation
    const confirmed = await askConfirmation(`⚠️  Are you sure you want to delete ${foldersToDelete.length} orders (${allObjectsToDelete.length} objects)? (yes/no): `);

    if (!confirmed) {
      console.log('❌ Deletion cancelled');
      return;
    }

    // Delete objects
    console.log('');
    console.log('🗑️  Deleting orders (this may take a while)...');
    const result = await deleteObjects(allObjectsToDelete, 100);

    console.log('');
    console.log('=========================================');
    console.log('✅ Cleanup complete!');
    console.log(`  Deleted: ${result.deleted} objects`);
    if (result.failed > 0) {
      console.log(`  Failed: ${result.failed} objects`);
    }
    console.log('=========================================');
    console.log('');

    // List remaining orders
    console.log('📋 Remaining orders:');
    const remaining = await listOrderFolders();
    if (remaining.length === 0) {
      console.log('  (none)');
    } else {
      remaining.forEach(folder => {
        const orderId = folder.replace(PREFIX, '').replace('/', '');
        console.log(`  - ${orderId}`);
      });
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the cleanup
cleanupOrders().catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});

