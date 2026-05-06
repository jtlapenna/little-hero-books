import { NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';
import {
  AMAZON_SP_API_ENV_ALIASES,
  resolveAmazonSpApiEnv,
} from '@/lib/amazon-sp-api';

export const dynamic = 'force-dynamic';

/**
 * Maps field names to environment variable names
 */
function getEnvVarNamesForField(fieldName: string): string[] {
  if (fieldName in AMAZON_SP_API_ENV_ALIASES) {
    const aliases =
      AMAZON_SP_API_ENV_ALIASES[fieldName as keyof typeof AMAZON_SP_API_ENV_ALIASES];
    const mode = process.env.AMAZON_SANDBOX_MODE?.trim().toLowerCase() === 'true'
      ? 'sandbox'
      : 'production';
    return [...aliases[mode]];
  }

  const mapping: Record<string, string[]> = {
    customerSiteUrl: ['CUSTOMER_SITE_URL'],
    autoApprovalHours: ['PREVIEW_AUTO_APPROVAL_HOURS']
  };
  return mapping[fieldName] || [fieldName];
}

/**
 * Diagnostic endpoint to check Amazon Messaging API configuration
 * GET /api/admin/check-amazon-messaging
 */
export async function GET() {
  try {
    const configResult = getAmazonMessagingConfig(true); // Force refresh
    const resolvedSpApiEnv = resolveAmazonSpApiEnv();

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
      if (
        upperKey.includes('AMAZON') ||
        upperKey.includes('PREVIEW') ||
        upperKey.includes('AWS_') ||
        upperKey.startsWith('AMZ_')
      ) {
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
        const envVarNames = getEnvVarNamesForField(fieldName);
        return {
          field: fieldName,
          envVar: envVarNames.join(' or '),
          message: issue.message,
          currentValue: envVarNames.some((name) => process.env[name]?.trim())
            ? 'SET (but invalid or placeholder)'
            : 'MISSING'
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
              'AMZ_LWA_CLIENT_ID_PROD or AMZ_APP_CLIENT_ID or AMAZON_SP_API_CLIENT_ID',
              'AMZ_LWA_CLIENT_SECRET_PROD or AMZ_APP_CLIENT_SECRET or AMAZON_SP_API_CLIENT_SECRET',
              'AMZ_APP_PROD_REFRESH_TOKEN or AMZ_REFRESH_TOKEN or AMAZON_SP_API_REFRESH_TOKEN',
              'AMZ_SELLER_ID or AMAZON_SP_API_SELLER_ID',
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
              lwaClientId: resolvedSpApiEnv.lwaClientId ? '✅ SET' : '❌ MISSING',
              lwaClientSecret: resolvedSpApiEnv.lwaClientSecret ? '✅ SET' : '❌ MISSING',
              lwaRefreshToken: resolvedSpApiEnv.lwaRefreshToken ? '✅ SET' : '❌ MISSING',
              sellerId: resolvedSpApiEnv.sellerId ? '✅ SET' : '❌ MISSING',
              awsAccessKeyId: resolvedSpApiEnv.awsAccessKeyId ? '✅ SET' : '❌ MISSING',
              awsSecretAccessKey: resolvedSpApiEnv.awsSecretAccessKey ? '✅ SET' : '❌ MISSING',
              marketplaceId: resolvedSpApiEnv.marketplaceId || '⚠️ Using default (ATVPDKIKX0DER)',
              spRegion: resolvedSpApiEnv.spRegion || '⚠️ Using default (na)',
              awsRegion: resolvedSpApiEnv.awsRegion || '⚠️ Using default (us-east-1)',
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
  } catch (error: unknown) {
    return NextResponse.json(
      {
        configured: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to check Amazon Messaging API configuration'
      },
      { status: 500 }
    );
  }
}
