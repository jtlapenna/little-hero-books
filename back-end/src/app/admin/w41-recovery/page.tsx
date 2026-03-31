'use client';

import { Suspense, startTransition, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';

type RecoveryAction = 'replay' | 'inspect' | 'monitor' | 'none';

type RecoveryCandidate = {
  rootGroupId: string;
  siblingCount: number;
  orderIds: string[];
  executionStatus: string | null;
  currentWorkflow: string | null;
  workflowStep: string | null;
  orderStatus: string | null;
  nextWorkflow: string | null;
  luluJobIds: string[];
  luluStatuses: string[];
  printSubmittedCount: number;
  updatedAt: string | null;
  latestJobStatus: string | null;
  latestJobUpdateAt: string | null;
  minutesSinceLatestJobUpdate: number | null;
  hasRealSubmission: boolean;
  latestErrorMessage: string | null;
  recommendedAction: RecoveryAction;
  recommendedReason: string;
  jobCounts: {
    total: number;
    statuses: Record<string, number>;
    activeCount: number;
    succeededCount: number;
    failedCount: number;
    retryWaitingCount: number;
    deadLetteredCount: number;
    canceledCount: number;
  };
};

type RecoveryInspection = RecoveryCandidate & {
  resolvedVia: string;
  safeToReplay: boolean;
  workflow: {
    id: string;
    name: string;
    active: boolean;
    isArchived: boolean;
  } | null;
  executionLookupError: string | null;
  replayWebhookPath: string;
  replaySafetyMode: 'sandbox-only';
};

type RecoveryResponse = {
  success: boolean;
  summary: {
    candidateCount: number;
    replayReady: number;
    inspectOnly: number;
    activeMonitor: number;
  };
  candidates: RecoveryCandidate[];
  inspectedOrder: RecoveryInspection | null;
  inspectionError: string | null;
  error?: string;
};

type ActionResponse = {
  success?: boolean;
  action?: 'replay';
  error?: string;
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'N/A';
  }
  return new Date(value).toLocaleString();
}

function formatAge(minutes: number | null): string {
  if (minutes === null) {
    return 'N/A';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ago`;
}

function summarizeStatuses(statuses: Record<string, number>): string {
  const entries = Object.entries(statuses);
  if (!entries.length) {
    return 'No jobs';
  }

  return entries.map(([status, count]) => `${status}:${count}`).join(' • ');
}

function actionLabel(action: RecoveryAction): string {
  switch (action) {
    case 'replay':
      return 'Replay Safe';
    case 'inspect':
      return 'Inspect Only';
    case 'monitor':
      return 'Still Running';
    default:
      return 'Healthy';
  }
}

function actionClasses(action: RecoveryAction): string {
  switch (action) {
    case 'replay':
      return 'border-emerald-200 bg-emerald-100 text-emerald-800';
    case 'inspect':
      return 'border-amber-200 bg-amber-100 text-amber-900';
    case 'monitor':
      return 'border-blue-200 bg-blue-100 text-blue-800';
    default:
      return 'border-gray-200 bg-gray-100 text-gray-700';
  }
}

function W41RecoveryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedOrderId = searchParams.get('orderId')?.trim() ?? '';

  const [draftOrderId, setDraftOrderId] = useState(selectedOrderId);
  const [data, setData] = useState<RecoveryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );

  const fetchData = async (orderId: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        hours: '72',
        limit: '25',
      });
      if (orderId) {
        params.set('orderId', orderId);
      }

      const response = await fetch(`/api/admin/w41-recovery?${params.toString()}`);
      const payload = (await response.json()) as RecoveryResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load W4.1 recovery data');
      }

      setData(payload);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load W4.1 recovery data:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to load W4.1 recovery data',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDraftOrderId(selectedOrderId);
    fetchData(selectedOrderId);

    const interval = window.setInterval(() => {
      fetchData(selectedOrderId);
    }, 60000);

    return () => window.clearInterval(interval);
  }, [selectedOrderId]);

  const setOrderIdInUrl = (orderId: string) => {
    const trimmed = orderId.trim();
    startTransition(() => {
      if (!trimmed) {
        router.replace('/admin/w41-recovery');
        return;
      }
      router.replace(`/admin/w41-recovery?orderId=${encodeURIComponent(trimmed)}`);
    });
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    setOrderIdInUrl(draftOrderId);
  };

  const runReplay = async () => {
    if (!selectedOrderId) {
      return;
    }

    setActing(true);
    setBanner(null);
    try {
      const response = await fetch('/api/admin/w41-recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'replay',
          orderId: selectedOrderId,
          waitSeconds: 8,
        }),
      });
      const payload = (await response.json()) as ActionResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to replay W4.1 sibling group');
      }

      setBanner({
        tone: 'success',
        message:
          `Replayed ${selectedOrderId} through the live sandbox-only ` +
          '`w4-1-sibling-aggregation-repo` route.',
      });
      await fetchData(selectedOrderId);
    } catch (error) {
      console.error('Failed to replay W4.1 sibling group:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to replay W4.1 sibling group',
      });
    } finally {
      setActing(false);
    }
  };

  const inspectedOrder = data?.inspectedOrder ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800">
              <Users className="h-4 w-4" />
              W4.1 Sandbox Recovery
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Inspect and replay safe W4.1 sibling failures</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              This console is sandbox-only. It inspects sibling-group `W4.1` workflow jobs and
              only allows replay when the group has no real Lulu submission state.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData(selectedOrderId)}
              disabled={loading || acting}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="text-sm text-gray-500">
              {lastRefresh ? `Last refresh ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
            </div>
          </div>
        </div>

        {banner && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              banner.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {banner.message}
          </div>
        )}

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-sky-800">Replay Ready</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {data?.summary.replayReady ?? 0}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Failed sibling groups that are still sandbox-safe to rerun.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-amber-800">Inspect Only</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {data?.summary.inspectOnly ?? 0}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Groups with real Lulu state or stale active jobs that need manual review.
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-blue-800">Still Running</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {data?.summary.activeMonitor ?? 0}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Active sibling jobs that do not need intervention yet.
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
              <input
                value={draftOrderId}
                onChange={(event) => setDraftOrderId(event.target.value)}
                placeholder="Search by root group, orderId, or Amazon order id"
                className="w-full rounded-md border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-sky-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
            >
              Inspect Group
            </button>
          </form>
          <p className="mt-3 text-xs text-gray-500">
            Replay will only appear for sandbox-safe groups and never for groups that already show
            Lulu submission state.
          </p>
        </div>

        {inspectedOrder && (
          <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-gray-900">{inspectedOrder.rootGroupId}</h2>
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${actionClasses(inspectedOrder.recommendedAction)}`}>
                    {actionLabel(inspectedOrder.recommendedAction)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Siblings: {inspectedOrder.siblingCount} • Orders: {inspectedOrder.orderIds.join(', ') || 'N/A'}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Latest job: {inspectedOrder.latestJobStatus ?? 'N/A'} • Updated{' '}
                  {formatAge(inspectedOrder.minutesSinceLatestJobUpdate)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/workflow-jobs?orderId=${encodeURIComponent(inspectedOrder.rootGroupId)}`}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Open Shared Run Console
                </Link>
                <button
                  onClick={runReplay}
                  disabled={!inspectedOrder.safeToReplay || acting}
                  className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Replay Safe Group
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Reason</div>
                <div className="mt-2 text-sm text-gray-900">{inspectedOrder.recommendedReason}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Workflow</div>
                <div className="mt-2 text-sm text-gray-900">
                  {inspectedOrder.workflow?.name ?? 'Unavailable'}{' '}
                  {inspectedOrder.workflow
                    ? inspectedOrder.workflow.active
                      ? '(active)'
                      : '(inactive)'
                    : ''}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Submission Guard</div>
                <div className="mt-2 text-sm text-gray-900">
                  {inspectedOrder.hasRealSubmission
                    ? 'Real Lulu state detected'
                    : `${inspectedOrder.replaySafetyMode} only`}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Statuses</div>
                <div className="mt-2 text-sm text-gray-900">
                  {summarizeStatuses(inspectedOrder.jobCounts.statuses)}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Group state</div>
                <dl className="mt-3 space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between gap-4">
                    <dt>Execution status</dt>
                    <dd>{inspectedOrder.executionStatus ?? 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Workflow step</dt>
                    <dd>{inspectedOrder.workflowStep ?? 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Order status</dt>
                    <dd>{inspectedOrder.orderStatus ?? 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Next workflow</dt>
                    <dd>{inspectedOrder.nextWorkflow ?? 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Updated</dt>
                    <dd>{formatTimestamp(inspectedOrder.updatedAt)}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Lulu safety state</div>
                <dl className="mt-3 space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between gap-4">
                    <dt>Print submitted rows</dt>
                    <dd>{inspectedOrder.printSubmittedCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Lulu job ids</dt>
                    <dd>{inspectedOrder.luluJobIds.join(', ') || 'None'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Lulu statuses</dt>
                    <dd>{inspectedOrder.luluStatuses.join(', ') || 'None'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Replay path</dt>
                    <dd>{inspectedOrder.replayWebhookPath}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {inspectedOrder.latestErrorMessage && (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="mb-1 font-medium">Latest error</div>
                <div>{inspectedOrder.latestErrorMessage}</div>
              </div>
            )}

            {!inspectedOrder.safeToReplay && (
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-gray-500" />
                <div>
                  Replay is disabled for this group until the recovery recommendation is `Replay Safe`
                  and no real Lulu submission state is present.
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent W4.1 recovery candidates</h2>
            <p className="mt-1 text-sm text-gray-600">
              Recent sibling groups with actionable `W4.1` workflow-job states.
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {(data?.candidates ?? []).length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No `W4.1` recovery candidates in the selected window.
              </div>
            ) : (
              data?.candidates.map((candidate) => (
                <button
                  key={candidate.rootGroupId}
                  type="button"
                  onClick={() => setOrderIdInUrl(candidate.rootGroupId)}
                  className="w-full px-6 py-4 text-left hover:bg-gray-50"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-semibold text-gray-900">{candidate.rootGroupId}</div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${actionClasses(candidate.recommendedAction)}`}>
                          {actionLabel(candidate.recommendedAction)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {candidate.siblingCount} sibling orders • latest job {candidate.latestJobStatus ?? 'N/A'} •{' '}
                        {formatAge(candidate.minutesSinceLatestJobUpdate)}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {candidate.orderIds.join(', ')}
                      </div>
                    </div>
                    <div className="max-w-sm text-sm text-gray-600">
                      <div>{candidate.recommendedReason}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {summarizeStatuses(candidate.jobCounts.statuses)}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function W41RecoveryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading W4.1 recovery...</div>}>
      <W41RecoveryPageContent />
    </Suspense>
  );
}
