import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import {
  buildW4SiblingPrintInput,
  type BuildW4SiblingPrintInputResult,
  type BuildW4SiblingPrintInputOptions,
} from '@/lib/books';
import { issueW41ProductionApprovalToken } from '@/lib/w41-production-approval';
import {
  claimAndStartW4SiblingJob,
  type W4SiblingWorkflowFields,
} from '@/lib/workflow-jobs';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;
type W41ReplayGuardOrderRow = {
  orderId?: string | null;
  order_id?: string | null;
  workflow_step?: string | null;
  execution_status?: string | null;
  status?: string | null;
  lulu_job_id?: string | null;
  lulu_status?: string | null;
  print_submitted_at?: string | null;
  next_workflow?: string | number | null;
  customer_approval_required?: boolean | string | number | null;
  customer_approval_status?: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPayload(value: unknown): JsonRecord | unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (Array.isArray(value.payload)) {
    return value.payload;
  }

  return isRecord(value.payload) ? value.payload : value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function pickBodyValue(body: JsonRecord | unknown[], key: string): unknown {
  if (Array.isArray(body)) {
    return undefined;
  }

  if (key in body) {
    return body[key];
  }

  const nested = body.body;
  if (isRecord(nested) && key in nested) {
    return nested[key];
  }

  return undefined;
}

function resolveExplicitProductionApprovalToken(body: JsonRecord | unknown[]): string | null {
  return (
    toTrimmedString(pickBodyValue(body, 'productionApprovalToken')) ??
    toTrimmedString(pickBodyValue(body, 'production_approval_token'))
  );
}

function resolveExplicitProductionIntent(body: JsonRecord | unknown[]): boolean {
  return toBoolean(pickBodyValue(body, 'allowProductionLulu'));
}

async function loadSiblingOrderRows(
  orderIds: string[],
  loadOrder: BuildW4SiblingPrintInputOptions['loadOrder'] | undefined,
): Promise<Map<string, W41ReplayGuardOrderRow>> {
  const rows = new Map<string, W41ReplayGuardOrderRow>();
  if (!loadOrder) {
    return rows;
  }

  await Promise.all(
    orderIds.map(async (orderId) => {
      const row = await loadOrder(orderId).catch(() => null);
      rows.set(orderId, isRecord(row) ? (row as W41ReplayGuardOrderRow) : {});
    }),
  );

  return rows;
}

function shouldAutoEnableProductionSubmit(
  orderRows: Map<string, W41ReplayGuardOrderRow>,
  rawBody: JsonRecord | unknown[],
): boolean {
  if (resolveExplicitProductionIntent(rawBody) || resolveExplicitProductionApprovalToken(rawBody)) {
    return true;
  }

  if (orderRows.size === 0) {
    return false;
  }

  for (const orderRow of orderRows.values()) {
    const nextWorkflow = toTrimmedString(orderRow.next_workflow);
    const workflowStep = toTrimmedString(orderRow.workflow_step);
    const executionStatus = toTrimmedString(orderRow.execution_status);
    const status = toTrimmedString(orderRow.status);
    const approvalRequired = toBoolean(orderRow.customer_approval_required);
    const approvalStatus = toTrimmedString(orderRow.customer_approval_status);
    const luluJobId = toTrimmedString(orderRow.lulu_job_id);
    const printSubmittedAt = toTrimmedString(orderRow.print_submitted_at);

    if (luluJobId || printSubmittedAt) {
      return false;
    }

    const readyForPrint =
      nextWorkflow === '4' ||
      nextWorkflow === '4.1' ||
      workflowStep === 'print_fulfillment' ||
      workflowStep === 'print_fulfillment_started' ||
      executionStatus === 'ready_for_processing' ||
      status === 'queued_for_processing' ||
      status === 'pending_print';

    if (!readyForPrint) {
      return false;
    }

    if (approvalRequired && approvalStatus !== 'approved') {
      return false;
    }
  }

  return true;
}

function attachProductionApprovalContext(
  result: BuildW4SiblingPrintInputResult,
  rawBody: JsonRecord | unknown[],
  orderRows: Map<string, W41ReplayGuardOrderRow>,
): BuildW4SiblingPrintInputResult {
  const explicitIntent = resolveExplicitProductionIntent(rawBody);
  const explicitToken = resolveExplicitProductionApprovalToken(rawBody);
  const autoEnable = shouldAutoEnableProductionSubmit(orderRows, rawBody);

  if (!explicitIntent && !explicitToken && !autoEnable) {
    return result;
  }

  let productionApprovalToken = explicitToken;
  if (!productionApprovalToken) {
    productionApprovalToken = issueW41ProductionApprovalToken({
      rootGroupId: result.rootGroupId,
      approvedBy: 'internal-w4-build-sibling-print-input',
    }).token;
  }

  return {
    ...result,
    allowProductionLulu: true,
    productionApprovalToken,
    production: {
      ...(isRecord((result as Record<string, unknown>).production)
        ? ((result as Record<string, unknown>).production as JsonRecord)
        : {}),
      allowProductionLulu: true,
      approvalToken: productionApprovalToken,
      productionApprovalToken,
    },
  };
}

function pickClaimedAt(body: JsonRecord | unknown[]): string | null {
  if (Array.isArray(body)) {
    return null;
  }

  if (typeof body.claimedAt === 'string') {
    return body.claimedAt;
  }

  const nestedBody = body.body;
  if (
    nestedBody &&
    typeof nestedBody === 'object' &&
    !Array.isArray(nestedBody) &&
    typeof (nestedBody as JsonRecord).claimedAt === 'string'
  ) {
    return (nestedBody as JsonRecord).claimedAt as string;
  }

  return null;
}

export async function buildW4SiblingPrintInputResponse(
  body: JsonRecord | unknown[],
  options: Partial<BuildW4SiblingPrintInputOptions> & {
    instrumentSiblingJob?: (
      payload: BuildW4SiblingPrintInputResult,
      rawBody: JsonRecord | unknown[],
    ) => Promise<W4SiblingWorkflowFields>;
  } = {},
): Promise<BuildW4SiblingPrintInputResult & W4SiblingWorkflowFields & { success: true }> {
  const result = await buildW4SiblingPrintInput(body, {
    loadManifest: options.loadManifest ?? downloadManifest,
    loadOrder: options.loadOrder ?? getOrderFromSupabase,
    defaultBackendUrl: options.defaultBackendUrl,
  });
  const orderRows = await loadSiblingOrderRows(
    result.orderIds,
    options.loadOrder ?? getOrderFromSupabase,
  );
  const enrichedResult = attachProductionApprovalContext(result, body, orderRows);

  const firstSibling = enrichedResult.siblings[0];
  if (!firstSibling) {
    throw new Error('W4.1 sibling print input produced no sibling items');
  }

  const workflowFields =
    options.instrumentSiblingJob
      ? await options.instrumentSiblingJob(enrichedResult, body)
      : await claimAndStartW4SiblingJob({
        rootGroupId: enrichedResult.rootGroupId,
        rootOrderId: enrichedResult.rootOrderId,
        amazonOrderId: enrichedResult.rootOrderId,
        bookId: firstSibling.bookId,
        orderIds: enrichedResult.orderIds,
        siblingCount: enrichedResult.siblingCount,
        claimedAt: pickClaimedAt(body),
      });

  return {
    success: true,
    ...enrichedResult,
    ...workflowFields,
    siblings: enrichedResult.siblings.map((sibling) => ({
      ...sibling,
      ...workflowFields,
    })),
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = unwrapPayload(parsedBody);
  if (!body) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object or array' },
      { status: 400 },
    );
  }

  try {
    const response = await buildW4SiblingPrintInputResponse(body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W4 Build Sibling Print Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W4 sibling print input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
