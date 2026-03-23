import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';
import { updateOrderStatus } from '@/lib/status-service';

// Force dynamic rendering - this route should never be statically generated
export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  orderId: z.string().min(1).nullable().optional(),
  rootOrderId: z.string().min(1).nullable().optional(),
  amazonOrderId: z.string().min(1).nullable().optional(),
  // Purpose: skipped-path bookkeeping does not require characterHash, and n8n may
  // pass null when the no-work branch short-circuits before downstream enrichment.
  characterHash: z.string().min(1).nullable().optional(),
  reason: z.string().min(1),
  totalApproved: z.number().int().min(0),
  skippedByBriaStatus: z.number().int().min(0),
  skippedBy2BManifest: z.number().int().min(0),
  skippedTotal: z.number().int().min(0),
});

function getErrorDetails(error: unknown): { message: string; details?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack,
    };
  }

  return {
    message: 'Internal Server Error',
  };
}

type ExactOrderRow = {
  id: number;
  orderId?: string | null;
  order_id?: string | null;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
};

function trimToString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function listRowsByColumn(
  column: 'root_order_id' | 'amazon_order_id',
  value: string,
): Promise<ExactOrderRow[]> {
  const response = await supabase
    .from('orders')
    .select('id, orderId, order_id, root_order_id, amazon_order_id')
    .eq(column, value)
    .limit(50);

  if (response.error?.code === '42703') {
    return [];
  }
  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []) as ExactOrderRow[];
}

async function resolveSkippedOrderId(payload: z.infer<typeof PayloadSchema>): Promise<string> {
  const exactOrderId = trimToString(payload.orderId);
  if (exactOrderId) {
    return exactOrderId;
  }

  const fallbackGroupId =
    trimToString(payload.rootOrderId) ??
    trimToString(payload.amazonOrderId);

  if (!fallbackGroupId) {
    throw new Error('workflow-2b-skipped: missing orderId and fallback root/amazon order id');
  }

  for (const column of ['root_order_id', 'amazon_order_id'] as const) {
    const rows = await listRowsByColumn(column, fallbackGroupId);
    if (rows.length === 0) {
      continue;
    }

    const exactPerBookMatch = rows.find((row) => {
      const perBookOrderId = trimToString(row.orderId) ?? trimToString(row.order_id);
      return perBookOrderId === fallbackGroupId;
    });
    if (exactPerBookMatch) {
      return trimToString(exactPerBookMatch.orderId) ?? trimToString(exactPerBookMatch.order_id) ?? fallbackGroupId;
    }

    if (rows.length === 1) {
      return trimToString(rows[0]?.orderId) ?? trimToString(rows[0]?.order_id) ?? fallbackGroupId;
    }
  }

  throw new Error(
    `workflow-2b-skipped: fallback id ${fallbackGroupId} matched multiple rows; per-item orderId is required`,
  );
}

/**
 * POST /api/webhooks/workflow-2b-skipped
 * 
 * Called by n8n 2B workflow when all poses are skipped (already processed).
 * Updates order with skip information for admin visibility.
 */
export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const payload = PayloadSchema.parse(json);
    const resolvedOrderId = await resolveSkippedOrderId(payload);

    // Update Supabase order with skip information
    await updateOrderStatus(resolvedOrderId, {
      last_skip_reason: payload.reason,
      last_skip_at: new Date().toISOString(),
      last_skip_details: {
        totalApproved: payload.totalApproved,
        skippedByBriaStatus: payload.skippedByBriaStatus,
        skippedBy2BManifest: payload.skippedBy2BManifest,
        skippedTotal: payload.skippedTotal,
      },
    });

    return NextResponse.json({ 
      success: true, 
      orderId: resolvedOrderId,
      message: 'Skip information recorded' 
    });
  } catch (error: unknown) {
    const normalizedError = getErrorDetails(error);
    console.error('[workflow-2b-skipped] Error:', error);
    return NextResponse.json({ 
      error: normalizedError.message,
      details: normalizedError.details,
    }, { status: 500 });
  }
}
