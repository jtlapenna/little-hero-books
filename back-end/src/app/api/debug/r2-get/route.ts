import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

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
    // Try aws4fetch call
    try {
      const res = await getObject(R2_ORDERS_BUCKET, key);
      // Check if response is OK
      if (res.ok) {
        // Try to read a small portion to verify body exists
        const text = await res.text();
        return NextResponse.json({ 
          ok: true, 
          bucket: R2_ORDERS_BUCKET, 
          key, 
          hasBody: true,
          bodyLength: text.length,
          contentType: res.headers.get('content-type')
        });
      } else {
        return NextResponse.json({
          ok: false,
          bucket: R2_ORDERS_BUCKET,
          key,
          error: `HTTP ${res.status}: ${res.statusText}`,
          status: res.status,
        }, { status: res.status });
      }
    } catch (err: any) {
      return NextResponse.json({
        ok: false,
        bucket: R2_ORDERS_BUCKET,
        key,
        error: err?.message || 'GetObject failed',
        name: err?.name,
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}


