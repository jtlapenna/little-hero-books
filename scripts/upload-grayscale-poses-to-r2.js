#!/usr/bin/env node

/**
 * Upload grayscale pose reference images to Cloudflare R2
 * This replaces the color pose images with grayscale versions
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Configuration from your existing S3 setup
const ENDPOINT = 'https://92cec53654f84771956bc84dfea65baa.r2.cloudflarestorage.com';
const BUCKET_NAME = 'little-hero-assets';
const BUCKET_PATH = 'book-mvp-simple-adventure/characters/poses';
const INPUT_DIR = path.join(__dirname, '../assets/poses/grayscale');
const POSE_NUMBERS = [1, 2, 3, 4, 5];

// You'll need to set these environment variables or update them here
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

async function uploadFile(filePath, key) {
  const fileContent = fs.readFileSync(filePath);
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: 'image/png',
  });
  
  await s3Client.send(command);
}

async function main() {
  console.log('Uploading grayscale pose images to R2...\n');
  
  let uploaded = 0;
  let failed = 0;
  
  for (const poseNum of POSE_NUMBERS) {
    const paddedNum = poseNum.toString().padStart(2, '0');
    const filename = `pose${paddedNum}.png`;
    const filePath = path.join(INPUT_DIR, filename);
    const key = `${BUCKET_PATH}/${filename}`;
    
    if (!fs.existsSync(filePath)) {
      console.error(`✗ File not found: ${filename}`);
      failed++;
      continue;
    }
    
    try {
      console.log(`Uploading ${filename}...`);
      await uploadFile(filePath, key);
      const stats = fs.statSync(filePath);
      console.log(`✓ Uploaded: ${filename} (${(stats.size / 1024).toFixed(1)} KB) to ${key}`);
      uploaded++;
    } catch (error) {
      console.error(`✗ Failed to upload ${filename}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n✓ Done! Uploaded ${uploaded} files, ${failed} failed`);
  console.log('\nNext steps:');
  console.log('1. In n8n workflow, verify "Load Pose Reference" connects to "Prepare Gemini Requests"');
  console.log('2. Test the workflow - pose images should now be grayscale');
}

main().catch(console.error);




