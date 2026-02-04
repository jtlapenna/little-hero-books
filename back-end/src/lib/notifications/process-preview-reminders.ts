/**
 * Process preview reminders: send reminder-day-1, reminder-day-2, or auto-approval
 * message via Amazon Message Center for orders in "pending" approval.
 *
 * Designed to run from the router cron (no extra Vercel cron needed).
 * Uses PREVIEW_AUTO_APPROVAL_HOURS (default 72) for 24h / 48h / 72h buckets.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getActivePreviewToken } from '@/lib/preview-tokens';
import { sendAmazonPreviewMessage, getAmazonOrderIdForMessaging } from '@/lib/notifications/amazon-message-center';
import { sendD2CPreviewEmail } from '@/lib/notifications/d2c-email';
import { updateOrderInSupabase } from '@/lib/supabase-client';

const REMINDER_HOURS_DAY_1 = 24;
const REMINDER_HOURS_DAY_2 = 48;

export interface ProcessPreviewRemindersResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: string[];
  debug: {
    ordersFound: number;
    amazonNotificationsEnabled: boolean;
    skippedReasons: Record<string, number>;
  };
}

function getOrderId(row: any): string {
  return (
    row.order_id ??
    row.orderId ??
    (row.id != null ? String(row.id) : '')
  );
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
  
  const amazonNotificationsEnabled =
    (process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase() === 'true' ||
    process.env.VERCEL_ENV === 'production';

  const skippedReasons: Record<string, number> = {};
  const addSkipReason = (reason: string) => {
    skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
  };

  const result: ProcessPreviewRemindersResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: [],
    debug: {
      ordersFound: 0,
      amazonNotificationsEnabled,
      skippedReasons,
    },
  };

  // Log config for debugging
  console.log('[Preview Reminders] Config:', {
    amazonNotificationsEnabled,
    effectiveHours,
    AMAZON_PREVIEW_NOTIFICATIONS_ENABLED: process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });

  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, order_id, orderId, amazon_order_id, product_info, platform, customer_email, customer_approval_requested_at, preview_reminder_sent, character_specs, revision_count')
    .eq('customer_approval_status', 'pending')
    .not('customer_approval_requested_at', 'is', null);

  if (fetchError) {
    result.errors.push(`Fetch pending orders: ${fetchError.message}`);
    return result;
  }

  result.debug.ordersFound = orders?.length ?? 0;
  console.log(`[Preview Reminders] Found ${result.debug.ordersFound} orders pending approval`);

  if (!orders?.length) return result;

  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const customerSiteUrl =
    (process.env.CUSTOMER_SITE_URL ?? '').replace(/\/+$/, '') ||
    (isProduction ? 'https://littleherolabs.com' : 'http://localhost:4321');

  const platform = (row: (typeof orders)[number]) => (row.platform ?? 'amazon') as string;
  const isD2C = (r: (typeof orders)[number]) => platform(r) === 'd2c';

  for (const row of orders) {
    result.processed += 1;
    const requestedAt = row.customer_approval_requested_at;
    const orderId = getOrderId(row);
    
    if (!requestedAt) {
      addSkipReason('no_requested_at');
      result.skipped += 1;
      continue;
    }

    const requested = new Date(requestedAt).getTime();
    const now = Date.now();
    const hoursSince = (now - requested) / (1000 * 60 * 60);

    const amazonOrderId = getAmazonOrderIdForMessaging(row);
    const childName = getChildName(row);
    const sent = row.preview_reminder_sent ?? null;
    const d2c = isD2C(row);

    console.log(`[Preview Reminders] Order ${orderId}: platform=${d2c ? 'd2c' : 'amazon'}, hoursSince=${hoursSince.toFixed(1)}, sent=${sent}, amazonOrderId=${amazonOrderId}`);

    const token = await getActivePreviewToken(orderId);
    if (!token) {
      result.errors.push(`Order ${orderId}: no active preview token`);
      addSkipReason('no_token');
      result.skipped += 1;
      continue;
    }

    const previewUrl = `${customerSiteUrl}/approve/${token.token}`;
    const revisionsRemaining = Math.max(0, 2 - (row.revision_count ?? 0));

    try {
      // Auto-approval tier (72h default)
      if (hoursSince >= effectiveHours) {
        if (sent === 'auto-approval') {
          addSkipReason('already_sent_auto_approval');
          result.skipped += 1;
          continue;
        }
        if (d2c) {
          if (!row.customer_email?.trim()) {
            result.errors.push(`Order ${orderId}: D2C order missing customer_email`);
            continue;
          }
          const response = await sendD2CPreviewEmail({
            to: row.customer_email.trim(),
            previewUrl,
            childName,
            reminderType: 'auto-approval',
            orderId,
          });
          if (response.success) {
            result.sent += 1;
            await updateOrderInSupabase(orderId, {
              preview_reminder_sent: 'auto-approval',
              updated_at: new Date().toISOString(),
            });
          } else {
            result.errors.push(`Order ${orderId} auto-approval email: ${response.error}`);
          }
        } else if (amazonOrderId && amazonNotificationsEnabled) {
          console.log(`[Preview Reminders] Order ${orderId}: sending auto-approval Amazon message`);
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
        } else if (!d2c && !amazonNotificationsEnabled) {
          addSkipReason('amazon_notifications_disabled');
          result.skipped += 1;
          console.log(`[Preview Reminders] Order ${orderId}: SKIPPED - Amazon notifications disabled`);
        } else if (!d2c && !amazonOrderId) {
          addSkipReason('no_amazon_order_id');
          result.skipped += 1;
          result.errors.push(`Order ${orderId}: Amazon order but no amazon_order_id`);
        }
        continue;
      }

      // Day-2 reminder tier (48h)
      if (hoursSince >= REMINDER_HOURS_DAY_2) {
        if (sent === 'reminder-day-2' || sent === 'auto-approval') {
          addSkipReason('already_sent_day2_or_auto');
          result.skipped += 1;
          continue;
        }
        if (d2c) {
          if (!row.customer_email?.trim()) {
            result.errors.push(`Order ${orderId}: D2C order missing customer_email`);
            continue;
          }
          const response = await sendD2CPreviewEmail({
            to: row.customer_email.trim(),
            previewUrl,
            childName,
            reminderType: 'reminder-day-2',
            orderId,
          });
          if (response.success) {
            result.sent += 1;
            await updateOrderInSupabase(orderId, {
              preview_reminder_sent: 'reminder-day-2',
              updated_at: new Date().toISOString(),
            });
          } else {
            result.errors.push(`Order ${orderId} reminder-day-2 email: ${response.error}`);
          }
        } else if (amazonOrderId && amazonNotificationsEnabled) {
          console.log(`[Preview Reminders] Order ${orderId}: sending reminder-day-2 Amazon message`);
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
        } else if (!d2c && !amazonNotificationsEnabled) {
          addSkipReason('amazon_notifications_disabled');
          result.skipped += 1;
          console.log(`[Preview Reminders] Order ${orderId}: SKIPPED - Amazon notifications disabled`);
        } else if (!d2c && !amazonOrderId) {
          addSkipReason('no_amazon_order_id');
          result.skipped += 1;
          result.errors.push(`Order ${orderId}: Amazon order but no amazon_order_id`);
        }
        continue;
      }

      // Day-1 reminder tier (24h)
      if (hoursSince >= REMINDER_HOURS_DAY_1) {
        if (sent != null && sent !== '') {
          addSkipReason('already_sent_any');
          result.skipped += 1;
          continue;
        }
        if (d2c) {
          if (!row.customer_email?.trim()) {
            result.errors.push(`Order ${orderId}: D2C order missing customer_email`);
            continue;
          }
          const response = await sendD2CPreviewEmail({
            to: row.customer_email.trim(),
            previewUrl,
            childName,
            reminderType: 'reminder-day-1',
            orderId,
          });
          if (response.success) {
            result.sent += 1;
            await updateOrderInSupabase(orderId, {
              preview_reminder_sent: 'reminder-day-1',
              updated_at: new Date().toISOString(),
            });
          } else {
            result.errors.push(`Order ${orderId} reminder-day-1 email: ${response.error}`);
          }
        } else if (amazonOrderId && amazonNotificationsEnabled) {
          console.log(`[Preview Reminders] Order ${orderId}: sending reminder-day-1 Amazon message`);
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
        } else if (!d2c && !amazonNotificationsEnabled) {
          addSkipReason('amazon_notifications_disabled');
          result.skipped += 1;
          console.log(`[Preview Reminders] Order ${orderId}: SKIPPED - Amazon notifications disabled`);
        } else if (!d2c && !amazonOrderId) {
          addSkipReason('no_amazon_order_id');
          result.skipped += 1;
          result.errors.push(`Order ${orderId}: Amazon order but no amazon_order_id`);
        }
      } else {
        // Less than 24 hours since approval requested
        addSkipReason('under_24h');
        result.skipped += 1;
      }
    } catch (err: any) {
      result.errors.push(`Order ${orderId}: ${err?.message ?? err}`);
    }
  }

  console.log('[Preview Reminders] Summary:', {
    processed: result.processed,
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.length,
    skippedReasons: result.debug.skippedReasons,
  });

  return result;
}
