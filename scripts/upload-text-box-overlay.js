#!/usr/bin/env node

/**
 * Upload the existing text box overlay to R2
 * This uses the exact overlay you've already designed and tested
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Configuration
const ENDPOINT = 'https://92cec53654f84771956bc84dfea65baa.r2.cloudflarestorage.com';
const BUCKET_NAME = 'little-hero-assets';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('❌ Error: R2 credentials not found');
  console.error('   Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables');
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

async function uploadFile(filePath, key, contentType = 'image/png') {
  const fileContent = fs.readFileSync(filePath);
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: contentType,
  });
  
  await s3Client.send(command);
}

async function main() {
  console.log('📦 Uploading text box overlay to R2...\n');
  
  // Upload the existing text box overlay
  const textBoxPath = 'renderer-mock/assets/overlays/text-boxes/standard-box.png';
  const textBoxKey = 'overlays/text-boxes/standard-box.png';
  
  if (fs.existsSync(textBoxPath)) {
    try {
      await uploadFile(textBoxPath, textBoxKey);
      console.log(`✅ Uploaded: ${textBoxPath} → ${textBoxKey}`);
      
      // Get file stats
      const stats = fs.statSync(textBoxPath);
      console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
      
      console.log('\n🎯 Text box overlay specifications:');
      console.log('   - Position: Bottom 3%, centered');
      console.log('   - Width: 65% of page');
      console.log('   - Padding: 40px 60px');
      console.log('   - Background: standard-box.png');
      console.log('   - Font: 20px, 1.5px letter-spacing, #312116 color');
      
      console.log('\n🔗 R2 URL:');
      console.log(`   https://little-hero-assets.r2.cloudflarestorage.com/${textBoxKey}`);
      
    } catch (error) {
      console.error(`❌ Failed to upload text box overlay: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.error(`❌ Text box overlay not found: ${textBoxPath}`);
    process.exit(1);
  }
}

main().catch(console.error);
