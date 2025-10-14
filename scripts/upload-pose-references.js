#!/usr/bin/env node

/**
 * Upload pose reference files to R2 for Workflow 2
 * Maps descriptive pose names to numeric pose references
 */

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// R2 configuration
const R2_ENDPOINT = 'https://little-hero-assets.r2.cloudflarestorage.com';
const BUCKET_NAME = 'little-hero-assets';
const R2_REGION = 'auto';

// Pose mapping: pose number -> descriptive filename
const POSE_MAPPING = {
  1: 'walking.png',                    // Page 1
  2: 'walking-looking-higher.png',     // Page 2  
  3: 'looking.png',                    // Pages 3, 7 (reused)
  4: 'floating.png',                   // Page 4
  5: 'walking-looking-down.png',       // Page 5
  6: 'jogging.png',                    // Page 6
  7: 'sitting-eating.png',             // Page 8
  8: 'crouching.png',                  // Page 9
  9: 'crawling-moving-happy.png',      // Page 10
  10: 'surprised-looking-up.png',      // Page 11
  11: 'surprised.png'                  // Page 12
};

// R2 client setup
const s3Client = new S3Client({
  endpoint: R2_ENDPOINT,
  region: R2_REGION,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

async function uploadPoseReference(poseNumber, sourceFile) {
  const sourcePath = path.join(__dirname, '..', 'assets', 'poses', 'new-story', sourceFile);
  const r2Key = `book-mvp-simple-adventure/characters/poses/pose${poseNumber.toString().padStart(2, '0')}.png`;
  
  try {
    // Check if source file exists
    if (!fs.existsSync(sourcePath)) {
      console.log(`❌ Source file not found: ${sourcePath}`);
      return false;
    }

    // Read file
    const fileBuffer = fs.readFileSync(sourcePath);
    
    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: 'image/png'
    });

    await s3Client.send(command);
    console.log(`✅ Uploaded: ${sourceFile} → ${r2Key}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to upload ${sourceFile}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Uploading pose reference files to R2...\n');
  
  // Check environment variables
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.error('❌ Missing R2 credentials. Please set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  let successCount = 0;
  let totalCount = Object.keys(POSE_MAPPING).length;

  // Upload each pose
  for (const [poseNumber, sourceFile] of Object.entries(POSE_MAPPING)) {
    const success = await uploadPoseReference(parseInt(poseNumber), sourceFile);
    if (success) successCount++;
  }

  console.log(`\n📊 Upload Summary:`);
  console.log(`   ✅ Successful: ${successCount}/${totalCount}`);
  console.log(`   ❌ Failed: ${totalCount - successCount}/${totalCount}`);
  
  if (successCount === totalCount) {
    console.log('\n🎉 All pose references uploaded successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Update Workflow 2 to generate 11 poses instead of 5');
    console.log('   2. Test the updated workflow');
    console.log('   3. Verify generated poses match Workflow 3 expectations');
  } else {
    console.log('\n⚠️  Some uploads failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { uploadPoseReference, POSE_MAPPING };
