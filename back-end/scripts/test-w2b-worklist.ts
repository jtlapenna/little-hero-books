#!/usr/bin/env tsx

import {
  buildManifestKeyFromOrderPrefix,
  resolveOrderPathContext,
} from '@/lib/order-paths';
import { buildW2BWorklist } from '@/lib/books';
import { buildW2BWorklistResponse } from '@/app/api/internal/w2b/build-worklist/route';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function create2AManifest(options: {
  orderId: string;
  amazonOrderId?: string | null;
  characterHash: string;
  approvedEntries?: Array<{
    poseNumber: number;
    approvedKey: string;
    replacedAt?: string | null;
    replacementCount?: number;
  }>;
}): JsonRecord {
  const approvedEntries = options.approvedEntries ?? [
    {
      poseNumber: 1,
      approvedKey: `book-mvp-simple-adventure/order-generated-assets/characters/${options.characterHash}/poses/pose01.png`,
    },
    {
      poseNumber: 2,
      approvedKey: `book-mvp-simple-adventure/order-generated-assets/characters/${options.characterHash}/poses/pose02.png`,
      replacedAt: '2026-03-19T12:00:00.000Z',
      replacementCount: 1,
    },
  ];

  return {
    schema: 'lhb.run-manifest@v2.0',
    stage: '2a',
    order: {
      orderId: options.orderId,
      amazonOrderId: options.amazonOrderId ?? null,
      characterHash: options.characterHash,
    },
    characterHash: options.characterHash,
    entries: approvedEntries.map((entry) => ({
      poseNumber: entry.poseNumber,
      approved: true,
      status: 'approved',
      approvedKey: entry.approvedKey,
      replacedAt: entry.replacedAt ?? null,
      replacementCount: entry.replacementCount ?? 0,
    })),
  };
}

function create2BManifest(options: {
  orderId: string;
  characterHash: string;
  entries: Array<{
    poseNumber: number;
    bgRemovedKey: string;
    sourceApprovedKey: string;
    sourceReplacedAt?: string | null;
    sourceReplacementCount?: number;
  }>;
}): JsonRecord {
  return {
    schema: 'lhb.run-manifest@v2.0',
    stage: '2b',
    order: {
      orderId: options.orderId,
      characterHash: options.characterHash,
    },
    characterHash: options.characterHash,
    entries: options.entries.map((entry) => ({
      poseNumber: entry.poseNumber,
      bgRemovedKey: entry.bgRemovedKey,
      bgRemoved: true,
      bgRemovedStatus: 'completed',
      briaStatus: 'completed',
      sourceApprovedKey: entry.sourceApprovedKey,
      sourceReplacedAt: entry.sourceReplacedAt ?? null,
      sourceReplacementCount: entry.sourceReplacementCount ?? 0,
    })),
  };
}

async function main(): Promise<void> {
  const orderId = 'TEST-W2B-ITEM-001';
  const rootOrderId = '111-2222222-3333333';
  const characterHash = 'charhash123456';
  const orderPrefix = 'custom-book/orders/TEST-W2B-ITEM-001';
  const manifest2aKey = buildManifestKeyFromOrderPrefix(orderPrefix, '2a');
  const manifest2bKey = buildManifestKeyFromOrderPrefix(orderPrefix, '2b');
  const manifest2a = create2AManifest({
    orderId,
    amazonOrderId: rootOrderId,
    characterHash,
  });
  const loadManifest = async (manifestKey: string) => {
    if (manifestKey === manifest2aKey) {
      return manifest2a;
    }
    return null;
  };

  const baseInput = {
    orderId,
    rootOrderId,
    originalManifestUrl: `https://admin.littleherolabs.com/api/manifests/${manifest2aKey}`,
    backendUrl: 'https://admin.littleherolabs.com',
  };

  const built = await buildW2BWorklist(baseInput, {
    loadManifest,
  });

  assert(built.bookId === 'custom-book', 'Expected bookId to resolve from manifest path hints');
  assert(built.orderPrefix === orderPrefix, 'Expected orderPrefix to resolve from manifest path hints');
  assert(built.manifest2aUrl.endsWith(manifest2aKey), 'Expected manifest2aUrl to use the resolved manifest key');
  assert(built.manifest2bKey === manifest2bKey, 'Expected canonical 2B manifest key from resolved orderPrefix');
  assert(built.summary.scheduled === 2, 'Expected all approved poses to schedule when no 2B manifest exists');
  assert(built.summary.reason === null, 'Expected no skip reason when work exists');
  assert(built.amazonOrderId === rootOrderId, 'Expected amazonOrderId/rootOrderId to be preserved separately from orderId');
  assert(
    built.workItems.every((item) => item.orderId === orderId && item.amazonOrderId === rootOrderId),
    'Expected work items to preserve per-item orderId plus separate amazonOrderId',
  );

  const defaultBookManifestKey = buildManifestKeyFromOrderPrefix(
    'book-mvp-simple-adventure/orders/TEST-W2B-DEFAULT-001',
    '2a',
  );
  const builtDefaultBook = await buildW2BWorklist(
    {
      orderId: 'TEST-W2B-DEFAULT-001',
      backendUrl: 'https://admin.littleherolabs.com',
    },
    {
      loadManifest: async (manifestKey) =>
        manifestKey === defaultBookManifestKey
          ? create2AManifest({
              orderId: 'TEST-W2B-DEFAULT-001',
              characterHash: 'defaultbookhash123',
            })
          : null,
    },
  );

  assert(
    builtDefaultBook.manifest2aUrl.endsWith(defaultBookManifestKey),
    'Expected minimal payloads to fall back to the default Book 1 manifest path',
  );
  assert(
    builtDefaultBook.manifest2bKey ===
      'book-mvp-simple-adventure/orders/TEST-W2B-DEFAULT-001/manifests/2b-manifest.json',
    'Expected minimal payloads to derive the default Book 1 2B manifest key',
  );

  const existing2BManifest = create2BManifest({
    orderId,
    characterHash,
    entries: [
      {
        poseNumber: 1,
        bgRemovedKey: `custom-book/order-generated-assets/characters/${characterHash}/characters_${characterHash}_pose01_nobg.png`,
        sourceApprovedKey: String((manifest2a.entries as JsonRecord[])[0]?.approvedKey),
      },
      {
        poseNumber: 2,
        bgRemovedKey: `custom-book/order-generated-assets/characters/${characterHash}/characters_${characterHash}_pose02_nobg.png`,
        sourceApprovedKey: String((manifest2a.entries as JsonRecord[])[1]?.approvedKey),
        sourceReplacedAt: String((manifest2a.entries as JsonRecord[])[1]?.replacedAt),
        sourceReplacementCount: Number((manifest2a.entries as JsonRecord[])[1]?.replacementCount),
      },
    ],
  });

  const builtAllSkipped = await buildW2BWorklist(baseInput, {
    loadManifest: async (manifestKey) => {
      if (manifestKey === manifest2aKey) {
        return manifest2a;
      }
      if (manifestKey === manifest2bKey) {
        return existing2BManifest;
      }
      return null;
    },
  });

  assert(builtAllSkipped.summary.scheduled === 0, 'Expected matched 2B manifest to skip all approved poses');
  assert(
    builtAllSkipped.summary.reason === 'ALL_POSES_ALREADY_PROCESSED',
    'Expected all-skipped reason when every approved pose is already present in 2B',
  );
  assert(
    builtAllSkipped.summary.skippedBy2BManifest === 2,
    'Expected skippedBy2BManifest to count already-completed poses',
  );

  const builtForced = await buildW2BWorklist(baseInput, {
    loadManifest: async (manifestKey) => {
      if (manifestKey === manifest2aKey) {
        return manifest2a;
      }
      if (manifestKey === manifest2bKey) {
        return existing2BManifest;
      }
      return null;
    },
  });
  const builtForcedViaFlag = await buildW2BWorklist(
    {
      ...baseInput,
      force: true,
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === manifest2aKey) {
          return manifest2a;
        }
        if (manifestKey === manifest2bKey) {
          return existing2BManifest;
        }
        return null;
      },
    },
  );

  assert(builtForced.summary.scheduled === 0, 'Expected non-force build to remain skipped');
  assert(builtForcedViaFlag.summary.scheduled === 2, 'Expected force=true to schedule all approved poses');

  const noApprovedManifest = create2AManifest({
    orderId,
    amazonOrderId: rootOrderId,
    characterHash,
    approvedEntries: [],
  });
  noApprovedManifest.entries = [
    {
      poseNumber: 3,
      approved: false,
      status: 'rejected',
      approvedKey: null,
    },
  ];

  const noApproved = await buildW2BWorklist(
    {
      orderId,
      orderPrefix: 'book-hint/orders/TEST-W2B-ITEM-002',
      backendUrl: 'https://admin.littleherolabs.com',
    },
    {
      loadManifest: async (manifestKey) =>
        manifestKey === 'book-hint/orders/TEST-W2B-ITEM-002/manifests/2a-manifest.json'
          ? noApprovedManifest
          : null,
    },
  );

  assert(noApproved.summary.scheduled === 0, 'Expected no approved poses to schedule nothing');
  assert(noApproved.summary.reason === 'NO_APPROVED_POSES', 'Expected no-approved summary reason');

  const routeResponse = await buildW2BWorklistResponse(baseInput, {
    loadManifest,
  });

  assert(routeResponse.success === true, 'Expected route helper response success flag');
  assert(routeResponse.summary.scheduled === 2, 'Expected route helper to preserve worklist summary');

  const resolved = resolveOrderPathContext(orderId, {
    pathLikes: [baseInput.originalManifestUrl],
  });
  assert(resolved.orderPrefix === orderPrefix, 'Sanity check failed for order-path context resolution');

  console.log(
    JSON.stringify(
      {
        success: true,
        cases: [
          'resolved manifest keys from order-prefix hints',
          'fell back to default Book 1 manifest paths for minimal payloads',
          'preserved per-item orderId and separate amazonOrderId',
          'skipped poses from matching existing 2B manifest',
          'scheduled all poses with force=true',
          'returned NO_APPROVED_POSES summary',
          'route helper wrapper returned normalized success payload',
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[test-w2b-worklist] Failed:', error);
  process.exit(1);
});
