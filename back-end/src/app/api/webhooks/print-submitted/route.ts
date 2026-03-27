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
import { recordWorkflowJobEventResponse } from '@/app/api/internal/workflow-jobs/log-event/route';
import { completeW4PrintJobForOrder, completeW4SiblingJobForGroup } from '@/lib/workflow-jobs';
import { getActivePreviewToken, getPreviewTokenForOrderLink } from '@/lib/preview-tokens';
import {
  sendAmazonPrintSubmittedMessage,
  getAmazonOrderIdForMessaging,
} from '@/lib/notifications/amazon-message-center';
import { sendD2CPrintSubmittedEmail } from '@/lib/notifications/d2c-email';

export const dynamic = 'force-dynamic';

const WorkflowMetadataSchema = z.object({
  workflowJobId: z.number().int().positive().nullable().optional(),
  workflowJobIdempotencyKey: z.string().trim().min(1).nullable().optional(),
  workflowAttemptId: z.number().int().positive().nullable().optional(),
  rootGroupId: z.string().trim().min(1).nullable().optional(),
  submitMode: z.enum(['sandbox', 'skip', 'production']).or(z.string().trim().min(1)).nullable().optional(),
  __skipLulu: z.boolean().optional(),
  guard: z.record(z.string(), z.unknown()).nullable().optional(),
  luluJobId: z.union([z.string().trim().min(1), z.number()]).nullable().optional(),
  luluStatus: z.union([z.string().trim().min(1), z.record(z.string(), z.unknown())]).nullable().optional(),
  manifestUrl: z.string().trim().min(1).nullable().optional(),
  manifestKey: z.string().trim().min(1).nullable().optional(),
});
const SinglePayloadSchema = WorkflowMetadataSchema.extend({ orderId: z.string().min(1) });
const MultiPayloadSchema = WorkflowMetadataSchema.extend({ orderIds: z.array(z.string().min(1)).min(1) });
const PayloadSchema = z.union([SinglePayloadSchema, MultiPayloadSchema]);

type PrintSubmittedPayload = z.infer<typeof PayloadSchema>;
type PrintSubmittedResult = {
  orderId: string;
  success: boolean;
  channel?: string;
  messageId?: string;
  skipped?: boolean;
  error?: string;
  nonProduction?: boolean;
  submitMode?: string | null;
};

type PrintSubmittedDependencies = {
  getOrder: typeof getOrderFromSupabase;
  updateOrderStatus: typeof updateOrderStatus;
  getActivePreviewToken: typeof getActivePreviewToken;
  getPreviewTokenForOrderLink: typeof getPreviewTokenForOrderLink;
  sendAmazonPrintSubmittedMessage: typeof sendAmazonPrintSubmittedMessage;
  sendD2CPrintSubmittedEmail: typeof sendD2CPrintSubmittedEmail;
  recordWorkflowJobEvent: typeof recordWorkflowJobEventResponse;
  completeW4PrintJobForOrder: typeof completeW4PrintJobForOrder;
  completeW4SiblingJobForGroup: typeof completeW4SiblingJobForGroup;
};

const defaultDependencies: PrintSubmittedDependencies = {
  getOrder: getOrderFromSupabase,
  updateOrderStatus,
  getActivePreviewToken,
  getPreviewTokenForOrderLink,
  sendAmazonPrintSubmittedMessage,
  sendD2CPrintSubmittedEmail,
  recordWorkflowJobEvent: recordWorkflowJobEventResponse,
  completeW4PrintJobForOrder,
  completeW4SiblingJobForGroup,
};

type PrintSubmittedOrder = {
  orderId?: string | null;
  amazon_order_id?: string | null;
  platform?: string | null;
  customer_email?: string | null;
  character_specs?: {
    childName?: string | null;
    child_name?: string | null;
  } | null;
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSubmitMode(value: unknown): string | null {
  return toTrimmedString(value)?.toLowerCase() ?? null;
}

function toJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function normalizeLuluStatus(value: unknown): { status: string | null; detail: JsonRecord | null } {
  const direct = toTrimmedString(value);
  if (direct) {
    return { status: direct, detail: null };
  }

  const detail = toJsonRecord(value);
  if (!detail) {
    return { status: null, detail: null };
  }

  const status =
    toTrimmedString(detail.name) ??
    toTrimmedString(detail.status) ??
    toTrimmedString(detail.state) ??
    null;

  return { status, detail };
}

function isNonProductionSubmit(payload: PrintSubmittedPayload): boolean {
  const submitMode = normalizeSubmitMode(payload.submitMode);
  const guardReason = normalizeSubmitMode(payload.guard?.reason);

  if (submitMode && submitMode !== 'production') {
    return true;
  }

  if (payload.__skipLulu) {
    return true;
  }

  return ['sandbox', 'test_mode', 'existing_job'].includes(guardReason ?? '');
}

function payloadRootGroupId(payload: PrintSubmittedPayload): string | null {
  return toTrimmedString(payload.rootGroupId);
}

function shouldUseSiblingCompletionFallback(payload: PrintSubmittedPayload): boolean {
  return !payload.workflowJobId &&
    !toTrimmedString(payload.workflowJobIdempotencyKey) &&
    'orderIds' in payload &&
    payload.orderIds.length > 1 &&
    Boolean(payloadRootGroupId(payload));
}

async function markW4PrintJobSubmitted(
  orderId: string,
  payload: PrintSubmittedPayload,
  nonProduction: boolean,
  dependencies: PrintSubmittedDependencies,
): Promise<void> {
  const workflowJobId = payload.workflowJobId ?? null;
  const workflowJobIdempotencyKey = toTrimmedString(payload.workflowJobIdempotencyKey);
  const workflowAttemptId = payload.workflowAttemptId ?? null;
  const submitMode = normalizeSubmitMode(payload.submitMode);
  const luluJobId = toTrimmedString(payload.luluJobId);
  const { status: luluStatus, detail: luluStatusDetail } = normalizeLuluStatus(payload.luluStatus);
  const manifestUrl = toTrimmedString(payload.manifestUrl);
  const manifestKey = toTrimmedString(payload.manifestKey);

  if (workflowJobId || workflowJobIdempotencyKey) {
    await dependencies.recordWorkflowJobEvent({
      jobId: workflowJobId ?? undefined,
      idempotencyKey: workflowJobIdempotencyKey ?? undefined,
      attemptId: workflowAttemptId,
      eventType: 'completed',
      jobStatus: 'succeeded',
      attemptStatus: 'succeeded',
      externalProvider: nonProduction ? 'lulu-sandbox' : 'lulu',
      resultSnapshot: {
        orderId,
        submitMode,
        nonProduction,
        manifestUrl,
        manifestKey,
        luluJobId,
        luluStatus,
        luluStatusDetail,
      },
      payload: {
        orderId,
        submitMode,
        nonProduction,
        manifestUrl,
        manifestKey,
        luluJobId,
        luluStatus,
        luluStatusDetail,
      },
      context: {
        orderId,
        submitMode,
        nonProduction,
      },
    });
    return;
  }

  if (shouldUseSiblingCompletionFallback(payload)) {
    await dependencies.completeW4SiblingJobForGroup({
      rootGroupId: payloadRootGroupId(payload) ?? orderId,
      orderIds: 'orderIds' in payload ? payload.orderIds : [orderId],
      submitMode,
      manifestUrl,
      manifestKey,
      luluJobId,
      luluStatus,
    });
    return;
  }

  await dependencies.completeW4PrintJobForOrder({
    orderId,
    submitMode,
    manifestUrl,
    manifestKey,
    luluJobId,
    luluStatus,
  });
}

export async function handlePrintSubmitted(
  body: unknown,
  dependencies: PrintSubmittedDependencies = defaultDependencies,
) {
  const parseResult = PayloadSchema.safeParse(body);
  if (!parseResult.success) {
    return {
      ok: false as const,
      status: 400,
      body: { error: 'Invalid payload', issues: parseResult.error.issues },
    };
  }

  const payload = parseResult.data;
  const orderIds = 'orderIds' in payload ? payload.orderIds : [payload.orderId];
  const nonProduction = isNonProductionSubmit(payload);
  const submitMode = normalizeSubmitMode(payload.submitMode);
  const hasSharedWorkflowMetadata = Boolean(
    payload.workflowJobId || toTrimmedString(payload.workflowJobIdempotencyKey),
  );
  const usesSiblingFallback = shouldUseSiblingCompletionFallback(payload);
  const markWorkflowOnce = hasSharedWorkflowMetadata || usesSiblingFallback;
  const results: PrintSubmittedResult[] = [];
  const customerSiteUrl =
    (process.env.CUSTOMER_SITE_URL ?? '').replace(/\/+$/, '') ||
    (process.env.VERCEL_ENV === 'production'
      ? 'https://littleherolabs.com'
      : 'http://localhost:4321');
  let sharedWorkflowMarked = false;

  for (const orderId of orderIds) {
    const order = await dependencies.getOrder(orderId).catch(() => null) as PrintSubmittedOrder | null;
    if (!order) {
      results.push({ orderId, success: false, error: 'Order not found' });
      continue;
    }

    if (!markWorkflowOnce || !sharedWorkflowMarked) {
      try {
        await markW4PrintJobSubmitted(orderId, payload, nonProduction, dependencies);
        if (markWorkflowOnce) {
          sharedWorkflowMarked = true;
        }
      } catch (workflowJobError) {
        console.warn(
          `[print-submitted] Non-fatal: failed to mark W4 workflow job complete for ${orderId}:`,
          workflowJobError,
        );
      }
    }

    if (nonProduction) {
      console.info('[print-submitted] Recorded non-production W4 completion', {
        orderId,
        submitMode,
        workflowJobId: payload.workflowJobId ?? null,
        workflowAttemptId: payload.workflowAttemptId ?? null,
      });
      results.push({
        orderId,
        success: true,
        skipped: true,
        nonProduction: true,
        submitMode,
      });
      continue;
    }

    const nowIso = new Date().toISOString();
    await dependencies.updateOrderStatus(orderId, {
      execution_status: 'done',
      print_submitted_at: nowIso,
      started_at: null,
      current_workflow: null,
    }).catch((err) => {
      console.error('[print-submitted] Failed to update order status:', err?.message ?? err);
    });

    let token = await dependencies.getActivePreviewToken(orderId);
    if (!token) token = await dependencies.getPreviewTokenForOrderLink(orderId);
    if (!token) {
      console.warn('[print-submitted] No non-expired preview token for order', orderId);
      results.push({ orderId, success: true, skipped: true, submitMode });
      continue;
    }

    const previewUrl = `${customerSiteUrl}/approve/${token.token}`;
    const childName = order.character_specs?.childName ?? order.character_specs?.child_name ?? undefined;
    const platform = order.platform ?? 'amazon';
    const orderIdentifier = order.orderId ?? order.amazon_order_id ?? orderId;

    if (platform === 'd2c') {
      const email = order.customer_email?.trim();
      if (!email) {
        results.push({ orderId, success: false, error: 'D2C order missing customer_email' });
        continue;
      }
      const r = await dependencies.sendD2CPrintSubmittedEmail({
        to: email,
        previewUrl,
        childName,
        orderId: orderIdentifier,
      });
      results.push(
        r.success
          ? { orderId: orderIdentifier, success: true, channel: 'email', messageId: r.messageId, submitMode }
          : { orderId, success: false, error: r.error, submitMode },
      );
      continue;
    }

    const envValue = (process.env.AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase();
    const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    const enabled = envValue === 'true' || isProduction;
    if (!enabled) {
      results.push({ orderId: orderIdentifier, success: true, skipped: true, submitMode });
      continue;
    }

    const amazonOrderId = getAmazonOrderIdForMessaging(order);
    if (!amazonOrderId) {
      results.push({ orderId, success: false, error: 'No amazon_order_id for messaging' });
      continue;
    }

    const r = await dependencies.sendAmazonPrintSubmittedMessage({ amazonOrderId, previewUrl, childName });
    results.push(
      r.success
        ? { orderId: orderIdentifier, success: true, channel: 'amazon_message', messageId: r.messageId, submitMode }
        : { orderId, success: false, error: r.error, submitMode },
    );
  }

  if (results.length === 1) {
    const r = results[0];
    if (!r.success && r.error) {
      const status = r.error === 'Order not found' ? 404 : r.error.includes('customer_email') || r.error.includes('amazon_order_id') ? 400 : 500;
      return {
        ok: false as const,
        status,
        body: { error: r.error, orderId: r.orderId },
      };
    }

    return {
      ok: true as const,
      status: 200,
      body: {
        success: true,
        orderId: r.orderId,
        channel: r.channel,
        messageId: r.messageId,
        skipped: r.skipped,
        nonProduction: r.nonProduction,
        submitMode: r.submitMode ?? null,
      },
    };
  }

  return {
    ok: true as const,
    status: 200,
    body: { success: true, results },
  };
}

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const response = await handlePrintSubmitted(body);
    return NextResponse.json(response.body, { status: response.status });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error('[print-submitted] Error:', details);
    return NextResponse.json(
      { error: 'Internal server error', details },
      { status: 500 }
    );
  }
}
