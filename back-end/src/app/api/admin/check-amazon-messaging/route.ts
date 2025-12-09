import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';

export const dynamic = 'force-dynamic';

/**
 * Maps field names to environment variable names
 */
function getEnvVarNameForField(fieldName: string): string {
  const mapping: Record<string, string> = {
    lwaClientId: 'AMZ_APP_CLIENT_ID',
    lwaClientSecret: 'AMZ_APP_CLIENT_SECRET',
    lwaRefreshToken: 'AMZ_REFRESH_TOKEN',
    sellerId: 'AMZ_SELLER_ID',
    marketplaceId: 'AMZ_MARKETPLACE_ID',
    spRegion: 'AMZ_REGION',
    awsAccessKeyId: 'AWS_ACCESS_KEY_ID',
    awsSecretAccessKey: 'AWS_SECRET_ACCESS_KEY',
    awsRegion: 'AWS_REGION',
    customerSiteUrl: 'CUSTOMER_SITE_URL',
    autoApprovalHours: 'PREVIEW_AUTO_APPROVAL_HOURS'
  };
  return mapping[fieldName] || fieldName;
}

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
      // Provide detailed breakdown of what's missing
      const missingFields = configResult.issues.map(issue => {
        const fieldName = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path);
        const envVarName = getEnvVarNameForField(fieldName);
        return {
          field: fieldName,
          envVar: envVarName,
          message: issue.message,
          currentValue: process.env[envVarName] ? 'SET (but invalid)' : 'MISSING'
        };
      });

      return NextResponse.json(
        {
          configured: false,
          error: configResult.error,
          issues: configResult.issues,
          missingFields: missingFields,
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
          message: 'Amazon Messaging API is not properly configured. Check environment variables.',
          diagnostic: {
            requiredEnvVars: [
              'AMZ_APP_CLIENT_ID',
              'AMZ_APP_CLIENT_SECRET',
              'AMZ_REFRESH_TOKEN',
              'AMZ_SELLER_ID',
              'AWS_ACCESS_KEY_ID',
              'AWS_SECRET_ACCESS_KEY'
            ],
            optionalEnvVars: [
              'AMZ_MARKETPLACE_ID (default: ATVPDKIKX0DER)',
              'AMZ_REGION (default: na)',
              'AWS_REGION (default: us-east-1)',
              'CUSTOMER_SITE_URL (default: https://littleherolabs.com)'
            ],
            currentStatus: {
              AMZ_APP_CLIENT_ID: process.env.AMZ_APP_CLIENT_ID ? '✅ SET' : '❌ MISSING',
              AMZ_APP_CLIENT_SECRET: process.env.AMZ_APP_CLIENT_SECRET ? '✅ SET' : '❌ MISSING',
              AMZ_REFRESH_TOKEN: process.env.AMZ_REFRESH_TOKEN ? '✅ SET' : '❌ MISSING',
              AMZ_SELLER_ID: process.env.AMZ_SELLER_ID ? '✅ SET' : '❌ MISSING',
              AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '✅ SET' : '❌ MISSING',
              AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '✅ SET' : '❌ MISSING',
              AMZ_MARKETPLACE_ID: process.env.AMZ_MARKETPLACE_ID || '⚠️ Using default (ATVPDKIKX0DER)',
              AMZ_REGION: process.env.AMZ_REGION || '⚠️ Using default (na)',
              AWS_REGION: process.env.AWS_REGION || '⚠️ Using default (us-east-1)',
              CUSTOMER_SITE_URL: process.env.CUSTOMER_SITE_URL || '⚠️ Using default (https://littleherolabs.com)',
              AMAZON_PREVIEW_NOTIFICATIONS_ENABLED: rawEnvVar || '❌ MISSING (set to "true" to enable)'
            },
            instructions: {
              step1: 'Go to Vercel Dashboard → Your Project → Settings → Environment Variables',
              step2: 'Add the following variables for PRODUCTION environment:',
              step3: [
                'AWS_ACCESS_KEY_ID = (your AWS access key)',
                'AWS_SECRET_ACCESS_KEY = (your AWS secret key)',
                'AMAZON_PREVIEW_NOTIFICATIONS_ENABLED = true'
              ],
              step4: 'After adding variables, trigger a new deployment (Redeploy)',
              step5: 'Verify by checking this endpoint again after deployment'
            }
          }
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

