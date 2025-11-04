import { NextRequest, NextResponse } from 'next/server';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Client, R2_ORDERS_BUCKET } from '@/lib/r2-config';

/**
 * Minimal test to see if R2 client works at all
 * GET /api/debug/r2-test-minimal
 */
export async function GET(request: NextRequest) {
  try {
    // Try the simplest possible R2 operation
    const cmd = new ListObjectsV2Command({
      Bucket: R2_ORDERS_BUCKET,
      MaxKeys: 1,
    });
    
    const result = await r2Client.send(cmd);
    
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
      code: error?.$metadata?.httpStatusCode,
      stack: error?.stack,
      // Check if it's the filesystem error
      isFilesystemError: error?.message?.includes('fs.readFile') || error?.message?.includes('unenv'),
    }, { status: 500 });
  }
}

