#!/usr/bin/env node

/**
 * Diagnostic script to check flip state in 2B manifest and W3 workflow
 * 
 * Usage: node scripts/diagnose-flip-state.js <orderId> [poseNumber]
 * Example: node scripts/diagnose-flip-state.js E2E-002 5
 */

const https = require('https');
const http = require('http');

const BACKEND_URL = 'https://admin.littleherolabs.com';

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function checkImageExists(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      resolve({
        exists: res.statusCode === 200,
        statusCode: res.statusCode,
        contentType: res.headers['content-type'],
        cacheControl: res.headers['cache-control'],
        etag: res.headers['etag'],
      });
      res.on('data', () => {}); // Consume response
      res.on('end', () => {});
    });
    req.on('error', () => {
      resolve({ exists: false, error: true });
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ exists: false, timeout: true });
    });
  });
}

async function diagnose(orderId, poseNumber = null) {
  console.log(`\n=== Diagnosing Flip State for Order: ${orderId} ===\n`);
  
  // 1. Fetch 2B manifest
  const manifestUrl = `${BACKEND_URL}/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/2b-manifest.json`;
  console.log(`1. Fetching 2B manifest...`);
  console.log(`   URL: ${manifestUrl}\n`);
  
  let manifest;
  try {
    manifest = await fetchJSON(manifestUrl);
    console.log(`   ✅ Manifest loaded (${manifest.entries?.length || 0} entries)\n`);
  } catch (error) {
    console.error(`   ❌ Failed to load manifest: ${error.message}\n`);
    return;
  }
  
  // 2. Check entries for flipped poses
  const entries = manifest.entries || [];
  const flippedEntries = entries.filter(e => e.flipped === true);
  
  console.log(`2. Checking flipped entries...`);
  if (flippedEntries.length === 0) {
    console.log(`   ⚠️  No flipped entries found in manifest\n`);
  } else {
    console.log(`   ✅ Found ${flippedEntries.length} flipped entry(ies):\n`);
    flippedEntries.forEach(e => {
      console.log(`   - Pose ${e.poseNumber}:`);
      console.log(`     flipped: ${e.flipped}`);
      console.log(`     flippedAt: ${e.flippedAt || 'MISSING'}`);
      console.log(`     bgRemovedKey: ${e.bgRemovedKey || 'MISSING'}`);
      console.log(``);
    });
  }
  
  // 3. Check specific pose if provided
  if (poseNumber !== null) {
    const poseNum = Number(poseNumber);
    console.log(`3. Checking pose ${poseNum} specifically...\n`);
    
    const entry = entries.find(e => e.poseNumber === poseNum);
    if (!entry) {
      console.log(`   ❌ Pose ${poseNum} not found in manifest\n`);
    } else {
      console.log(`   Entry details:`);
      console.log(`   - poseNumber: ${entry.poseNumber}`);
      console.log(`   - flipped: ${entry.flipped || false}`);
      console.log(`   - flippedAt: ${entry.flippedAt || 'NOT SET'}`);
      console.log(`   - bgRemovedKey: ${entry.bgRemovedKey || 'MISSING'}`);
      
      if (entry.flipped && entry.flippedAt) {
        // Calculate cache-busting URL
        const cacheBuster = new Date(entry.flippedAt).getTime();
        const imageUrl = entry.bgRemovedKey 
          ? `${BACKEND_URL}/api/assets/${entry.bgRemovedKey}?v=${cacheBuster}`
          : null;
        
        console.log(`   - Cache-busted URL: ${imageUrl || 'N/A'}\n`);
        
        // 4. Check if image exists
        if (imageUrl) {
          console.log(`4. Checking if flipped image exists...\n`);
          const imageCheck = await checkImageExists(imageUrl);
          if (imageCheck.exists) {
            console.log(`   ✅ Image exists`);
            console.log(`   - Status: ${imageCheck.statusCode}`);
            console.log(`   - Content-Type: ${imageCheck.contentType}`);
            console.log(`   - Cache-Control: ${imageCheck.cacheControl || 'not set'}`);
            console.log(`   - ETag: ${imageCheck.etag || 'not set'}\n`);
          } else {
            console.log(`   ❌ Image not accessible`);
            console.log(`   - Status: ${imageCheck.statusCode || 'error'}`);
            if (imageCheck.error) console.log(`   - Error: Network error`);
            if (imageCheck.timeout) console.log(`   - Error: Timeout\n`);
          }
        }
      } else {
        console.log(`\n   ⚠️  Pose ${poseNum} is NOT marked as flipped in manifest`);
        console.log(`   This means the flip operation may not have been saved.\n`);
      }
    }
  }
  
  // 5. Show what W3 would see
  console.log(`5. What W3 "Build Assembly Input From Manifest" would generate:\n`);
  const processedImages = entries
    .filter(e => Number.isFinite(Number(e.poseNumber)) && e.bgRemovedKey)
    .sort((a, b) => a.poseNumber - b.poseNumber)
    .map(e => {
      const cacheBuster = (e.flipped && e.flippedAt) 
        ? new Date(e.flippedAt).getTime() 
        : null;
      const publicUrl = e.bgRemovedKey
        ? `${BACKEND_URL}/api/assets/${e.bgRemovedKey}${cacheBuster ? `?v=${cacheBuster}` : ''}`
        : null;
      return {
        poseNumber: e.poseNumber,
        r2Path: e.bgRemovedKey,
        publicUrl,
        flipped: e.flipped || false,
        flippedAt: e.flippedAt || null,
      };
    });
  
  const flippedProcessed = processedImages.filter(pi => pi.flipped);
  if (flippedProcessed.length > 0) {
    console.log(`   Flipped poses in processedImages:`);
    flippedProcessed.forEach(pi => {
      console.log(`   - Pose ${pi.poseNumber}:`);
      console.log(`     publicUrl: ${pi.publicUrl}`);
      console.log(`     Has cache-buster: ${pi.publicUrl?.includes('?v=') ? '✅' : '❌'}`);
      console.log(``);
    });
  } else {
    console.log(`   ⚠️  No flipped poses found in processedImages array\n`);
  }
  
  console.log(`=== Diagnosis Complete ===\n`);
}

// Parse command line arguments
const orderId = process.argv[2];
const poseNumber = process.argv[3] || null;

if (!orderId) {
  console.error('Usage: node scripts/diagnose-flip-state.js <orderId> [poseNumber]');
  console.error('Example: node scripts/diagnose-flip-state.js E2E-002 5');
  process.exit(1);
}

diagnose(orderId, poseNumber).catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

