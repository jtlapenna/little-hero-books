import { requiresConfiguredW0Snapshot } from '@/lib/books/book-legacy-compatibility';
import { requireActiveW2AParent, readActiveW2AParent, admitW2AParentExecution, assertFrozenW2AParentSelection } from '@/lib/w2a-parent-claim';
import { verifyEmptyW2ARestart, bootstrapRetryPorts, admitW2ABootstrapRestart, type W2ABootstrapRetryPorts } from '@/lib/books/w2a-bootstrap-retry';
import { failureRecord, storedW2AFailure, W2A_FAILURE_KEY } from '@/lib/w2a-execution-failure';
import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { buildW2ABootstrapManifest, uploadW2ABootstrapIfAbsent } from '@/lib/books';
import { downloadManifest } from '@/lib/r2-service';
import { extractManifestKey } from '@/lib/order-paths';
import { resolveW2APoseWorklistResponse } from '../resolve-pose-worklist/route';
import { normalizeW0Manifest } from '@/lib/books/normalize-w0-manifest';
import { reconcileFrozenW2AInput } from '@/lib/books/w2a-frozen-input';
import { inspectWorkflowBookIdentity, assertWorkflowMatchesW0 } from '@/lib/books/workflow-book-identity';

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

export class W2ABootstrapExistsError extends Error {}

export async function buildValidatedW2ABootstrapManifest(
  body: Record<string, unknown>,
  options: { downloadOneManifest?: typeof downloadManifest } = {},
) {
  const orderContext = isRecord(body.orderContext) ? body.orderContext : {};
  const pointers = [body.oneManifestUrl, body.one_manifest_url, orderContext.oneManifestUrl, orderContext.one_manifest_url];
  const selectedKeys = pointers
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => {
      const selected = extractManifestKey(value);
      if (!selected) throw new Error('W2A bootstrap has an invalid frozen W0 manifest pointer');
      return selected;
    });
  if (new Set(selectedKeys).size > 1) {
    throw new Error('W2A bootstrap has conflicting frozen W0 manifest pointers');
  }
  const identity = inspectWorkflowBookIdentity(body);
  const key = identity.manifestKey ?? selectedKeys[0];
  if (!key) {
    const legacy = buildW2ABootstrapManifest(body);
    if (legacy.bookId !== 'book-mvp-simple-adventure') {
      throw new Error('Configured W2A bootstrap requires frozen W0 manifest pointer');
    }
    return legacy;
  }
  const manifest = await (options.downloadOneManifest ?? downloadManifest)(key);
  if (!manifest) throw new Error('W2A bootstrap frozen W0 manifest is missing');
  const normalized = normalizeW0Manifest(manifest, { fallbackManifestKey: key });
  assertWorkflowMatchesW0(identity, normalized, manifest, key);
  const canonicalBody = reconcileFrozenW2AInput(body, normalized);
  // Recovery evidence is server state, never part of the book's frozen bootstrap content.
  const details = failureRecord(canonicalBody.orderDetails ?? orderContext.orderDetails);
  if (details) { const clean = { ...details }; delete clean[W2A_FAILURE_KEY]; delete clean._w2a_parent_claim; canonicalBody.orderDetails = clean; }
  const built = buildW2ABootstrapManifest(canonicalBody);
  if (extractManifestKey(built.oneManifestUrl) !== key) {
    throw new Error('W2A bootstrap selected another W0 manifest');
  }
  await resolveW2APoseWorklistResponse({
    ...canonicalBody,
    orderId: built.orderId,
    bookId: built.bookId,
    oneManifestUrl: built.oneManifestUrl,
    one_manifest_url: built.oneManifestUrl,
  }, {
    downloadOneManifest: async (selectedKey) => {
      if (selectedKey !== key) throw new Error('W2A bootstrap selected another W0 manifest');
      return manifest;
    },
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  });
  return { ...built, formatId: normalized.formatId, configVersion: normalized.configVersion, configuredW0: requiresConfiguredW0Snapshot(normalized) };
}

export async function persistValidatedW2ABootstrapManifest(
  body: Record<string, unknown>,
  options: {
    downloadOneManifest?: typeof downloadManifest;
    uploadIfAbsent?: typeof uploadW2ABootstrapIfAbsent;
    retryPorts?: W2ABootstrapRetryPorts;
    parent?: Awaited<ReturnType<typeof requireActiveW2AParent>>;
  } = {},
) {
  const built = await buildValidatedW2ABootstrapManifest(body, options);
  if (options.parent) assertFrozenW2AParentSelection(options.parent.row, built);
  const created = await (options.uploadIfAbsent ?? uploadW2ABootstrapIfAbsent)(built.manifestKey, built.manifest);
  if (!created) {
    if (!options.parent || !storedW2AFailure(options.parent.row)?.resolvedAt) throw new W2ABootstrapExistsError('W2A bootstrap already exists; inspect the existing 2A run before retry');
  }
  if (options.parent) {
    if (storedW2AFailure(options.parent.row)?.resolvedAt) await verifyEmptyW2ARestart(options.parent.row, built, 'bootstrap', options.parent.claim, options.retryPorts);
    else assertFrozenW2AParentSelection(await readActiveW2AParent(options.parent.claim), built);
  }
  return built;
}

export function buildW2ABootstrapResponse(
  body: Record<string, unknown>,
  built: Awaited<ReturnType<typeof buildValidatedW2ABootstrapManifest>>,
) {
  return {
    success: true,
    ...body,
    orderId: built.orderId,
    rootOrderId: built.rootOrderId,
    amazonOrderId: built.amazonOrderId,
    characterHash: built.characterHash,
    characterSpecs: built.characterSpecs,
    bookSpecs: built.bookSpecs,
    childName: built.childName,
    orderContext: {
      ...(isRecord(body.orderContext) ? body.orderContext : {}),
      characterHash: built.characterHash,
      characterSpecs: built.characterSpecs,
      bookSpecs: built.bookSpecs,
      childName: built.childName,
    },
    bookId: built.bookId,
    orderPrefix: built.orderPrefix,
    assetsRoot: built.assetsRoot,
    publicR2Url: built.publicR2Url,
    manifestKey: built.manifestKey,
    manifestUrl: built.manifestUrl,
    manifest: built.manifest,
    manifestBootstrapReady: true,
    uploadBucket: 'little-hero-orders',
  };
}

/**
 * POST /api/internal/w2a/bootstrap-manifest
 *
 * Internal endpoint for the sibling W2A orchestrator. It builds the canonical
 * per-item 2A bootstrap manifest in repo code and uploads it to R2 so later
 * W2A steps do not need to hardcode manifest keys in n8n.
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
    const parent = await requireActiveW2AParent(body, String(body.orderId ?? failureRecord(body.orderContext)?.orderId ?? ''));
    const retryPorts = await bootstrapRetryPorts();
    const preview = await buildValidatedW2ABootstrapManifest(body);
    assertFrozenW2AParentSelection(parent.row, preview);
    parent.row = await admitW2AParentExecution(parent.row,parent.claim);
    if (storedW2AFailure(parent.row)?.resolvedAt) {
      await verifyEmptyW2ARestart(parent.row, preview, 'bootstrap', parent.claim, retryPorts);
      parent.row = await admitW2ABootstrapRestart(parent.row, parent.claim);
    }
    const built = await persistValidatedW2ABootstrapManifest(body, { parent, retryPorts });

    return NextResponse.json(buildW2ABootstrapResponse(body, built));
  } catch (error: unknown) {
    console.error('[Internal W2A Bootstrap Manifest] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to bootstrap W2A manifest',
        details: getErrorMessage(error),
      },
      { status: error instanceof W2ABootstrapExistsError ? 409 : 500 },
    );
  }
}
