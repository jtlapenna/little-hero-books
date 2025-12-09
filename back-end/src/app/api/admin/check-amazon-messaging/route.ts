import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint to check Amazon Messaging API configuration
 * GET /api/admin/check-amazon-messaging
 */
export async function GET(request: NextRequest) {
  try {
    const configResult = getAmazonMessagingConfig(true); // Force refresh

    if (!configResult.ok) {
      return NextResponse.json(
        {
          configured: false,
          error: configResult.error,
          issues: configResult.issues,
          message: 'Amazon Messaging API is not properly configured. Check environment variables.'
        },
        { status: 200 } // Return 200 so it's easy to check in browser
      );
    }

    const config = configResult.config;

    // Return configuration status (without sensitive values)
    return NextResponse.json({
      configured: true,
      message: 'Amazon Messaging API is properly configured',
      config: {
        lwaClientId: config.lwaClientId ? `${config.lwaClientId.substring(0, 10)}...` : 'missing',
        lwaClientSecret: config.lwaClientSecret ? '***configured***' : 'missing',
        lwaRefreshToken: config.lwaRefreshToken ? `${config.lwaRefreshToken.substring(0, 10)}...` : 'missing',
        sellerId: config.sellerId || 'missing',
        marketplaceId: config.marketplaceId || 'missing',
        spRegion: config.spRegion || 'missing',
        awsAccessKeyId: config.awsAccessKeyId ? `${config.awsAccessKeyId.substring(0, 10)}...` : 'missing',
        awsSecretAccessKey: config.awsSecretAccessKey ? '***configured***' : 'missing',
        awsRegion: config.awsRegion || 'missing',
        customerSiteUrl: config.customerSiteUrl || 'missing',
        autoApprovalHours: config.autoApprovalHours || 72
      },
      notificationsEnabled: process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED === 'true',
      note: 'Sensitive values are masked. All required fields appear to be configured.'
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        configured: false,
        error: error?.message || 'Unknown error',
        message: 'Failed to check Amazon Messaging API configuration'
      },
      { status: 500 }
    );
  }
}

