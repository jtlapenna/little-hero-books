/**
 * Script to upload background images from assets/images to Cloudflare Images
 * 
 * Usage: npx tsx scripts/upload-background-images.ts
 * 
 * This script reads images from assets/images folder and uploads them to
 * Cloudflare Images using the "backend" variant (1500x1500).
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { config } from 'dotenv';

// Load .env.local if it exists
config({ path: join(process.cwd(), '.env.local') });

const backgrounds = [
  { pageNumber: 0, filename: 'page00-dedication.png', slug: 'dedication' },
  { pageNumber: 1, filename: 'page01-twilight-walk.png', slug: 'twilight-walk' },
  { pageNumber: 2, filename: 'page02-night-forest.png', slug: 'night-forest' },
  { pageNumber: 3, filename: 'page03-magic-doorway.png', slug: 'magic-doorway' },
  { pageNumber: 4, filename: 'page04-courage-leap.png', slug: 'courage-leap' },
  { pageNumber: 5, filename: 'page05-morning-meadow.png', slug: 'morning-meadow' },
  { pageNumber: 6, filename: 'page06-tall-forest.png', slug: 'tall-forest' },
  { pageNumber: 7, filename: 'page07-mountain-vista.png', slug: 'mountain-vista' },
  { pageNumber: 8, filename: 'page08-picnic-surprise.png', slug: 'picnic-surprise' },
  { pageNumber: 9, filename: 'page09-beach-discovery.png', slug: 'beach-discovery' },
  { pageNumber: 10, filename: 'page10-crystal-cave.png', slug: 'crystal-cave' },
  { pageNumber: 11, filename: 'page11-giant-flowers.png', slug: 'giant-flowers' },
  { pageNumber: 12, filename: 'page12-almost-there.png', slug: 'almost-there' },
  { pageNumber: 13, filename: 'page13-animal-reveal.png', slug: 'animal-reveal' },
  { pageNumber: 14, filename: 'page14-flying-home.png', slug: 'flying-home' },
];

async function uploadBackgroundImages() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
  const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  const variant = 'backend'; // Use "backend" variant (1500x1500)

  if (!accountId || !apiToken || !accountHash) {
    console.error('❌ Cloudflare Images credentials not configured');
    console.error('Required environment variables:');
    console.error('  - CLOUDFLARE_ACCOUNT_ID');
    console.error('  - CLOUDFLARE_IMAGES_API_TOKEN');
    console.error('  - CLOUDFLARE_IMAGES_ACCOUNT_HASH (or NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH)');
    process.exit(1);
  }

  console.log('🚀 Starting background images upload to Cloudflare Images...');
  console.log(`   Using variant: ${variant} (1500x1500)`);
  console.log(`   Account ID: ${accountId}`);
  console.log(`   Account Hash: ${accountHash.substring(0, 8)}...`);
  console.log('');

  const results: Array<{
    pageNumber: number;
    filename: string;
    slug: string;
    success: boolean;
    cloudflareImageId?: string;
    cloudflareImageUrl?: string;
    error?: string;
  }> = [];

  // Upload each background image
  for (const bg of backgrounds) {
    try {
      // Read image from local assets/images folder (one level up from back-end directory)
      const imagePath = join(process.cwd(), '..', 'assets', 'images', bg.filename);
      console.log(`📤 Uploading ${bg.filename}...`);

      const imageBuffer = await readFile(imagePath);
      const contentType = 'image/png';

      // Create FormData for multipart/form-data upload
      const cloudflareFormData = new FormData();
      const blob = new Blob([imageBuffer], { type: contentType });
      cloudflareFormData.append('file', blob, bg.filename);
      cloudflareFormData.append('metadata', JSON.stringify({
        type: 'background',
        pageNumber: bg.pageNumber,
        slug: bg.slug,
        uploadedAt: new Date().toISOString(),
      }));

      // Upload to Cloudflare Images API
      const cloudflareResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
          },
          body: cloudflareFormData,
        }
      );

      if (cloudflareResponse.ok) {
        const cloudflareData = await cloudflareResponse.json();
        if (cloudflareData.success && cloudflareData.result?.id) {
          const cloudflareImageId = cloudflareData.result.id;
          // Construct Cloudflare Images URL using "backend" variant
          const cloudflareImageUrl = `https://imagedelivery.net/${accountHash}/${cloudflareImageId}/${variant}`;
          
          results.push({
            pageNumber: bg.pageNumber,
            filename: bg.filename,
            slug: bg.slug,
            success: true,
            cloudflareImageId,
            cloudflareImageUrl,
          });
          console.log(`   ✅ Success: ${cloudflareImageId}`);
          console.log(`      URL: ${cloudflareImageUrl}`);
        } else {
          results.push({
            pageNumber: bg.pageNumber,
            filename: bg.filename,
            slug: bg.slug,
            success: false,
            error: 'No image ID in response',
          });
          console.log(`   ❌ Failed: No image ID in response`);
        }
      } else {
        const errorText = await cloudflareResponse.text();
        results.push({
          pageNumber: bg.pageNumber,
          filename: bg.filename,
          slug: bg.slug,
          success: false,
          error: `HTTP ${cloudflareResponse.status}: ${errorText.substring(0, 200)}`,
        });
        console.log(`   ❌ Failed: HTTP ${cloudflareResponse.status}`);
        console.log(`      ${errorText.substring(0, 200)}`);
      }
    } catch (error: any) {
      results.push({
        pageNumber: bg.pageNumber,
        filename: bg.filename,
        slug: bg.slug,
        success: false,
        error: error.message || 'Unknown error',
      });
      console.log(`   ❌ Error: ${error.message || 'Unknown error'}`);
    }
    console.log('');
  }

  // Build mapping object for easy lookup
  const mapping: Record<string, { cloudflareImageId: string; cloudflareImageUrl: string; slug: string }> = {};
  results.forEach(result => {
    if (result.success && result.cloudflareImageId && result.cloudflareImageUrl) {
      mapping[String(result.pageNumber)] = {
        cloudflareImageId: result.cloudflareImageId,
        cloudflareImageUrl: result.cloudflareImageUrl,
        slug: result.slug,
      };
    }
  });

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  console.log('📊 Upload Summary:');
  console.log(`   Total: ${backgrounds.length}`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failureCount}`);
  console.log('');

  if (successCount > 0) {
    console.log('📋 Mapping JSON (copy this to BACKGROUND_IMAGES_MAPPING environment variable):');
    console.log('');
    console.log(JSON.stringify(mapping, null, 2));
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Copy the mapping JSON above');
    console.log('   2. Set it as BACKGROUND_IMAGES_MAPPING in Cloudflare Pages environment variables');
    console.log('   3. Redeploy the application');
  }

  if (failureCount > 0) {
    console.log('⚠️  Failed uploads:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`   - ${result.filename}: ${result.error}`);
    });
    process.exit(1);
  }
}

uploadBackgroundImages().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

