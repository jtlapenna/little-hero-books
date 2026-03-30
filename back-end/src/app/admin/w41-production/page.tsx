'use client';

import { Suspense, startTransition, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  Users,
} from 'lucide-react';

type ProductionAction = 'preflight' | 'inspect' | 'none';

type ProductionCandidate = {
  rootGroupId: string;
  siblingCount: number;
  orderIds: string[];
  orderRowIds: number[];
  amazonOrderId: string | null;
  executionStatus: string | null;
  currentWorkflow: string | null;
  workflowStep: string | null;
  orderStatus: string | null;
  nextWorkflow: string | null;
  luluJobIds: string[];
  luluStatuses: string[];
  printSubmittedCount: number;
  updatedAt: string | null;
  customerApprovalRequiredCount: number;
  customerApprovalApprovedCount: number;
  customerApprovalPendingCount: number;
  proofLike: boolean;
  hasRealSubmission: boolean;
  recommendedAction: ProductionAction;
  recommendedReason: string;
};

type ProductionInspection = ProductionCandidate & {
  resolvedVia: string;
  safeForProductionPilot: boolean;
  inspectionError: string | null;
  preflight: {
    submitMode: 'sandbox' | 'skip';
    luluApiBase: string;
    guard: {
      reason: string;
      details?: string;
    };
    shippingLevelRequested: string | null;
    shippingLevelSent: string;
    shippingTierResolvedReason: string;
    siblingCount: number;
    lineItemCount: number;
    shippingSummary: {
      city: string | null;
      stateCode: string | null;
      countryCode: string | null;
      hasPhone: boolean;
    };
    childSummaries: Array<{
      orderId: string;
      childName: string;
      expectedPageCount: number;
      pdfR2Key: string;
      coverPdfR2Key: string;
    }>;
  } | null;
};

type ProductionResponse = {
  success: boolean;
  summary: {
    candidateCount: number;
    preflightReady: number;
    inspectOnly: number;
  };
  candidates: ProductionCandidate[];
  inspectedGroup: ProductionInspection | null;
  inspectionError: string | null;
  error?: string;
};

type ProductionApprovalResponse = {
  success: boolean;
  approval?: {
    token: string;
    rootGroupId: string;
    approvedAt: string;
    expiresAt: string;
    approvedBy: string;
    ttlMinutes: number;
    secretSource: string;
  };
  error?: string;
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'N/A';
  }
  return new Date(value).toLocaleString();
}

function actionLabel(action: ProductionAction): string {
  switch (action) {
    case 'preflight':
      return 'Preflight Ready';
    case 'inspect':
      return 'Inspect First';
    default:
      return 'Not Eligible';
  }
}

function actionClasses(action: ProductionAction): string {
  switch (action) {
    case 'preflight':
      return 'border-emerald-200 bg-emerald-100 text-emerald-800';
    case 'inspect':
      return 'border-amber-200 bg-amber-100 text-amber-900';
    default:
      return 'border-gray-200 bg-gray-100 text-gray-700';
  }
}

function W41ProductionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRootGroupId = searchParams.get('rootGroupId')?.trim() ?? '';

  const [draftRootGroupId, setDraftRootGroupId] = useState(selectedRootGroupId);
  const [data, setData] = useState<ProductionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [approval, setApproval] = useState<ProductionApprovalResponse['approval'] | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  const fetchData = async (rootGroupId: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        hours: String(24 * 14),
        limit: '25',
      });
      if (rootGroupId) {
        params.set('rootGroupId', rootGroupId);
      }

      const response = await fetch(`/api/admin/w41-production?${params.toString()}`);
      const payload = (await response.json()) as ProductionResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load W4.1 production preflight data');
      }

      setData(payload);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load W4.1 production preflight data:', error);
      setBanner({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load W4.1 production preflight data',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDraftRootGroupId(selectedRootGroupId);
    setApproval(null);
    fetchData(selectedRootGroupId);

    const interval = window.setInterval(() => {
      fetchData(selectedRootGroupId);
    }, 60000);

    return () => window.clearInterval(interval);
  }, [selectedRootGroupId]);

  const setRootGroupIdInUrl = (rootGroupId: string) => {
    const trimmed = rootGroupId.trim();
    startTransition(() => {
      if (!trimmed) {
        router.replace('/admin/w41-production');
        return;
      }
      router.replace(`/admin/w41-production?rootGroupId=${encodeURIComponent(trimmed)}`);
    });
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    setRootGroupIdInUrl(draftRootGroupId);
  };

  const inspectedGroup = data?.inspectedGroup ?? null;

  const handleGenerateApproval = async () => {
    if (!inspectedGroup?.safeForProductionPilot) {
      setBanner({
        tone: 'error',
        message: 'This sibling group is not eligible for a paid W4.1 approval token.',
      });
      return;
    }

    setApprovalLoading(true);
    setBanner(null);
    try {
      const response = await fetch('/api/admin/w41-production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rootGroupId: inspectedGroup.rootGroupId,
        }),
      });

      const payload = (await response.json()) as ProductionApprovalResponse;
      if (!response.ok || !payload.success || !payload.approval) {
        throw new Error(payload.error || 'Failed to create W4.1 production approval token');
      }

      setApproval(payload.approval);
      setBanner({
        tone: 'success',
        message: `Created a short-lived grouped paid-submit approval token for ${payload.approval.rootGroupId}.`,
      });
    } catch (error) {
      console.error('Failed to create W4.1 production approval token:', error);
      setBanner({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create W4.1 production approval token',
      });
    } finally {
      setApprovalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-sm font-medium text-fuchsia-800">
              <Users className="h-4 w-4" />
              W4.1 Paid Print Preflight
            </div>
            <h1 className="text-3xl font-semibold text-gray-950">
              Grouped paid print preflight and approval
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              This view never submits to Lulu. It inspects sibling groups by `rootGroupId`,
              highlights child-order blockers, and mints a short-lived grouped approval token only
              when the full group is safe to consider for a later paid pilot.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <RefreshCw className="h-4 w-4" />
            {lastRefresh ? `Last refresh ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
          </div>
        </div>

        {banner && (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
              banner.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {banner.message}
          </div>
        )}

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-gray-500">Sibling Groups</div>
            <div className="mt-2 text-3xl font-semibold text-gray-950">
              {loading ? '...' : data?.summary.candidateCount ?? 0}
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="text-sm font-medium text-emerald-800">Preflight Ready</div>
            <div className="mt-2 text-3xl font-semibold text-emerald-950">
              {loading ? '...' : data?.summary.preflightReady ?? 0}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="text-sm font-medium text-amber-800">Inspect First</div>
            <div className="mt-2 text-3xl font-semibold text-amber-950">
              {loading ? '...' : data?.summary.inspectOnly ?? 0}
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Inspect by root group or any child order id
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <input
                  value={draftRootGroupId}
                  onChange={(event) => setDraftRootGroupId(event.target.value)}
                  placeholder="441-0324-161613"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm focus:border-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-fuchsia-700"
              >
                Inspect Group
              </button>
              <button
                type="button"
                onClick={() => fetchData(selectedRootGroupId)}
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
          </form>
        </div>

        {inspectedGroup && (
          <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${actionClasses(
                      inspectedGroup.recommendedAction,
                    )}`}
                  >
                    {actionLabel(inspectedGroup.recommendedAction)}
                  </span>
                  {inspectedGroup.safeForProductionPilot ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Safe To Approve
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-900">
                      <ShieldX className="h-3.5 w-3.5" />
                      Blocked
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-semibold text-gray-950">{inspectedGroup.rootGroupId}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  resolved via {inspectedGroup.resolvedVia} • sibling count {inspectedGroup.siblingCount} •
                  recommended reason: {inspectedGroup.recommendedReason}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateApproval}
                  disabled={!inspectedGroup.safeForProductionPilot || approvalLoading}
                  className="inline-flex items-center rounded-xl bg-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {approvalLoading ? 'Creating...' : 'Generate Group Approval Token'}
                </button>
                <Link
                  href="/admin/w41-recovery"
                  className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Open Sandbox Recovery
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Group State
                </div>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <div>current workflow: {inspectedGroup.currentWorkflow ?? 'N/A'}</div>
                  <div>workflow step: {inspectedGroup.workflowStep ?? 'N/A'}</div>
                  <div>order status: {inspectedGroup.orderStatus ?? 'N/A'}</div>
                  <div>next workflow: {inspectedGroup.nextWorkflow ?? 'N/A'}</div>
                  <div>updated: {formatTimestamp(inspectedGroup.updatedAt)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Approval + Submission
                </div>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <div>
                    approvals required: {inspectedGroup.customerApprovalRequiredCount} • approved:{' '}
                    {inspectedGroup.customerApprovalApprovedCount}
                  </div>
                  <div>approvals pending: {inspectedGroup.customerApprovalPendingCount}</div>
                  <div>real lulu submission: {String(inspectedGroup.hasRealSubmission)}</div>
                  <div>proof-like group: {String(inspectedGroup.proofLike)}</div>
                  <div>print submitted rows: {inspectedGroup.printSubmittedCount}</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Existing Lulu State
                </div>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <div>job ids: {inspectedGroup.luluJobIds.length ? inspectedGroup.luluJobIds.join(', ') : 'N/A'}</div>
                  <div>statuses: {inspectedGroup.luluStatuses.length ? inspectedGroup.luluStatuses.join(', ') : 'N/A'}</div>
                  <div>amazon/root id: {inspectedGroup.amazonOrderId ?? 'N/A'}</div>
                  <div>row ids: {inspectedGroup.orderRowIds.join(', ')}</div>
                </div>
              </div>
            </div>

            {inspectedGroup.inspectionError && (
              <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                inspection error: {inspectedGroup.inspectionError}
              </div>
            )}

            {inspectedGroup.preflight && (
              <div className="mt-6 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-5">
                <h3 className="text-lg font-semibold text-fuchsia-950">Grouped preflight snapshot</h3>
                <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-fuchsia-200 bg-white p-4 text-sm text-gray-700">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Submit Shape
                    </div>
                    <div className="mt-2">submit mode: {inspectedGroup.preflight.submitMode}</div>
                    <div>Lulu base: {inspectedGroup.preflight.luluApiBase}</div>
                    <div>guard: {inspectedGroup.preflight.guard.reason}</div>
                  </div>
                  <div className="rounded-xl border border-fuchsia-200 bg-white p-4 text-sm text-gray-700">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Shipping
                    </div>
                    <div className="mt-2">requested: {inspectedGroup.preflight.shippingLevelRequested ?? 'N/A'}</div>
                    <div>sent: {inspectedGroup.preflight.shippingLevelSent}</div>
                    <div>resolved by: {inspectedGroup.preflight.shippingTierResolvedReason}</div>
                  </div>
                  <div className="rounded-xl border border-fuchsia-200 bg-white p-4 text-sm text-gray-700">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Group Size
                    </div>
                    <div className="mt-2">siblings: {inspectedGroup.preflight.siblingCount}</div>
                    <div>line items: {inspectedGroup.preflight.lineItemCount}</div>
                  </div>
                  <div className="rounded-xl border border-fuchsia-200 bg-white p-4 text-sm text-gray-700">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Shipping Contact
                    </div>
                    <div className="mt-2">
                      {inspectedGroup.preflight.shippingSummary.city ?? 'N/A'},{' '}
                      {inspectedGroup.preflight.shippingSummary.stateCode ?? 'N/A'}
                    </div>
                    <div>country: {inspectedGroup.preflight.shippingSummary.countryCode ?? 'N/A'}</div>
                    <div>has phone: {String(inspectedGroup.preflight.shippingSummary.hasPhone)}</div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-fuchsia-200 bg-white">
                  <table className="min-w-full divide-y divide-fuchsia-100 text-sm">
                    <thead className="bg-fuchsia-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-fuchsia-900">Order</th>
                        <th className="px-4 py-3 text-left font-semibold text-fuchsia-900">Child</th>
                        <th className="px-4 py-3 text-left font-semibold text-fuchsia-900">Pages</th>
                        <th className="px-4 py-3 text-left font-semibold text-fuchsia-900">Interior PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-fuchsia-100 bg-white">
                      {inspectedGroup.preflight.childSummaries.map((child) => (
                        <tr key={child.orderId}>
                          <td className="px-4 py-3 align-top font-medium text-gray-900">{child.orderId}</td>
                          <td className="px-4 py-3 align-top text-gray-700">{child.childName}</td>
                          <td className="px-4 py-3 align-top text-gray-700">{child.expectedPageCount}</td>
                          <td className="px-4 py-3 align-top text-xs text-gray-500">{child.pdfR2Key}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {approval && (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <ShieldCheck className="h-4 w-4" />
                  Group approval token issued
                </div>
                <div className="mt-3 space-y-2 text-sm text-emerald-950">
                  <div>root group: {approval.rootGroupId}</div>
                  <div>approved by: {approval.approvedBy}</div>
                  <div>expires: {formatTimestamp(approval.expiresAt)}</div>
                  <div>secret source: {approval.secretSource}</div>
                </div>
                <textarea
                  readOnly
                  value={approval.token}
                  className="mt-4 h-28 w-full rounded-xl border border-emerald-200 bg-white p-3 font-mono text-xs text-gray-900"
                />
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-950">Recent grouped paid-print candidates</h2>
            <p className="mt-1 text-sm text-gray-600">
              These are sibling groups that look relevant for `W4.1` paid preflight, not approved
              submit targets by default.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-gray-700">Root Group</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-700">Siblings</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-700">Approvals</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-700">Submission</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                      Loading grouped preflight data...
                    </td>
                  </tr>
                )}
                {!loading && (!data?.candidates || data.candidates.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                      No grouped W4.1 paid-print candidates found in the selected window.
                    </td>
                  </tr>
                )}
                {data?.candidates.map((candidate) => (
                  <tr key={candidate.rootGroupId} className="hover:bg-gray-50">
                    <td className="px-5 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => setRootGroupIdInUrl(candidate.rootGroupId)}
                        className="text-left font-medium text-fuchsia-700 hover:text-fuchsia-900"
                      >
                        {candidate.rootGroupId}
                      </button>
                      <div className="mt-1 text-xs text-gray-500">
                        updated {formatTimestamp(candidate.updatedAt)}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-gray-700">
                      <div>{candidate.siblingCount} child orders</div>
                      <div className="mt-1 text-xs text-gray-500">{candidate.orderIds.join(', ')}</div>
                    </td>
                    <td className="px-5 py-4 align-top text-gray-700">
                      <div>required: {candidate.customerApprovalRequiredCount}</div>
                      <div>approved: {candidate.customerApprovalApprovedCount}</div>
                      <div>pending: {candidate.customerApprovalPendingCount}</div>
                    </td>
                    <td className="px-5 py-4 align-top text-gray-700">
                      <div>real submit: {String(candidate.hasRealSubmission)}</div>
                      <div>proof-like: {String(candidate.proofLike)}</div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${actionClasses(
                          candidate.recommendedAction,
                        )}`}
                      >
                        {actionLabel(candidate.recommendedAction)}
                      </span>
                      <div className="mt-2 text-xs text-gray-500">{candidate.recommendedReason}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function W41ProductionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
          Loading W4.1 production preflight...
        </div>
      }
    >
      <W41ProductionPageContent />
    </Suspense>
  );
}
