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

async function buildAssemblyInput(options: {
  orderId: string;
  rootOrderId: string;
  amazonOrderId: string | null;
  formatId: 'standard' | 'amazon';
  characterHash: string;
  childName: string;
  animalGuide: string;
  title: string;
  dedicationText?: string | null;
  testMode?: boolean;
  testModePages?: number;
}) {
  const backendUrl = 'https://admin.littleherolabs.com';
  const orderPrefix = buildOrderPrefix(options.orderId);
  const oneManifest = buildW0RunManifest({
    orderId: options.orderId,
    rootOrderId: options.rootOrderId,
    amazonOrderId: options.amazonOrderId,
    platform: options.formatId === 'amazon' ? 'amazon' : 'd2c',
    bookId: 'book-mvp-simple-adventure',
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
    typeof standardPreview.pages_html === 'string' &&
      standardPreview.pages_html.includes('page-14') &&
      standardPreview.page_css.includes('@page { size: 2625px 2625px; margin: 0; }'),
    'Expected standard preview plan to preserve the repo-owned page HTML and PDFMonkey CSS contract',
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
      amazonPreview.coverPreviewItem.coverHTML.includes('front-amazon-personalization'),
    'Expected amazon preview plan to emit the repo-owned amazon cover personalization HTML',
  );

  console.log('W3 preview plan tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
