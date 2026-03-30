/**
 * Print-QA-Failed Webhook
 *
 * POST /api/webhooks/print-qa-failed
 * Safety-net endpoint that marks an order with print_qa_failed status metadata.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { updateOrderStatus } from '@/lib/status-service';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  reasonCode: z.string().optional(),
  reason: z.string().optional(),
  failedPages: z.array(z.number()).optional(),
});

type PrintQaFailedDependencies = {
  getOrder: typeof getOrderFromSupabase;
  updateOrderStatus: typeof updateOrderStatus;
};

const defaultDependencies: PrintQaFailedDependencies = {
  getOrder: getOrderFromSupabase,
  updateOrderStatus,
};

type PrintQaFailedPayload = z.infer<typeof PayloadSchema>;

export async function handlePrintQaFailed(
  payload: PrintQaFailedPayload,
  dependencies: PrintQaFailedDependencies = defaultDependencies,
) {
  const { orderId, reasonCode, reason, failedPages } = payload;
  const order = await dependencies.getOrder(orderId).catch(() => null);
  if (!order) {
    return {
      ok: false as const,
      status: 404,
      body: { error: 'Order not found', orderId },
    };
  }

  const pagesLabel = Array.isArray(failedPages) && failedPages.length ? failedPages.join(', ') : 'n/a';
  const summary = `Print QA failed (${reasonCode || 'unknown'}): ${reason || 'no reason provided'}; pages=${pagesLabel}`;

  await dependencies.updateOrderStatus(orderId, {
    execution_status: 'error',
    error_type: 'print_qa_failed',
    workflow_step: 'print_fulfillment',
    error_message: summary,
  });

  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      orderId,
      error_type: 'print_qa_failed',
      message: summary,
    },
  };
}

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }
  const response = await handlePrintQaFailed(parsed.data);
  return NextResponse.json(response.body, { status: response.status });
}
