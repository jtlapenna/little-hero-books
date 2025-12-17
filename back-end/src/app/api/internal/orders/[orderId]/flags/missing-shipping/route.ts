import { NextRequest, NextResponse } from 'next/server';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/internal/orders/[orderId]/flags/missing-shipping
 * 
 * Internal endpoint for n8n to flag orders with missing shipping information.
 * This endpoint is called by w1.1 workflow when an order on the w4 path lacks shipping data.
 * 
 * Auth: Requires BACKEND_INTERNAL_TOKEN in Authorization header
 * 
 * Body (JSON):
 * {
 *   "source": "w1.1",
 *   "workflow": "w1.1->w4 shipping validation",
 *   "reason": "Missing shipping_address for w4 path",
 *   "severity": "warning",
 *   "run_id": "n8n-run-id",
 *   "timestamp": "2025-12-17T00:00:00.000Z",
 *   "orderDbId": 307,
 *   "orderId": "111-0060602-1283417"
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Verify internal token
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.BACKEND_INTERNAL_TOKEN;
  
  if (!expectedToken) {
    console.error('[Flag Missing Shipping] BACKEND_INTERNAL_TOKEN not configured');
    return NextResponse.json(
      { error: 'Internal token not configured' },
      { status: 500 }
    );
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[Flag Missing Shipping] Missing or invalid Authorization header');
    return NextResponse.json(
      { error: 'Unauthorized - missing or invalid Authorization header' },
      { status: 401 }
    );
  }
  
  const token = authHeader.substring(7); // Remove "Bearer " prefix
  if (token !== expectedToken) {
    console.error('[Flag Missing Shipping] Invalid token');
    return NextResponse.json(
      { error: 'Unauthorized - invalid token' },
      { status: 401 }
    );
  }
  
  const { orderId } = await params;
  
  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const {
      source,
      workflow,
      reason,
      severity,
      run_id,
      timestamp,
      orderDbId
    } = body;
    
    // Get current order
    const order = await getOrderFromSupabase(orderId);
    
    if (!order) {
      return NextResponse.json(
        { error: `Order ${orderId} not found` },
        { status: 404 }
      );
    }
    
    // Update order with error flags
    const updates: any = {
      error_type: 'missing_shipping',
      error_message: reason || 'Missing shipping_address for w4 path in w1.1',
      updated_at: timestamp || new Date().toISOString()
    };
    
    // Optionally store flag metadata in a flags JSONB field if it exists
    // This provides additional context for debugging
    const flagMetadata = {
      source: source || 'w1.1',
      workflow: workflow || 'w1.1->w4 shipping validation',
      reason: reason || 'Missing shipping_address for w4 path',
      severity: severity || 'warning',
      run_id: run_id || null,
      timestamp: timestamp || new Date().toISOString(),
      flagged_at: new Date().toISOString()
    };
    
    // Try to update flags field if it exists (gracefully handle if it doesn't)
    try {
      const currentFlags = order.flags || {};
      updates.flags = {
        ...currentFlags,
        missing_shipping: true,
        missing_shipping_details: flagMetadata
      };
    } catch (e) {
      // Flags field might not exist or be in wrong format - continue without it
      console.warn('[Flag Missing Shipping] Could not update flags field:', e);
    }
    
    await updateOrderInSupabase(orderId, updates);
    
    console.log(`[Flag Missing Shipping] Successfully flagged order ${orderId}:`, {
      orderId,
      orderDbId,
      source,
      workflow,
      reason
    });
    
    return NextResponse.json({
      success: true,
      orderId,
      orderDbId: orderDbId || order.id,
      flagged: true,
      error_type: 'missing_shipping',
      message: 'Order flagged as missing shipping information'
    });
    
  } catch (error: any) {
    console.error(`[Flag Missing Shipping] Error for order ${orderId}:`, error);
    return NextResponse.json(
      { 
        error: 'Failed to flag order',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

