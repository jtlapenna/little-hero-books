import {
  buildW4SiblingPrintInput,
  buildW4SiblingSubmitInput,
  type BuildW4SiblingPrintInputResult,
  type BuildW4SiblingSubmitInputResult,
} from '@/lib/books';
import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { downloadManifest } from '@/lib/r2-service';
import { headObject } from '@/lib/r2-client';
import { getBucketFromKey } from '@/lib/r2-utils';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';

type JsonRecord = Record<string, unknown>;

const DEFAULT_ADMIN_BASE = 'https://admin.littleherolabs.com';
const PROOF_ORDER_PATTERN = /(proof|sandbox|disposable|wfj-proof|^test(?:[-_]|$)|[-_]test(?:[-_]|$))/i;
const NON_PRODUCTION_LULU_STATUS_PATTERN = /^(TEST_MODE|SANDBOX(?:[_-].+)?)$/i;

export type W41ProductionAction = 'preflight' | 'inspect' | 'none';

export type W41ProductionOrderRow = {
  id: number;
  orderId?: string | null;
  order_id?: string | null;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
  workflow_step?: string | null;
  execution_status?: string | null;
  current_workflow?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  status?: string | null;
  next_workflow?: string | null;
  lulu_job_id?: string | null;
  lulu_status?: string | null;
  print_submitted_at?: string | null;
  error_message?: string | null;
  customer_approval_required?: boolean | null;
  customer_approval_status?: string | null;
  manifest_3_url?: string | null;
  customer_email?: string | null;
  shipping_address?: JsonRecord | null;
};

export type W41ProductionCandidate = {
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
  recommendedAction: W41ProductionAction;
  recommendedReason: string;
};

export type W41ProductionPreflight = {
  submitMode: BuildW4SiblingSubmitInputResult['submitMode'];
  luluApiBase: string;
  guard: BuildW4SiblingSubmitInputResult['guard'];
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
};

export type W41ProductionInspection = W41ProductionCandidate & {
  resolvedVia: 'id' | 'orderId' | 'order_id' | 'root_order_id' | 'amazon_order_id' | 'none';
  safeForProductionPilot: boolean;
  inspectionError: string | null;
  preflight: W41ProductionPreflight | null;
};

type ProductionPreflightDependencies = {
  loadManifest: typeof downloadManifest;
  loadOrder: typeof getOrderFromSupabase;
  signObjectUrl: (key: string, bucket: string, expiresIn: number) => Promise<string>;
  buildPrintInput: typeof buildW4SiblingPrintInput;
  buildSubmitInput: typeof buildW4SiblingSubmitInput;
  headObject: typeof headObject;
};

const defaultDependencies: ProductionPreflightDependencies = {
  loadManifest: downloadManifest,
  loadOrder: getOrderFromSupabase,
  signObjectUrl: async (key, bucket) =>
    `https://preflight.invalid/${encodeURIComponent(bucket)}/${key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`,
  buildPrintInput: buildW4SiblingPrintInput,
  buildSubmitInput: buildW4SiblingSubmitInput,
  headObject,
};

export const W41_PRODUCTION_ORDER_SELECT_FIELDS = [
  'id',
  'orderId',
  'root_order_id',
  'amazon_order_id',
  'workflow_step',
  'execution_status',
  'current_workflow',
  'started_at',
  'updated_at',
  'status',
  'next_workflow',
  'lulu_job_id',
  'lulu_status',
  'print_submitted_at',
  'error_message',
  'customer_approval_required',
  'customer_approval_status',
  'manifest_3_url',
  'customer_email',
  'shipping_address',
] as const;

const W41_PRODUCTION_ORDER_SELECT = W41_PRODUCTION_ORDER_SELECT_FIELDS.join(', ');

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

function toIsoString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value !== 'string') {
    return false;
  }
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
}

function cleanOrderId(orderRow: W41ProductionOrderRow): string | null {
  return toTrimmedString(orderRow.orderId) ?? toTrimmedString(orderRow.order_id) ?? null;
}

function cleanRootGroupId(orderRow: W41ProductionOrderRow): string | null {
  return (
    toTrimmedString(orderRow.root_order_id) ??
    toTrimmedString(orderRow.amazon_order_id) ??
    cleanOrderId(orderRow)
  );
}

function getAdminBaseUrl(preferred?: string | null): string {
  return (
    preferred?.trim() ||
    process.env.ADMIN_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    DEFAULT_ADMIN_BASE
  ).replace(/\/+$/, '');
}

function isSandboxSubmissionMarker(row: W41ProductionOrderRow): boolean {
  const luluJobId = toTrimmedString(row.lulu_job_id);
  const luluStatus = toTrimmedString(row.lulu_status);
  return Boolean(
    (luluJobId && /^TEST[-_]/i.test(luluJobId)) ||
      (luluStatus && NON_PRODUCTION_LULU_STATUS_PATTERN.test(luluStatus)),
  );
}

function hasRealSubmission(rows: W41ProductionOrderRow[]): boolean {
  return rows.some((row) => {
    if (isSandboxSubmissionMarker(row)) {
      return false;
    }

    return Boolean(
      toTrimmedString(row.lulu_job_id) ||
        toTrimmedString(row.lulu_status) ||
        toTrimmedString(row.print_submitted_at),
    );
  });
}

function isProofLikeGroup(rootGroupId: string, rows: W41ProductionOrderRow[]): boolean {
  const markers = [
    rootGroupId,
    ...rows.map((row) => cleanOrderId(row)),
    ...rows.map((row) => toTrimmedString(row.amazon_order_id)),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  return (
    PROOF_ORDER_PATTERN.test(markers) ||
    rows.some((row) => isSandboxSubmissionMarker(row))
  );
}

function choosePrimaryGroupRow(
  rootGroupId: string,
  rows: W41ProductionOrderRow[],
): W41ProductionOrderRow | null {
  if (!rows.length) {
    return null;
  }

  const exact =
    rows.find((row) => cleanOrderId(row) === rootGroupId) ??
    rows.find((row) => toTrimmedString(row.order_id) === rootGroupId);
  if (exact) {
    return exact;
  }

  return [...rows].sort((left, right) =>
    (cleanOrderId(left) ?? '').localeCompare(cleanOrderId(right) ?? ''),
  )[0] ?? null;
}

function buildCandidateSummary(
  rootGroupId: string,
  groupRows: W41ProductionOrderRow[],
): W41ProductionCandidate {
  const primaryRow = choosePrimaryGroupRow(rootGroupId, groupRows);
  if (!primaryRow) {
    throw new Error(`W4.1 production preflight: no order rows found for ${rootGroupId}`);
  }

  const siblingCount = groupRows.length;
  const orderIds = groupRows
    .map((row) => cleanOrderId(row))
    .filter((value): value is string => Boolean(value))
    .sort();
  const proofLike = isProofLikeGroup(rootGroupId, groupRows);
  const realSubmission = hasRealSubmission(groupRows);
  const approvalRequiredCount = groupRows.filter((row) =>
    toBoolean(row.customer_approval_required),
  ).length;
  const approvalApprovedCount = groupRows.filter(
    (row) =>
      toBoolean(row.customer_approval_required) &&
      toTrimmedString(row.customer_approval_status) === 'approved',
  ).length;
  const approvalPendingCount = Math.max(
    0,
    approvalRequiredCount - approvalApprovedCount,
  );

  let recommendedAction: W41ProductionAction = 'inspect';
  let recommendedReason = 'group_not_ready_for_paid_preflight';

  if (proofLike) {
    recommendedAction = 'none';
    recommendedReason = 'proof_or_non_production_group';
  } else if (realSubmission) {
    recommendedAction = 'inspect';
    recommendedReason = 'existing_lulu_submission_present';
  } else if (siblingCount < 2) {
    recommendedAction = 'inspect';
    recommendedReason = 'w41_group_incomplete';
  } else if (approvalPendingCount > 0) {
    recommendedAction = 'inspect';
    recommendedReason = 'group_customer_approval_pending';
  } else if (
    toTrimmedString(primaryRow.next_workflow) === '4.1' ||
    toTrimmedString(primaryRow.current_workflow) === '4.1' ||
    toTrimmedString(primaryRow.workflow_step) === 'print_fulfillment' ||
    toTrimmedString(primaryRow.status) === 'pending_print'
  ) {
    recommendedAction = 'preflight';
    recommendedReason = 'ready_for_group_preflight';
  }

  return {
    rootGroupId,
    siblingCount,
    orderIds,
    orderRowIds: groupRows.map((row) => row.id),
    amazonOrderId: toTrimmedString(primaryRow.amazon_order_id) ?? rootGroupId,
    executionStatus: toTrimmedString(primaryRow.execution_status),
    currentWorkflow: toTrimmedString(primaryRow.current_workflow),
    workflowStep: toTrimmedString(primaryRow.workflow_step),
    orderStatus: toTrimmedString(primaryRow.status),
    nextWorkflow: toTrimmedString(primaryRow.next_workflow),
    luluJobIds: [
      ...new Set(
        groupRows
          .map((row) => toTrimmedString(row.lulu_job_id))
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    luluStatuses: [
      ...new Set(
        groupRows
          .map((row) => toTrimmedString(row.lulu_status))
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    printSubmittedCount: groupRows.filter((row) => Boolean(toTrimmedString(row.print_submitted_at)))
      .length,
    updatedAt:
      groupRows
        .map((row) => toIsoString(row.updated_at))
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    customerApprovalRequiredCount: approvalRequiredCount,
    customerApprovalApprovedCount: approvalApprovedCount,
    customerApprovalPendingCount: approvalPendingCount,
    proofLike,
    hasRealSubmission: realSubmission,
    recommendedAction,
    recommendedReason,
  };
}

export function buildW41ProductionCandidate(
  rootGroupId: string,
  groupRows: W41ProductionOrderRow[],
): W41ProductionCandidate {
  return buildCandidateSummary(rootGroupId, groupRows);
}

export function buildW41ProductionPreflight(
  printInput: BuildW4SiblingPrintInputResult,
  submitInput: BuildW4SiblingSubmitInputResult,
): W41ProductionPreflight {
  return {
    submitMode: submitInput.submitMode,
    luluApiBase: submitInput.luluApiBase,
    guard: submitInput.guard,
    shippingLevelRequested: submitInput.shippingLevelRequested,
    shippingLevelSent: submitInput.shippingLevelSent,
    shippingTierResolvedReason: submitInput.shippingTierResolvedReason,
    siblingCount: printInput.siblingCount,
    lineItemCount: Array.isArray(submitInput.luluPayload.line_items)
      ? submitInput.luluPayload.line_items.length
      : 0,
    shippingSummary: {
      city: toTrimmedString(submitInput.shippingAddress.city),
      stateCode: toTrimmedString(submitInput.shippingAddress.state_code),
      countryCode: toTrimmedString(submitInput.shippingAddress.country_code),
      hasPhone: Boolean(
        toTrimmedString(submitInput.shippingAddress.phone_number) ??
          toTrimmedString(submitInput.shippingAddress.phone),
      ),
    },
    childSummaries: printInput.siblings.map((sibling) => ({
      orderId: sibling.orderId,
      childName: sibling.childName,
      expectedPageCount: sibling.expectedPageCount,
      pdfR2Key: sibling.pdfR2Key,
      coverPdfR2Key: sibling.coverPdfR2Key,
    })),
  };
}

async function listMissingPrintAssets(
  printInput: BuildW4SiblingPrintInputResult,
  headObjectImpl: typeof headObject,
): Promise<string[]> {
  const keys = printInput.siblings.flatMap((sibling) => [
    sibling.pdfR2Key,
    sibling.coverPdfR2Key,
    sibling.coverPreviewImageKey,
    ...sibling.pagePreviewImageKeys,
  ]);

  const uniqueKeys = [...new Set(keys.map((value) => toTrimmedString(value)).filter((value): value is string => Boolean(value)))];
  const results = await Promise.all(
    uniqueKeys.map(async (key) => {
      const response = await headObjectImpl(getBucketFromKey(key), key).catch(() => null);
      return response?.ok ? null : key;
    }),
  );

  return results.filter((value): value is string => Boolean(value));
}

async function fetchRecentCandidateRows(hours: number, limit: number): Promise<W41ProductionOrderRow[]> {
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select(W41_PRODUCTION_ORDER_SELECT)
    .gte('updated_at', sinceIso)
    .or('next_workflow.eq.4.1,current_workflow.eq.4.1,workflow_step.eq.print_fulfillment,status.eq.pending_print')
    .order('updated_at', { ascending: false })
    .limit(Math.max(10, limit * 10));

  if (error) {
    throw error;
  }

  return (data ?? []) as W41ProductionOrderRow[];
}

async function fetchGroupRows(rootGroupId: string): Promise<W41ProductionOrderRow[]> {
  const rowsById = new Map<number, W41ProductionOrderRow>();
  const pushRows = (rows: W41ProductionOrderRow[]) => {
    for (const row of rows) {
      rowsById.set(row.id, row);
    }
  };

  const byRoot = await supabase
    .from('orders')
    .select(W41_PRODUCTION_ORDER_SELECT)
    .eq('root_order_id', rootGroupId);
  if (byRoot.error) {
    throw byRoot.error;
  }
  pushRows((byRoot.data ?? []) as W41ProductionOrderRow[]);

  if (rowsById.size < 2) {
    const byAmazon = await supabase
      .from('orders')
      .select(W41_PRODUCTION_ORDER_SELECT)
      .eq('amazon_order_id', rootGroupId);
    if (byAmazon.error) {
      throw byAmazon.error;
    }
    pushRows((byAmazon.data ?? []) as W41ProductionOrderRow[]);
  }

  return [...rowsById.values()].sort((left, right) =>
    (cleanOrderId(left) ?? '').localeCompare(cleanOrderId(right) ?? ''),
  );
}

export async function listRecentW41ProductionCandidates(options: {
  hours?: number;
  limit?: number;
} = {}): Promise<W41ProductionCandidate[]> {
  const rows = await fetchRecentCandidateRows(options.hours ?? 24 * 14, options.limit ?? 25);
  const rowsByRootGroup = new Map<string, W41ProductionOrderRow[]>();

  for (const row of rows) {
    const rootGroupId = cleanRootGroupId(row);
    if (!rootGroupId) {
      continue;
    }

    const existing = rowsByRootGroup.get(rootGroupId) ?? [];
    existing.push(row);
    rowsByRootGroup.set(rootGroupId, existing);
  }

  return [...rowsByRootGroup.entries()]
    .map(([rootGroupId, groupRows]) => buildCandidateSummary(rootGroupId, groupRows))
    .filter((candidate) => candidate.siblingCount >= 2 && candidate.recommendedAction !== 'none')
    .sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
    .slice(0, Math.max(1, options.limit ?? 25));
}

export async function inspectW41ProductionGroup(
  rawRootGroupId: string,
  options: {
    adminBaseUrl?: string | null;
    dependencies?: Partial<ProductionPreflightDependencies>;
  } = {},
): Promise<W41ProductionInspection> {
  const lookup = await fetchOrderRowByAnyId<W41ProductionOrderRow>(
    supabase,
    rawRootGroupId,
    W41_PRODUCTION_ORDER_SELECT,
  );
  if (!lookup.row) {
    throw new Error(`W4.1 production preflight: group not found for ${rawRootGroupId}`);
  }

  const rootGroupId = cleanRootGroupId(lookup.row);
  if (!rootGroupId) {
    throw new Error(`W4.1 production preflight: resolved row has no rootGroupId for ${rawRootGroupId}`);
  }

  const groupRows = await fetchGroupRows(rootGroupId);
  return inspectW41ProductionRows(rootGroupId, groupRows, lookup.used, options);
}

export async function inspectW41ProductionRows(
  rootGroupId: string,
  groupRows: W41ProductionOrderRow[],
  resolvedVia: W41ProductionInspection['resolvedVia'],
  options: {
    adminBaseUrl?: string | null;
    dependencies?: Partial<ProductionPreflightDependencies>;
  } = {},
): Promise<W41ProductionInspection> {
  const candidate = buildCandidateSummary(rootGroupId, groupRows);
  const deps: ProductionPreflightDependencies = {
    ...defaultDependencies,
    ...(options.dependencies ?? {}),
  };

  let preflight: W41ProductionPreflight | null = null;
  let inspectionError: string | null = null;

  if (!candidate.hasRealSubmission && !candidate.proofLike) {
    try {
      const printInput = await deps.buildPrintInput(
        {
          rootGroupId,
          siblingGroup: groupRows as JsonRecord[],
          backendUrl: getAdminBaseUrl(options.adminBaseUrl),
        },
        {
          loadManifest: deps.loadManifest,
          loadOrder: deps.loadOrder,
          defaultBackendUrl: getAdminBaseUrl(options.adminBaseUrl),
        },
      );

      const submitInput = await deps.buildSubmitInput(
        {
          ...printInput,
        },
        {
          loadOrder: deps.loadOrder,
          signObjectUrl: deps.signObjectUrl,
        },
      );

      preflight = buildW41ProductionPreflight(printInput, submitInput);
      const missingAssets = await listMissingPrintAssets(printInput, deps.headObject);
      if (missingAssets.length > 0) {
        inspectionError = `missing_print_assets:${missingAssets.slice(0, 3).join(',')}`;
      }
    } catch (error) {
      inspectionError =
        error instanceof Error ? error.message : 'Unknown W4.1 production preflight failure';
    }
  }

  return {
    ...candidate,
    resolvedVia,
    safeForProductionPilot: Boolean(
      !inspectionError &&
        candidate.recommendedAction === 'preflight' &&
        preflight &&
        preflight.submitMode === 'sandbox' &&
        preflight.guard.reason === 'sandbox',
    ),
    inspectionError,
    preflight,
  };
}
