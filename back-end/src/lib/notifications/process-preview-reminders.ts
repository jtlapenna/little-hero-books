/**
 * Process preview reminders: send reminder-day-1, reminder-day-2, or auto-approval
 * message via Amazon Message Center for orders in "pending" approval.
 *
 * Designed to run from the router cron (no extra Vercel cron needed).
 * Uses PREVIEW_AUTO_APPROVAL_HOURS (default 72) for 24h / 48h / 72h buckets.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getActivePreviewToken } from '@/lib/preview-tokens';
import { sendAmazonPreviewMessage } from '@/lib/notifications/amazon-message-center';
import { updateOrderInSupabase } from '@/lib/supabase-client';

const REMINDER_HOURS_DAY_1 = 24;
const REMINDER_HOURS_DAY_2 = 48;

export interface ProcessPreviewRemindersResult {
  processed: number;
  sent: number;
  errors: string[];
}

function getOrderId(row: any): string {
  return (
    row.order_id ??
    row.orderId ??
    (row.id != null ? String(row.id) : '')
  );
}

function getAmazonOrderId(row: any): string {
  return row.amazon_order_id ?? getOrderId(row);
}

function getChildName(row: any): string | undefined {
  const cs = row.character_specs;
  if (!cs || typeof cs !== 'object') return undefined;
  return cs.childName ?? cs.child_name;
}

export async function processPreviewReminders(
  supabase: SupabaseClient,
  options?: { autoApprovalHours?: number }
): Promise<ProcessPreviewRemindersResult> {
  const hoursFromEnv = parseInt(String(process.env.PREVIEW_AUTO_APPROVAL_HOURS || '72'), 10);
  const effectiveHours = Number.isFinite(options?.autoApprovalHours)
    ? options!.autoApprovalHours!
    : Number.isFinite(hoursFromEnv)
      ? hoursFromEnv
      : 72;
  const result: ProcessPreviewRemindersResult = { processed: 0, sent: 0, errors: [] };
  const notificationsEnabled =
    (process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase() === 'true' ||
    process.env.VERCEL_ENV === 'production';
  if (!notificationsEnabled) {
    return result;
  }

  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, order_id, orderId, amazon_order_id, customer_approval_requested_at, preview_reminder_sent, character_specs, revision_count')
    .eq('customer_approval_status', 'pending')
    .not('customer_approval_requested_at', 'is', null);

  if (fetchError) {
    result.errors.push(`Fetch pending orders: ${fetchError.message}`);
    return result;
  }

  if (!orders?.length) return result;

  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const customerSiteUrl =
    (process.env.CUSTOMER_SITE_URL ?? '').replace(/\/+$/, '') ||
    (isProduction ? 'https://littleherolabs.com' : 'http://localhost:4321');

  for (const row of orders) {
    result.processed += 1;
    const requestedAt = row.customer_approval_requested_at;
    if (!requestedAt) continue;

    const requested = new Date(requestedAt).getTime();
    const now = Date.now();
    const hoursSince = (now - requested) / (1000 * 60 * 60);

    const orderId = getOrderId(row);
    const amazonOrderId = getAmazonOrderId(row);
    const childName = getChildName(row);
    const sent = row.preview_reminder_sent ?? null;

    const token = await getActivePreviewToken(orderId);
    if (!token) {
      result.errors.push(`Order ${orderId}: no active preview token`);
      continue;
    }

    const previewUrl = `${customerSiteUrl}/approve/${token.token}`;
    const revisionsRemaining = Math.max(0, 2 - (row.revision_count ?? 0));

    try {
      if (hoursSince >= effectiveHours) {
        if (sent === 'auto-approval') continue;
        // Send auto-approval message (actual auto-approval workflow can be added separately)
        const response = await sendAmazonPreviewMessage({
          amazonOrderId,
          reminderType: 'auto-approval',
          previewUrl,
          childName,
          revisionsRemaining,
        });
        if (response.success) {
          result.sent += 1;
          await updateOrderInSupabase(orderId, {
            preview_reminder_sent: 'auto-approval',
            updated_at: new Date().toISOString(),
          });
        } else {
          result.errors.push(`Order ${orderId} auto-approval message: ${response.error}`);
        }
        continue;
      }

      if (hoursSince >= REMINDER_HOURS_DAY_2) {
        if (sent === 'reminder-day-2' || sent === 'auto-approval') continue;
        const response = await sendAmazonPreviewMessage({
          amazonOrderId,
          reminderType: 'reminder-day-2',
          previewUrl,
          childName,
          revisionsRemaining,
        });
        if (response.success) {
          result.sent += 1;
          await updateOrderInSupabase(orderId, {
            preview_reminder_sent: 'reminder-day-2',
            updated_at: new Date().toISOString(),
          });
        } else {
          result.errors.push(`Order ${orderId} reminder-day-2: ${response.error}`);
        }
        continue;
      }

      if (hoursSince >= REMINDER_HOURS_DAY_1) {
        if (sent != null && sent !== '') continue;
        const response = await sendAmazonPreviewMessage({
          amazonOrderId,
          reminderType: 'reminder-day-1',
          previewUrl,
          childName,
          revisionsRemaining,
        });
        if (response.success) {
          result.sent += 1;
          await updateOrderInSupabase(orderId, {
            preview_reminder_sent: 'reminder-day-1',
            updated_at: new Date().toISOString(),
          });
        } else {
          result.errors.push(`Order ${orderId} reminder-day-1: ${response.error}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`Order ${orderId}: ${err?.message ?? err}`);
    }
  }

  return result;
}
