'use client';

import { Suspense, startTransition, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CheckCheck,
  Clock3,
  Layers3,
  RefreshCw,
  Search,
  Workflow,
} from 'lucide-react';

type WorkflowJobsSummary = {
  windowHours: number;
  matchingJobCount: number;
  visibleJobCount: number;
  activeCount: number;
  retryWaitingCount: number;
  failedCount: number;
  deadLetteredCount: number;
  succeededCount: number;
  canceledCount: number;
  byStage: Record<string, number>;
  byStatus: Record<string, number>;
  openAlertCount: number;
  criticalAlertCount: number;
  warningAlertCount: number;
  infoAlertCount: number;
};

type WorkflowAttempt = {
  id: number;
  attempt: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
  errorMessage: string | null;
  providerRequestId: string | null;
  providerStatusUrl: string | null;
};

type WorkflowEvent = {
  id: number;
  eventType: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

type WorkflowProviderSummary = {
  provider: string | null;
  luluJobId: string | null;
  latestStatus: string | null;
  latestStatusUpdatedAt: string | null;
  webhookDeliveryState: string | null;
  webhookDeliveryReason: string | null;
};

type WorkflowCorrelation = {
  sourceSystem: string | null;
  sourceExecutionId: string | null;
  orderId: string | null;
  rootGroupId: string | null;
  externalProvider: string | null;
  externalRequestId: string | null;
  luluJobId: string | null;
  manifestKeys: string[];
  artifactKeys: string[];
};

type WorkflowAlertSummary = {
  openCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  latestSummary: string | null;
  latestSeverity: string | null;
};

type WorkflowJobListItem = {
  id: number;
  stage: string;
  jobType: string;
  orderId: string | null;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  bookId: string | null;
  logicalKey: string;
  idempotencyKey: string;
  status: string;
  isActive: boolean;
  attemptCount: number;
  maxAttempts: number;
  externalProvider: string | null;
  externalRequestId: string | null;
  externalStatusUrl: string | null;
  queuedAt: string;
  updatedAt: string;
  nextRetryAt: string | null;
  terminalAt: string | null;
  lastErrorMessage: string | null;
  latestAttempt: WorkflowAttempt | null;
  latestEvent: WorkflowEvent | null;
  recentEventTypes: string[];
  providerSummary: WorkflowProviderSummary | null;
  correlation: WorkflowCorrelation | null;
  openAlertSummary: WorkflowAlertSummary;
};

type WorkflowInspectionJob = WorkflowJobListItem & {
  attempts: WorkflowAttempt[];
  recentEvents: WorkflowEvent[];
};

type WorkflowInspection = {
  requestedOrderId: string;
  resolvedVia: string;
  orderRow: {
    id: number;
    orderId: string | null;
    rootOrderId: string | null;
    amazonOrderId: string | null;
    workflowStep: string | null;
    executionStatus: string | null;
    currentWorkflow: string | null;
    updatedAt: string | null;
    status: string | null;
    manifest2aUrl: string | null;
    manifest3Url: string | null;
    nextWorkflow: string | null;
  } | null;
  latestJobUpdateAt: string | null;
  activeCount: number;
  retryWaitingCount: number;
  failedCount: number;
  deadLetteredCount: number;
  succeededCount: number;
  stageCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  jobs: WorkflowInspectionJob[];
};

type WorkflowJobsResponse = {
  success: boolean;
  summary: WorkflowJobsSummary;
  jobs: WorkflowJobListItem[];
  inspectedOrder: WorkflowInspection | null;
  error?: string;
};

type WorkflowAlertItem = {
  id: number;
  dedupe_key: string;
  job_id: number | null;
  attempt_id: number | null;
  stage: string | null;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved';
  summary: string;
  details: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  job: {
    id: number;
    stage: string;
    orderId: string | null;
    rootOrderId: string | null;
    amazonOrderId: string | null;
    status: string;
    updatedAt: string;
    jobType: string;
  } | null;
};

type WorkflowAlertsResponse = {
  success: boolean;
  storageMode: 'durable' | 'fallback';
  summary: {
    openCount: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
  };
  alerts: WorkflowAlertItem[];
  error?: string;
};

type WorkflowWatchdogRunResponse = {
  success: boolean;
  ranAt: string;
  storageMode: 'durable' | 'fallback';
  summary: {
    scannedJobCount: number;
    conditionCount: number;
    openAlertCount: number;
    openAlertCountAfterRun: number;
    resolvedAlertCount: number;
    byAlertType: Record<string, number>;
  };
  error?: string;
};

type WorkflowCancelJobResponse = {
  success?: boolean;
  error?: string;
};

const STAGE_OPTIONS = [
  { value: '', label: 'All stages' },
  { value: '2a', label: '2A' },
  { value: '2b', label: '2B' },
  { value: '3', label: 'W3' },
  { value: '4', label: 'W4' },
  { value: '4.1', label: 'W4.1' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'running', label: 'Running' },
  { value: 'polling', label: 'Polling' },
  { value: 'retry_waiting', label: 'Retry Waiting' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'dead_lettered', label: 'Dead Lettered' },
  { value: 'canceled', label: 'Canceled' },
];

const WORKFLOW_LINKS = [
  { href: '/admin/workflow-jobs', label: 'Workflow Jobs', description: 'Inspect recent repo-centric job activity.' },
  { href: '/admin/w3-calibration', label: 'W3 Calibration', description: 'Tune story-page placement and pose anchors visually.' },
  { href: '/admin/w2a-recovery', label: 'W2A Recovery', description: 'Recover and replay pose-generation orders.' },
  { href: '/admin/w4-production', label: 'W4 Production', description: 'Review W4 production readiness and exports.' },
  { href: '/admin/w41-production', label: 'W4.1 Production', description: 'Inspect grouped production preflight and approvals.' },
  { href: '/admin/w4-recovery', label: 'W4 Recovery', description: 'Recover W4 production callbacks and stuck work.' },
  { href: '/admin/w41-recovery', label: 'W4.1 Recovery', description: 'Recover W4.1 grouped production callbacks.' },
];

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'N/A';
  }
  return new Date(value).toLocaleString();
}

function formatRelativeAge(value: string | null): string {
  if (!value) {
    return 'N/A';
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return 'N/A';
  }
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 1000 / 60));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ago`;
}

function statusClasses(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'dead_lettered':
      return 'border-red-200 bg-red-100 text-red-900';
    case 'retry_waiting':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'running':
    case 'polling':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    case 'claimed':
    case 'queued':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    case 'canceled':
      return 'border-gray-200 bg-gray-100 text-gray-700';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700';
  }
}

function stageClasses(stage: string): string {
  switch (stage) {
    case '2A':
      return 'border-violet-200 bg-violet-50 text-violet-800';
    case '2B':
      return 'border-cyan-200 bg-cyan-50 text-cyan-800';
    case 'W3':
      return 'border-indigo-200 bg-indigo-50 text-indigo-800';
    case 'W4':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'W4.1':
      return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function stageDisplayLabel(stage: string | null): string {
  switch ((stage || '').toLowerCase()) {
    case '2a':
      return '2A';
    case '2b':
      return '2B';
    case '3':
      return 'W3';
    case '4':
      return 'W4';
    case '4.1':
      return 'W4.1';
    default:
      return stage || 'Unknown';
  }
}

function humanizeMachineValue(value: string | null | undefined): string {
  if (!value) {
    return 'N/A';
  }
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatProviderName(provider: string | null | undefined): string {
  switch ((provider || '').toLowerCase()) {
    case 'pdfmonkey':
      return 'PDFMonkey';
    case 'gemini':
      return 'Gemini';
    case 'bria':
      return 'Bria';
    case 'lulu':
      return 'Lulu';
    default:
      return provider || 'provider';
  }
}

function getActiveReferenceTimestamp(job: WorkflowJobListItem | WorkflowInspectionJob): string | null {
  switch (job.status) {
    case 'queued':
      return job.queuedAt;
    case 'claimed':
    case 'running':
    case 'polling':
      return job.latestAttempt?.startedAt ?? job.updatedAt;
    case 'retry_waiting':
      return job.nextRetryAt ?? job.updatedAt;
    default:
      return job.updatedAt;
  }
}

function getProviderRequestId(job: WorkflowJobListItem | WorkflowInspectionJob): string | null {
  return (
    job.latestAttempt?.providerRequestId ||
    job.externalRequestId ||
    job.providerSummary?.luluJobId ||
    null
  );
}

function getRecentEventTypes(job: WorkflowJobListItem | WorkflowInspectionJob): string[] {
  if ('recentEvents' in job) {
    return job.recentEvents.map((event) => event.eventType);
  }
  return job.recentEventTypes;
}

type JobDiagnosis = {
  tone: 'critical' | 'warning' | 'info';
  headline: string;
  detail: string;
  recommendation?: string;
  blocking: boolean;
};

function diagnosisClasses(tone: JobDiagnosis['tone']): string {
  switch (tone) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-900';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'info':
    default:
      return 'border-blue-200 bg-blue-50 text-blue-900';
  }
}

function deriveJobDiagnosis(job: WorkflowJobListItem | WorkflowInspectionJob): JobDiagnosis | null {
  const provider = formatProviderName(job.providerSummary?.provider || job.externalProvider);
  const providerRequestId = getProviderRequestId(job);
  const eventTypes = getRecentEventTypes(job);
  const duplicateSkipped = eventTypes.includes('duplicate-trigger-skipped');
  const referenceTime = getActiveReferenceTimestamp(job);
  const referenceAge = formatRelativeAge(referenceTime);
  const referenceMs = referenceTime ? Date.parse(referenceTime) : NaN;
  const ageMinutes = Number.isFinite(referenceMs)
    ? Math.max(0, Math.floor((Date.now() - referenceMs) / 1000 / 60))
    : null;

  if (job.status === 'dead_lettered') {
    return {
      tone: 'critical',
      headline: 'All retries were exhausted',
      detail: `This job ended in dead-lettered after ${job.attemptCount} attempt${job.attemptCount === 1 ? '' : 's'}.`,
      recommendation: 'Use the matching recovery tool before running this stage again.',
      blocking: true,
    };
  }

  if (job.status === 'failed') {
    return {
      tone: 'critical',
      headline: 'Latest attempt failed',
      detail: job.lastErrorMessage || 'This job failed before it reached a completed state.',
      recommendation: 'Inspect the attempt details and rerun only after the failure cause is clear.',
      blocking: true,
    };
  }

  if (job.status === 'retry_waiting') {
    return {
      tone: 'warning',
      headline: 'Waiting to retry',
      detail: `The previous attempt failed. Next retry is ${job.nextRetryAt ? formatTimestamp(job.nextRetryAt) : 'not scheduled yet'}.`,
      recommendation: 'Let the retry happen, or recover manually if the underlying issue is already known.',
      blocking: false,
    };
  }

  if ((job.status === 'claimed' || job.status === 'queued') && ageMinutes !== null && ageMinutes >= 10) {
    return {
      tone: 'warning',
      headline: job.status === 'claimed' ? 'Claimed but not progressing' : 'Queued but not picked up',
      detail: `This job has been ${job.status} for ${referenceAge} with no further progress recorded.`,
      recommendation: 'Check whether the router/worker is actively picking up this stage.',
      blocking: false,
    };
  }

  if (
    (job.status === 'running' || job.status === 'polling') &&
    provider &&
    !providerRequestId &&
    ageMinutes !== null
  ) {
    if (ageMinutes >= 10) {
      return {
        tone: 'critical',
        headline: `Stuck before ${provider} submission`,
        detail:
          `This ${job.stage} job has been ${job.status} for ${referenceAge} and still has no provider request ID.` +
          (duplicateSkipped ? ' Later reruns were skipped because this active job still exists.' : ''),
        recommendation: 'Cancel the stale active job, then queue a fresh run.',
        blocking: true,
      };
    }

    if (ageMinutes >= 2) {
      return {
        tone: 'warning',
        headline: `Still trying to reach ${provider}`,
        detail: `This job started ${referenceAge} and has not recorded a provider request ID yet.`,
        recommendation: 'Watch it briefly. If it stays here, treat it as a stuck pre-submission job.',
        blocking: false,
      };
    }
  }

  if (duplicateSkipped) {
    return {
      tone: 'warning',
      headline: 'A newer rerun was skipped',
      detail: 'The system ignored a later retry because an older active job already exists for this stage.',
      recommendation: 'Inspect the older active job first. If it is stale, cancel it before rerunning.',
      blocking: true,
    };
  }

  if ((job.status === 'running' || job.status === 'polling') && providerRequestId) {
    return {
      tone: 'info',
      headline: job.status === 'polling' ? `Waiting on ${provider}` : `Submitted to ${provider}`,
      detail: `${provider} request ${providerRequestId} is recorded, so this job is past submission and waiting on provider work.`,
      blocking: false,
    };
  }

  return null;
}

type InspectionDiagnosis = {
  jobId: number | null;
  stage: string | null;
  tone: JobDiagnosis['tone'];
  title: string;
  detail: string;
  recommendation?: string;
  canRecoverW3: boolean;
};

function deriveInspectionDiagnosis(inspectedOrder: WorkflowInspection | null): InspectionDiagnosis | null {
  if (!inspectedOrder) {
    return null;
  }

  const activeJobs = inspectedOrder.jobs.filter((job) =>
    ['queued', 'claimed', 'running', 'polling', 'retry_waiting'].includes(job.status),
  );
  const prioritized = activeJobs
    .map((job) => ({ job, diagnosis: deriveJobDiagnosis(job) }))
    .filter(
      (entry): entry is { job: WorkflowInspectionJob; diagnosis: JobDiagnosis } =>
        Boolean(entry.diagnosis),
    )
    .sort((left, right) => {
      const score = (tone: JobDiagnosis['tone']) =>
        tone === 'critical' ? 0 : tone === 'warning' ? 1 : 2;
      return score(left.diagnosis.tone) - score(right.diagnosis.tone);
    });

  if (prioritized.length === 0) {
    return null;
  }

  const { job, diagnosis } = prioritized[0];
  let detail = diagnosis.detail;
  if (job.stage === 'W3' && !inspectedOrder.orderRow?.manifest3Url) {
    detail += ' Tab 3 will stay empty until a W3 manifest is published.';
  }

  return {
    jobId: job.id,
    stage: job.stage,
    tone: diagnosis.tone,
    title: diagnosis.headline,
    detail,
    recommendation: diagnosis.recommendation,
    canRecoverW3:
      diagnosis.blocking &&
      job.stage === 'W3' &&
      Boolean(inspectedOrder.orderRow?.orderId),
  };
}

function summarizeCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return 'None';
  }
  return entries.map(([key, value]) => `${key}:${value}`).join(' • ');
}

function alertSeverityClasses(severity: WorkflowAlertItem['severity']): string {
  switch (severity) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'info':
    default:
      return 'border-blue-200 bg-blue-50 text-blue-800';
  }
}

function alertStatusClasses(status: WorkflowAlertItem['status']): string {
  switch (status) {
    case 'acknowledged':
      return 'border-indigo-200 bg-indigo-50 text-indigo-800';
    case 'resolved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'open':
    default:
      return 'border-rose-200 bg-rose-50 text-rose-800';
  }
}

function WorkflowJobsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedOrderId = searchParams.get('orderId')?.trim() ?? '';
  const selectedStage = searchParams.get('stage')?.trim() ?? '';
  const selectedStatus = searchParams.get('status')?.trim() ?? '';

  const [draftOrderId, setDraftOrderId] = useState(selectedOrderId);
  const [draftStage, setDraftStage] = useState(selectedStage);
  const [draftStatus, setDraftStatus] = useState(selectedStatus);
  const [data, setData] = useState<WorkflowJobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsData, setAlertsData] = useState<WorkflowAlertsResponse | null>(null);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState<number | null>(null);
  const [runningWatchdog, setRunningWatchdog] = useState(false);
  const [recoveringJobId, setRecoveringJobId] = useState<number | null>(null);
  const [lastWatchdogRun, setLastWatchdogRun] = useState<WorkflowWatchdogRunResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [banner, setBanner] = useState<{ tone: 'error' | 'info'; message: string } | null>(null);

  const fetchData = async (params: { orderId: string; stage: string; status: string }) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        hours: '72',
        limit: '40',
      });
      if (params.orderId) {
        query.set('orderId', params.orderId);
      }
      if (params.stage) {
        query.set('stage', params.stage);
      }
      if (params.status) {
        query.set('status', params.status);
      }

      const response = await fetch(`/api/admin/workflow-jobs?${query.toString()}`);
      const payload = (await response.json()) as WorkflowJobsResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load workflow jobs');
      }

      setData(payload);
      setLastRefresh(new Date());
      setBanner(
        params.orderId && !payload.inspectedOrder
          ? {
              tone: 'info',
              message: `No workflow jobs or order row matched ${params.orderId}.`,
            }
          : null,
      );
    } catch (error) {
      console.error('Failed to load workflow jobs:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to load workflow jobs',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async (params: { stage: string }) => {
    setAlertsLoading(true);
    try {
      const query = new URLSearchParams({
        hours: '168',
        limit: '12',
        status: 'open',
      });
      if (params.stage) {
        query.set('stage', params.stage);
      }

      const response = await fetch(`/api/admin/workflow-alerts?${query.toString()}`);
      const payload = (await response.json()) as WorkflowAlertsResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load workflow alerts');
      }

      setAlertsData(payload);
    } catch (error) {
      console.error('Failed to load workflow alerts:', error);
      setAlertsData(null);
      setBanner((previous) =>
        previous ?? {
          tone: 'error',
          message: error instanceof Error ? error.message : 'Failed to load workflow alerts',
        },
      );
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    setDraftOrderId(selectedOrderId);
    setDraftStage(selectedStage);
    setDraftStatus(selectedStatus);

    fetchData({
      orderId: selectedOrderId,
      stage: selectedStage,
      status: selectedStatus,
    });
    fetchAlerts({
      stage: selectedStage,
    });

    const interval = window.setInterval(() => {
      fetchData({
        orderId: selectedOrderId,
        stage: selectedStage,
        status: selectedStatus,
      });
      fetchAlerts({
        stage: selectedStage,
      });
    }, 60000);

    return () => window.clearInterval(interval);
  }, [selectedOrderId, selectedStage, selectedStatus]);

  const replaceUrl = (params: { orderId: string; stage: string; status: string }) => {
    const query = new URLSearchParams();
    if (params.orderId.trim()) {
      query.set('orderId', params.orderId.trim());
    }
    if (params.stage.trim()) {
      query.set('stage', params.stage.trim());
    }
    if (params.status.trim()) {
      query.set('status', params.status.trim());
    }

    startTransition(() => {
      router.replace(
        query.toString() ? `/admin/workflow-jobs?${query.toString()}` : '/admin/workflow-jobs',
      );
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    replaceUrl({
      orderId: draftOrderId,
      stage: draftStage,
      status: draftStatus,
    });
  };

  const handleAcknowledgeAlert = async (alertId: number) => {
    setAcknowledgingAlertId(alertId);
    try {
      const response = await fetch(`/api/admin/workflow-alerts/${alertId}/acknowledge`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to acknowledge alert');
      }

      await Promise.all([
        fetchAlerts({ stage: selectedStage }),
        fetchData({
          orderId: selectedOrderId,
          stage: selectedStage,
          status: selectedStatus,
        }),
      ]);
      setBanner({
        tone: 'info',
        message: `Acknowledged workflow alert ${alertId}.`,
      });
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to acknowledge alert',
      });
    } finally {
      setAcknowledgingAlertId(null);
    }
  };

  const handleRunWatchdog = async () => {
    setRunningWatchdog(true);
    try {
      const response = await fetch('/api/admin/workflow-jobs/watchdog', {
        method: 'POST',
      });
      const payload = (await response.json()) as WorkflowWatchdogRunResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to run workflow watchdog');
      }

      setLastWatchdogRun(payload);
      await Promise.all([
        fetchAlerts({ stage: selectedStage }),
        fetchData({
          orderId: selectedOrderId,
          stage: selectedStage,
          status: selectedStatus,
        }),
      ]);

      const storageModeMessage =
        payload.storageMode === 'fallback'
          ? ' Alerts are still in fallback mode until the workflow_alerts table migration is applied.'
          : '';
      setBanner({
        tone: 'info',
        message:
          `Ran repo workflow watchdog: scanned ${payload.summary.scannedJobCount} jobs, ` +
          `detected ${payload.summary.conditionCount} alert conditions, ` +
          `${payload.summary.openAlertCountAfterRun} alerts currently open, ` +
          `resolved ${payload.summary.resolvedAlertCount}.` +
          storageModeMessage,
      });
    } catch (error) {
      console.error('Failed to run workflow watchdog:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to run workflow watchdog',
      });
    } finally {
      setRunningWatchdog(false);
    }
  };

  const attentionCount =
    (data?.summary.failedCount ?? 0) +
    (data?.summary.retryWaitingCount ?? 0) +
    (data?.summary.deadLetteredCount ?? 0);
  const openAlertCount = data?.summary.openAlertCount ?? 0;
  const inspectedOrder = data?.inspectedOrder ?? null;
  const inspectedHasW2A = inspectedOrder?.jobs.some((job) => job.stage === '2A') ?? false;
  const inspectionDiagnosis = deriveInspectionDiagnosis(inspectedOrder);

  const handleRecoverStuckW3 = async () => {
    if (!inspectionDiagnosis?.canRecoverW3 || !inspectionDiagnosis.jobId || !inspectedOrder?.orderRow?.orderId) {
      return;
    }

    setRecoveringJobId(inspectionDiagnosis.jobId);
    try {
      const cancelResponse = await fetch(`/api/admin/workflow-jobs/${inspectionDiagnosis.jobId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'workflow jobs console manual recovery: stale W3 job blocked rerun',
        }),
      });
      const cancelPayload = (await cancelResponse.json()) as WorkflowCancelJobResponse;
      if (!cancelResponse.ok || !cancelPayload.success) {
        throw new Error(cancelPayload.error || 'Failed to cancel the stale W3 job');
      }

      const regenerateResponse = await fetch(
        `/api/admin/orders/${encodeURIComponent(inspectedOrder.orderRow.orderId)}/regenerate-3`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            regeneration_instructions:
              'Triggered from Workflow Jobs Console after canceling a stale active W3 job',
          }),
        },
      );
      const regeneratePayload = (await regenerateResponse.json()) as { success?: boolean; error?: string };
      if (!regenerateResponse.ok || !regeneratePayload.success) {
        throw new Error(regeneratePayload.error || 'Canceled the stale job, but failed to queue a fresh W3 run');
      }

      await Promise.all([
        fetchData({
          orderId: selectedOrderId,
          stage: selectedStage,
          status: selectedStatus,
        }),
        fetchAlerts({ stage: selectedStage }),
      ]);
      setBanner({
        tone: 'info',
        message:
          `Canceled stuck W3 job ${inspectionDiagnosis.jobId} and queued a fresh W3 run. ` +
          'If your router is manual, run it once more so the new W3 job gets picked up.',
      });
    } catch (error) {
      console.error('Failed to recover W3 job:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to recover the stuck W3 job',
      });
    } finally {
      setRecoveringJobId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-800">
              <Workflow className="h-4 w-4" />
              Workflow Ops Console
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Workflow runs and stuck-job diagnosis</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Use this page to see whether a repo-centric job is queued, actively working, waiting on a provider, or
              stuck before it ever reached the provider. Data comes directly from the shared `workflow_jobs` spine and
              auto-refreshes every 60 seconds.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunWatchdog}
              disabled={runningWatchdog}
              className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className={`mr-2 h-4 w-4 ${runningWatchdog ? 'animate-pulse' : ''}`} />
              {runningWatchdog ? 'Scanning…' : 'Scan for Stuck Jobs'}
            </button>
            <button
              onClick={() =>
                fetchData({
                  orderId: selectedOrderId,
                  stage: selectedStage,
                  status: selectedStatus,
                })
              }
              disabled={loading}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="text-sm text-gray-500">
              Last updated: {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Loading...'} • auto-refresh 60s
            </div>
          </div>
        </div>

        {banner && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              banner.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}
          >
            {banner.message}
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Workflow tools</h2>
            <p className="mt-1 text-sm text-gray-600">
              Use this page first to diagnose the run, then jump into a specialized recovery or production tool only if
              the diagnosis points there.
            </p>
          </div>
          <div className="grid gap-3 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
            {WORKFLOW_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 transition hover:border-indigo-200 hover:bg-indigo-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                    <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 transition group-hover:text-indigo-600" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {data && (
          <div className="mb-6 grid gap-4 md:grid-cols-5">
            <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                Active Now
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.activeCount}</div>
              <p className="mt-2 text-sm text-gray-600">
                Jobs still queued, claimed, running, polling, or waiting to retry.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Waiting to Retry
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.retryWaitingCount}</div>
              <p className="mt-2 text-sm text-gray-600">
                Jobs that have already failed once and are waiting for another attempt.
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                Failed / Blocked
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{attentionCount}</div>
              <p className="mt-2 text-sm text-gray-600">
                Failed, dead-lettered, or retry-waiting jobs in the current 72 hour window.
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                Watchdog Alerts
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{openAlertCount}</div>
              <p className="mt-2 text-sm text-gray-600">
                Durable workflow alerts from the watchdog and provider lifecycle checks.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Finished
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.succeededCount}</div>
              <p className="mt-2 text-sm text-gray-600">
                Visible completed jobs across the current filter set.
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Open workflow alerts</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Durable alerts from the watchdog and provider lifecycle checks. These are helpful, but a live job can
                  still look wrong before a watchdog scan has opened an alert.
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {alertsData
                  ? `${alertsData.summary.openCount} open • ${alertsData.summary.criticalCount} critical • ${alertsData.summary.warningCount} warning`
                  : 'Loading alert summary...'}
              </div>
            </div>
            {lastWatchdogRun && (
              <div className="mt-3 text-xs text-gray-500">
                Last manual watchdog run {formatTimestamp(lastWatchdogRun.ranAt)} • scanned{' '}
                {lastWatchdogRun.summary.scannedJobCount} • detected {lastWatchdogRun.summary.conditionCount}{' '}
                conditions • open now {lastWatchdogRun.summary.openAlertCountAfterRun} • resolved{' '}
                {lastWatchdogRun.summary.resolvedAlertCount}
              </div>
            )}
          </div>

          {alertsData?.storageMode === 'fallback' && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              Alert persistence is running in fallback mode because the `workflow_alerts` table is not available yet.
              Apply the database migration before relying on durable acknowledgements or alert history.
            </div>
          )}

          {alertsLoading && !alertsData ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-gray-400" />
              Loading workflow alerts...
            </div>
          ) : alertsData && alertsData.alerts.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              No open workflow alerts for the current filter.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {alertsData?.alerts.map((alert) => (
                <div key={alert.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${alertSeverityClasses(alert.severity)}`}>
                          {alert.severity}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${alertStatusClasses(alert.status)}`}>
                          {alert.status}
                        </span>
                        {alert.stage && (
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${stageClasses(stageDisplayLabel(alert.stage))}`}>
                            {stageDisplayLabel(alert.stage)}
                          </span>
                        )}
                        <span className="text-sm font-medium text-gray-900">{humanizeMachineValue(alert.alert_type)}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium text-gray-900">{alert.summary}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        first seen {formatTimestamp(alert.first_seen_at)} • last seen {formatRelativeAge(alert.last_seen_at)}
                      </div>
                      {alert.job && (
                        <div className="mt-2 text-xs text-gray-600">
                          job {alert.job.id} • {alert.job.jobType} • {alert.job.orderId || alert.job.rootOrderId || 'no order id'}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(alert.job?.orderId || alert.job?.rootOrderId || alert.job?.amazonOrderId) && (
                        <button
                          onClick={() =>
                            replaceUrl({
                              orderId:
                                alert.job?.orderId ||
                                alert.job?.rootOrderId ||
                                alert.job?.amazonOrderId ||
                                '',
                              stage: selectedStage,
                              status: selectedStatus,
                            })
                          }
                          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                        >
                          Inspect Job
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleAcknowledgeAlert(alert.id)}
                        disabled={acknowledgingAlertId === alert.id}
                        className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {acknowledgingAlertId === alert.id ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCheck className="mr-2 h-4 w-4" />
                        )}
                        Acknowledge
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <form className="grid gap-4 lg:grid-cols-[1.6fr_0.7fr_0.7fr_auto]" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Inspect one order</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <input
                  value={draftOrderId}
                  onChange={(event) => setDraftOrderId(event.target.value)}
                  placeholder="Paste orderId, Amazon order id, or root group id"
                  className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Stage</label>
              <select
                value={draftStage}
                onChange={(event) => setDraftStage(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500"
              >
                {STAGE_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={draftStatus}
                onChange={(event) => setDraftStatus(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 lg:self-end">
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <Search className="mr-2 h-4 w-4" />
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftOrderId('');
                  setDraftStage('');
                  setDraftStatus('');
                  replaceUrl({
                    orderId: '',
                    stage: '',
                    status: '',
                  });
                }}
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        {inspectedOrder && (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Order Inspection
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <h2 className="text-2xl font-semibold text-gray-900">{inspectedOrder.requestedOrderId}</h2>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                      matched by {humanizeMachineValue(inspectedOrder.resolvedVia)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {inspectedOrder.jobs.length} related workflow job{inspectedOrder.jobs.length !== 1 ? 's' : ''} • last
                    activity {formatRelativeAge(inspectedOrder.latestJobUpdateAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {inspectedOrder.orderRow?.orderId && (
                    <Link
                      href={`/orders/${inspectedOrder.orderRow.orderId}`}
                      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      Open Order Detail
                    </Link>
                  )}
                  {inspectionDiagnosis?.canRecoverW3 && (
                    <button
                      onClick={handleRecoverStuckW3}
                      disabled={recoveringJobId === inspectionDiagnosis.jobId}
                      className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {recoveringJobId === inspectionDiagnosis.jobId ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <AlertTriangle className="mr-2 h-4 w-4" />
                      )}
                      Recover Stuck W3
                    </button>
                  )}
                  {inspectedHasW2A && (
                    <Link
                      href={`/admin/w2a-recovery?orderId=${encodeURIComponent(inspectedOrder.requestedOrderId)}`}
                      className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
                    >
                      Open W2A Recovery
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {inspectionDiagnosis && (
              <div className="border-t border-gray-200 px-5 py-4">
                <div className={`rounded-xl border px-4 py-4 ${diagnosisClasses(inspectionDiagnosis.tone)}`}>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em]">Current diagnosis</div>
                  <div className="mt-2 text-lg font-semibold">{inspectionDiagnosis.title}</div>
                  <p className="mt-2 text-sm">{inspectionDiagnosis.detail}</p>
                  {inspectionDiagnosis.recommendation && (
                    <p className="mt-2 text-sm font-medium">{inspectionDiagnosis.recommendation}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1fr_1.2fr]">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Order Row
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-gray-900">
                      <div>Workflow step: {humanizeMachineValue(inspectedOrder.orderRow?.workflowStep)}</div>
                      <div>Execution status: {humanizeMachineValue(inspectedOrder.orderRow?.executionStatus)}</div>
                      <div>Current workflow: {humanizeMachineValue(inspectedOrder.orderRow?.currentWorkflow)}</div>
                      <div>Next workflow: {humanizeMachineValue(inspectedOrder.orderRow?.nextWorkflow)}</div>
                      <div>Order status: {humanizeMachineValue(inspectedOrder.orderRow?.status)}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Job Counts
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-gray-900">
                      <div>{inspectedOrder.activeCount} active</div>
                      <div>{inspectedOrder.retryWaitingCount} retry waiting</div>
                      <div>{inspectedOrder.failedCount + inspectedOrder.deadLetteredCount} failed or dead-lettered</div>
                      <div>{inspectedOrder.succeededCount} succeeded</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Layers3 className="h-4 w-4 text-gray-500" />
                    Stage / Status Mix
                  </div>
                  <div className="space-y-3 text-sm text-gray-700">
                    <div>stages: {summarizeCounts(inspectedOrder.stageCounts)}</div>
                    <div>statuses: {summarizeCounts(inspectedOrder.statusCounts)}</div>
                    <div>order row updated: {formatTimestamp(inspectedOrder.orderRow?.updatedAt || null)}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Clock3 className="h-4 w-4 text-gray-500" />
                    Manifest State
                  </div>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>2A manifest: {inspectedOrder.orderRow?.manifest2aUrl || 'Missing'}</div>
                    <div>W3 manifest: {inspectedOrder.orderRow?.manifest3Url || 'Missing'}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">
                  Related Jobs
                </div>
                <div className="max-h-[38rem] overflow-y-auto">
                  {inspectedOrder.jobs.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-gray-500">
                      No workflow jobs found for this order.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {inspectedOrder.jobs.map((job) => (
                        <div key={job.id} className="px-4 py-4">
                          {(() => {
                            const diagnosis = deriveJobDiagnosis(job);
                            return (
                              <>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${stageClasses(job.stage)}`}>
                                  {job.stage}
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(job.status)}`}>
                                  {job.status}
                                </span>
                                <span className="text-sm font-medium text-gray-900">{job.jobType}</span>
                              </div>
                              <div className="mt-2 text-sm text-gray-600">{job.logicalKey}</div>
                              {job.lastErrorMessage && (
                                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                  {job.lastErrorMessage}
                                </div>
                              )}
                              {job.openAlertSummary.openCount > 0 && (
                                <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                                  {job.openAlertSummary.openCount} open alert
                                  {job.openAlertSummary.openCount !== 1 ? 's' : ''} •{' '}
                                  {job.openAlertSummary.latestSummary || 'workflow attention required'}
                                </div>
                              )}
                              {diagnosis && (
                                <div className={`mt-2 rounded-md border px-3 py-2 text-sm ${diagnosisClasses(diagnosis.tone)}`}>
                                  <div className="font-medium">{diagnosis.headline}</div>
                                  <div className="mt-1 text-xs">{diagnosis.detail}</div>
                                </div>
                              )}
                            </div>

                            <div className="text-sm text-gray-600 lg:text-right">
                              <div>updated {formatRelativeAge(job.updatedAt)}</div>
                              <div className="mt-1 text-xs text-gray-500">{formatTimestamp(job.updatedAt)}</div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg bg-gray-50 p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                                Attempts / Provider
                              </div>
                              <div className="space-y-2 text-sm text-gray-700">
                                {job.providerSummary && (
                                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                                    <div className="font-medium text-gray-900">
                                      {formatProviderName(job.providerSummary.provider) || 'provider'} •{' '}
                                      {job.providerSummary.latestStatus || 'no provider status yet'}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500">
                                      {getProviderRequestId(job)
                                        ? `request ${getProviderRequestId(job)}`
                                        : 'no provider request id recorded'}
                                      {job.providerSummary.webhookDeliveryState
                                        ? ` • webhook ${job.providerSummary.webhookDeliveryState}`
                                        : ''}
                                    </div>
                                  </div>
                                )}
                                {job.attempts.length === 0 ? (
                                  <div>No attempts recorded.</div>
                                ) : (
                                  job.attempts.map((attempt) => (
                                    <div key={attempt.id} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                                      <div className="font-medium text-gray-900">
                                        attempt {attempt.attempt} • {attempt.status}
                                      </div>
                                      <div className="mt-1 text-xs text-gray-500">
                                        started {formatTimestamp(attempt.startedAt)}
                                      </div>
                                      {attempt.errorMessage && (
                                        <div className="mt-2 text-xs text-red-700">{attempt.errorMessage}</div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="rounded-lg bg-gray-50 p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                                Recent Events / Routing
                              </div>
                              <div className="space-y-2 text-sm text-gray-700">
                                {job.correlation && (
                                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                                    source {job.correlation.sourceSystem || 'n/a'}
                                    {job.correlation.sourceExecutionId
                                      ? ` • exec ${job.correlation.sourceExecutionId}`
                                      : ''}
                                    {job.correlation.rootGroupId
                                      ? ` • group ${job.correlation.rootGroupId}`
                                      : ''}
                                  </div>
                                )}
                                {job.recentEvents.length === 0 ? (
                                  <div>No events recorded.</div>
                                ) : (
                                  job.recentEvents.map((event) => (
                                    <div key={event.id} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                                      <div className="font-medium text-gray-900">{humanizeMachineValue(event.eventType)}</div>
                                      <div className="mt-1 text-xs text-gray-500">
                                        {formatTimestamp(event.createdAt)}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent runs</h2>
            <p className="mt-1 text-sm text-gray-600">
              Filtered live view across the last 72 hours unless you inspect a specific order.
            </p>
          </div>

          {loading && !data ? (
            <div className="px-5 py-12 text-center text-sm text-gray-500">
              <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-gray-400" />
              Loading workflow jobs...
            </div>
          ) : data && data.jobs.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <div className="mt-3 text-lg font-medium text-gray-900">No jobs match this filter</div>
              <p className="mt-2 text-sm text-gray-500">
                Try widening the time window by clearing filters or inspecting a specific order.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Stage / Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Order / Job
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Health / Provider
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Latest Event
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Updated
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Inspect
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {data?.jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4 text-sm text-gray-900">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${stageClasses(job.stage)}`}>
                            {job.stage}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(job.status)}`}>
                            {job.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{job.orderId || 'No orderId'}</div>
                        <div className="mt-1 text-xs text-gray-500">{job.jobType}</div>
                        <div className="mt-1 max-w-md truncate text-xs text-gray-400">{job.logicalKey}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        {(() => {
                          const diagnosis = deriveJobDiagnosis(job);
                          return (
                            <>
                        <div>
                          {diagnosis?.headline || `${job.attemptCount} / ${job.maxAttempts} attempts`}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {formatProviderName(job.providerSummary?.provider || job.externalProvider || 'No provider')}
                          {getProviderRequestId(job) ? ` • ${getProviderRequestId(job)}` : ' • no provider request id'}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {diagnosis?.detail || job.providerSummary?.latestStatus || 'No provider status yet'}
                        </div>
                        <div className="mt-1 text-xs text-rose-700">
                          {job.openAlertSummary.openCount > 0
                            ? `${job.openAlertSummary.openCount} open alert${job.openAlertSummary.openCount !== 1 ? 's' : ''}`
                            : 'No open alerts'}
                        </div>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        <div>{humanizeMachineValue(job.latestEvent?.eventType) || 'No events'}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {job.recentEventTypes
                            .slice(0, 4)
                            .map((eventType) => humanizeMachineValue(eventType))
                            .join(' • ') || 'No recent event types'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        <div>{formatRelativeAge(job.updatedAt)}</div>
                        <div className="mt-1 text-xs text-gray-500">{formatTimestamp(job.updatedAt)}</div>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        {job.orderId ? (
                          <button
                            onClick={() =>
                              replaceUrl({
                                orderId: job.orderId || '',
                                stage: selectedStage,
                                status: selectedStatus,
                              })
                            }
                            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                          >
                            Inspect
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">No orderId</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-indigo-700" />
            <div className="text-sm text-indigo-900">
              <div className="font-semibold">How to read this console</div>
              <p className="mt-1">
                Start here whenever a workflow feels slow or stuck. If a row says a job is “stuck before provider
                submission,” it means the provider was never contacted, so reruns can be blocked until the stale active
                job is cleared. Dedicated recovery pages still exist, but this console should tell you why you need
                them before you leave.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowJobsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 px-4 py-12 text-center text-sm text-gray-500">
          Loading workflow jobs...
        </div>
      }
    >
      <WorkflowJobsPageContent />
    </Suspense>
  );
}
