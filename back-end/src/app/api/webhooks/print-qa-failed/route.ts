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

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const { orderId, reasonCode, reason, failedPages } = parsed.data;
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  if (!order) return NextResponse.json({ error: 'Order not found', orderId }, { status: 404 });

  const pagesLabel = Array.isArray(failedPages) && failedPages.length ? failedPages.join(', ') : 'n/a';
  const summary = `Print QA failed (${reasonCode || 'unknown'}): ${reason || 'no reason provided'}; pages=${pagesLabel}`;

  await updateOrderStatus(orderId, {
    execution_status: 'error',
    error_type: 'print_qa_failed',
    workflow_step: 'print_fulfillment',
    error_message: summary,
    printFulfillmentStatus: 'error',
    printFulfillmentErrorPhase: 'qa_gate',
    printFulfillmentErrorMessage: summary,
  });

  return NextResponse.json({
    success: true,
    orderId,
    error_type: 'print_qa_failed',
    message: summary,
  });
}

