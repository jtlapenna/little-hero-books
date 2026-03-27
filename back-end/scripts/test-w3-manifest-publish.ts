#!/usr/bin/env tsx

import previewFixture from '@/lib/books/fixtures/w3-replay/book1-standard-manifest-url-hint.json';
import { buildW0RunManifest } from '@/lib/books';
import { buildW3AssemblyInput } from '@/lib/books/w3-assembly-input';
import { buildW3PreviewPlanResponse } from '@/app/api/internal/w3/build-preview-plan/route';
import { publishW3ManifestResponse } from '@/app/api/internal/w3/publish-manifest/route';
import { buildManifestKeyFromOrderPrefix, buildOrderPrefix } from '@/lib/order-paths';

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
      },
    ],
  };
}

async function main(): Promise<void> {
  const backendUrl = 'https://admin.littleherolabs.com';
  const expected = previewFixture.expected;
  const orderPrefix = buildOrderPrefix(expected.orderId);
  const oneManifest = buildW0RunManifest({
    orderId: expected.orderId,
    rootOrderId: expected.rootOrderId,
    amazonOrderId: expected.amazonOrderId,
    platform: 'd2c',
    bookId: expected.bookId,
    formatId: 'standard',
    characterHash: 'manifesthashstd01',
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
      dedicationText: 'For Ada',
    },
  });
  const oneManifestKey = buildManifestKeyFromOrderPrefix(orderPrefix, '1');
  const twoBManifestKey = buildManifestKeyFromOrderPrefix(orderPrefix, '2b');
  const twoBManifest = create2BManifest({
    orderId: expected.orderId,
    rootOrderId: expected.rootOrderId,
    amazonOrderId: expected.amazonOrderId,
    characterHash: 'manifesthashstd01',
  });

  const assemblyInput = await buildW3AssemblyInput(
    {
      orderId: expected.orderId,
      rootOrderId: expected.rootOrderId,
      amazonOrderId: expected.amazonOrderId,
      orderPrefix,
      backendUrl,
      dedicationText: 'For Ada',
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === oneManifestKey) {
          return oneManifest;
        }
        if (manifestKey === twoBManifestKey) {
          return twoBManifest;
        }
        return null;
      },
    },
  );

  const previewPlan = buildW3PreviewPlanResponse(assemblyInput);
  const pagePreviewImages = previewPlan.pagePreviewItems.map((item) => ({
    orderId: item.orderId,
    amazonOrderId: item.amazonOrderId,
    rootOrderId: item.rootOrderId,
    pageNumber: item.pageNumber,
    r2Key: item.pageImageR2Key,
    filename: item.pageImageFilename,
    imageUrl: `${backendUrl}/api/assets/${item.pageImageR2Key}`,
    cloudflareImageId: `cf-page-${item.pageNumber}`,
    cloudflareImageUrl: `https://imagedelivery.net/demo/cf-page-${item.pageNumber}/public`,
  }));

  let uploadCall: {
    bucket: string;
    key: string;
    body: string;
    contentType: string | undefined;
  } | null = null;
  let updateCall: {
    orderId: string;
    updates: Record<string, unknown>;
  } | null = null;

  const response = await publishW3ManifestResponse(
    {
      ...previewPlan,
      pagePreviewImages,
      coverPngR2Key: previewPlan.coverPreviewItem.coverPngR2Key,
      pageType: 'cover-spread',
      r2Key: previewPlan.coverPreviewItem.coverPngR2Key,
      cloudflareImageId: 'cf-cover',
      cloudflareImageUrl: 'https://imagedelivery.net/demo/cf-cover/public',
    },
    {
      now: new Date('2026-03-27T04:05:00.000Z'),
      getOrderImpl: async () => ({
        review_stages: {
          preBria: { status: 'approved' },
          postBria: { status: 'approved' },
        },
      }),
      updateOrderImpl: async (orderId, updates) => {
        updateCall = { orderId, updates };
        return { id: 874 };
      },
      putObjectImpl: async (bucket, key, body, contentType) => {
        uploadCall = {
          bucket,
          key,
          body: String(body),
          contentType,
        };
        return { ok: true };
      },
    },
  );

  assert(response.success === true, 'Expected W3 manifest publish response to return success');
  assert(
    uploadCall?.bucket === 'little-hero-orders' &&
      uploadCall.key === expected.manifest3Key &&
      uploadCall.contentType === 'application/json',
    'Expected W3 manifest publish to upload the canonical 3-manifest JSON to the orders bucket',
  );

  const uploadedManifest = JSON.parse(uploadCall?.body ?? '{}') as JsonRecord;
  assert(
    uploadedManifest.schema === 'lhb.run-manifest@v2.0' &&
      uploadedManifest.orderId === expected.orderId,
    'Expected uploaded W3 manifest JSON to preserve the canonical schema and orderId',
  );

  assert(
    updateCall?.orderId === expected.orderId &&
      updateCall.updates.manifest_3_url === expected.manifest3Url &&
      updateCall.updates.status === 'pending_assembly_review' &&
      updateCall.updates.next_workflow === '4' &&
      updateCall.updates.workflow_step === 'book_assembly_completed',
    'Expected W3 manifest publish to persist the canonical manifest URL and post-review routing fields',
  );

  const mergedReviewStages = (updateCall?.updates.review_stages ?? {}) as JsonRecord;
  assert(
    (mergedReviewStages.preBria as JsonRecord)?.status === 'approved' &&
      (mergedReviewStages.postBria as JsonRecord)?.status === 'approved' &&
      (mergedReviewStages.postPdf as JsonRecord)?.status === 'in-review',
    'Expected W3 manifest publish to preserve existing review stages while setting postPdf to in-review',
  );

  assert(
    response.manifestKey === expected.manifest3Key &&
      response.manifestUrl === expected.manifest3Url &&
      response.manifestReady === true &&
      response.mergedReviewStages.postPdf &&
      response.orderUpdateApplied === true,
    'Expected W3 manifest publish response to expose the canonical manifest metadata needed by downstream W3 nodes',
  );

  console.log('W3 manifest publish tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
