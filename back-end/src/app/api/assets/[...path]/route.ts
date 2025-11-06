import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-client';

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Proxy endpoint to serve R2 images
 * GET /api/assets/book-mvp-simple-adventure/order-generated-assets/characters/a3fa3c94b55bb566/pose01-walking-bg-removed.png
 * HEAD /api/assets/... (for checking if file exists)
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
    
    // Determine which bucket to use based on path
    // Orders bucket: book-mvp-simple-adventure/orders/...
    // Public bucket: everything else
    const isOrderAsset = key.startsWith('book-mvp-simple-adventure/orders/');
    const bucket = isOrderAsset ? R2_ORDERS_BUCKET : R2_PUBLIC_BUCKET;
    
    console.log(`[GET /api/assets] Using bucket: ${bucket} for key: ${key}`);
    
    // Fetch object from R2
    const r2Response = await getObject(bucket, key);
    
    if (!r2Response.ok) {
      console.error(`[GET /api/assets] Failed to fetch ${key}: ${r2Response.status} ${r2Response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch image: ${r2Response.statusText}` },
        { 
          status: r2Response.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    // Get content type from response or infer from extension
    const contentType = r2Response.headers.get('content-type') || 
      getContentTypeFromKey(key);
    
    // Get image data
    const imageBuffer = await r2Response.arrayBuffer();
    
    // Determine cache strategy based on image type
    // Background-removed images (nobg.png) should refresh more frequently to show updated versions
    const isBackgroundRemoved = key.toLowerCase().includes('nobg') || 
                                key.toLowerCase().includes('bg-removed') ||
                                key.toLowerCase().includes('background-removed');
    const cacheControl = isBackgroundRemoved
      ? 'public, max-age=60, must-revalidate' // Cache for 1 minute, must revalidate for post-Bria images
      : 'public, max-age=3600, s-maxage=3600'; // Cache for 1 hour for other images
    
    // Return image with proper headers (including CORS)
    const response = new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
    
    return response;
  } catch (error: any) {
    console.error('[GET /api/assets] Error:', error);
    const errorResponse = NextResponse.json(
      { error: error?.message || 'Failed to fetch image' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    );
    return errorResponse;
  }
}

/**
 * Handle HEAD requests (for checking if file exists)
 */
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    
    if (!path || path.length === 0) {
      return NextResponse.json({ error: 'Missing path' }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Reconstruct the key from path segments
    const key = path.join('/');
    
    console.log(`[HEAD /api/assets] Checking image: ${key}`);
    
    // Determine which bucket to use based on path
    const isOrderAsset = key.startsWith('book-mvp-simple-adventure/orders/');
    const bucket = isOrderAsset ? R2_ORDERS_BUCKET : R2_PUBLIC_BUCKET;
    
    console.log(`[HEAD /api/assets] Using bucket: ${bucket} for key: ${key}`);
    
    // Fetch object from R2
    const r2Response = await getObject(bucket, key);
    
    if (!r2Response.ok) {
      console.error(`[HEAD /api/assets] Failed to fetch ${key}: ${r2Response.status} ${r2Response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch image: ${r2Response.statusText}` },
        { 
          status: r2Response.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    // Get content type from response or infer from extension
    const contentType = r2Response.headers.get('content-type') || 
      getContentTypeFromKey(key);
    
    // Return HEAD response with proper headers (no body)
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': r2Response.headers.get('content-length') || '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error: any) {
    console.error('[HEAD /api/assets] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check image' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
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

