import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createNotFoundError, createValidationError } from '@/lib/error-handler';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { ensureActivePreviewToken } from '@/lib/preview-tokens';
import { updateOrderStatus } from '@/lib/status-service';
import { ReviewStageStatus } from '@/constants/statuses';
import { mapSupabaseOrderToOrder } from '@/lib/order-mapper';
import { sendAmazonPreviewMessage } from '@/lib/notifications/amazon-message-center';

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

  const notificationsEnabled =
    process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED === 'true';
  
  // Debug logging for configuration
  console.log('[Final Approval] Amazon messaging config check:', {
    envVar: process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED,
    enabled: notificationsEnabled,
    type: typeof process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED
  });

  const amazonOrderId =
    orderRecord.amazon_order_id ||
    orderRecord.orderId ||
    orderRecord.order_id ||
    orderId;

  let notificationResult: {
    attempted: boolean;
    sent: boolean;
    reason?: string;
    response?: unknown;
  } = {
    attempted: false,
    sent: false
  };

  if (!notificationsEnabled) {
    notificationResult.reason =
      `Amazon preview messaging disabled by configuration. (AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=${process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED || 'not set'})`;
  } else if (!amazonOrderId) {
    notificationResult.reason = 'Order is missing amazon_order_id.';
  } else if (!mappedOrder) {
    notificationResult.reason = 'Unable to map order for notification.';
  } else if (!tokenCreated) {
    notificationResult.reason =
      'Preview token already active; skipping new notification.';
  } else {
    notificationResult.attempted = true;

    try {
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

      const now = new Date().toISOString();
      await supabase
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
        .catch((error) => {
          console.error(
            '[Final Approval] Failed to log Amazon notification:',
            error
          );
        });
    } catch (error: any) {
      notificationResult.sent = false;
      notificationResult.reason =
        error?.message || 'Failed to send Amazon notification.';
      console.error(
        '[Final Approval] Amazon preview notification error:',
        error
      );
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

