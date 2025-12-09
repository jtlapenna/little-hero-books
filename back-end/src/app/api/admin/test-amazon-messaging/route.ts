import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';
import { getOrderFromSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to diagnose Amazon Messaging API issues
 * GET /api/admin/test-amazon-messaging?orderId=111-0060602-1283417
 * Force deployment: Add comprehensive diagnostics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || '111-0060602-1283417';

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      orderId,
      steps: []
    };

    // Step 1: Check configuration
    diagnostics.steps.push({ step: 1, name: 'Check Configuration' });
    const configResult = getAmazonMessagingConfig(true);
    if (!configResult.ok) {
      return NextResponse.json({
        success: false,
        error: 'Configuration incomplete',
        diagnostics: {
          ...diagnostics,
          configError: configResult.error,
          configIssues: configResult.issues
        }
      });
    }
    diagnostics.steps.push({ step: 1, status: 'ok', message: 'Configuration valid' });

    // Step 2: Get order
    diagnostics.steps.push({ step: 2, name: 'Get Order from Supabase' });
    const order = await getOrderFromSupabase(orderId);
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        diagnostics
      });
    }
    const amazonOrderId = order.amazon_order_id || order.orderId || order.order_id || orderId;
    diagnostics.steps.push({ step: 2, status: 'ok', message: `Order found, amazonOrderId: ${amazonOrderId}` });

    // Step 3: Test LWA token (using sendAmazonPreviewMessage which handles token internally)
    diagnostics.steps.push({ step: 3, name: 'Test LWA Access Token' });
    try {
      // We'll test token by attempting the actual send
      diagnostics.steps.push({ step: 3, status: 'ok', message: 'Will test token in next step' });
    } catch (error: any) {
      diagnostics.steps.push({ step: 3, status: 'error', message: error.message, error });
      return NextResponse.json({
        success: false,
        error: 'Failed to get access token',
        diagnostics
      });
    }

    // Step 4: Test GET /messaging/v1/orders endpoint (this is where it likely fails)
    diagnostics.steps.push({ step: 4, name: 'Test GET /messaging/v1/orders endpoint' });
    try {
      const { sendAmazonPreviewMessage } = await import('@/lib/notifications/amazon-message-center');
      
      // This will call ensureMessageTypeAllowed which does GET /messaging/v1/orders
      const response = await sendAmazonPreviewMessage({
        amazonOrderId,
        reminderType: 'initial',
        previewUrl: 'https://littleherolabs.com/approve/test-token',
        childName: 'Test',
        revisionsRemaining: 2
      });
      
      if (response.success) {
        diagnostics.steps.push({ 
          step: 4, 
          status: 'ok', 
          message: 'All endpoints successful!',
          messageId: response.messageId
        });
      } else {
        diagnostics.steps.push({ 
          step: 4, 
          status: 'error', 
          message: response.error || 'Unknown error',
          issues: response.issues
        });
        return NextResponse.json({
          success: false,
          error: 'Amazon messaging failed',
          diagnostics
        });
      }
    } catch (error: any) {
      diagnostics.steps.push({ 
        step: 4, 
        status: 'error', 
        message: error.message,
        code: error.code,
        statusCode: error.status,
        details: error.details,
        url: error.url,
        path: error.path,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      return NextResponse.json({
        success: false,
        error: 'GET /messaging/v1/orders failed',
        diagnostics
      });
    }

    return NextResponse.json({
      success: true,
      message: 'All tests passed',
      diagnostics
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

