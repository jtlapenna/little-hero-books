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
 * Body: { orderId: string } | { orderIds: string[] } (single order or sibling group).
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

const SinglePayloadSchema = z.object({ orderId: z.string().min(1) });
const MultiPayloadSchema = z.object({ orderIds: z.array(z.string().min(1)).min(1) });
const PayloadSchema = z.union([SinglePayloadSchema, MultiPayloadSchema]);

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

    const orderIds = 'orderIds' in parseResult.data
      ? parseResult.data.orderIds
      : [parseResult.data.orderId];

    const results: Array<{ orderId: string; success: boolean; channel?: string; messageId?: string; skipped?: boolean; error?: string }> = [];
    const customerSiteUrl =
      (process.env.CUSTOMER_SITE_URL ?? '').replace(/\/+$/, '') ||
      (process.env.VERCEL_ENV === 'production'
        ? 'https://littleherolabs.com'
        : 'http://localhost:4321');

    for (const orderId of orderIds) {
      const order = await getOrderFromSupabase(orderId).catch(() => null);
      if (!order) {
        results.push({ orderId, success: false, error: 'Order not found' });
        continue;
      }

      const nowIso = new Date().toISOString();
      await updateOrderStatus(orderId, {
        execution_status: 'done',
        print_submitted_at: nowIso,
        started_at: null,
        current_workflow: null,
      }).catch((err) => {
        console.error('[print-submitted] Failed to update order status:', err?.message ?? err);
      });

      let token = await getActivePreviewToken(orderId);
      if (!token) token = await getPreviewTokenForOrderLink(orderId);
      if (!token) {
        console.warn('[print-submitted] No non-expired preview token for order', orderId);
        results.push({ orderId, success: true, skipped: true });
        continue;
      }

      const previewUrl = `${customerSiteUrl}/approve/${token.token}`;
      const childName = (order as any).character_specs?.childName ?? (order as any).character_specs?.child_name;
      const platform = ((order as any).platform ?? 'amazon') as string;
      const orderIdentifier = (order as any).orderId ?? (order as any).amazon_order_id ?? orderId;

      if (platform === 'd2c') {
        const email = (order as any).customer_email?.trim();
        if (!email) {
          results.push({ orderId, success: false, error: 'D2C order missing customer_email' });
          continue;
        }
        const r = await sendD2CPrintSubmittedEmail({ to: email, previewUrl, childName, orderId: orderIdentifier });
        results.push(r.success ? { orderId: orderIdentifier, success: true, channel: 'email', messageId: r.messageId } : { orderId, success: false, error: r.error });
        continue;
      }

      const envValue = (process.env.AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase();
      const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
      const enabled = envValue === 'true' || isProduction;
      if (!enabled) {
        results.push({ orderId: orderIdentifier, success: true, skipped: true });
        continue;
      }

      const amazonOrderId = getAmazonOrderIdForMessaging(order as any);
      if (!amazonOrderId) {
        results.push({ orderId, success: false, error: 'No amazon_order_id for messaging' });
        continue;
      }

      const r = await sendAmazonPrintSubmittedMessage({ amazonOrderId, previewUrl, childName });
      results.push(r.success ? { orderId: orderIdentifier, success: true, channel: 'amazon_message', messageId: r.messageId } : { orderId, success: false, error: r.error });
    }

    // Single order: preserve original response shape for backwards compatibility
    if (results.length === 1) {
      const r = results[0];
      if (!r.success && r.error) {
        const status = r.error === 'Order not found' ? 404 : r.error.includes('customer_email') || r.error.includes('amazon_order_id') ? 400 : 500;
        return NextResponse.json({ error: r.error, orderId: r.orderId }, { status });
      }
      return NextResponse.json({
        success: true,
        orderId: r.orderId,
        channel: r.channel,
        messageId: r.messageId,
        skipped: r.skipped,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error('[print-submitted] Error:', err?.message ?? err);
    return NextResponse.json(
      { error: 'Internal server error', details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
