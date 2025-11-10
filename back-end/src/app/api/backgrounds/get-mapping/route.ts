import { NextRequest, NextResponse } from 'next/server';
import { backgroundImagesMapping } from '@/lib/background-images';

/**
 * Get the current background images mapping
 * GET /api/backgrounds/get-mapping
 * 
 * Returns the current mapping of page numbers to Cloudflare Images URLs.
 * This can be used to verify the mapping after uploading.
 */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      mapping: backgroundImagesMapping,
      count: Object.keys(backgroundImagesMapping).length,
    });
  } catch (error: any) {
    console.error('[Get Background Mapping] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

