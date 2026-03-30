#!/usr/bin/env tsx

import {
  buildW41ProductionCandidate,
  buildW41ProductionPreflight,
  inspectW41ProductionRows,
  type W41ProductionOrderRow,
} from '@/lib/w41-production-preflight';
import { headObject } from '@/lib/r2-client';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createGroupRows(
  overrides: Partial<W41ProductionOrderRow> = {},
): W41ProductionOrderRow[] {
  return [
    {
      id: 701,
      orderId: 'REAL-W41-GROUP-701-item-1',
      order_id: 'REAL-W41-GROUP-701-item-1',
      root_order_id: 'REAL-W41-GROUP-701',
      amazon_order_id: 'REAL-W41-GROUP-701',
      workflow_step: 'print_fulfillment',
      execution_status: 'processing',
      current_workflow: '4.1',
      started_at: '2026-03-30T18:00:00.000Z',
      updated_at: '2026-03-30T18:10:00.000Z',
      status: 'pending_print',
      next_workflow: '4.1',
      lulu_job_id: null,
      lulu_status: null,
      print_submitted_at: null,
      error_message: null,
      customer_approval_required: true,
      customer_approval_status: 'approved',
      manifest_3_key: 'orders/REAL-W41-GROUP-701-item-1/manifests/3-manifest.json',
      customer_email: 'sibling-parent@example.com',
      shipping_address: {
        city: 'Portland',
        state_code: 'OR',
        country_code: 'US',
        phone_number: '+1-503-555-0101',
      },
      ...overrides,
    },
    {
      id: 702,
      orderId: 'REAL-W41-GROUP-701-item-2',
      order_id: 'REAL-W41-GROUP-701-item-2',
      root_order_id: 'REAL-W41-GROUP-701',
      amazon_order_id: 'REAL-W41-GROUP-701',
      workflow_step: 'print_fulfillment',
      execution_status: 'processing',
      current_workflow: '4.1',
      started_at: '2026-03-30T18:00:00.000Z',
      updated_at: '2026-03-30T18:10:00.000Z',
      status: 'pending_print',
      next_workflow: '4.1',
      lulu_job_id: null,
      lulu_status: null,
      print_submitted_at: null,
      error_message: null,
      customer_approval_required: true,
      customer_approval_status: 'approved',
      manifest_3_key: 'orders/REAL-W41-GROUP-701-item-2/manifests/3-manifest.json',
      customer_email: 'sibling-parent@example.com',
      shipping_address: {
        city: 'Portland',
        state_code: 'OR',
        country_code: 'US',
        phone_number: '+1-503-555-0101',
      },
      ...overrides,
    },
  ];
}

async function testCandidateReadyForGroupedPreflight(): Promise<void> {
  const candidate = buildW41ProductionCandidate(
    'REAL-W41-GROUP-701',
    createGroupRows(),
  );

  assert(
    candidate.recommendedAction === 'preflight' &&
      candidate.customerApprovalPendingCount === 0 &&
      candidate.hasRealSubmission === false &&
      candidate.proofLike === false,
    'Expected an approved sibling group with no Lulu state to be ready for grouped W4.1 preflight',
  );
}

async function testProofLikeGroupIsBlocked(): Promise<void> {
  const candidate = buildW41ProductionCandidate(
    'W41-SIBLING-PROOF-701',
    createGroupRows({
      orderId: 'W41-SIBLING-PROOF-701-item-1',
      order_id: 'W41-SIBLING-PROOF-701-item-1',
      root_order_id: 'W41-SIBLING-PROOF-701',
      amazon_order_id: 'W41-SIBLING-PROOF-701',
    }),
  );

  assert(
    candidate.recommendedAction === 'none' &&
      candidate.recommendedReason === 'proof_or_non_production_group',
    'Expected proof-like sibling groups to stay outside the paid W4.1 preflight candidate set',
  );
}

async function testRealSubmissionBlocksGroupedPreflight(): Promise<void> {
  const candidate = buildW41ProductionCandidate(
    'REAL-W41-GROUP-701',
    createGroupRows({
      lulu_job_id: 'prod-job-701',
      lulu_status: 'CREATED',
      print_submitted_at: '2026-03-30T18:12:00.000Z',
    }),
  );

  assert(
    candidate.recommendedAction === 'inspect' && candidate.hasRealSubmission === true,
    'Expected grouped paid preflight to block when any sibling already has real Lulu state',
  );
}

async function testBuildGroupedPreflightSummary(): Promise<void> {
  const fakePrintInput: Parameters<typeof buildW41ProductionPreflight>[0] = {
    rootGroupId: 'REAL-W41-GROUP-701',
    rootOrderId: 'REAL-W41-GROUP-701',
    siblingCount: 2,
    orderIds: ['REAL-W41-GROUP-701-item-1', 'REAL-W41-GROUP-701-item-2'],
    siblings: [
      {
        orderId: 'REAL-W41-GROUP-701-item-1',
        childName: 'Avery',
        expectedPageCount: 17,
        pdfR2Key: 'orders/REAL-W41-GROUP-701-item-1/interior.pdf',
        coverPdfR2Key: 'orders/REAL-W41-GROUP-701-item-1/cover.pdf',
      },
      {
        orderId: 'REAL-W41-GROUP-701-item-2',
        childName: 'Blake',
        expectedPageCount: 17,
        pdfR2Key: 'orders/REAL-W41-GROUP-701-item-2/interior.pdf',
        coverPdfR2Key: 'orders/REAL-W41-GROUP-701-item-2/cover.pdf',
      },
    ],
  } as Parameters<typeof buildW41ProductionPreflight>[0];
  const fakeSubmitInput: Parameters<typeof buildW41ProductionPreflight>[1] = {
    submitMode: 'sandbox',
    luluApiBase: 'https://api.sandbox.lulu.com',
    guard: { reason: 'sandbox' },
    shippingLevelRequested: 'STANDARD',
    shippingLevelSent: 'MAIL',
    shippingTierResolvedReason: 'amazon',
    luluPayload: {
      line_items: [{}, {}],
    },
    shippingAddress: {
      city: 'Portland',
      state_code: 'OR',
      country_code: 'US',
      phone_number: '+1-503-555-0101',
    },
  } as Parameters<typeof buildW41ProductionPreflight>[1];

  const preflight = buildW41ProductionPreflight(
    fakePrintInput,
    fakeSubmitInput,
  );

  assert(
    preflight.lineItemCount === 2 &&
      preflight.childSummaries.length === 2 &&
      preflight.shippingLevelSent === 'MAIL',
    'Expected grouped W4.1 preflight summaries to carry line item count, child summaries, and normalized shipping',
  );
}

async function testInspectRowsCanMintPaidCandidateState(): Promise<void> {
  const rows = createGroupRows();
  const fakePrintInput: Parameters<typeof buildW41ProductionPreflight>[0] = {
    rootGroupId: 'REAL-W41-GROUP-701',
    rootOrderId: 'REAL-W41-GROUP-701',
    siblingCount: 2,
    orderIds: ['REAL-W41-GROUP-701-item-1', 'REAL-W41-GROUP-701-item-2'],
    siblings: [
      {
        orderId: 'REAL-W41-GROUP-701-item-1',
        childName: 'Avery',
        expectedPageCount: 17,
        pdfR2Key: 'orders/REAL-W41-GROUP-701-item-1/interior.pdf',
        coverPdfR2Key: 'orders/REAL-W41-GROUP-701-item-1/cover.pdf',
        coverPreviewImageKey: 'orders/REAL-W41-GROUP-701-item-1/cover-preview.png',
        pagePreviewImageKeys: ['orders/REAL-W41-GROUP-701-item-1/p00.png'],
      },
      {
        orderId: 'REAL-W41-GROUP-701-item-2',
        childName: 'Blake',
        expectedPageCount: 17,
        pdfR2Key: 'orders/REAL-W41-GROUP-701-item-2/interior.pdf',
        coverPdfR2Key: 'orders/REAL-W41-GROUP-701-item-2/cover.pdf',
        coverPreviewImageKey: 'orders/REAL-W41-GROUP-701-item-2/cover-preview.png',
        pagePreviewImageKeys: ['orders/REAL-W41-GROUP-701-item-2/p00.png'],
      },
    ],
  };
  const fakeSubmitInput: Parameters<typeof buildW41ProductionPreflight>[1] = {
    submitMode: 'sandbox',
    luluApiBase: 'https://api.sandbox.lulu.com',
    guard: { reason: 'sandbox' },
    shippingLevelRequested: 'STANDARD',
    shippingLevelSent: 'MAIL',
    shippingTierResolvedReason: 'amazon',
    luluPayload: {
      line_items: [{}, {}],
    },
    shippingAddress: {
      city: 'Portland',
      state_code: 'OR',
      country_code: 'US',
      phone_number: '+1-503-555-0101',
    },
  };

  const inspection = await inspectW41ProductionRows(
    'REAL-W41-GROUP-701',
    rows,
    'root_order_id',
    {
      adminBaseUrl: 'https://admin.littleherolabs.com',
      dependencies: {
        buildPrintInput: async () => fakePrintInput,
        buildSubmitInput: async () => fakeSubmitInput,
        headObject: async () =>
          ({ ok: true } as Awaited<ReturnType<typeof headObject>>),
      },
    },
  );

  assert(
    inspection.safeForProductionPilot === true &&
      inspection.preflight?.childSummaries.length === 2 &&
      inspection.preflight?.guard.reason === 'sandbox',
    'Expected grouped W4.1 inspection to mark a fully ready sibling group safe for later paid approval token minting',
  );
}

async function main(): Promise<void> {
  await testCandidateReadyForGroupedPreflight();
  await testProofLikeGroupIsBlocked();
  await testRealSubmissionBlocksGroupedPreflight();
  await testBuildGroupedPreflightSummary();
  await testInspectRowsCanMintPaidCandidateState();
  console.log('W4.1 production preflight tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
