import { requirePrivateFileAuth } from '@/lib/private-file-auth';
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
      );
    }

    // Reconstruct the key from path segments
    const key = path.join('/');
    const auth = await requirePrivateFileAuth(request, key, 'manifest');
    if (!auth.ok) return auth.response;
    
    console.log(`[GET /api/manifests] Fetching manifest: ${key}`);
    
    // Only an actual R2 404 means missing. Transport/configuration/auth failures
    // must never authorize a workflow to initialize and overwrite existing progress.
    let r2Response: Response;
    try {
      r2Response = await getObject(R2_ORDERS_BUCKET, key, { allowErrorResponse: true });
    } catch {
      return NextResponse.json({ error: 'Manifest storage unavailable' }, { status: 502, headers: { 'Cache-Control': 'private, no-store', 'Access-Control-Allow-Origin': '*' } });
    }
    if (!r2Response.ok) {
      if (r2Response.body) void r2Response.body.cancel().catch(() => undefined);
      return NextResponse.json({ error: r2Response.status === 404 ? 'Manifest not found' : 'Manifest storage unavailable' }, {
        status: r2Response.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'private, no-store', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Get manifest data
    const text = await r2Response.text();

    // Validate that manifest content is parseable JSON (n8n expects JSON responses)
    const isJsonFile = key.endsWith('.json');
    if (isJsonFile) {
      try {
        JSON.parse(text);
      } catch {
        console.error(`[GET /api/manifests] R2 object is not valid JSON (key=${key}, length=${text.length})`);
        return NextResponse.json(
          { error: 'Manifest file exists but contains invalid JSON', key, length: text.length },
          {
            status: 502,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
          }
        );
      }
    }
    
    // Check for cache-busting query parameter
    const { searchParams } = new URL(request.url);
    const cacheBuster = searchParams.get('v');
    
    // Return manifest with proper headers (including CORS)
    const cacheControl = cacheBuster
      ? 'private, no-store, max-age=0'
      : 'private, no-store, max-age=0';
    
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': isJsonFile ? 'application/json' : (r2Response.headers.get('content-type') || 'application/octet-stream'),
        'Cache-Control': cacheControl,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

