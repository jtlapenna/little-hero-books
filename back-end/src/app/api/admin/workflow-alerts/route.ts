import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import { listWorkflowAlerts, summarizeWorkflowAlerts } from '@/lib/workflow-alerts';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  stage: z.string().trim().min(1).max(20).optional(),
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
});

export async function GET(request: NextRequest) {
  const adminAuth = requireAdminAuth(request);
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  try {
    const query = QuerySchema.parse({
      hours: request.nextUrl.searchParams.get('hours') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      stage: request.nextUrl.searchParams.get('stage') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    });

    const alerts = await listWorkflowAlerts({
      hours: query.hours ?? 24 * 7,
      limit: query.limit ?? 100,
      stage: query.stage ?? null,
      status: query.status ?? null,
    });

    return NextResponse.json({
      success: true,
      query: {
        hours: query.hours ?? 24 * 7,
        limit: query.limit ?? 100,
        stage: query.stage ?? null,
        status: query.status ?? null,
      },
      summary: summarizeWorkflowAlerts(alerts),
      alerts,
    });
  } catch (error) {
    console.error('[GET /api/admin/workflow-alerts] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
