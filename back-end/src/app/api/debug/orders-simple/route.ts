import { NextRequest, NextResponse } from 'next/server';
import { getAvailableOrderIds, downloadManifest, buildManifestKey } from '@/lib/r2-service';

/**
 * Simple endpoint to test order detection and loading
 * GET /api/debug/orders-simple
 */
export async function GET(request: NextRequest) {
  const bookId = request.nextUrl.searchParams.get('bookId')?.trim() || '';
  if (!bookId) {
    return NextResponse.json({ error: 'bookId query parameter is required' }, { status: 400 });
  }
  const testOrderId = request.nextUrl.searchParams.get('testOrderId')?.trim() || 'TEST-ORDER-006';
  const result: any = {
    timestamp: new Date().toISOString(),
    bookId,
    step1_listOrderIds: null as any,
    step2_loadManifest: null as any,
    step3_ordersAPI: null as any,
  };

  // Step 1: List order IDs
  try {
    const orderIds = await getAvailableOrderIds(bookId);
    result.step1_listOrderIds = {
      success: true,
      count: orderIds.length,
      orderIds: orderIds,
      foundTestOrder: orderIds.includes(testOrderId),
      testOrderId,
    };
  } catch (error: any) {
    result.step1_listOrderIds = {
      success: false,
      error: error?.message,
      code: error?.$metadata?.httpStatusCode,
    };
    return NextResponse.json(result, { status: 500 });
  }

  // Step 2: Try to load manifest for TEST-ORDER-006
  if (result.step1_listOrderIds.foundTestOrder) {
    try {
      const manifestKey = buildManifestKey(testOrderId, '2a', { bookId });
      const manifest = await downloadManifest(manifestKey);
      result.step2_loadManifest = {
        success: true,
        manifestKey,
        hasOrder: !!manifest?.order,
        orderId: manifest?.order?.orderId,
        amazonOrderId: manifest?.order?.amazonOrderId,
        childName: manifest?.order?.childName,
        characterHash: manifest?.characterHash,
        workflowStage: manifest?.workflow?.currentStage,
      };
    } catch (error: any) {
      result.step2_loadManifest = {
        success: false,
        error: error?.message,
        code: error?.$metadata?.httpStatusCode,
        triedKey: buildManifestKey(testOrderId, '2a', { bookId }),
      };
    }
  } else {
    result.step2_loadManifest = {
      skipped: true,
      reason: `${testOrderId} not found in order IDs list`,
    };
  }

  // Step 3: Test what /api/orders would return
  try {
    // Simulate what getOrders does
    const orderIds = result.step1_listOrderIds.orderIds;
    const orders: any[] = [];

    for (const orderId of orderIds.slice(0, 5)) {
      try {
        let manifest: any = null;
        for (const stage of ['2a', '2b', '3'] as const) {
          try {
            manifest = await downloadManifest(buildManifestKey(orderId, stage, { bookId }));
            break;
          } catch {
            continue;
          }
        }
        if (manifest) {
          orders.push({
            orderId: manifest?.order?.orderId || orderId,
            amazonOrderId: manifest?.order?.amazonOrderId || orderId,
            childName: manifest?.order?.childName || 'Unknown',
            characterHash: manifest?.characterHash,
            workflowStage: manifest?.workflow?.currentStage,
          });
        }
      } catch (error: any) {
        // Skip this order
      }
    }

    result.step3_ordersAPI = {
      success: true,
      ordersCount: orders.length,
      orders: orders,
    };
  } catch (error: any) {
    result.step3_ordersAPI = {
      success: false,
      error: error?.message,
    };
  }

  return NextResponse.json(result, { status: 200 });
}
