import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ADMIN_BODY_LIMITS, readBoundedRequestBytes, readBoundedRequestFormData, RequestBodyError } from '../src/lib/request-body';

async function main() {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://csv-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-csv-server',
    BACKEND_API_TOKEN: 'synthetic-csv-machine',
  });
  const originalFetch = globalThis.fetch, originalLog = console.log, originalError = console.error;
  let calls = 0, checks = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Live transport forbidden in CSV boundary test'); };
  console.log = () => {}; console.error = () => {};
  try {
    const cap = ADMIN_BODY_LIMITS.csvUpload;
    const { POST } = await import('../src/app/api/admin/amazon-orders/upload-csv/route');
    const url = 'https://admin.example.test/api/admin/amazon-orders/upload-csv';
    function streamed(bytes: Uint8Array, headers: Record<string, string> = {}, auth = true) {
      let offset = 0, pulls = 0, canceled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) { pulls++; if (offset < bytes.length) { controller.enqueue(bytes.subarray(offset, offset += 65536)); } else controller.close(); },
        cancel() { canceled = true; },
      }, { highWaterMark: 0 });
      const request = new NextRequest(url, { method: 'POST', body, duplex: 'half', headers: { ...(auth ? { authorization: 'Bearer synthetic-csv-machine' } : {}), ...headers } } as RequestInit);
      return { request, pulls: () => pulls, canceled: () => canceled };
    }
    const encoder = new TextEncoder();
    const denied = streamed(new Uint8Array(cap + 1), {}, false);
    assert.equal((await POST(denied.request)).status, 401); assert.equal(denied.pulls(), 0); checks++;
    for (const headers of [{}, { 'content-length': '1' }]) {
      const over = streamed(new Uint8Array(cap + 1), headers);
      assert.equal((await POST(over.request)).status, 413); assert.ok(over.canceled()); checks++;
    }
    const early = streamed(encoder.encode('not read'), { 'content-length': String(cap + 1) });
    assert.equal((await POST(early.request)).status, 413); assert.equal(early.pulls(), 0); checks++;
    const badLength = streamed(new Uint8Array(), { 'content-length': '-1' });
    assert.equal((await POST(badLength.request)).status, 400); checks++;
    for (const [type, body] of [['application/json', '{}'], ['multipart/form-data; boundary=synthetic', 'broken multipart']]) {
      assert.equal((await POST(streamed(encoder.encode(body), { 'content-type': type }).request)).status, 400); checks++;
    }
    const headersOnly = 'amazon-order-id,ship-address-1,ship-city,ship-state,ship-postal-code,customized-url\n';
    // Same producer contract as the admin UI: browser FormData + File/Blob, no hand-written Content-Type.
    const form = new FormData(); form.set('file', new Blob([headersOnly], { type: 'text/csv' }), 'synthetic.csv');
    const valid = await POST(new NextRequest(url, { method: 'POST', headers: { authorization: 'Bearer synthetic-csv-machine' }, body: form }));
    assert.equal(valid.status, 200); assert.equal((await valid.json()).summary.total_rows, 0); checks++;
    for (const kind of ['missing', 'string', 'wrong-extension']) {
      const f = new FormData(); if (kind === 'string') f.set('file', 'not a file'); if (kind === 'wrong-extension') f.set('file', new Blob(['x']), 'synthetic.exe');
      assert.equal((await POST(new NextRequest(url, { method: 'POST', headers: { authorization: 'Bearer synthetic-csv-machine' }, body: f }))).status, 400); checks++;
    }
    // The existing 10MiB FILE cap stays separate from the 11MiB REQUEST cap.
    for (const [size, expectedError] of [[10 * 1024 * 1024, 'Missing required columns'], [10 * 1024 * 1024 + 1, 'File too large. Maximum size is 10MB.']] as const) {
      const content = 'unknown-column\n' + 'x'.repeat(size - 15);
      assert.equal(encoder.encode(content).length, size);
      const f = new FormData(); f.set('file', new Blob([content]), 'synthetic.csv');
      const response = await POST(new NextRequest(url, { method: 'POST', headers: { authorization: 'Bearer synthetic-csv-machine' }, body: f }));
      assert.equal(response.status, 400); assert.equal((await response.json()).error, expectedError); checks++;
    }
    // Exact envelope limit reaches the real parser; boundary and non-UTF8 file octets are unchanged.
    const boundary = 'lhl-synthetic-boundary';
    const start = encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.csv"\r\nContent-Type: text/csv\r\n\r\n`);
    const end = encoder.encode(`\r\n--${boundary}--\r\n`);
    const binary = new Uint8Array(cap); binary.fill(0x61); binary.set(start); binary[start.length] = 0xff; binary.set(end, cap - end.length);
    const exact = await readBoundedRequestFormData(streamed(binary, { 'content-type': `multipart/form-data; boundary=${boundary}` }).request, cap);
    const file = exact.get('file'); assert.ok(file && typeof file !== 'string');
    const raw = new Uint8Array(await file.arrayBuffer()); assert.equal(raw[0], 0xff); assert.equal(raw.length, cap - start.length - end.length); checks++;
    const exactRoute = await POST(streamed(binary, { 'content-type': `multipart/form-data; boundary=${boundary}` }).request);
    assert.equal(exactRoute.status, 400); assert.equal((await exactRoute.json()).error, 'File too large. Maximum size is 10MB.'); checks++;
    assert.deepEqual(await readBoundedRequestBytes(streamed(new Uint8Array([0xff, 0, 0xef, 0xbb, 0xbf])).request, 5), new Uint8Array([0xff, 0, 0xef, 0xbb, 0xbf])); checks++;
    await assert.rejects(readBoundedRequestFormData(streamed(binary).request, cap - 1), e => e instanceof RequestBodyError && e.status === 413); checks++;
    assert.equal(calls, 0, 'Rejected, header-only and parser fixtures cannot persist rows, fetch ZIPs or trigger workflows');
    originalLog(`CSV request boundary: ${checks} cases passed; zero external calls`);
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; console.error = originalError; }
}
void main().catch(error => { console.error(String(error)); process.exitCode = 1; });
