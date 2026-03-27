import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import {
  appendWorkflowJobEvent,
  deadLetterWorkflowJob,
  finishWorkflowJobAttempt,
  getWorkflowJobById,
  getWorkflowJobByIdempotencyKey,
  markWorkflowJobFailed,
  markWorkflowJobPolling,
  markWorkflowJobRunning,
  markWorkflowJobSucceeded,
  scheduleWorkflowJobRetry,
  summarizeWorkflowJobError,
  updateWorkflowJobAttempt,
} from '@/lib/workflow-jobs';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

const PayloadSchema = z.object({
  jobId: z.number().int().positive().optional(),
  idempotencyKey: z.string().min(1).optional(),
  eventType: z.string().min(1),
  jobStatus: z
    .enum([
      'queued',
      'claimed',
      'running',
      'polling',
      'retry_waiting',
      'succeeded',
      'failed',
      'dead_lettered',
      'canceled',
    ])
    .optional(),
  attemptId: z.number().int().positive().nullable().optional(),
  attemptStatus: z
    .enum(['claimed', 'running', 'polling', 'succeeded', 'failed', 'canceled'])
    .optional(),
  externalProvider: z.string().min(1).nullable().optional(),
  externalRequestId: z.string().min(1).nullable().optional(),
  externalStatusUrl: z.string().min(1).nullable().optional(),
  resultSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  lastError: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().optional(),
  nextRetryAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  context: z.record(z.string(), z.unknown()).nullable().optional(),
});

function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type WorkflowJobEventDependencies = {
  appendWorkflowJobEvent: typeof appendWorkflowJobEvent;
  deadLetterWorkflowJob: typeof deadLetterWorkflowJob;
  finishWorkflowJobAttempt: typeof finishWorkflowJobAttempt;
  getWorkflowJobById: typeof getWorkflowJobById;
  getWorkflowJobByIdempotencyKey: typeof getWorkflowJobByIdempotencyKey;
  markWorkflowJobFailed: typeof markWorkflowJobFailed;
  markWorkflowJobPolling: typeof markWorkflowJobPolling;
  markWorkflowJobRunning: typeof markWorkflowJobRunning;
  markWorkflowJobSucceeded: typeof markWorkflowJobSucceeded;
  scheduleWorkflowJobRetry: typeof scheduleWorkflowJobRetry;
  updateWorkflowJobAttempt: typeof updateWorkflowJobAttempt;
};

const defaultDependencies: WorkflowJobEventDependencies = {
  appendWorkflowJobEvent,
  deadLetterWorkflowJob,
  finishWorkflowJobAttempt,
  getWorkflowJobById,
  getWorkflowJobByIdempotencyKey,
  markWorkflowJobFailed,
  markWorkflowJobPolling,
  markWorkflowJobRunning,
  markWorkflowJobSucceeded,
  scheduleWorkflowJobRetry,
  updateWorkflowJobAttempt,
};

async function resolveJob(
  payload: z.infer<typeof PayloadSchema>,
  dependencies: WorkflowJobEventDependencies,
) {
  if (typeof payload.jobId === 'number') {
    const byId = await dependencies.getWorkflowJobById(payload.jobId);
    if (byId) {
      return byId;
    }
  }

  if (payload.idempotencyKey) {
    const byKey = await dependencies.getWorkflowJobByIdempotencyKey(payload.idempotencyKey);
    if (byKey) {
      return byKey;
    }
  }

  throw new Error('Workflow job not found');
}

export async function recordWorkflowJobEventResponse(
  rawBody: JsonRecord,
  dependencies: WorkflowJobEventDependencies = defaultDependencies,
): Promise<JsonRecord> {
  const payload = PayloadSchema.parse(rawBody);
  const job = await resolveJob(payload, dependencies);
  const eventPayload: JsonRecord = {
    ...(payload.payload ?? {}),
  };

  if (payload.externalProvider !== undefined) {
    eventPayload.externalProvider = payload.externalProvider;
  }
  if (payload.externalRequestId !== undefined) {
    eventPayload.externalRequestId = payload.externalRequestId;
  }
  if (payload.externalStatusUrl !== undefined) {
    eventPayload.externalStatusUrl = payload.externalStatusUrl;
  }

  if (payload.attemptId && payload.attemptStatus) {
    if (['succeeded', 'failed', 'canceled'].includes(payload.attemptStatus)) {
      await dependencies.finishWorkflowJobAttempt({
        attemptId: payload.attemptId,
        status: payload.attemptStatus,
        errorMessage:
          payload.attemptStatus === 'failed'
            ? summarizeWorkflowJobError(payload.lastError ?? 'Workflow job attempt failed').message
            : null,
        errorDetails:
          payload.attemptStatus === 'failed'
            ? summarizeWorkflowJobError(payload.lastError ?? 'Workflow job attempt failed')
            : null,
      });
    } else {
      await dependencies.updateWorkflowJobAttempt(payload.attemptId, {
        status: payload.attemptStatus,
        provider_request_id:
          payload.externalRequestId === undefined ? undefined : payload.externalRequestId,
        provider_status_url:
          payload.externalStatusUrl === undefined ? undefined : payload.externalStatusUrl,
      });
    }
  }

  let updatedJob = job;
  if (payload.jobStatus === 'running') {
    updatedJob =
      (await dependencies.markWorkflowJobRunning(job.id, {
        externalProvider: payload.externalProvider,
        externalRequestId: payload.externalRequestId,
        externalStatusUrl: payload.externalStatusUrl,
      })) ?? updatedJob;
  } else if (payload.jobStatus === 'polling') {
    updatedJob =
      (await dependencies.markWorkflowJobPolling(job.id, {
        externalProvider: payload.externalProvider,
        externalRequestId: payload.externalRequestId,
        externalStatusUrl: payload.externalStatusUrl,
      })) ?? updatedJob;
  } else if (payload.jobStatus === 'succeeded') {
    updatedJob =
      (await dependencies.markWorkflowJobSucceeded(job.id, {
        externalProvider: payload.externalProvider,
        externalRequestId: payload.externalRequestId,
        externalStatusUrl: payload.externalStatusUrl,
        resultSnapshot: payload.resultSnapshot ?? undefined,
      })) ?? updatedJob;
  } else if (payload.jobStatus === 'failed') {
    updatedJob =
      (await dependencies.markWorkflowJobFailed(job.id, {
        externalProvider: payload.externalProvider,
        externalRequestId: payload.externalRequestId,
        externalStatusUrl: payload.externalStatusUrl,
        lastError: summarizeWorkflowJobError(payload.lastError ?? 'Workflow job failed'),
      })) ?? updatedJob;
  } else if (payload.jobStatus === 'retry_waiting') {
    if (!payload.nextRetryAt) {
      throw new Error('nextRetryAt is required when jobStatus is retry_waiting');
    }
    updatedJob =
      (await dependencies.scheduleWorkflowJobRetry(job.id, {
        nextRetryAt: payload.nextRetryAt,
        externalProvider: payload.externalProvider,
        externalRequestId: payload.externalRequestId,
        externalStatusUrl: payload.externalStatusUrl,
        lastError: summarizeWorkflowJobError(payload.lastError ?? 'Workflow job retry scheduled'),
      })) ?? updatedJob;
  } else if (payload.jobStatus === 'dead_lettered') {
    updatedJob =
      (await dependencies.deadLetterWorkflowJob(job.id, {
        externalProvider: payload.externalProvider,
        externalRequestId: payload.externalRequestId,
        externalStatusUrl: payload.externalStatusUrl,
        lastError: summarizeWorkflowJobError(payload.lastError ?? 'Workflow job dead-lettered'),
      })) ?? updatedJob;
  }

  await dependencies.appendWorkflowJobEvent({
    jobId: job.id,
    attemptId: payload.attemptId ?? null,
    eventType: payload.eventType,
    payload: eventPayload,
  });

  const context = toJsonRecord(payload.context);
  return {
    success: true,
    jobId: updatedJob.id,
    attemptId: payload.attemptId ?? null,
    currentStatus: updatedJob.status,
    __workflowJobEvent: {
      eventType: payload.eventType,
      recordedAt: new Date().toISOString(),
      currentStatus: updatedJob.status,
    },
    ...context,
  };
}

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: `Unauthorized - ${auth.error}` },
      { status: 401 },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const body = toJsonRecord(parsedBody);

  try {
    const response = await recordWorkflowJobEventResponse(body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal Workflow Jobs Log Event] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to record workflow job event',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
