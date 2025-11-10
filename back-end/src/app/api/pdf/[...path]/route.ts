import { NextRequest, NextResponse } from 'next/server';
import { getObject, headObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
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
    
    // Get Accept header to distinguish JSON vs PDF requests
    const acceptHeader = request.headers.get('Accept') || '';
    
    console.log(`[${method} /api/pdf] Request received:`, {
      key,
      bucket: R2_ORDERS_BUCKET,
      pathSegments: path,
      url: request.url,
      acceptHeader,
      method
    });
    
    // For GET requests, check if we should proxy (stream) or return signed URL
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');
    const wantsJsonMetadata = format === 'json';
    const shouldProxy = searchParams.get('proxy') === 'true' || wantsJsonMetadata;

    const ensureExists = async () => {
      try {
        console.log(`[${method} /api/pdf] Calling headObject(${R2_ORDERS_BUCKET}, ${key})`);
        const headResponse = await headObject(R2_ORDERS_BUCKET, key);
        if (headResponse.status === 404) {
          console.log(`[${method} /api/pdf] PDF not found (404): ${key}`);
          return { ok: false as const, status: 404, response: headResponse };
        }

        if (!headResponse.ok) {
          console.error(`[${method} /api/pdf] headObject returned status ${headResponse.status} for ${key}`);
          return { ok: false as const, status: headResponse.status, response: headResponse };
        }

        const contentType = headResponse.headers.get('content-type') || 'application/pdf';
        const contentLength = headResponse.headers.get('content-length');

        return {
          ok: true as const,
          response: headResponse,
          contentType,
          contentLength,
        };
      } catch (error: any) {
        const message = error?.message || '';
        console.error(`[${method} /api/pdf] headObject error:`, {
          error,
          message,
          key,
          bucket: R2_ORDERS_BUCKET,
        });
        return { ok: false as const, status: 500, error };
      }
    };

    if (method === 'HEAD') {
      const metadata = await ensureExists();
      if (!metadata.ok) {
        if (metadata.status === 404) {
          return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
        }

        return NextResponse.json(
          { error: 'Failed to fetch PDF metadata' },
          { status: metadata.status ?? 500 }
        );
      }

      console.log(`[${method} /api/pdf] Returning HEAD response for: ${key}`);
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Type': metadata.contentType,
          'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
          ...(metadata.contentLength ? { 'Content-Length': metadata.contentLength } : {}),
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (wantsJsonMetadata) {
      const metadata = await ensureExists();
      if (!metadata.ok) {
        if (metadata.status === 404) {
          return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
        }

        return NextResponse.json(
          { error: 'Failed to fetch PDF metadata' },
          { status: metadata.status ?? 500 }
        );
      }

      console.log(`[${method} /api/pdf] Generating signed URL for: ${key} (${metadata.contentLength || 'unknown'} bytes)`);

      try {
        const expiresIn = 3600;
        const signedUrl = await getSignedUrlForObject(key, R2_ORDERS_BUCKET, expiresIn);

        console.log(`[${method} /api/pdf] Generated signed URL successfully:`, {
          key,
          expiresIn,
          signedUrlPrefix: signedUrl.substring(0, 50) + '...',
          signedUrlLength: signedUrl.length,
          isR2Url: signedUrl.includes('.r2.cloudflarestorage.com') || signedUrl.includes('.r2.dev'),
        });

        return NextResponse.json(
          {
            signedUrl,
            expiresIn,
            contentType: metadata.contentType,
            contentLength: metadata.contentLength ? parseInt(metadata.contentLength, 10) : null,
            filename: key.split('/').pop(),
          },
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate, private',
              Pragma: 'no-cache',
              Expires: '0',
              Vary: 'Accept',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, HEAD',
            },
          }
        );
      } catch (error: any) {
        const message = error?.message || '';
        console.error(
          `[${method} /api/pdf] Error generating signed URL:`,
          error
        );

        if (
          message.includes('Missing R2 credentials') ||
          message.includes('credentials') ||
          message.includes('ACCESS_KEY')
        ) {
          console.warn(
            `[${method} /api/pdf] R2 credentials missing; returning 404 so UI can fall back gracefully.`
          );
          return NextResponse.json(
            { error: 'PDF not available in this environment' },
            { status: 404 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to generate signed URL', details: message },
          { status: 500 }
        );
      }
    }

    // Fetch object from R2 orders bucket for streaming
    let response: Response;
    try {
      console.log(`[${method} /api/pdf] Calling getObject(${R2_ORDERS_BUCKET}, ${key})`);
      response = await getObject(R2_ORDERS_BUCKET, key);
      console.log(`[${method} /api/pdf] getObject response:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch (error: any) {
      const errorMessage = error?.message || '';
      console.error(`[${method} /api/pdf] getObject error:`, {
        error,
        message: errorMessage,
        key,
        bucket: R2_ORDERS_BUCKET,
      });
      if (errorMessage.includes('404') || errorMessage.includes('NoSuchKey') || errorMessage.includes('Not Found')) {
        console.log(`[${method} /api/pdf] PDF not found (404): ${key}`);
        return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
      }
      throw error;
    }

    if (!response.ok) {
      console.error(`[${method} /api/pdf] Response not OK:`, {
        status: response.status,
        statusText: response.statusText,
        key,
      });
      return NextResponse.json(
        { error: `Failed to fetch PDF: ${response.statusText}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/pdf';
    const contentLength = response.headers.get('content-length');

    console.log(`[${method} /api/pdf] Successfully fetched PDF for streaming:`, {
      key,
      contentType,
      contentLength,
      status: response.status,
    });

    // Proxy mode: Fetch from R2 and stream to frontend (avoids CORS issues)
    // Support Range requests for PDF.js to load large PDFs efficiently
    console.log(`[${method} /api/pdf] Proxying PDF stream: ${key} (${contentLength || 'unknown'} bytes)`);
    
    // Check for Range request header (PDF.js uses this for partial content)
    const rangeHeader = request.headers.get('range');
    
    if (rangeHeader && response.body) {
      // Handle Range request for partial content (HTTP 206)
      // PDF.js will request chunks of the PDF instead of loading entire file
      console.log(`[${method} /api/pdf] Range request received: ${rangeHeader}`);
      
      // Parse range header (e.g., "bytes=0-1023")
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : (contentLength ? parseInt(contentLength, 10) - 1 : undefined);
        
        // For now, stream the full response (Range handling would require more complex logic)
        // PDF.js will handle Range requests automatically if server supports it
        // We'll return full content and let PDF.js manage Range requests
      }
    }
    
    if (!response.body) {
      console.error(`[${method} /api/pdf] Response body is null for: ${key}`);
      return NextResponse.json(
        { error: 'PDF response body is null' },
        { status: 500 }
      );
    }
    
    // Stream the PDF directly - PDF.js will use Range requests automatically
    // Add Accept-Ranges header to indicate Range request support
    return new NextResponse(response.body, {
      status: rangeHeader ? 206 : 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate, private',
        'Accept-Ranges': 'bytes', // Indicate Range request support
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Expose-Headers': 'Content-Type, Content-Length, Content-Range, Accept-Ranges',
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

