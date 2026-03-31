import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase-client';
import { listWorkflowAlerts, summarizeWorkflowAlerts } from '@/lib/workflow-alerts';

export const dynamic = 'force-dynamic';

type AlertJobRow = {
  id: number;
  stage: string;
  order_id?: string | null;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
  status: string;
  updated_at: string;
  job_type: string;
};

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
    const jobIds = [...new Set(alerts.map((alert) => alert.job_id).filter((value): value is number => Number.isFinite(value)))];
    const jobsById = new Map<number, AlertJobRow>();

    if (jobIds.length > 0) {
      const { data: jobRows, error: jobsError } = await supabase
        .from('workflow_jobs')
        .select('id, stage, order_id, root_order_id, amazon_order_id, status, updated_at, job_type')
        .in('id', jobIds);

      if (jobsError) {
        throw jobsError;
      }

      for (const row of (jobRows ?? []) as AlertJobRow[]) {
        jobsById.set(row.id, row);
      }
    }

    return NextResponse.json({
      success: true,
      query: {
        hours: query.hours ?? 24 * 7,
        limit: query.limit ?? 100,
        stage: query.stage ?? null,
        status: query.status ?? null,
      },
      summary: summarizeWorkflowAlerts(alerts),
      alerts: alerts.map((alert) => {
        const job = alert.job_id ? jobsById.get(alert.job_id) ?? null : null;
        return {
          ...alert,
          job: job
            ? {
                id: job.id,
                stage: job.stage,
                orderId: job.order_id ?? null,
                rootOrderId: job.root_order_id ?? null,
                amazonOrderId: job.amazon_order_id ?? null,
                status: job.status,
                updatedAt: job.updated_at,
                jobType: job.job_type,
              }
            : null,
        };
      }),
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
