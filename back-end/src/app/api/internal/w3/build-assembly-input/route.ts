import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { downloadManifest } from '@/lib/r2-service';
import { supabase } from '@/lib/supabase-client';
import {
  buildSkippedW3AssemblyWorkflowFields,
  claimAndStartW3AssemblyJob,
  type W3AssemblyWorkflowFields,
} from '@/lib/workflow-jobs';
import {
  buildW3AssemblyInput,
  type BuildW3AssemblyInputResult,
  type LoadManifestForW3,
} from '@/lib/books';
import { normalizePoseScaleAsset, type NormalizePoseScaleFn } from '@/lib/pose-scale-normalization';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;
type W3ReplayGuardOrderRow = {
  id?: number | null;
  orderId?: string | null;
  order_id?: string | null;
  workflow_step?: string | null;
  execution_status?: string | null;
  status?: string | null;
  manifest_3_url?: string | null;
  next_workflow?: string | number | null;
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

  const orderContext = body.orderContext;
  if (isRecord(orderContext) && key in orderContext) {
    return orderContext[key];
  }

  return undefined;
}

function shouldSkipCompletedW3Replay(
  orderRow: W3ReplayGuardOrderRow | null,
  forceReplay: boolean,
): boolean {
  if (!orderRow || forceReplay) {
    return false;
  }

  const workflowStep = toTrimmedString(orderRow.workflow_step);
  const executionStatus = toTrimmedString(orderRow.execution_status);
  const status = toTrimmedString(orderRow.status);
  const manifest3Url = toTrimmedString(orderRow.manifest_3_url);

  return Boolean(
    manifest3Url ||
      workflowStep === 'book_assembly_completed' ||
      (executionStatus === 'done' && status === 'pending_assembly_review'),
  );
}

async function lookupReplayGuardOrderRow(
  orderId: string,
): Promise<W3ReplayGuardOrderRow | null> {
  const lookup = await fetchOrderRowByAnyId<W3ReplayGuardOrderRow>(
    supabase,
    orderId,
    'id, orderId, order_id, workflow_step, execution_status, status, manifest_3_url, next_workflow',
  );
  return lookup.row ?? null;
}

export async function buildW3AssemblyInputResponse(
  body: JsonRecord,
  options: {
    loadManifest?: LoadManifestForW3;
    defaultBackendUrl?: string;
    normalizePoseScale?: NormalizePoseScaleFn;
    lookupOrderRow?: (orderId: string, rawBody: JsonRecord) => Promise<W3ReplayGuardOrderRow | null>;
    instrumentAssemblyJob?: (
      payload: BuildW3AssemblyInputResult,
      rawBody: JsonRecord,
    ) => Promise<W3AssemblyWorkflowFields>;
  } = {},
): Promise<BuildW3AssemblyInputResult & W3AssemblyWorkflowFields & { success: true }> {
  const result = await buildW3AssemblyInput(body, {
    loadManifest: options.loadManifest ?? downloadManifest,
    defaultBackendUrl: options.defaultBackendUrl,
    normalizePoseScale: options.normalizePoseScale ?? normalizePoseScaleAsset,
  });
  const forceReplay = toBoolean(pickBodyValue(body, 'force'));
  const orderRow = options.lookupOrderRow
    ? await options.lookupOrderRow(result.orderId, body)
    : await lookupReplayGuardOrderRow(result.orderId);
  if (shouldSkipCompletedW3Replay(orderRow, forceReplay)) {
    return {
      success: true,
      ...result,
      ...buildSkippedW3AssemblyWorkflowFields('w3-order-already-complete'),
    };
  }
  const workflowFields =
    options.instrumentAssemblyJob
      ? await options.instrumentAssemblyJob(result, body)
      : await claimAndStartW3AssemblyJob({
        ...result,
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
    ...result,
    ...workflowFields,
  };
}

/**
 * POST /api/internal/w3/build-assembly-input
 *
 * Internal endpoint for the repo-centric W3 orchestrator. It resolves the
 * canonical per-order assembly context, loads the companion 1/2B manifests,
 * and returns a normalized payload for the remaining n8n render/upload steps.
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
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const body = unwrapPayloadObject(parsedBody);
  if (!body) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  try {
    const response = await buildW3AssemblyInputResponse(body, {
      defaultBackendUrl: request.nextUrl.origin,
    });
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W3 Build Assembly Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W3 assembly input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
