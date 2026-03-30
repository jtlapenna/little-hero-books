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

  const { putObject, r2Client } = await import('@/lib/r2-client');
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
