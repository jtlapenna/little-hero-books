'use client';

import { Suspense, startTransition, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Clock3,
  LifeBuoy,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react';

type RecoveryAction = 'finalize' | 'replay' | 'inspect' | 'monitor' | 'none';

type RecoveryCandidate = {
  orderRowId: number;
  orderId: string;
  rootOrderId: string | null;
  executionStatus: string | null;
  currentWorkflow: string | null;
  workflowStep: string | null;
  manifest2aUrl: string | null;
  oneManifestUrl: string | null;
  updatedAt: string | null;
  latestJobUpdateAt: string | null;
  minutesSinceLatestJobUpdate: number | null;
  alreadyCompleted: boolean;
  allSucceeded: boolean;
  hasIncompleteJobs: boolean;
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
  manifestReachableUrl: string | null;
  safeToFinalize: boolean;
  safeToReplay: boolean;
  payloadRecoverable: boolean;
  workflow: {
    id: string;
    name: string;
    active: boolean;
    isArchived: boolean;
  } | null;
  matchedExecution: {
    id: string;
    status: string;
    startedAt: string;
    finished: boolean;
    stoppedAt: string | null;
  } | null;
  executionLookupError: string | null;
  replayableLogicalKeys: string[];
  pendingLogicalKeys: string[];
};

type RecoveryResponse = {
  success: boolean;
  summary: {
    candidateCount: number;
    finalizeReady: number;
    replayReady: number;
    inspectNeeded: number;
  };
  candidates: RecoveryCandidate[];
  inspectedOrder: RecoveryInspection | null;
  inspectionError: string | null;
  error?: string;
};

type ActionResponse = {
  success?: boolean;
  action?: 'replay' | 'finalize';
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
  if (entries.length === 0) {
    return 'No jobs';
  }
  return entries
    .map(([status, count]) => `${status}:${count}`)
    .join(' • ');
}

function actionLabel(action: RecoveryAction): string {
  switch (action) {
    case 'finalize':
      return 'Finalize 2A';
    case 'replay':
      return 'Replay Remaining';
    case 'inspect':
      return 'Inspect Manifest';
    case 'monitor':
      return 'Still Running';
    default:
      return 'Healthy';
  }
}

function actionClasses(action: RecoveryAction): string {
  switch (action) {
    case 'finalize':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'replay':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'inspect':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    case 'monitor':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function W2ARecoveryPageContent() {
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

      const response = await fetch(`/api/admin/w2a-recovery?${params.toString()}`);
      const payload = (await response.json()) as RecoveryResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load W2A recovery data');
      }

      setData(payload);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load W2A recovery data:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to load W2A recovery data',
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
        router.replace('/admin/w2a-recovery');
        return;
      }
      router.replace(`/admin/w2a-recovery?orderId=${encodeURIComponent(trimmed)}`);
    });
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    setOrderIdInUrl(draftOrderId);
  };

  const runAction = async (action: 'replay' | 'finalize') => {
    if (!selectedOrderId) {
      return;
    }

    setActing(true);
    setBanner(null);
    try {
      const response = await fetch('/api/admin/w2a-recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          orderId: selectedOrderId,
          waitSeconds: action === 'replay' ? 8 : undefined,
        }),
      });
      const payload = (await response.json()) as ActionResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Failed to ${action} order`);
      }

      setBanner({
        tone: 'success',
        message:
          action === 'finalize'
            ? `Finalized ${selectedOrderId} through the existing 2A completion path.`
            : `Replayed ${selectedOrderId} through the live 2a-start-repo route.`,
      });
      await fetchData(selectedOrderId);
    } catch (error) {
      console.error(`Failed to ${action} order:`, error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : `Failed to ${action} order`,
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
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800">
              <LifeBuoy className="h-4 w-4" />
              W2A Recovery Console
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Replay and finalize stale 2A runs</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              This page flags partial `W2A` runs, shows when all pose jobs finished but the parent stage
              did not close, and gives operators a safe one-click recovery path.
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
                Finalize Ready
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.finalizeReady}</div>
              <p className="mt-2 text-sm text-gray-600">
                Orders where every `W2A` job succeeded but the parent row still needs closure.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Replay Ready
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.replayReady}</div>
              <p className="mt-2 text-sm text-gray-600">
                Orders where partial `W2A` child jobs need a safe replay instead of a full restart.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                Inspect First
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">{data.summary.inspectNeeded}</div>
              <p className="mt-2 text-sm text-gray-600">
                Orders where all pose jobs look done but the manifest or parent closure still needs checking.
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <form className="flex flex-col gap-3 lg:flex-row lg:items-end" onSubmit={handleSearchSubmit}>
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Inspect specific per-item orderId
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <input
                  value={draftOrderId}
                  onChange={(event) => setDraftOrderId(event.target.value)}
                  placeholder="W2A-TOP-PROD-20260326171410"
                  className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm outline-none ring-0 transition focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <Search className="mr-2 h-4 w-4" />
                Inspect Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftOrderId('');
                  setOrderIdInUrl('');
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
                    Inspected Order
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <h2 className="text-2xl font-semibold text-gray-900">{inspectedOrder.orderId}</h2>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${actionClasses(
                        inspectedOrder.recommendedAction,
                      )}`}
                    >
                      {actionLabel(inspectedOrder.recommendedAction)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {inspectedOrder.recommendedReason.replaceAll('_', ' ')}. Resolved via{' '}
                    <span className="font-medium text-gray-800">{inspectedOrder.resolvedVia}</span>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => runAction('finalize')}
                    disabled={!inspectedOrder.safeToFinalize || acting}
                    className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Finalize 2A
                  </button>
                  <button
                    onClick={() => runAction('replay')}
                    disabled={!inspectedOrder.safeToReplay || acting}
                    className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Replay Remaining
                  </button>
                  <Link
                    href={`/orders/${inspectedOrder.orderId}`}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Open Order Detail
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Parent Stage
                    </div>
                    <div className="mt-3 text-sm text-gray-900">
                      <div>workflow_step: {inspectedOrder.workflowStep || 'N/A'}</div>
                      <div>execution_status: {inspectedOrder.executionStatus || 'N/A'}</div>
                      <div>current_workflow: {inspectedOrder.currentWorkflow || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Job Snapshot
                    </div>
                    <div className="mt-3 text-sm text-gray-900">
                      <div>{inspectedOrder.jobCounts.succeededCount} / {inspectedOrder.jobCounts.total} succeeded</div>
                      <div>{inspectedOrder.jobCounts.activeCount} active or queued</div>
                      <div>{inspectedOrder.jobCounts.failedCount + inspectedOrder.jobCounts.retryWaitingCount + inspectedOrder.jobCounts.deadLetteredCount + inspectedOrder.jobCounts.canceledCount} recovery signals</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Recovery Gates
                    </div>
                    <div className="mt-3 text-sm text-gray-900">
                      <div>manifest reachable: {inspectedOrder.manifestReachableUrl ? 'yes' : 'no'}</div>
                      <div>payload recoverable: {inspectedOrder.payloadRecoverable ? 'yes' : 'no'}</div>
                      <div>workflow active: {inspectedOrder.workflow?.active ? 'yes' : 'no'}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200">
                  <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">
                    Workflow Jobs
                  </div>
                  <div className="px-4 py-4 text-sm text-gray-700">
                    <div className="mb-3">{summarizeStatuses(inspectedOrder.jobCounts.statuses)}</div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                          Reusable Pose Jobs
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                          {inspectedOrder.replayableLogicalKeys.length > 0
                            ? inspectedOrder.replayableLogicalKeys.join(', ')
                            : 'None yet'}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                          Remaining Logical Keys
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                          {inspectedOrder.pendingLogicalKeys.length > 0
                            ? inspectedOrder.pendingLogicalKeys.join(', ')
                            : 'No remaining jobs'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Clock3 className="h-4 w-4 text-gray-500" />
                    Timing
                  </div>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>Last job activity: {formatTimestamp(inspectedOrder.latestJobUpdateAt)}</div>
                    <div>Stale age: {formatAge(inspectedOrder.minutesSinceLatestJobUpdate)}</div>
                    <div>Order row updated: {formatTimestamp(inspectedOrder.updatedAt)}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <ShieldAlert className="h-4 w-4 text-gray-500" />
                    Parent Completion
                  </div>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>manifest_2a_url: {inspectedOrder.manifest2aUrl || 'N/A'}</div>
                    <div>reachable manifest: {inspectedOrder.manifestReachableUrl || 'N/A'}</div>
                    <div>safe to finalize: {inspectedOrder.safeToFinalize ? 'yes' : 'no'}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Wrench className="h-4 w-4 text-gray-500" />
                    n8n Context
                  </div>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>
                      top workflow: {inspectedOrder.workflow ? `${inspectedOrder.workflow.name} (${inspectedOrder.workflow.active ? 'active' : 'inactive'})` : 'Unavailable'}
                    </div>
                    <div>
                      matched execution:{' '}
                      {inspectedOrder.matchedExecution
                        ? `${inspectedOrder.matchedExecution.id} · ${inspectedOrder.matchedExecution.status}`
                        : 'None found'}
                    </div>
                    {inspectedOrder.executionLookupError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                        {inspectedOrder.executionLookupError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {data?.inspectionError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {data.inspectionError}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent actionable `W2A` candidates</h2>
            <p className="mt-1 text-sm text-gray-600">
              This list only shows stale or incomplete `W2A` orders that look actionable right now.
            </p>
          </div>

          {loading && !data ? (
            <div className="px-5 py-12 text-center text-sm text-gray-500">
              <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-gray-400" />
              Loading W2A recovery candidates...
            </div>
          ) : data && data.candidates.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <div className="mt-3 text-lg font-medium text-gray-900">No actionable `W2A` recovery items</div>
              <p className="mt-2 text-sm text-gray-500">
                Recent `W2A` runs are either healthy, still active, or already closed.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Order
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Child Jobs
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Parent State
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Last Activity
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Recommendation
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Open
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {data?.candidates.map((candidate) => (
                    <tr key={candidate.orderId} className="hover:bg-gray-50">
                      <td className="px-5 py-4 text-sm text-gray-900">
                        <div className="font-medium">{candidate.orderId}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          root: {candidate.rootOrderId || 'N/A'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        <div>{candidate.jobCounts.succeededCount} / {candidate.jobCounts.total} succeeded</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {summarizeStatuses(candidate.jobCounts.statuses)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        <div>step: {candidate.workflowStep || 'N/A'}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          status: {candidate.executionStatus || 'N/A'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        <div>{formatAge(candidate.minutesSinceLatestJobUpdate)}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {formatTimestamp(candidate.latestJobUpdateAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${actionClasses(candidate.recommendedAction)}`}>
                          {actionLabel(candidate.recommendedAction)}
                        </span>
                        <div className="mt-2 text-xs text-gray-500">
                          {candidate.recommendedReason.replaceAll('_', ' ')}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <button
                          onClick={() => setOrderIdInUrl(candidate.orderId)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function W2ARecoveryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="mx-auto max-w-7xl px-4 py-12 text-sm text-gray-500 sm:px-6 lg:px-8">
            Loading W2A recovery console...
          </div>
        </div>
      }
    >
      <W2ARecoveryPageContent />
    </Suspense>
  );
}
