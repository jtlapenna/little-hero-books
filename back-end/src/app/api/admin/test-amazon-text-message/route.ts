import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';
import { getOrderFromSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Test sending text-only message (no HTML upload)
 * GET /api/admin/test-amazon-text-message?orderId=111-0060602-1283417&previewUrl=https://littleherolabs.com/approve/test-token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || '111-0060602-1283417';
    const previewUrl = searchParams.get('previewUrl') || 'https://littleherolabs.com/approve/test-token';

    const configResult = getAmazonMessagingConfig(true);
    if (!configResult.ok) {
      return NextResponse.json({
        success: false,
        error: 'Configuration incomplete',
        issues: configResult.issues
      }, { status: 500 });
    }

    const config = configResult.config;
    const order = await getOrderFromSupabase(orderId);
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found'
      }, { status: 404 });
    }

    const amazonOrderId = order.amazon_order_id || order.orderId || order.order_id || orderId;

    // Get access token
    const { getAccessToken } = await import('@/lib/notifications/amazon-message-center');
    const accessToken = await getAccessToken(config);

    // Directly call sendConfirmOrderDetails (text-only, no upload)
    const { callSellingPartnerApi } = await import('@/lib/notifications/amazon-message-center');
    
    const messageText = `Hi! Here is a preview of your personalized book so you can confirm everything looks good before we print: ${previewUrl}. We will proceed using these details unless we hear from you.`;

    const response = await callSellingPartnerApi({
      method: 'POST',
      path: `/messaging/v1/orders/${amazonOrderId}/messages/createConfirmOrderDetails`,
      accessToken,
      config,
      query: {
        marketplaceIds: config.marketplaceId
      },
      body: {
        text: messageText
      }
    });

    return NextResponse.json({
      success: true,
      messageId: response?.payload?.messageId,
      messageType: 'createConfirmOrderDetails',
      response: response
    });
  } catch (error: any) {
    const apiCallDetails = error.apiCallDetails || null;
    
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      status: error.status,
      amazonErrorResponse: apiCallDetails?.response?.body ? 
        (typeof apiCallDetails.response.body === 'string' ? JSON.parse(apiCallDetails.response.body) : apiCallDetails.response.body) : null,
      apiCallDetails: apiCallDetails ? {
        requestId: apiCallDetails.requestId,
        operation: apiCallDetails.operation,
        responseBody: apiCallDetails.response?.body
      } : null
    }, { status: 500 });
  }
}

