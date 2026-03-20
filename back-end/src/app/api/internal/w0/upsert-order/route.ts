import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { upsertOrderByPerBookId } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPayloadObject(value: unknown): Record<string, unknown> | null {
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

function normalizeUpsertPayload(body: Record<string, unknown>) {
  const passthroughPayload = isRecord(body.orderUpsert) ? body.orderUpsert : body;
  const payload: Record<string, unknown> = { ...passthroughPayload };

  const manifestKey =
    toTrimmedString(body.r2Key) ??
    toTrimmedString(body.manifestKey) ??
    toTrimmedString(payload.one_manifest_url);

  if (manifestKey && !toTrimmedString(payload.one_manifest_url)) {
    payload.one_manifest_url = manifestKey;
  }

  const orderId =
    toTrimmedString(payload.orderId) ??
    toTrimmedString(payload.order_id);

  if (!orderId) {
    throw new Error('Missing orderId/order_id in W0 upsert payload');
  }

  if (!toTrimmedString(payload.one_manifest_url)) {
    throw new Error('Missing one_manifest_url/r2Key for W0 order upsert');
  }

  return {
    payload,
    orderId,
    manifestKey: toTrimmedString(payload.one_manifest_url) ?? manifestKey,
  };
}

/**
 * POST /api/internal/w0/upsert-order
 *
 * Internal endpoint for n8n W0 to persist the canonical order row using the
 * repo-owned per-book upsert helper. n8n can pass either the full build
 * response or just { orderUpsert }.
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
    const { payload, orderId, manifestKey } = normalizeUpsertPayload(body);
    const result = await upsertOrderByPerBookId(payload);

    if (result.error) {
      throw result.error;
    }

    const responseBody: Record<string, unknown> = {
      success: true,
      orderId,
      wasInsert: result.wasInsert,
      r2Key: manifestKey,
      manifestKey,
      orderUpsert: payload,
    };

    if ('manifest' in parsedBody) {
      responseBody.manifest = parsedBody.manifest;
    }

    if (isRecord(parsedBody._config)) {
      responseBody._config = parsedBody._config;
    }

    if (isRecord(result.data)) {
      responseBody.record = result.data;
      Object.assign(responseBody, result.data);
    }

    return NextResponse.json(responseBody);
  } catch (error: unknown) {
    console.error('[Internal W0 Upsert Order] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upsert W0 order',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
