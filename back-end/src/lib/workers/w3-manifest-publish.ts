import { buildW3Manifest, type BuildW3ManifestResult } from '@/lib/books';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

type JsonRecord = Record<string, unknown>;

export type PublishW3ManifestInput = JsonRecord;

type PutObjectImpl = (
  bucket: string,
  key: string,
  body: Blob | ArrayBuffer | ReadableStream | Uint8Array | string,
  contentType?: string,
) => Promise<unknown>;

type GetOrderImpl = (orderId: string) => Promise<Record<string, unknown> | null>;
type UpdateOrderImpl = (
  orderId: string,
  updates: Record<string, unknown>,
) => Promise<unknown>;

export interface PublishW3ManifestOptions {
  getOrderImpl?: GetOrderImpl;
  updateOrderImpl?: UpdateOrderImpl;
  putObjectImpl?: PutObjectImpl;
  now?: Date;
}

export interface PublishW3ManifestResult extends BuildW3ManifestResult {
  backendUrl: string;
  manifestKey: string;
  manifestUrl: string;
  manifestBucket: string;
  uploadBucket: string;
  manifestReady: true;
  reviewStages: JsonRecord;
  mergedReviewStages: JsonRecord;
  orderUpdateApplied: true;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  return lowered === 'null' || lowered === 'undefined' ? null : trimmed;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = toTrimmedString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function mergeReviewStages(existing: unknown): JsonRecord {
  const current = toRecord(existing);
  return {
    ...current,
    postPdf: {
      ...toRecord(current.postPdf),
      status: 'in-review',
    },
  };
}

function buildOrderPatch(input: {
  built: BuildW3ManifestResult;
  mergedReviewStages: JsonRecord;
  now: Date;
}): Record<string, unknown> {
  const rootGroupId =
    firstString(
      input.built.rootOrderId,
      input.built.amazonOrderId,
      input.built.orderId,
    ) ?? input.built.orderId;

  return {
    root_order_id: rootGroupId,
    amazon_order_id: rootGroupId,
    manifest_3_url: input.built.manifest3Url,
    status: 'pending_assembly_review',
    review_stages: input.mergedReviewStages,
    next_workflow: '4',
    execution_status: 'done',
    started_at: null,
    current_workflow: null,
    workflow_step: 'book_assembly_completed',
    updated_at: input.now.toISOString(),
  };
}

export async function publishW3Manifest(
  input: PublishW3ManifestInput,
  options: PublishW3ManifestOptions = {},
): Promise<PublishW3ManifestResult> {
  const built = buildW3Manifest(input);
  const backendUrl =
    firstString(input.backendUrl, (built as JsonRecord).backendUrl) ??
    'https://admin.littleherolabs.com';
  const putObjectImpl = options.putObjectImpl ?? putObject;
  const getOrderImpl = options.getOrderImpl ?? getOrderFromSupabase;
  const updateOrderImpl = options.updateOrderImpl ?? updateOrderInSupabase;
  const now = options.now ?? new Date();
  const manifestKey = built.manifest3Key;
  const manifestUrl = built.manifest3Url;

  await putObjectImpl(
    R2_ORDERS_BUCKET,
    manifestKey,
    JSON.stringify(built.manifest, null, 2),
    'application/json',
  );

  const currentOrder = await getOrderImpl(built.orderId);
  const mergedReviewStages = mergeReviewStages(currentOrder?.review_stages);
  const updateResult = await updateOrderImpl(
    built.orderId,
    buildOrderPatch({
      built,
      mergedReviewStages,
      now,
    }),
  );

  if (!updateResult) {
    throw new Error(`W3 manifest publish could not persist order row for ${built.orderId}`);
  }

  return {
    ...built,
    backendUrl,
    manifestKey,
    manifestUrl,
    manifestBucket: R2_ORDERS_BUCKET,
    uploadBucket: R2_ORDERS_BUCKET,
    manifestReady: true,
    reviewStages: mergedReviewStages,
    mergedReviewStages,
    orderUpdateApplied: true,
  };
}
