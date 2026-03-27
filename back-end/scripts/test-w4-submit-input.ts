#!/usr/bin/env tsx

import { buildW4SubmitInputResponse } from '@/app/api/internal/w4/build-submit-input/route';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createBaseInput(): JsonRecord {
  return {
    orderId: 'W4-SANDBOX-PROOF-001',
    amazonOrderId: null,
    rootOrderId: 'W4-SANDBOX-PROOF-001',
    backendUrl: 'https://admin.littleherolabs.com',
    title: 'Ada and the Quiet Trail',
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
    pdfR2Key: 'book-mvp-simple-adventure/orders/W4-SANDBOX-PROOF-001/interior_W4-SANDBOX-PROOF-001.pdf',
    coverPdfR2Key: 'book-mvp-simple-adventure/orders/W4-SANDBOX-PROOF-001/cover_W4-SANDBOX-PROOF-001.pdf',
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
      response.guard.reason === 'sandbox',
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
  console.log('W4 submit input tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
