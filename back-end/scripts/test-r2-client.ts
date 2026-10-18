#!/usr/bin/env tsx

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testStreamUploadsUseUnsignedPayload(): Promise<void> {
  process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'test-account';
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID =
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || 'test-access-key';
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY =
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || 'test-secret-key';

  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-key';
  const { putObject, getObject, r2Client } = await import('@/lib/r2-client');
  const originalFetch = globalThis.fetch;
  const originalSign = r2Client.sign.bind(r2Client);

  let signedHeader: string | null = 'missing';
  let signedContentLength: string | null = 'missing';
  let sawRequestBody = false;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.close();
    },
  });

  try {
    r2Client.sign = (async (request: Request) => {
      signedHeader = request.headers.get('x-amz-content-sha256');
      signedContentLength = request.headers.get('content-length');
      sawRequestBody = request.body !== null;
      return request;
    }) as typeof r2Client.sign;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const request = input as Request;
      assert(request.body !== null, 'Expected signed R2 PUT request to retain the stream body');
      return new Response(null, { status: 200 });
    }) as typeof globalThis.fetch;

    await putObject(
      'little-hero-orders',
      'book/orders/W4-R2-STREAM-PROOF/interior.pdf',
      stream,
      'application/pdf',
    );

    assert(sawRequestBody, 'Expected R2 signer to receive the request body for stream uploads');
    assert(
      signedHeader === null,
      'Expected stream uploads to omit an explicit x-amz-content-sha256 header so aws4fetch can use UNSIGNED-PAYLOAD',
    );
    assert(
      signedContentLength === null,
      'Expected stream uploads to omit content-length instead of buffering to compute it eagerly',
    );
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      assert((input as Request).headers.get('If-None-Match') === '*', 'Conditional manifest writes must sign and send If-None-Match');
      return new Response(null, { status: 412 });
    }) as typeof globalThis.fetch;
    const conditional = await putObject('little-hero-orders', 'book/orders/test/manifests/1-manifest.json', '{}', 'application/json', { ifNoneMatch: '*' });
    assert(conditional.status === 412, 'Conditional collision must be returned for frozen-manifest reconciliation');
    const { w0ManifestStorage } = await import('@/lib/books/w0-manifest-storage');
    globalThis.fetch = (async () => new Response('Synthetic absent object', { status: 404 })) as typeof globalThis.fetch;
    assert(await w0ManifestStorage.loadManifest('book/orders/test/manifests/1-manifest.json') === null, 'Actual W0 adapter must treat 404 as absent');
    await getObject('little-hero-orders', 'absent', { allowNotFound: true });
    let strictRejected = false;
    try { await getObject('little-hero-orders', 'absent'); } catch { strictRejected = true; }
    assert(strictRejected, 'Existing strict R2 callers must still reject missing objects');
    globalThis.fetch = (async () => new Response('Synthetic access denied', { status: 403 })) as typeof globalThis.fetch;
    let deniedRejected = false;
    try { await w0ManifestStorage.loadManifest('denied'); } catch { deniedRejected = true; }
    assert(deniedRejected, 'W0 adapter must not treat permission failures as absent');
    const { createGelatoStoredFileVerifier } = await import('@/lib/books/gelato-stored-file');
    let buffered = false;
    let canceled = false;
    let errorFetches = 0;
    const { PRINTER_FILE_ORIGIN } = await import('@/lib/printer-file-grants');
    globalThis.fetch = (async (_input: RequestInfo | URL, options?: RequestInit) => {
      errorFetches++;
      assert(options?.redirect === 'error', 'Verifier R2 fetch must reject redirects');
      assert(Boolean(options?.signal), 'Verifier R2 fetch must carry the shared deadline');
      const response = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024)); }, cancel() { canceled = true; } }), { status: 403 });
      response.text = async () => { buffered = true; throw new Error('Error body must not be buffered'); };
      return response;
    }) as typeof globalThis.fetch;
    const verifier = createGelatoStoredFileVerifier({ maxFileBytes: 1, maxOperationBytes: 2,
      loadArtifact: (key, signal) => getObject('little-hero-orders', key, { signal, redirect: 'error', allowErrorResponse: true }) });
    const key = `book/orders/child-1/gelato/print/v2/${'a'.repeat(24)}.pdf`;
    let fileRejected = false;
    try { await verifier({ child_order_key: 'child-1', artifact_key: key, artifact_fingerprint: 'a'.repeat(24), artifact_claim_token: 'token', pdf_page_count: 35 } as import('@/lib/books/gelato-submission-store').GelatoMember,
      'https://gelato-api-live.s3.eu-west-1.amazonaws.com/synthetic.pdf', `${PRINTER_FILE_ORIGIN}/api/pdf/${key}`); } catch { fileRejected = true; }
    assert(fileRejected && errorFetches === 1 && canceled && !buffered, 'Actual R2 error transport must cancel without buffering before verifier limits');

  } finally {
    globalThis.fetch = originalFetch;
    r2Client.sign = originalSign as typeof r2Client.sign;
  }
}

async function main(): Promise<void> {
  await testStreamUploadsUseUnsignedPayload();
  console.log('test-r2-client: ok');
}

main().catch((error) => {
  console.error('test-r2-client: failed');
  console.error(error);
  process.exitCode = 1;
});
