import { NextRequest, NextResponse } from 'next/server';
import { getBackgroundImageUrlForConfig } from '@/lib/background-images';
import { getBookFormatConfig, loadRuntimeBookConfig } from '@/lib/books';

/**
 * Get Cloudflare Images URL for a background image by page number
 * GET /api/backgrounds/get-url?pageNumber=2
 * 
 * Returns the Cloudflare Images URL if configured, otherwise falls back to R2 URL.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pageNumberParam = searchParams.get('pageNumber');
    const requestedBookId = searchParams.get('bookId');
    const requestedFormatId = searchParams.get('formatId');
    
    if (!pageNumberParam) {
      return NextResponse.json(
        { error: 'pageNumber query parameter is required' },
        { status: 400 }
      );
    }
    
    const pageNumber = parseInt(pageNumberParam, 10);
    if (isNaN(pageNumber) || pageNumber < 0) {
      return NextResponse.json(
        { error: 'pageNumber must be a non-negative integer' },
        { status: 400 }
      );
    }

    if (!requestedBookId || !requestedBookId.trim()) {
      return NextResponse.json(
        { error: 'bookId query parameter is required' },
        { status: 400 }
      );
    }

    const bookId = requestedBookId.trim();
    const config = await loadRuntimeBookConfig({ bookId });
    const format = getBookFormatConfig(config, requestedFormatId ?? undefined);

    if (pageNumber >= format.interior.pageSequence.length) {
      return NextResponse.json(
        { error: `pageNumber must be between 0 and ${format.interior.pageSequence.length - 1}` },
        { status: 400 }
      );
    }

    const url = getBackgroundImageUrlForConfig(pageNumber, config, {
      formatId: format.formatId,
    });
    if (!url) {
      return NextResponse.json(
        { error: 'No background image configured for that page' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      pageNumber,
      bookId,
      formatId: format.formatId,
      url,
      isCloudflareImages: url.startsWith('https://imagedelivery.net/'),
    });
  } catch (error: any) {
    console.error('[Get Background URL] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
