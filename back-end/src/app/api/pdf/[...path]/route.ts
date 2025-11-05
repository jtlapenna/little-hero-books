import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

/**
 * Proxy endpoint to serve PDF files from R2 orders bucket
 * GET /api/pdf/book-mvp-simple-adventure/orders/TEST-ORDER-010/complete_book_TEST-ORDER-010.pdf
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
    
    console.log(`[GET /api/pdf] Fetching PDF: ${key}`);
    
    // Fetch object from R2 orders bucket
    const response = await getObject(R2_ORDERS_BUCKET, key);
    
    if (!response.ok) {
      console.error(`[GET /api/pdf] Failed to fetch ${key}: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch PDF: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get content type from response or default to PDF
    const contentType = response.headers.get('content-type') || 'application/pdf';
    
    // Get PDF data
    const pdfBuffer = await response.arrayBuffer();
    
    // Return PDF with proper headers for inline viewing
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*', // Allow CORS for frontend
      },
    });
  } catch (error: any) {
    console.error('[GET /api/pdf] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch PDF' },
      { status: 500 }
    );
  }
}

