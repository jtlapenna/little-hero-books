#!/usr/bin/env node

/**
 * List folders (prefixes) in an R2 bucket
 * Usage: node scripts/list-r2-folders.js <bucket-name> [prefix-to-search]
 * 
 * Examples:
 *   node scripts/list-r2-folders.js little-hero-assets
 *   node scripts/list-r2-folders.js little-hero-orders book-mvp-simple-adventure/
 */

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
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
const SEARCH_PREFIX = args[1] || '';

// Validate arguments
if (!BUCKET_NAME) {
  console.error('❌ Usage: node scripts/list-r2-folders.js <bucket-name> [prefix-to-search]');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/list-r2-folders.js little-hero-assets');
  console.error('  node scripts/list-r2-folders.js little-hero-orders book-mvp-simple-adventure/');
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

async function listFolders() {
  try {
    console.log('');
    console.log('📁 R2 Folder Listing Tool');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Bucket: ${BUCKET_NAME}`);
    if (SEARCH_PREFIX) {
      console.log(`Search prefix: ${SEARCH_PREFIX}`);
    }
    console.log('');

    const folders = new Set();
    const files = [];
    let continuationToken = undefined;

    console.log('📋 Scanning bucket...');

    do {
      try {
        const command = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: SEARCH_PREFIX,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
          Delimiter: '/', // This groups by "folders"
        });

        const response = await s3Client.send(command);

        // Add common prefixes (folders)
        if (response.CommonPrefixes) {
          response.CommonPrefixes.forEach(prefix => {
            folders.add(prefix.Prefix);
          });
        }

        // Track individual files (for summary)
        if (response.Contents) {
          files.push(...response.Contents);
        }

        continuationToken = response.NextContinuationToken;
      } catch (error) {
        console.error(`❌ Error listing objects: ${error.message}`);
        throw error;
      }
    } while (continuationToken);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (folders.size === 0 && files.length === 0) {
      console.log('📭 No folders or files found');
      return;
    }

    if (folders.size > 0) {
      console.log(`📁 Found ${folders.size} folder(s):`);
      console.log('');
      const sortedFolders = Array.from(folders).sort();
      sortedFolders.forEach((folder, idx) => {
        console.log(`   ${idx + 1}. ${folder}`);
      });
      console.log('');
    }

    if (files.length > 0) {
      console.log(`📄 Found ${files.length} file(s)${SEARCH_PREFIX ? ` under prefix "${SEARCH_PREFIX}"` : ''}`);
      
      // Group files by "folder"
      const fileFolders = new Map();
      files.forEach(file => {
        const key = file.Key;
        const lastSlash = key.lastIndexOf('/');
        if (lastSlash > 0) {
          const folder = key.substring(0, lastSlash + 1);
          if (!fileFolders.has(folder)) {
            fileFolders.set(folder, []);
          }
          fileFolders.get(folder).push(key);
        } else {
          if (!fileFolders.has('')) {
            fileFolders.set('', []);
          }
          fileFolders.get('').push(key);
        }
      });

      if (fileFolders.size > 0 && fileFolders.size <= 20) {
        console.log('');
        fileFolders.forEach((fileList, folder) => {
          const folderName = folder || '(root)';
          console.log(`   ${folderName} (${fileList.length} file${fileList.length !== 1 ? 's' : ''})`);
          if (fileList.length <= 5) {
            fileList.forEach(file => {
              console.log(`      - ${file.replace(folder, '')}`);
            });
          } else {
            console.log(`      ... and ${fileList.length - 5} more`);
          }
        });
      }
    }

    console.log('');
    console.log('💡 Tip: To delete a folder, use:');
    console.log(`   node scripts/delete-r2-folder.js ${BUCKET_NAME} <folder-prefix> --dry-run`);
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
listFolders();

