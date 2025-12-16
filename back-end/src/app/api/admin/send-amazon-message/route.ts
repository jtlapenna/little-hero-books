import { NextRequest, NextResponse } from 'next/server';
import { sendAmazonPreviewMessage } from '@/lib/notifications/amazon-message-center';

export const dynamic = 'force-dynamic';

/**
 * Simple endpoint to send Amazon message
 * GET /api/admin/send-amazon-message?orderId=111-0060602-1283417&previewUrl=https://littleherolabs.com/approve/test-token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || '111-0060602-1283417';
    const previewUrl = searchParams.get('previewUrl') || 'https://littleherolabs.com/approve/test-token';
    const childName = searchParams.get('childName') || 'Test';

    const response = await sendAmazonPreviewMessage({
      amazonOrderId: orderId,
      reminderType: 'initial',
      previewUrl,
      childName,
      revisionsRemaining: 2
    });

    return NextResponse.json({
      success: response.success,
      messageId: response.messageId,
      documentId: response.documentId,
      messageType: (response as any).messageType,
      error: response.error,
      details: (response as any).details
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to send message'
    }, { status: 500 });
  }
}

