import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_PUBLIC_BUCKET } from '@/lib/r2-client';

/**
 * Proxy endpoint to serve R2 images
 * GET /api/assets/book-mvp-simple-adventure/order-generated-assets/characters/a3fa3c94b55bb566/pose01-walking-bg-removed.png
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    
    if (!path || path.length === 0) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    // Reconstruct the key from path segments
    const key = path.join('/');
    
    console.log(`[GET /api/assets] Fetching image: ${key}`);
    
    // Fetch object from R2
    const response = await getObject(R2_PUBLIC_BUCKET, key);
    
    if (!response.ok) {
      console.error(`[GET /api/assets] Failed to fetch ${key}: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get content type from response or infer from extension
    const contentType = response.headers.get('content-type') || 
      getContentTypeFromKey(key);
    
    // Get image data
    const imageBuffer = await response.arrayBuffer();
    
    // Return image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*', // Allow CORS for images
      },
    });
  } catch (error: any) {
    console.error('[GET /api/assets] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch image' },
      { status: 500 }
    );
  }
}

/**
 * Infer content type from file extension
 */
function getContentTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

