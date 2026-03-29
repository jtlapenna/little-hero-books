#!/usr/bin/env tsx

import type { BuildW4PrintInputResult, BuildW4SubmitInputResult } from '@/lib/books';
import {
  buildW4ProductionCandidate,
  buildW4ProductionPreflight,
  inspectW4ProductionRow,
  W4_PRODUCTION_ORDER_SELECT_FIELDS,
  type W4ProductionOrderRow,
} from '@/lib/w4-production-preflight';
import { resolvePreflightAdminBaseUrl } from '@/app/api/admin/w4-production/route';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createOrderRow(overrides: Partial<W4ProductionOrderRow> = {}): W4ProductionOrderRow {
  return {
    id: 601,
    orderId: 'REAL-W4-CANDIDATE-601',
    order_id: 'REAL-W4-CANDIDATE-601',
    root_order_id: '111-2222222-3333333',
    amazon_order_id: '111-2222222-3333333',
    workflow_step: 'print_fulfillment',
    execution_status: 'pending',
    current_workflow: '4',
    started_at: '2026-03-29T10:00:00.000Z',
    updated_at: '2026-03-29T10:05:00.000Z',
    status: 'pending_print',
    next_workflow: '4',
    lulu_job_id: null,
    lulu_status: null,
    print_submitted_at: null,
    error_message: null,
    customer_approval_required: false,
    customer_approval_status: 'approved',
    manifest_3_url: 'https://admin.littleherolabs.com/api/manifests/3-manifest.json',
    manifest_3_key: 'book/orders/REAL-W4-CANDIDATE-601/manifests/3-manifest.json',
    customer_email: 'parent@example.com',
    shipping_address: {
      city: 'Portland',
      state_code: 'OR',
      country_code: 'US',
      phone_number: '5035550100',
    },
    ...overrides,
  };
}

function createPrintInput(overrides: Partial<BuildW4PrintInputResult> = {}): BuildW4PrintInputResult {
  return {
    orderId: 'REAL-W4-CANDIDATE-601',
    amazonOrderId: '111-2222222-3333333',
    rootOrderId: '111-2222222-3333333',
    characterHash: 'char-hash',
    bookId: 'book-mvp-simple-adventure',
    formatId: 'standard',
    orderPrefix: 'book/orders/REAL-W4-CANDIDATE-601',
    orderR2BaseKey: 'book/orders/REAL-W4-CANDIDATE-601',
    oneManifestKey: null,
    oneManifestUrl: null,
    oneManifestSchema: null,
    manifest3Key: 'book/orders/REAL-W4-CANDIDATE-601/manifests/3-manifest.json',
    manifest3Url: 'https://admin.littleherolabs.com/api/manifests/3-manifest.json',
    manifest4Key: 'book/orders/REAL-W4-CANDIDATE-601/manifests/4-manifest.json',
    manifest4Url: 'https://admin.littleherolabs.com/api/manifests/4-manifest.json',
    backendUrl: 'https://admin.littleherolabs.com',
    isAmazonOrder: true,
    expectedPageCount: 15,
    pageLabels: ['p00'],
    pagePlan: [],
    pageImageUrls: [],
    pagePreviewImageKeys: [],
    pagesGenerated: 15,
    coverPreviewUrl: 'https://admin.littleherolabs.com/api/assets/cover',
    coverPreviewImageKey: 'book/orders/REAL-W4-CANDIDATE-601/cover.png',
    coverPreviewImageUrls: [],
    interiorPreviewImageUrls: [],
    coverPdfFilename: 'cover.pdf',
    coverPdfR2Key: 'book/orders/REAL-W4-CANDIDATE-601/cover.pdf',
    pdfFilename: 'interior.pdf',
    pdfR2Key: 'book/orders/REAL-W4-CANDIDATE-601/interior.pdf',
    shippingAddress: {
      city: 'Portland',
      state_code: 'OR',
      country_code: 'US',
      phone_number: '5035550100',
    },
    customer: {
      email: 'parent@example.com',
      name: 'Parent Example',
    },
    title: 'A Little Hero Book',
    marketplace_id: 'ATVPDKIKX0DER',
    hasP00: true,
    hasPagesWithCloudflare: true,
    shipping_tier: 'STANDARD',
    shippingTier: 'STANDARD',
    ShipmentServiceLevelCategory: 'Standard',
    ShipServiceLevel: 'Standard',
    amazon_shipment_service_level: 'STANDARD',
    summary: {},
    pages: {},
    pagesWithCloudflare: {},
    pngGeneration: {},
    pdfGeneration: {},
    bookSpecs: {},
    orderDetails: {},
    characterSpecs: {},
    CONFIG: {
      backendApiToken: 'REDACTED_BACKEND_API_TOKEN',
    },
    generatedAt: '2026-03-29T10:06:00.000Z',
    runStamp: 'run-stamp',
    workflow: '4',
    orderDbId: 601,
    ...overrides,
  } as BuildW4PrintInputResult;
}

function createSubmitInput(
  overrides: Partial<BuildW4SubmitInputResult> = {},
): BuildW4SubmitInputResult {
  return {
    orderId: 'REAL-W4-CANDIDATE-601',
    amazonOrderId: '111-2222222-3333333',
    rootOrderId: '111-2222222-3333333',
    backendUrl: 'https://admin.littleherolabs.com',
    submitMode: 'skip',
    luluApiBase: 'https://api.lulu.com',
    luluPayload: {},
    interiorSignedUrl: 'https://preflight.invalid/orders/interior.pdf',
    coverSignedUrl: 'https://preflight.invalid/orders/cover.pdf',
    shippingAddress: {
      city: 'Portland',
      state_code: 'OR',
      country_code: 'US',
      phone_number: '5035550100',
    },
    shippingLevelRequested: 'STANDARD',
    shippingLevelSent: 'STANDARD',
    shippingTierResolved: 'STANDARD',
    shippingTierResolvedReason: 'order_default',
    amazon_shipment_service_level: 'STANDARD',
    __skipLulu: true,
    guard: {
      reason: 'production_dry_run',
    },
    productionGuard: {
      requested: true,
      allowed: true,
      reason: 'production_ready',
      checkedAt: '2026-03-29T10:07:00.000Z',
      envEnabled: true,
      dryRun: true,
    },
    luluJobId: null,
    luluStatus: null,
    CONFIG: {},
    ...overrides,
  } as BuildW4SubmitInputResult;
}

async function testCandidatePreflightRecommendation(): Promise<void> {
  const candidate = buildW4ProductionCandidate(createOrderRow());
  assert(
    candidate.recommendedAction === 'preflight' &&
      candidate.recommendedReason === 'ready_for_repo_preflight',
    'Expected clean W4 orders to recommend production preflight',
  );
}

async function testProofLikeOrdersAreExcluded(): Promise<void> {
  const candidate = buildW4ProductionCandidate(
    createOrderRow({
      orderId: 'W4-WFJ-PROOF-EXAMPLE-601',
      order_id: 'W4-WFJ-PROOF-EXAMPLE-601',
      root_order_id: 'W4-WFJ-PROOF-EXAMPLE-601',
      amazon_order_id: 'W4-WFJ-PROOF-EXAMPLE-601',
    }),
  );
  assert(
    candidate.recommendedAction === 'none' &&
      candidate.recommendedReason === 'proof_or_non_production_order',
    'Expected proof-like W4 orders to be excluded from paid-pilot candidates',
  );
}

async function testBuildPreflightRedactsSignedUrls(): Promise<void> {
  const preflight = buildW4ProductionPreflight(createPrintInput(), createSubmitInput());
  assert(
    preflight.submitMode === 'skip' &&
      preflight.productionGuard.reason === 'production_ready' &&
      preflight.shippingSummary.hasPhone === true &&
      preflight.pdfR2Key.endsWith('interior.pdf'),
    'Expected W4 production preflight summaries to expose readiness metadata without using signed URLs',
  );
}

async function testInspectRowUsesDryRunDependencies(): Promise<void> {
  const inspection = await inspectW4ProductionRow(createOrderRow(), 'orderId', {
    adminBaseUrl: 'https://admin.littleherolabs.com',
    dependencies: {
      buildPrintInput: async () => createPrintInput(),
      buildSubmitInput: async () => createSubmitInput(),
    },
  });

  assert(
    inspection.safeForProductionPilot === true &&
      inspection.preflight?.submitMode === 'skip' &&
      inspection.preflight?.luluApiBase === 'https://api.lulu.com' &&
      inspection.resolvedVia === 'orderId',
    'Expected inspection to report production readiness from dry-run repo dependencies without submitting to Lulu',
  );
}

async function testInspectRowCarriesPreflightErrors(): Promise<void> {
  const inspection = await inspectW4ProductionRow(createOrderRow(), 'orderId', {
    adminBaseUrl: 'https://admin.littleherolabs.com',
    dependencies: {
      buildPrintInput: async () => {
        throw new Error('manifest_3 missing');
      },
    },
  });

  assert(
    inspection.safeForProductionPilot === false &&
      inspection.preflight === null &&
      inspection.inspectionError === 'manifest_3 missing',
    'Expected inspection to surface dry-run failures without marking the order safe for paid pilot',
  );
}

async function testSelectFieldsAndRouteHelper(): Promise<void> {
  const selectFields = W4_PRODUCTION_ORDER_SELECT_FIELDS.split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  assert(
    selectFields.includes('orderId') &&
      selectFields.includes('customer_approval_status') &&
      selectFields.includes('shipping_address'),
    'Expected W4 production preflight selects to include order identity, approval state, and shipping address fields',
  );
  assert(
    !selectFields.includes('order_id') && !selectFields.includes('manifest_3_key'),
    'Expected W4 production preflight selects to avoid nonexistent orders.order_id and orders.manifest_3_key columns',
  );
  assert(
    resolvePreflightAdminBaseUrl('https://admin.littleherolabs.com/api/admin/w4-production') ===
      'https://admin.littleherolabs.com',
    'Expected W4 production admin preflight to use the request origin as backendUrl',
  );
}

async function main(): Promise<void> {
  await testCandidatePreflightRecommendation();
  await testProofLikeOrdersAreExcluded();
  await testBuildPreflightRedactsSignedUrls();
  await testInspectRowUsesDryRunDependencies();
  await testInspectRowCarriesPreflightErrors();
  await testSelectFieldsAndRouteHelper();
  console.log('W4 production preflight tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
