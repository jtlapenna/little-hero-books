#!/usr/bin/env tsx

import previewFixture from '@/lib/books/fixtures/w3-replay/book1-standard-manifest-url-hint.json';
import {
  buildW0RunManifest,
} from '@/lib/books';
import {
  buildManifestKeyFromOrderPrefix,
  buildOrderPrefix,
} from '@/lib/order-paths';
import { buildW3AssemblyInput } from '@/lib/books/w3-assembly-input';
import { buildW3PreviewPlanResponse } from '@/app/api/internal/w3/build-preview-plan/route';
import { buildW3ManifestResponse } from '@/app/api/internal/w3/build-manifest/route';

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

  const manifestResult = buildW3ManifestResponse({
    ...previewPlan,
    pagePreviewImages,
    coverPngR2Key: previewPlan.coverPreviewItem.coverPngR2Key,
    pageType: 'cover-spread',
    r2Key: previewPlan.coverPreviewItem.coverPngR2Key,
    cloudflareImageId: 'cf-cover',
    cloudflareImageUrl: 'https://imagedelivery.net/demo/cf-cover/public',
  });

  assert(manifestResult.success === true, 'Expected W3 manifest builder to return success');
  assert(
    manifestResult.manifest3Key === expected.manifest3Key &&
      manifestResult.manifest3Url === expected.manifest3Url,
    'Expected W3 manifest builder to preserve the canonical per-book 3-manifest key and URL',
  );
  assert(
    manifestResult.coverPngR2Key ===
      'book-mvp-simple-adventure/orders/TEST-W3-REPLAY-SYNTH-001/preview-images/cover-spread.png',
    'Expected W3 manifest builder to preserve the per-book cover preview image key',
  );
  assert(
    manifestResult.coverCloudflareImageId === 'cf-cover' &&
      manifestResult.coverCloudflareImageUrl ===
        'https://imagedelivery.net/demo/cf-cover/public',
    'Expected W3 manifest builder to preserve cover Cloudflare preview metadata',
  );

  const manifest = manifestResult.manifest as JsonRecord;
  const pages = (manifest.pages ?? {}) as Record<string, string>;

  for (let index = 0; index < expected.pageLabels.length; index += 1) {
    const pageLabel = expected.pageLabels[index];
    const previewKey = expected.previewImageKeys[index];
    assert(
      pages[pageLabel] === previewKey,
      `Expected manifest.pages.${pageLabel} to preserve the repo-owned preview-image key`,
    );
  }

  assert(
    pages.p00_dedication === expected.previewImageKeys[0],
    'Expected W3 manifest builder to preserve the dedication alias for p00',
  );

  const pngGeneration = (manifest.pngGeneration ?? {}) as JsonRecord;
  const pagesWithCloudflare = (pngGeneration.pagesWithCloudflare ?? {}) as Record<
    string,
    { cloudflareImageId?: string | null; cloudflareImageUrl?: string | null }
  >;

  assert(
    pagesWithCloudflare.p00?.cloudflareImageId === 'cf-page-0' &&
      pagesWithCloudflare.p14?.cloudflareImageId === 'cf-page-14',
    'Expected W3 manifest builder to keep Cloudflare preview metadata alongside the page key map',
  );
  assert(
    manifestResult.pageImageUrls.length === expected.previewImageKeys.length,
    'Expected W3 manifest builder to surface all preview image URLs for downstream review tooling',
  );

  console.log('W3 manifest tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
