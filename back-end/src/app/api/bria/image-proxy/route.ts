import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { verifyBearerAuth } from '@/lib/auth';

/**
 * Bria AI Image Proxy - Converts R2 images to Base64 for Bria AI
 * 
 * This endpoint serves as a fallback when signed URLs don't work with Bria AI.
 * Bria AI accepts both URLs and Base64-encoded images.
 * 
 * GET /api/bria/image-proxy?key={key}&bucket={bucket}
 * Authorization: Bearer {BACKEND_API_TOKEN}
 * 
 * Returns: { base64: "data:image/png;base64,...", contentType: "image/png" }
 */
export async function GET(request: NextRequest) {
  // CRITICAL: Require authentication
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const bucket = searchParams.get('bucket') || R2_PUBLIC_BUCKET;

    if (!key) {
      return NextResponse.json(
        { error: 'key parameter is required' },
        { status: 400 }
      );
    }

    // Validate bucket name
    const validBuckets = [R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET];
    if (!validBuckets.includes(bucket)) {
      return NextResponse.json(
        { error: `Invalid bucket name. Must be one of: ${validBuckets.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch image from R2
    console.log(`[Bria Image Proxy] Fetching ${bucket}/${key}`);
    const response = await getObject(bucket, key);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get image data as ArrayBuffer
    const imageBuffer = await response.arrayBuffer();
    
    // Get content type
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Convert to Base64 (Cloudflare Workers compatible)
    // Use chunked approach for large images to avoid stack overflow
    const uint8Array = new Uint8Array(imageBuffer);
    let base64String = '';
    const chunkSize = 8192; // Process in 8KB chunks
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      base64String += btoa(String.fromCharCode(...chunk));
    }
    
    const dataUrl = `data:${contentType};base64,${base64String}`;

    console.log(`[Bria Image Proxy] Converted ${bucket}/${key} to Base64 (${imageBuffer.byteLength} bytes)`);

    return NextResponse.json({
      base64: dataUrl,
      contentType,
      size: imageBuffer.byteLength,
      key,
      bucket
    });

  } catch (error: any) {
    console.error('[Bria Image Proxy] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch and convert image',
        message: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

