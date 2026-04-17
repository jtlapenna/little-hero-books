#!/usr/bin/env tsx

import { buildW0RunManifest } from '@/lib/books';
import {
  buildManifestKeyFromOrderPrefix,
  buildOrderPrefix,
} from '@/lib/order-paths';
import { buildW3AssemblyInput } from '@/lib/books/w3-assembly-input';
import { buildW3AssemblyInputResponse } from '@/app/api/internal/w3/build-assembly-input/route';
import type { NormalizePoseScaleFn } from '@/lib/pose-scale-normalization';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function create2BManifest(options: {
  orderId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  characterHash: string;
  publicR2Url?: string | null;
  characterSpecs?: JsonRecord;
  bookSpecs?: JsonRecord;
  orderDetails?: JsonRecord;
}): JsonRecord {
  return {
    schema: 'lhb.run-manifest@v2.0',
    stage: '2b',
    characterHash: options.characterHash,
    order: {
      orderId: options.orderId,
      rootOrderId: options.rootOrderId ?? options.orderId,
      amazonOrderId: options.amazonOrderId ?? null,
      characterHash: options.characterHash,
      publicR2Url:
        options.publicR2Url ??
        'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev',
      characterSpecs: options.characterSpecs ?? {
        childName: 'Ada',
        animalGuide: 'owl',
      },
      bookSpecs: options.bookSpecs ?? {
        title: 'Ada and the Quiet Trail',
      },
      orderDetails: options.orderDetails ?? {
        quantity: 1,
      },
    },
    entries: [
      {
        poseNumber: 1,
        bgRemovedKey: `book-mvp-simple-adventure/order-generated-assets/characters/${options.characterHash}/characters_${options.characterHash}_pose01_nobg.png`,
        sourceApprovedKey: `book-mvp-simple-adventure/order-generated-assets/characters/${options.characterHash}/poses/pose01.png`,
        briaStatus: 'completed',
      },
      {
        poseNumber: 2,
        sourceApprovedKey: `book-mvp-simple-adventure/order-generated-assets/characters/${options.characterHash}/poses/pose02.png`,
        approvedKey: `book-mvp-simple-adventure/order-generated-assets/characters/${options.characterHash}/poses/pose02.png`,
        bgRemovedKey: null,
        briaStatus: 'pending',
        flipped: true,
        flippedAt: '2026-03-23T12:00:00.000Z',
      },
    ],
  };
}

async function main(): Promise<void> {
  const backendUrl = 'https://admin.littleherolabs.com';
  const bookId = 'book-mvp-simple-adventure';
  const normalizationCalls: Array<{ poseNumber: number; imageKey: string; bookId: string }> = [];
  const normalizePoseScale: NormalizePoseScaleFn = async ({
    poseNumber,
    imageKey,
    bookId: resolvedBookId,
  }) => {
    normalizationCalls.push({
      poseNumber,
      imageKey,
      bookId: resolvedBookId ?? '',
    });
    return {
      success: true,
      normalized: false,
      imageKey,
      refKey: `${resolvedBookId}/characters/poses/pose${String(poseNumber).padStart(2, '0')}.png`,
      poseNumber,
      bookId: resolvedBookId ?? '',
      message: 'Already within tolerance',
      scaleFactor: 1,
      verticalOffset: 0,
      horizontalOffset: 0,
      sourceBBoxFound: true,
      referenceBBoxFound: true,
    };
  };

  const amazonOrderId = '111-2222222-3333333';
  const siblingOrderId = 'TEST-W3-ITEM-001';
  const siblingOrderPrefix = buildOrderPrefix(siblingOrderId, bookId);
  const siblingOneManifest = buildW0RunManifest({
    orderId: siblingOrderId,
    rootOrderId: amazonOrderId,
    amazonOrderId,
    platform: 'amazon',
    bookId,
    formatId: 'amazon',
    characterHash: 'charhash123456',
    input: {
      characterSpecs: {
        childName: 'Ada',
        animalGuide: 'owl',
      },
      bookSpecs: {
        title: 'Ada and the Quiet Trail',
      },
      orderDetails: {
        quantity: 1,
      },
      dedicationText: 'Manifest dedication',
    },
  });
  const siblingOneManifestKey = buildManifestKeyFromOrderPrefix(
    siblingOrderPrefix,
    '1',
  );
  const siblingTwoBManifestKey = buildManifestKeyFromOrderPrefix(
    siblingOrderPrefix,
    '2b',
  );
  const siblingTwoBManifest = create2BManifest({
    orderId: siblingOrderId,
    rootOrderId: amazonOrderId,
    amazonOrderId,
    characterHash: 'charhash123456',
  });

  const siblingLoadManifest = async (manifestKey: string) => {
    if (manifestKey === siblingOneManifestKey) {
      return siblingOneManifest;
    }
    if (manifestKey === siblingTwoBManifestKey) {
      return siblingTwoBManifest;
    }
    return null;
  };

  const siblingBuilt = await buildW3AssemblyInput(
    {
      orderId: siblingOrderId,
      rootOrderId: amazonOrderId,
      amazonOrderId,
      orderPrefix: siblingOrderPrefix,
      backendUrl,
      dedicationText: 'Route dedication',
      testMode: true,
      testModePages: 3,
    },
    {
      loadManifest: siblingLoadManifest,
      normalizePoseScale,
    },
  );

  assert(
    siblingBuilt.orderId === siblingOrderId,
    'Expected sibling W3 input to preserve per-book orderId',
  );
  assert(
    siblingBuilt.amazonOrderId === amazonOrderId,
    'Expected sibling W3 input to preserve amazonOrderId separately',
  );
  assert(
    siblingBuilt.rootOrderId === amazonOrderId,
    'Expected sibling W3 input to preserve rootOrderId separately',
  );
  assert(
    siblingBuilt.orderPrefix === siblingOrderPrefix,
    'Expected orderPrefix-driven manifest lookup',
  );
  assert(
    siblingBuilt.oneManifestUrl?.endsWith(siblingOneManifestKey),
    'Expected oneManifestUrl to use the resolved canonical key',
  );
  assert(
    siblingBuilt.manifest2bUrl.endsWith(siblingTwoBManifestKey),
    'Expected manifest2bUrl to use the resolved canonical key',
  );
  assert(
    siblingBuilt.manifest3Key ===
      'book-mvp-simple-adventure/orders/TEST-W3-ITEM-001/manifests/3-manifest.json',
    'Expected canonical 3-manifest key under the per-book order root',
  );
  assert(
    siblingBuilt.expectedPageCount === 17 &&
      siblingBuilt.pagePlan.length === 17 &&
      siblingBuilt.pagePlanSource === 'w0-v3',
    'Expected amazon W3 input to use the W0-frozen page plan',
  );
  assert(
    siblingBuilt.requiredPoseNumbers.length === 12 &&
      siblingBuilt.requiredPoseSource === 'w0-v3',
    'Expected required poses to load from the companion 1-manifest',
  );
  assert(
    siblingBuilt.dedicationText === 'Route dedication',
    'Expected explicit dedicationText to win over manifest dedication',
  );
  assert(
    siblingBuilt.testMode === true && siblingBuilt.testModePages === 3,
    'Expected testMode and testModePages passthrough',
  );
  assert(
    siblingBuilt.processedImages[0]?.sourceKey === 'bgRemovedKey' &&
      siblingBuilt.processedImages[0]?.briaProcessed === true,
    'Expected bgRemovedKey to win for processedImages',
  );
  assert(
    siblingBuilt.processedImages[1]?.sourceKey === 'approvedKey' &&
      siblingBuilt.processedImages[1]?.briaProcessed === false,
    'Expected approvedKey/sourceApprovedKey fallback when bgRemovedKey is missing',
  );
  assert(
    siblingBuilt.missingBgRemovedPoseNumbers.includes(2),
    'Expected missingBgRemovedPoseNumbers to include required poses missing bgRemovedKey',
  );
  assert(
    normalizationCalls.length === 1 &&
      normalizationCalls[0]?.poseNumber === 1 &&
      normalizationCalls[0]?.bookId === bookId,
    'Expected W3 assembly input to auto-normalize required bgRemoved poses before page assembly',
  );

  const standardOrderId = 'TEST-W3-STANDARD-001';
  const standardOrderPrefix = buildOrderPrefix(standardOrderId, bookId);
  const standardOneManifest = buildW0RunManifest({
    orderId: standardOrderId,
    rootOrderId: standardOrderId,
    amazonOrderId: null,
    platform: 'd2c',
    bookId,
    formatId: 'standard',
    characterHash: 'charhash7890ab',
    input: {
      characterSpecs: {
        childName: 'Bea',
        animalGuide: 'cat',
      },
      bookSpecs: {
        title: 'Bea and the Quiet Trail',
      },
      orderDetails: {
        quantity: 1,
      },
      dedicationText: 'Manifest standard dedication',
    },
  });
  const standardOneManifestKey = buildManifestKeyFromOrderPrefix(
    standardOrderPrefix,
    '1',
  );
  const standardTwoBManifestKey = buildManifestKeyFromOrderPrefix(
    standardOrderPrefix,
    '2b',
  );
  const standardTwoBManifest = create2BManifest({
    orderId: standardOrderId,
    rootOrderId: standardOrderId,
    amazonOrderId: null,
    characterHash: 'charhash7890ab',
    characterSpecs: {
      childName: 'Bea',
      animalGuide: 'cat',
    },
    bookSpecs: {
      title: 'Bea and the Quiet Trail',
    },
  });

  const standardBuilt = await buildW3AssemblyInput(
    {
      body: {
        orderId: standardOrderId,
        orderPrefix: standardOrderPrefix,
        backendUrl,
      },
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === standardOneManifestKey) {
          return standardOneManifest;
        }
        if (manifestKey === standardTwoBManifestKey) {
          return standardTwoBManifest;
        }
        return null;
      },
      normalizePoseScale,
    },
  );

  assert(
    standardBuilt.orderId === standardOrderId,
    'Expected nested-body W3 input to preserve orderId',
  );
  assert(
    standardBuilt.rootOrderId === standardOrderId,
    'Expected standard W3 input to derive rootOrderId from the 1-manifest',
  );
  assert(
    standardBuilt.amazonOrderId === null,
    'Expected standard W3 input to keep amazonOrderId null',
  );
  assert(
    standardBuilt.isAmazonOrder === false &&
      standardBuilt.expectedPageCount === 15 &&
      standardBuilt.pagePlan.length === 15,
    'Expected standard W3 input to use the standard page plan',
  );
  assert(
    standardBuilt.dedicationText === 'Manifest standard dedication',
    'Expected dedicationText to fall back to the companion 1-manifest',
  );
  assert(
    standardBuilt.pagePlanSource === 'w0-v3' &&
      standardBuilt.pagePlan[7]?.poseNumber === 3,
    'Expected standard W0-frozen page plan to assign story page 7 to a real pose',
  );

  const legacyStandardOrderId = 'TEST-W3-LEGACY-D2C-001';
  const legacyStandardOrderPrefix = buildOrderPrefix(legacyStandardOrderId, bookId);
  const legacyOneManifestKey = buildManifestKeyFromOrderPrefix(
    legacyStandardOrderPrefix,
    '1',
  );
  const legacyTwoBManifestKey = buildManifestKeyFromOrderPrefix(
    legacyStandardOrderPrefix,
    '2b',
  );
  const legacyOneManifest = {
    schema: 'lhb.run-manifest@v2.1',
    amazonOrderId: legacyStandardOrderId,
    marketplaceId: 'ATVPDKIKX0DER',
    order: {
      orderId: legacyStandardOrderId,
      rootOrderId: legacyStandardOrderId,
      amazonOrderId: legacyStandardOrderId,
      characterSpecs: {
        childName: 'Luca',
        animalGuide: 'cat',
      },
      bookSpecs: {
        title: 'Luca and the Quiet Trail',
        formatId: 'standard',
      },
      orderDetails: {
        quantity: 1,
      },
    },
  };
  const legacyTwoBManifest = create2BManifest({
    orderId: legacyStandardOrderId,
    rootOrderId: legacyStandardOrderId,
    amazonOrderId: legacyStandardOrderId,
    characterHash: 'legacycharhash001',
    characterSpecs: {
      childName: 'Luca',
      animalGuide: 'cat',
    },
    bookSpecs: {
      title: 'Luca and the Quiet Trail',
      formatId: 'standard',
    },
  });

  const legacyStandardBuilt = await buildW3AssemblyInput(
    {
      orderId: legacyStandardOrderId,
      amazonOrderId: legacyStandardOrderId,
      orderPrefix: legacyStandardOrderPrefix,
      backendUrl,
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === legacyOneManifestKey) {
          return legacyOneManifest;
        }
        if (manifestKey === legacyTwoBManifestKey) {
          return legacyTwoBManifest;
        }
        return null;
      },
      normalizePoseScale,
    },
  );

  assert(
    legacyStandardBuilt.isAmazonOrder === false &&
      legacyStandardBuilt.amazonOrderId === null &&
      legacyStandardBuilt.formatId === 'standard' &&
      legacyStandardBuilt.pagePlanSource === 'runtime-config' &&
      legacyStandardBuilt.expectedPageCount === 15,
    'Expected legacy D2C manifests with stale Amazon markers to resolve the standard runtime page plan',
  );
  assert(
    legacyStandardBuilt.pagePlan[7]?.poseNumber === 3 &&
      legacyStandardBuilt.pagePlan[14]?.poseNumber === 12,
    'Expected runtime-config page plan to fix the formerly missing standard pages',
  );

  const syntheticOrderId = 'TEST-W3-SAFE-PROOF-001';
  const syntheticBuilt = await buildW3AssemblyInput(
    {
      orderId: syntheticOrderId,
      rootOrderId: syntheticOrderId,
      amazonOrderId: syntheticOrderId,
      oneManifestUrl: `${backendUrl}/api/manifests/${siblingOneManifestKey}`,
      manifest2bUrl: `${backendUrl}/api/manifests/${siblingTwoBManifestKey}`,
      backendUrl,
      testMode: true,
      testModePages: 2,
    },
    {
      loadManifest: siblingLoadManifest,
      normalizePoseScale,
    },
  );

  assert(
    syntheticBuilt.orderPrefix ===
      'book-mvp-simple-adventure/orders/TEST-W3-SAFE-PROOF-001',
    'Expected manifest lookup URLs to not override the synthetic output order root',
  );
  assert(
    syntheticBuilt.manifest3Key ===
      'book-mvp-simple-adventure/orders/TEST-W3-SAFE-PROOF-001/manifests/3-manifest.json',
    'Expected manifest3Key to stay under the synthetic output order root',
  );

  const wrappedResponse = await buildW3AssemblyInputResponse(
    {
      body: {
        orderId: siblingOrderId,
        rootOrderId: amazonOrderId,
        amazonOrderId,
        orderPrefix: siblingOrderPrefix,
        backendUrl,
      },
    },
    {
      loadManifest: siblingLoadManifest,
      normalizePoseScale,
      lookupOrderRow: async () => null,
      instrumentAssemblyJob: async () => ({
        workflowJobId: 301,
        workflowJobIdempotencyKey: 'wf:3:w3-book-assembly:test-order:assembly:test',
        workflowJobStatus: 'running',
        workflowAttemptId: 901,
        workflowAttempt: 1,
        workflowClaimed: true,
        workflowSkipped: false,
        workflowSkipReason: null,
      }),
    },
  );

  assert(
    wrappedResponse.success === true &&
      wrappedResponse.manifest3Url.endsWith(wrappedResponse.manifest3Key) &&
      wrappedResponse.workflowJobId === 301 &&
      wrappedResponse.workflowClaimed === true,
    'Expected route helper wrapper to return a normalized success payload',
  );

  let skippedInstrumented = false;
  const skippedResponse = await buildW3AssemblyInputResponse(
    {
      body: {
        orderId: siblingOrderId,
        rootOrderId: amazonOrderId,
        amazonOrderId,
        orderPrefix: siblingOrderPrefix,
        backendUrl,
      },
    },
    {
      loadManifest: siblingLoadManifest,
      normalizePoseScale,
      lookupOrderRow: async () => ({
        id: 874,
        orderId: siblingOrderId,
        workflow_step: 'book_assembly_completed',
        execution_status: 'done',
        status: 'pending_assembly_review',
        manifest_3_url: `${backendUrl}/api/manifests/${buildManifestKeyFromOrderPrefix(siblingOrderPrefix, '3')}`,
      }),
      instrumentAssemblyJob: async () => {
        skippedInstrumented = true;
        throw new Error('Completed W3 orders should short-circuit before workflow job instrumentation');
      },
    },
  );

  assert(
    skippedResponse.success === true &&
      skippedResponse.workflowSkipped === true &&
      skippedResponse.workflowSkipReason === 'w3-order-already-complete' &&
      skippedResponse.workflowJobId === null &&
      skippedResponse.workflowClaimed === false,
    'Expected completed W3 orders to short-circuit with workflowSkipped instead of creating a new job',
  );
  assert(
    skippedInstrumented === false,
    'Expected completed W3 short-circuit to bypass job instrumentation entirely',
  );

  let forcedInstrumented = false;
  const forcedReplayResponse = await buildW3AssemblyInputResponse(
    {
      body: {
        orderId: siblingOrderId,
        rootOrderId: amazonOrderId,
        amazonOrderId,
        orderPrefix: siblingOrderPrefix,
        backendUrl,
        force: true,
      },
    },
    {
      loadManifest: siblingLoadManifest,
      normalizePoseScale,
      lookupOrderRow: async () => ({
        id: 874,
        orderId: siblingOrderId,
        workflow_step: 'book_assembly_completed',
        execution_status: 'done',
        status: 'pending_assembly_review',
        manifest_3_url: `${backendUrl}/api/manifests/${buildManifestKeyFromOrderPrefix(siblingOrderPrefix, '3')}`,
      }),
      instrumentAssemblyJob: async () => {
        forcedInstrumented = true;
        return {
          workflowJobId: 302,
          workflowJobIdempotencyKey: 'wf:3:w3-book-assembly:test-order:assembly:force',
          workflowJobStatus: 'running',
          workflowAttemptId: 902,
          workflowAttempt: 1,
          workflowClaimed: true,
          workflowSkipped: false,
          workflowSkipReason: null,
        };
      },
    },
  );

  assert(
    forcedReplayResponse.workflowSkipped === false &&
      forcedReplayResponse.workflowJobId === 302 &&
      forcedInstrumented === true,
    'Expected explicit force=true to bypass the completed-order short-circuit and continue with W3 instrumentation',
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        cases: [
          'resolved 1/2b manifests from orderPrefix hints',
          'preserved per-book orderId with separate amazon/root ids',
          'used W0-frozen page plan and required poses when available',
          'preferred bgRemovedKey and fell back to approved/sourceApprovedKey',
          'derived canonical 3-manifest key under the per-book order root',
          'kept synthetic output roots when manifest URLs pointed at source-order inputs',
          'handled nested body payloads and standard-format orders',
          'route helper wrapper returned normalized success payload',
          'completed W3 orders short-circuit unless force=true is set',
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
