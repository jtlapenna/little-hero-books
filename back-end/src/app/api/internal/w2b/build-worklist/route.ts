import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { attachWorkflowJobsToW2BWorkItems } from '@/lib/workflow-jobs';
import {
  buildW2BWorklist,
  type BuildW2BWorklistResult,
  type LoadManifestForW2B,
} from '@/lib/books';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

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

export async function buildW2BWorklistResponse(
  body: JsonRecord,
  options: {
    loadManifest?: LoadManifestForW2B;
    defaultBackendUrl?: string;
    instrumentWorkItems?: (
      result: BuildW2BWorklistResult,
    ) => Promise<BuildW2BWorklistResult>;
  } = {},
): Promise<BuildW2BWorklistResult & { success: true }> {
  const result = await buildW2BWorklist(body, {
    loadManifest: options.loadManifest ?? downloadManifest,
    defaultBackendUrl: options.defaultBackendUrl,
  });
  const instrumented =
    options.instrumentWorkItems
      ? await options.instrumentWorkItems(result)
      : result.workItems.length
        ? {
            ...result,
            workItems: await attachWorkflowJobsToW2BWorkItems({
              orderId: result.orderId,
              rootOrderId: result.rootOrderId,
              amazonOrderId: result.amazonOrderId,
              bookId: result.bookId,
              workItems: result.workItems,
            }),
          }
        : result;

  return {
    success: true,
    ...instrumented,
  };
}

/**
 * POST /api/internal/w2b/build-worklist
 *
 * Internal endpoint for the repo-centric W2B orchestrator. It resolves the
 * canonical per-order W2B context, loads the companion 2A/2B manifests, and
 * returns a normalized worklist/summary payload for n8n fan-out.
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
    const response = await buildW2BWorklistResponse(body, {
      defaultBackendUrl: request.nextUrl.origin,
    });
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W2B Build Worklist] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W2B worklist',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
