#!/usr/bin/env tsx

import { buildW4SubmitInputResponse } from '@/app/api/internal/w4/build-submit-input/route';
import { issueW4ProductionApprovalToken } from '@/lib/w4-production-approval';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createBaseInput(orderId = 'W4-SANDBOX-PROOF-001'): JsonRecord {
  return {
    orderId,
    amazonOrderId: null,
    rootOrderId: orderId,
    backendUrl: 'https://admin.littleherolabs.com',
    title: 'Ada and the Quiet Trail',
    expectedPageCount: 17,
    customer: {
      email: 'parent@example.com',
      name: 'Parent Example',
    },
    shippingAddress: {
      name: 'Parent Example',
      address_line_1: '123 Main Street',
      city: 'Seattle',
      state_code: 'WA',
      postcode: '98101',
      country_code: 'US',
      phone_number: '+1-206-555-0100',
      email: 'parent@example.com',
    },
    pdfR2Key: `book-mvp-simple-adventure/orders/${orderId}/interior_${orderId}.pdf`,
    coverPdfR2Key: `book-mvp-simple-adventure/orders/${orderId}/cover_${orderId}.pdf`,
    CONFIG: {
      defaults: {
        quantity: 1,
        podPackageId: '0850X0850FCPRESS080CW444MXX',
        trimIn: {
          w: 8.5,
          h: 8.5,
        },
        print: {
          color: 'premium-color',
          stock: '80#-text',
          binding: 'saddle-stitch',
          coverFinish: 'matte',
        },
      },
    },
  };
}

function createReadyProductionOrder(orderId: string): JsonRecord {
  return {
    orderId,
    root_order_id: orderId,
    workflow_step: 'print_fulfillment',
    execution_status: 'processing',
    status: 'pending_print',
    next_workflow: '4',
    customer_approval_required: true,
    customer_approval_status: 'approved',
    lulu_job_id: null,
    lulu_status: null,
    print_submitted_at: null,
    shipping_address: {
      name: 'Parent Example',
      address_line_1: '123 Main Street',
      city: 'Seattle',
      state_code: 'WA',
      postcode: '98101',
      country_code: 'US',
      phone_number: '+1-206-555-0100',
    },
  };
}

function withApprovalEnv<T>(fn: () => Promise<T>): Promise<T> {
  const originalSubmitEnv = process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
  const originalApprovalSecret = process.env.W4_PRODUCTION_APPROVAL_SECRET;

  process.env.ENABLE_LULU_PRODUCTION_SUBMIT = 'true';
  process.env.W4_PRODUCTION_APPROVAL_SECRET = 'test-w4-production-approval-secret';

  return fn().finally(() => {
    if (originalSubmitEnv === undefined) {
      delete process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
    } else {
      process.env.ENABLE_LULU_PRODUCTION_SUBMIT = originalSubmitEnv;
    }

    if (originalApprovalSecret === undefined) {
      delete process.env.W4_PRODUCTION_APPROVAL_SECRET;
    } else {
      process.env.W4_PRODUCTION_APPROVAL_SECRET = originalApprovalSecret;
    }
  });
}

async function testSandboxSubmitShape(): Promise<void> {
  const signCalls: Array<{ key: string; bucket: string; expiresIn: number }> = [];
  const response = await buildW4SubmitInputResponse(createBaseInput(), {
    loadOrder: async () => ({
      orderId: 'W4-SANDBOX-PROOF-001',
      lulu_job_id: null,
      lulu_status: null,
      print_submitted_at: null,
    }),
    signObjectUrl: async (key, bucket, expiresIn) => {
      signCalls.push({ key, bucket, expiresIn });
      return `https://signed.example/${bucket}/${key}`;
    },
  });

  const lineItem = ((response.luluPayload.line_items as unknown[])?.[0] ?? {}) as JsonRecord;
  const printableNormalization = (lineItem.printable_normalization ?? {}) as JsonRecord;
  const interior = (printableNormalization.interior ?? {}) as JsonRecord;
  const cover = (printableNormalization.cover ?? {}) as JsonRecord;

  assert(
    response.success === true &&
      response.submitMode === 'sandbox' &&
      response.__skipLulu === false &&
      response.guard.reason === 'sandbox' &&
      response.productionGuard.reason === 'production_not_requested',
    'Expected W4 submit-input route to produce a sandbox-only submit contract by default',
  );
  assert(
    response.luluApiBase === 'https://api.sandbox.lulu.com' &&
      ((response.CONFIG.lulu as JsonRecord)?.apiBase === 'https://api.sandbox.lulu.com'),
    'Expected W4 submit-input route to pin Lulu API calls to sandbox only',
  );
  assert(
    typeof interior.source_url === 'string' &&
      typeof cover.source_url === 'string' &&
      interior.source_url.includes('https://signed.example/') &&
      cover.source_url.includes('https://signed.example/'),
    'Expected W4 submit-input route to build Lulu payloads from signed direct object URLs',
  );
  assert(
    signCalls.length === 2 &&
      signCalls[0]?.bucket === 'little-hero-orders' &&
      signCalls[1]?.bucket === 'little-hero-orders',
    'Expected W4 submit-input route to sign both interior and cover PDFs from the orders bucket',
  );
}

async function testProductionRequestStaysBlockedWithoutEnvGate(): Promise<void> {
  const originalEnv = process.env.ENABLE_LULU_PRODUCTION_SUBMIT;

  try {
    delete process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
    const orderId = 'REAL-W4-PILOT-001';
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput(orderId),
        allowProductionLulu: true,
      },
      {
        loadOrder: async () => createReadyProductionOrder(orderId),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'skip' &&
        response.__skipLulu === true &&
        response.guard.reason === 'production_blocked' &&
        response.productionGuard.reason === 'env_disabled' &&
        response.productionGuard.allowed === false &&
        response.luluApiBase === 'https://api.lulu.com',
      'Expected explicit W4 production requests to fail closed until the production env gate is enabled',
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
    } else {
      process.env.ENABLE_LULU_PRODUCTION_SUBMIT = originalEnv;
    }
  }
}

async function testProductionDryRunValidatesWithoutSubmit(): Promise<void> {
  const originalEnv = process.env.ENABLE_LULU_PRODUCTION_SUBMIT;

  try {
    delete process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
    const orderId = 'REAL-W4-PILOT-002';
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput(orderId),
        allowProductionLulu: true,
        productionDryRun: true,
      },
      {
        loadOrder: async () => createReadyProductionOrder(orderId),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'skip' &&
        response.__skipLulu === true &&
        response.guard.reason === 'production_dry_run' &&
        response.productionGuard.allowed === true &&
        response.productionGuard.dryRun === true &&
        response.luluStatus === 'DRY_RUN' &&
        response.luluApiBase === 'https://api.lulu.com',
      'Expected explicit W4 production dry-runs to validate payloads without sending any Lulu submit',
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
    } else {
      process.env.ENABLE_LULU_PRODUCTION_SUBMIT = originalEnv;
    }
  }
}

async function testProductionRejectsProofOrders(): Promise<void> {
  const originalEnv = process.env.ENABLE_LULU_PRODUCTION_SUBMIT;

  try {
    process.env.ENABLE_LULU_PRODUCTION_SUBMIT = 'true';
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput('W4-PROD-PROOF-010'),
        allowProductionLulu: true,
      },
      {
        loadOrder: async () => createReadyProductionOrder('W4-PROD-PROOF-010'),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'skip' &&
        response.guard.reason === 'production_blocked' &&
        response.productionGuard.reason === 'proof_order' &&
        response.productionGuard.allowed === false,
      'Expected proof-marked W4 orders to be rejected before any production Lulu submit can happen',
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
    } else {
      process.env.ENABLE_LULU_PRODUCTION_SUBMIT = originalEnv;
    }
  }
}

async function testProductionSubmitShapeWhenGateEnabled(): Promise<void> {
  await withApprovalEnv(async () => {
    const orderId = 'REAL-W4-PILOT-003';
    const approval = issueW4ProductionApprovalToken({
      orderId,
      approvedBy: 'test-suite',
    });
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput(orderId),
        allowProductionLulu: true,
        productionApprovalToken: approval.token,
      },
      {
        loadOrder: async () => createReadyProductionOrder(orderId),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'production' &&
        response.__skipLulu === false &&
        response.guard.reason === 'production' &&
        response.productionGuard.allowed === true &&
        response.productionGuard.reason === 'production_ready' &&
        response.luluApiBase === 'https://api.lulu.com' &&
        ((response.CONFIG.lulu as JsonRecord)?.apiBase === 'https://api.lulu.com'),
      'Expected explicit W4 production requests to emit a real production submit contract only when every repo-side guard passes',
    );
  });
}

async function testProductionRequiresApprovalToken(): Promise<void> {
  await withApprovalEnv(async () => {
    const orderId = 'REAL-W4-PILOT-003A';
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput(orderId),
        allowProductionLulu: true,
      },
      {
        loadOrder: async () => createReadyProductionOrder(orderId),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'skip' &&
        response.__skipLulu === true &&
        response.guard.reason === 'production_blocked' &&
        response.productionGuard.reason === 'approval_missing' &&
        response.productionGuard.allowed === false,
      'Expected real W4 production submit shaping to stay blocked until an explicit approval token is provided',
    );
  });
}

async function testProductionRequiresRealShippingPhone(): Promise<void> {
  const originalEnv = process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
  const baseInput = createBaseInput('REAL-W4-PILOT-004');
  const shippingAddress = { ...(baseInput.shippingAddress as JsonRecord) };
  delete shippingAddress.phone_number;
  delete shippingAddress.phone;
  delete shippingAddress.phoneNumber;

  try {
    process.env.ENABLE_LULU_PRODUCTION_SUBMIT = 'true';
    const response = await buildW4SubmitInputResponse(
      {
        ...baseInput,
        shippingAddress,
        allowProductionLulu: true,
      },
      {
        loadOrder: async () => ({
          ...createReadyProductionOrder('REAL-W4-PILOT-004'),
          shipping_address: {
            ...(createReadyProductionOrder('REAL-W4-PILOT-004').shipping_address as JsonRecord),
            phone_number: null,
          },
        }),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'skip' &&
        response.guard.reason === 'production_blocked' &&
        response.productionGuard.reason === 'shipping_address_invalid' &&
        Array.isArray(response.productionGuard.missingShippingFields) &&
        response.productionGuard.missingShippingFields.includes('phone_number'),
      'Expected W4 production submit shaping to fail closed instead of inventing a fallback phone number',
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_LULU_PRODUCTION_SUBMIT;
    } else {
      process.env.ENABLE_LULU_PRODUCTION_SUBMIT = originalEnv;
    }
  }
}

async function testProductionBlocksInvalidInteriorPageCount(): Promise<void> {
  await withApprovalEnv(async () => {
    const orderId = 'REAL-W4-PILOT-005';
    const approval = issueW4ProductionApprovalToken({
      orderId,
      approvedBy: 'test-suite',
    });
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput(orderId),
        expectedPageCount: 2,
        pageLabels: ['p00', 'p01'],
        allowProductionLulu: true,
        productionApprovalToken: approval.token,
      },
      {
        loadOrder: async () => createReadyProductionOrder(orderId),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'skip' &&
        response.__skipLulu === true &&
        response.guard.reason === 'production_blocked' &&
        response.productionGuard.reason === 'page_count_invalid' &&
        response.productionGuard.expectedPageCount === 2 &&
        response.productionGuard.minAllowedPages === 4 &&
        response.productionGuard.maxAllowedPages === 48 &&
        response.productionGuard.requiredMultipleOf === null,
      'Expected W4 production submit shaping to fail closed when the interior page count is outside the Lulu product range',
    );
  });
}

async function testProductionHonorsRecommendedAddressOverride(): Promise<void> {
  await withApprovalEnv(async () => {
    const orderId = 'REAL-W4-PILOT-006';
    const approval = issueW4ProductionApprovalToken({
      orderId,
      approvedBy: 'test-suite',
    });
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput(orderId),
        allowProductionLulu: true,
        productionApprovalToken: approval.token,
        shippingAddressRecommended: {
          name: 'Sibling Parent',
          address_line_1: '123 SW Main Street',
          city: 'Portland',
          state_code: 'OR',
          postcode: '97204',
          country_code: 'US',
          phone_number: '+1-503-555-0101',
        },
      },
      {
        loadOrder: async () => createReadyProductionOrder(orderId),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    const shippingAddress = response.shippingAddress as JsonRecord;
    const luluShipping = response.luluPayload.shipping_address as JsonRecord;

    assert(
      response.submitMode === 'production' &&
        shippingAddress.street1 === '123 SW Main St' &&
        luluShipping.street1 === '123 SW Main St' &&
        shippingAddress.city === 'Portland' &&
        shippingAddress.state_code === 'OR',
      'Expected W4 production submit shaping to honor an explicit recommended-address override for the next paid pilot',
    );
  });
}

async function testProductionMapsAmazonStandardShippingToMail(): Promise<void> {
  await withApprovalEnv(async () => {
    const orderId = 'REAL-W4-PILOT-006A';
    const approval = issueW4ProductionApprovalToken({
      orderId,
      approvedBy: 'test-suite',
    });
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput(orderId),
        allowProductionLulu: true,
        productionApprovalToken: approval.token,
        amazon_shipment_service_level: 'STANDARD',
        ShipmentServiceLevelCategory: 'Standard',
        ShipServiceLevel: 'Standard',
      },
      {
        loadOrder: async () => createReadyProductionOrder(orderId),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'production' &&
        response.shippingLevelSent === 'MAIL' &&
        response.shippingTierResolved === 'MAIL' &&
        response.shippingTierResolvedReason === 'amazon',
      'Expected W4 production submit shaping to map Amazon standard shipping to Lulu MAIL instead of unsupported GROUND',
    );
  });
}

async function testProductionPreservesExplicitGroundShipping(): Promise<void> {
  await withApprovalEnv(async () => {
    const orderId = 'REAL-W4-PILOT-006B';
    const approval = issueW4ProductionApprovalToken({
      orderId,
      approvedBy: 'test-suite',
    });
    const response = await buildW4SubmitInputResponse(
      {
        ...createBaseInput(orderId),
        allowProductionLulu: true,
        productionApprovalToken: approval.token,
        amazon_shipment_service_level: 'GROUND_HOME',
      },
      {
        loadOrder: async () => createReadyProductionOrder(orderId),
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      },
    );

    assert(
      response.submitMode === 'production' &&
        response.shippingLevelSent === 'GROUND' &&
        response.shippingTierResolved === 'GROUND' &&
        response.shippingTierResolvedReason === 'amazon',
      'Expected W4 production submit shaping to preserve explicit ground shipping requests when the source order really asks for ground',
    );
  });
}

async function testExistingJobSkipsLulu(): Promise<void> {
  const response = await buildW4SubmitInputResponse(createBaseInput(), {
    loadOrder: async () => ({
      orderId: 'W4-SANDBOX-PROOF-001',
      lulu_job_id: 'prod-job-existing-123',
      lulu_status: 'SUBMITTED',
      print_submitted_at: '2026-03-27T09:15:00.000Z',
    }),
    signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
  });

  assert(
    response.submitMode === 'skip' &&
      response.__skipLulu === true &&
      response.guard.reason === 'existing_job' &&
      response.luluJobId === 'prod-job-existing-123',
    'Expected W4 submit-input route to short-circuit when the order already has a Lulu job recorded',
  );
}

async function testTestModeSkipsLulu(): Promise<void> {
  const response = await buildW4SubmitInputResponse(
    {
      ...createBaseInput(),
      CONFIG: {
        defaults: {
          ...(createBaseInput().CONFIG as JsonRecord).defaults,
          testMode: true,
        },
      },
    },
    {
      loadOrder: async () => ({
        orderId: 'W4-SANDBOX-PROOF-001',
        lulu_job_id: null,
        lulu_status: null,
        print_submitted_at: null,
      }),
      signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
    },
  );

  assert(
    response.submitMode === 'skip' &&
      response.__skipLulu === true &&
      response.guard.reason === 'test_mode' &&
      response.luluStatus === 'TEST_MODE',
    'Expected W4 submit-input route to expose a test-mode skip contract without any real Lulu submit',
  );
}

async function testSandboxFallbackPhonePreventsProofFailure(): Promise<void> {
  const baseInput = createBaseInput();
  const shippingAddress = { ...(baseInput.shippingAddress as JsonRecord) };
  delete shippingAddress.phone_number;
  delete shippingAddress.phone;
  delete shippingAddress.phoneNumber;

  const response = await buildW4SubmitInputResponse(
    {
      ...baseInput,
      shippingAddress,
    },
    {
      loadOrder: async () => ({
        orderId: 'W4-SANDBOX-PROOF-001',
        lulu_job_id: null,
        lulu_status: null,
        print_submitted_at: null,
      }),
      signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
    },
  );

  const shipping = response.shippingAddress as JsonRecord;
  assert(
    response.submitMode === 'sandbox' &&
      response.__skipLulu === false &&
      shipping.phone_number === '555-555-5555',
    'Expected sandbox W4 submit-input proofing to inject a non-production fallback phone instead of failing before Lulu sandbox submit',
  );
}

async function main(): Promise<void> {
  await testSandboxSubmitShape();
  await testExistingJobSkipsLulu();
  await testTestModeSkipsLulu();
  await testSandboxFallbackPhonePreventsProofFailure();
  await testProductionRequestStaysBlockedWithoutEnvGate();
  await testProductionDryRunValidatesWithoutSubmit();
  await testProductionRejectsProofOrders();
  await testProductionRequiresApprovalToken();
  await testProductionSubmitShapeWhenGateEnabled();
  await testProductionRequiresRealShippingPhone();
  await testProductionBlocksInvalidInteriorPageCount();
  await testProductionHonorsRecommendedAddressOverride();
  await testProductionMapsAmazonStandardShippingToMail();
  await testProductionPreservesExplicitGroundShipping();
  console.log('W4 submit input tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
