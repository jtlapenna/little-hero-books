import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  appendWorkflowJobEvent,
  cancelWorkflowJob,
  finishWorkflowJobAttempt,
  getLatestWorkflowJobAttemptForJob,
  getWorkflowJobById,
} from '@/lib/workflow-jobs';

export const dynamic = 'force-dynamic';

const ACTIVE_JOB_STATUSES = new Set(['queued', 'claimed', 'running', 'polling', 'retry_waiting']);
const ACTIVE_ATTEMPT_STATUSES = new Set(['claimed', 'running', 'polling']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const adminAuth = requireAdminAuth(request);
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  try {
    const { jobId: rawJobId } = await params;
    const jobId = Number(rawJobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: 'Valid jobId is required' }, { status: 400 });
    }

    let body: { reason?: string | null } = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }

    const reason =
      body.reason?.trim() || 'workflow jobs console manual cancellation';

    const job = await getWorkflowJobById(jobId);
    if (!job) {
      return NextResponse.json({ error: `Workflow job ${jobId} was not found` }, { status: 404 });
    }

    if (!ACTIVE_JOB_STATUSES.has(job.status)) {
      return NextResponse.json(
        { error: `Workflow job ${jobId} is already ${job.status}` },
        { status: 409 },
      );
    }

    const latestAttempt = await getLatestWorkflowJobAttemptForJob(jobId);
    if (
      latestAttempt &&
      ACTIVE_ATTEMPT_STATUSES.has(latestAttempt.status) &&
      !latestAttempt.ended_at
    ) {
      await finishWorkflowJobAttempt({
        attemptId: latestAttempt.id,
        status: 'canceled',
        errorMessage: reason,
      });
    }

    const canceledJob = await cancelWorkflowJob(jobId, reason);
    await appendWorkflowJobEvent({
      jobId,
      attemptId: latestAttempt?.id ?? null,
      eventType: 'manual-cancel',
      payload: {
        reason,
        previousStatus: job.status,
      },
      correlation: {
        sourceSystem: 'admin',
        orderId: job.order_id,
        rootGroupId: job.root_order_id,
        externalProvider: job.external_provider,
        externalRequestId: job.external_request_id,
      },
    });

    return NextResponse.json({
      success: true,
      jobId,
      status: canceledJob?.status ?? 'canceled',
      reason,
    });
  } catch (error) {
    console.error('[POST /api/admin/workflow-jobs/[jobId]/cancel] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
