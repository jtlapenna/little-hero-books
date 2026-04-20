#!/usr/bin/env tsx

import { buildW0RunManifest } from '@/lib/books';
import {
  buildManifestKeyFromOrderPrefix,
  buildOrderPrefix,
  buildPreviewImageAssetKey,
} from '@/lib/order-paths';
import { buildW4PrintInput } from '@/lib/books/w4-print-input';
import { buildW4PrintInputResponse } from '@/app/api/internal/w4/build-print-input/route';
import { buildW4SubmitInputResponse } from '@/app/api/internal/w4/build-submit-input/route';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function defaultPageLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    return `p${String(index).padStart(2, '0')}`;
  });
}

function createThreeManifest(options: {
  orderId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  characterHash: string;
  orderPrefix: string;
  bookId?: string;
  formatId: 'standard' | 'amazon';
  pageLabels?: string[];
  includeFirstPageAlias?: boolean;
  omitFirstPage?: boolean;
}): JsonRecord {
  const labels =
    options.pageLabels ??
    defaultPageLabels(options.formatId === 'amazon' ? 17 : 15);

  const pages = labels.reduce<JsonRecord>((acc, label, index) => {
    if (index === 0 && options.omitFirstPage) {
      return acc;
    }

    acc[label] = buildPreviewImageAssetKey(options.orderPrefix, label);
    return acc;
  }, {});

  if (options.includeFirstPageAlias && pages.p00) {
    pages.p00_dedication = pages.p00;
  }

  const pagesWithCloudflare = labels.reduce<JsonRecord>((acc, label, index) => {
    if (index === 0 && options.omitFirstPage) {
      return acc;
    }

    acc[label] = {
      cloudflareImageId: `${options.orderId}-${label}`,
      cloudflareImageUrl: `https://imagedelivery.net/test/${options.orderId}-${label}/public`,
    };
    return acc;
  }, {});

  if (options.includeFirstPageAlias && pagesWithCloudflare.p00) {
    pagesWithCloudflare.p00_dedication = pagesWithCloudflare.p00;
  }

  return {
    schema: 'lhb.run-manifest@v2.0',
    stage: '3-book-assembly',
    orderId: options.orderId,
    rootOrderId: options.rootOrderId ?? options.orderId,
    amazonOrderId: options.amazonOrderId ?? null,
    characterHash: options.characterHash,
    bookId: options.bookId ?? 'book-mvp-simple-adventure',
    formatId: options.formatId,
    generatedAt: '2026-03-23T23:11:21.000Z',
    runStamp: '2026-03-23T23:11:21.000Z',
    orderR2BaseKey: options.orderPrefix,
    pageLabels: [],
    pagePlan: [],
    pages,
    pngGeneration: {
      pages,
      pagesWithCloudflare,
      coverSpreadImage: `${options.orderPrefix}/preview-images/cover-spread.png`,
      coverCloudflareImageUrl: `https://imagedelivery.net/test/${options.orderId}-cover/public`,
    },
    pdfGeneration: {
      coverPdf: null,
    },
    summary: {
      percentComplete: 100,
      readyForBook: true,
      needsHumanReview: true,
    },
  };
}

async function main(): Promise<void> {
  const backendUrl = 'https://admin.littleherolabs.com';
  const bookId = 'book-mvp-simple-adventure';

  const amazonOrderId = '111-2222222-3333333';
  const siblingOrderId = 'TEST-W4-ITEM-001';
  const siblingOrderPrefix = buildOrderPrefix(siblingOrderId, bookId);
  const siblingOneManifestKey = buildManifestKeyFromOrderPrefix(siblingOrderPrefix, '1');
  const siblingThreeManifestKey = buildManifestKeyFromOrderPrefix(siblingOrderPrefix, '3');
  const siblingOneManifest = buildW0RunManifest({
    orderId: siblingOrderId,
    rootOrderId: amazonOrderId,
    amazonOrderId,
    platform: 'amazon',
    bookId,
    formatId: 'amazon',
    characterHash: 'w4charhash123456',
    input: {
      characterSpecs: {
        childName: 'Ada',
      },
      bookSpecs: {
        title: 'Ada and the Quiet Trail',
      },
      orderDetails: {
        quantity: 1,
      },
      dedicationText: 'For Ada',
    },
  });
  const siblingThreeManifest = createThreeManifest({
    orderId: siblingOrderId,
    rootOrderId: amazonOrderId,
    amazonOrderId,
    characterHash: 'w4charhash123456',
    orderPrefix: siblingOrderPrefix,
    formatId: 'amazon',
    includeFirstPageAlias: true,
  });
  const siblingOrderRow = {
    id: 101,
    orderId: siblingOrderId,
    root_order_id: amazonOrderId,
    amazon_order_id: amazonOrderId,
    character_hash: 'w4charhash123456',
    customer_email: 'parent@example.com',
    customer_name: 'Parent Example',
    shipping_address: {
      address: '123 Main Street',
      city: 'Seattle',
      state: 'WA',
      zip: '98101',
      country: 'US',
      phone: '+1-206-555-0100',
      name: 'Parent Example',
    },
    shipping_tier: 'priority',
    amazon_shipment_service_level: 'Expedited',
    project: 'book-mvp-simple-adventure',
    product_info: {
      title: 'Order Product Title',
    },
    status: 'pending_print',
  };

  const amazonLoadManifest = async (manifestKey: string) => {
    if (manifestKey === siblingOneManifestKey) {
      return siblingOneManifest;
    }
    if (manifestKey === siblingThreeManifestKey) {
      return siblingThreeManifest;
    }
    return null;
  };
  const amazonLoadOrder = async (orderId: string) => {
    return [siblingOrderId, amazonOrderId].includes(orderId) ? siblingOrderRow : null;
  };

  const amazonBuilt = await buildW4PrintInput(
    {
      orderId: siblingOrderId,
      rootOrderId: amazonOrderId,
      amazonOrderId,
      workflow: '4',
      manifest3Key: siblingThreeManifestKey,
      backendUrl,
    },
    {
      loadManifest: amazonLoadManifest,
      loadOrder: amazonLoadOrder,
    },
  );

  assert(
    amazonBuilt.orderId === siblingOrderId &&
      amazonBuilt.rootOrderId === amazonOrderId &&
      amazonBuilt.amazonOrderId === amazonOrderId,
    'Expected W4 input to preserve per-book, root, and amazon identifiers',
  );
  assert(
    amazonBuilt.orderPrefix === siblingOrderPrefix &&
      amazonBuilt.manifest4Key ===
        'book-mvp-simple-adventure/orders/TEST-W4-ITEM-001/manifests/4-manifest.json',
    'Expected W4 input to derive canonical order and 4-manifest paths',
  );
  assert(
    amazonBuilt.expectedPageCount === 17 &&
      amazonBuilt.pageLabels.length === 17 &&
      amazonBuilt.pageLabels[0] === 'p00' &&
      amazonBuilt.pageLabels[16] === 'p16',
    'Expected amazon W4 input to resolve the full 17-page set',
  );
  assert(
    amazonBuilt.pagePreviewImageKeys[0] ===
        'book-mvp-simple-adventure/orders/TEST-W4-ITEM-001/preview-images/p00.png' &&
      amazonBuilt.pagePreviewImageKeys[16] ===
        'book-mvp-simple-adventure/orders/TEST-W4-ITEM-001/preview-images/p16.png',
    'Expected W4 input to expose canonical preview image keys',
  );
  assert(
    amazonBuilt.coverPreviewImageKey ===
      'book-mvp-simple-adventure/orders/TEST-W4-ITEM-001/preview-images/cover-spread.png',
    'Expected W4 input to expose the canonical cover preview key',
  );
  assert(
    amazonBuilt.pageImageUrls[0]?.includes(
      '/api/assets/book-mvp-simple-adventure/orders/TEST-W4-ITEM-001/preview-images/p00.png',
    ) &&
      amazonBuilt.coverPreviewUrl.includes(
        '/api/assets/book-mvp-simple-adventure/orders/TEST-W4-ITEM-001/preview-images/cover-spread.png',
      ),
    'Expected W4 input to build absolute preview asset URLs',
  );
  assert(
    amazonBuilt.shippingAddress.address_line_1 === '123 Main Street' &&
      amazonBuilt.shippingAddress.state_code === 'WA' &&
      amazonBuilt.customer.email === 'parent@example.com' &&
      amazonBuilt.title === 'Order Product Title',
    'Expected W4 input to normalize shipping, customer, and title from order context',
  );
  assert(
    amazonBuilt.ShipmentServiceLevelCategory === 'Expedited' &&
      amazonBuilt.shipping_tier === 'priority',
    'Expected W4 input to preserve shipping audit fields',
  );

  const wrappedAmazonResponse = await buildW4PrintInputResponse(
    {
      body: {
        orderId: siblingOrderId,
        rootOrderId: amazonOrderId,
        amazonOrderId,
        manifest3Key: siblingThreeManifestKey,
        backendUrl,
      },
      CONFIG: {
        defaults: {
          shippingLevel: 'STANDARD',
        },
      },
    },
    {
      loadManifest: amazonLoadManifest,
      loadOrder: amazonLoadOrder,
      lookupOrderRow: async () => null,
      instrumentPrintJob: async () => ({
        workflowJobId: 401,
        workflowJobIdempotencyKey:
          'wf:4:w4-print-fulfillment:TEST-W4-ITEM-001:print:2026-03-27T09:00:00.000Z:test',
        workflowJobStatus: 'running',
        workflowAttemptId: 901,
        workflowAttempt: 1,
        workflowClaimed: true,
        workflowSkipped: false,
        workflowSkipReason: null,
      }),
    },
  );

  assert(
    wrappedAmazonResponse.success === true &&
      wrappedAmazonResponse.CONFIG?.defaults?.shippingLevel === 'STANDARD' &&
      wrappedAmazonResponse.manifest4Url.endsWith(wrappedAmazonResponse.manifest4Key) &&
      wrappedAmazonResponse.workflowJobId === 401 &&
      wrappedAmazonResponse.workflowAttemptId === 901 &&
      wrappedAmazonResponse.workflowSkipped === false,
    'Expected W4 route helper wrapper to preserve CONFIG and attach the durable workflow-job identity',
  );

  const liveProductionOrderId = 'ORDER-W4-LIVE-001';
  const liveProductionOrderPrefix = buildOrderPrefix(liveProductionOrderId, bookId);
  const liveProductionOneManifestKey = buildManifestKeyFromOrderPrefix(
    liveProductionOrderPrefix,
    '1',
  );
  const liveProductionThreeManifestKey = buildManifestKeyFromOrderPrefix(
    liveProductionOrderPrefix,
    '3',
  );
  const liveProductionOneManifest = buildW0RunManifest({
    orderId: liveProductionOrderId,
    rootOrderId: liveProductionOrderId,
    amazonOrderId: null,
    platform: 'd2c',
    bookId,
    formatId: 'standard',
    characterHash: 'w4prodhash001122',
    input: {
      characterSpecs: {
        childName: 'Luca',
      },
      bookSpecs: {
        title: "Luca's Inner Voice",
      },
      orderDetails: {
        quantity: 1,
      },
      dedicationText: 'For Luca',
    },
  });
  const liveProductionThreeManifest = createThreeManifest({
    orderId: liveProductionOrderId,
    characterHash: 'w4prodhash001122',
    orderPrefix: liveProductionOrderPrefix,
    formatId: 'standard',
    includeFirstPageAlias: true,
  });
  const liveProductionOrderRow = {
    id: 111,
    orderId: liveProductionOrderId,
    root_order_id: liveProductionOrderId,
    amazon_order_id: null,
    character_hash: 'w4prodhash001122',
    customer_email: 'live-parent@example.com',
    customer_name: 'Live Parent',
    shipping_address: {
      address: '789 Production Lane',
      city: 'Sacramento',
      state: 'CA',
      zip: '95814',
      country: 'US',
      phone: '+1-916-555-0100',
      name: 'Live Parent',
    },
    shipping_tier: 'mail',
    status: 'queued_for_processing',
  };
  const liveProductionLoadManifest = async (manifestKey: string) => {
    if (manifestKey === liveProductionOneManifestKey) {
      return liveProductionOneManifest;
    }
    if (manifestKey === liveProductionThreeManifestKey) {
      return liveProductionThreeManifest;
    }
    return null;
  };
  const liveProductionLoadOrder = async (orderId: string) => {
    return orderId === liveProductionOrderId ? liveProductionOrderRow : null;
  };

  const originalApprovalSecret = process.env.W4_PRODUCTION_APPROVAL_SECRET;
  process.env.W4_PRODUCTION_APPROVAL_SECRET = 'test-w4-build-print-input-auto-approval-secret';
  try {
    const autoProductionResponse = await buildW4PrintInputResponse(
      {
        body: {
          orderId: liveProductionOrderId,
          manifest3Key: liveProductionThreeManifestKey,
          backendUrl,
        },
      },
      {
        loadManifest: liveProductionLoadManifest,
        loadOrder: liveProductionLoadOrder,
        lookupOrderRow: async () => ({
          orderId: liveProductionOrderId,
          workflow_step: 'customer_approval',
          execution_status: 'ready_for_processing',
          status: 'queued_for_processing',
          next_workflow: '4',
          customer_approval_required: true,
          customer_approval_status: 'approved',
          lulu_job_id: null,
          lulu_status: null,
          print_submitted_at: null,
        }),
        instrumentPrintJob: async () => ({
          workflowJobId: 402,
          workflowJobIdempotencyKey:
            'wf:4:w4-print-fulfillment:ORDER-W4-LIVE-001:print:2026-03-27T09:00:01.000Z:test',
          workflowJobStatus: 'running',
          workflowAttemptId: 902,
          workflowAttempt: 1,
          workflowClaimed: true,
          workflowSkipped: false,
          workflowSkipReason: null,
        }),
      },
    );

    const autoProductionSubmit = await buildW4SubmitInputResponse(autoProductionResponse, {
      loadOrder: async () => ({
        ...liveProductionOrderRow,
        workflow_step: 'customer_approval',
        execution_status: 'ready_for_processing',
        next_workflow: '4',
        customer_approval_required: true,
        customer_approval_status: 'approved',
        lulu_job_id: null,
        lulu_status: null,
        print_submitted_at: null,
      }),
      signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
    });

    assert(
      autoProductionResponse.allowProductionLulu === true &&
        typeof autoProductionResponse.productionApprovalToken === 'string' &&
        autoProductionResponse.productionApprovalToken.length > 20 &&
        autoProductionSubmit.submitMode === 'production' &&
        autoProductionSubmit.guard.reason === 'production' &&
        autoProductionSubmit.productionGuard.reason === 'production_ready',
      'Expected trusted W4 print-input building to auto-attach production approval context for real ready-to-print orders',
    );
  } finally {
    if (originalApprovalSecret === undefined) {
      delete process.env.W4_PRODUCTION_APPROVAL_SECRET;
    } else {
      process.env.W4_PRODUCTION_APPROVAL_SECRET = originalApprovalSecret;
    }
  }

  const skippedAmazonResponse = await buildW4PrintInputResponse(
    {
      orderId: siblingOrderId,
      rootOrderId: amazonOrderId,
      amazonOrderId,
      manifest3Key: siblingThreeManifestKey,
      backendUrl,
    },
    {
      loadManifest: amazonLoadManifest,
      loadOrder: amazonLoadOrder,
      lookupOrderRow: async () => ({
        orderId: siblingOrderId,
        workflow_step: 'print_fulfillment',
        execution_status: 'done',
        status: 'pending_print',
        lulu_job_id: 'sandbox-job-123',
      }),
      instrumentPrintJob: async () => {
        throw new Error('should not instrument W4 job when replay guard skips a completed print stage');
      },
    },
  );

  assert(
    skippedAmazonResponse.workflowJobId === null &&
      skippedAmazonResponse.workflowSkipped === true &&
      skippedAmazonResponse.workflowSkipReason === 'w4-order-already-submitted',
    'Expected W4 route helper wrapper to skip already-submitted orders before claiming a new workflow job',
  );

  const standardOrderId = 'TEST-W4-STANDARD-001';
  const standardOrderPrefix = buildOrderPrefix(standardOrderId, bookId);
  const standardOneManifestKey = buildManifestKeyFromOrderPrefix(standardOrderPrefix, '1');
  const standardThreeManifestKey = buildManifestKeyFromOrderPrefix(standardOrderPrefix, '3');
  const standardOneManifest = buildW0RunManifest({
    orderId: standardOrderId,
    rootOrderId: standardOrderId,
    amazonOrderId: null,
    platform: 'd2c',
    bookId,
    formatId: 'standard',
    characterHash: 'w4charhash7890ab',
    input: {
      characterSpecs: {
        childName: 'Bea',
      },
      bookSpecs: {
        title: 'Bea and the Quiet Trail',
      },
      orderDetails: {
        quantity: 1,
      },
      dedicationText: 'For Bea',
    },
  });
  const standardThreeManifest = createThreeManifest({
    orderId: standardOrderId,
    characterHash: 'w4charhash7890ab',
    orderPrefix: standardOrderPrefix,
    formatId: 'standard',
    includeFirstPageAlias: true,
  });
  const standardBuilt = await buildW4PrintInput(
    {
      body: {
        orderId: standardOrderId,
        orderPrefix: standardOrderPrefix,
        manifest3Key: standardThreeManifestKey,
        shippingAddress: {
          address_line1: '456 Direct Way',
          city: 'Portland',
          state: 'OR',
          zip: '97201',
          name: 'Direct Parent',
        },
        customer: {
          email: 'direct@example.com',
          name: 'Direct Parent',
        },
        title: 'Direct Payload Title',
        backendUrl,
      },
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === standardOneManifestKey) {
          return standardOneManifest;
        }
        if (manifestKey === standardThreeManifestKey) {
          return standardThreeManifest;
        }
        return null;
      },
    },
  );

  assert(
    standardBuilt.amazonOrderId === null &&
      standardBuilt.rootOrderId === standardOrderId &&
      standardBuilt.expectedPageCount === 15 &&
      standardBuilt.pageLabels[14] === 'p14',
    'Expected standard W4 input to keep non-amazon identity and 15-page resolution',
  );
  assert(
    standardBuilt.shippingAddress.address_line_1 === '456 Direct Way' &&
      standardBuilt.shippingAddress.state_code === 'OR' &&
      standardBuilt.customer.email === 'direct@example.com' &&
      standardBuilt.title === 'Direct Payload Title',
    'Expected direct W4 payload fields to override fallback order sources',
  );

  const cloudflareManifest3Url =
    `https://little-hero-orders.3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/` +
    `${standardThreeManifestKey}`;
  const cloudflareOneManifestUrl =
    `https://little-hero-orders.3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/` +
    `${standardOneManifestKey}`;

  const standardCloudflareHintsBuilt = await buildW4PrintInput(
    {
      orderId: standardOrderId,
      manifest_3_url: cloudflareManifest3Url,
      manifest3Url: cloudflareManifest3Url,
      backendUrl,
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === standardOneManifestKey) {
          return standardOneManifest;
        }
        if (manifestKey === standardThreeManifestKey) {
          return standardThreeManifest;
        }
        return null;
      },
      loadOrder: async (orderId) => {
        if (orderId !== standardOrderId) {
          return null;
        }
        return {
          orderId: standardOrderId,
          manifest_3_url: cloudflareManifest3Url,
          one_manifest_url: cloudflareOneManifestUrl,
        };
      },
    },
  );

  assert(
    standardCloudflareHintsBuilt.orderPrefix === standardOrderPrefix &&
      standardCloudflareHintsBuilt.manifest3Key === standardThreeManifestKey &&
      standardCloudflareHintsBuilt.manifest4Key ===
        'book-mvp-simple-adventure/orders/TEST-W4-STANDARD-001/manifests/4-manifest.json' &&
      standardCloudflareHintsBuilt.pdfR2Key ===
        'book-mvp-simple-adventure/orders/TEST-W4-STANDARD-001/interior_TEST-W4-STANDARD-001.pdf' &&
      standardCloudflareHintsBuilt.coverPdfR2Key ===
        'book-mvp-simple-adventure/orders/TEST-W4-STANDARD-001/cover_TEST-W4-STANDARD-001.pdf',
    'Expected W4 input to normalize Cloudflare storage manifest hints back to canonical R2 keys',
  );

  const standardTestModeBuilt = await buildW4PrintInput(
    {
      body: {
        orderId: standardOrderId,
        orderPrefix: standardOrderPrefix,
        manifest3Key: standardThreeManifestKey,
        shippingAddress: {
          address_line1: '456 Direct Way',
          city: 'Portland',
          state: 'OR',
          zip: '97201',
          name: 'Direct Parent',
        },
        customer: {
          email: 'direct@example.com',
          name: 'Direct Parent',
        },
        CONFIG: {
          defaults: {
            testMode: true,
          },
        },
        backendUrl,
      },
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === standardOneManifestKey) {
          return standardOneManifest;
        }
        if (manifestKey === standardThreeManifestKey) {
          return standardThreeManifest;
        }
        return null;
      },
    },
  );

  assert(
    standardTestModeBuilt.shippingAddress.phone_number === '555-555-5555' &&
      standardTestModeBuilt.shippingAddress.phone === '555-555-5555',
    'Expected W4 input to inject a test-mode fallback phone number when shipping data omits one',
  );

  const bookTwoOrderId = 'TEST-W4-BOOK2-001';
  const bookTwoOrderPrefix = buildOrderPrefix(bookTwoOrderId, 'book-2-example');
  const bookTwoOneManifestKey = buildManifestKeyFromOrderPrefix(bookTwoOrderPrefix, '1');
  const bookTwoThreeManifestKey = buildManifestKeyFromOrderPrefix(bookTwoOrderPrefix, '3');
  const bookTwoOneManifest = buildW0RunManifest({
    orderId: bookTwoOrderId,
    rootOrderId: bookTwoOrderId,
    amazonOrderId: null,
    platform: 'd2c',
    bookId: 'book-2-example',
    formatId: 'standard',
    characterHash: 'w4book2hash1234',
    input: {
      characterSpecs: {
        childName: 'Nova',
      },
      bookSpecs: {
        title: 'Nova and the Starlight Rescue',
      },
      orderDetails: {
        quantity: 1,
      },
      dedicationText: 'For Nova',
    },
  });
  const bookTwoThreeManifest = createThreeManifest({
    orderId: bookTwoOrderId,
    characterHash: 'w4book2hash1234',
    orderPrefix: bookTwoOrderPrefix,
    bookId: 'book-2-example',
    formatId: 'standard',
    includeFirstPageAlias: true,
  });
  const bookTwoBuilt = await buildW4PrintInput(
    {
      orderId: bookTwoOrderId,
      orderPrefix: bookTwoOrderPrefix,
      manifest3Key: bookTwoThreeManifestKey,
      bookId: 'book-2-example',
      backendUrl,
    },
    {
      loadManifest: async (manifestKey) => {
        if (manifestKey === bookTwoOneManifestKey) {
          return bookTwoOneManifest;
        }
        if (manifestKey === bookTwoThreeManifestKey) {
          return bookTwoThreeManifest;
        }
        return null;
      },
    },
  );

  assert(
    bookTwoBuilt.bookId === 'book-2-example' &&
      bookTwoBuilt.orderPrefix === bookTwoOrderPrefix &&
      bookTwoBuilt.manifest4Key ===
        'book-2-example/orders/TEST-W4-BOOK2-001/manifests/4-manifest.json',
    'Expected Book 2 W4 input to stay inside the Book 2 namespace',
  );
  assert(
    bookTwoBuilt.pageLabels.length === 15 &&
      bookTwoBuilt.pagePreviewImageKeys[0] ===
        'book-2-example/orders/TEST-W4-BOOK2-001/preview-images/p00.png' &&
      bookTwoBuilt.coverPreviewImageKey ===
        'book-2-example/orders/TEST-W4-BOOK2-001/preview-images/cover-spread.png',
    'Expected Book 2 W4 input to resolve Book 2 preview assets canonically',
  );
  assert(
    bookTwoBuilt.pageImageUrls[0]?.includes(
      '/api/assets/book-2-example/orders/TEST-W4-BOOK2-001/preview-images/p00.png',
    ) &&
      bookTwoBuilt.coverPdfR2Key === 'book-2-example/orders/TEST-W4-BOOK2-001/cover_TEST-W4-BOOK2-001.pdf',
    'Expected Book 2 W4 input to resolve Book 2 asset URLs and PDF targets',
  );

  let missingManifestError = '';
  try {
    await buildW4PrintInput(
      {
        orderId: 'TEST-W4-MISSING-001',
        manifest3Key: buildManifestKeyFromOrderPrefix(
          buildOrderPrefix('TEST-W4-MISSING-001', bookId),
          '3',
        ),
      },
      {
        loadManifest: async () => null,
      },
    );
  } catch (error) {
    missingManifestError = error instanceof Error ? error.message : String(error);
  }
  assert(
    missingManifestError.includes('could not load the 3-manifest'),
    'Expected W4 input to fail when the 3-manifest cannot be loaded',
  );

  const missingFirstOrderId = 'TEST-W4-MISSING-FIRST-001';
  const missingFirstOrderPrefix = buildOrderPrefix(missingFirstOrderId, bookId);
  const missingFirstOneManifestKey = buildManifestKeyFromOrderPrefix(
    missingFirstOrderPrefix,
    '1',
  );
  const missingFirstThreeManifestKey = buildManifestKeyFromOrderPrefix(
    missingFirstOrderPrefix,
    '3',
  );
  const missingFirstOneManifest = buildW0RunManifest({
    orderId: missingFirstOrderId,
    rootOrderId: missingFirstOrderId,
    amazonOrderId: null,
    platform: 'd2c',
    bookId,
    formatId: 'standard',
    characterHash: 'w4charhashmissing',
    input: {
      characterSpecs: {
        childName: 'Cid',
      },
      bookSpecs: {
        title: 'Cid and the Quiet Trail',
      },
      orderDetails: {
        quantity: 1,
      },
    },
  });
  const missingFirstThreeManifest = createThreeManifest({
    orderId: missingFirstOrderId,
    characterHash: 'w4charhashmissing',
    orderPrefix: missingFirstOrderPrefix,
    formatId: 'standard',
    omitFirstPage: true,
  });

  let missingFirstError = '';
  try {
    await buildW4PrintInput(
      {
        orderId: missingFirstOrderId,
        orderPrefix: missingFirstOrderPrefix,
        manifest3Key: missingFirstThreeManifestKey,
      },
      {
        loadManifest: async (manifestKey) => {
          if (manifestKey === missingFirstOneManifestKey) {
            return missingFirstOneManifest;
          }
          if (manifestKey === missingFirstThreeManifestKey) {
            return missingFirstThreeManifest;
          }
          return null;
        },
      },
    );
  } catch (error) {
    missingFirstError = error instanceof Error ? error.message : String(error);
  }
  assert(
    missingFirstError.includes('missing the first required page'),
    'Expected W4 input to fail when the first required preview page is missing',
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        cases: [
          'accepted minimal router payloads and loaded companion manifests/order data',
          'preserved per-book, root, and amazon identifiers for W4',
          'derived canonical manifest4 and preview asset paths under the resolved order root',
          'resolved amazon and standard page counts with normalized preview URLs',
          'normalized Cloudflare storage manifest hints back to canonical W4 R2 keys',
          'resolved Book 2 W4 paths without falling back to the Book 1 namespace',
          'normalized shipping, customer, title, and shipping audit fields',
          'applied a test-mode shipping phone fallback for disposable W4 proofs',
          'failed clearly when the 3-manifest was missing',
          'failed clearly when the first required preview page was missing',
          'route helper wrapper preserved CONFIG passthrough and durable workflow-job metadata',
          'route helper wrapper auto-attached production approval context for real ready-to-print orders',
          'route helper wrapper skipped already-submitted W4 orders without claiming a new job',
        ],
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
