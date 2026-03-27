#!/usr/bin/env tsx

import {
  prepareW3AssemblyRun,
  collectW3PreviewImages,
  markW3PreviewsReady,
} from '@/lib/workers/w3-assembly-worker';
import { prepareW3AssemblyRunResponse } from '@/app/api/internal/w3/prepare-assembly-run/route';
import { collectW3PreviewImagesResponse } from '@/app/api/internal/w3/collect-preview-images/route';
import { markW3PreviewsReadyResponse } from '@/app/api/internal/w3/mark-previews-ready/route';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const prepared = prepareW3AssemblyRun({
    orderId: 'ORDER-123',
    amazonOrderId: 'AMZ-123',
    rootOrderId: 'AMZ-123',
    characterHash: 'charhash123',
    processedImages: [{ poseNumber: 1, r2Path: 'poses/pose01.png' }],
    pagePlan: [{ index: 0 }, { index: 1 }, { index: 2 }],
    pageLabels: ['p00', 'p01', 'p02'],
    requiredPoseNumbers: [1, 2],
    pagePlanSource: 'w0-v3',
    requiredPoseSource: 'w0-v3',
    dedicationText: '',
    testMode: true,
    testModePages: 2,
    isAmazonOrder: true,
    expectedPageCount: 99,
  });

  assert(prepared.orderId === 'ORDER-123', 'Expected prepared orderId');
  assert(prepared.status === 'book_assembly_in_progress', 'Expected in-progress start status');
  assert(prepared.totalPagesRequired === 3, 'Expected pagePlan length to win for totalPagesRequired');
  assert(prepared.assemblyProgress === 0, 'Expected zero initial assemblyProgress');
  assert(prepared.dedicationText === null, 'Expected empty dedicationText to normalize to null');
  assert(prepared.testModePages === 2, 'Expected explicit testModePages passthrough');

  const preparedResponse = prepareW3AssemblyRunResponse({
    orderId: 'ORDER-123',
    characterHash: 'charhash123',
    processedImages: [{ poseNumber: 1 }],
  });
  assert(preparedResponse.success === true, 'Expected prepare route response success flag');

  const collected = collectW3PreviewImages({
    ready: {
      orderId: 'ORDER-123',
      amazonOrderId: 'AMZ-123',
      rootOrderId: 'AMZ-123',
      backendUrl: 'https://admin.littleherolabs.com',
      publicR2Url: 'https://pub.example',
      totalPagesRequired: 3,
      assemblyStartedAt: '2026-03-26T23:38:11.640Z',
    },
    build: {
      orderId: 'ORDER-123',
      backendUrl: 'https://admin.littleherolabs.com',
    },
    previewItems: [
      {
        orderId: 'ORDER-123',
        amazonOrderId: 'AMZ-123',
        rootOrderId: 'AMZ-123',
        backendUrl: 'https://admin.littleherolabs.com',
        pageNumber: 0,
        pageImageR2Key: 'book/orders/ORDER-123/preview-images/p00.png',
        pageImageFilename: 'p00.png',
      },
      {
        orderId: 'ORDER-123',
        amazonOrderId: 'AMZ-123',
        rootOrderId: 'AMZ-123',
        backendUrl: 'https://admin.littleherolabs.com',
        pageNumber: 1,
        pageImageR2Key: 'book/orders/ORDER-123/preview-images/p01.png',
        pageImageFilename: 'p01.png',
      },
      {
        orderId: 'OTHER-ORDER',
        pageNumber: 2,
        pageImageR2Key: 'book/orders/OTHER-ORDER/preview-images/p02.png',
        pageImageFilename: 'p02.png',
      },
    ],
    cloudflareItems: [
      {
        result: {
          meta: { orderId: 'ORDER-123', pageNumber: 0 },
          id: 'cf-000',
          variants: ['https://cf.example/p00-small', 'https://cf.example/p00'],
        },
      },
      {
        result: {
          meta: { orderId: 'OTHER-ORDER', pageNumber: 2 },
          id: 'cf-other',
          variants: ['https://cf.example/other-small', 'https://cf.example/other'],
        },
      },
    ],
  });

  assert(collected.orderId === 'ORDER-123', 'Expected collected orderId');
  assert(collected.pagePreviewImages.length === 2, 'Expected only matching-order preview images');
  assert(collected.pagePreviewImages[0]?.cloudflareImageId === 'cf-000', 'Expected Cloudflare metadata merge');
  assert(collected.status === 'book_assembly_in_progress', 'Expected still in-progress while not all pages are ready');
  assert(collected.totalPagesRequired === 3, 'Expected ready-state totalPagesRequired to win');

  const collectedResponse = collectW3PreviewImagesResponse({
    ready: { orderId: 'ORDER-123', totalPagesRequired: 1 },
    previewItems: [{ orderId: 'ORDER-123', pageNumber: 0, pageImageR2Key: 'book/orders/ORDER-123/preview-images/p00.png' }],
  });
  assert(collectedResponse.success === true, 'Expected collect route response success flag');

  const marked = markW3PreviewsReady({
    current: {
      orderId: 'ORDER-123',
      pagesGenerated: 2,
      pagePreviewImages: collected.pagePreviewImages,
    },
    collected: {
      orderId: 'ORDER-123',
      amazonOrderId: 'AMZ-123',
      rootOrderId: 'AMZ-123',
      backendUrl: 'https://admin.littleherolabs.com',
      totalPagesRequired: 2,
      assemblyStartedAt: '2026-03-26T23:38:11.640Z',
      pagePreviewImages: collected.pagePreviewImages,
    },
    ready: {
      orderId: 'ORDER-123',
      manifest3Key: 'book/orders/ORDER-123/manifests/3-manifest.json',
    },
    prep: {
      manifestKey: 'book/orders/ORDER-123/manifests/3-manifest.json',
      manifestUrl: 'https://admin.littleherolabs.com/api/manifests/book/orders/ORDER-123/manifests/3-manifest.json',
    },
  });

  assert(marked.status === 'book_assembly_previews_ready', 'Expected ready status');
  assert(marked.manifest3Url?.includes('/api/manifests/book/orders/ORDER-123/manifests/3-manifest.json'), 'Expected manifest3Url resolution');
  assert(marked.pagesGenerated === 2, 'Expected pagesGenerated passthrough');
  assert(typeof marked.totalAssemblyTime === 'number' && marked.totalAssemblyTime >= 0, 'Expected totalAssemblyTime');

  const markedResponse = markW3PreviewsReadyResponse({
    current: {
      orderId: 'ORDER-123',
      pagePreviewImages: collected.pagePreviewImages,
    },
    collected: {
      orderId: 'ORDER-123',
      totalPagesRequired: 2,
      assemblyStartedAt: '2026-03-26T23:38:11.640Z',
      pagePreviewImages: collected.pagePreviewImages,
    },
    prep: {
      manifestKey: 'book/orders/ORDER-123/manifests/3-manifest.json',
      manifestUrl: 'https://admin.littleherolabs.com/api/manifests/book/orders/ORDER-123/manifests/3-manifest.json',
    },
  });
  assert(markedResponse.success === true, 'Expected mark-ready route response success flag');

  console.log('W3 assembly worker tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
