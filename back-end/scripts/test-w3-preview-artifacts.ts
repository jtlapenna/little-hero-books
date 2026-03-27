#!/usr/bin/env tsx

import {
  materializeW3PreviewArtifact,
} from '@/lib/workers/w3-preview-artifacts';
import {
  materializeW3PreviewArtifactResponse,
} from '@/app/api/internal/w3/materialize-preview-artifact/route';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

async function testPagePreviewMaterialization(): Promise<void> {
  const putCalls: Array<{
    bucket: string;
    key: string;
    contentType?: string;
    byteLength: number;
  }> = [];
  const fetchCalls: Array<{
    url: string;
    method: string;
  }> = [];

  const result = await materializeW3PreviewArtifactResponse(
    {
      documentKind: 'page-preview',
      orderId: 'ORDER-123',
      amazonOrderId: 'ORDER-123',
      rootOrderId: 'ORDER-ROOT-123',
      backendUrl: 'https://preview-admin.example',
      pageNumber: 3,
      pageImageFilename: 'p03.png',
      pageImageDownloadUrl: 'https://cdn.example.test/previews/p03.png',
      pageImageR2Key: 'book/orders/ORDER-123/preview-images/p03.png',
    },
    {
      cloudflareAccountId: 'cf-account-id',
      cloudflareImagesApiToken: 'cf-token',
      cloudflareImagesAccountHash: 'cf-account-hash',
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();
        fetchCalls.push({ url, method });

        if (url === 'https://cdn.example.test/previews/p03.png') {
          return new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
            },
          });
        }

        if (
          url === 'https://api.cloudflare.com/client/v4/accounts/cf-account-id/images/v1'
        ) {
          return jsonResponse({
            success: true,
            result: {
              id: 'cf-page-003',
            },
          });
        }

        throw new Error(`Unexpected fetch call: ${method} ${url}`);
      },
      putObjectImpl: async (bucket, key, body, contentType) => {
        const bytes = new Uint8Array(await new Response(body).arrayBuffer());
        putCalls.push({
          bucket,
          key,
          contentType,
          byteLength: bytes.byteLength,
        });
        return new Response(null, { status: 200 });
      },
    },
  );

  assert(result.success === true, 'Expected preview materialization response success flag');
  assert(
    result.pageNumber === 3 &&
      result.pageType === 'interior' &&
      result.r2Key === 'book/orders/ORDER-123/preview-images/p03.png',
    'Expected page preview materialization to preserve page identity and R2 key',
  );
  assert(
    result.imageUrl ===
      'https://preview-admin.example/api/assets/book/orders/ORDER-123/preview-images/p03.png',
    'Expected page preview materialization to expose the repo-owned asset URL',
  );
  assert(
    result.cloudflareImageId === 'cf-page-003' &&
      result.cloudflareImageUrl ===
        'https://imagedelivery.net/cf-account-hash/cf-page-003/preview?width=1024',
    'Expected page preview materialization to upload to Cloudflare Images and construct the preview variant URL',
  );
  assert(
    putCalls.length === 1 &&
      putCalls[0]?.bucket === 'little-hero-orders' &&
      putCalls[0]?.key === 'book/orders/ORDER-123/preview-images/p03.png' &&
      putCalls[0]?.contentType === 'image/png' &&
      putCalls[0]?.byteLength === 4,
    'Expected page preview materialization to upload the downloaded PNG into the orders bucket',
  );
  assert(
    fetchCalls.map((call) => `${call.method} ${call.url}`).join(',') ===
      'GET https://cdn.example.test/previews/p03.png,POST https://api.cloudflare.com/client/v4/accounts/cf-account-id/images/v1',
    'Expected page preview materialization to download first, then upload once to Cloudflare Images',
  );
}

async function testCoverPreviewMaterializationWithoutCloudflare(): Promise<void> {
  const putCalls: Array<{
    bucket: string;
    key: string;
    contentType?: string;
    byteLength: number;
  }> = [];

  const result = await materializeW3PreviewArtifact(
    {
      documentKind: 'cover-preview',
      orderId: 'ORDER-456',
      amazonOrderId: 'ORDER-456',
      rootOrderId: 'ORDER-ROOT-456',
      backendUrl: 'https://preview-admin.example',
      coverPngDownloadUrl: 'https://cdn.example.test/previews/cover-spread.png',
      coverPngFilename: 'cover-spread.png',
      coverPngR2Key: 'book/orders/ORDER-456/preview-images/cover-spread.png',
    },
    {
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();

        if (
          method === 'GET' &&
          url === 'https://cdn.example.test/previews/cover-spread.png'
        ) {
          return new Response(new Uint8Array([5, 6, 7]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
            },
          });
        }

        throw new Error(`Unexpected fetch call: ${method} ${url}`);
      },
      putObjectImpl: async (bucket, key, body, contentType) => {
        const bytes = new Uint8Array(await new Response(body).arrayBuffer());
        putCalls.push({
          bucket,
          key,
          contentType,
          byteLength: bytes.byteLength,
        });
        return new Response(null, { status: 200 });
      },
    },
  );

  assert(
    result.pageNumber === -1 && result.pageType === 'cover-spread',
    'Expected cover preview materialization to normalize cover identity as page -1 / cover-spread',
  );
  assert(
    result.coverPngR2Key === 'book/orders/ORDER-456/preview-images/cover-spread.png' &&
      result.coverPngFilename === 'cover-spread.png',
    'Expected cover preview materialization to preserve cover storage fields',
  );
  assert(
    result.cloudflareImageId === null &&
      result.cloudflareImageUrl === null &&
      result.cloudflareUploaded === false,
    'Expected cover preview materialization to succeed without Cloudflare credentials',
  );
  assert(
    putCalls.length === 1 &&
      putCalls[0]?.key === 'book/orders/ORDER-456/preview-images/cover-spread.png',
    'Expected cover preview materialization to still upload the preview image to R2',
  );
}

async function main(): Promise<void> {
  await testPagePreviewMaterialization();
  await testCoverPreviewMaterializationWithoutCloudflare();
  console.log('W3 preview artifact tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
