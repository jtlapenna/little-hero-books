import { NextRequest, NextResponse } from 'next/server';
import { getBackgroundImageUrl } from '@/lib/background-images';

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
    
    if (!pageNumberParam) {
      return NextResponse.json(
        { error: 'pageNumber query parameter is required' },
        { status: 400 }
      );
    }
    
    const pageNumber = parseInt(pageNumberParam, 10);
    if (isNaN(pageNumber) || pageNumber < 0 || pageNumber > 14) {
      return NextResponse.json(
        { error: 'pageNumber must be between 0 and 14' },
        { status: 400 }
      );
    }
    
    const url = getBackgroundImageUrl(pageNumber);
    
    return NextResponse.json({
      success: true,
      pageNumber,
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

