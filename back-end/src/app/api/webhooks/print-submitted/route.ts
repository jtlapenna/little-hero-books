/**
 * Print-Submitted Webhook
 *
 * POST /api/webhooks/print-submitted
 *
 * Called by n8n W4 (Print Fulfillment) after Lulu has accepted the job (lulu_job_id set).
 * 1. Updates Supabase: execution_status = 'done', print_submitted_at = now (so the order
 *    no longer shows as "Not Picked Up" and we have a submitted timestamp).
 * 2. Sends the customer a "your book has been sent to print" message (Amazon Message Center
 *    or D2C email).
 *
 * Auth: Bearer token (same as other workflow webhooks).
 * Body: { orderId: string } (amazon_order_id from W4 payload).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { updateOrderStatus } from '@/lib/status-service';
import { getActivePreviewToken, getPreviewTokenForOrderLink } from '@/lib/preview-tokens';
import {
  sendAmazonPrintSubmittedMessage,
  getAmazonOrderIdForMessaging,
} from '@/lib/notifications/amazon-message-center';
import { sendD2CPrintSubmittedEmail } from '@/lib/notifications/d2c-email';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
});

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = PayloadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { orderId } = parseResult.data;

    const order = await getOrderFromSupabase(orderId).catch(() => null);
    if (!order) {
      return NextResponse.json(
        { error: 'Order not found', orderId },
        { status: 404 }
      );
    }

    // Update Supabase so the order is no longer "ready_for_processing" and we have a submitted timestamp.
    // This prevents the order from showing as "Not Picked Up" and ensures print_submitted_at is set
    // even if W4's Supabase PATCH didn't include it.
    const nowIso = new Date().toISOString();
    await updateOrderStatus(orderId, {
      execution_status: 'done',
      print_submitted_at: nowIso,
      started_at: null,
      current_workflow: null,
    }).catch((err) => {
      console.error('[print-submitted] Failed to update order status:', err?.message ?? err);
      // Continue to send notification even if status update fails
    });

    // Prefer an unused token; fall back to any non-expired token (used is OK — same link works for viewing status/shipping).
    let token = await getActivePreviewToken(orderId);
    if (!token) token = await getPreviewTokenForOrderLink(orderId);
    if (!token) {
      // Supabase already updated above. No non-expired token; skip notification.
      console.warn('[print-submitted] No non-expired preview token for order', orderId, '- skipping customer notification');
      return NextResponse.json({
        success: true,
        orderId,
        skipped: true,
        reason: 'No non-expired preview token; customer notification skipped',
      });
    }

    const customerSiteUrl =
      (process.env.CUSTOMER_SITE_URL ?? '').replace(/\/+$/, '') ||
      (process.env.VERCEL_ENV === 'production'
        ? 'https://littleherolabs.com'
        : 'http://localhost:4321');
    const previewUrl = `${customerSiteUrl}/approve/${token.token}`;

    const childName =
      (order as any).character_specs?.childName ??
      (order as any).character_specs?.child_name;

    const platform = ((order as any).platform ?? 'amazon') as string;
    const orderIdentifier = (order as any).orderId ?? (order as any).amazon_order_id ?? orderId;

    if (platform === 'd2c') {
      const email = (order as any).customer_email?.trim();
      if (!email) {
        return NextResponse.json(
          { error: 'D2C order missing customer_email', orderId },
          { status: 400 }
        );
      }
      const result = await sendD2CPrintSubmittedEmail({
        to: email,
        previewUrl,
        childName,
        orderId: orderIdentifier,
      });
      if (!result.success) {
        return NextResponse.json(
          { error: 'D2C print-submitted email failed', details: result.error, orderId },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        orderId: orderIdentifier,
        channel: 'email',
        messageId: result.messageId,
      });
    }

    // Amazon (or non-d2c)
    // Enable if env var is 'true' OR if running in production (Vercel env var fallback)
    const envValue = (process.env.AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase();
    const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    const enabled = envValue === 'true' || isProduction;
    
    if (!enabled) {
      return NextResponse.json({
        success: true,
        orderId: orderIdentifier,
        skipped: true,
        reason: `AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED is not set to true (envValue=${envValue || 'undefined'}, isProduction=${isProduction})`,
      });
    }

    const amazonOrderId = getAmazonOrderIdForMessaging(order as any);
    if (!amazonOrderId) {
      return NextResponse.json(
        { error: 'Order has no amazon_order_id for messaging', orderId },
        { status: 400 }
      );
    }

    const result = await sendAmazonPrintSubmittedMessage({
      amazonOrderId,
      previewUrl,
      childName,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Amazon print-submitted message failed', details: result.error, orderId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: orderIdentifier,
      channel: 'amazon_message',
      messageId: result.messageId,
    });
  } catch (err: any) {
    console.error('[print-submitted] Error:', err?.message ?? err);
    return NextResponse.json(
      { error: 'Internal server error', details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
