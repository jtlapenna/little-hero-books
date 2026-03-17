import { NextRequest, NextResponse } from 'next/server';

/**
 * Upload background images to Cloudflare Images for WebP conversion
 * POST /api/backgrounds/upload-to-cloudflare
 * 
 * This endpoint accepts file uploads in the request body and uploads them
 * to Cloudflare Images using the "backend" variant (1500x1500).
 * 
 * For local development, use the script: npx tsx scripts/upload-background-images.ts
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
    const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH;
    const variant = 'backend'; // Use "backend" variant (1500x1500)

    if (!accountId || !apiToken || !accountHash) {
      return NextResponse.json(
        { error: 'Cloudflare Images credentials not configured' },
        { status: 500 }
      );
    }

    // Parse form data from request
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided. Use the local script: npx tsx scripts/upload-background-images.ts' },
        { status: 400 }
      );
    }

    // Background images mapping: pageNumber -> filename
    const backgrounds = [
      { pageNumber: 0, filename: 'page00-dedication.jpeg', slug: 'dedication' },
      { pageNumber: 1, filename: 'page01-twilight-walk.jpg', slug: 'twilight-walk' },
      { pageNumber: 2, filename: 'page02-night-forest.jpeg', slug: 'night-forest' },
      { pageNumber: 3, filename: 'page03-magic-doorway.jpeg', slug: 'magic-doorway' },
      { pageNumber: 4, filename: 'page04-courage-leap.jpeg', slug: 'courage-leap' },
      { pageNumber: 5, filename: 'page05-morning-meadow.jpeg', slug: 'morning-meadow' },
      { pageNumber: 6, filename: 'page06-tall-forest.jpg', slug: 'tall-forest' },
      { pageNumber: 7, filename: 'page07-mountain-vista.jpg', slug: 'mountain-vista' },
      { pageNumber: 8, filename: 'page08-picnic-surprise.jpg', slug: 'picnic-surprise' },
      { pageNumber: 9, filename: 'page09-beach-discovery.jpg', slug: 'beach-discovery' },
      { pageNumber: 10, filename: 'page10-crystal-cave.jpg', slug: 'crystal-cave' },
      { pageNumber: 11, filename: 'page11-giant-flowers.jpg', slug: 'giant-flowers' },
      { pageNumber: 12, filename: 'page12-almost-there.jpg', slug: 'almost-there' },
      { pageNumber: 13, filename: 'page13-animal-reveal.jpg', slug: 'animal-reveal' },
      { pageNumber: 14, filename: 'page14-flying-home.jpg', slug: 'flying-home' },
    ];

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
        // Find matching file
        const file = files.find(f => f.name === bg.filename || f.name.endsWith(bg.filename));
        if (!file) {
          results.push({
            pageNumber: bg.pageNumber,
            filename: bg.filename,
            slug: bg.slug,
            success: false,
            error: 'File not found in upload',
          });
          continue;
        }

        console.log(`[Background Upload] Uploading ${bg.filename}...`);

        const imageBuffer = await file.arrayBuffer();
        const contentType = file.type || 'image/png';

        console.log(`[Background Upload] Uploading ${bg.filename} to Cloudflare Images...`);

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
            // Construct Cloudflare Images URL using "backend" variant (1500x1500)
            const cloudflareImageUrl = `https://imagedelivery.net/${accountHash}/${cloudflareImageId}/${variant}`;
            
            results.push({
              pageNumber: bg.pageNumber,
              filename: bg.filename,
              slug: bg.slug,
              success: true,
              cloudflareImageId,
              cloudflareImageUrl,
            });
            console.log(`[Background Upload] ✅ Successfully uploaded ${bg.filename}: ${cloudflareImageId} (variant: ${variant})`);
          } else {
            results.push({
              pageNumber: bg.pageNumber,
              filename: bg.filename,
              slug: bg.slug,
              success: false,
              error: 'No image ID in response',
            });
            console.warn(`[Background Upload] Upload succeeded but no image ID for ${bg.filename}`);
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
          console.error(`[Background Upload] Failed to upload ${bg.filename}: ${cloudflareResponse.status} ${errorText}`);
        }
      } catch (error: any) {
        results.push({
          pageNumber: bg.pageNumber,
          filename: bg.filename,
          slug: bg.slug,
          success: false,
          error: error.message || 'Unknown error',
        });
        console.error(`[Background Upload] Error uploading ${bg.filename}:`, error);
      }
    }

    // Build mapping object for easy lookup
    const mapping: Record<number, { cloudflareImageId: string; cloudflareImageUrl: string; slug: string }> = {};
    results.forEach(result => {
      if (result.success && result.cloudflareImageId && result.cloudflareImageUrl) {
        mapping[result.pageNumber] = {
          cloudflareImageId: result.cloudflareImageId,
          cloudflareImageUrl: result.cloudflareImageUrl,
          slug: result.slug,
        };
      }
    });

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      total: backgrounds.length,
      successful: successCount,
      failed: failureCount,
      results,
      mapping, // Easy lookup: mapping[pageNumber] = { cloudflareImageId, cloudflareImageUrl, slug }
    });

  } catch (error: any) {
    console.error('[Background Upload] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
