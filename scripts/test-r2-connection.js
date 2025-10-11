#!/usr/bin/env node

/**
 * Test R2 connection and list existing assets
 */

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

// Configuration
const ENDPOINT = 'https://92cec53654f84771956bc84dfea65baa.r2.cloudflarestorage.com';
const BUCKET_NAME = 'little-hero-assets';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('❌ Error: R2 credentials not found');
  console.error('   Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables');
  console.error('   Example:');
  console.error('   export R2_ACCESS_KEY_ID="your_access_key_here"');
  console.error('   export R2_SECRET_ACCESS_KEY="your_secret_key_here"');
  process.exit(1);
}

// Create S3 client
const s3Client = new S3Client({
  endpoint: ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function testConnection() {
  try {
    console.log('🔍 Testing R2 connection...');
    
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 50
    });
    
    const response = await s3Client.send(command);
    
    console.log('✅ R2 connection successful!');
    console.log(`📦 Bucket: ${BUCKET_NAME}`);
    console.log(`📊 Total objects: ${response.KeyCount || 0}`);
    
    if (response.Contents && response.Contents.length > 0) {
      console.log('\n📁 Existing assets:');
      response.Contents.forEach(obj => {
        console.log(`   ${obj.Key} (${(obj.Size / 1024).toFixed(1)} KB)`);
      });
    } else {
      console.log('\n📁 No existing assets found');
    }
    
    console.log('\n🚀 Ready to upload test assets!');
    console.log('   Run: node scripts/upload-test-assets.js');
    
  } catch (error) {
    console.error('❌ R2 connection failed:');
    console.error(`   ${error.message}`);
    
    if (error.message.includes('NoSuchBucket')) {
      console.error('\n💡 Solution: Create the bucket "little-hero-assets" in your Cloudflare R2 dashboard');
    } else if (error.message.includes('InvalidAccessKeyId')) {
      console.error('\n💡 Solution: Check your R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY');
    } else if (error.message.includes('SignatureDoesNotMatch')) {
      console.error('\n💡 Solution: Check your R2_SECRET_ACCESS_KEY');
    }
  }
}

testConnection().catch(console.error);
