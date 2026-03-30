'use client';

import { Suspense, startTransition, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';

type ProductionAction = 'preflight' | 'inspect' | 'none';

type ProductionCandidate = {
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
  customerApprovalRequired: boolean;
  customerApprovalStatus: string | null;
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
    submitMode: 'sandbox' | 'skip' | 'production';
    luluApiBase: string;
    productionGuard: {
      requested: boolean;
      allowed: boolean;
      reason: string;
      checkedAt: string;
      envEnabled: boolean;
      dryRun: boolean;
      missingShippingFields?: string[];
    };
    guard: {
      reason: string;
      details?: string;
    };
    shippingLevelRequested: string | null;
    shippingLevelSent: string;
    shippingTierResolvedReason: string;
    expectedPageCount: number;
    manifest3Key: string;
    manifest4Key: string;
    pdfR2Key: string;
    coverPdfR2Key: string;
    shippingSummary: {
      city: string | null;
      stateCode: string | null;
      countryCode: string | null;
      hasPhone: boolean;
    };
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
  inspectedOrder: ProductionInspection | null;
  inspectionError: string | null;
  error?: string;
};

type ProductionApprovalResponse = {
  success: boolean;
  approval?: {
    token: string;
    orderId: string;
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

function W4ProductionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedOrderId = searchParams.get('orderId')?.trim() ?? '';

  const [draftOrderId, setDraftOrderId] = useState(selectedOrderId);
  const [data, setData] = useState<ProductionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [approval, setApproval] = useState<ProductionApprovalResponse['approval'] | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  const fetchData = async (orderId: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        hours: String(24 * 14),
        limit: '25',
      });
      if (orderId) {
        params.set('orderId', orderId);
      }

      const response = await fetch(`/api/admin/w4-production?${params.toString()}`);
      const payload = (await response.json()) as ProductionResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load W4 production preflight data');
      }

      setData(payload);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load W4 production preflight data:', error);
      setBanner({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load W4 production preflight data',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDraftOrderId(selectedOrderId);
    setApproval(null);
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
        router.replace('/admin/w4-production');
        return;
      }
      router.replace(`/admin/w4-production?orderId=${encodeURIComponent(trimmed)}`);
    });
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    setOrderIdInUrl(draftOrderId);
  };

  const inspectedOrder = data?.inspectedOrder ?? null;

  const handleGenerateApproval = async () => {
    if (!inspectedOrder?.safeForProductionPilot) {
      setBanner({
        tone: 'error',
        message: 'This order is not eligible for a paid W4 approval token.',
      });
      return;
    }

    setApprovalLoading(true);
    setBanner(null);
    try {
      const response = await fetch('/api/admin/w4-production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: inspectedOrder.orderId,
        }),
      });

      const payload = (await response.json()) as ProductionApprovalResponse;
      if (!response.ok || !payload.success || !payload.approval) {
        throw new Error(payload.error || 'Failed to create W4 production approval token');
      }

      setApproval(payload.approval);
      setBanner({
        tone: 'success',
        message: `Created a short-lived paid-submit approval token for ${payload.approval.orderId}.`,
      });
    } catch (error) {
      console.error('Failed to create W4 production approval token:', error);
      setBanner({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create W4 production approval token',
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
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-medium text-rose-800">
              <ShieldAlert className="h-4 w-4" />
              W4 Paid Print Preflight
            </div>
            <h1 className="text-3xl font-semibold text-gray-950">
              Paid print preflight and approval
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              This view never submits to Lulu. It shows whether a single-order W4 order is eligible
              for a paid pilot and can mint the short-lived approval token that production submit
              now requires.
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
            <div className="text-sm font-medium text-gray-500">Candidates</div>
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
          <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSearchSubmit}>
            <label className="flex-1">
              <span className="mb-2 block text-sm font-medium text-gray-700">
                Inspect specific W4 order
              </span>
              <input
                value={draftOrderId}
                onChange={(event) => setDraftOrderId(event.target.value)}
                placeholder="Amazon order id, root order id, or per-item order id"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-rose-700"
            >
              <Search className="h-4 w-4" />
              Inspect
            </button>
          </form>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Recent paid-pilot candidates</h2>
                <p className="text-sm text-gray-500">
                  Orders that look close to real single-order W4 print readiness.
                </p>
              </div>
              <Link
                href="/admin/workflow-jobs"
                className="text-sm font-medium text-rose-700 hover:text-rose-800"
              >
                Open Workflow Jobs
              </Link>
            </div>

            <div className="space-y-4">
              {(data?.candidates ?? []).length === 0 && !loading ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                  No current W4 paid-pilot candidates matched the last 14 days.
                </div>
              ) : (
                (data?.candidates ?? []).map((candidate) => (
                  <button
                    key={`${candidate.orderRowId}-${candidate.orderId}`}
                    type="button"
                    onClick={() => {
                      setBanner(null);
                      setDraftOrderId(candidate.orderId);
                      setOrderIdInUrl(candidate.orderId);
                    }}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-rose-300 hover:bg-rose-50"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-950">{candidate.orderId}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          root {candidate.rootOrderId ?? 'N/A'} • workflow {candidate.currentWorkflow ?? 'N/A'} • status {candidate.executionStatus ?? 'N/A'}
                        </div>
                      </div>
                      <span
                        className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${actionClasses(candidate.recommendedAction)}`}
                      >
                        {actionLabel(candidate.recommendedAction)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                      <div>Reason: {candidate.recommendedReason}</div>
                      <div>Updated: {formatTimestamp(candidate.updatedAt)}</div>
                      <div>Approval: {candidate.customerApprovalStatus ?? (candidate.customerApprovalRequired ? 'required' : 'not required')}</div>
                      <div>Lulu: {candidate.luluStatus ?? candidate.luluJobId ?? 'none'}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Inspection</h2>
            <p className="mt-1 text-sm text-gray-500">
              Paid-pilot preflight result for the selected order. This is dry-run only.
            </p>

            {!selectedOrderId ? (
              <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                Search for an order or click a candidate on the left to inspect paid-print readiness.
              </div>
            ) : data?.inspectionError ? (
              <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                {data.inspectionError}
              </div>
            ) : inspectedOrder ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-950">{inspectedOrder.orderId}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        resolved via {inspectedOrder.resolvedVia} • updated{' '}
                        {formatTimestamp(inspectedOrder.updatedAt)}
                      </div>
                    </div>
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${
                        inspectedOrder.safeForProductionPilot
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                          : 'border-amber-200 bg-amber-100 text-amber-900'
                      }`}
                    >
                      {inspectedOrder.safeForProductionPilot ? (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldX className="h-3.5 w-3.5" />
                      )}
                      {inspectedOrder.safeForProductionPilot ? 'Ready for paid pilot' : 'Not ready'}
                    </div>
                  </div>
                </div>

                <dl className="grid gap-3 text-sm text-gray-700">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <dt className="font-medium text-gray-500">Recommendation</dt>
                    <dd className="mt-1 font-medium text-gray-950">{inspectedOrder.recommendedReason}</dd>
                  </div>

                  {inspectedOrder.inspectionError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                      <div className="font-medium">Preflight blocked</div>
                      <div className="mt-1">{inspectedOrder.inspectionError}</div>
                    </div>
                  )}

                  {inspectedOrder.preflight && (
                    <>
                      <div className="rounded-xl border border-gray-200 p-4">
                        <dt className="font-medium text-gray-500">Submit mode</dt>
                        <dd className="mt-1 text-gray-950">
                          {inspectedOrder.preflight.submitMode} via {inspectedOrder.preflight.luluApiBase}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-gray-200 p-4">
                        <dt className="font-medium text-gray-500">Production guard</dt>
                        <dd className="mt-1 text-gray-950">
                          {inspectedOrder.preflight.productionGuard.reason}
                          {inspectedOrder.preflight.productionGuard.allowed ? ' (allowed)' : ' (blocked)'}
                        </dd>
                        <div className="mt-1 text-xs text-gray-500">
                          env enabled: {String(inspectedOrder.preflight.productionGuard.envEnabled)} • dry run:{' '}
                          {String(inspectedOrder.preflight.productionGuard.dryRun)}
                        </div>
                        {inspectedOrder.preflight.productionGuard.missingShippingFields?.length ? (
                          <div className="mt-2 text-xs text-amber-800">
                            Missing shipping fields:{' '}
                            {inspectedOrder.preflight.productionGuard.missingShippingFields.join(', ')}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-gray-200 p-4">
                        <dt className="font-medium text-gray-500">Paid submit approval</dt>
                        <dd className="mt-1 text-gray-950">
                          {inspectedOrder.safeForProductionPilot
                            ? 'Eligible for short-lived approval token'
                            : 'Not eligible for approval token'}
                        </dd>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={handleGenerateApproval}
                            disabled={!inspectedOrder.safeForProductionPilot || approvalLoading}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                          >
                            {approvalLoading ? 'Creating…' : 'Create approval token'}
                          </button>
                          <span className="text-xs text-gray-500">
                            Required for any real paid W4 submit. Dry-runs do not need it.
                          </span>
                        </div>
                        {approval && approval.orderId === inspectedOrder.orderId ? (
                          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                            <div className="font-medium">Approval token ready</div>
                            <div className="mt-1 break-all font-mono">{approval.token}</div>
                            <div className="mt-2 text-emerald-900">
                              approved {formatTimestamp(approval.approvedAt)} • expires{' '}
                              {formatTimestamp(approval.expiresAt)} • source {approval.secretSource}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-gray-200 p-4">
                        <dt className="font-medium text-gray-500">Shipping</dt>
                        <dd className="mt-1 text-gray-950">
                          {inspectedOrder.preflight.shippingLevelSent} •{' '}
                          {inspectedOrder.preflight.shippingSummary.city ?? 'N/A'},{' '}
                          {inspectedOrder.preflight.shippingSummary.stateCode ?? 'N/A'} • phone:{' '}
                          {inspectedOrder.preflight.shippingSummary.hasPhone ? 'present' : 'missing'}
                        </dd>
                        <div className="mt-1 text-xs text-gray-500">
                          requested: {inspectedOrder.preflight.shippingLevelRequested ?? 'N/A'} • reason:{' '}
                          {inspectedOrder.preflight.shippingTierResolvedReason}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-200 p-4">
                        <dt className="font-medium text-gray-500">Artifacts</dt>
                        <dd className="mt-1 break-all text-xs text-gray-700">
                          3-manifest: {inspectedOrder.preflight.manifest3Key}
                          <br />
                          4-manifest: {inspectedOrder.preflight.manifest4Key}
                          <br />
                          interior PDF: {inspectedOrder.preflight.pdfR2Key}
                          <br />
                          cover PDF: {inspectedOrder.preflight.coverPdfR2Key}
                        </dd>
                        <div className="mt-2 text-xs text-gray-500">
                          expected page count: {inspectedOrder.preflight.expectedPageCount}
                        </div>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                Loading inspection…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function W4ProductionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8 text-sm text-gray-500">
          Loading W4 production preflight…
        </div>
      }
    >
      <W4ProductionPageContent />
    </Suspense>
  );
}
