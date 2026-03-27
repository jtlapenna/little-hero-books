import { NextRequest, NextResponse } from "next/server";
import { verifyBearerAuth } from "@/lib/auth";
import {
  claimAndStartW2APoseJob,
  type W2APoseWorkflowFields,
} from "@/lib/workflow-jobs";
import { buildW2APoseInput, type BuildW2APoseInputResult } from "@/lib/books";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function joinUrl(base: string | null, key: string | null): string | null {
  const normalizedBase = toTrimmedString(base);
  const normalizedKey = toTrimmedString(key);
  if (!normalizedBase || !normalizedKey) {
    return null;
  }

  return `${normalizedBase.replace(/\/$/, "")}/${normalizedKey.replace(/^\/+/, "")}`;
}

type W2APoseReplayCompatibilityFields = {
  workflowReplayReady?: boolean;
  workflowReplayMode?: string | null;
  workflowReplaySource?: string | null;
  storageKey?: string | null;
  generatedPublicUrl?: string | null;
  generatedUrl?: string | null;
  fileUrl?: string | null;
  generatedImage?: {
    mimeType: string;
    size: number | null;
  };
};

export function buildW2APoseReplayCompatibilityFields(
  result: BuildW2APoseInputResult,
  workflowFields: W2APoseWorkflowFields,
): W2APoseReplayCompatibilityFields {
  const replay = workflowFields.workflowReplay;
  if (!replay) {
    return {};
  }

  const storageKey = replay.uploadKey;
  const generatedPublicUrl = joinUrl(result.publicR2Url, storageKey);

  return {
    workflowReplayReady: true,
    workflowReplayMode: replay.mode,
    workflowReplaySource: replay.sourceStatus,
    storageKey,
    generatedPublicUrl,
    generatedUrl: generatedPublicUrl,
    fileUrl: generatedPublicUrl,
    generatedImage: {
      mimeType: "image/png",
      size: replay.fileSize,
    },
  };
}

export async function buildW2APoseInputResponse(
  body: JsonRecord,
  options: {
    defaultBackendUrl?: string;
    instrumentPoseJob?: (
      payload: BuildW2APoseInputResult,
    ) => Promise<W2APoseWorkflowFields>;
  } = {},
): Promise<
  BuildW2APoseInputResult &
    W2APoseWorkflowFields &
    W2APoseReplayCompatibilityFields & { success: true }
> {
  const result = await buildW2APoseInput(body, {
    defaultBackendUrl: options.defaultBackendUrl,
  });
  const workflowFields = options.instrumentPoseJob
    ? await options.instrumentPoseJob(result)
    : await claimAndStartW2APoseJob(result);
  const replayCompatibility = buildW2APoseReplayCompatibilityFields(
    result,
    workflowFields,
  );

  return {
    success: true,
    ...result,
    ...workflowFields,
    ...replayCompatibility,
  };
}

/**
 * POST /api/internal/w2a/build-pose-input
 *
 * Internal endpoint for the next repo-centric W2A expansion slice. It resolves
 * canonical per-pose generation context, pathing, prompt text, and upload keys
 * so the remaining n8n nodes can focus on binary transport and provider calls.
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = unwrapPayloadObject(parsedBody);
  if (!body) {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  try {
    const response = await buildW2APoseInputResponse(body, {
      defaultBackendUrl: request.nextUrl.origin,
    });
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("[Internal W2A Build Pose Input] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to build W2A pose input",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
