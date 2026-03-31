import { NextRequest, NextResponse } from 'next/server';
import { getAvailableOrderIds, downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { listObjects, R2_ORDERS_BUCKET } from '@/lib/r2-client';

/**
 * Test endpoint to debug order detection issues
 * GET /api/debug/orders-test?orderId=TEST-ORDER-006
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const specificOrderId = searchParams.get('orderId');
  const bookId = searchParams.get('bookId')?.trim() || '';
  if (!bookId) {
    return NextResponse.json({ error: 'bookId query parameter is required' }, { status: 400 });
  }
  
  const result: any = {
    timestamp: new Date().toISOString(),
    bookId,
    tests: {}
  };
  
  // Test 1: List all order IDs
  try {
    const orderIds = await getAvailableOrderIds(bookId);
    result.tests.listOrderIds = {
      success: true,
      count: orderIds.length,
      orderIds: orderIds,
      foundSpecificOrder: specificOrderId ? orderIds.includes(specificOrderId) : null
    };
  } catch (error: any) {
    result.tests.listOrderIds = {
      success: false,
      error: error?.message
    };
  }
  
  // Test 2: List raw R2 objects for orders prefix
  try {
    const prefix = `${bookId}/orders/`;
    const res = await listObjects(R2_ORDERS_BUCKET, {
      prefix,
      delimiter: '/',
      maxKeys: 100
    });
    
    result.tests.listRawOrders = {
      success: true,
      commonPrefixes: (res.CommonPrefixes || []).map(p => ({
        prefix: p.Prefix,
        extractedOrderId: p.Prefix?.replace(prefix, '').replace(/\/$/, '')
      })),
      objects: (res.Contents || []).slice(0, 20).map(o => ({
        key: o.Key,
        size: o.Size,
        lastModified: o.LastModified
      })),
      totalObjects: res.KeyCount || 0
    };
  } catch (error: any) {
    result.tests.listRawOrders = {
      success: false,
      error: error?.message
    };
  }
  
  // Test 3: Try to load manifest for specific order
  if (specificOrderId) {
    result.tests.loadSpecificOrder = {
      orderId: specificOrderId,
      attempts: [] as any[]
    };
    
    for (const stage of ['2a', '2b', '3'] as const) {
      try {
        const manifestKey = buildManifestKey(specificOrderId, stage, { bookId });
        const manifest = await downloadManifest(manifestKey);
        result.tests.loadSpecificOrder.attempts.push({
          stage,
          manifestKey,
          success: true,
          hasOrderData: !!manifest?.order,
          hasCharacterHash: !!manifest?.characterHash,
          workflowStage: manifest?.workflow?.currentStage,
          orderId: manifest?.order?.orderId,
          amazonOrderId: manifest?.order?.amazonOrderId,
          childName: manifest?.order?.childName
        });
      } catch (error: any) {
        result.tests.loadSpecificOrder.attempts.push({
          stage,
          manifestKey: buildManifestKey(specificOrderId, stage, { bookId }),
          success: false,
          error: error?.message
        });
      }
    }
  }
  
  return NextResponse.json(result, { status: 200 });
}
