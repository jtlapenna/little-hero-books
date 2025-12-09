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

    // Check multiple sources for the notification flag
    const rawEnvVar = process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED || 
                      process.env.NEXT_PUBLIC_AMAZON_PREVIEW_NOTIFICATIONS_ENABLED ||
                      null;
    const envValue = rawEnvVar?.trim().toLowerCase();
    const notificationsEnabled = envValue === 'true';

    // Get all Amazon-related env vars for debugging
    const allAmazonEnvVars: Record<string, string> = {};
    Object.keys(process.env).forEach(key => {
      const upperKey = key.toUpperCase();
      if (upperKey.includes('AMAZON') || upperKey.includes('PREVIEW') || upperKey.includes('AWS_')) {
        const value = process.env[key];
        // Mask sensitive values but show first few chars to confirm they're set
        if (value && (key.includes('SECRET') || key.includes('KEY') || key.includes('TOKEN'))) {
          allAmazonEnvVars[key] = value.length > 0 ? `${value.substring(0, 8)}...` : 'empty';
        } else {
          allAmazonEnvVars[key] = value || 'not set';
        }
      }
    });

    if (!configResult.ok) {
      return NextResponse.json(
        {
          configured: false,
          error: configResult.error,
          issues: configResult.issues,
          notificationsEnabled,
          envVarCheck: {
            rawValue: rawEnvVar || 'not set',
            trimmedValue: envValue || 'not set',
            enabled: notificationsEnabled,
            note: 'If this shows "not set" but you set it in Vercel, you may need to rebuild the deployment.'
          },
          environmentVariables: allAmazonEnvVars,
          nodeEnv: process.env.NODE_ENV,
          vercelEnv: process.env.VERCEL_ENV,
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
      notificationsEnabled,
      envVarCheck: {
        rawValue: rawEnvVar || 'not set',
        trimmedValue: envValue || 'not set',
        enabled: notificationsEnabled,
        note: notificationsEnabled 
          ? 'Notifications are enabled' 
          : 'Notifications are disabled - set AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true to enable'
      },
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
      environmentVariables: allAmazonEnvVars,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
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

