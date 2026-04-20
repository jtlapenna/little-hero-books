import {
  buildW2ABootstrapManifest,
  buildBgRemovedAssetMap,
  buildReviewPoseAssignments,
  buildW2APoseWorklist,
  buildW2ARunManifest,
  buildW0RunManifest,
  loadBundledBookConfig,
  normalizeW0Manifest,
  read2BManifestWithPoseRequirements,
  resolveReviewPageContext,
  resolveReviewPageContextFromConfig,
  resolvePagePlan,
  RunManifestV3,
  sync2BManifestEntries,
  validateRunManifest,
} from '@/lib/books';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildOrderIntakeManifestFromOrder,
  buildOrderIntakeManifestFromNormalizedInputRuntime,
  buildW0OrderUpsertPayload,
} from '@/lib/w0-manifest-builder';
import legacyAmazonFixture from '@/lib/books/fixtures/w0-manifests/book1-amazon-legacy-v2_1.json';
import v3AmazonFixture from '@/lib/books/fixtures/w0-manifests/book1-amazon-v3.json';
import { R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildOrderPrefix, getBucketFromKey, isOrderAssetKey } from '@/lib/r2-utils';
import {
  buildAssetApiUrl,
  buildBaseCharacterAssetKey,
  buildBgRemovedPoseAssetKey,
  buildGeneratedPoseAssetKey,
  buildManifestApiUrl,
  buildManifestKeyCandidates,
  buildManifestKeyFromOrderPrefix,
  buildPendingPoseRevisionKey,
  buildPoseReferenceAssetKey,
  buildPreviewImageAssetKey,
  extractBookIdFromPathLike,
  extractBookIdFromOrderPathLike,
  extractOrderPrefixFromPathLike,
  normalizeOrderPrefix,
  resolveOrderPathContext,
} from '@/lib/order-paths';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildComparableNormalizedSnapshot(
  manifest: unknown,
  fallbackManifestKey: string,
) {
  const normalized = normalizeW0Manifest(manifest, { fallbackManifestKey });

  return {
    orderId: normalized.orderId,
    rootOrderId: normalized.rootOrderId,
    amazonOrderId: normalized.amazonOrderId,
    bookId: normalized.bookId,
    dedication: normalized.dedication,
    characterSpecs: normalized.characterSpecs,
    bookSpecs: normalized.bookSpecs,
    orderDetails: normalized.orderDetails,
    shippingAddress: normalized.shippingAddress,
  };
}

function getWorkflowNodeCode(workflowPath: string, nodeName: string): string {
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8')) as {
    nodes?: Array<{ name?: string; parameters?: { jsCode?: string } }>;
  };

  const node = workflow.nodes?.find((candidate) => candidate.name === nodeName);
  assert(node?.parameters?.jsCode, `Expected workflow node "${nodeName}" to have jsCode`);
  return node?.parameters?.jsCode ?? '';
}

function normalizeWorkflowCodeSnapshot(code: string): string {
  return code.replace(
    /\/\/ ---- deterministic outputs(?: \(per-book orderId for sibling support\))? ----/g,
    '// ---- deterministic outputs ----',
  );
}

async function main(): Promise<void> {
const config = loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure' });
const bookTwoConfig = loadBundledBookConfig({ bookId: 'book-2-example' });
assert(config.version === 1, 'Expected bundled Book 1 config version 1');
assert(bookTwoConfig.version === 1, 'Expected bundled Book 2 config version 1');

const standardPlan = resolvePagePlan(config, 'standard');
const amazonPlan = resolvePagePlan(config, 'amazon');
const bookTwoStandardPlan = resolvePagePlan(bookTwoConfig, 'standard');
const bookTwoAmazonPlan = resolvePagePlan(bookTwoConfig, 'amazon');

assert(standardPlan.expectedPageCount === 15, 'Standard plan should have 15 pages');
assert(amazonPlan.expectedPageCount === 17, 'Amazon plan should have 17 pages');
assert(standardPlan.pagePlan[0]?.label === 'p00', 'Standard plan should begin at p00');
assert(amazonPlan.pagePlan[16]?.label === 'p16', 'Amazon plan should end at p16');
assert(bookTwoStandardPlan.expectedPageCount === 15, 'Book 2 standard plan should have 15 pages');
assert(bookTwoAmazonPlan.expectedPageCount === 17, 'Book 2 amazon plan should have 17 pages');
assert(
  bookTwoStandardPlan.pagePlan[4]?.overlaySlot === 'starTrail' &&
    bookTwoStandardPlan.pagePlan[12]?.overlaySlot === 'glowMap',
  'Book 2 page plan should preserve its distinct overlay mapping',
);
assert(
  bookTwoStandardPlan.qaPolicy.pose.requiredPoseNumbers.length === 10,
  'Book 2 page plan should preserve its distinct required pose count',
);
const bookTwoReviewContext = resolveReviewPageContextFromConfig(bookTwoConfig, 'standard');
assert(
  bookTwoReviewContext.bookId === 'book-2-example' &&
    bookTwoReviewContext.pagePlanSource === 'runtime-config' &&
    bookTwoReviewContext.pageLabels[0] === 'p00',
  'Book 2 review page context should resolve directly from runtime config without falling back to the legacy Book 1 plan',
);

const standardManifest = validateRunManifest(
  buildW0RunManifest({
    orderId: 'TEST-BOOK-KERNEL-001',
    platform: 'd2c',
    bookId: config.bookId,
    formatId: 'standard',
    characterHash: 'testhash123456',
    input: {
      characterSpecs: { childName: 'Ada' },
      bookSpecs: { bookType: 'adventure' },
      orderDetails: { quantity: 1 },
      dedicationText: 'For Ada',
    },
  }),
);

const amazonManifest = validateRunManifest(
  buildW0RunManifest({
    orderId: 'TEST-BOOK-KERNEL-002',
    rootOrderId: 'TEST-BOOK-KERNEL-002',
    amazonOrderId: '111-2222222-3333333',
    platform: 'amazon',
    bookId: config.bookId,
    formatId: 'amazon',
    input: {
      characterSpecs: { childName: 'Bea' },
      bookSpecs: { channel: 'amazon' },
      orderDetails: { quantity: 1 },
    },
  }),
);
const bookTwoStandardManifest = validateRunManifest(
  buildW0RunManifest({
    orderId: 'TEST-BOOK2-KERNEL-001',
    platform: 'd2c',
    bookId: bookTwoConfig.bookId,
    formatId: 'standard',
    characterHash: 'booktwohash1234',
    input: {
      characterSpecs: { childName: 'Nova' },
      bookSpecs: { bookType: 'starlight-rescue' },
      orderDetails: { quantity: 1 },
      dedicationText: 'For Nova',
    },
  }),
);

assert(
  standardManifest.artifacts.manifestKey ===
    'book-mvp-simple-adventure/orders/TEST-BOOK-KERNEL-001/manifests/1-manifest.json',
  'Unexpected standard manifest key',
);
assert(
  bookTwoStandardManifest.artifacts.manifestKey ===
    'book-2-example/orders/TEST-BOOK2-KERNEL-001/manifests/1-manifest.json',
  'Book 2 manifest should use the canonical Book 2 order root',
);
assert(
  amazonManifest.book.resolved.expectedPageCount === 17,
  'Amazon manifest should carry a 17-page resolved plan',
);
assert(
  bookTwoStandardManifest.book.bookConfigRef.bookId === 'book-2-example' &&
    bookTwoStandardManifest.book.resolved.qaPolicy.pose.requiredPoseNumbers.length === 10,
  'Book 2 manifest should pin the Book 2 config and preserve Book 2 QA policy',
);

const recoveryOrder = {
  id: 42,
  orderId: 'TEST-BOOK-KERNEL-003',
  book_id: 'book-mvp-simple-adventure',
  root_order_id: '111-2222222-3333333',
  amazon_order_id: '111-2222222-3333333',
  marketplace_id: 'ATVPDKIKX0DER',
  platform: 'amazon',
  purchase_date: '2026-03-14T12:00:00.000Z',
  created_at: '2026-03-14T12:00:00.000Z',
  customer_email: 'parent@example.com',
  customer_name: 'Parent Example',
  dedication_text: 'Keep exploring',
  character_hash: 'testhash7890abcd',
  shipping_tier: 'expedited',
  amazon_shipment_service_level: 'EXPEDITED',
  customer_approval_required: false,
  character_specs: {
    childName: 'Cora',
    favoriteAnimal: 'fox',
  },
  product_info: {
    quantity: 2,
    shippingAddress: {
      name: 'Parent Example',
      city: 'San Francisco',
      state_code: 'CA',
      postcode: '94107',
      country_code: 'US',
    },
    bookSpecs: {
      title: 'Cora and the Adventure Compass',
      format: '8.5x8.5_softcover',
      bookType: 'adventure',
    },
  },
};

const recoveryV2 = buildOrderIntakeManifestFromOrder(
  recoveryOrder,
  'TEST-BOOK-KERNEL-003',
);
assert(recoveryV2.schemaVersion === 'v2.1', 'Recovery manifest should default to v2.1');
assert(
  recoveryV2.manifestKey ===
    'book-mvp-simple-adventure/orders/TEST-BOOK-KERNEL-003/manifests/1-manifest.json',
  'Unexpected recovery v2 manifest key',
);
assert(
  (recoveryV2.manifest as Record<string, unknown>).schema === 'lhb.run-manifest@v2.1',
  'Recovery manifest should emit the legacy schema by default',
);
const normalizedRecoveryV2 = normalizeW0Manifest(recoveryV2.manifest, {
  fallbackManifestKey: recoveryV2.manifestKey,
});
assert(
  normalizedRecoveryV2.orderId === 'TEST-BOOK-KERNEL-003',
  'Normalized legacy manifest should recover orderId from the canonical key',
);
assert(
  normalizedRecoveryV2.bookId === 'book-mvp-simple-adventure',
  'Normalized legacy manifest should recover bookId from the canonical key',
);
assert(
  normalizedRecoveryV2.orderDetails.quantity === 2,
  'Normalized legacy manifest should preserve quantity',
);
assert(
  normalizedRecoveryV2.shippingAddress.city === 'San Francisco',
  'Normalized legacy manifest should preserve shipping address',
);
assert(
  normalizedRecoveryV2.dedication?.text === 'Keep exploring',
  'Normalized legacy manifest should preserve dedication text',
);

const recoveryV3 = buildOrderIntakeManifestFromOrder(
  recoveryOrder,
  'TEST-BOOK-KERNEL-003',
  { schemaVersion: 'v3' },
);
const recoveryV3Manifest = recoveryV3.manifest as RunManifestV3;
assert(recoveryV3.schemaVersion === 'v3', 'Recovery manifest should opt into v3');
assert(
  recoveryV3Manifest.schema === 'lhb.run-manifest@v3',
  'Recovery manifest should emit the v3 schema when requested',
);
assert(
  recoveryV3.manifestKey ===
    'book-mvp-simple-adventure/orders/TEST-BOOK-KERNEL-003/manifests/1-manifest.json',
  'Unexpected recovery v3 manifest key',
);
assert(
  recoveryV3Manifest.book.bookConfigRef.formatId === 'amazon',
  'Recovery v3 manifest should infer amazon format from the order',
);
assert(
  recoveryV3Manifest.book.resolved.expectedPageCount === 17,
  'Recovery v3 manifest should carry the amazon page plan',
);
const normalizedRecoveryV3 = normalizeW0Manifest(recoveryV3Manifest, {
  fallbackManifestKey: recoveryV3.manifestKey,
});
assert(
  normalizedRecoveryV3.orderId === 'TEST-BOOK-KERNEL-003',
  'Normalized v3 manifest should preserve orderId',
);
assert(
  normalizedRecoveryV3.bookId === 'book-mvp-simple-adventure',
  'Normalized v3 manifest should preserve bookId',
);
assert(
  normalizedRecoveryV3.formatId === 'amazon',
  'Normalized v3 manifest should preserve formatId',
);
assert(
  normalizedRecoveryV3.orderDetails.quantity === 2,
  'Normalized v3 manifest should preserve quantity',
);
assert(
  normalizedRecoveryV3.shippingAddress.city === 'San Francisco',
  'Normalized v3 manifest should preserve shipping address',
);
assert(
  normalizedRecoveryV3.dedication?.text === 'Keep exploring',
  'Normalized v3 manifest should preserve dedication text',
);
assert(
  normalizedRecoveryV3.pageLabels.length === 17,
  'Normalized v3 manifest should expose resolved page labels',
);
assert(
  normalizedRecoveryV3.requiredPoseNumbers.length === 12,
  'Normalized v3 manifest should expose required pose numbers',
);

const normalizedWorkflowInput = {
  _raw: {
    marketplaceId: 'ATVPDKIKX0DER',
    amazonOrderId: '999-1111111-2222222',
  },
  orderId: 'TEST-W0-NORMALIZED-001',
  orderDate: '2026-03-15T18:00:00.000Z',
  customerEmail: 'normalized@example.com',
  buyer: {
    email: 'normalized@example.com',
    name: 'Normalized Parent',
  },
  characterSpecs: {
    childName: 'Drew',
    favoriteAnimal: 'owl',
    favoriteColor: 'green',
    hairColor: 'brown',
    hairStyle: 'short',
    skinTone: 'medium',
    clothingStyle: 'tee-shorts',
  },
  bookSpecs: {
    bookId: 'book-mvp-simple-adventure',
    title: 'Drew and the Quiet Trail',
    formatId: 'amazon',
    channel: 'amazon',
    bookType: 'adventure',
  },
  orderDetails: {
    quantity: 1,
    shippingAddress: {
      name: 'Normalized Parent',
      city: 'San Diego',
      state_code: 'CA',
      postcode: '92101',
      country_code: 'US',
      phone: '555-0100',
    },
  },
  dedication: {
    text: 'Trust your inner guide',
  },
};

const normalizedBuilt = await buildOrderIntakeManifestFromNormalizedInputRuntime(
  normalizedWorkflowInput,
  {
    schemaVersion: 'v3',
    configSource: 'bundled',
  },
);
const normalizedBuiltManifest = normalizedBuilt.manifest as RunManifestV3;
const normalizedUpsert = buildW0OrderUpsertPayload({
  normalizedInput: normalizedWorkflowInput,
  manifest: normalizedBuiltManifest,
  manifestKey: normalizedBuilt.manifestKey,
});

assert(
  normalizedBuilt.schemaVersion === 'v3',
  'Normalized W0 builder should emit a v3 manifest',
);
assert(
  normalizedBuiltManifest.book.bookConfigRef.version === 1,
  'Normalized W0 builder should pin Book 1 v1 in the manifest',
);
assert(
  normalizedBuiltManifest.book.bookConfigRef.formatId === 'amazon',
  'Normalized W0 builder should preserve the normalized formatId',
);
assert(
  normalizedBuiltManifest.order.amazonOrderId === '999-1111111-2222222',
  'Normalized W0 builder should preserve amazonOrderId from normalized input',
);
assert(
  normalizedBuilt.manifestKey ===
    'book-mvp-simple-adventure/orders/TEST-W0-NORMALIZED-001/manifests/1-manifest.json',
  'Normalized W0 builder should preserve the canonical manifest key',
);
assert(
  normalizedUpsert.one_manifest_url === normalizedBuilt.manifestKey,
  'Normalized W0 upsert payload should reuse the manifest key as one_manifest_url',
);
assert(
  normalizedUpsert.root_order_id === '999-1111111-2222222',
  'Normalized W0 upsert payload should preserve root_order_id for grouped-order routing',
);
assert(
  normalizedUpsert.amazon_order_id === '999-1111111-2222222',
  'Normalized W0 upsert payload should preserve amazon_order_id',
);
assert(
  normalizedUpsert.character_hash === '4da80527ff68b0f6',
  'Normalized W0 upsert payload should preserve the current visual character-hash algorithm',
);

const fixtureManifestKey =
  'book-mvp-simple-adventure/orders/FIXTURE-W0-AMAZON-001/manifests/1-manifest.json';
const normalizedLegacyFixture = normalizeW0Manifest(legacyAmazonFixture, {
  fallbackManifestKey: fixtureManifestKey,
});
const normalizedV3Fixture = normalizeW0Manifest(v3AmazonFixture, {
  fallbackManifestKey: fixtureManifestKey,
});
const legacyFixtureSnapshot = buildComparableNormalizedSnapshot(
  legacyAmazonFixture,
  fixtureManifestKey,
);
const v3FixtureSnapshot = buildComparableNormalizedSnapshot(
  v3AmazonFixture,
  fixtureManifestKey,
);

assert(
  JSON.stringify(legacyFixtureSnapshot) === JSON.stringify(v3FixtureSnapshot),
  'Legacy and v3 fixture manifests should normalize to the same shared order snapshot',
);
assert(
  normalizedLegacyFixture.orderId === 'FIXTURE-W0-AMAZON-001',
  'Legacy fixture should recover orderId from the canonical key',
);
assert(
  normalizedLegacyFixture.bookId === 'book-mvp-simple-adventure',
  'Legacy fixture should recover bookId from the canonical key',
);
assert(
  normalizedV3Fixture.pageLabels.length === 17,
  'V3 fixture should preserve the resolved page plan',
);
assert(
  normalizedV3Fixture.pagePlan[16]?.label === 'p16',
  'V3 fixture should preserve the final resolved page label',
);
assert(
  normalizedLegacyFixture.buyer.email === 'parent@example.com',
  'Legacy fixture should preserve buyer data when present',
);
assert(
  normalizedLegacyFixture.purchaseDate === '2026-03-14T12:00:00.000Z',
  'Legacy fixture should preserve purchaseDate when present',
);
assert(
  normalizedV3Fixture.buyer.email === null && normalizedV3Fixture.purchaseDate === null,
  'V3 fixture should leave buyer and purchaseDate null until downstream readers source them elsewhere',
);
assert(
  normalizedV3Fixture.requiredPoseNumbers.length === 12,
  'V3 fixture should preserve required pose numbers from the QA policy',
);

const reviewContextFromV3 = resolveReviewPageContext({
  snapshot: normalizedV3Fixture,
  bookId: normalizedV3Fixture.bookId,
  formatId: normalizedV3Fixture.formatId,
  isAmazonOrder: true,
});
const reviewAssignmentsFromV3 = buildReviewPoseAssignments(reviewContextFromV3.pagePlan);
const w2aPoseWorklistFromV3 = buildW2APoseWorklist(reviewContextFromV3.pagePlan, {
  includeZeroPose: true,
});
const pose1ReviewAssignment = reviewAssignmentsFromV3.find(
  (assignment) => assignment.poseNumber === 1,
);
const pose12ReviewAssignment = reviewAssignmentsFromV3.find(
  (assignment) => assignment.poseNumber === 12,
);

assert(
  reviewContextFromV3.pagePlanSource === 'w0-v3' &&
    reviewContextFromV3.expectedPageCount === 17,
  'Review page context should reuse the v3-frozen amazon page plan when present',
);
assert(
  pose1ReviewAssignment?.pageLabel === 'p03' &&
    pose1ReviewAssignment.backgroundSlot === 'story_01',
  'Review pose assignments should map pose 1 to the first resolved amazon story page',
);
assert(
  pose12ReviewAssignment?.pageLabel === 'p16' &&
    pose12ReviewAssignment.storyPageNumber === 14,
  'Review pose assignments should preserve the final amazon story-page mapping',
);
assert(
  w2aPoseWorklistFromV3.length === 13 &&
    w2aPoseWorklistFromV3[0]?.poseNumber === 0 &&
    w2aPoseWorklistFromV3[1]?.pageLabel === 'p03' &&
    w2aPoseWorklistFromV3[12]?.pageLabel === 'p16',
  'W2A pose worklist should include pose 0 and preserve the frozen amazon page-plan mapping',
);

const w2aBootstrapManifest = buildW2ABootstrapManifest({
  orderId: 'FIXTURE-W0-AMAZON-001',
  rootOrderId: '111-2222222-3333333',
  amazonOrderId: '111-2222222-3333333',
  bookId: 'book-mvp-simple-adventure',
  characterHash: 'fixture-character-hash',
  oneManifestUrl: `/api/manifests/${fixtureManifestKey}`,
  characterSpecs: normalizedV3Fixture.characterSpecs,
  bookSpecs: normalizedV3Fixture.bookSpecs,
  orderDetails: normalizedV3Fixture.orderDetails,
});

assert(
  w2aBootstrapManifest.manifestKey ===
    'book-mvp-simple-adventure/orders/FIXTURE-W0-AMAZON-001/manifests/2a-manifest.json',
  'W2A bootstrap manifest should resolve the canonical per-item 2A manifest key',
);
assert(
  (w2aBootstrapManifest.manifest.order as Record<string, unknown>)?.orderId ===
    'FIXTURE-W0-AMAZON-001',
  'W2A bootstrap manifest should preserve the per-item orderId inside order context',
);

const w2aRunManifest = buildW2ARunManifest({
  orderId: 'FIXTURE-W0-AMAZON-001',
  rootOrderId: '111-2222222-3333333',
  amazonOrderId: '111-2222222-3333333',
  oneManifestUrl: `/api/manifests/${fixtureManifestKey}`,
  bookId: 'book-mvp-simple-adventure',
  publicR2Url: 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev',
  assetsRoot: 'book-mvp-simple-adventure/order-generated-assets',
  characterSpecs: normalizedV3Fixture.characterSpecs,
  bookSpecs: normalizedV3Fixture.bookSpecs,
  orderDetails: normalizedV3Fixture.orderDetails,
  poseResults: [
    {
      poseNumber: 0,
      characterHash: 'fixture-character-hash',
      approvedKey:
        'book-mvp-simple-adventure/order-generated-assets/characters/fixture-character-hash/poses/pose00.png',
      publicUrl:
        'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/fixture-character-hash/poses/pose00.png',
      qaPass: true,
      success: true,
      qaScore: 1,
      styleScore: 1,
      correlationId: 'corr-pose-00',
      orderContext: {
        orderId: 'FIXTURE-W0-AMAZON-001',
        rootOrderId: '111-2222222-3333333',
        amazonOrderId: '111-2222222-3333333',
        oneManifestUrl: `/api/manifests/${fixtureManifestKey}`,
        childName: 'Bea',
        characterSpecs: normalizedV3Fixture.characterSpecs,
        bookSpecs: normalizedV3Fixture.bookSpecs,
        orderDetails: normalizedV3Fixture.orderDetails,
      },
    },
    {
      poseNumber: 1,
      characterHash: 'fixture-character-hash',
      approvedKey:
        'book-mvp-simple-adventure/order-generated-assets/characters/fixture-character-hash/poses/pose01.png',
      publicUrl:
        'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/fixture-character-hash/poses/pose01.png',
      qaPass: true,
      success: true,
      qaScore: 0.97,
      styleScore: 0.96,
      correlationId: 'corr-pose-01',
    },
    {
      poseNumber: 2,
      characterHash: 'fixture-character-hash',
      generatedFileName: 'pose02_r1.png',
      retryAttempt: 1,
      qaPass: false,
      qaReasons: ['pose_mismatch'],
      needsReview: true,
      reviewReason: 'manual review required',
      qa: {
        pose: { notes: 'Pose mismatch' },
        style: { notes: 'Style mismatch', score: { style_cohesion: 0.41 } },
      },
      maxPoseRetries: 3,
    },
  ],
});

const w2aRunManifestBody = w2aRunManifest.manifest as Record<string, unknown>;
const w2aRunManifestSummary = w2aRunManifestBody.summary as Record<string, unknown>;
const w2aRunManifestWorkflow = w2aRunManifestBody.workflow as Record<string, unknown>;
const w2aRunManifestPoses = w2aRunManifestBody.poses as Record<string, unknown>;

assert(
  w2aRunManifest.manifestKey ===
    'book-mvp-simple-adventure/orders/FIXTURE-W0-AMAZON-001/manifests/2a-manifest.json',
  'W2A run manifest should resolve the canonical per-item 2A manifest key',
);
assert(
  w2aRunManifestPoses.total === 3 &&
    w2aRunManifestPoses.approved === 2 &&
    w2aRunManifestPoses.retried === 1 &&
    w2aRunManifestPoses.needingReview === 1,
  'W2A run manifest should summarize pose outcomes from the reduced pose-result envelope',
);
assert(
  w2aRunManifestSummary.readyForBook === false &&
    w2aRunManifestSummary.needsHumanReview === true &&
    w2aRunManifestWorkflow.nextWorkflow === '2B-retry',
  'W2A run manifest should hold the order for 2B retry when any pose still needs review',
);

const legacyReviewContext = resolveReviewPageContext({
  bookId: 'book-mvp-simple-adventure',
  formatId: 'standard',
  isAmazonOrder: false,
});
const legacyReviewAssignments = buildReviewPoseAssignments(legacyReviewContext.pagePlan);
const legacyPose7Assignment = legacyReviewAssignments.find(
  (assignment) => assignment.poseNumber === 7,
);

assert(
  legacyReviewContext.pagePlanSource === 'legacy-default' &&
    legacyReviewContext.expectedPageCount === 15,
  'Review page context should preserve the current standard Book 1 fallback when W0 data is unavailable',
);
assert(
  legacyPose7Assignment?.pageLabel === 'p08',
  'Legacy review pose assignments should preserve the current first-page mapping for pose 7',
);

const twoBManifest = {
  schema: 'lhb.run-manifest@v2.0',
  orderId: 'FIXTURE-W0-AMAZON-001',
  characterHash: 'fixture-character-hash',
  order: {
    orderId: 'FIXTURE-W0-AMAZON-001',
    oneManifestUrl: `/api/manifests/${fixtureManifestKey}`,
  },
  entries: [
    { poseNumber: 0, bgRemovedKey: null },
    { poseNumber: 1, bgRemovedKey: null },
    { poseNumber: 12, bgRemovedKey: null },
  ],
};

const twoBManifestSnapshot = await read2BManifestWithPoseRequirements({
  manifest: twoBManifest,
  orderId: 'FIXTURE-W0-AMAZON-001',
  loadManifest: async (manifestKey) =>
    manifestKey === fixtureManifestKey ? v3AmazonFixture : null,
});
assert(
  twoBManifestSnapshot.requiredPoseSource === 'w0-v3',
  '2B manifest reader should resolve required poses from a companion v3 W0 manifest',
);
assert(
  JSON.stringify(twoBManifestSnapshot.requiredPoseNumbers) ===
    JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  '2B manifest reader should expose the W0-required pose list',
);
assert(
  JSON.stringify(twoBManifestSnapshot.availablePoseNumbers) === JSON.stringify([0, 1, 12]),
  '2B manifest reader should expose the available pose numbers from entries',
);

const legacyTwoBManifestSnapshot = await read2BManifestWithPoseRequirements({
  manifest: {
    schema: 'lhb.run-manifest@v2.0',
    orderId: 'LEGACY-2B-001',
    characterHash: 'legacy-character-hash',
    entries: [{ poseNumber: 1, bgRemovedKey: null }],
  },
  orderId: 'LEGACY-2B-001',
});
assert(
  legacyTwoBManifestSnapshot.requiredPoseSource === 'legacy-default',
  '2B manifest reader should fall back to the legacy required pose list when W0 data is unavailable',
);
assert(
  JSON.stringify(legacyTwoBManifestSnapshot.requiredPoseNumbers) ===
    JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  'Legacy 2B manifest reader should preserve the current Book 1 required pose fallback',
);

const bgRemovedByPose = buildBgRemovedAssetMap([
  {
    assetType: 'background-removed',
    characterHash: 'fixture-character-hash',
    poseNumber: 0,
    url: '/api/assets/book-mvp-simple-adventure/order-generated-assets/characters/fixture-character-hash/characters_fixture-character-hash_pose00_nobg.png',
  },
  {
    assetType: 'background-removed',
    characterHash: 'fixture-character-hash',
    poseNumber: 1,
    url: '/api/assets/book-mvp-simple-adventure/order-generated-assets/characters/fixture-character-hash/characters_fixture-character-hash_pose01_nobg.png',
  },
  {
    assetType: 'background-removed',
    characterHash: 'fixture-character-hash',
    poseNumber: 12,
    url: '/api/assets/book-mvp-simple-adventure/order-generated-assets/characters/fixture-character-hash/characters_fixture-character-hash_pose12_nobg.png',
  },
]);
const syncResult = sync2BManifestEntries({
  entryByPoseNumber: twoBManifestSnapshot.entryByPoseNumber,
  poseNumbers: [0, 1, 12],
  bgRemovedByPose,
  nowIso: '2026-03-15T12:00:00.000Z',
  trackMissingEntries: true,
  ensureBgRemovedPublicUrlField: true,
});
assert(
  JSON.stringify(syncResult.updatedPoseNumbers) === JSON.stringify([0, 1, 12]),
  '2B sync helper should backfill bgRemovedKey for the requested pose set',
);
assert(
  syncResult.missingPoseNumbers.length === 0,
  '2B sync helper should not report missing poses when all requested assets exist',
);
assert(
  twoBManifestSnapshot.entryByPoseNumber.get(1)?.bgRemovedKey ===
    'book-mvp-simple-adventure/order-generated-assets/characters/fixture-character-hash/characters_fixture-character-hash_pose01_nobg.png',
  '2B sync helper should preserve the canonical R2 key from the asset inventory',
);
assert(
  twoBManifestSnapshot.entryByPoseNumber.get(0)?.bgRemovedPublicUrl === null,
  '2B sync helper should initialize bgRemovedPublicUrl when requested',
);

assert(
  buildOrderPrefix('ORDER-ROOT-001', 'book-two-demo') ===
    'book-two-demo/orders/ORDER-ROOT-001',
  'Order-prefix helper should build dynamic book order roots',
);
assert(
  normalizeOrderPrefix('book-two-demo/orders/ORDER-ROOT-001/', 'ORDER-ROOT-001', 'book-two-demo') ===
    'book-two-demo/orders/ORDER-ROOT-001',
  'Order-prefix helper should normalize trailing slashes',
);
assert(
  buildManifestKeyFromOrderPrefix('book-two-demo/orders/ORDER-ROOT-001', '2a') ===
    'book-two-demo/orders/ORDER-ROOT-001/manifests/2a-manifest.json',
  'Manifest-key helper should keep canonical filenames on dynamic order roots',
);
assert(
  buildManifestApiUrl('book-two-demo/orders/ORDER-ROOT-001', '3', 12345) ===
    '/api/manifests/book-two-demo/orders/ORDER-ROOT-001/manifests/3-manifest.json?v=12345',
  'Manifest API helper should build cache-busted manifest URLs from dynamic order roots',
);
assert(
  buildPoseReferenceAssetKey('book-two-demo', 7) ===
    'book-two-demo/characters/poses/pose07.png',
  'Pose-reference helper should build dynamic reference asset keys',
);
assert(
  buildBaseCharacterAssetKey('fixture-character-hash', 'book-two-demo') ===
    'book-two-demo/order-generated-assets/characters/fixture-character-hash/base-character.png',
  'Base-character helper should build dynamic generated-asset keys',
);
assert(
  buildGeneratedPoseAssetKey('fixture-character-hash', 7, 'book-two-demo') ===
    'book-two-demo/order-generated-assets/characters/fixture-character-hash/poses/pose07.png',
  'Generated-pose helper should build dynamic canonical pose keys',
);
assert(
  buildBgRemovedPoseAssetKey('fixture-character-hash', 7, 'book-two-demo') ===
    'book-two-demo/order-generated-assets/characters/fixture-character-hash/characters_fixture-character-hash_pose07_nobg.png',
  'Background-removed helper should build dynamic canonical nobg keys',
);
assert(
  buildPreviewImageAssetKey('book-two-demo/orders/ORDER-ROOT-001', 'p07') ===
    'book-two-demo/orders/ORDER-ROOT-001/preview-images/p07.png',
  'Preview-image helper should build dynamic order-root preview keys',
);
assert(
  buildPendingPoseRevisionKey('book-two-demo/orders/ORDER-ROOT-001', 7) ===
    'book-two-demo/orders/ORDER-ROOT-001/revisions/pending/pose07-option.png',
  'Pending-revision helper should build dynamic order-root revision keys',
);
assert(
  buildAssetApiUrl('book-two-demo/characters/poses/pose07.png', 99) ===
    '/api/assets/book-two-demo/characters/poses/pose07.png?v=99',
  'Asset API helper should build cache-busted asset URLs',
);
assert(
  extractOrderPrefixFromPathLike('/api/manifests/book-two-demo/orders/ORDER-ROOT-001/manifests/2a-manifest.json') ===
    'book-two-demo/orders/ORDER-ROOT-001',
  'Order-prefix extractor should recover order roots from manifest URLs',
);
const manifestUrlHint =
  'https://admin.littleherolabs.com/api/manifests/book-two-demo/orders/ORDER-ROOT-001/manifests/3-manifest.json';
const resolvedFromManifestUrl = resolveOrderPathContext('ORDER-ROOT-001', {
  orderPrefix: manifestUrlHint,
});
assert(
  resolvedFromManifestUrl.orderPrefix === 'book-two-demo/orders/ORDER-ROOT-001',
  'Order-path context should normalize manifest URLs passed as orderPrefix hints',
);
assert(
  resolvedFromManifestUrl.bookId === 'book-two-demo',
  'Order-path context should recover the bookId from manifest URL hints',
);
const manifest3CandidatesFromUrl = buildManifestKeyCandidates('ORDER-ROOT-001', '3', {
  orderPrefix: manifestUrlHint,
});
assert(
  manifest3CandidatesFromUrl[0] ===
    'book-two-demo/orders/ORDER-ROOT-001/manifests/3-manifest.json',
  'Manifest-key candidates should prefer the canonical order-root key when given a manifest URL hint',
);
assert(
  manifest3CandidatesFromUrl.every(
    (candidate) =>
      candidate !==
      'https://admin.littleherolabs.com/api/manifests/book-two-demo/orders/ORDER-ROOT-001/manifests/3-manifest.json/manifests/3-manifest.json',
  ),
  'Manifest-key candidates should not treat manifest URLs as literal order prefixes',
);
assert(
  extractBookIdFromOrderPathLike('book-two-demo/orders/ORDER-ROOT-001/preview-images/p00.png') ===
    'book-two-demo',
  'Book-id extractor should recover book IDs from order-scoped asset keys',
);
assert(
  extractBookIdFromPathLike('/api/assets/book-two-demo/order-generated-assets/characters/fixture-character-hash/base-character.png') ===
    'book-two-demo',
  'Generic book-id extractor should recover book IDs from asset URLs',
);
assert(
  isOrderAssetKey('book-two-demo/orders/ORDER-ROOT-001/preview-images/p00.png'),
  'Order-asset helper should recognize dynamic order roots',
);
assert(
  getBucketFromKey('book-two-demo/orders/ORDER-ROOT-001/preview-images/p00.png') ===
    R2_ORDERS_BUCKET,
  'Bucket helper should route dynamic order keys to the orders bucket',
);
assert(
  getBucketFromKey('book-two-demo/backgrounds/page01.png') === R2_PUBLIC_BUCKET,
  'Bucket helper should keep non-order keys on the public bucket',
);

const qaCheckRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/render/qa-check-pdf/route.ts',
);
const qaCheckRouteCode = readFileSync(qaCheckRoutePath, 'utf8');
const approvalRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/orders/[orderId]/generate-approval-pdf/route.ts',
);
const approvalRouteCode = readFileSync(approvalRoutePath, 'utf8');
const preBriaStagePath = path.resolve(
  process.cwd(),
  'src/components/stages/pre-bria-stage.tsx',
);
const preBriaStageCode = readFileSync(preBriaStagePath, 'utf8');
const autoFlipRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/orders/[orderId]/auto-flip-pose/route.ts',
);
const autoFlipRouteCode = readFileSync(autoFlipRoutePath, 'utf8');
const regeneratePoseRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/orders/[orderId]/regenerate-pose/route.ts',
);
const regeneratePoseRouteCode = readFileSync(regeneratePoseRoutePath, 'utf8');
const normalizePoseScaleRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/normalize-pose-scale/route.ts',
);
const normalizePoseScaleRouteCode = readFileSync(normalizePoseScaleRoutePath, 'utf8');
const replaceImageRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/orders/[orderId]/replace-image/route.ts',
);
const replaceImageRouteCode = readFileSync(replaceImageRoutePath, 'utf8');
const orderDetailPagePath = path.resolve(
  process.cwd(),
  'src/app/orders/[orderId]/page.tsx',
);
const orderDetailPageCode = readFileSync(orderDetailPagePath, 'utf8');
const assetsRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/assets/[...path]/route.ts',
);
const assetsRouteCode = readFileSync(assetsRoutePath, 'utf8');
const presignAssetsRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/render/presign-page-assets/route.ts',
);
const presignAssetsRouteCode = readFileSync(presignAssetsRoutePath, 'utf8');
const inlineAssetsRoutePath = path.resolve(
  process.cwd(),
  'src/app/api/render/inline-page-assets/route.ts',
);
const inlineAssetsRouteCode = readFileSync(inlineAssetsRoutePath, 'utf8');
const orderMapperPath = path.resolve(
  process.cwd(),
  'src/lib/order-mapper.ts',
);
const orderMapperCode = readFileSync(orderMapperPath, 'utf8');

assert(
  qaCheckRouteCode.includes('previewImageUrls') &&
    qaCheckRouteCode.includes('orderPrefix') &&
    qaCheckRouteCode.includes('pdfUrl') &&
    qaCheckRouteCode.includes('resolveExpectedPreviewRef'),
  'QA PDF route should accept manifest-driven preview refs and signed PDF URLs',
);
assert(
  !qaCheckRouteCode.includes('book-mvp-simple-adventure/orders/${orderId}/preview-images'),
  'QA PDF route should no longer hardcode Book 1 preview-image roots',
);
assert(
  approvalRouteCode.includes('buildOrderPrefix') &&
    !approvalRouteCode.includes('book-mvp-simple-adventure/orders/${orderId}/complete_book_${orderId}.pdf'),
  'Approval-PDF route should resolve the final PDF root dynamically',
);
assert(
  preBriaStageCode.includes('buildManifestApiUrl(orderPrefix, \'2a\'') &&
    preBriaStageCode.includes('buildPoseReferenceAssetKey(referenceBookId, poseNumber)') &&
    !preBriaStageCode.includes('book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json') &&
    !preBriaStageCode.includes('/api/assets/book-mvp-simple-adventure/characters/poses/'),
  'Pre-Bria stage should derive manifest and pose-reference paths from shared order/book helpers',
);
assert(
  autoFlipRouteCode.includes('buildCanonicalPoseKey(characterHash, poseNumberValue, resolvedBookId)') &&
    autoFlipRouteCode.includes('buildPoseReferenceKey(poseNumberValue, resolvedBookId)') &&
    autoFlipRouteCode.includes('normalizeOrderPrefix('),
  'Auto-flip route should resolve canonical pose and reference keys from shared book/order-root context',
);
assert(
  regeneratePoseRouteCode.includes('buildBaseCharacterAssetKey') &&
    regeneratePoseRouteCode.includes('buildPendingPoseRevisionKey') &&
    regeneratePoseRouteCode.includes('buildPoseReferenceAssetKey') &&
    !regeneratePoseRouteCode.includes('book-mvp-simple-adventure/orders/${orderId}/revisions/pending') &&
    !regeneratePoseRouteCode.includes('book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/base-character.png'),
  'Regenerate-pose route should build revision, base-character, and pose-reference keys from shared helpers',
);
assert(
  normalizePoseScaleRouteCode.includes('normalizePoseScaleAsset') &&
    normalizePoseScaleRouteCode.includes('extractBookIdFromPathLike') &&
    !normalizePoseScaleRouteCode.includes('book-mvp-simple-adventure/characters/poses/pose'),
  'Normalize-pose-scale route should delegate reference-key resolution to shared book-aware helpers',
);
assert(
  replaceImageRouteCode.includes('buildGeneratedPoseAssetKey') &&
    replaceImageRouteCode.includes('buildBgRemovedPoseAssetKey') &&
    replaceImageRouteCode.includes('buildBaseCharacterAssetKey') &&
    replaceImageRouteCode.includes('buildPreviewImageAssetKey') &&
    !replaceImageRouteCode.includes('book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/poses/pose') &&
    !replaceImageRouteCode.includes('book-mvp-simple-adventure/orders/${orderId}/preview-images/${pageKey}.png'),
  'Replace-image route should use shared generated-asset and preview-key helpers instead of Book 1 literals',
);
assert(
  orderDetailPageCode.includes('buildManifestApiUrl(manifestOrderPrefix, \'2a\'') &&
    orderDetailPageCode.includes('buildManifestApiUrl(manifestOrderPrefix, \'2b\'') &&
    orderDetailPageCode.includes('buildManifestApiUrl(manifestOrderPrefix, \'3\'') &&
    !orderDetailPageCode.includes('/api/manifests/book-mvp-simple-adventure/orders/'),
  'Order detail page should build manifest polling URLs from the resolved order root',
);
assert(
  assetsRouteCode.includes('getBucketFromKey(key)') &&
    !assetsRouteCode.includes("startsWith('book-mvp-simple-adventure/orders/')"),
  'Asset proxy route should route order assets without a Book 1-only prefix check',
);
assert(
  presignAssetsRouteCode.includes('getBucketFromKey(key)') &&
    !presignAssetsRouteCode.includes("startsWith('book-mvp-simple-adventure/orders/')"),
  'Presign-page-assets route should reuse shared bucket detection for dynamic order roots',
);
assert(
  inlineAssetsRouteCode.includes('getBucketFromKey(key)') &&
    !inlineAssetsRouteCode.includes("startsWith('book-mvp-simple-adventure/orders/')"),
  'Inline-page-assets route should reuse shared bucket detection for dynamic order roots',
);
assert(
  orderMapperCode.includes('extractBookIdFromOrderPathLike') &&
    orderMapperCode.includes('buildManifestKeyFromOrderPrefix') &&
    !orderMapperCode.includes('assetPrefix: `book-mvp-simple-adventure/orders/${orderId}/`'),
  'Order mapper should infer book namespaces from existing paths before falling back to Book 1',
);
const r2ServicePath = path.resolve(
  process.cwd(),
  'src/lib/r2-service.ts',
);
const r2ServiceCode = readFileSync(r2ServicePath, 'utf8');
const read2BManifestPath = path.resolve(
  process.cwd(),
  'src/lib/books/read-2b-manifest.ts',
);
const read2BManifestCode = readFileSync(read2BManifestPath, 'utf8');
assert(
  r2ServiceCode.includes('buildManifestKeyFromOrderPrefix') &&
    r2ServiceCode.includes('buildOrderPrefix(orderId, options.bookId)'),
  'R2 service should route manifest-key building through shared order-root helpers',
);
assert(
  read2BManifestCode.includes('buildManifestKeyFromOrderPrefix') &&
    read2BManifestCode.includes('order?.assetPrefix'),
  'Shared 2B reader should prefer explicit order roots before falling back to default manifest keys',
);

const workflowPath = path.resolve(
  process.cwd(),
  '../docs/n8n-workflow-files/finals/w3-Book-Assembly.json',
);
const siblingWorkflowPath = path.resolve(
  process.cwd(),
  '../docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w3-Book-Assembly.json',
);
const siblingW41WorkflowPath = path.resolve(
  process.cwd(),
  '../docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w4.1-Sibling-Aggregation.json',
);
const extractW3InputCode = getWorkflowNodeCode(workflowPath, 'Extract Manifest URL (3)');
const buildW3InputCode = getWorkflowNodeCode(workflowPath, 'Build Assembly Input From Manifest');
const renderAmazonHtmlCode = getWorkflowNodeCode(workflowPath, 'Generate Complete HTML (Amazon)');
const renderStandardHtmlCode = getWorkflowNodeCode(workflowPath, 'Generate Complete HTML (Standard)');
const pagePreviewCode = getWorkflowNodeCode(workflowPath, 'Generate Page Preview Images');
const prep3ManifestCode = getWorkflowNodeCode(workflowPath, 'Prep Manifest Upload (3)');
const build3ManifestCode = getWorkflowNodeCode(workflowPath, 'Build 3A Manifest');
const normalizeCoverInputsCode = getWorkflowNodeCode(workflowPath, 'Normalize Inputs (3A Phase 1)1');
const amazonCoverHtmlCode = getWorkflowNodeCode(workflowPath, 'Generate Cover HTML (AMAZON)');
const standardCoverHtmlCode = getWorkflowNodeCode(workflowPath, 'Generate Cover HTML (STANDARD)');
const siblingNormalizeCoverInputsCode = getWorkflowNodeCode(
  siblingWorkflowPath,
  'Normalize Inputs (3A Phase 1)1',
);
const siblingAmazonCoverHtmlCode = getWorkflowNodeCode(
  siblingWorkflowPath,
  'Generate Cover HTML (AMAZON)',
);
const siblingStandardCoverHtmlCode = getWorkflowNodeCode(
  siblingWorkflowPath,
  'Generate Cover HTML (STANDARD)',
);
const siblingW41PollPdfCode = getWorkflowNodeCode(
  siblingW41WorkflowPath,
  'Poll PDFMonkey until ready',
);
const siblingW41ReattachCoverContextCode = getWorkflowNodeCode(
  siblingW41WorkflowPath,
  'Reattach Cover Context (PDFM)',
);
const siblingW41ReattachInteriorContextCode = getWorkflowNodeCode(
  siblingW41WorkflowPath,
  'Reattach Interior Context (Post Download)',
);
const siblingW41ReattachQaContextCode = getWorkflowNodeCode(
  siblingW41WorkflowPath,
  'Reattach QA Context (Post Cover Upload)',
);
const w4WorkflowPath = path.resolve(
  process.cwd(),
  '../docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json',
);
const repoCentricW4WorkflowPath = path.resolve(
  process.cwd(),
  '../docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json',
);
const repoCentricW41WorkflowPath = path.resolve(
  process.cwd(),
  '../docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json',
);
const validateW4InputCode = getWorkflowNodeCode(w4WorkflowPath, 'Validate & Normalize W4 Input');
const build4ManifestCode = getWorkflowNodeCode(w4WorkflowPath, 'Build 4-Manifest JSON');
const buildCoverHtmlCode = getWorkflowNodeCode(w4WorkflowPath, 'Build Cover HTML');
const w4Workflow = JSON.parse(readFileSync(w4WorkflowPath, 'utf8')) as {
  nodes?: Array<{
    name?: string;
    parameters?: Record<string, unknown>;
    type?: string;
  }>;
  connections?: Record<string, unknown>;
};
const w4BuildManifestNode = w4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build 4-Manifest JSON',
);
const w4UploadManifestNode = w4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Upload 4-Manifest to R2',
);
const w4BuildErrorManifestNode = w4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build 4-Manifest JSON (Error)',
);
const w4UploadErrorManifestNode = w4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Upload 4-Manifest (Error) to R2',
);
const w4SubmitNode = w4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Submit Lulu Print Job (PRODUCTION - BEARER, Retry)',
);
const repoCentricW4Workflow = JSON.parse(
  readFileSync(repoCentricW4WorkflowPath, 'utf8'),
) as {
  name?: string;
  nodes?: Array<{
    name?: string;
    parameters?: Record<string, unknown>;
    type?: string;
  }>;
  connections?: Record<string, unknown>;
};
const repoCentricBuild4ErrorContextCode = getWorkflowNodeCode(
  repoCentricW4WorkflowPath,
  'Build Error Context',
);
const repoCentricQaFailedCode = getWorkflowNodeCode(
  repoCentricW4WorkflowPath,
  'QA Failed Error Handler',
);
const repoCentricW4FetchNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Fetch Repo W4 Print Input',
);
const repoCentricW4ValidateNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Validate & Normalize W4 Input',
);
const repoCentricW4BuildManifestNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build 4-Manifest JSON',
);
const repoCentricW4RenderInteriorNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Generate PDF with PDFMonkey1',
);
const repoCentricW4RenderCoverNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Generate Cover PDF with PDFMonkey',
);
const repoCentricW4MaterializeInteriorNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Download PDF from PDFMonkey1',
);
const repoCentricW4MaterializeCoverNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Download Cover PDF from PDFMonkey',
);
const repoCentricW4QaNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Prepare Renderer QA Inputs',
);
const repoCentricW4QaGateNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'IF QA Passed',
);
const repoCentricW4QaGateOutputs = (
  repoCentricW4Workflow.connections?.['IF QA Passed'] as
    | { main?: Array<Array<{ node?: string }>> }
    | undefined
)?.main ?? [];
const repoCentricW4QaFailedNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'QA Failed Error Handler',
);
const repoCentricW4ErrorContextNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build Error Context',
);
const repoCentricW4ErrorGateNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'IF has valid orderId (Error)',
);
const repoCentricW4ErrorGateOutputs = (
  repoCentricW4Workflow.connections?.['IF has valid orderId (Error)'] as
    | { main?: Array<Array<{ node?: string }>> }
    | undefined
)?.main ?? [];
const repoCentricW4BuildSubmitNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build Lulu Print Job Payload',
);
const repoCentricW4UploadManifestNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Upload 4-Manifest to R2',
);
const repoCentricW4ProcessLuluResponseNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Process Lulu Response',
);
const repoCentricW4BuildErrorManifestNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build 4-Manifest JSON (Error)',
);
const repoCentricW4UploadErrorManifestNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Upload 4-Manifest (Error) to R2',
);
const repoCentricW4WebhookNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Webhook (W4 Intake)',
);
const repoCentricW4SandboxTokenNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Lulu SANDBOX: Get Token',
);
const repoCentricW4SandboxSubmitNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Submit Lulu Print Job (SANDBOX - BEARER)',
);
const repoCentricW4NotifyNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Notify: Sent to Print',
);
const repoCentricW4SupabaseMarkSubmittedNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Supabase: mark submitted',
);
const repoCentricW4NormalizeShippingNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Normalize Shipping Level (Lulu Enum)',
);
const repoCentricW4ValidateInteriorNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Validate Interior (PRODUCTION)',
);
const repoCentricW4ValidateCoverNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Validate Cover (PRODUCTION)',
);
const repoCentricW4PrepareSubmitConnections = JSON.stringify(
  repoCentricW4Workflow.connections?.['Normalize Shipping Level (Lulu Enum)'] ?? {},
);
const repoCentricW4SandboxTokenConnections = JSON.stringify(
  repoCentricW4Workflow.connections?.['Lulu SANDBOX: Get Token'] ?? {},
);
const repoCentricW4ValidateInteriorConnections = JSON.stringify(
  repoCentricW4Workflow.connections?.['Validate Interior (PRODUCTION)'] ?? {},
);
const repoCentricW4ValidateCoverConnections = JSON.stringify(
  repoCentricW4Workflow.connections?.['Validate Cover (PRODUCTION)'] ?? {},
);
const repoCentricW4SandboxSubmitConnections = JSON.stringify(
  repoCentricW4Workflow.connections?.['Submit Lulu Print Job (SANDBOX - BEARER)'] ?? {},
);
const repoCentricW4BuildManifestConnections = JSON.stringify(
  repoCentricW4Workflow.connections?.['Build 4-Manifest JSON'] ?? {},
);
const repoCentricW4BuildErrorManifestConnections = JSON.stringify(
  repoCentricW4Workflow.connections?.['Build 4-Manifest JSON (Error)'] ?? {},
);
const repoCentricW4NotifyConnections = JSON.stringify(
  repoCentricW4Workflow.connections?.['Notify: Sent to Print'] ?? {},
);
const repoCentricW4LegacySubmitNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Submit Lulu Print Job (PRODUCTION - BEARER, Retry)',
);
const repoCentricW4LegacyTokenNode = repoCentricW4Workflow.nodes?.find(
  (candidate) => candidate.name === 'Lulu PRODUCTION: Get Token (Retry)',
);
const w4ValidateCoverConnections = JSON.stringify(
  w4Workflow.connections?.['Validate Cover (PRODUCTION)'] ?? {},
);
const w4Merge3Connections = JSON.stringify(w4Workflow.connections?.Merge3 ?? {});
const w4SubmitConnections = JSON.stringify(
  w4Workflow.connections?.['Submit Lulu Print Job (PRODUCTION - BEARER, Retry)'] ?? {},
);
const repoCentricW41Workflow = JSON.parse(
  readFileSync(repoCentricW41WorkflowPath, 'utf8'),
) as {
  name?: string;
  nodes?: Array<{
    name?: string;
    parameters?: Record<string, unknown>;
    type?: string;
  }>;
  connections?: Record<string, unknown>;
};
const repoCentricW41WebhookNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Webhook (W4.1 Intake)',
);
const repoCentricW41FetchNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Fetch Repo W4.1 Sibling Print Input',
);
const repoCentricW41ValidateNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Validate & Normalize Per Sibling',
);
const repoCentricW41RenderInteriorNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Generate Interior PDF',
);
const repoCentricW41PollInteriorNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Poll PDFMonkey until ready',
);
const repoCentricW41MaterializeInteriorNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Download Interior PDF',
);
const repoCentricW41RenderCoverNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Generate Cover PDF',
);
const repoCentricW41PollCoverNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Poll Cover PDFMonkey until ready',
);
const repoCentricW41MaterializeCoverNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Download Cover PDF',
);
const repoCentricW41QaNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Guard QA Inputs',
);
const repoCentricW41QaGateNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'IF QA Passed (W4.1)',
);
const repoCentricW41QaGateOutputs = (
  repoCentricW41Workflow.connections?.['IF QA Passed (W4.1)'] as
    | { main?: Array<Array<{ node?: string }>> }
    | undefined
)?.main ?? [];
const repoCentricW41InteriorPassThroughNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build Pages HTML (8.75in)',
);
const repoCentricW41CoverPassThroughNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build Cover HTML',
);
const repoCentricW41QaPassThroughNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Prepare Renderer QA Inputs',
);
const repoCentricW41UploadCoverNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Upload Cover PDF to R2',
);
const repoCentricW41AggregateNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Aggregate + Signed URLs + Build Lulu Payload',
);
const repoCentricW41TokenNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Lulu: Get Token',
);
const repoCentricW41NormalizeNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Normalize Shipping Level (Lulu Enum)',
);
const repoCentricW41ValidateGuardNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Validate PDFs + Guard Lulu',
);
const repoCentricW41SubmitNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Submit Lulu Print Job',
);
const repoCentricW41SplitSupabaseNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Split for Supabase PATCH',
);
const repoCentricW41SupabasePatchNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Supabase: PATCH N rows',
);
const repoCentricW41AggregateNotifyNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Aggregate for Notify',
);
const repoCentricW41NotifyNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Notify: Sent to Print',
);
const repoCentricW41BuildManifestNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build 4-Manifest JSON',
);
const repoCentricW41UploadManifestNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Upload 4-Manifest to R2',
);
const repoCentricW41QaFailedNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'QA Failed Error Handler (W4.1)',
);
const repoCentricW41BuildErrorManifestNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Build Error Manifest',
);
const repoCentricW41UploadErrorManifestNode = repoCentricW41Workflow.nodes?.find(
  (candidate) => candidate.name === 'Upload Error Manifest to R2',
);
const repoCentricW41FetchConnections = JSON.stringify(
  repoCentricW41Workflow.connections?.['Fetch Repo W4.1 Sibling Print Input'] ?? {},
);
const repoCentricW41ValidateConnections = JSON.stringify(
  repoCentricW41Workflow.connections?.['Validate & Normalize Per Sibling'] ?? {},
);
const repoCentricW41ValidateGuardConnections = JSON.stringify(
  repoCentricW41Workflow.connections?.['Validate PDFs + Guard Lulu'] ?? {},
);
const repoCentricW41SplitSupabaseConnections = JSON.stringify(
  repoCentricW41Workflow.connections?.['Split for Supabase PATCH'] ?? {},
);
const repoCentricW41AggregateNotifyConnections = JSON.stringify(
  repoCentricW41Workflow.connections?.['Aggregate for Notify'] ?? {},
);

assert(
  extractW3InputCode.includes('oneManifestKey') &&
    extractW3InputCode.includes('orderR2BaseKey'),
  'W3 extract node should resolve companion 1-manifest and order root context',
);
assert(
  buildW3InputCode.includes('pagePlanSource') &&
    buildW3InputCode.includes('requiredPoseSource') &&
    buildW3InputCode.includes('buildLegacyPagePlan'),
  'W3 assembly-input node should derive page-plan and required-pose semantics with legacy fallback',
);
assert(
  renderAmazonHtmlCode.includes('for (const page of pagePlan)') &&
    renderAmazonHtmlCode.includes('findPose(page)') &&
    !renderAmazonHtmlCode.includes('for (let pageIdx = 3; pageIdx <= 16; pageIdx++)'),
  'Amazon W3 renderer should iterate the resolved page plan instead of fixed amazon ranges',
);
assert(
  renderStandardHtmlCode.includes('for (const page of pagePlan)') &&
    renderStandardHtmlCode.includes('findStoryText(page)') &&
    !renderStandardHtmlCode.includes('for (let i = 1; i <= 14; i++)'),
  'Standard W3 renderer should iterate the resolved page plan instead of fixed story ranges',
);
assert(
  pagePreviewCode.includes('orderR2BaseKey') &&
    pagePreviewCode.includes('/preview-images/${filename}'),
  'W3 page preview node should use the resolved order root for preview-image keys',
);
assert(
  prep3ManifestCode.includes('orderR2BaseKey') &&
    prep3ManifestCode.includes('/manifests/3-manifest.json'),
  'W3 3-manifest upload node should keep the canonical manifest filename on the resolved order root',
);
assert(
  build3ManifestCode.includes('pagePlanByNumber') &&
    build3ManifestCode.includes('requiredPoseNumbers') &&
    build3ManifestCode.includes('pages.p00_dedication'),
  'W3 3-manifest builder should carry page-plan metadata and preserve the page-0 compatibility alias',
);
assert(
  normalizeCoverInputsCode.includes("childName: trim(cs.childName || '')") &&
    !normalizeCoverInputsCode.includes("childName: clamp(cs.childName || '', 40)"),
  'W3 cover-input normalization should preserve the full childName instead of clamping it to 40 characters',
);
assert(
  !amazonCoverHtmlCode.includes('front-amazon-header') &&
    amazonCoverHtmlCode.includes('front-child-name') &&
    amazonCoverHtmlCode.includes('data-fit-max="120"') &&
    amazonCoverHtmlCode.includes('data-fit-soft-min="60"') &&
    amazonCoverHtmlCode.includes('page00-covers-barcode.jpg') &&
    !amazonCoverHtmlCode.includes('${esc(storyPrefix)} ${frontChildHtml}'),
  'Amazon W3 cover HTML should keep the fixed title/byline in the background art while emitting a split personalization contract for the dynamic name fit',
);
assert(
  standardCoverHtmlCode.includes('data-fit-container="single-line"') &&
    standardCoverHtmlCode.includes('data-fit-mode="single-line"') &&
    standardCoverHtmlCode.includes('INNER VOICE'),
  'Standard W3 cover HTML should keep the current two-line structure while marking only the name line as a fit target',
);
assert(
  normalizeWorkflowCodeSnapshot(siblingNormalizeCoverInputsCode) ===
    normalizeWorkflowCodeSnapshot(normalizeCoverInputsCode) &&
    normalizeWorkflowCodeSnapshot(siblingAmazonCoverHtmlCode) ===
      normalizeWorkflowCodeSnapshot(amazonCoverHtmlCode) &&
    normalizeWorkflowCodeSnapshot(siblingStandardCoverHtmlCode) ===
      normalizeWorkflowCodeSnapshot(standardCoverHtmlCode),
  'Sibling W3 cover-route nodes should stay in sync with the main W3 cover-route nodes',
);
assert(
  validateW4InputCode.includes('orderPrefix') &&
    validateW4InputCode.includes('providedPageLabels') &&
    validateW4InputCode.includes('firstRequiredLabel') &&
    validateW4InputCode.includes('manifest3Key'),
  'W4 validation should accept manifest-driven order roots and page labels before falling back to legacy assumptions',
);
assert(
  build4ManifestCode.includes('orderPrefix') &&
    build4ManifestCode.includes('/manifests/4-manifest.json'),
  'W4 manifest writer should keep the canonical 4-manifest filename on the resolved order root',
);
assert(
  repoCentricBuild4ErrorContextCode.includes('orderPrefix') &&
    repoCentricBuild4ErrorContextCode.includes('extractOrderPrefix') &&
    !repoCentricBuild4ErrorContextCode.includes('printFulfillmentErrorMessage'),
  'W4 error handling should recover the resolved order root when persisting failure manifests',
);
assert(
  buildCoverHtmlCode.includes('orderPrefix') &&
    buildCoverHtmlCode.includes('cover-spread.png'),
  'W4 cover HTML should resolve the cover fallback from the normalized order root',
);
assert(
  repoCentricQaFailedCode.includes('orderPrefix') &&
    repoCentricQaFailedCode.includes('4-qa-fail-manifest.json') &&
    !repoCentricQaFailedCode.includes('printFulfillmentErrorMessage') &&
    !repoCentricQaFailedCode.includes('printFulfillmentErrorPhase') &&
    !repoCentricQaFailedCode.includes('printFulfillmentStatus'),
  'W4 QA failure handling should persist manifests on the resolved order root',
);
assert(
  JSON.stringify(w4BuildManifestNode?.parameters).includes(
    "Buffer.from(body, 'utf8').toString('base64')",
  ) &&
    w4UploadManifestNode?.parameters?.binaryData === true,
  'Source W4 manifest upload should serialize manifest JSON into binary data before the R2 upload node runs',
);
assert(
  JSON.stringify(w4BuildErrorManifestNode?.parameters).includes(
    "Buffer.from(body, 'utf8').toString('base64')",
  ) &&
    w4UploadErrorManifestNode?.parameters?.binaryData === true,
  'Source W4 error-manifest upload should serialize error manifest JSON into binary data before the R2 upload node runs',
);
assert(
  JSON.stringify(w4SubmitNode?.parameters).includes('if (j.__skipLulu)') &&
    w4ValidateCoverConnections.includes('"node":"Merge3"') &&
    w4Merge3Connections.includes('"node":"Submit Lulu Print Job (PRODUCTION - BEARER, Retry)"') &&
    w4SubmitConnections.includes('"node":"Status Banner (Env & Submit Path)"'),
  'Source W4 Lulu submit path should gate production submission behind the guard merge and short-circuit when __skipLulu is set',
);
assert(
  repoCentricW4Workflow.name === 'REPO - w4-PRODUCTION-Print_Fulfillment',
  'Repo-centric W4 workflow should carry the repo-centric workflow name',
);
assert(
  repoCentricW4WebhookNode?.parameters?.path === 'w4-pdf-print-repo',
  'Repo-centric W4 workflow should use the repo-specific webhook path',
);
assert(
  repoCentricW4FetchNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4FetchNode.parameters).includes('/api/internal/w4/build-print-input') &&
    JSON.stringify(repoCentricW4FetchNode.parameters).includes('payload.backendUrl') &&
    JSON.stringify(repoCentricW4FetchNode.parameters).includes(
      'payload.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4FetchNode.parameters).includes('this.helpers.httpRequest'),
  'Repo-centric W4 workflow should call the repo-owned W4 print-input route',
);
assert(
  repoCentricW4ValidateNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4ValidateNode.parameters).includes('Could not parse W4 print input response') &&
    JSON.stringify(repoCentricW4ValidateNode.parameters).includes('payload.workflowSkipped === true'),
  'Repo-centric W4 workflow should unwrap the repo-owned W4 print-input response and short-circuit skipped W4 orders before downstream nodes',
);
assert(
  repoCentricW4RenderInteriorNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4RenderInteriorNode.parameters).includes(
      '/api/internal/w4/render-print-document',
    ) &&
    JSON.stringify(repoCentricW4RenderInteriorNode.parameters).includes("current.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4RenderInteriorNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4RenderInteriorNode.parameters).includes('this.helpers.httpRequest') &&
    JSON.stringify(repoCentricW4RenderInteriorNode.parameters).includes('documentKind'),
  'Repo-centric W4 workflow should route interior PDF rendering through the repo-owned render-print-document route',
);
assert(
  repoCentricW4RenderCoverNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4RenderCoverNode.parameters).includes(
      '/api/internal/w4/render-print-document',
    ) &&
    JSON.stringify(repoCentricW4RenderCoverNode.parameters).includes("current.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4RenderCoverNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4RenderCoverNode.parameters).includes('this.helpers.httpRequest') &&
    JSON.stringify(repoCentricW4RenderCoverNode.parameters).includes('cover-pdf'),
  'Repo-centric W4 workflow should route cover PDF rendering through the repo-owned render-print-document route',
);
assert(
  repoCentricW4MaterializeInteriorNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4MaterializeInteriorNode.parameters).includes(
      '/api/internal/w4/materialize-print-pdf',
    ) &&
    JSON.stringify(repoCentricW4MaterializeInteriorNode.parameters).includes("current.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4MaterializeInteriorNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4MaterializeInteriorNode.parameters).includes('this.helpers.httpRequest') &&
    repoCentricW4MaterializeCoverNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4MaterializeCoverNode.parameters).includes(
      '/api/internal/w4/materialize-print-pdf',
    ) &&
    JSON.stringify(repoCentricW4MaterializeCoverNode.parameters).includes("current.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4MaterializeCoverNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4MaterializeCoverNode.parameters).includes('this.helpers.httpRequest') &&
    JSON.stringify(repoCentricW4MaterializeInteriorNode.parameters).includes('allowDirectPdfUrls: true') &&
    JSON.stringify(repoCentricW4MaterializeCoverNode.parameters).includes('allowDirectPdfUrls: true'),
  'Repo-centric W4 workflow should route both interior and cover PDF materialization through the repo-owned materialize-print-pdf route and opt into direct provider URLs when worker-side PDF uploads are intentionally skipped',
);
assert(
  repoCentricW4QaNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4QaNode.parameters).includes('/api/internal/w4/run-print-qa') &&
    JSON.stringify(repoCentricW4QaNode.parameters).includes("current.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4QaNode.parameters).includes('current.CONFIG?.backendApiToken') &&
    JSON.stringify(repoCentricW4QaNode.parameters).includes('this.helpers.httpRequest'),
  'Repo-centric W4 workflow should run print QA through the repo-owned run-print-qa route',
);
assert(
  repoCentricW4QaGateNode?.type === 'n8n-nodes-base.if' &&
    JSON.stringify(repoCentricW4QaGateNode.parameters).includes("$json.qaPassed === true ? 'true' : 'false'") &&
    repoCentricW4QaGateOutputs[0]?.[0]?.node === 'Decide Lulu Source URLs (NO PROXY)' &&
    repoCentricW4QaGateOutputs[1]?.[0]?.node === 'QA Failed Error Handler' &&
    repoCentricW4QaFailedNode?.type === 'n8n-nodes-base.code',
  'Repo-centric W4 QA gate should coerce qaPassed explicitly and route true->Lulu submit prep, false->QA failure',
);
assert(
  repoCentricW4ErrorContextNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4ErrorContextNode.parameters).includes('CONFIG.supabase && CONFIG.supabase.serviceRoleKey') &&
    !JSON.stringify(repoCentricW4ErrorContextNode.parameters).includes('$env.') &&
    JSON.stringify(repoCentricW4ErrorContextNode.parameters).includes("'X-N8N-API-KEY': n8nApiKey") &&
    JSON.stringify(repoCentricW4ErrorContextNode.parameters).includes('/executions/${executionId}?includeData=true') &&
    !JSON.stringify(repoCentricW4ErrorContextNode.parameters).includes('wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs') &&
    repoCentricW4ErrorGateNode?.type === 'n8n-nodes-base.if' &&
    JSON.stringify(repoCentricW4ErrorGateNode.parameters).includes('hasValidOrderId === true') &&
    JSON.stringify(repoCentricW4ErrorGateNode.parameters).includes('"operation":"true"') &&
    repoCentricW4ErrorGateOutputs[0]?.[0]?.node === 'Supabase: mark error',
  'Repo-centric W4 generic error handling should recover source execution context via the n8n API, avoid broken Code-node env access and embedded service-role fallbacks, and gate Supabase error writes behind a real boolean order-id check',
);
assert(
  repoCentricW4BuildSubmitNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4BuildSubmitNode.parameters).includes(
      '/api/internal/w4/build-submit-input',
    ) &&
    JSON.stringify(repoCentricW4BuildSubmitNode.parameters).includes("current.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4BuildSubmitNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4BuildSubmitNode.parameters).includes('this.helpers.httpRequest'),
  'Repo-centric W4 workflow should build Lulu submit input through the repo-owned build-submit-input route',
);
assert(
  repoCentricW4BuildManifestNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4BuildManifestNode.parameters).includes(
      '/api/internal/w4/publish-print-manifest',
    ) &&
    JSON.stringify(repoCentricW4BuildManifestNode.parameters).includes("current.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4BuildManifestNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4BuildManifestNode.parameters).includes('this.helpers.httpRequest') &&
    repoCentricW4BuildManifestConnections.includes('"node":"Upload 4-Manifest to R2"') &&
    repoCentricW4UploadManifestNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4UploadManifestNode.parameters).includes('return $input.all();'),
  'Repo-centric W4 success manifest path should publish through the repo-owned publish-print-manifest route and keep the downstream upload node as a pass-through adapter',
);
assert(
  repoCentricW4BuildErrorManifestNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4BuildErrorManifestNode.parameters).includes(
      '/api/internal/w4/publish-print-manifest',
    ) &&
    JSON.stringify(repoCentricW4BuildErrorManifestNode.parameters).includes('QA Failed Error Handler') &&
    JSON.stringify(repoCentricW4BuildErrorManifestNode.parameters).includes('Build Error Context') &&
    JSON.stringify(repoCentricW4BuildErrorManifestNode.parameters).includes("merged.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4BuildErrorManifestNode.parameters).includes(
      'merged.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4BuildErrorManifestNode.parameters).includes('this.helpers.httpRequest') &&
    repoCentricW4BuildErrorManifestConnections.includes('"node":"Upload 4-Manifest (Error) to R2"') &&
    repoCentricW4UploadErrorManifestNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4UploadErrorManifestNode.parameters).includes('return $input.all();'),
  'Repo-centric W4 error-manifest path should publish through the repo-owned publish-print-manifest route and keep the downstream upload node as a pass-through adapter',
);
assert(
  repoCentricW4NormalizeShippingNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4NormalizeShippingNode.parameters).includes('return $input.all();') &&
    repoCentricW4PrepareSubmitConnections.includes('"node":"Lulu SANDBOX: Get Token"') &&
    repoCentricW4SandboxTokenNode?.type === 'n8n-nodes-base.code' &&
    repoCentricW4SandboxTokenNode?.disabled !== true &&
    JSON.stringify(repoCentricW4SandboxTokenNode.parameters).includes('j.luluApiBase') &&
    JSON.stringify(repoCentricW4SandboxTokenNode.parameters).includes("apiBase + '/auth/realms/glasstree/protocol/openid-connect/token'") &&
    repoCentricW4SandboxTokenConnections.includes('"node":"Validate Interior (PRODUCTION)"') &&
    repoCentricW4ValidateInteriorNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4ValidateInteriorNode.parameters).includes('validate-interior') &&
    repoCentricW4ValidateInteriorConnections.includes('"node":"Validate Cover (PRODUCTION)"') &&
    repoCentricW4ValidateCoverNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4ValidateCoverNode.parameters).includes('validate-cover') &&
    repoCentricW4ValidateCoverConnections.includes('"node":"Submit Lulu Print Job (SANDBOX - BEARER)"') &&
    repoCentricW4SandboxSubmitNode?.type === 'n8n-nodes-base.code' &&
    repoCentricW4SandboxSubmitNode?.disabled !== true &&
    JSON.stringify(repoCentricW4SandboxSubmitNode.parameters).includes('if (j.__skipLulu)') &&
    JSON.stringify(repoCentricW4SandboxSubmitNode.parameters).includes('j.luluApiBase') &&
    JSON.stringify(repoCentricW4SandboxSubmitNode.parameters).includes("apiBase + '/print-jobs/'") &&
    repoCentricW4SandboxSubmitConnections.includes('"node":"Status Banner (Env & Submit Path)"'),
  'Repo-centric W4 active Lulu submit path should short-circuit __skipLulu runs and honor the repo-owned submit input luluApiBase for sandbox or production execution',
);
assert(
  repoCentricW4LegacyTokenNode &&
    repoCentricW4LegacySubmitNode &&
    !repoCentricW4PrepareSubmitConnections.includes('"node":"Lulu PRODUCTION: Get Token (Retry)"') &&
    !repoCentricW4ValidateCoverConnections.includes('"node":"Merge3"') &&
    JSON.stringify(repoCentricW4LegacyTokenNode.parameters).includes("submitMode !== 'production'") &&
    JSON.stringify(repoCentricW4LegacyTokenNode.parameters).includes('__skipLulu=true') &&
    JSON.stringify(repoCentricW4LegacySubmitNode.parameters).includes("submitMode !== 'production'") &&
    JSON.stringify(repoCentricW4LegacySubmitNode.parameters).includes('__skipLulu=true'),
  'Repo-centric W4 should leave the legacy production Lulu nodes present but unreachable from the active extracted path, and they must still fail closed unless submitMode=production',
);
assert(
  repoCentricW4ProcessLuluResponseNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4ProcessLuluResponseNode.parameters).includes('const rawStatus =') &&
    JSON.stringify(repoCentricW4ProcessLuluResponseNode.parameters).includes('statusDetail?.name || statusDetail?.status || statusDetail?.state') &&
    JSON.stringify(repoCentricW4ProcessLuluResponseNode.parameters).includes('luluStatusDetail: statusDetail'),
  'Repo-centric W4 should normalize structured Lulu status objects in the active response path before downstream manifest persistence',
);
assert(
  repoCentricW4SupabaseMarkSubmittedNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4SupabaseMarkSubmittedNode.parameters).includes('return $input.all();') &&
    repoCentricW4NotifyNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW4NotifyNode.parameters).includes('/api/webhooks/print-submitted') &&
    JSON.stringify(repoCentricW4NotifyNode.parameters).includes("current.backendUrl || 'https://admin.littleherolabs.com'") &&
    JSON.stringify(repoCentricW4NotifyNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW4NotifyNode.parameters).includes('this.helpers.httpRequest') &&
    JSON.stringify(repoCentricW4NotifyNode.parameters).includes('workflowJobId') &&
    JSON.stringify(repoCentricW4NotifyNode.parameters).includes('submitMode') &&
    repoCentricW4NotifyConnections === '{}',
  'Repo-centric W4 completion path should carry workflow-job metadata into print-submitted and avoid the old direct Supabase mark-submitted side effect',
);
assert(
  repoCentricW41Workflow.name === 'REPO - w4.1-Sibling-Aggregation',
  'Repo-centric W4.1 workflow should carry the repo-centric workflow name',
);
assert(
  repoCentricW41WebhookNode?.parameters?.path === 'w4-1-sibling-aggregation-repo',
  'Repo-centric W4.1 workflow should use the repo-specific webhook path',
);
assert(
  repoCentricW41FetchNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41FetchNode.parameters).includes(
      '/api/internal/w4/build-sibling-print-input',
    ) &&
    JSON.stringify(repoCentricW41FetchNode.parameters).includes('mergeConfig(') &&
    JSON.stringify(repoCentricW41FetchNode.parameters).includes(
      "toRecord(root.body).CONFIG",
    ) &&
    JSON.stringify(repoCentricW41FetchNode.parameters).includes(
      "'https://admin.littleherolabs.com'",
    ) &&
    JSON.stringify(repoCentricW41FetchNode.parameters).includes('allowProductionLulu') &&
    JSON.stringify(repoCentricW41FetchNode.parameters).includes('productionDryRun') &&
    JSON.stringify(repoCentricW41FetchNode.parameters).includes('productionApprovalToken'),
  'Repo-centric W4.1 workflow should call the repo-owned sibling print-input route while merging inbound CONFIG overrides, pinning the production backendUrl, and preserving grouped production controls for downstream dry-run gating',
);
assert(
  repoCentricW41ValidateNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41ValidateNode.parameters).includes(
      'Could not parse W4.1 sibling print input response',
    ) &&
    JSON.stringify(repoCentricW41ValidateNode.parameters).includes('payload.siblings') &&
    JSON.stringify(repoCentricW41ValidateNode.parameters).includes('payload.workflowJobId') &&
    JSON.stringify(repoCentricW41ValidateNode.parameters).includes('workflowJobIdempotencyKey') &&
    JSON.stringify(repoCentricW41ValidateNode.parameters).includes('allowProductionLulu') &&
    JSON.stringify(repoCentricW41ValidateNode.parameters).includes('productionDryRun') &&
    JSON.stringify(repoCentricW41ValidateNode.parameters).includes('productionApprovalToken'),
  'Repo-centric W4.1 workflow should unwrap the repo-owned sibling print-input response into per-sibling items, propagate shared workflow-job metadata, and preserve grouped production controls through the active flow',
);
assert(
  repoCentricW41AggregateNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41AggregateNode.parameters).includes(
      '/api/internal/w4/build-sibling-submit-input',
    ) &&
    JSON.stringify(repoCentricW41AggregateNode.parameters).includes('rootGroupId') &&
    JSON.stringify(repoCentricW41AggregateNode.parameters).includes('allowProductionLulu') &&
    JSON.stringify(repoCentricW41AggregateNode.parameters).includes('productionDryRun') &&
    JSON.stringify(repoCentricW41AggregateNode.parameters).includes('productionApprovalToken'),
  'Repo-centric W4.1 workflow should call the repo-owned sibling submit-input route after per-sibling PDF work completes and forward grouped production metadata to the repo-owned builder',
);
assert(
  repoCentricW41TokenNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41TokenNode.parameters).includes('https://api.sandbox.lulu.com') &&
    JSON.stringify(repoCentricW41TokenNode.parameters).includes('if (j.__skipLulu)') &&
    JSON.stringify(repoCentricW41TokenNode.parameters).includes('j.luluApiBase || j.CONFIG?.lulu?.apiBase') &&
    JSON.stringify(repoCentricW41TokenNode.parameters).includes(
      'active Lulu token path only supports sandbox or production submitMode',
    ),
  'Repo-centric W4.1 token path should short-circuit skipped sibling groups, default to sandbox, and honor repo-owned grouped production submitMode when explicitly approved',
);
assert(
  normalizeWorkflowCodeSnapshot(
    JSON.stringify(repoCentricW41NormalizeNode?.parameters?.jsCode ?? ''),
  ).includes('return [{ json: { ...($input.first().json || {}) } }];'),
  'Repo-centric W4.1 shipping normalization node should be a pass-through because the repo now owns shipping-level resolution',
);
assert(
  JSON.stringify(repoCentricW41ValidateGuardNode?.parameters).includes('if (j.__skipLulu)') &&
    JSON.stringify(repoCentricW41ValidateGuardNode?.parameters).includes('https://api.sandbox.lulu.com') &&
    JSON.stringify(repoCentricW41ValidateGuardNode?.parameters).includes('j.luluApiBase || cfg.lulu?.apiBase') &&
    JSON.stringify(repoCentricW41ValidateGuardNode?.parameters).includes(
      'active Lulu validation path only supports sandbox or production submitMode',
    ) &&
    !JSON.stringify(repoCentricW41ValidateGuardNode?.parameters).includes('lulu_job_id=not.is.null') &&
    !JSON.stringify(repoCentricW41ValidateGuardNode?.parameters).includes('cfg.supabase?.projectUrl'),
  'Repo-centric W4.1 validation node should validate sibling PDFs against the repo-selected Lulu base, preserve skip behavior, and should not re-implement the duplicate-submit guard in n8n',
);
assert(
  JSON.stringify(repoCentricW41SubmitNode?.parameters).includes('if (j.__skipLulu)') &&
    JSON.stringify(repoCentricW41SubmitNode?.parameters).includes('luluSubmitStatusCode: 0') &&
    JSON.stringify(repoCentricW41SubmitNode?.parameters).includes('https://api.sandbox.lulu.com') &&
    JSON.stringify(repoCentricW41SubmitNode?.parameters).includes('j.luluApiBase || j.CONFIG?.lulu?.apiBase') &&
    JSON.stringify(repoCentricW41SubmitNode?.parameters).includes(
      'active Lulu submit path only supports sandbox or production submitMode',
    ) &&
    repoCentricW41ValidateGuardConnections.includes('"node":"Submit Lulu Print Job"'),
  'Repo-centric W4.1 submit path should short-circuit cleanly when the repo-owned guard marks the group as skipped, default to sandbox, and honor explicitly approved grouped production submitMode',
);
assert(
  repoCentricW41RenderInteriorNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41RenderInteriorNode.parameters).includes(
      '/api/internal/w4/render-print-document',
    ) &&
    JSON.stringify(repoCentricW41RenderInteriorNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW41RenderInteriorNode.parameters).includes('allowIncomplete: true') &&
    JSON.stringify(repoCentricW41RenderInteriorNode.parameters).includes('maxPollAttempts: 10') &&
    JSON.stringify(repoCentricW41RenderInteriorNode.parameters).includes('interior-pdf') &&
    repoCentricW41PollInteriorNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41PollInteriorNode.parameters).includes(
      '/api/internal/w4/poll-print-document',
    ) &&
    JSON.stringify(repoCentricW41PollInteriorNode.parameters).includes('maxPollAttempts: 30') &&
    JSON.stringify(repoCentricW41PollInteriorNode.parameters).includes('interior-pdf') &&
    repoCentricW41RenderCoverNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41RenderCoverNode.parameters).includes(
      '/api/internal/w4/render-print-document',
    ) &&
    JSON.stringify(repoCentricW41RenderCoverNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW41RenderCoverNode.parameters).includes('allowIncomplete: true') &&
    JSON.stringify(repoCentricW41RenderCoverNode.parameters).includes('maxPollAttempts: 10') &&
    JSON.stringify(repoCentricW41RenderCoverNode.parameters).includes('cover-pdf') &&
    repoCentricW41PollCoverNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41PollCoverNode.parameters).includes(
      '/api/internal/w4/poll-print-document',
    ) &&
    JSON.stringify(repoCentricW41PollCoverNode.parameters).includes('maxPollAttempts: 30') &&
    JSON.stringify(repoCentricW41PollCoverNode.parameters).includes('cover-pdf'),
  'Repo-centric W4.1 workflow should split per-sibling PDFMonkey work into repo-owned submit-and-short-poll plus repo-owned follow-up poll routes so grouped runs stay under n8n cloud task-runner limits',
);
assert(
  repoCentricW41MaterializeInteriorNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41MaterializeInteriorNode.parameters).includes(
      '/api/internal/w4/materialize-print-pdf',
    ) &&
    JSON.stringify(repoCentricW41MaterializeInteriorNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW41MaterializeInteriorNode.parameters).includes('interior-pdf') &&
    repoCentricW41MaterializeCoverNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41MaterializeCoverNode.parameters).includes(
      '/api/internal/w4/materialize-print-pdf',
    ) &&
    JSON.stringify(repoCentricW41MaterializeCoverNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    JSON.stringify(repoCentricW41MaterializeCoverNode.parameters).includes('cover-pdf'),
  'Repo-centric W4.1 workflow should route per-sibling PDF materialization through the repo-owned materialize-print-pdf route',
);
assert(
  repoCentricW41QaNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41QaNode.parameters).includes('/api/internal/w4/run-print-qa') &&
    JSON.stringify(repoCentricW41QaNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    repoCentricW41QaPassThroughNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41QaPassThroughNode.parameters).includes('item?.json || {}'),
  'Repo-centric W4.1 workflow should route sibling QA through the repo-owned run-print-qa route and keep the surrounding QA-prep node as a pass-through adapter',
);
assert(
  repoCentricW41QaGateNode?.type === 'n8n-nodes-base.if' &&
    JSON.stringify(repoCentricW41QaGateNode.parameters).includes("$json.qaPassed === true ? 'true' : 'false'") &&
    repoCentricW41QaGateOutputs[0]?.[0]?.node === 'Aggregate + Signed URLs + Build Lulu Payload' &&
    repoCentricW41QaGateOutputs[1]?.[0]?.node === 'QA Failed Error Handler (W4.1)' &&
    repoCentricW41QaFailedNode?.type === 'n8n-nodes-base.code',
  'Repo-centric W4.1 QA gate should coerce qaPassed explicitly and route true->sibling submit aggregation, false->QA failure',
);
assert(
  repoCentricW41BuildManifestNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41BuildManifestNode.parameters).includes(
      '/api/internal/w4/publish-print-manifest',
    ) &&
    JSON.stringify(repoCentricW41BuildManifestNode.parameters).includes(
      "manifestStatus: 'submitted'",
    ) &&
    JSON.stringify(repoCentricW41BuildManifestNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    repoCentricW41UploadManifestNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41UploadManifestNode.parameters).includes('item?.binary'),
  'Repo-centric W4.1 success-manifest path should publish through the repo-owned publish-print-manifest route and keep the downstream upload node as a pass-through adapter',
);
assert(
  JSON.stringify(repoCentricW41QaFailedNode?.parameters).includes('orderPrefix') &&
    JSON.stringify(repoCentricW41QaFailedNode?.parameters).includes('4-qa-fail-manifest.json') &&
    repoCentricW41BuildErrorManifestNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41BuildErrorManifestNode.parameters).includes(
      '/api/internal/w4/publish-print-manifest',
    ) &&
    JSON.stringify(repoCentricW41BuildErrorManifestNode.parameters).includes(
      "manifestStatus: 'error'",
    ) &&
    JSON.stringify(repoCentricW41BuildErrorManifestNode.parameters).includes(
      'current.CONFIG?.backendApiToken',
    ) &&
    repoCentricW41UploadErrorManifestNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41UploadErrorManifestNode.parameters).includes('item?.binary'),
  'Repo-centric W4.1 QA failure handling should publish error manifests through the repo-owned publish-print-manifest route and keep the downstream upload node as a pass-through adapter',
);
assert(
  repoCentricW41FetchConnections.includes('"node":"Respond to Webhook (Ack)"') &&
    repoCentricW41FetchConnections.includes('"node":"Validate & Normalize Per Sibling"') &&
    repoCentricW41ValidateConnections.includes('"node":"Supabase: mark start (N rows)"') &&
    repoCentricW41ValidateConnections.includes('"node":"Build Pages HTML (8.75in)"'),
  'Repo-centric W4.1 intake should acknowledge after the repo call and fan back out to per-sibling start-marking plus HTML generation',
);
assert(
  repoCentricW41SplitSupabaseNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41SplitSupabaseNode.parameters).includes('return $input.all();') &&
    repoCentricW41SupabasePatchNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41SupabasePatchNode.parameters).includes('return $input.all();') &&
    repoCentricW41SplitSupabaseConnections.includes('"node":"Build 4-Manifest JSON"'),
  'Repo-centric W4.1 should keep the old Supabase mark-submitted path as pass-through adapters instead of direct lifecycle writes',
);
assert(
  repoCentricW41AggregateNotifyNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41AggregateNotifyNode.parameters).includes('workflowJobId') &&
    JSON.stringify(repoCentricW41AggregateNotifyNode.parameters).includes('rootGroupId') &&
    JSON.stringify(repoCentricW41AggregateNotifyNode.parameters).includes('submitMode') &&
    repoCentricW41NotifyNode?.type === 'n8n-nodes-base.httpRequest' &&
    JSON.stringify(repoCentricW41NotifyNode.parameters).includes('/api/webhooks/print-submitted') &&
    JSON.stringify(repoCentricW41NotifyNode.parameters).includes('rootGroupId') &&
    JSON.stringify(repoCentricW41NotifyNode.parameters).includes('workflowJobId') &&
    JSON.stringify(repoCentricW41NotifyNode.parameters).includes('submitMode') &&
    repoCentricW41AggregateNotifyConnections.includes('"node":"Notify: Sent to Print"'),
  'Repo-centric W4.1 completion path should carry rootGroupId plus shared workflow-job metadata into print-submitted instead of relying on direct Supabase lifecycle writes',
);
assert(
  repoCentricW41InteriorPassThroughNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41InteriorPassThroughNode.parameters).includes('item?.json || {}') &&
    repoCentricW41CoverPassThroughNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41CoverPassThroughNode.parameters).includes('item?.json || {}') &&
    repoCentricW41UploadCoverNode?.type === 'n8n-nodes-base.code' &&
    JSON.stringify(repoCentricW41UploadCoverNode.parameters).includes('item?.binary'),
  'Repo-centric W4.1 HTML and upload helper nodes should be thin pass-through adapters once the repo-owned worker routes handle render and materialization',
);
assert(
  siblingW41PollPdfCode.includes('$itemIndex') &&
    !siblingW41PollPdfCode.includes('?.[0]?.json') &&
    siblingW41ReattachCoverContextCode.includes('$itemIndex') &&
    !siblingW41ReattachCoverContextCode.includes('?.[0]?.json') &&
    siblingW41ReattachInteriorContextCode.includes('$itemIndex') &&
    !siblingW41ReattachInteriorContextCode.includes('?.[0]?.json') &&
    siblingW41ReattachQaContextCode.includes('$itemIndex') &&
    !siblingW41ReattachQaContextCode.includes('?.[0]?.json') &&
    siblingW41ReattachQaContextCode.includes("Upload Interior PDF to R2") &&
    siblingW41ReattachQaContextCode.includes('mergePreferPresent('),
  'Sibling-source W4.1 per-sibling PDF and QA reattachment nodes should preserve the current item context, avoid collapsing every branch onto sibling 0, and merge the interior branch back into the QA branch without nulling direct PDF URLs',
);

console.log(
  JSON.stringify(
    {
      success: true,
      bookId: config.bookId,
      version: config.version,
      standardPageCount: standardPlan.expectedPageCount,
      amazonPageCount: amazonPlan.expectedPageCount,
      standardManifestKey: standardManifest.artifacts.manifestKey,
      amazonManifestKey: amazonManifest.artifacts.manifestKey,
      recoveryV2ManifestKey: recoveryV2.manifestKey,
      recoveryV3ManifestKey: recoveryV3.manifestKey,
      normalizedFixtureOrderId: normalizedLegacyFixture.orderId,
      requiredPoseSource: twoBManifestSnapshot.requiredPoseSource,
      w3WorkflowChecked: true,
      w4WorkflowChecked: true,
      repoCentricW4WorkflowChecked: true,
      repoCentricW41WorkflowChecked: true,
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
