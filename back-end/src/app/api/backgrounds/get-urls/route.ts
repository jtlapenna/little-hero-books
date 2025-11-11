import { NextRequest, NextResponse } from 'next/server';
import { getBackgroundImageUrl } from '@/lib/background-images';

/**
 * Get Cloudflare Images URLs for multiple background images by page numbers
 * POST /api/backgrounds/get-urls
 * Body: { pageNumbers: [0, 1, 2, ...] }
 * 
 * Returns all requested URLs in a single response to avoid multiple API calls.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pageNumbers } = body;
    
    if (!Array.isArray(pageNumbers)) {
      return NextResponse.json(
        { error: 'pageNumbers must be an array' },
        { status: 400 }
      );
    }
    
    // Validate and get URLs for all requested page numbers
    const urls: Record<number, string> = {};
    const errors: Record<number, string> = {};
    
    for (const pageNumberParam of pageNumbers) {
      const pageNumber = typeof pageNumberParam === 'number' ? pageNumberParam : parseInt(String(pageNumberParam), 10);
      
      if (isNaN(pageNumber) || pageNumber < 0 || pageNumber > 14) {
        errors[pageNumber] = 'pageNumber must be between 0 and 14';
        continue;
      }
      
      try {
        const url = getBackgroundImageUrl(pageNumber);
        urls[pageNumber] = url;
      } catch (error: any) {
        errors[pageNumber] = error?.message || 'Failed to get URL';
      }
    }
    
    return NextResponse.json({
      success: true,
      urls,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[Get Background URLs] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

