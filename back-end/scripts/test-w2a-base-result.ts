#!/usr/bin/env tsx

import { finalizeW2ABaseResult } from '@/lib/books';
import { finalizeW2ABaseResultResponse } from '@/app/api/internal/w2a/finalize-base-result/route';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const finalized = finalizeW2ABaseResult({
    orderId: 'FIXTURE-BOOK2-BASE-RESULT-001',
    rootOrderId: 'ROOT-BOOK2-BASE-RESULT-001',
    amazonOrderId: 'ROOT-BOOK2-BASE-RESULT-001',
    bookId: 'book-2-example',
    formatId: 'standard',
    orderPrefix: 'book-2-example/orders/FIXTURE-BOOK2-BASE-RESULT-001',
    oneManifestUrl:
      'https://admin.littleherolabs.com/api/manifests/book-2-example/orders/FIXTURE-BOOK2-BASE-RESULT-001/manifests/1-manifest.json',
    publicR2Url: 'https://pub.example.r2.dev',
    characterHash: 'fixturebasehashresult',
    assetsRoot: 'book-2-example/order-generated-assets',
    baseCharacterKey:
      'book-2-example/order-generated-assets/characters/fixturebasehashresult/base-character.png',
    generatedFileName: 'characters_fixturebasehashresult_base.png',
    hairRefS3Key:
      'book-2-example/characters/hairstyles/curly-crop-light-brown.jpg',
    hairPromptMeta: {
      styleKey: 'curly-crop',
      clothingTypeCanonical: 'dress',
      colorKey: 'light-brown',
    },
    hairPromptBlock: 'HAIRSTYLE DESCRIPTION:\n- Keep the hairstyle silhouette locked.',
    skinToneCanonical: 'skin-deep',
    clothingTypeCanonical: 'dress',
    hairStyleCanonical: 'curly-crop',
    generatedImage: {
      mimeType: 'image/png',
      size: 2048,
      isMock: true,
      modelVersion: 'gemini-mock',
    },
    characterSpecs: {
      childName: 'Nova',
    },
    __testMode: true,
    __meta: {
      generatedAttemptKey: 'characters_fixturebasehashresult_base.png',
    },
  });

  assert(
    finalized.success === true &&
      finalized.bookId === 'book-2-example' &&
      finalized.base.uploadKey === finalized.baseCharacterKey &&
      finalized.storageKey === finalized.baseCharacterKey,
    'Expected finalizer to preserve deterministic upload/storage keys',
  );
  assert(
    finalized.hairPromptMeta.styleKey === 'curly-crop' &&
      finalized.hairRefPublicUrl ===
        'https://pub.example.r2.dev/book-2-example/characters/hairstyles/curly-crop-light-brown.jpg',
    'Expected finalizer to preserve hair metadata and derive the public hair URL',
  );
  assert(
    finalized.generatedImage.mimeType === 'image/png' &&
      finalized.generatedImage.size === 2048 &&
      finalized.__testMode === true &&
      finalized.testMode === true,
    'Expected finalizer to preserve generated-image metadata and test flags',
  );

  const routeResponse = finalizeW2ABaseResultResponse({
    orderId: 'FIXTURE-W2A-BASE-RESULT-ROUTE-001',
    characterHash: 'routebasehashresult001',
    generatedFileName: 'characters_routebasehashresult001_base.png',
    generatedImage: {
      mimeType: 'image/png',
      size: 512,
    },
    baseCharacterKey:
      'book-mvp-simple-adventure/order-generated-assets/characters/routebasehashresult001/base-character.png',
  });

  assert(
    routeResponse.success === true &&
      routeResponse.orderId === 'FIXTURE-W2A-BASE-RESULT-ROUTE-001' &&
      routeResponse.base.uploadKey.includes('base-character.png'),
    'Expected route response wrapper to return the canonical SW0 result envelope',
  );

  let missingMetadataFailed = false;
  try {
    finalizeW2ABaseResult({
      orderId: 'FIXTURE-W2A-BASE-RESULT-FAIL-001',
      generatedImage: {
        mimeType: 'image/png',
        size: 128,
      },
    });
  } catch (error) {
    missingMetadataFailed =
      error instanceof Error &&
      error.message.includes('characterHash');
  }

  assert(
    missingMetadataFailed,
    'Expected finalizer to fail cleanly when required extracted-image metadata is missing',
  );

  console.log('test-w2a-base-result: ok');
}

main().catch((error) => {
  console.error('test-w2a-base-result: failed');
  console.error(error);
  process.exit(1);
});
