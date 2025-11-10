import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

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
 * Proxy endpoint to serve R2 manifest files
 * GET /api/manifests/book-mvp-simple-adventure/orders/TEST-ORDER-006/manifests/2a-manifest.json
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    
    if (!path || path.length === 0) {
      return NextResponse.json(
        { error: 'Missing path' },
        {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    // Reconstruct the key from path segments
    const key = path.join('/');
    
    console.log(`[GET /api/manifests] Fetching manifest: ${key}`);
    
    // Fetch object from R2 (getObject throws on error, so catch it)
    let r2Response: Response;
    try {
      r2Response = await getObject(R2_ORDERS_BUCKET, key);
    } catch (error: any) {
      // getObject throws on non-OK responses (404, 403, etc.)
      console.error(`[GET /api/manifests] getObject threw error for ${key}:`, error.message);
      
      // Extract status code from error message if available
      const statusMatch = error.message?.match(/(\d{3})/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 404;
      
      return NextResponse.json(
        { error: `Failed to fetch manifest: ${error.message || 'Not found'}` },
        {
          status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    // Get content type from response or default to JSON
    const contentType = r2Response.headers.get('content-type') || 'application/json';
    
    // Get manifest data
    const text = await r2Response.text();
    
    // Check for cache-busting query parameter
    const { searchParams } = new URL(request.url);
    const cacheBuster = searchParams.get('v');
    
    // Return manifest with proper headers (including CORS)
    // If cache-busting parameter is present, disable caching to ensure fresh manifest
    const cacheControl = cacheBuster
      ? 'no-cache, no-store, must-revalidate' // Force fresh fetch when cache-busting
      : 'public, max-age=60, must-revalidate, s-maxage=0'; // Reduced cache time (1 minute, no CDN cache)
    
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    console.error('[GET /api/manifests] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch manifest' },
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

