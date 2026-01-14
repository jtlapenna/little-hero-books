import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { updateOrderStatus } from '@/lib/status-service';

// Force dynamic rendering - this route should never be statically generated
export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  orderId: z.string().min(1),
  characterHash: z.string().min(1).optional(),
  reason: z.string().min(1),
  totalApproved: z.number().int().min(0),
  skippedByBriaStatus: z.number().int().min(0),
  skippedBy2BManifest: z.number().int().min(0),
  skippedTotal: z.number().int().min(0),
});

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

    // Update Supabase order with skip information
    await updateOrderStatus(payload.orderId, {
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
      orderId: payload.orderId, 
      message: 'Skip information recorded' 
    });
  } catch (error: any) {
    console.error('[workflow-2b-skipped] Error:', error);
    return NextResponse.json({ 
      error: error?.message || 'Internal Server Error',
      details: error?.stack 
    }, { status: 500 });
  }
}
