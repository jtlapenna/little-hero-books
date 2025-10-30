import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client } from '@/lib/r2-config';

const ORDERS_BUCKET = process.env.R2_ORDERS_BUCKET_NAME || 'little-hero-orders';

// GET /api/debug/r2-get?orderId=...&stage=2a
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || '';
    const stageParam = (searchParams.get('stage') || '2a') as '2a' | '2b' | '3';

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    const key = buildManifestKey(orderId, stageParam);
    // Try raw SDK call for clearer errors
    try {
      const cmd = new GetObjectCommand({ Bucket: ORDERS_BUCKET, Key: key });
      const res = await r2Client.send(cmd);
      // If we got here, Body exists; don't stream, just report success
      return NextResponse.json({ ok: true, bucket: ORDERS_BUCKET, key, hasBody: !!res.Body });
    } catch (err: any) {
      // Build a signed URL to allow manual verification, and include error metadata
      try {
        const signedUrl = await getSignedUrl(r2Client, new GetObjectCommand({ Bucket: ORDERS_BUCKET, Key: key }), { expiresIn: 300 });
        return NextResponse.json({
          ok: false,
          bucket: ORDERS_BUCKET,
          key,
          error: err?.message || 'GetObject failed',
          name: err?.name,
          code: err?.$metadata?.httpStatusCode,
          signedUrl,
        }, { status: 500 });
      } catch (e2: any) {
        return NextResponse.json({
          ok: false,
          bucket: ORDERS_BUCKET,
          key,
          error: err?.message || 'GetObject failed',
          name: err?.name,
          code: err?.$metadata?.httpStatusCode,
          signedUrlError: e2?.message,
        }, { status: 500 });
      }
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}


