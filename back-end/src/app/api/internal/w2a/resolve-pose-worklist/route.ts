import { NextRequest, NextResponse } from "next/server";
import { verifyBearerAuth } from "@/lib/auth";
import { downloadManifest } from "@/lib/r2-service";
import {
  attachWorkflowJobsToW2AWorkItems,
  type W2APoseWorkItemLike,
} from "@/lib/workflow-jobs";
import {
  buildW2APoseWorklist,
  loadRuntimeBookConfig,
  normalizeW0Manifest,
  resolvePagePlan,
  resolveReviewPageContext,
  type BookConfigRuntimeSource,
} from "@/lib/books";
import {
  buildManifestKeyCandidates,
  extractManifestKey,
  inferBookIdFromPathLikes,
} from "@/lib/order-paths";

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

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseConfigSource(
  value: unknown,
): BookConfigRuntimeSource | undefined {
  const candidate = typeof value === "string" ? value.trim() : "";

  if (
    candidate === "bundled" ||
    candidate === "published" ||
    candidate === "published-first"
  ) {
    return candidate;
  }

  return undefined;
}

function resolveManifestHints(body: JsonRecord): string[] {
  const orderContext = isRecord(body.orderContext) ? body.orderContext : {};
  const values = [
    body.oneManifestUrl,
    body.one_manifest_url,
    orderContext.oneManifestUrl,
    orderContext.one_manifest_url,
    body.orderPrefix,
    orderContext.orderPrefix,
    body.assetPrefix,
    orderContext.assetPrefix,
  ];

  return values
    .map((value) => toTrimmedString(value))
    .filter((value): value is string => Boolean(value));
}

function resolveFormatId(body: JsonRecord): string {
  const orderContext = isRecord(body.orderContext) ? body.orderContext : {};
  return (
    toTrimmedString(body.formatId) ??
    toTrimmedString(orderContext.formatId) ??
    (toTrimmedString(body.amazonOrderId) ||
    toTrimmedString(body.amazon_order_id) ||
    toTrimmedString(body.marketplaceId) ||
    toTrimmedString(body.marketplace_id)
      ? "amazon"
      : "standard")
  );
}

export interface ResolveW2APoseWorklistResponsePayload extends JsonRecord {
  success: true;
  orderId: string | null;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  oneManifestKey: string | null;
  bookId: string;
  formatId: string;
  includeZeroPose: boolean;
  allowZeroPose: boolean;
  pagePlanSource: "w0-v3" | "runtime-config" | "legacy-default";
  expectedPageCount: number;
  pageLabels: string[];
  requiredPoseNumbers: number[];
  totalPosesRequired: number;
  numPoses: number;
  poseWorklist: W2APoseWorkItemLike[];
}

export async function resolveW2APoseWorklistResponse(
  body: JsonRecord,
  options: {
    downloadOneManifest?: typeof downloadManifest;
    loadBookConfig?: typeof loadRuntimeBookConfig;
    instrumentPoseWorkItems?: (
      payload: ResolveW2APoseWorklistResponsePayload,
    ) => Promise<W2APoseWorkItemLike[]>;
  } = {},
): Promise<ResolveW2APoseWorklistResponsePayload> {
  const orderContext = isRecord(body.orderContext) ? body.orderContext : {};
  const orderId =
    toTrimmedString(body.orderId) ?? toTrimmedString(orderContext.orderId);
  const rootOrderId =
    toTrimmedString(body.rootOrderId) ??
    toTrimmedString(body.root_order_id) ??
    toTrimmedString(orderContext.rootOrderId) ??
    toTrimmedString(orderContext.root_order_id) ??
    toTrimmedString(body.amazonOrderId) ??
    toTrimmedString(body.amazon_order_id) ??
    toTrimmedString(orderContext.amazonOrderId) ??
    toTrimmedString(orderContext.amazon_order_id);
  const amazonOrderId =
    toTrimmedString(body.amazonOrderId) ??
    toTrimmedString(body.amazon_order_id) ??
    toTrimmedString(orderContext.amazonOrderId) ??
    toTrimmedString(orderContext.amazon_order_id) ??
    rootOrderId;
  const includeZeroPose = toBoolean(
    body.includeZeroPose ?? body.allowZeroPose ?? orderContext.allowZeroPose,
    true,
  );
  const manifestHints = resolveManifestHints(body);
  const explicitOneManifestKey = manifestHints
    .map((value) => extractManifestKey(value))
    .find((value): value is string => Boolean(value));

  const oneManifestKey =
    explicitOneManifestKey ??
    (orderId
      ? (buildManifestKeyCandidates(orderId, "1", {
          pathLikes: manifestHints,
        })[0] ?? null)
      : null);

  let oneManifestSnapshot = null;
  if (oneManifestKey) {
    const manifest = await (options.downloadOneManifest ?? downloadManifest)(
      oneManifestKey,
    ).catch(() => null);
    if (manifest) {
      oneManifestSnapshot = normalizeW0Manifest(manifest, {
        fallbackManifestKey: oneManifestKey,
      });
    }
  }

  const configSource =
    parseConfigSource(body.configSource) ?? "published-first";
  const configVersion =
    toPositiveInt(body.configVersion) ??
    toPositiveInt(body.version) ??
    undefined;
  const inferredBookIdFromHints = inferBookIdFromPathLikes(...resolveManifestHints(body));
  const resolvedBookId =
    oneManifestSnapshot?.bookId ??
    toTrimmedString(body.bookId) ??
    toTrimmedString(orderContext.bookId) ??
    inferredBookIdFromHints ??
    "unknown-book";
  const resolvedFormatId =
    oneManifestSnapshot?.formatId ?? resolveFormatId(body);

  let pagePlanSource: "w0-v3" | "runtime-config" | "legacy-default";
  let pagePlan;
  let pageLabels;
  let expectedPageCount;

  if (oneManifestSnapshot?.pagePlan.length) {
    const reviewContext = resolveReviewPageContext({
      snapshot: oneManifestSnapshot,
      bookId: resolvedBookId,
      formatId: resolvedFormatId,
      isAmazonOrder: resolvedFormatId === "amazon",
    });
    pagePlanSource = reviewContext.pagePlanSource;
    pagePlan = reviewContext.pagePlan;
    pageLabels = reviewContext.pageLabels;
    expectedPageCount = reviewContext.expectedPageCount;
  } else {
    try {
      const config = await (options.loadBookConfig ?? loadRuntimeBookConfig)({
        bookId: resolvedBookId,
        version: configVersion,
        source: configSource,
      });
      const resolvedPlan = resolvePagePlan(config, resolvedFormatId);
      pagePlanSource = "runtime-config";
      pagePlan = resolvedPlan.pagePlan;
      pageLabels = resolvedPlan.pageLabels;
      expectedPageCount = resolvedPlan.expectedPageCount;
    } catch {
      const fallbackContext = resolveReviewPageContext({
        snapshot: null,
        bookId: resolvedBookId,
        formatId: resolvedFormatId,
        isAmazonOrder: resolvedFormatId === "amazon",
      });
      pagePlanSource = fallbackContext.pagePlanSource;
      pagePlan = fallbackContext.pagePlan;
      pageLabels = fallbackContext.pageLabels;
      expectedPageCount = fallbackContext.expectedPageCount;
    }
  }

  const poseWorklist = buildW2APoseWorklist(pagePlan, {
    includeZeroPose,
  });
  const requiredPoseNumbers = poseWorklist
    .map((item) => item.poseNumber)
    .filter((poseNumber) => poseNumber > 0);
  const backendUrl =
    toTrimmedString(body.backendUrl) ??
    toTrimmedString(orderContext.backendUrl);
  const publicR2Url =
    toTrimmedString(body.publicR2Url) ??
    toTrimmedString(orderContext.publicR2Url);

  const poseWorkItemsWithContext = poseWorklist.map<W2APoseWorkItemLike>(
    (item) => ({
      ...item,
      orderId: orderId ?? "",
      rootOrderId,
      amazonOrderId,
      bookId: resolvedBookId,
      formatId: resolvedFormatId,
      oneManifestKey,
      backendUrl,
      publicR2Url,
    }),
  );

  const response: ResolveW2APoseWorklistResponsePayload = {
    success: true,
    ...body,
    orderId,
    rootOrderId,
    amazonOrderId,
    oneManifestKey,
    bookId: resolvedBookId,
    formatId: resolvedFormatId,
    includeZeroPose,
    allowZeroPose: includeZeroPose,
    pagePlanSource,
    expectedPageCount,
    pageLabels,
    requiredPoseNumbers,
    totalPosesRequired: poseWorklist.length,
    numPoses: poseWorklist.length,
    poseWorklist: poseWorkItemsWithContext,
  };

  response.poseWorklist = options.instrumentPoseWorkItems
    ? await options.instrumentPoseWorkItems(response)
    : orderId && poseWorkItemsWithContext.length
      ? await attachWorkflowJobsToW2AWorkItems({
          orderId,
          rootOrderId,
          amazonOrderId,
          bookId: resolvedBookId,
          formatId: resolvedFormatId,
          oneManifestKey,
          backendUrl,
          publicR2Url,
          workItems: poseWorkItemsWithContext,
        })
      : poseWorkItemsWithContext;

  return response;
}

/**
 * POST /api/internal/w2a/resolve-pose-worklist
 *
 * Internal endpoint for the sibling W2A orchestrator. It resolves the pose
 * worklist from the companion W0 manifest/page plan when available, falls back
 * to runtime book config when possible, and only then uses the legacy Book 1
 * review plan fallback.
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
    const response = await resolveW2APoseWorklistResponse(body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("[Internal W2A Resolve Pose Worklist] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to resolve W2A pose worklist",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
