#!/usr/bin/env node

/**
 * Upload test assets to Cloudflare R2 for workflow testing
 * This script uploads your existing 4 background images and 4 character poses
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
  console.error('   Or update the script with your credentials');
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
  console.log('🚀 Uploading test assets to R2...\n');
  
  let uploaded = 0;
  let failed = 0;
  
  // Upload background images (4 pages)
  console.log('📸 Uploading background images...');
  const backgroundFiles = [
    { local: 'assets/images/page01.png', remote: 'backgrounds/page01_background.png' },
    { local: 'assets/images/page02.png', remote: 'backgrounds/page02_background.png' },
    { local: 'assets/images/page03.png', remote: 'backgrounds/page03_background.png' },
    { local: 'assets/images/page02-2.png', remote: 'backgrounds/page04_background.png' }
  ];
  
  for (const file of backgroundFiles) {
    if (fs.existsSync(file.local)) {
      try {
        await uploadFile(file.local, file.remote);
        console.log(`✓ ${file.local} → ${file.remote}`);
        uploaded++;
      } catch (error) {
        console.error(`✗ Failed to upload ${file.local}: ${error.message}`);
        failed++;
      }
    } else {
      console.error(`✗ File not found: ${file.local}`);
      failed++;
    }
  }
  
  // Upload character poses (4 poses)
  console.log('\n👤 Uploading character poses...');
  const poseFiles = [
    { local: 'assets/poses/pose01.png', remote: 'characters/test-character/pose01.png' },
    { local: 'assets/poses/pose02.png', remote: 'characters/test-character/pose02.png' },
    { local: 'assets/poses/pose03.png', remote: 'characters/test-character/pose03.png' },
    { local: 'assets/poses/pose04.png', remote: 'characters/test-character/pose04.png' }
  ];
  
  for (const file of poseFiles) {
    if (fs.existsSync(file.local)) {
      try {
        await uploadFile(file.local, file.remote);
        console.log(`✓ ${file.local} → ${file.remote}`);
        uploaded++;
      } catch (error) {
        console.error(`✗ Failed to upload ${file.local}: ${error.message}`);
        failed++;
      }
    } else {
      console.error(`✗ File not found: ${file.local}`);
      failed++;
    }
  }
  
  // Upload base character
  console.log('\n👤 Uploading base character...');
  const baseCharacterFile = 'assets/poses/base-character.png';
  if (fs.existsSync(baseCharacterFile)) {
    try {
      await uploadFile(baseCharacterFile, 'characters/test-character/base-character.png');
      console.log(`✓ ${baseCharacterFile} → characters/test-character/base-character.png`);
      uploaded++;
    } catch (error) {
      console.error(`✗ Failed to upload base character: ${error.message}`);
      failed++;
    }
  }
  
  // Create placeholder animal images (2 simple colored squares)
  console.log('\n🐕 Creating placeholder animal images...');
  const animals = ['dog', 'cat'];
  for (const animal of animals) {
    for (let i = 1; i <= 4; i++) {
      const key = `animals/${animal}_${i}.png`;
      // For now, we'll create a simple placeholder
      // In production, you'd upload actual animal images
      console.log(`⚠️  Placeholder needed: ${key}`);
    }
  }
  
  // Create placeholder footprint images
  console.log('\n👣 Creating placeholder footprint images...');
  for (const animal of animals) {
    const key = `footprints/${animal}_footprints.png`;
    console.log(`⚠️  Placeholder needed: ${key}`);
  }
  
  // Create placeholder text box overlay
  console.log('\n📝 Creating placeholder text box overlay...');
  const textBoxKey = 'overlays/text-boxes/standard-box.png';
  console.log(`⚠️  Placeholder needed: ${textBoxKey}`);
  
  console.log(`\n✅ Upload complete! Uploaded ${uploaded} files, ${failed} failed`);
  console.log('\n📋 Next steps:');
  console.log('1. Create placeholder animal images (2 types × 4 pages)');
  console.log('2. Create placeholder footprint images (2 types)');
  console.log('3. Create text box overlay image');
  console.log('4. Test the workflow with mock data');
  console.log('\n🔗 Test URLs:');
  console.log('Backgrounds: https://little-hero-assets.r2.cloudflarestorage.com/backgrounds/page01_background.png');
  console.log('Characters: https://little-hero-assets.r2.cloudflarestorage.com/characters/test-character/pose01.png');
}

main().catch(console.error);
