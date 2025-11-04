import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

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
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    // Reconstruct the key from path segments
    const key = path.join('/');
    
    console.log(`[GET /api/manifests] Fetching manifest: ${key}`);
    
    // Fetch object from R2
    const response = await getObject(R2_ORDERS_BUCKET, key);
    
    if (!response.ok) {
      console.error(`[GET /api/manifests] Failed to fetch ${key}: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch manifest: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get content type from response or default to JSON
    const contentType = response.headers.get('content-type') || 'application/json';
    
    // Get manifest data
    const text = await response.text();
    
    // Return manifest with proper headers
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*', // Allow CORS for n8n
      },
    });
  } catch (error: any) {
    console.error('[GET /api/manifests] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch manifest' },
      { status: 500 }
    );
  }
}

