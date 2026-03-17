import {
  buildBgRemovedAssetMap,
  buildReviewPoseAssignments,
  buildW0RunManifest,
  loadBundledBookConfig,
  normalizeW0Manifest,
  read2BManifestWithPoseRequirements,
  resolveReviewPageContext,
  resolvePagePlan,
  RunManifestV3,
  sync2BManifestEntries,
  validateRunManifest,
} from '@/lib/books';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildOrderIntakeManifestFromOrder } from '@/lib/w0-manifest-builder';
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
  buildManifestKeyFromOrderPrefix,
  buildPendingPoseRevisionKey,
  buildPoseReferenceAssetKey,
  buildPreviewImageAssetKey,
  extractBookIdFromPathLike,
  extractBookIdFromOrderPathLike,
  extractOrderPrefixFromPathLike,
  normalizeOrderPrefix,
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
assert(config.version === 1, 'Expected bundled Book 1 config version 1');

const standardPlan = resolvePagePlan(config, 'standard');
const amazonPlan = resolvePagePlan(config, 'amazon');

assert(standardPlan.expectedPageCount === 15, 'Standard plan should have 15 pages');
assert(amazonPlan.expectedPageCount === 17, 'Amazon plan should have 17 pages');
assert(standardPlan.pagePlan[0]?.label === 'p00', 'Standard plan should begin at p00');
assert(amazonPlan.pagePlan[16]?.label === 'p16', 'Amazon plan should end at p16');

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

assert(
  standardManifest.artifacts.manifestKey ===
    'book-mvp-simple-adventure/orders/TEST-BOOK-KERNEL-001/manifests/1-manifest.json',
  'Unexpected standard manifest key',
);
assert(
  amazonManifest.book.resolved.expectedPageCount === 17,
  'Amazon manifest should carry a 17-page resolved plan',
);

const recoveryOrder = {
  id: 42,
  orderId: 'TEST-BOOK-KERNEL-003',
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
  normalizePoseScaleRouteCode.includes('buildPoseReferenceAssetKey') &&
    normalizePoseScaleRouteCode.includes('extractBookIdFromPathLike') &&
    !normalizePoseScaleRouteCode.includes('book-mvp-simple-adventure/characters/poses/pose'),
  'Normalize-pose-scale route should derive the reference pose key from shared book-aware helpers',
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
const w4WorkflowPath = path.resolve(
  process.cwd(),
  '../docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json',
);
const validateW4InputCode = getWorkflowNodeCode(w4WorkflowPath, 'Validate & Normalize W4 Input');
const build4ManifestCode = getWorkflowNodeCode(w4WorkflowPath, 'Build 4-Manifest JSON');
const build4ErrorContextCode = getWorkflowNodeCode(w4WorkflowPath, 'Build Error Context');
const buildCoverHtmlCode = getWorkflowNodeCode(w4WorkflowPath, 'Build Cover HTML');
const qaFailedCode = getWorkflowNodeCode(w4WorkflowPath, 'QA Failed Error Handler');

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
  build4ErrorContextCode.includes('orderPrefix') &&
    build4ErrorContextCode.includes('extractOrderPrefix'),
  'W4 error handling should recover the resolved order root when persisting failure manifests',
);
assert(
  buildCoverHtmlCode.includes('orderPrefix') &&
    buildCoverHtmlCode.includes('cover-spread.png'),
  'W4 cover HTML should resolve the cover fallback from the normalized order root',
);
assert(
  qaFailedCode.includes('orderPrefix') &&
    qaFailedCode.includes('4-qa-fail-manifest.json'),
  'W4 QA failure handling should persist manifests on the resolved order root',
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
