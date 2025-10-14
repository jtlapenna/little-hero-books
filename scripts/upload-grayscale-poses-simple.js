#!/usr/bin/env node

/**
 * Upload grayscale pose reference images to Cloudflare R2
 * Simple HTTP-based upload using R2's S3-compatible API
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const BUCKET_NAME = 'little-hero-assets';
const BUCKET_PATH = 'book-mvp-simple-adventure/characters/poses';
const INPUT_DIR = path.join(__dirname, '../assets/poses/grayscale');
const ENDPOINT = '92cec53654f84771956bc84dfea65baa.r2.cloudflarestorage.com';
const POSE_NUMBERS = [1, 2, 3, 4, 5];

// R2 credentials - you'll need to set these
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('❌ Error: R2 credentials not found');
  console.error('   Please set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables');
  console.error('');
  console.error('   Example:');
  console.error('   export R2_ACCESS_KEY_ID="your-access-key-id"');
  console.error('   export R2_SECRET_ACCESS_KEY="your-secret-access-key"');
  console.error('   node scripts/upload-grayscale-poses-simple.js');
  process.exit(1);
}

function createSignature(method, path, headers, secretKey) {
  const stringToSign = [
    method,
    headers['content-md5'] || '',
    headers['content-type'] || '',
    headers['date'] || '',
    Object.keys(headers)
      .filter(key => key.startsWith('x-amz-'))
      .sort()
      .map(key => `${key}:${headers[key]}`)
      .join('\n') + (Object.keys(headers).filter(key => key.startsWith('x-amz-')).length ? '\n' : ''),
    path
  ].join('\n');
  
  return crypto.createHmac('sha1', secretKey).update(stringToSign).digest('base64');
}

function uploadFile(filePath, key) {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(filePath);
    const fileSize = fileContent.length;
    
    const date = new Date().toUTCString();
    const path = `/${BUCKET_NAME}/${key}`;
    
    const headers = {
      'Content-Type': 'image/png',
      'Content-Length': fileSize,
      'Date': date,
      'Host': ENDPOINT
    };
    
    const signature = createSignature('PUT', path, headers, SECRET_ACCESS_KEY);
    headers['Authorization'] = `AWS ${ACCESS_KEY_ID}:${signature}`;
    
    const options = {
      hostname: ENDPOINT,
      port: 443,
      path: path,
      method: 'PUT',
      headers: headers
    };
    
    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
    });
    
    req.on('error', reject);
    req.write(fileContent);
    req.end();
  });
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
      console.log(`✓ Uploaded: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
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




