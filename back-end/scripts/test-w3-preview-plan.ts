#!/usr/bin/env tsx

import { buildW0RunManifest } from '@/lib/books';
import {
  buildManifestKeyFromOrderPrefix,
  buildOrderPrefix,
} from '@/lib/order-paths';
import { buildW3AssemblyInput } from '@/lib/books/w3-assembly-input';
import { buildW3PreviewPlanResponse } from '@/app/api/internal/w3/build-preview-plan/route';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function toPlacementPx(value: number): string {
  return `${Math.round(value * (2625 / 2550))}px`;
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
        flipped: true,
        flippedAt: '2026-03-23T12:00:00.000Z',
      },
      {
        poseNumber: 4,
        bgRemovedKey: `${bookId}/order-generated-assets/characters/${options.characterHash}/characters_${options.characterHash}_pose04_nobg.png`,
        sourceApprovedKey: `${bookId}/order-generated-assets/characters/${options.characterHash}/poses/pose04.png`,
        briaStatus: 'completed',
      },
    ],
  };
}

async function buildAssemblyInput(options: {
  orderId: string;
  rootOrderId: string;
  amazonOrderId: string | null;
  formatId: 'standard' | 'amazon';
  bookId?: string;
  characterHash: string;
  childName: string;
  animalGuide: string;
  title: string;
  dedicationText?: string | null;
  testMode?: boolean;
  testModePages?: number;
}) {
  const backendUrl = 'https://admin.littleherolabs.com';
  const bookId = options.bookId ?? 'book-mvp-simple-adventure';
  const orderPrefix = buildOrderPrefix(options.orderId, bookId);
  const oneManifest = buildW0RunManifest({
    orderId: options.orderId,
    rootOrderId: options.rootOrderId,
    amazonOrderId: options.amazonOrderId,
    platform: options.formatId === 'amazon' ? 'amazon' : 'd2c',
    bookId,
    formatId: options.formatId,
    characterHash: options.characterHash,
    input: {
      characterSpecs: {
        childName: options.childName,
        animalGuide: options.animalGuide,
      },
      bookSpecs: {
        title: options.title,
      },
      orderDetails: {
        quantity: 1,
      },
      dedicationText: options.dedicationText ?? null,
    },
  });
  const oneManifestKey = buildManifestKeyFromOrderPrefix(orderPrefix, '1');
  const twoBManifestKey = buildManifestKeyFromOrderPrefix(orderPrefix, '2b');
  const twoBManifest = create2BManifest({
    orderId: options.orderId,
    rootOrderId: options.rootOrderId,
    amazonOrderId: options.amazonOrderId,
    characterHash: options.characterHash,
    bookId,
    characterSpecs: {
      childName: options.childName,
      animalGuide: options.animalGuide,
    },
    bookSpecs: {
      title: options.title,
    },
  });

  return buildW3AssemblyInput(
    {
      orderId: options.orderId,
      rootOrderId: options.rootOrderId,
      amazonOrderId: options.amazonOrderId,
      orderPrefix,
      backendUrl,
      dedicationText: options.dedicationText ?? null,
      testMode: options.testMode ?? false,
      testModePages: options.testModePages ?? 0,
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
}

async function main(): Promise<void> {
  const standardAssemblyInput = await buildAssemblyInput({
    orderId: 'TEST-W3-PREVIEW-STANDARD-001',
    rootOrderId: 'TEST-W3-PREVIEW-STANDARD-001',
    amazonOrderId: null,
    formatId: 'standard',
    characterHash: 'previewhashstd01',
    childName: 'Ada',
    animalGuide: 'owl',
    title: 'Ada and the Quiet Trail',
    dedicationText: 'For Ada',
  });

  const standardPreview = buildW3PreviewPlanResponse(standardAssemblyInput);
  assert(standardPreview.success === true, 'Expected standard preview plan to return success');
  assert(
    standardPreview.pagePreviewItems.length === 15,
    'Expected standard preview plan to emit all 15 page preview items',
  );
  assert(
    standardPreview.pagePreviewItems[0]?.pageLabel === 'p00' &&
      standardPreview.pagePreviewItems[14]?.pageLabel === 'p14',
    'Expected standard preview plan page items to preserve the standard page labels',
  );
  assert(
    standardPreview.coverPreviewItem.pdfMonkeyCoverTemplateId ===
      'D0F07D93-9267-47BB-A6AF-D6EC5ACDF476',
    'Expected standard preview plan to use the standard cover preview template',
  );
  assert(
    standardPreview.coverPreviewItem.coverPngR2Key ===
      'book-mvp-simple-adventure/orders/TEST-W3-PREVIEW-STANDARD-001/preview-images/cover-spread.png',
    'Expected standard preview plan to emit the sibling-safe cover preview key',
  );
  assert(
    typeof standardPreview.coverPreviewItem.coverHTML === 'string' &&
      standardPreview.coverPreviewItem.coverHTML.includes('left:4421px') &&
      standardPreview.coverPreviewItem.coverHTML.includes('top:2157px') &&
      standardPreview.coverPreviewItem.coverHTML.includes('width:1200px') &&
      standardPreview.coverPreviewItem.coverHTML.includes('translate(-86.5%,-80.5%)') &&
      standardPreview.coverPreviewItem.coverHTML.includes('position:absolute; height:auto; display:block;') &&
      !standardPreview.coverPreviewItem.coverHTML.includes('__preloads'),
    'Expected the standard cover preview to emit only the self-positioned inline cover sprite HTML so PDFMonkey does not duplicate cover assets via hidden preload tags',
  );
  const coverOverridePreview = buildW3PreviewPlanResponse({
    ...standardAssemblyInput,
    coverCharacterPlacement: {
      left: 4420.887663661859,
      top: 2157.2141614055995,
      width: 1200,
    },
  });
  assert(
    typeof coverOverridePreview.coverPreviewItem.coverHTML === 'string' &&
      coverOverridePreview.coverPreviewItem.coverHTML.includes('left:4421px') &&
      coverOverridePreview.coverPreviewItem.coverHTML.includes('top:2157px') &&
      coverOverridePreview.coverPreviewItem.coverHTML.includes('translate(-86.5%,-80.5%)'),
    'Expected cover placement overrides without explicit anchor fields to inherit the configured cover anchor instead of falling back to the generic 50/100 anchor',
  );
  assert(
    typeof standardPreview.pages_html === 'string' &&
      standardPreview.pages_html.includes('page-14') &&
      standardPreview.page_css.includes('@page { size: 2625px 2625px; margin: 0; }'),
    'Expected standard preview plan to preserve the repo-owned page HTML and PDFMonkey CSS contract',
  );
  const standardStoryPageFour = standardPreview.pagePreviewItems.find(
    (item) => item.pageNumber === 4,
  );
  assert(
    typeof standardStoryPageFour?.pageHtml === 'string' &&
      standardStoryPageFour.pageHtml.includes(`left:${toPlacementPx(1530)}`) &&
      standardStoryPageFour.pageHtml.includes(`top:${toPlacementPx(1734)}`) &&
      standardStoryPageFour.pageHtml.includes(`width:${toPlacementPx(1100)}`) &&
      standardStoryPageFour.pageHtml.includes('rotate(-20deg)'),
    'Expected the preview plan renderer to use the configured story-page placement instead of hardcoded W3 constants',
  );
  const standardStoryPageThirteen = standardPreview.pagePreviewItems.find(
    (item) => item.pageNumber === 13,
  );
  assert(
    typeof standardStoryPageThirteen?.pageHtml === 'string' &&
      standardStoryPageThirteen.pageHtml.includes(`left:${toPlacementPx(1237.063)}`) &&
      standardStoryPageThirteen.pageHtml.includes(`top:${toPlacementPx(2072.725)}`) &&
      standardStoryPageThirteen.pageHtml.includes(`width:${toPlacementPx(1100)}`),
    'Expected story page 13 to use the configured animal placement',
  );

  const staleAnimalOverridePreview = buildW3PreviewPlanResponse({
    ...standardAssemblyInput,
    animalPlacement: {
      13: { left: 999, top: 999, width: 999, zIndex: 9 },
    },
  });
  const staleOverridePageThirteen = staleAnimalOverridePreview.pagePreviewItems.find(
    (item) => item.pageNumber === 13,
  );
  assert(
    typeof staleOverridePageThirteen?.pageHtml === 'string' &&
      staleOverridePageThirteen.pageHtml.includes(`left:${toPlacementPx(1237.063)}`) &&
      !staleOverridePageThirteen.pageHtml.includes(`left:${toPlacementPx(999)}`),
    'Expected preview-plan builds to ignore stale animal placement payload fields and use the current book config',
  );

  const amazonAssemblyInput = await buildAssemblyInput({
    orderId: 'TEST-W3-PREVIEW-AMAZON-001',
    rootOrderId: '111-2222222-3333333',
    amazonOrderId: '111-2222222-3333333',
    formatId: 'amazon',
    characterHash: 'previewhashamz01',
    childName: 'Bea',
    animalGuide: 'cat',
    title: 'Bea and the Quiet Trail',
    dedicationText: 'For Bea',
    testMode: true,
    testModePages: 3,
  });

  const amazonPreview = buildW3PreviewPlanResponse(amazonAssemblyInput);
  assert(amazonPreview.success === true, 'Expected amazon preview plan to return success');
  assert(
    amazonPreview.pagePreviewItems.length === 3 &&
      amazonPreview.pagePreviewItems[0]?.pageLabel === 'p00' &&
      amazonPreview.pagePreviewItems[2]?.pageLabel === 'p02',
    'Expected amazon preview plan to apply the repo-owned testModePages filter before page rendering starts',
  );
  assert(
    amazonPreview.coverPreviewItem.pdfMonkeyCoverTemplateId ===
      '8DB1D274-AA3C-4E14-B051-65B6F872B013',
    'Expected amazon preview plan to use the barcode-safe amazon cover preview template',
  );
  assert(
    typeof amazonPreview.coverPreviewItem.coverHTML === 'string' &&
      amazonPreview.coverPreviewItem.coverHTML.includes('A Story Made for') &&
      amazonPreview.coverPreviewItem.coverHTML.includes('front-amazon-personalization') &&
      !amazonPreview.coverPreviewItem.coverHTML.includes('__preloads'),
    'Expected amazon preview plan to emit the repo-owned amazon cover personalization HTML without hidden preload tags that can duplicate cover assets',
  );
  const fullAmazonPreview = buildW3PreviewPlanResponse({
    ...amazonAssemblyInput,
    testMode: false,
    testModePages: 0,
  });
  assert(fullAmazonPreview.success === true, 'Expected full amazon preview plan to return success');
  assert(
    fullAmazonPreview.pagePreviewItems.length === 17 &&
      fullAmazonPreview.pagePreviewItems[3]?.pageLabel === 'p03' &&
      fullAmazonPreview.pagePreviewItems[16]?.pageLabel === 'p16',
    'Expected full amazon preview plan to preserve all 17 physical pages',
  );
  const amazonStoryPageOne = fullAmazonPreview.pagePreviewItems.find(
    (item) => item.pageNumber === 3,
  );
  const amazonStoryPageTwo = fullAmazonPreview.pagePreviewItems.find(
    (item) => item.pageNumber === 4,
  );
  const amazonStoryPageThree = fullAmazonPreview.pagePreviewItems.find(
    (item) => item.pageNumber === 5,
  );
  const amazonStoryPageFourteen = fullAmazonPreview.pagePreviewItems.find(
    (item) => item.pageNumber === 16,
  );
  assert(
    typeof amazonStoryPageOne?.pageHtml === 'string' &&
      amazonStoryPageOne.pageHtml.includes('It was bedtime') &&
      !amazonStoryPageOne.pageHtml.includes('glowing door'),
    'Expected amazon physical p03 to render story page 1 text, not story page 3 text',
  );
  assert(
    typeof amazonStoryPageTwo?.pageHtml === 'string' &&
      amazonStoryPageTwo.pageHtml.includes('Outside, the night sparkled'),
    'Expected amazon physical p04 to render story page 2 text',
  );
  assert(
    typeof amazonStoryPageThree?.pageHtml === 'string' &&
      amazonStoryPageThree.pageHtml.includes('glowing door'),
    'Expected amazon physical p05 to render story page 3 text',
  );
  assert(
    typeof amazonStoryPageFourteen?.pageHtml === 'string' &&
      amazonStoryPageFourteen.pageHtml.includes('Ready to fly home?'),
    'Expected amazon physical p16 to render story page 14 text',
  );

  const bookTwoAssemblyInput = await buildAssemblyInput({
    orderId: 'TEST-W3-PREVIEW-BOOK2-001',
    rootOrderId: 'TEST-W3-PREVIEW-BOOK2-001',
    amazonOrderId: null,
    formatId: 'standard',
    bookId: 'book-2-example',
    characterHash: 'previewhashbook2001',
    childName: 'Nova',
    animalGuide: 'fox',
    title: 'Nova and the Starlit Map',
    dedicationText: 'For Nova',
  });
  const bookTwoPreview = buildW3PreviewPlanResponse(bookTwoAssemblyInput);
  assert(bookTwoPreview.success === true, 'Expected Book 2 preview plan to return success');
  assert(
    bookTwoPreview.coverPreviewItem.coverPngR2Key ===
      'book-2-example/orders/TEST-W3-PREVIEW-BOOK2-001/preview-images/cover-spread.png',
    'Expected Book 2 preview plan to preserve the Book 2 order root',
  );
  assert(
    bookTwoPreview.pagePreviewItems.every((item) => item.pageImageR2Key.startsWith('book-2-example/orders/TEST-W3-PREVIEW-BOOK2-001/')),
    'Expected all Book 2 preview images to stay under the Book 2 order root',
  );

  console.log('W3 preview plan tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
