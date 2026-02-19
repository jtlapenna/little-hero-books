import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-client';

export const maxDuration = 25;

/**
 * Fetch from R2 and protect against truncated reads.
 * Some renderers will display "top slice only" if a PNG download is cut short.
 */
async function getObjectBufferWithRetry(bucket: string, key: string, attempts = 3): Promise<{ buffer: ArrayBuffer; contentType: string; contentLength?: number }> {
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const r2Response = await getObject(bucket, key);
      const contentType = r2Response.headers.get('content-type') || getContentTypeFromKey(key);
      const expectedLenRaw = r2Response.headers.get('content-length');
      const expectedLen = expectedLenRaw ? Number(expectedLenRaw) : undefined;
      const buffer = await r2Response.arrayBuffer();
      const actualLen = buffer.byteLength;

      // If R2 gave us a length and the download is shorter, retry.
      if (Number.isFinite(expectedLen) && expectedLen !== actualLen) {
        lastError = new Error(`Truncated R2 object: expected ${expectedLen} bytes, got ${actualLen} bytes`);
        console.warn(`[GET /api/assets] ${String(lastError)} (attempt ${i + 1}/${attempts}) key=${key}`);
        continue;
      }

      return { buffer, contentType, contentLength: Number.isFinite(expectedLen) ? expectedLen : actualLen };
    } catch (err) {
      lastError = err;
      console.warn(`[GET /api/assets] R2 fetch/read failed (attempt ${i + 1}/${attempts}) key=${key}:`, (err as any)?.message || err);
    }
  }

  throw lastError || new Error('Failed to fetch object from R2');
}

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
    
    // Check for cache-busting query parameter (e.g., ?v=1234567890)
    // This helps ensure fresh images after flips/replacements
    const { searchParams } = new URL(request.url);
    const cacheBuster = searchParams.get('v');
    
    console.log(`[GET /api/assets] Fetching image: ${key}${cacheBuster ? ` (cache-bust: ${cacheBuster})` : ''}`);
    
    // Determine which bucket to use based on path
    // Orders bucket: book-mvp-simple-adventure/orders/...
    // Public bucket: everything else
    const isOrderAsset = key.startsWith('book-mvp-simple-adventure/orders/');
    const bucket = isOrderAsset ? R2_ORDERS_BUCKET : R2_PUBLIC_BUCKET;
    
    console.log(`[GET /api/assets] Using bucket: ${bucket} for key: ${key}`);
    
    // Fetch object from R2 (robust against truncated reads)
    let imageBuffer: ArrayBuffer;
    let contentType: string;
    let contentLength: number | undefined;
    try {
      const out = await getObjectBufferWithRetry(bucket, key, 3);
      imageBuffer = out.buffer;
      contentType = out.contentType;
      contentLength = out.contentLength;
    } catch (error: any) {
      // Extract status code from error message if available (best-effort)
      const statusMatch = error?.message?.match?.(/(\d{3})/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 404;
      console.error(`[GET /api/assets] Failed to fetch image for ${key}:`, error?.message || error);
      return NextResponse.json(
        { error: `Failed to fetch image: ${error?.message || 'Not found'}` },
        {
          status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }
    
    // Determine cache strategy based on image type
    // Background-removed images (nobg.png) should refresh more frequently to show updated versions
    const isBackgroundRemoved = key.toLowerCase().includes('nobg') || 
                                key.toLowerCase().includes('bg-removed') ||
                                key.toLowerCase().includes('background-removed');
    // v= token is content-addressed (changes only when the asset changes), so
    // the browser can safely cache the response for that exact URL.
    const cacheControl = cacheBuster
      ? 'public, max-age=600, immutable'
      : isBackgroundRemoved
        ? 'public, max-age=60, must-revalidate, s-maxage=0'
        : 'public, max-age=3600, s-maxage=3600';
    
    // Return image with proper headers (including CORS)
    const response = new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': String(contentLength) } : {}),
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
    
    // Fetch object from R2 (getObject throws on error, so catch it)
    let r2Response: Response;
    try {
      r2Response = await getObject(bucket, key);
    } catch (error: any) {
      // getObject throws on non-OK responses (404, 403, etc.)
      console.error(`[HEAD /api/assets] getObject threw error for ${key}:`, error.message);
      
      // Extract status code from error message if available
      const statusMatch = error.message?.match(/(\d{3})/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 404;
      
      return NextResponse.json(
        { error: `Failed to fetch image: ${error.message || 'Not found'}` },
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

