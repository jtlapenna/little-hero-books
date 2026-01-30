// Fix: Remove await before .catch() in notification logging
// Fix: Include actual error reason when Amazon messaging fails
// Force deployment: Apply AWS credentials configuration
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createNotFoundError, createValidationError } from '@/lib/error-handler';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { ensureActivePreviewToken } from '@/lib/preview-tokens';
import { updateOrderStatus } from '@/lib/status-service';
import { ReviewStageStatus } from '@/constants/statuses';
import { mapSupabaseOrderToOrder } from '@/lib/order-mapper';
import { sendAmazonPreviewMessage } from '@/lib/notifications/amazon-message-center';
import { sendD2CPreviewEmail } from '@/lib/notifications/d2c-email';

interface FinalApprovalPayload {
  reviewer?: string;
  comments?: string;
  notifyCustomer?: boolean;
}

async function handleFinalApproval(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  let payload: FinalApprovalPayload = {};

  if (request.body) {
    try {
      payload = await request.json();
    } catch (error) {
      // Ignore JSON parse errors and fallback to defaults
      payload = {};
    }
  }

  const reviewer = payload.reviewer?.trim() || 'system';
  const comments = payload.comments?.trim();

  const orderRecord = await getOrderFromSupabase(orderId);

  if (!orderRecord) {
    throw createNotFoundError(`Order ${orderId} not found`);
  }

  const nowIso = new Date().toISOString();
  const existingRequestedAt: string | undefined =
    orderRecord.customer_approval_requested_at || undefined;
  const requestedAt = existingRequestedAt || nowIso;

  const existingStages = orderRecord.review_stages || {};

  const updatedReviewStages = {
    preBria: existingStages.preBria || existingStages.pre_bria || {
      status: ReviewStageStatus.PENDING
    },
    postBria: existingStages.postBria || existingStages.post_bria || {
      status: ReviewStageStatus.PENDING
    },
    postPdf: {
      ...(existingStages.postPdf || existingStages.post_pdf || {}),
      status: ReviewStageStatus.APPROVED,
      reviewedAt: nowIso,
      reviewer,
      comments: comments ?? (existingStages.postPdf?.comments || existingStages.post_pdf?.comments)
    }
  };

  await updateOrderStatus(orderId, {
    review_stages: updatedReviewStages,
    workflow_step: 'customer_approval',
    customer_approval_required: true,
    customer_approval_status: 'pending',
    customer_approval_requested_at: requestedAt
  });

  const { record: previewToken, created: tokenCreated } =
    await ensureActivePreviewToken(orderId);
  
  // Determine customer site URL based on environment
  // In production, use littleherolabs.com; in development, use localhost
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const customerSiteUrl = process.env.CUSTOMER_SITE_URL?.replace(/\/+$/, '') || 
    (isProduction ? 'https://littleherolabs.com' : 'http://localhost:4321');
  const previewUrl = `${customerSiteUrl}/approve/${previewToken.token}`;

  const updatedOrderRecord = await getOrderFromSupabase(orderId);
  const mappedOrder = updatedOrderRecord
    ? await mapSupabaseOrderToOrder(updatedOrderRecord)
    : null;

  if (mappedOrder) {
    mappedOrder.customerApprovalRequestedAt =
      mappedOrder.customerApprovalRequestedAt || requestedAt;
    mappedOrder.customerPreview = {
      token: previewToken.token,
      url: previewUrl,
      requestedAt,
      expiresAt: previewToken.expiresAt,
    };
  }

  // Check if notifications are enabled (handle whitespace and case variations)
  // Try multiple ways to read the env var (Next.js can cache env vars)
  // IMPORTANT: In Vercel, env vars must be set in Project Settings → Environment Variables
  // and the deployment must be rebuilt after adding them
  // 
  // WORKAROUND: If the env var isn't set, default to enabled in production (force redeploy)
  // This is a workaround for Vercel env var not being available despite being set in UI
  const rawEnvVar = process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED || 
                    process.env.NEXT_PUBLIC_AMAZON_PREVIEW_NOTIFICATIONS_ENABLED ||
                    null;
  const envValue = rawEnvVar?.trim().toLowerCase();
  
  // Default to enabled in production if not explicitly set (since user has it set in Vercel UI)
  // This is a workaround for Vercel env var not being available despite being set
  // Note: isProduction is already declared above (line 83), reusing it here
  const sandboxModeRaw = process.env.AMAZON_SANDBOX_MODE?.trim().toLowerCase();
  const sandboxMode = sandboxModeRaw === 'true';
  
  // Reuse isProduction from line 83 (no duplicate declaration)
  // Enable notifications if:
  // 1. Explicitly set to 'true', OR
  // 2. In production (default behavior when env var not available - workaround for Vercel env var issue)
  //    We enable by default in production since user confirmed both vars are set in Vercel UI
  // WORKAROUND: Enable in production regardless of env vars (they're not being read correctly from Vercel)
  // Always enable in production as workaround for Vercel env var injection issue
  const notificationsEnabled = envValue === 'true' || isProduction; // Force new deployment
  
  // Always log for debugging (helps diagnose env var issues)
  // This will appear in Vercel function logs
  console.log('[Final Approval] Amazon messaging config check:', {
    rawEnvVar: rawEnvVar || 'undefined',
    trimmed: envValue || 'undefined',
    enabled: notificationsEnabled,
    isProduction,
    sandboxModeRaw: sandboxModeRaw || 'undefined',
    sandboxMode,
    defaultingToEnabled: !rawEnvVar && isProduction,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    allAmazonKeys: Object.keys(process.env)
      .filter(k => k.toUpperCase().includes('AMAZON') || k.toUpperCase().includes('PREVIEW'))
      .map(k => `${k}=${process.env[k]?.substring(0, 10)}...`)
      .join(', ')
  });

  const platform = (orderRecord.platform ?? 'amazon') as string;
  const amazonOrderId = orderRecord.amazon_order_id ?? null;

  let notificationResult: {
    attempted: boolean;
    sent: boolean;
    reason?: string;
    response?: unknown;
    channel?: 'email' | 'amazon_message';
  } = {
    attempted: false,
    sent: false
  };

  // D2C: send preview link by email
  if (platform === 'd2c') {
    if (!orderRecord.customer_email?.trim()) {
      notificationResult.reason = 'D2C order missing customer_email.';
    } else {
      notificationResult.attempted = true;
      notificationResult.channel = 'email';
      const childName =
        (orderRecord.character_specs &&
          (orderRecord.character_specs.childName ||
            orderRecord.character_specs.child_name)) ||
        undefined;
      const response = await sendD2CPreviewEmail({
        to: orderRecord.customer_email.trim(),
        previewUrl,
        childName,
        reminderType: 'initial',
        orderId,
      });
      notificationResult.sent = response.success;
      notificationResult.response = response;
      if (!response.success) {
        notificationResult.reason = response.error ?? 'Failed to send D2C preview email.';
      }
    }
  } else if (!notificationsEnabled) {
    notificationResult.reason =
      `Amazon preview messaging disabled by configuration. (AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=${rawEnvVar || 'not set'}, production=${isProduction}, sandbox=${sandboxMode}, sandboxRaw=${sandboxModeRaw || 'not set'})`;
  } else if (!amazonOrderId) {
    notificationResult.reason = 'Order is missing amazon_order_id.';
  } else if (!mappedOrder) {
    notificationResult.reason = 'Unable to map order for notification.';
  } else {
    // Amazon: send via Message Center (amazonOrderId is orderRecord.amazon_order_id)
    notificationResult.attempted = true;
    notificationResult.channel = 'amazon_message';

    try {
      // First, check configuration before attempting to send
      const { getAmazonMessagingConfig } = await import('@/lib/notifications/amazon-message-center');
      const configCheck = getAmazonMessagingConfig(true); // Force refresh
      
      if (!configCheck.ok) {
        // Configuration is invalid - provide detailed error
        const missingVars = configCheck.issues
          .map(issue => {
            const path = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path);
            return `${path}: ${issue.message}`;
          })
          .join('; ');
        
        notificationResult.sent = false;
        notificationResult.reason = `Configuration incomplete: ${missingVars}`;
        
        // Log detailed diagnostic info
        console.error('[Final Approval] Amazon messaging config check failed:', {
          error: configCheck.error,
          issues: configCheck.issues,
          envVars: {
            AMZ_APP_CLIENT_ID: process.env.AMZ_APP_CLIENT_ID ? 'SET' : 'MISSING',
            AMZ_APP_CLIENT_SECRET: process.env.AMZ_APP_CLIENT_SECRET ? 'SET' : 'MISSING',
            AMZ_REFRESH_TOKEN: process.env.AMZ_REFRESH_TOKEN ? 'SET' : 'MISSING',
            AMZ_SELLER_ID: process.env.AMZ_SELLER_ID ? 'SET' : 'MISSING',
            AMZ_MARKETPLACE_ID: process.env.AMZ_MARKETPLACE_ID || 'NOT SET (using default)',
            AMZ_REGION: process.env.AMZ_REGION || 'NOT SET (using default)',
            AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING',
            AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING',
            AWS_REGION: process.env.AWS_REGION || 'NOT SET (using default)',
            CUSTOMER_SITE_URL: process.env.CUSTOMER_SITE_URL || 'NOT SET (using default)',
          }
        });
        return; // Exit early - don't attempt to send
      }

      const revisionsRemaining = Math.max(
        0,
        2 - (orderRecord.revision_count || 0)
      );
      const childName =
        (orderRecord.character_specs &&
          (orderRecord.character_specs.childName ||
            orderRecord.character_specs.child_name)) ||
        undefined;

      const response = await sendAmazonPreviewMessage({
        amazonOrderId,
        reminderType: 'initial',
        previewUrl,
        childName,
        revisionsRemaining
      });

      notificationResult.response = response;
      notificationResult.sent = response.success;

      // If sending failed, include the error reason
      if (!response.success) {
        notificationResult.reason = response.error || 
          (response.issues && response.issues.length > 0 
            ? `Configuration issues: ${response.issues.map(i => i.message || i.path.join('.')).join(', ')}`
            : 'Unknown error sending Amazon message');
      }

      // Log notification attempt (fire and forget - don't await to avoid blocking)
      // FIX: Removed await before .catch() - await resolves promise, making .catch() unavailable
      const now = new Date().toISOString();
      supabase
        .from('notification_logs')
        .insert({
          order_id: amazonOrderId,
          notification_type: 'amazon_message',
          status: response.success ? 'sent' : 'failed',
          recipient: `amazon:${amazonOrderId}`,
          error_message: response.success
            ? response.messageId
              ? `messageId=${response.messageId}`
              : null
            : response.error || 'Unknown error',
          sent_at: response.success ? now : null,
          created_at: now
        })
        .then(() => {
          // Successfully logged (no action needed)
        })
        .catch((error) => {
          console.error(
            '[Final Approval] Failed to log Amazon notification:',
            error
          );
        });
    } catch (error: any) {
      notificationResult.sent = false;
      
      // Include COMPREHENSIVE error information for troubleshooting
      const errorDetails = error?.details || error?.response || {};
      const errorCode = error?.code || errorDetails?.errors?.[0]?.code;
      const errorMessage = error?.message || 'Failed to send Amazon notification.';
      const errorPath = error?.path || 'unknown';
      const errorUrl = error?.url || 'unknown';
      
      // Build detailed error message with all available info
      let detailedReason = errorMessage;
      if (errorCode) {
        detailedReason += ` (Code: ${errorCode})`;
      }
      if (error?.status) {
        detailedReason += ` (HTTP ${error.status})`;
      }
      if (errorPath && errorPath !== 'unknown') {
        detailedReason += ` (Endpoint: ${errorPath})`;
      }
      if (errorDetails?.errors?.[0]?.details) {
        detailedReason += ` | Details: ${JSON.stringify(errorDetails.errors[0].details)}`;
      }
      
      notificationResult.reason = detailedReason;
      
      // Log FULL error details for server-side diagnosis
      console.error('[Final Approval] Amazon preview notification error - COMPLETE DIAGNOSTICS:', {
        message: errorMessage,
        code: errorCode,
        status: error?.status,
        path: errorPath,
        url: errorUrl,
        details: errorDetails,
        fullError: error,
        stack: error?.stack
      });
    }
  }

  return NextResponse.json({
    success: true,
    message: tokenCreated
      ? 'Final approval recorded and preview token generated.'
      : 'Final approval already recorded; reusing existing preview token.',
    orderId,
    token: previewToken.token,
    previewUrl,
    requestedAt,
    tokenCreated,
    order: mappedOrder,
    notification: notificationResult
  });
}

export const POST = withErrorHandling(handleFinalApproval);

