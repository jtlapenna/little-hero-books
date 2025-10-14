#!/usr/bin/env node

/**
 * Download pose reference images from Cloudflare R2
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
const BUCKET_PATH = 'book-mvp-simple-adventure/characters/poses';
const OUTPUT_DIR = path.join(__dirname, '../assets/poses');
const POSE_NUMBERS = [1, 2, 3, 4, 5];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Delete incomplete file
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading pose reference images from R2...\n');
  
  let downloaded = 0;
  let failed = 0;
  
  for (const poseNum of POSE_NUMBERS) {
    const paddedNum = poseNum.toString().padStart(2, '0');
    const filename = `pose${paddedNum}.png`;
    const url = `${BASE_URL}/${BUCKET_PATH}/${filename}`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    
    try {
      console.log(`Downloading ${filename}...`);
      await downloadFile(url, outputPath);
      const stats = fs.statSync(outputPath);
      console.log(`✓ Downloaded: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
      downloaded++;
    } catch (error) {
      console.error(`✗ Failed to download ${filename}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n✓ Done! Downloaded ${downloaded} files, ${failed} failed`);
  console.log(`   Saved to: ${OUTPUT_DIR}`);
  console.log('\nNext step: Run the grayscale conversion script');
  console.log('  python3 scripts/convert-poses-to-grayscale.py');
}

main().catch(console.error);




