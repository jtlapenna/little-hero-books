#!/usr/bin/env node

/**
 * Delete a folder (prefix) from R2 bucket
 * Usage: node scripts/delete-r2-folder.js <bucket-name> <folder-prefix> [--dry-run] [--batch-size=N]
 * 
 * Examples:
 *   node scripts/delete-r2-folder.js little-hero-assets old-test-images/ --dry-run
 *   node scripts/delete-r2-folder.js little-hero-orders book-mvp-simple-adventure/orders/test-order/ --batch-size=100
 */

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const path = require('path');
// Try to load .env file if dotenv is available
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv not available, user must set env vars manually
}

// Get command line arguments
const args = process.argv.slice(2);
const BUCKET_NAME = args[0];
const FOLDER_PREFIX = args[1];
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '100', 10);

// Validate arguments
if (!BUCKET_NAME || !FOLDER_PREFIX) {
  console.error('❌ Usage: node scripts/delete-r2-folder.js <bucket-name> <folder-prefix> [--dry-run] [--batch-size=N]');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/delete-r2-folder.js little-hero-assets old-folder/ --dry-run');
  console.error('  node scripts/delete-r2-folder.js little-hero-orders test-order/ --batch-size=50');
  process.exit(1);
}

// R2 Configuration from environment
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ Error: R2 credentials not found');
  console.error('   Required environment variables:');
  console.error('   - CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID)');
  console.error('   - R2_ACCESS_KEY_ID');
  console.error('   - R2_SECRET_ACCESS_KEY');
  console.error('');
  console.error('   These should be in your .env file');
  process.exit(1);
}

// Ensure prefix ends with / for proper folder matching
const normalizedPrefix = FOLDER_PREFIX.endsWith('/') ? FOLDER_PREFIX : `${FOLDER_PREFIX}/`;
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

async function listAllObjects(prefix) {
  const objects = [];
  let continuationToken = undefined;

  console.log(`📋 Listing objects with prefix: ${prefix}`);

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
        console.log(`   Found ${objects.length} objects so far...`);
      }

      continuationToken = response.NextContinuationToken;
    } catch (error) {
      console.error(`❌ Error listing objects: ${error.message}`);
      throw error;
    }
  } while (continuationToken);

  return objects;
}

async function deleteObjectsBatch(keys) {
  if (keys.length === 0) return { deleted: 0, errors: 0 };

  const deleteParams = {
    Bucket: BUCKET_NAME,
    Delete: {
      Objects: keys.map(key => ({ Key: key })),
      Quiet: false,
    },
  };

  try {
    const command = new DeleteObjectsCommand(deleteParams);
    const response = await s3Client.send(command);
    
    const deleted = response.Deleted?.length || 0;
    const errors = response.Errors?.length || 0;

    if (errors > 0) {
      console.error('   ⚠️  Some deletions failed:');
      response.Errors.forEach(err => {
        console.error(`      - ${err.Key}: ${err.Message}`);
      });
    }

    return { deleted, errors };
  } catch (error) {
    console.error(`❌ Error deleting batch: ${error.message}`);
    return { deleted: 0, errors: keys.length };
  }
}

async function deleteFolder() {
  try {
    console.log('');
    console.log('🗑️  R2 Folder Deletion Tool');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Bucket: ${BUCKET_NAME}`);
    console.log(`Prefix: ${normalizedPrefix}`);
    console.log(`Dry run: ${DRY_RUN ? 'YES (no files will be deleted)' : 'NO (files WILL be deleted)'}`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log('');

    // List all objects with this prefix
    const objects = await listAllObjects(normalizedPrefix);

    if (objects.length === 0) {
      console.log('✅ No objects found with that prefix. Nothing to delete.');
      return;
    }

    console.log('');
    console.log(`📊 Found ${objects.length} object(s) to delete:`);
    console.log('');
    
    // Show preview
    const previewCount = Math.min(10, objects.length);
    objects.slice(0, previewCount).forEach((key, idx) => {
      console.log(`   ${idx + 1}. ${key}`);
    });
    if (objects.length > previewCount) {
      console.log(`   ... and ${objects.length - previewCount} more`);
    }
    console.log('');

    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No files were actually deleted');
      console.log(`   Would delete ${objects.length} object(s)`);
      return;
    }

    // Confirm deletion
    console.log('⚠️  WARNING: This will permanently delete these files!');
    console.log('   To proceed, you must run this script manually (not from dry-run)');
    console.log('');
    console.log('   Proceeding with deletion...');
    console.log('');

    // Delete in batches
    let totalDeleted = 0;
    let totalErrors = 0;

    for (let i = 0; i < objects.length; i += BATCH_SIZE) {
      const batch = objects.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(objects.length / BATCH_SIZE);

      console.log(`🗑️  Deleting batch ${batchNum}/${totalBatches} (${batch.length} objects)...`);

      const result = await deleteObjectsBatch(batch);
      totalDeleted += result.deleted;
      totalErrors += result.errors;

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < objects.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Deletion complete!');
    console.log(`   Deleted: ${totalDeleted} object(s)`);
    if (totalErrors > 0) {
      console.log(`   Errors: ${totalErrors} object(s)`);
    }
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
deleteFolder();

