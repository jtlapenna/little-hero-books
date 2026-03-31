import { supabase } from '@/lib/supabase-client';
import {
  appendWorkflowJobEvent,
  updateWorkflowJobResultSnapshot,
  type WorkflowJobRecord,
} from '@/lib/workflow-jobs';
import {
  buildLuluWebhookSignal,
  isNonProductionLuluSubmission,
  loadLatestLuluWebhookLog,
  type LuluWebhookSignal,
} from '@/lib/lulu-webhook-signal';
import { isTerminalLuluStatus } from '@/lib/lulu-status-map';
import {
  resolveWorkflowAlertsByDedupeKeys,
  upsertWorkflowAlert,
} from '@/lib/workflow-alerts';

const WATCHDOG_JOB_LOOKBACK_HOURS = 24 * 30;
const STALE_CLAIMED_MS = 15 * 60 * 1000;
const STALE_RUNNING_MS = 45 * 60 * 1000;
const STALE_POLLING_MS = 90 * 60 * 1000;
const OVERDUE_RETRY_GRACE_MS = 15 * 60 * 1000;
const TERMINAL_WORKFLOW_JOB_STATUSES = new Set(['succeeded', 'failed', 'dead_lettered', 'canceled']);

type WorkflowWatchdogSummary = {
  scannedJobCount: number;
  openAlertCount: number;
  resolvedAlertCount: number;
  byAlertType: Record<string, number>;
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isTerminalWorkflowJobStatus(status: string | null | undefined): boolean {
  const normalized = toTrimmedString(status);
  return normalized ? TERMINAL_WORKFLOW_JOB_STATUSES.has(normalized) : false;
}

export function deriveEffectiveWatchdogProviderSignal(input: {
  jobStatus: string | null | undefined;
  currentProviderStatus?: string | null;
  signal: LuluWebhookSignal;
}): Pick<LuluWebhookSignal, 'deliveryState' | 'deliveryReason'> {
  const latestStatus = toTrimmedString(input.signal.latestStatus);
  const currentProviderStatus = toTrimmedString(input.currentProviderStatus);

  if (
    input.signal.deliveryState === 'stale' &&
    latestStatus &&
    currentProviderStatus === latestStatus
  ) {
    return {
      deliveryState: 'received',
      deliveryReason: 'latest_webhook_mirrored_into_job_snapshot',
    };
  }

  if (
    input.signal.deliveryState === 'error' &&
    isTerminalWorkflowJobStatus(input.jobStatus) &&
    latestStatus &&
    currentProviderStatus === latestStatus &&
    isTerminalLuluStatus(latestStatus)
  ) {
    return {
      deliveryState: 'received',
      deliveryReason: 'terminal_provider_state_already_converged',
    };
  }

  return {
    deliveryState: input.signal.deliveryState,
    deliveryReason: input.signal.deliveryReason,
  };
}

function isRealLuluJob(job: WorkflowJobRecord): boolean {
  const snapshot = toJsonRecord(job.result_snapshot);
  const provider =
    toTrimmedString(snapshot.externalProvider) ??
    toTrimmedString(snapshot.provider) ??
    toTrimmedString(job.external_provider);
  if (provider !== 'lulu') {
    return false;
  }
  const luluJobId =
    toTrimmedString(snapshot.luluJobId) ??
    toTrimmedString(snapshot.externalRequestId) ??
    toTrimmedString(job.external_request_id);
  const luluStatus = toTrimmedString(snapshot.luluStatus);
  if (!luluJobId) {
    return false;
  }
  if (isNonProductionLuluSubmission({ luluJobId, currentStatus: luluStatus })) {
    return false;
  }
  return true;
}

function getReferenceTime(job: WorkflowJobRecord): string | null {
  switch (job.status) {
    case 'claimed':
      return job.claimed_at ?? job.updated_at;
    case 'running':
      return job.started_at ?? job.updated_at;
    case 'polling':
      return job.polling_at ?? job.updated_at;
    case 'retry_waiting':
      return job.next_retry_at;
    case 'dead_lettered':
      return job.dead_lettered_at ?? job.updated_at;
    default:
      return job.updated_at;
  }
}

async function loadRecentWorkflowJobs(): Promise<WorkflowJobRecord[]> {
  const since = new Date(Date.now() - WATCHDOG_JOB_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('workflow_jobs')
    .select('*')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }
  return (data as WorkflowJobRecord[] | null) ?? [];
}

async function appendProviderSignalEventIfChanged(
  job: WorkflowJobRecord,
  eventType: 'provider-status-missing' | 'provider-status-stale',
  deliveryState: 'missing' | 'stale',
  deliveryReason: string,
  signal: ReturnType<typeof buildLuluWebhookSignal>,
) {
  const snapshot = toJsonRecord(job.result_snapshot);
  const previousState = toTrimmedString(snapshot.webhookDeliveryState);
  const previousReason = toTrimmedString(snapshot.webhookDeliveryReason);
  const luluJobId =
    toTrimmedString(snapshot.luluJobId) ??
    toTrimmedString(snapshot.externalRequestId) ??
    toTrimmedString(job.external_request_id);

  await updateWorkflowJobResultSnapshot(job.id, {
    webhookDeliveryState: deliveryState,
    webhookDeliveryReason: deliveryReason,
    webhookLatestStatus: signal.latestStatus,
    webhookLatestReceivedAt: signal.latestReceivedAt,
  });

  if (previousState === deliveryState && previousReason === deliveryReason) {
    return;
  }

  await appendWorkflowJobEvent({
    jobId: job.id,
    eventType,
    payload: {
      deliveryState,
      deliveryReason,
      latestStatus: signal.latestStatus,
      latestReceivedAt: signal.latestReceivedAt,
      latestErrorMessage: signal.latestErrorMessage,
    },
    correlation: {
      sourceSystem: 'cron',
      orderId: job.order_id,
      rootGroupId: job.root_order_id,
      externalProvider: 'lulu',
      externalRequestId: luluJobId,
      luluJobId,
    },
  });
}

async function mirrorLatestProviderStatusIfChanged(
  job: WorkflowJobRecord,
  signal: ReturnType<typeof buildLuluWebhookSignal>,
) {
  const snapshot = toJsonRecord(job.result_snapshot);
  const previousStatus = toTrimmedString(snapshot.luluStatus);
  const latestStatus = toTrimmedString(signal.latestStatus);
  const luluJobId =
    toTrimmedString(snapshot.luluJobId) ??
    toTrimmedString(snapshot.externalRequestId) ??
    toTrimmedString(job.external_request_id);

  if (!latestStatus || latestStatus === previousStatus) {
    return { mirrored: false };
  }

  await updateWorkflowJobResultSnapshot(job.id, {
    luluStatus: latestStatus,
    luluStatusUpdatedAt: signal.latestReceivedAt ?? new Date().toISOString(),
  });

  await appendWorkflowJobEvent({
    jobId: job.id,
    eventType: 'provider-status-updated',
    payload: {
      providerStatus: latestStatus,
      previousProviderStatus: previousStatus,
      mirroredFromWebhookLog: true,
      latestReceivedAt: signal.latestReceivedAt,
    },
    correlation: {
      sourceSystem: 'cron',
      orderId: job.order_id,
      rootGroupId: job.root_order_id,
      externalProvider: 'lulu',
      externalRequestId: luluJobId,
      luluJobId,
    },
  });

  return { mirrored: true, latestStatus };
}

export async function runRepoWorkflowWatchdog(): Promise<WorkflowWatchdogSummary> {
  const jobs = await loadRecentWorkflowJobs();
  const now = Date.now();
  const dedupeKeysSeen = new Set<string>();
  const dedupeKeysTriggered = new Set<string>();
  const byAlertType = new Map<string, number>();

  const upsertAlert = async (input: {
    dedupeKey: string;
    job: WorkflowJobRecord;
    alertType: string;
    severity: 'info' | 'warning' | 'critical';
    summary: string;
    details?: Record<string, unknown>;
  }) => {
    dedupeKeysSeen.add(input.dedupeKey);
    dedupeKeysTriggered.add(input.dedupeKey);
    byAlertType.set(input.alertType, (byAlertType.get(input.alertType) ?? 0) + 1);
    await upsertWorkflowAlert({
      dedupeKey: input.dedupeKey,
      jobId: input.job.id,
      stage: input.job.stage,
      alertType: input.alertType,
      severity: input.severity,
      summary: input.summary,
      details: input.details ?? {},
    });
  };

  for (const job of jobs) {
    const referenceTime = getReferenceTime(job);
    const referenceMs = referenceTime ? Date.parse(referenceTime) : NaN;
    const snapshot = toJsonRecord(job.result_snapshot);
    const candidateKeys = [
      `workflow-job:${job.id}:stale-claimed`,
      `workflow-job:${job.id}:stale-running`,
      `workflow-job:${job.id}:stale-polling`,
      `workflow-job:${job.id}:retry-overdue`,
      `workflow-job:${job.id}:dead-lettered`,
      `workflow-job:${job.id}:provider-missing`,
      `workflow-job:${job.id}:provider-stale`,
      `workflow-job:${job.id}:provider-error`,
    ];
    for (const key of candidateKeys) {
      dedupeKeysSeen.add(key);
    }

    if (job.status === 'claimed' && Number.isFinite(referenceMs) && now - referenceMs > STALE_CLAIMED_MS) {
      await upsertAlert({
        dedupeKey: `workflow-job:${job.id}:stale-claimed`,
        job,
        alertType: 'stale-claimed',
        severity: 'warning',
        summary: `Job ${job.id} has been claimed for more than 15 minutes`,
        details: {
          status: job.status,
          claimedAt: job.claimed_at,
        },
      });
    }

    if (job.status === 'running' && Number.isFinite(referenceMs) && now - referenceMs > STALE_RUNNING_MS) {
      await upsertAlert({
        dedupeKey: `workflow-job:${job.id}:stale-running`,
        job,
        alertType: 'stale-running',
        severity: 'warning',
        summary: `Job ${job.id} has been running for more than 45 minutes`,
        details: {
          status: job.status,
          startedAt: job.started_at,
        },
      });
    }

    if (job.status === 'polling' && Number.isFinite(referenceMs) && now - referenceMs > STALE_POLLING_MS) {
      await upsertAlert({
        dedupeKey: `workflow-job:${job.id}:stale-polling`,
        job,
        alertType: 'stale-polling',
        severity: 'warning',
        summary: `Job ${job.id} has been polling for more than 90 minutes`,
        details: {
          status: job.status,
          pollingAt: job.polling_at,
        },
      });
    }

    if (
      job.status === 'retry_waiting' &&
      Number.isFinite(referenceMs) &&
      now - referenceMs > OVERDUE_RETRY_GRACE_MS
    ) {
      await upsertAlert({
        dedupeKey: `workflow-job:${job.id}:retry-overdue`,
        job,
        alertType: 'retry-overdue',
        severity: 'warning',
        summary: `Job ${job.id} is overdue for retry execution`,
        details: {
          status: job.status,
          nextRetryAt: job.next_retry_at,
        },
      });
    }

    if (job.status === 'dead_lettered') {
      await upsertAlert({
        dedupeKey: `workflow-job:${job.id}:dead-lettered`,
        job,
        alertType: 'dead-lettered',
        severity: 'critical',
        summary: `Job ${job.id} has dead-lettered`,
        details: {
          status: job.status,
          deadLetteredAt: job.dead_lettered_at,
          lastError: job.last_error,
        },
      });
    }

    if ((job.stage === '4' || job.stage === '4.1') && isRealLuluJob(job)) {
      const luluJobId =
        toTrimmedString(snapshot.luluJobId) ??
        toTrimmedString(snapshot.externalRequestId) ??
        toTrimmedString(job.external_request_id);
      const currentStatus = toTrimmedString(snapshot.luluStatus);
      if (luluJobId) {
        try {
          const webhookLog = await loadLatestLuluWebhookLog(luluJobId);
          const signal = buildLuluWebhookSignal({
            luluJobId,
            currentStatus,
            webhookLog,
          });

          const mirroredStatus = await mirrorLatestProviderStatusIfChanged(job, signal);
          const effectiveSignal = deriveEffectiveWatchdogProviderSignal({
            jobStatus: job.status,
            currentProviderStatus: mirroredStatus.mirrored
              ? mirroredStatus.latestStatus
              : currentStatus,
            signal,
          });
          const effectiveDeliveryState = effectiveSignal.deliveryState;
          const effectiveDeliveryReason = effectiveSignal.deliveryReason;

          await updateWorkflowJobResultSnapshot(job.id, {
            webhookDeliveryState: effectiveDeliveryState,
            webhookDeliveryReason: effectiveDeliveryReason,
            webhookLatestStatus: signal.latestStatus,
            webhookLatestReceivedAt: signal.latestReceivedAt,
          });

          if (effectiveDeliveryState === 'missing') {
            await appendProviderSignalEventIfChanged(
              job,
              'provider-status-missing',
              'missing',
              effectiveDeliveryReason,
              signal,
            );
            await upsertAlert({
              dedupeKey: `workflow-job:${job.id}:provider-missing`,
              job,
              alertType: 'provider-missing',
              severity: 'warning',
              summary: `Job ${job.id} has a real Lulu submission but no webhook delivery`,
              details: {
                luluJobId,
                deliveryReason: effectiveDeliveryReason,
              },
            });
          }

          if (effectiveDeliveryState === 'stale') {
            await appendProviderSignalEventIfChanged(
              job,
              'provider-status-stale',
              'stale',
              effectiveDeliveryReason,
              signal,
            );
            await upsertAlert({
              dedupeKey: `workflow-job:${job.id}:provider-stale`,
              job,
              alertType: 'provider-stale',
              severity: 'warning',
              summary: `Job ${job.id} has stale Lulu lifecycle state`,
              details: {
                luluJobId,
                latestStatus: signal.latestStatus,
                deliveryReason: effectiveDeliveryReason,
              },
            });
          }

          if (effectiveDeliveryState === 'error') {
            await upsertAlert({
              dedupeKey: `workflow-job:${job.id}:provider-error`,
              job,
              alertType: 'provider-error',
              severity: 'critical',
              summary: `Job ${job.id} has a Lulu webhook delivery error`,
              details: {
                luluJobId,
                latestStatus: signal.latestStatus,
                latestErrorMessage: signal.latestErrorMessage,
                deliveryReason: effectiveDeliveryReason,
              },
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await upsertAlert({
            dedupeKey: `workflow-job:${job.id}:provider-error`,
            job,
            alertType: 'provider-error',
            severity: 'critical',
            summary: `Job ${job.id} failed webhook freshness inspection`,
            details: {
              luluJobId,
              error: message,
            },
          });
        }
      }
    }
  }

  const keysToResolve = [...dedupeKeysSeen].filter((key) => !dedupeKeysTriggered.has(key));
  await resolveWorkflowAlertsByDedupeKeys(keysToResolve);

  return {
    scannedJobCount: jobs.length,
    openAlertCount: dedupeKeysTriggered.size,
    resolvedAlertCount: keysToResolve.length,
    byAlertType: Object.fromEntries(byAlertType),
  };
}
