import { NextRequest, NextResponse } from 'next/server';
import { getAvailableOrderIds, downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Client, R2_ORDERS_BUCKET } from '@/lib/r2-config';

/**
 * Test endpoint to debug order detection issues
 * GET /api/debug/orders-test?orderId=TEST-ORDER-006
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const specificOrderId = searchParams.get('orderId');
  
  const result: any = {
    timestamp: new Date().toISOString(),
    tests: {}
  };
  
  // Test 1: List all order IDs
  try {
    const orderIds = await getAvailableOrderIds();
    result.tests.listOrderIds = {
      success: true,
      count: orderIds.length,
      orderIds: orderIds,
      foundSpecificOrder: specificOrderId ? orderIds.includes(specificOrderId) : null
    };
  } catch (error: any) {
    result.tests.listOrderIds = {
      success: false,
      error: error?.message,
      code: error?.$metadata?.httpStatusCode
    };
  }
  
  // Test 2: List raw R2 objects for orders prefix
  try {
    const prefix = 'book-mvp-simple-adventure/orders/';
    const res = await r2Client.send(new ListObjectsV2Command({
      Bucket: R2_ORDERS_BUCKET,
      Prefix: prefix,
      Delimiter: '/',
      MaxKeys: 100
    }));
    
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
      error: error?.message,
      code: error?.$metadata?.httpStatusCode
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
        const manifestKey = buildManifestKey(specificOrderId, stage);
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
          manifestKey: buildManifestKey(specificOrderId, stage),
          success: false,
          error: error?.message,
          code: error?.$metadata?.httpStatusCode
        });
      }
    }
  }
  
  return NextResponse.json(result, { status: 200 });
}

