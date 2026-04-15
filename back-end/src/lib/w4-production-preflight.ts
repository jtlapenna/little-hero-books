import { buildW4PrintInput, buildW4SubmitInput, type BuildW4PrintInputResult, type BuildW4SubmitInputResult } from '@/lib/books';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';
import {
  buildLuluWebhookSignal,
  isNonProductionLuluSubmission,
  loadLatestLuluWebhookLog,
  type LuluWebhookLogRow,
  type LuluWebhookSignal,
  type LuluWebhookDeliveryState,
} from '@/lib/lulu-webhook-signal';
import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { downloadManifest } from '@/lib/r2-service';
import { headObject } from '@/lib/r2-client';
import { getBucketFromKey } from '@/lib/r2-utils';
import { supabase, getOrderFromSupabase } from '@/lib/supabase-client';

type JsonRecord = Record<string, unknown>;

const PROOF_ORDER_PATTERN = /(proof|sandbox|disposable|wfj-proof|^test(?:[-_]|$)|[-_]test(?:[-_]|$))/i;
export type W4ProductionAction = 'preflight' | 'inspect' | 'none';

export type W4ProductionOrderRow = {
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
  manifest_3_key?: string | null;
  customer_email?: string | null;
  shipping_address?: JsonRecord | null;
};

export type W4ProductionCandidate = {
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
  recommendedAction: W4ProductionAction;
  recommendedReason: string;
};

export type W4ProductionPreflight = {
  submitMode: BuildW4SubmitInputResult['submitMode'];
  luluApiBase: string;
  productionGuard: BuildW4SubmitInputResult['productionGuard'];
  guard: BuildW4SubmitInputResult['guard'];
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
};

export type W4ProductionWebhookDeliveryState = LuluWebhookDeliveryState;

export type W4ProductionWebhookSignal = LuluWebhookSignal;

export type W4ProductionInspection = W4ProductionCandidate & {
  resolvedVia: 'id' | 'orderId' | 'order_id' | 'root_order_id' | 'amazon_order_id' | 'none';
  safeForProductionPilot: boolean;
  inspectionError: string | null;
  preflight: W4ProductionPreflight | null;
  webhookSignal: W4ProductionWebhookSignal;
};

type ProductionPreflightDependencies = {
  loadManifest: typeof downloadManifest;
  loadOrder: typeof getOrderFromSupabase;
  signObjectUrl: (key: string, bucket: string, expiresIn: number) => Promise<string>;
  buildPrintInput: typeof buildW4PrintInput;
  buildSubmitInput: typeof buildW4SubmitInput;
  headObject: typeof headObject;
  loadLatestWebhookLog: (printJobId: string) => Promise<W4ProductionWebhookLogRow | null>;
};

const defaultDependencies: ProductionPreflightDependencies = {
  loadManifest: downloadManifest,
  loadOrder: getOrderFromSupabase,
  signObjectUrl: async (key, bucket) =>
    `https://preflight.invalid/${encodeURIComponent(bucket)}/${key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`,
  buildPrintInput: buildW4PrintInput,
  buildSubmitInput: buildW4SubmitInput,
  headObject,
  loadLatestWebhookLog: async (printJobId) => loadLatestLuluWebhookLog(printJobId, supabase),
};

export const W4_PRODUCTION_ORDER_SELECT_FIELDS =
  'id, orderId, root_order_id, amazon_order_id, workflow_step, execution_status, current_workflow, started_at, updated_at, status, next_workflow, lulu_job_id, lulu_status, print_submitted_at, error_message, customer_approval_required, customer_approval_status, manifest_3_url, customer_email, shipping_address';

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

function cleanOrderId(orderRow: W4ProductionOrderRow): string | null {
  return toTrimmedString(orderRow.orderId) ?? toTrimmedString(orderRow.order_id) ?? null;
}

function cleanRootOrderId(orderRow: W4ProductionOrderRow): string | null {
  return toTrimmedString(orderRow.root_order_id) ?? null;
}

function cleanAmazonOrderId(orderRow: W4ProductionOrderRow): string | null {
  return (
    toTrimmedString(orderRow.amazon_order_id) ??
    toTrimmedString(orderRow.root_order_id) ??
    null
  );
}

function getAdminBaseUrl(preferred?: string | null): string {
  return resolveCanonicalBackendBaseUrl(preferred);
}

function isProofLikeOrderRow(orderRow: W4ProductionOrderRow): boolean {
  const markers = [
    cleanOrderId(orderRow),
    cleanRootOrderId(orderRow),
    cleanAmazonOrderId(orderRow),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  return PROOF_ORDER_PATTERN.test(markers);
}

function hasSandboxSubmissionMarker(orderRow: W4ProductionOrderRow): boolean {
  return isNonProductionLuluSubmission({
    luluJobId: toTrimmedString(orderRow.lulu_job_id),
    currentStatus: toTrimmedString(orderRow.lulu_status),
  });
}

function isSiblingItemOrder(orderRow: W4ProductionOrderRow): boolean {
  const orderId = cleanOrderId(orderRow);
  const rootOrderId = cleanRootOrderId(orderRow);
  const amazonOrderId = cleanAmazonOrderId(orderRow);

  if (!orderId) {
    return false;
  }

  return Boolean(
    (rootOrderId && orderId !== rootOrderId) ||
      (amazonOrderId && orderId !== amazonOrderId),
  );
}

function hasRealSubmission(orderRow: W4ProductionOrderRow): boolean {
  if (hasSandboxSubmissionMarker(orderRow)) {
    return false;
  }

  return Boolean(
    toTrimmedString(orderRow.lulu_job_id) ||
      toTrimmedString(orderRow.lulu_status) ||
      toTrimmedString(orderRow.print_submitted_at),
  );
}

function buildCandidateSummary(orderRow: W4ProductionOrderRow): W4ProductionCandidate {
  const orderId = cleanOrderId(orderRow) ?? 'unknown';
  const proofLike =
    isProofLikeOrderRow(orderRow) ||
    hasSandboxSubmissionMarker(orderRow) ||
    isSiblingItemOrder(orderRow);
  const realSubmission = hasRealSubmission(orderRow);
  const approvalRequired = toBoolean(orderRow.customer_approval_required);
  const approvalStatus = toTrimmedString(orderRow.customer_approval_status);
  const nextWorkflow = toTrimmedString(orderRow.next_workflow);
  const workflowStep = toTrimmedString(orderRow.workflow_step);
  const orderStatus = toTrimmedString(orderRow.status);

  let recommendedAction: W4ProductionAction = 'inspect';
  let recommendedReason = 'order_not_ready_for_paid_preflight';

  if (proofLike) {
    recommendedAction = 'none';
    recommendedReason = 'proof_or_non_production_order';
  } else if (realSubmission) {
    recommendedAction = 'inspect';
    recommendedReason = 'existing_lulu_submission_present';
  } else if (approvalRequired && approvalStatus !== 'approved') {
    recommendedAction = 'inspect';
    recommendedReason = 'customer_approval_pending';
  } else if (
    nextWorkflow === '4' ||
    workflowStep === 'print_fulfillment' ||
    orderStatus === 'pending_print'
  ) {
    recommendedAction = 'preflight';
    recommendedReason = 'ready_for_repo_preflight';
  }

  return {
    orderRowId: orderRow.id,
    orderId,
    rootOrderId: cleanRootOrderId(orderRow),
    amazonOrderId: cleanAmazonOrderId(orderRow),
    executionStatus: toTrimmedString(orderRow.execution_status),
    currentWorkflow: toTrimmedString(orderRow.current_workflow),
    workflowStep,
    orderStatus,
    nextWorkflow,
    luluJobId: toTrimmedString(orderRow.lulu_job_id),
    luluStatus: toTrimmedString(orderRow.lulu_status),
    printSubmittedAt: toIsoString(orderRow.print_submitted_at),
    updatedAt: toIsoString(orderRow.updated_at),
    customerApprovalRequired: approvalRequired,
    customerApprovalStatus: approvalStatus,
    proofLike,
    hasRealSubmission: realSubmission,
    recommendedAction,
    recommendedReason,
  };
}

export function buildW4ProductionCandidate(orderRow: W4ProductionOrderRow): W4ProductionCandidate {
  return buildCandidateSummary(orderRow);
}

export function buildW4ProductionPreflight(
  printInput: BuildW4PrintInputResult,
  submitInput: BuildW4SubmitInputResult,
): W4ProductionPreflight {
  return {
    submitMode: submitInput.submitMode,
    luluApiBase: submitInput.luluApiBase,
    productionGuard: submitInput.productionGuard,
    guard: submitInput.guard,
    shippingLevelRequested: submitInput.shippingLevelRequested,
    shippingLevelSent: submitInput.shippingLevelSent,
    shippingTierResolvedReason: submitInput.shippingTierResolvedReason,
    expectedPageCount: printInput.expectedPageCount,
    manifest3Key: printInput.manifest3Key,
    manifest4Key: printInput.manifest4Key,
    pdfR2Key: printInput.pdfR2Key,
    coverPdfR2Key: printInput.coverPdfR2Key,
    shippingSummary: {
      city: toTrimmedString(submitInput.shippingAddress.city),
      stateCode: toTrimmedString(submitInput.shippingAddress.state_code),
      countryCode: toTrimmedString(submitInput.shippingAddress.country_code),
      hasPhone: Boolean(
        toTrimmedString(submitInput.shippingAddress.phone_number) ??
          toTrimmedString(submitInput.shippingAddress.phone),
      ),
    },
  };
}

function buildWebhookSignal(
  orderRow: W4ProductionOrderRow,
  webhookLog: LuluWebhookLogRow | null,
  loadError?: string | null,
): W4ProductionWebhookSignal {
  return buildLuluWebhookSignal({
    luluJobId: toTrimmedString(orderRow.lulu_job_id),
    currentStatus: toTrimmedString(orderRow.lulu_status),
    webhookLog,
    loadError,
  });
}

async function listMissingPrintAssets(
  printInput: BuildW4PrintInputResult,
  headObjectImpl: typeof headObject,
): Promise<string[]> {
  const keys = [
    printInput.pdfR2Key,
    printInput.coverPdfR2Key,
    printInput.coverPreviewImageKey,
    ...printInput.pagePreviewImageKeys,
  ]
    .map((value) => toTrimmedString(value))
    .filter((value): value is string => Boolean(value));

  const uniqueKeys = [...new Set(keys)];
  const results = await Promise.all(
    uniqueKeys.map(async (key) => {
      const response = await headObjectImpl(getBucketFromKey(key), key).catch(() => null);
      return response?.ok ? null : key;
    }),
  );

  return results.filter((value): value is string => Boolean(value));
}

async function fetchRecentCandidateRows(hours: number, limit: number): Promise<W4ProductionOrderRow[]> {
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select(W4_PRODUCTION_ORDER_SELECT_FIELDS)
    .gte('updated_at', sinceIso)
    .or('next_workflow.eq.4,workflow_step.eq.print_fulfillment,status.eq.pending_print')
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    throw error;
  }

  return (data ?? []) as W4ProductionOrderRow[];
}

export async function listRecentW4ProductionCandidates(options: {
  hours?: number;
  limit?: number;
} = {}): Promise<W4ProductionCandidate[]> {
  const rows = await fetchRecentCandidateRows(options.hours ?? 24 * 14, options.limit ?? 25);
  return rows
    .map((row) => buildCandidateSummary(row))
    .filter((candidate) => candidate.recommendedAction !== 'none')
    .slice(0, Math.max(1, options.limit ?? 25));
}

export async function inspectW4ProductionRow(
  orderRow: W4ProductionOrderRow,
  resolvedVia: W4ProductionInspection['resolvedVia'],
  options: {
    adminBaseUrl?: string | null;
    dependencies?: Partial<ProductionPreflightDependencies>;
  } = {},
): Promise<W4ProductionInspection> {
  const orderId = cleanOrderId(orderRow);
  if (!orderId) {
    throw new Error('W4 production preflight: resolved row has no per-item orderId');
  }

  const candidate = buildCandidateSummary(orderRow);
  const deps: ProductionPreflightDependencies = {
    ...defaultDependencies,
    ...(options.dependencies ?? {}),
  };

  let preflight: W4ProductionPreflight | null = null;
  let inspectionError: string | null = null;
  let webhookSignal: W4ProductionWebhookSignal = buildWebhookSignal(orderRow, null);

  const luluJobId = toTrimmedString(orderRow.lulu_job_id);
  if (luluJobId) {
    try {
      const latestWebhookLog = await deps.loadLatestWebhookLog(luluJobId);
      webhookSignal = buildWebhookSignal(orderRow, latestWebhookLog);
    } catch (error) {
      webhookSignal = buildWebhookSignal(
        orderRow,
        null,
        error instanceof Error ? error.message : 'Unknown webhook lookup failure',
      );
    }
  }

  if (!candidate.hasRealSubmission) {
    try {
      const printInput = await deps.buildPrintInput(
        {
          orderId,
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
          allowProductionLulu: true,
          productionDryRun: true,
        },
        {
          loadOrder: deps.loadOrder,
          signObjectUrl: deps.signObjectUrl,
        },
      );

      preflight = buildW4ProductionPreflight(printInput, submitInput);
      const missingAssets = await listMissingPrintAssets(printInput, deps.headObject);
      if (missingAssets.length > 0) {
        inspectionError = `missing_print_assets:${missingAssets.slice(0, 3).join(',')}`;
      }
    } catch (error) {
      inspectionError =
        error instanceof Error ? error.message : 'Unknown W4 production preflight failure';
    }
  }

  return {
    ...candidate,
    resolvedVia,
    safeForProductionPilot: Boolean(
      !inspectionError &&
        preflight?.productionGuard.allowed &&
        preflight.productionGuard.reason === 'production_ready',
    ),
    inspectionError,
    preflight,
    webhookSignal,
  };
}

export async function inspectW4ProductionOrder(
  rawOrderId: string,
  options: {
    adminBaseUrl?: string | null;
    dependencies?: Partial<ProductionPreflightDependencies>;
  } = {},
): Promise<W4ProductionInspection> {
  const lookup = await fetchOrderRowByAnyId<W4ProductionOrderRow>(
    supabase,
    rawOrderId,
    W4_PRODUCTION_ORDER_SELECT_FIELDS,
  );
  if (!lookup.row) {
    throw new Error(`W4 production preflight: order not found for ${rawOrderId}`);
  }

  return inspectW4ProductionRow(lookup.row, lookup.used, options);
}
