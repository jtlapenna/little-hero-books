import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getSignedUrlForObject } from '@/lib/r2-service';

/**
 * Proxy endpoint to serve PDF files from R2 orders bucket
 * GET /api/pdf/book-mvp-simple-adventure/orders/TEST-ORDER-010/complete_book_TEST-ORDER-010.pdf
 * HEAD /api/pdf/... (for checking if PDF exists)
 */
async function handleRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  method: 'GET' | 'HEAD'
) {
  try {
    const { path } = await params;
    
    if (!path || path.length === 0) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    // Reconstruct the key from path segments
    const key = path.join('/');
    
    console.log(`[${method} /api/pdf] Request received:`, {
      key,
      bucket: R2_ORDERS_BUCKET,
      pathSegments: path,
      url: request.url
    });
    
    // Fetch object from R2 orders bucket
    let response: Response;
    try {
      console.log(`[${method} /api/pdf] Calling getObject(${R2_ORDERS_BUCKET}, ${key})`);
      response = await getObject(R2_ORDERS_BUCKET, key);
      console.log(`[${method} /api/pdf] getObject response:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
    } catch (error: any) {
      // getObject throws an error if response is not ok
      // Check if it's a 404 (NoSuchKey)
      const errorMessage = error?.message || '';
      console.error(`[${method} /api/pdf] getObject error:`, {
        error,
        message: errorMessage,
        key,
        bucket: R2_ORDERS_BUCKET
      });
      if (errorMessage.includes('404') || errorMessage.includes('NoSuchKey') || errorMessage.includes('Not Found')) {
        console.log(`[${method} /api/pdf] PDF not found (404): ${key}`);
        return NextResponse.json(
          { error: 'PDF not found' },
          { status: 404 }
        );
      }
      // Re-throw other errors
      throw error;
    }
    
    if (!response.ok) {
      console.error(`[${method} /api/pdf] Response not OK:`, {
        status: response.status,
        statusText: response.statusText,
        key
      });
      // Return appropriate status code (404 for not found, etc.)
      return NextResponse.json(
        { error: `Failed to fetch PDF: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get content type from response or default to PDF
    const contentType = response.headers.get('content-type') || 'application/pdf';
    const contentLength = response.headers.get('content-length');
    
    console.log(`[${method} /api/pdf] Successfully fetched PDF:`, {
      key,
      contentType,
      contentLength,
      status: response.status
    });
    
    // For HEAD requests, return headers only
    if (method === 'HEAD') {
      console.log(`[${method} /api/pdf] Returning HEAD response for: ${key}`);
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    // For GET requests, stream PDF directly from R2
    // Streaming avoids memory limits and works reliably with PDF.js via blob URLs
    // The frontend will fetch, convert to blob, and create a blob URL for PDF.js
    console.log(`[${method} /api/pdf] Streaming PDF directly: ${key} (${contentLength} bytes)`);
    
    if (!response.body) {
      console.error(`[${method} /api/pdf] Response body is null for: ${key}`);
      return NextResponse.json(
        { error: 'PDF response body is null' },
        { status: 500 }
      );
    }
    
    // Stream the PDF directly - frontend will handle blob conversion
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD',
        'Access-Control-Expose-Headers': 'Content-Type, Content-Length',
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      },
    });
  } catch (error: any) {
    console.error(`[${method} /api/pdf] Error:`, error);
    // If it's a 404 error (NoSuchKey), return 404 instead of 500
    if (error?.message?.includes('404') || error?.message?.includes('NoSuchKey')) {
      return NextResponse.json(
        { error: 'PDF not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch PDF' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  params: { params: Promise<{ path: string[] }> }
) {
  return handleRequest(request, params, 'GET');
}

export async function HEAD(
  request: NextRequest,
  params: { params: Promise<{ path: string[] }> }
) {
  return handleRequest(request, params, 'HEAD');
}

