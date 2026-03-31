#!/usr/bin/env tsx

import { buildW2ABaseInput, loadBundledBookConfig } from '@/lib/books';
import { buildW2ABaseInputResponse } from '@/app/api/internal/w2a/build-base-input/route';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const loadConfig = async ({
    bookId,
    version,
  }: {
    bookId: string;
    version?: number;
  }) => loadBundledBookConfig({ bookId, version });

  const bookTwoBuilt = await buildW2ABaseInput(
    {
      orderId: 'FIXTURE-BOOK2-BASE-001',
      rootOrderId: 'ROOT-BOOK2-BASE-001',
      characterHash: 'fixturebook2basehash',
      oneManifestUrl:
        'https://admin.littleherolabs.com/api/manifests/book-2-example/orders/FIXTURE-BOOK2-BASE-001/manifests/1-manifest.json',
      publicR2Url: 'https://pub.example.r2.dev',
      testMode: true,
      characterSpecs: {
        childName: 'Nova',
        hairStyle: 'curly crop',
        hairColor: 'light brown',
        skinTone: 'deep',
        pronouns: 'she/her',
        favoriteColor: 'blue',
      },
    },
    { loadConfig },
  );

  assert(
    bookTwoBuilt.bookId === 'book-2-example',
    'Expected bookId to resolve from the 1-manifest hint',
  );
  assert(
    bookTwoBuilt.orderPrefix === 'book-2-example/orders/FIXTURE-BOOK2-BASE-001',
    'Expected orderPrefix to resolve under the Book 2 order root',
  );
  assert(
    bookTwoBuilt.baseCharacterKey ===
      'book-2-example/order-generated-assets/characters/fixturebook2basehash/base-character.png',
    'Expected baseCharacterKey to use the Book 2 generated-assets root',
  );
  assert(
    bookTwoBuilt.baseRefS3Key ===
      'book-2-example/characters/bases/base--skin-dark-aa--dress.png',
    'Expected base reference key to use the Book 2 dress asset path',
  );
  assert(
    bookTwoBuilt.hairRefS3Key ===
      'book-2-example/characters/hairstyles/curly-crop-light-brown.jpg',
    'Expected hairRefS3Key to resolve under the Book 2 hairstyle prefix',
  );
  assert(
    bookTwoBuilt.generatedFileName === 'characters_fixturebook2basehash_base.png' &&
      bookTwoBuilt.uploadKey ===
        'book-2-example/order-generated-assets/characters/fixturebook2basehash/base-character.png',
    'Expected deterministic base-character upload pathing',
  );
  assert(
    bookTwoBuilt.systemInstructionText.includes('dress MUST be #4575A5') &&
      bookTwoBuilt.userPromptText.includes('IMAGE A = base character style guide') &&
      bookTwoBuilt.userPromptText.includes('HAIRSTYLE LOCK'),
    'Expected repo-owned SW0 prompt construction to emit the base-generation contract',
  );
  assert(
    bookTwoBuilt.testMode === true &&
      bookTwoBuilt.rootOrderId === 'ROOT-BOOK2-BASE-001' &&
      bookTwoBuilt.amazonOrderId === 'ROOT-BOOK2-BASE-001',
    'Expected testMode and sibling-safe identity fields to be preserved',
  );
  assert(
    bookTwoBuilt.correlationId ===
      'FIXTURE-BOOK2-BASE-001-fixturebook2base-BASE',
    'Expected deterministic base correlation id',
  );

  const minimalBuilt = await buildW2ABaseInput(
    {
      orderId: 'FIXTURE-W2A-BASE-DEFAULT-001',
      bookId: 'book-mvp-simple-adventure',
      characterHash: 'defaultbasehash001',
      characterSpecs: {
        childName: 'Ada',
        hairStyle: 'side part',
        hairColor: 'black',
        pronouns: 'he/him',
      },
    },
    { loadConfig },
  );

  assert(
    minimalBuilt.bookId === 'book-mvp-simple-adventure' &&
      minimalBuilt.orderPrefix ===
        'book-mvp-simple-adventure/orders/FIXTURE-W2A-BASE-DEFAULT-001',
    'Expected minimal payloads to stay stable when an explicit Book 1 context is supplied',
  );
  assert(
    minimalBuilt.baseRefS3Key ===
      'book-mvp-simple-adventure/characters/bases/base--skin-medium.jpg',
    'Expected minimal payloads to derive the default Book 1 base reference key',
  );

  const routeResponse = await buildW2ABaseInputResponse(
    {
      orderId: 'FIXTURE-W2A-BASE-ROUTE-001',
      characterHash: 'routebasehash001',
      bookId: 'book-2-example',
      characterSpecs: {
        childName: 'Iris',
        hairStyle: 'bun',
        hairColor: 'auburn',
        pronouns: 'she/her',
      },
    },
    {
      defaultBackendUrl: 'https://preview-admin.example',
    },
  );

  assert(
    routeResponse.success === true &&
      routeResponse.bookId === 'book-2-example' &&
      routeResponse.uploadKey.includes(
        'book-2-example/order-generated-assets',
      ) &&
      routeResponse.backendUrl === 'https://preview-admin.example',
    'Expected route response builder to wrap the canonical W2A base input payload',
  );

  console.log('test-w2a-base-input: ok');
}

main().catch((error) => {
  console.error('test-w2a-base-input: failed');
  console.error(error);
  process.exit(1);
});
