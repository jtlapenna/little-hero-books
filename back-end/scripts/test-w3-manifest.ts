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
  bookId?: string;
  publicR2Url?: string | null;
  characterSpecs?: JsonRecord;
  bookSpecs?: JsonRecord;
  orderDetails?: JsonRecord;
}): JsonRecord {
  const bookId = options.bookId ?? 'book-mvp-simple-adventure';
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
        bgRemovedKey: `${bookId}/order-generated-assets/characters/${options.characterHash}/characters_${options.characterHash}_pose01_nobg.png`,
        sourceApprovedKey: `${bookId}/order-generated-assets/characters/${options.characterHash}/poses/pose01.png`,
        briaStatus: 'completed',
      },
      {
        poseNumber: 2,
        sourceApprovedKey: `${bookId}/order-generated-assets/characters/${options.characterHash}/poses/pose02.png`,
        approvedKey: `${bookId}/order-generated-assets/characters/${options.characterHash}/poses/pose02.png`,
        bgRemovedKey: null,
        briaStatus: 'pending',
      },
    ],
  };
}

async function main(): Promise<void> {
  const backendUrl = 'https://admin.littleherolabs.com';
  const expected = previewFixture.expected;
  const orderPrefix = buildOrderPrefix(expected.orderId, expected.bookId);
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
    bookId: expected.bookId,
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

  const bookTwoOrderId = 'TEST-W3-MANIFEST-BOOK2-001';
  const bookTwoOrderPrefix = buildOrderPrefix(bookTwoOrderId, 'book-2-example');
  const bookTwoOneManifest = buildW0RunManifest({
    orderId: bookTwoOrderId,
    rootOrderId: bookTwoOrderId,
    amazonOrderId: null,
    platform: 'd2c',
    bookId: 'book-2-example',
    formatId: 'standard',
    characterHash: 'manifesthashbook2001',
    input: {
      characterSpecs: {
        childName: 'Nova',
        animalGuide: 'fox',
      },
      bookSpecs: {
        title: 'Nova and the Starlit Map',
      },
      orderDetails: {
        quantity: 1,
      },
      dedicationText: 'For Nova',
    },
  });
  const bookTwoOneManifestKey = buildManifestKeyFromOrderPrefix(bookTwoOrderPrefix, '1');
  const bookTwoTwoBManifestKey = buildManifestKeyFromOrderPrefix(bookTwoOrderPrefix, '2b');
  const bookTwoTwoBManifest = create2BManifest({
    orderId: bookTwoOrderId,
    characterHash: 'manifesthashbook2001',
    bookId: 'book-2-example',
    characterSpecs: {
      childName: 'Nova',
      animalGuide: 'fox',
    },
    bookSpecs: {
      title: 'Nova and the Starlit Map',
    },
  });
  const bookTwoAssemblyInput = await buildW3AssemblyInput(
    {
      orderId: bookTwoOrderId,
      rootOrderId: bookTwoOrderId,
      amazonOrderId: null,
      orderPrefix: bookTwoOrderPrefix,
      backendUrl,
      dedicationText: 'For Nova',
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === bookTwoOneManifestKey) {
          return bookTwoOneManifest;
        }
        if (manifestKey === bookTwoTwoBManifestKey) {
          return bookTwoTwoBManifest;
        }
        return null;
      },
    },
  );
  const bookTwoPreviewPlan = buildW3PreviewPlanResponse(bookTwoAssemblyInput);
  const bookTwoPagePreviewImages = bookTwoPreviewPlan.pagePreviewItems.map((item) => ({
    orderId: item.orderId,
    amazonOrderId: item.amazonOrderId,
    rootOrderId: item.rootOrderId,
    pageNumber: item.pageNumber,
    r2Key: item.pageImageR2Key,
    filename: item.pageImageFilename,
    imageUrl: `${backendUrl}/api/assets/${item.pageImageR2Key}`,
  }));
  const bookTwoManifestResult = buildW3ManifestResponse({
    ...bookTwoPreviewPlan,
    pagePreviewImages: bookTwoPagePreviewImages,
    coverPngR2Key: bookTwoPreviewPlan.coverPreviewItem.coverPngR2Key,
    pageType: 'cover-spread',
    r2Key: bookTwoPreviewPlan.coverPreviewItem.coverPngR2Key,
  });
  assert(bookTwoManifestResult.success === true, 'Expected Book 2 W3 manifest build to succeed');
  assert(
    bookTwoManifestResult.manifest3Key ===
      'book-2-example/orders/TEST-W3-MANIFEST-BOOK2-001/manifests/3-manifest.json',
    'Expected Book 2 W3 manifest key to stay under the Book 2 order root',
  );
  assert(
    bookTwoManifestResult.coverPngR2Key ===
      'book-2-example/orders/TEST-W3-MANIFEST-BOOK2-001/preview-images/cover-spread.png',
    'Expected Book 2 W3 preview assets to stay under the Book 2 order root',
  );

  console.log('W3 manifest tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
