#!/usr/bin/env tsx

import { buildW2BPoseInput } from '@/lib/books';
import { buildW2BPoseInputResponse } from '@/app/api/internal/w2b/build-pose-input/route';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const replacedAt = '2026-03-24T18:05:00.000Z';
  const expectedCacheBust = String(Date.parse(replacedAt));

  const bookTwoBuilt = buildW2BPoseInput({
    orderId: 'FIXTURE-BOOK2-BG-001',
    rootOrderId: 'ROOT-BOOK2-BG-001',
    characterHash: 'fixturebook2bghash',
    poseNumber: 7,
    approvedKey:
      'book-2-example/order-generated-assets/characters/fixturebook2bghash/poses/pose07_r1.png',
    manifest2aUrl:
      'https://admin.littleherolabs.com/api/manifests/book-2-example/orders/FIXTURE-BOOK2-BG-001/manifests/2a-manifest.json',
    backendUrl: 'https://admin.littleherolabs.com',
    replacedAt,
    replacementCount: 1,
    testMode: true,
  });

  assert(bookTwoBuilt.bookId === 'book-2-example', 'Expected bookId to resolve from the approvedKey/manifest hint');
  assert(
    bookTwoBuilt.orderPrefix === 'book-2-example/orders/FIXTURE-BOOK2-BG-001',
    'Expected orderPrefix to resolve under the Book 2 order root',
  );
  assert(
    bookTwoBuilt.sourceCacheBust === expectedCacheBust &&
      bookTwoBuilt.sourceUrl ===
        `https://admin.littleherolabs.com/api/assets/book-2-example/order-generated-assets/characters/fixturebook2bghash/poses/pose07_r1.png?v=${expectedCacheBust}`,
    'Expected replacement-aware sourceUrl generation through the backend asset proxy',
  );
  assert(
    bookTwoBuilt.briaPayload.image === bookTwoBuilt.sourceUrl &&
      bookTwoBuilt.briaPayload.meta &&
      (bookTwoBuilt.briaPayload.meta as Record<string, unknown>).pose === 7,
    'Expected Bria payload construction to use the repo-owned sourceUrl and pose metadata',
  );
  assert(
    bookTwoBuilt.bgRemovedKey ===
      'book-2-example/order-generated-assets/characters/fixturebook2bghash/characters_fixturebook2bghash_pose07_nobg.png',
    'Expected canonical bgRemovedKey under the Book 2 character root',
  );
  assert(
    bookTwoBuilt.qaBackgroundKey === 'book-2-example/backgrounds/transparency-qa/neon-background.png',
    'Expected QA background selection to default under the resolved book root',
  );
  assert(
    bookTwoBuilt.testMode === true &&
      bookTwoBuilt.rootOrderId === 'ROOT-BOOK2-BG-001' &&
      bookTwoBuilt.amazonOrderId === 'ROOT-BOOK2-BG-001',
    'Expected testMode and sibling-safe identity fields to be preserved',
  );

  const defaultBuilt = buildW2BPoseInput({
    orderId: 'FIXTURE-W2B-DEFAULT-001',
    characterHash: 'defaultbghash001',
    poseNumber: 2,
    approvedKey:
      'book-mvp-simple-adventure/order-generated-assets/characters/defaultbghash001/poses/pose02.png',
  });

  assert(
    defaultBuilt.bookId === 'book-mvp-simple-adventure' &&
      defaultBuilt.orderPrefix === 'book-mvp-simple-adventure/orders/FIXTURE-W2B-DEFAULT-001',
    'Expected minimal W2B payloads to fall back to the default Book 1 order root',
  );

  const routeResponse = await buildW2BPoseInputResponse({
    orderId: 'FIXTURE-W2B-ROUTE-001',
    characterHash: 'routebghash001',
    poseNumber: 4,
    bookId: 'book-2-example',
    approvedKey:
      'book-2-example/order-generated-assets/characters/routebghash001/poses/pose04.png',
  }, {
    instrumentPoseJob: async () => ({
      workflowJobId: 404,
      workflowJobIdempotencyKey: 'wf:2b:w2b-single-pose:FIXTURE-W2B-ROUTE-001:pose-04:stub',
      workflowJobStatus: 'running',
      workflowAttemptId: 1,
      workflowAttempt: 1,
      workflowClaimed: true,
    }),
  });

  assert(
    routeResponse.success === true &&
      routeResponse.bookId === 'book-2-example' &&
      routeResponse.bgRemovedKey.includes('book-2-example/order-generated-assets') &&
      routeResponse.workflowJobId === 404 &&
      routeResponse.workflowAttemptId === 1,
    'Expected route response builder to wrap the canonical W2B pose input payload',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        bookTwoOrderPrefix: bookTwoBuilt.orderPrefix,
        defaultOrderPrefix: defaultBuilt.orderPrefix,
        bookTwoBgRemovedKey: bookTwoBuilt.bgRemovedKey,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[test-w2b-pose-input] Failed:', error);
  process.exit(1);
});
