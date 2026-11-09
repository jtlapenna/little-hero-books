import assert from 'node:assert/strict';

process.env.CLOUDFLARE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
process.env.R2_ACCESS_KEY_ID = 'test-access';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret';

type Call = { method: string; url: string; bytes: number; contentType: string | null; body: string | null };

function streamOf(total: number, chunk: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) { controller.close(); return; }
      const size = Math.min(chunk, total - sent);
      controller.enqueue(new Uint8Array(size).fill((sent / chunk) % 251));
      sent += size;
    },
  });
}

async function main() {
  const { putObject, R2_STREAM_PART_BYTES, r2Client } = await import('../src/lib/r2-client');
  // Signing is not under test (and aws4fetch drops request bodies under Node); keep the request as built so the mock can read it.
  (r2Client as unknown as { sign: (request: Request) => Promise<Request> }).sign = async (request) => request;
  const calls: Call[] = [];
  let failPart: number | null = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const isXml = request.headers.get('content-type') === 'application/xml';
    const buffer = request.method === 'GET' || request.method === 'DELETE' ? new ArrayBuffer(0) : await request.arrayBuffer();
    calls.push({ method: request.method, url: request.url, bytes: buffer.byteLength, contentType: request.headers.get('content-type'), body: isXml ? new TextDecoder().decode(buffer) : null });
    if (request.method === 'POST' && url.searchParams.has('uploads')) return new Response('<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>');
    if (request.method === 'PUT' && url.searchParams.has('partNumber')) {
      if (Number(url.searchParams.get('partNumber')) === failPart) return new Response('boom', { status: 500 });
      return new Response('', { headers: { ETag: `"etag-${url.searchParams.get('partNumber')}"` } });
    }
    if (request.method === 'POST' && url.searchParams.has('uploadId')) return new Response('<CompleteMultipartUploadResult/>');
    if (request.method === 'PUT') return new Response('', { headers: { ETag: '"single"' } });
    return new Response('');
  }) as typeof fetch;

  try {
    // Small stream: one plain PUT, no multipart.
    await putObject('bucket', 'a/small.pdf', streamOf(1_000_000, 64_000), 'application/pdf');
    assert.deepEqual(calls.map((call) => call.method), ['PUT']);
    assert.equal(calls[0].bytes, 1_000_000);
    assert.ok(!calls[0].url.includes('uploadId'));

    // Large stream: parts of the configured size, last part short, complete lists every ETag in order.
    calls.length = 0;
    const total = R2_STREAM_PART_BYTES * 2 + 123_456;
    await putObject('bucket', 'a/big.pdf', streamOf(total, 1_500_000), 'application/pdf');
    assert.deepEqual(calls.map((call) => call.method), ['POST', 'PUT', 'PUT', 'PUT', 'POST']);
    assert.deepEqual(calls.slice(1, 4).map((call) => call.bytes), [R2_STREAM_PART_BYTES, R2_STREAM_PART_BYTES, 123_456]);
    assert.equal(calls.slice(1, 4).reduce((sum, call) => sum + call.bytes, 0), total);
    assert.equal(calls[0].contentType, 'application/pdf');
    // aws4fetch drops a Request body unless Content-Type is set; every part must carry one or R2 sees an empty body.
    assert.ok(calls.slice(1, 4).every((call) => call.contentType === 'application/octet-stream'));
    assert.match(calls[4].body ?? '', /^<CompleteMultipartUpload>(<Part><PartNumber>\d<\/PartNumber><ETag>"etag-\d"<\/ETag><\/Part>){3}<\/CompleteMultipartUpload>$/);
    assert.ok((calls[4].body ?? '').indexOf('etag-1') < (calls[4].body ?? '').indexOf('etag-2') && (calls[4].body ?? '').indexOf('etag-2') < (calls[4].body ?? '').indexOf('etag-3'));

    // Exact multiple of the part size: no empty trailing part.
    calls.length = 0;
    await putObject('bucket', 'a/exact.pdf', streamOf(R2_STREAM_PART_BYTES * 2, 2_000_000), 'application/pdf');
    assert.deepEqual(calls.map((call) => call.method), ['POST', 'PUT', 'PUT', 'POST']);
    assert.deepEqual(calls.slice(1, 3).map((call) => call.bytes), [R2_STREAM_PART_BYTES, R2_STREAM_PART_BYTES]);

    // A failing part aborts the upload and surfaces the error.
    calls.length = 0; failPart = 2;
    await assert.rejects(() => putObject('bucket', 'a/fail.pdf', streamOf(R2_STREAM_PART_BYTES * 3, 1_000_000), 'application/pdf'), /part 2 failed/);
    assert.equal(calls[calls.length - 1].method, 'DELETE');
    assert.ok(calls[calls.length - 1].url.includes('uploadId=upload-1'));
    failPart = null;

    // Non-stream bodies and conditional puts keep the existing single-request behavior.
    calls.length = 0;
    await putObject('bucket', 'a/plain.json', new Uint8Array([1, 2, 3]), 'application/json');
    await putObject('bucket', 'a/cond.json', streamOf(100, 10), 'application/json', { ifNoneMatch: '*' });
    assert.deepEqual(calls.map((call) => call.method), ['PUT', 'PUT']);
    console.log('R2 streaming multipart put: all checks passed; network calls were mocked');
  } finally {
    globalThis.fetch = realFetch;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
