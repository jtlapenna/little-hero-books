import { NextRequest, NextResponse } from 'next/server';
import { R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-config';
import { verifyBearerAuth } from '@/lib/auth';
import { getSignedUrlForObject } from '@/lib/r2-service';

/**
 * Generate signed URL for R2 object access
 * 
 * ⚠️ CRITICAL: This endpoint requires authentication to prevent unauthorized access
 * 
 * Query Parameters:
 * - key: R2 object key (required)
 * - bucket: Bucket name (optional, defaults to R2_PUBLIC_BUCKET)
 * - expiresIn: Expiration time in seconds (optional, defaults to 3600)
 * 
 * Headers:
 * - Authorization: Bearer <BACKEND_API_TOKEN> (REQUIRED)
 * 
 * Returns: { url: string, expiresIn: number, bucket: string, key: string, generatedAt: string }
 * 
 * Example:
 * GET /api/r2/signed-url?key=book-mvp-simple-adventure/backgrounds/page01.png&bucket=little-hero-assets&expiresIn=3600
 * Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  // CRITICAL: Require authentication
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const bucket = searchParams.get('bucket') || R2_PUBLIC_BUCKET;
    const expiresIn = parseInt(searchParams.get('expiresIn') || '3600', 10);
    
    // Validation
    if (!key) {
      return NextResponse.json(
        { error: 'key parameter is required' },
        { status: 400 }
      );
    }
    
    if (expiresIn < 60 || expiresIn > 604800) {
      return NextResponse.json(
        { error: 'expiresIn must be between 60 and 604800 seconds (1 week)' },
        { status: 400 }
      );
    }
    
    // Validate bucket name
    const validBuckets = [R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET];
    if (!validBuckets.includes(bucket)) {
      return NextResponse.json(
        { error: `Invalid bucket name. Must be one of: ${validBuckets.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Generate signed URL using R2 service helper
    // This uses the AWS SDK presigner which should work in Cloudflare Workers
    // If it fails, we'll need to implement custom presigning using Web Crypto API
    const signedUrl = await getSignedUrlForObject(key, bucket, expiresIn);
    
    // Log for audit trail (optional, but recommended for security monitoring)
    console.log(`[Signed URL API] Generated signed URL for ${bucket}/${key}, expires in ${expiresIn}s`);
    
    return NextResponse.json({
      url: signedUrl,
      expiresIn,
      bucket,
      key,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[Signed URL API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate signed URL',
        message: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

