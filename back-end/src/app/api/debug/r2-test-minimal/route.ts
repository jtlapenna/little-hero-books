import { NextRequest, NextResponse } from 'next/server';
import { listObjects, R2_ORDERS_BUCKET } from '@/lib/r2-client';

/**
 * Minimal test to see if R2 client works at all
 * GET /api/debug/r2-test-minimal
 */
export async function GET(request: NextRequest) {
  try {
    // Try the simplest possible R2 operation
    const result = await listObjects(R2_ORDERS_BUCKET, { maxKeys: 1 });
    
    return NextResponse.json({
      success: true,
      bucket: R2_ORDERS_BUCKET,
      objectCount: result.KeyCount || 0,
      hasContents: !!(result.Contents && result.Contents.length > 0),
      sampleKey: result.Contents?.[0]?.Key || null,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message,
      name: error?.name,
      stack: error?.stack,
      // Check if it's the filesystem error
      isFilesystemError: error?.message?.includes('fs.readFile') || error?.message?.includes('unenv'),
    }, { status: 500 });
  }
}

