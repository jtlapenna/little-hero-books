import { NextRequest, NextResponse } from 'next/server';
import { getObject } from '@/lib/r2-client';
import { getBucketFromKey, isOrderAssetKey } from '@/lib/r2-utils';

export const maxDuration = 25;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
      console.warn(
        `[GET /api/assets] R2 fetch/read failed (attempt ${i + 1}/${attempts}) key=${key}:`,
        getErrorMessage(err),
      );
    }
  }

  throw lastError || new Error('Failed to fetch object from R2');
}

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
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
 * GET /api/assets/{bookId}/order-generated-assets/characters/{characterHash}/pose01-walking-bg-removed.png
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
    
    // Determine which bucket to use based on path.
    // Orders bucket: {bookId}/orders/...
    // Public bucket: everything else
    const bucket = getBucketFromKey(key);
    
    console.log(`[GET /api/assets] Using bucket: ${bucket} for key: ${key} (isOrderAsset=${isOrderAssetKey(key)})`);
    
    // Fetch object from R2 (robust against truncated reads)
    let imageBuffer: ArrayBuffer;
    let contentType: string;
    let contentLength: number | undefined;
    try {
      const out = await getObjectBufferWithRetry(bucket, key, 3);
      imageBuffer = out.buffer;
      contentType = out.contentType;
      contentLength = out.contentLength;
    } catch (error: unknown) {
      // Extract status code from error message if available (best-effort)
      const message = getErrorMessage(error);
      const statusMatch = message.match(/(\d{3})/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 404;
      console.error(`[GET /api/assets] Failed to fetch image for ${key}:`, message);
      return NextResponse.json(
        { error: `Failed to fetch image: ${message || 'Not found'}` },
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
    
    // Purpose: ALWAYS serve the latest bytes from R2.
    // Many assets are overwritten in-place (UI replace, flip tool, normalize tool, manual R2 edits).
    // Any caching here can cause the UI to show an older version that no longer exists in R2.
    const cacheControl = 'no-store, max-age=0';
    
    // Return image with proper headers (including CORS)
    const response = new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': String(contentLength) } : {}),
        'Cache-Control': cacheControl,
        // Hint CDNs/proxies (including Cloudflare) not to cache even if configured aggressively.
        'CDN-Cache-Control': cacheControl,
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
    
    return response;
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('[GET /api/assets] Error:', error);
    const errorResponse = NextResponse.json(
      { error: message || 'Failed to fetch image' },
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
  _request: NextRequest,
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
    const bucket = getBucketFromKey(key);
    
    console.log(`[HEAD /api/assets] Using bucket: ${bucket} for key: ${key} (isOrderAsset=${isOrderAssetKey(key)})`);
    
    // Fetch object from R2 (getObject throws on error, so catch it)
    let r2Response: Response;
    try {
      r2Response = await getObject(bucket, key);
    } catch (error: unknown) {
      // getObject throws on non-OK responses (404, 403, etc.)
      const message = getErrorMessage(error);
      console.error(`[HEAD /api/assets] getObject threw error for ${key}:`, message);
      
      // Extract status code from error message if available
      const statusMatch = message.match(/(\d{3})/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 404;
      
      return NextResponse.json(
        { error: `Failed to fetch image: ${message || 'Not found'}` },
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
        // Purpose: HEAD should also never be cached (used for freshness checks).
        'Cache-Control': 'no-store, max-age=0',
        'CDN-Cache-Control': 'no-store, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('[HEAD /api/assets] Error:', error);
    return NextResponse.json(
      { error: message || 'Failed to check image' },
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
