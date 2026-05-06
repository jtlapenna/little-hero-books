import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  inspectWorkflowJobsOrder,
  listWorkflowJobsMonitorData,
} from '@/lib/workflow-jobs-monitor';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  orderId: z.string().trim().min(1).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  stage: z.string().trim().min(1).max(20).optional(),
  status: z.string().trim().min(1).max(30).optional(),
});

export async function GET(request: NextRequest) {
  const adminAuth = requireAdminAuth(request);
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  try {
    const query = QuerySchema.parse({
      orderId: request.nextUrl.searchParams.get('orderId') ?? undefined,
      hours: request.nextUrl.searchParams.get('hours') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      stage: request.nextUrl.searchParams.get('stage') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    });

    const monitor = await listWorkflowJobsMonitorData({
      orderId: query.orderId,
      hours: query.hours ?? 72,
      limit: query.limit ?? 40,
      stage: query.stage,
      status: query.status,
    });

    const inspectedOrder = query.orderId
      ? await inspectWorkflowJobsOrder(query.orderId)
      : null;

    return NextResponse.json({
      success: true,
      query: {
        orderId: query.orderId ?? null,
        hours: query.hours ?? 72,
        limit: query.limit ?? 40,
        stage: query.stage ?? null,
        status: query.status ?? null,
      },
      summary: monitor.summary,
      jobs: monitor.jobs,
      activeOrderRows: monitor.activeOrderRows,
      inspectedOrder,
    });
  } catch (error) {
    console.error('[GET /api/admin/workflow-jobs] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
