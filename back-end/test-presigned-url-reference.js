/**
 * Reference implementation using AWS SDK v3
 * This generates a presigned URL using AWS SDK to compare with our custom implementation
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = 'little-hero-assets';
const KEY = 'book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/characters_0ajc4j6vc7m8puagwyac_pose02.png';

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('Missing R2 credentials');
  process.exit(1);
}

async function generateReferencePresignedUrl() {
  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
    
    console.log('=== AWS SDK Generated Presigned URL ===');
    console.log(signedUrl);
    console.log('\n=== URL Structure ===');
    const url = new URL(signedUrl);
    console.log('Host:', url.host);
    console.log('Path:', url.pathname);
    console.log('Query:', url.search);
    
    // Extract query params
    const params = new URLSearchParams(url.search);
    console.log('\n=== Query Parameters ===');
    for (const [key, value] of params) {
      console.log(`${key}: ${value}`);
    }
    
    // Test the URL
    console.log('\n=== Testing URL ===');
    const response = await fetch(signedUrl, { method: 'HEAD' });
    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers));
    
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw error;
  }
}

generateReferencePresignedUrl()
  .then(() => {
    console.log('\n✅ Reference URL generated successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to generate reference URL:', error);
    process.exit(1);
  });


