#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildW0RunManifest } from '@/lib/books';
import {
  buildOrderPrefix,
  buildManifestKeyFromOrderPrefix,
  buildPreviewImageAssetKey,
} from '@/lib/order-paths';
import {
  buildW4SiblingPrintInput,
  buildW4SiblingSubmitInput,
} from '@/lib/books/w4-sibling-print-input';
import { buildW4SiblingPrintInputResponse } from '@/app/api/internal/w4/build-sibling-print-input/route';
import { buildW4SiblingSubmitInputResponse } from '@/app/api/internal/w4/build-sibling-submit-input/route';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrows(fn: () => Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
  return fn()
    .then(() => {
      throw new Error(message);
    })
    .catch((error) => {
      const text = error instanceof Error ? error.message : String(error);
      if (!pattern.test(text)) {
        throw new Error(`${message}: received "${text}"`);
      }
    });
}

function defaultPageLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    return `p${String(index).padStart(2, '0')}`;
  });
}

function createThreeManifest(options: {
  orderId: string;
  rootOrderId: string;
  amazonOrderId: string | null;
  characterHash: string;
  orderPrefix: string;
  bookId: string;
  formatId: 'standard' | 'amazon';
  title: string;
  childName: string;
  omitFirstPage?: boolean;
}): JsonRecord {
  const labels = defaultPageLabels(options.formatId === 'amazon' ? 17 : 15);

  const pages = labels.reduce<JsonRecord>((acc, label, index) => {
    if (index === 0 && options.omitFirstPage) {
      return acc;
    }

    acc[label] = buildPreviewImageAssetKey(options.orderPrefix, label);
    return acc;
  }, {});

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

  return {
    schema: 'lhb.run-manifest@v2.0',
    stage: '3-book-assembly',
    orderId: options.orderId,
    rootOrderId: options.rootOrderId,
    amazonOrderId: options.amazonOrderId,
    characterHash: options.characterHash,
    bookId: options.bookId,
    formatId: options.formatId,
    generatedAt: '2026-03-24T14:00:00.000Z',
    runStamp: '2026-03-24T14:00:00.000Z',
    orderR2BaseKey: options.orderPrefix,
    pageLabels: labels,
    pagePlan: labels.map((label, index) => ({
      index,
      id: label,
      label,
      type: index === 0 ? 'title' : 'story',
      required: true,
    })),
    pages,
    pngGeneration: {
      pages,
      pagesWithCloudflare,
      coverSpreadImage: `${options.orderPrefix}/preview-images/cover-spread.png`,
      coverCloudflareImageUrl: `https://imagedelivery.net/test/${options.orderId}-cover/public`,
    },
    pdfGeneration: {},
    summary: {
      percentComplete: 100,
      readyForBook: true,
    },
    shippingAddress: {
      name: 'Sibling Parent',
      address: '123 Main Street',
      city: 'Portland',
      state: 'OR',
      zip: '97204',
      country: 'US',
      phone: '+1-503-555-0101',
      email: 'sibling-parent@example.com',
    },
    customer: {
      email: 'sibling-parent@example.com',
      name: 'Sibling Parent',
    },
    title: options.title,
    characterSpecs: {
      childName: options.childName,
    },
  };
}

function buildConfig(testMode: boolean): JsonRecord {
  return {
    backendApiToken: 'test-backend-token',
    lulu: {
      basicAuth: 'Basic test-lulu-auth',
      apiBase: 'https://api.lulu.com',
    },
    defaults: {
      testMode,
      testPhoneNumber: '+1-555-555-5555',
      quantity: 1,
      shippingLevel: 'STANDARD',
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
  };
}

function loadFixtureGroup(
  fixtureId: 'book1-amazon-sibling-group' | 'book2-standard-sibling-group' =
    'book1-amazon-sibling-group',
): {
  siblingGroup: JsonRecord[];
  rootOrderId: string;
  expected: JsonRecord;
} {
  const fixturePath = path.resolve(
    process.cwd(),
    `src/lib/books/fixtures/order-intake/${fixtureId}.json`,
  );
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    siblingGroup: JsonRecord[];
    rootOrderId: string;
    expected: JsonRecord;
  };

  return fixture;
}

function buildFixtureState(options: {
  fixtureId?: 'book1-amazon-sibling-group' | 'book2-standard-sibling-group';
  testMode?: boolean;
  inconsistentRoot?: boolean;
  omitFirstPageFor?: string | null;
  missingThreeManifestFor?: string | null;
  existingJobFor?: string | null;
} = {}) {
  const fixture = loadFixtureGroup(options.fixtureId);
  const rootOrderId = fixture.rootOrderId;
  const manifestMap = new Map<string, JsonRecord>();
  const orderMap = new Map<string, JsonRecord>();

  for (const [index, sibling] of fixture.siblingGroup.entries()) {
    const siblingInput: JsonRecord = {
      ...sibling,
      root_order_id:
        options.inconsistentRoot && index === 1
          ? '999-0000000-1111111'
          : sibling.root_order_id,
    };
    const orderId = String(sibling.orderId);
    const bookSpecs = (sibling.product_info as JsonRecord | undefined)?.bookSpecs as
      | JsonRecord
      | undefined;
    const bookId = String(bookSpecs?.bookId ?? fixture.expected.bookId ?? 'book-mvp-simple-adventure');
    const formatId = String(bookSpecs?.formatId ?? fixture.expected.formatId ?? 'amazon') as
      | 'standard'
      | 'amazon';
    const orderPrefix = buildOrderPrefix(orderId, bookId);
    const amazonOrderId =
      sibling.amazon_order_id === undefined || sibling.amazon_order_id === null
        ? null
        : String(sibling.amazon_order_id);
    const resolvedRootOrderId =
      options.inconsistentRoot && index === 1 ? '999-0000000-1111111' : rootOrderId;
    const characterHash = String(sibling.character_hash ?? `fixture-sibling-hash-${index + 1}`);
    const childName = String(
      (sibling.character_specs as JsonRecord | undefined)?.childName ?? `Child ${index + 1}`,
    );
    const title = String(
      ((sibling.product_info as JsonRecord | undefined)?.bookSpecs as JsonRecord | undefined)?.title ??
        `Fixture Title ${index + 1}`,
    );

    const oneKey = buildManifestKeyFromOrderPrefix(orderPrefix, '1');
    const threeKey = buildManifestKeyFromOrderPrefix(orderPrefix, '3');

    siblingInput.bookId = bookId;
    siblingInput.formatId = formatId;
    siblingInput.manifest3Key = threeKey;
    siblingInput.manifest_3_key = threeKey;

    const oneManifest = buildW0RunManifest({
      orderId,
      rootOrderId: resolvedRootOrderId,
      amazonOrderId,
      platform: String(sibling.platform ?? 'amazon'),
      bookId,
      formatId,
      characterHash,
      input: {
        characterSpecs: {
          childName,
        },
        bookSpecs: {
          bookId,
          title,
        },
        orderDetails: {
          quantity: 1,
          shippingAddress: (sibling.product_info as JsonRecord).shippingAddress,
        },
        dedicationText: 'For two brave adventurers',
      },
    });

    const threeManifest = createThreeManifest({
      orderId,
      rootOrderId: resolvedRootOrderId,
      amazonOrderId,
      characterHash,
      orderPrefix,
      bookId,
      formatId,
      title,
      childName,
      omitFirstPage: options.omitFirstPageFor === orderId,
    });

    manifestMap.set(oneKey, oneManifest);
    if (options.missingThreeManifestFor !== orderId) {
      manifestMap.set(threeKey, threeManifest);
    }

    const orderRow: JsonRecord = {
      ...siblingInput,
      root_order_id: resolvedRootOrderId,
      bookId,
      formatId,
      manifest3Key: threeKey,
      manifest_3_key: threeKey,
      shipping_address: (sibling.product_info as JsonRecord).shippingAddress,
      product_info: sibling.product_info,
      project: bookId,
      status: 'pending_print',
      lulu_job_id: options.existingJobFor === orderId ? 'job-existing-123' : null,
      lulu_status: options.existingJobFor === orderId ? 'CREATED' : null,
    };
    orderMap.set(orderId, orderRow);
    fixture.siblingGroup[index] = siblingInput;
  }

  const loadManifest = async (manifestKey: string) => manifestMap.get(manifestKey) ?? null;
  const loadOrder = async (orderId: string) => orderMap.get(orderId) ?? null;

  const wrappedInput: JsonRecord = {
    rootOrderId,
    siblingGroup: fixture.siblingGroup,
    backendUrl: 'https://admin.littleherolabs.com',
    CONFIG: buildConfig(Boolean(options.testMode)),
  };

  return {
    rootOrderId,
    expected: fixture.expected,
    siblingGroup: fixture.siblingGroup,
    wrappedInput,
    loadManifest,
    loadOrder,
  };
}

async function main(): Promise<void> {
  const baseState = buildFixtureState();

  const routerStyle = await buildW4SiblingPrintInput(baseState.wrappedInput, {
    loadManifest: baseState.loadManifest,
    loadOrder: baseState.loadOrder,
  });

  assert(
    routerStyle.rootGroupId === baseState.rootOrderId &&
      routerStyle.rootOrderId === baseState.rootOrderId &&
      routerStyle.siblingCount === 2,
    'Expected W4.1 print input to resolve the sibling-group root and sibling count',
  );
  assert(
    routerStyle.orderIds[0] === 'FIXTURE-BOOK1-AMAZON-SIB-001' &&
      routerStyle.orderIds[1] === 'FIXTURE-BOOK1-AMAZON-SIB-002',
    'Expected W4.1 print input to preserve stable sibling ordering',
  );
  assert(
    routerStyle.siblings.every(
      (sibling) =>
        sibling.expectedPageCount === 17 &&
        sibling.pageLabels.length === 17 &&
        sibling.orderPrefix === `book-mvp-simple-adventure/orders/${sibling.orderId}` &&
        sibling.manifest4Key ===
          `book-mvp-simple-adventure/orders/${sibling.orderId}/manifests/4-manifest.json` &&
        sibling.pdfR2Key ===
          `book-mvp-simple-adventure/orders/${sibling.orderId}/interior_${sibling.orderId}.pdf` &&
        sibling.coverPdfR2Key ===
          `book-mvp-simple-adventure/orders/${sibling.orderId}/cover_${sibling.orderId}.pdf`,
    ),
    'Expected W4.1 print input to derive canonical per-sibling paths',
  );

  const bookTwoState = buildFixtureState({
    fixtureId: 'book2-standard-sibling-group',
    testMode: true,
  });
  const bookTwoPrintInput = await buildW4SiblingPrintInput(bookTwoState.wrappedInput, {
    loadManifest: bookTwoState.loadManifest,
    loadOrder: bookTwoState.loadOrder,
  });
  assert(
    bookTwoPrintInput.rootGroupId === String(bookTwoState.expected.rootOrderId) &&
      bookTwoPrintInput.orderIds[0] === 'FIXTURE-BOOK2-SIB-001' &&
      bookTwoPrintInput.orderIds[1] === 'FIXTURE-BOOK2-SIB-002',
    'Expected Book 2 W4.1 print input to preserve the declared root group and stable sibling ordering',
  );
  assert(
    bookTwoPrintInput.siblings.every(
      (sibling) =>
        sibling.bookId === 'book-2-example' &&
        sibling.expectedPageCount === 15 &&
        sibling.orderPrefix === `book-2-example/orders/${sibling.orderId}` &&
        sibling.manifest4Key ===
          `book-2-example/orders/${sibling.orderId}/manifests/4-manifest.json` &&
        sibling.pdfR2Key ===
          `book-2-example/orders/${sibling.orderId}/interior_${sibling.orderId}.pdf` &&
        sibling.coverPdfR2Key ===
          `book-2-example/orders/${sibling.orderId}/cover_${sibling.orderId}.pdf` &&
        sibling.pageImageUrls.every((url) => url.includes('/api/assets/book-2-example/orders/')),
    ),
    'Expected Book 2 W4.1 print input to stay inside the Book 2 namespace without falling back to Book 1 paths',
  );

  const directInput = await buildW4SiblingPrintInput(baseState.siblingGroup, {
    loadManifest: baseState.loadManifest,
    loadOrder: baseState.loadOrder,
    defaultBackendUrl: 'https://admin.littleherolabs.com',
  });
  assert(
    JSON.stringify(directInput.orderIds) === JSON.stringify(routerStyle.orderIds),
    'Expected direct sibling input to resolve the same per-sibling ordering as router-style input',
  );

  const wrappedResponse = await buildW4SiblingPrintInputResponse(baseState.wrappedInput, {
    loadManifest: baseState.loadManifest,
    loadOrder: baseState.loadOrder,
    instrumentSiblingJob: async () => ({
      workflowJobId: 4401,
      workflowJobIdempotencyKey: 'wf:4.1:w4-sibling-aggregation:111-2222222-9999999:sibling-aggregation:test',
      workflowJobStatus: 'running',
      workflowAttemptId: 5401,
      workflowAttempt: 1,
      workflowClaimed: true,
      workflowSkipped: false,
      workflowSkipReason: null,
    }),
  });
  assert(
    wrappedResponse.success === true &&
      wrappedResponse.siblings[0].manifest3Url.includes('/api/manifests/') &&
      wrappedResponse.workflowJobId === 4401 &&
      wrappedResponse.workflowAttemptId === 5401 &&
      wrappedResponse.siblings.every(
        (sibling) =>
          sibling.workflowJobId === 4401 &&
          sibling.workflowAttemptId === 5401 &&
          sibling.workflowJobIdempotencyKey ===
            'wf:4.1:w4-sibling-aggregation:111-2222222-9999999:sibling-aggregation:test',
      ),
    'Expected the W4.1 print-input route helper to return a successful wrapped response',
  );

  await expectThrows(
    async () => {
      const missingManifestState = buildFixtureState({
        missingThreeManifestFor: 'FIXTURE-BOOK1-AMAZON-SIB-002',
      });
      await buildW4SiblingPrintInput(missingManifestState.wrappedInput, {
        loadManifest: missingManifestState.loadManifest,
        loadOrder: missingManifestState.loadOrder,
      });
    },
    /3-manifest|preview image|required page/i,
    'Expected W4.1 print input to fail when a sibling 3-manifest is missing',
  );

  await expectThrows(
    async () => {
      const inconsistentRootState = buildFixtureState({
        inconsistentRoot: true,
      });
      await buildW4SiblingPrintInput(inconsistentRootState.wrappedInput, {
        loadManifest: inconsistentRootState.loadManifest,
        loadOrder: inconsistentRootState.loadOrder,
      });
    },
    /inconsistent rootOrderId/i,
    'Expected W4.1 print input to reject sibling groups with inconsistent roots',
  );

  await expectThrows(
    async () => {
      const missingFirstPageState = buildFixtureState({
        omitFirstPageFor: 'FIXTURE-BOOK1-AMAZON-SIB-001',
      });
      await buildW4SiblingPrintInput(missingFirstPageState.wrappedInput, {
        loadManifest: missingFirstPageState.loadManifest,
        loadOrder: missingFirstPageState.loadOrder,
      });
    },
    /missing the first required page/i,
    'Expected W4.1 print input to reject siblings that are missing the first required preview page',
  );

  const signedKeys: string[] = [];
  const signObjectUrl = async (key: string, bucket: string, expiresIn: number) => {
    signedKeys.push(`${bucket}:${key}:${expiresIn}`);
    return `https://signed.example/${bucket}/${key}?expiresIn=${expiresIn}`;
  };

  const testModeState = buildFixtureState({
    testMode: true,
  });
  const testModePrintInput = await buildW4SiblingPrintInput(testModeState.wrappedInput, {
    loadManifest: testModeState.loadManifest,
    loadOrder: testModeState.loadOrder,
  });
  const testModeSubmit = await buildW4SiblingSubmitInput(
    {
      siblings: testModePrintInput.siblings,
      CONFIG: buildConfig(true),
    },
    {
      loadOrder: testModeState.loadOrder,
      signObjectUrl,
    },
  );
  assert(
    testModeSubmit.__skipLulu === true &&
      testModeSubmit.guard.reason === 'test_mode' &&
      testModeSubmit.submitMode === 'skip' &&
      testModeSubmit.luluApiBase === 'https://api.sandbox.lulu.com' &&
      testModeSubmit.luluJobId === `TEST-${baseState.rootOrderId}` &&
      testModeSubmit.luluStatus === 'TEST_MODE',
    'Expected W4.1 submit input to short-circuit safely in test mode',
  );
  assert(
    testModeSubmit.siblings.every(
      (sibling) =>
        sibling.interiorSignedUrl.startsWith('https://signed.example/') &&
        sibling.coverSignedUrl.startsWith('https://signed.example/'),
    ) &&
      testModeSubmit.luluPayload.line_items instanceof Array &&
      testModeSubmit.luluPayload.line_items.length === 2 &&
      testModeSubmit.shippingLevelSent === 'GROUND',
    'Expected W4.1 submit input to presign sibling PDFs and build a grouped Lulu payload',
  );

  const bookTwoSignedKeys: string[] = [];
  const bookTwoSubmit = await buildW4SiblingSubmitInput(
    {
      siblings: bookTwoPrintInput.siblings,
      CONFIG: buildConfig(true),
    },
    {
      loadOrder: bookTwoState.loadOrder,
      signObjectUrl: async (key: string, bucket: string, expiresIn: number) => {
        bookTwoSignedKeys.push(`${bucket}:${key}:${expiresIn}`);
        return `https://signed.example/${bucket}/${key}?expiresIn=${expiresIn}`;
      },
    },
  );
  assert(
    bookTwoSubmit.__skipLulu === true &&
      bookTwoSubmit.guard.reason === 'test_mode' &&
      bookTwoSubmit.siblings.every(
        (sibling) =>
          sibling.orderPrefix === `book-2-example/orders/${sibling.orderId}` &&
          sibling.interiorSignedUrl.startsWith('https://signed.example/') &&
          sibling.coverSignedUrl.startsWith('https://signed.example/'),
      ) &&
      bookTwoSignedKeys.length === 4 &&
      bookTwoSignedKeys.every((value) => value.includes('book-2-example/orders/')) &&
      bookTwoSubmit.luluPayload.line_items instanceof Array &&
      bookTwoSubmit.luluPayload.line_items.length === 2,
    'Expected Book 2 W4.1 submit input to stay on the Book 2 namespace while short-circuiting safely in test mode',
  );

  const existingJobState = buildFixtureState({
    existingJobFor: 'FIXTURE-BOOK1-AMAZON-SIB-002',
  });
  const existingJobPrintInput = await buildW4SiblingPrintInput(existingJobState.wrappedInput, {
    loadManifest: existingJobState.loadManifest,
    loadOrder: existingJobState.loadOrder,
  });
  const existingJobSubmit = await buildW4SiblingSubmitInput(
    {
      siblings: existingJobPrintInput.siblings,
      CONFIG: buildConfig(false),
    },
    {
      loadOrder: existingJobState.loadOrder,
      signObjectUrl,
    },
  );
  assert(
    existingJobSubmit.__skipLulu === true &&
      existingJobSubmit.guard.reason === 'existing_job' &&
      existingJobSubmit.submitMode === 'skip' &&
      existingJobSubmit.luluJobId === 'job-existing-123' &&
      existingJobSubmit.luluStatus === 'CREATED',
    'Expected W4.1 submit input to bypass Lulu submission when any sibling already has a Lulu job',
  );

  const proceedSubmit = await buildW4SiblingSubmitInputResponse(
    {
      siblings: routerStyle.siblings.map((sibling) => ({
        ...sibling,
        workflowJobId: 4402,
        workflowJobIdempotencyKey:
          'wf:4.1:w4-sibling-aggregation:111-2222222-9999999:sibling-aggregation:test-2',
        workflowAttemptId: 5402,
        workflowJobStatus: 'running',
      })),
      CONFIG: buildConfig(false),
    },
    {
      loadOrder: baseState.loadOrder,
      signObjectUrl,
    },
  );
  assert(
    proceedSubmit.success === true &&
      proceedSubmit.__skipLulu === false &&
      proceedSubmit.guard.reason === 'sandbox' &&
      proceedSubmit.submitMode === 'sandbox' &&
      proceedSubmit.luluApiBase === 'https://api.sandbox.lulu.com' &&
      proceedSubmit.CONFIG?.backendApiToken === 'test-backend-token' &&
      (proceedSubmit.CONFIG?.lulu as JsonRecord | undefined)?.basicAuth === 'Basic test-lulu-auth' &&
      proceedSubmit.workflowJobId === 4402 &&
      proceedSubmit.workflowAttemptId === 5402 &&
      proceedSubmit.workflowJobIdempotencyKey ===
        'wf:4.1:w4-sibling-aggregation:111-2222222-9999999:sibling-aggregation:test-2' &&
      proceedSubmit.CONFIG?.lulu?.apiBase === 'https://api.sandbox.lulu.com',
    'Expected the W4.1 submit-input route helper to return a sandbox-only response with sibling workflow metadata when no guard is triggered',
  );
  assert(
    signedKeys.filter((value) => value.includes('little-hero-orders')).length >= 4,
    'Expected W4.1 submit input to sign both interior and cover PDFs for each sibling',
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        rootOrderId: routerStyle.rootOrderId,
        siblingCount: routerStyle.siblingCount,
        orderIds: routerStyle.orderIds,
        bookTwoOrderIds: bookTwoPrintInput.orderIds,
        submitShippingLevel: testModeSubmit.shippingLevelSent,
        signedUrlCount: signedKeys.length,
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
