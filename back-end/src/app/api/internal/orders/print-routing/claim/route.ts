import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { claimPrintRoutingRequest } from '@/lib/books/print-routing-claim-runtime';

export const dynamic = 'force-dynamic';
const RequestSchema = z.object({
  orderDbIds: z.array(z.number().int().positive()).min(1).max(100),
  idempotencyKey: z.string().trim().min(1).max(255),
}).strict();

export async function POST(request: NextRequest) {
  if (!verifyBearerAuth(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.orderDbIds).size !== parsed.data.orderDbIds.length) {
    return NextResponse.json({ error: 'Invalid print routing claim request' }, { status: 400 });
  }
  try {
    const result = await claimPrintRoutingRequest(parsed.data.orderDbIds, parsed.data.idempotencyKey);
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ error: 'Print routing claim rejected' }, { status: 409 });
  }
}
