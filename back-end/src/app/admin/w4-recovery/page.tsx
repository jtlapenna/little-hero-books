'use client';

import { Suspense, startTransition, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Clock3,
  LifeBuoy,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

type RecoveryAction = 'replay' | 'inspect' | 'monitor' | 'none';

type RecoveryCandidate = {
  orderRowId: number;
  orderId: string;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  executionStatus: string | null;
  currentWorkflow: string | null;
  workflowStep: string | null;
  orderStatus: string | null;
  nextWorkflow: string | null;
  luluJobId: string | null;
  luluStatus: string | null;
  printSubmittedAt: string | null;
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

function W4RecoveryPageContent() {
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

      const response = await fetch(`/api/admin/w4-recovery?${params.toString()}`);
      const payload = (await response.json()) as RecoveryResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load W4 recovery data');
      }

      setData(payload);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load W4 recovery data:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to load W4 recovery data',
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
        router.replace('/admin/w4-recovery');
        return;
      }
      router.replace(`/admin/w4-recovery?orderId=${encodeURIComponent(trimmed)}`);
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
      const response = await fetch('/api/admin/w4-recovery', {
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
        throw new Error(payload.error || 'Failed to replay W4 order');
      }

      setBanner({
        tone: 'success',
        message:
          `Replayed ${selectedOrderId} through the live sandbox-only ` +
          '`w4-pdf-print-repo` route.',
      });
      await fetchData(selectedOrderId);
    } catch (error) {
      console.error('Failed to replay W4 order:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to replay W4 order',
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
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
              <LifeBuoy className="h-4 w-4" />
              W4 Sandbox Recovery
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Inspect and replay safe W4 failures</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              This console is intentionally sandbox-only. It will inspect recent single-order `W4`
              workflow jobs and only allow replay when the order has no real Lulu submission state.
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
              Last updated: {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Loading...'}
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

        {data && (
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Replay Ready
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.replayReady}</div>
              <p className="mt-2 text-sm text-gray-600">
                Failed `W4` jobs with no real Lulu submission signal and a safe sandbox replay path.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Inspect Only
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.inspectOnly}</div>
              <p className="mt-2 text-sm text-gray-600">
                Orders that need manual review because they already show Lulu submission state or a
                stale active run.
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                Active Monitor
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.activeMonitor}</div>
              <p className="mt-2 text-sm text-gray-600">
                Runs that still look live and should be watched before forcing a replay.
              </p>
            </div>
          </div>
        )}

        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="order-search" className="block text-sm font-medium text-gray-700">
                Inspect Order
              </label>
              <input
                id="order-search"
                type="text"
                value={draftOrderId}
                onChange={(event) => setDraftOrderId(event.target.value)}
                placeholder="Enter per-book orderId, root order ID, or row ID"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Search className="mr-2 h-4 w-4" />
              Inspect
            </button>
          </form>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Recent W4 Recovery Candidates</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Recent stage-`4` jobs that are not currently healthy. Successful sandbox completions
                  are intentionally excluded.
                </p>
              </div>
              {data && (
                <div className="text-sm text-gray-500">
                  {data.summary.candidateCount} candidate{data.summary.candidateCount !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {loading && <div className="text-sm text-gray-500">Loading W4 recovery candidates…</div>}

              {!loading && data?.candidates.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
                  No current `W4` recovery candidates in the recent window.
                </div>
              )}

              {data?.candidates.map((candidate) => (
                <button
                  key={`${candidate.orderRowId}:${candidate.orderId}`}
                  type="button"
                  onClick={() => setOrderIdInUrl(candidate.orderId)}
                  className="w-full rounded-xl border border-gray-200 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{candidate.orderId}</span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${actionClasses(candidate.recommendedAction)}`}
                        >
                          {actionLabel(candidate.recommendedAction)}
                        </span>
                        {candidate.hasRealSubmission && (
                          <span className="rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                            Real Lulu Signal Present
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-sm text-gray-600">
                        latest job: {candidate.latestJobStatus ?? 'n/a'} • updated{' '}
                        {formatAge(candidate.minutesSinceLatestJobUpdate)} • reason:{' '}
                        {candidate.recommendedReason}
                      </p>

                      {candidate.latestErrorMessage && (
                        <p className="mt-2 text-sm text-red-700">{candidate.latestErrorMessage}</p>
                      )}
                    </div>

                    <div className="text-sm text-gray-500">
                      jobs: {summarizeStatuses(candidate.jobCounts.statuses)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              <h2 className="text-xl font-semibold text-gray-900">Selected Order</h2>
            </div>

            {!inspectedOrder && !loading && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
                Search for an order or pick a candidate to inspect its stage-`4` recovery state.
              </div>
            )}

            {inspectedOrder && (
              <div className="space-y-5">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-gray-900">{inspectedOrder.orderId}</span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${actionClasses(inspectedOrder.recommendedAction)}`}
                    >
                      {actionLabel(inspectedOrder.recommendedAction)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
                    <div>workflow step: {inspectedOrder.workflowStep ?? 'n/a'}</div>
                    <div>execution status: {inspectedOrder.executionStatus ?? 'n/a'}</div>
                    <div>order status: {inspectedOrder.orderStatus ?? 'n/a'}</div>
                    <div>latest job: {inspectedOrder.latestJobStatus ?? 'n/a'}</div>
                    <div>lulu_job_id: {inspectedOrder.luluJobId ?? 'null'}</div>
                    <div>print_submitted_at: {formatTimestamp(inspectedOrder.printSubmittedAt)}</div>
                    <div>latest job update: {formatTimestamp(inspectedOrder.latestJobUpdateAt)}</div>
                    <div>resolved via: {inspectedOrder.resolvedVia}</div>
                  </div>

                  <div className="mt-3 text-sm text-gray-600">
                    job counts: {summarizeStatuses(inspectedOrder.jobCounts.statuses)}
                  </div>

                  {inspectedOrder.latestErrorMessage && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {inspectedOrder.latestErrorMessage}
                    </div>
                  )}
                </div>

                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    inspectedOrder.safeToReplay
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {inspectedOrder.safeToReplay ? (
                      <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" />
                    ) : (
                      <ShieldAlert className="mt-0.5 h-4 w-4 flex-none" />
                    )}
                    <div>
                      <div className="font-semibold">
                        {inspectedOrder.safeToReplay
                          ? 'Replay is allowed'
                          : 'Replay is blocked'}
                      </div>
                      <p className="mt-1">
                        This tool only replays through the sandbox-only `{inspectedOrder.replayWebhookPath}`
                        {' '}path and refuses any order that already shows Lulu submission state.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Clock3 className="h-4 w-4 text-gray-500" />
                    Workflow Status
                  </div>
                  {inspectedOrder.workflow ? (
                    <div className="space-y-1 text-sm text-gray-700">
                      <div>{inspectedOrder.workflow.name}</div>
                      <div>
                        active: {inspectedOrder.workflow.active ? 'yes' : 'no'} • archived:{' '}
                        {inspectedOrder.workflow.isArchived ? 'yes' : 'no'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      {inspectedOrder.executionLookupError || 'Workflow status unavailable'}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={runReplay}
                    disabled={!inspectedOrder.safeToReplay || acting}
                    className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw className={`mr-2 h-4 w-4 ${acting ? 'animate-spin' : ''}`} />
                    Replay W4 in Sandbox
                  </button>

                  <Link
                    href={`/admin/workflow-jobs?orderId=${encodeURIComponent(inspectedOrder.orderId)}`}
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Open Workflow Jobs
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function W4RecoveryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-gray-500 sm:px-6 lg:px-8">
            Loading W4 sandbox recovery…
          </div>
        </div>
      }
    >
      <W4RecoveryPageContent />
    </Suspense>
  );
}
