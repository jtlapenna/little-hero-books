#!/usr/bin/env node

/**
 * Upload complete test assets to R2 for proper text box testing
 * This uploads your existing assets plus the text box overlay
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
  console.log('🚀 Uploading complete test assets to R2...\n');
  
  let uploaded = 0;
  let failed = 0;
  
  // 1. Upload text box overlay (the most important one!)
  console.log('📝 Uploading text box overlay...');
  const textBoxPath = 'renderer-mock/assets/overlays/text-boxes/standard-box.png';
  const textBoxKey = 'overlays/text-boxes/standard-box.png';
  
  if (fs.existsSync(textBoxPath)) {
    try {
      await uploadFile(textBoxPath, textBoxKey);
      console.log(`✅ ${textBoxPath} → ${textBoxKey}`);
      uploaded++;
    } catch (error) {
      console.error(`❌ Failed to upload text box overlay: ${error.message}`);
      failed++;
    }
  } else {
    console.error(`❌ Text box overlay not found: ${textBoxPath}`);
    failed++;
  }
  
  // 2. Upload background images (4 pages)
  console.log('\n📸 Uploading background images...');
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
        console.log(`✅ ${file.local} → ${file.remote}`);
        uploaded++;
      } catch (error) {
        console.error(`❌ Failed to upload ${file.local}: ${error.message}`);
        failed++;
      }
    } else {
      console.error(`❌ File not found: ${file.local}`);
      failed++;
    }
  }
  
  // 3. Upload character poses (4 poses)
  console.log('\n👤 Uploading character poses...');
  const poseFiles = [
    { local: 'assets/poses/characters_61e3d0af27acbed3_pose01.png', remote: 'characters/test-character/characters_61e3d0af27acbed3_pose01.png' },
    { local: 'assets/poses/characters_61e3d0af27acbed3_pose02.png', remote: 'characters/test-character/characters_61e3d0af27acbed3_pose02.png' },
    { local: 'assets/poses/characters_61e3d0af27acbed3_pose03.png', remote: 'characters/test-character/characters_61e3d0af27acbed3_pose03.png' },
    { local: 'assets/poses/characters_61e3d0af27acbed3_pose04.png', remote: 'characters/test-character/characters_61e3d0af27acbed3_pose04.png' }
  ];
  
  for (const file of poseFiles) {
    if (fs.existsSync(file.local)) {
      try {
        await uploadFile(file.local, file.remote);
        console.log(`✅ ${file.local} → ${file.remote}`);
        uploaded++;
      } catch (error) {
        console.error(`❌ Failed to upload ${file.local}: ${error.message}`);
        failed++;
      }
    } else {
      console.error(`❌ File not found: ${file.local}`);
      failed++;
    }
  }
  
  // 4. Upload base character
  console.log('\n👤 Uploading base character...');
  const baseCharacterFile = 'assets/poses/base-character.png';
  if (fs.existsSync(baseCharacterFile)) {
    try {
      await uploadFile(baseCharacterFile, 'characters/test-character/base-character.png');
      console.log(`✅ ${baseCharacterFile} → characters/test-character/base-character.png`);
      uploaded++;
    } catch (error) {
      console.error(`❌ Failed to upload base character: ${error.message}`);
      failed++;
    }
  }
  
  // 5. Upload custom font (if available)
  console.log('\n🔤 Uploading custom font...');
  const fontFile = 'renderer-mock/assets/fonts/custom-font.ttf';
  if (fs.existsSync(fontFile)) {
    try {
      await uploadFile(fontFile, 'fonts/custom-font.ttf', 'font/ttf');
      console.log(`✅ ${fontFile} → fonts/custom-font.ttf`);
      uploaded++;
    } catch (error) {
      console.error(`❌ Failed to upload font: ${error.message}`);
      failed++;
    }
  } else {
    console.log('⚠️  Custom font not found, will use fallback fonts');
  }
  
  console.log(`\n✅ Upload complete! Uploaded ${uploaded} files, ${failed} failed`);
  
  if (uploaded > 0) {
    console.log('\n🎯 Text Box Specifications (LOCKED IN):');
    console.log('   - Position: Bottom 3%, centered');
    console.log('   - Width: 65% of page');
    console.log('   - Padding: 40px 60px');
    console.log('   - Font: 20px, 1.5px letter-spacing, #312116 color');
    console.log('   - Background: standard-box.png');
    console.log('   - Page Size: 11.25" × 8.75"');
    
    console.log('\n🔗 Test URLs:');
    console.log('   Text Box: https://little-hero-assets.r2.cloudflarestorage.com/overlays/text-boxes/standard-box.png');
    console.log('   Background 1: https://little-hero-assets.r2.cloudflarestorage.com/backgrounds/page01_background.png');
    console.log('   Character 1: https://little-hero-assets.r2.cloudflarestorage.com/characters/test-character/pose01.png');
    
    console.log('\n🚀 Next steps:');
    console.log('1. Generate test order data: node scripts/generate-test-order.js');
    console.log('2. Import workflow: 3-book-assembly-proper-text-box.json');
    console.log('3. Test with your 4 pages of assets');
    console.log('4. Check HTML output for proper text box positioning');
  }
}

main().catch(console.error);
