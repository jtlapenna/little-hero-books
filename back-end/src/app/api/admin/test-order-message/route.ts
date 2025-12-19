import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig, sendAmazonPreviewMessage } from '@/lib/notifications/amazon-message-center';

export const dynamic = 'force-dynamic';

/**
 * Test sending a message to a specific Amazon order
 * GET /api/admin/test-order-message?orderId=112-7311035-1437035
 * 
 * This will:
 * 1. Check available message types for the order
 * 2. Send a test text message using createConfirmOrderDetails (text-only mode)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || '112-7311035-1437035';
    const customMessage = searchParams.get('message');

    const configResult = getAmazonMessagingConfig(true);
    if (!configResult.ok) {
      return NextResponse.json({
        success: false,
        error: 'Configuration incomplete',
        issues: configResult.issues
      }, { status: 500 });
    }

    // Force text-only mode to skip HTML upload (as Amazon support suggested)
    process.env.AMAZON_FORCE_TEXT_ONLY = 'true';
    
    // Use the existing sendAmazonPreviewMessage function
    // It will automatically check available actions and send the appropriate message type
    const response = await sendAmazonPreviewMessage({
      amazonOrderId: orderId,
      reminderType: 'initial',
      previewUrl: 'https://littleherolabs.com/approve/test-token',
      childName: 'Test Child',
      revisionsRemaining: 2
    });
    
    delete process.env.AMAZON_FORCE_TEXT_ONLY;

    // Extract details from response
    const apiCallDetails = (response as any).apiCallDetails || (response as any).details?.apiCallDetails;
    
    return NextResponse.json({
      success: response.success === true,
      orderId,
      response: {
        success: response.success,
        messageId: response.payload?.messageId,
        error: response.error,
        details: response.details
      },
      apiCallDetails: apiCallDetails ? {
        requestId: apiCallDetails.requestId,
        operation: apiCallDetails.operation,
        request: {
          method: apiCallDetails.request?.method,
          path: apiCallDetails.request?.path,
          url: apiCallDetails.request?.url
        },
        response: {
          status: apiCallDetails.response?.status,
          body: apiCallDetails.response?.body
        }
      } : null,
      fullResponse: response
    });
  } catch (error: any) {
    const apiCallDetails = error.apiCallDetails || null;
    
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      status: error.status,
      apiCallDetails: apiCallDetails ? {
        requestId: apiCallDetails.requestId,
        operation: apiCallDetails.operation,
        response: {
          status: apiCallDetails.response?.status,
          body: apiCallDetails.response?.body
        }
      } : null,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

