import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { claimAndStartW2BPoseJob, type W2BPoseWorkflowFields } from '@/lib/workflow-jobs';
import { buildW2BPoseInput, type BuildW2BPoseInputResult } from '@/lib/books';

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

export async function buildW2BPoseInputResponse(
  body: JsonRecord,
  options: {
    defaultBackendUrl?: string;
    instrumentPoseJob?: (
      payload: BuildW2BPoseInputResult,
    ) => Promise<W2BPoseWorkflowFields>;
  } = {},
): Promise<BuildW2BPoseInputResult & { success: true }> {
  const result = buildW2BPoseInput(body, {
    defaultBackendUrl: options.defaultBackendUrl,
  });
  const workflowFields =
    options.instrumentPoseJob
      ? await options.instrumentPoseJob(result)
      : await claimAndStartW2BPoseJob(result);

  return {
    success: true,
    ...result,
    ...workflowFields,
  };
}

/**
 * POST /api/internal/w2b/build-pose-input
 *
 * Internal endpoint for the next repo-centric W2B expansion slice. It resolves
 * canonical single-pose Bria input, callback context, upload pathing, and QA
 * background metadata so the remaining n8n nodes can focus on provider calls,
 * waiting, and binary transport.
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
    const response = await buildW2BPoseInputResponse(body, {
      defaultBackendUrl: request.nextUrl.origin,
    });
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W2B Build Pose Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W2B pose input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
