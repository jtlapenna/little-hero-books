import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { supabase } from '@/lib/supabase-client';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import {
  buildW4PrintInput,
  type BuildW4PrintInputResult,
  type LoadManifestForW4,
  type LoadOrderForW4,
} from '@/lib/books';
import { issueW4ProductionApprovalToken } from '@/lib/w4-production-approval';
import {
  buildSkippedW4PrintWorkflowFields,
  claimAndStartW4PrintJob,
  type W4PrintWorkflowFields,
} from '@/lib/workflow-jobs';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;
type W4ReplayGuardOrderRow = {
  id?: number | null;
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

function unwrapPayloadObject(value: unknown): JsonRecord | null {
  if (!isRecord(value)) {
    return null;
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

function pickBodyValue(body: JsonRecord, key: string): unknown {
  if (key in body) {
    return body[key];
  }

  const nested = body.body;
  if (isRecord(nested) && key in nested) {
    return nested[key];
  }

  return undefined;
}

function resolveExplicitProductionApprovalToken(body: JsonRecord): string | null {
  return (
    toTrimmedString(pickBodyValue(body, 'productionApprovalToken')) ??
    toTrimmedString(pickBodyValue(body, 'production_approval_token'))
  );
}

function resolveExplicitProductionIntent(body: JsonRecord): boolean {
  return toBoolean(pickBodyValue(body, 'allowProductionLulu'));
}

function shouldAutoEnableProductionSubmit(
  orderRow: W4ReplayGuardOrderRow | null,
  rawBody: JsonRecord,
): boolean {
  if (!orderRow) {
    return false;
  }

  if (resolveExplicitProductionIntent(rawBody) || resolveExplicitProductionApprovalToken(rawBody)) {
    return true;
  }

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
    workflowStep === 'print_fulfillment' ||
    executionStatus === 'ready_for_processing' ||
    status === 'queued_for_processing' ||
    status === 'pending_print';

  if (!readyForPrint) {
    return false;
  }

  if (approvalRequired && approvalStatus !== 'approved') {
    return false;
  }

  return true;
}

function attachProductionApprovalContext(
  result: BuildW4PrintInputResult,
  rawBody: JsonRecord,
  orderRow: W4ReplayGuardOrderRow | null,
): BuildW4PrintInputResult {
  const explicitIntent = resolveExplicitProductionIntent(rawBody);
  const explicitToken = resolveExplicitProductionApprovalToken(rawBody);
  const autoEnable = shouldAutoEnableProductionSubmit(orderRow, rawBody);

  if (!explicitIntent && !explicitToken && !autoEnable) {
    return result;
  }

  let productionApprovalToken = explicitToken;
  if (!productionApprovalToken) {
    productionApprovalToken = issueW4ProductionApprovalToken({
      orderId: result.orderId,
      approvedBy: 'internal-w4-build-print-input',
    }).token;
  }

  return {
    ...result,
    allowProductionLulu: true,
    productionApprovalToken,
    production: {
      ...(isRecord(result.production) ? result.production : {}),
      allowProductionLulu: true,
      approvalToken: productionApprovalToken,
      productionApprovalToken,
    },
  };
}

function shouldSkipCompletedW4Replay(
  orderRow: W4ReplayGuardOrderRow | null,
  forceReplay: boolean,
): boolean {
  if (!orderRow || forceReplay) {
    return false;
  }

  const workflowStep = toTrimmedString(orderRow.workflow_step);
  const executionStatus = toTrimmedString(orderRow.execution_status);
  const status = toTrimmedString(orderRow.status);
  const luluJobId = toTrimmedString(orderRow.lulu_job_id);
  const printSubmittedAt = toTrimmedString(orderRow.print_submitted_at);

  return Boolean(
    luluJobId ||
      printSubmittedAt ||
      (workflowStep === 'print_fulfillment' && executionStatus === 'done') ||
      status === 'pending_print',
  );
}

async function lookupReplayGuardOrderRow(
  orderId: string,
): Promise<W4ReplayGuardOrderRow | null> {
  const lookup = await fetchOrderRowByAnyId<W4ReplayGuardOrderRow>(
    supabase,
    orderId,
    'id, orderId, order_id, workflow_step, execution_status, status, lulu_job_id, lulu_status, print_submitted_at, next_workflow',
  );
  return lookup.row ?? null;
}

export async function buildW4PrintInputResponse(
  body: JsonRecord,
  options: {
    loadManifest?: LoadManifestForW4;
    loadOrder?: LoadOrderForW4;
    defaultBackendUrl?: string;
    lookupOrderRow?: (orderId: string, rawBody: JsonRecord) => Promise<W4ReplayGuardOrderRow | null>;
    instrumentPrintJob?: (
      payload: BuildW4PrintInputResult,
      rawBody: JsonRecord,
    ) => Promise<W4PrintWorkflowFields>;
  } = {},
): Promise<BuildW4PrintInputResult & W4PrintWorkflowFields & { success: true }> {
  const result = await buildW4PrintInput(body, {
    loadManifest: options.loadManifest ?? downloadManifest,
    loadOrder: options.loadOrder ?? getOrderFromSupabase,
    defaultBackendUrl: options.defaultBackendUrl,
  });
  const forceReplay = toBoolean(pickBodyValue(body, 'force'));
  const orderRow = options.lookupOrderRow
    ? await options.lookupOrderRow(result.orderId, body)
    : await lookupReplayGuardOrderRow(result.orderId);

  if (shouldSkipCompletedW4Replay(orderRow, forceReplay)) {
    return {
      success: true,
      ...attachProductionApprovalContext(result, body, orderRow),
      ...buildSkippedW4PrintWorkflowFields('w4-order-already-submitted'),
    };
  }

  const enrichedResult = attachProductionApprovalContext(result, body, orderRow);

  const workflowFields =
    options.instrumentPrintJob
      ? await options.instrumentPrintJob(enrichedResult, body)
      : await claimAndStartW4PrintJob({
        ...enrichedResult,
        claimedAt:
          typeof body.claimedAt === 'string'
            ? body.claimedAt
            : typeof body.body === 'object' &&
                body.body !== null &&
                !Array.isArray(body.body) &&
                typeof (body.body as JsonRecord).claimedAt === 'string'
              ? ((body.body as JsonRecord).claimedAt as string)
              : null,
      });

  return {
    success: true,
    ...enrichedResult,
    ...workflowFields,
  };
}

/**
 * POST /api/internal/w4/build-print-input
 *
 * Internal endpoint for the repo-centric W4 orchestrator. It resolves the
 * canonical print-fulfillment context from the current payload plus companion
 * manifests/order data, then returns the normalized payload needed by the
 * remaining n8n PDF/Lulu/upload steps.
 *
 * Auth: Authorization: Bearer <BACKEND_API_TOKEN>
 */
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

  const body = unwrapPayloadObject(parsedBody);
  if (!body) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  try {
    const response = await buildW4PrintInputResponse(body, {
      defaultBackendUrl: request.nextUrl.origin,
    });
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W4 Build Print Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W4 print input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
