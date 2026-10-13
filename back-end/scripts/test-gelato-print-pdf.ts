import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import { buildGelatoPrintPdf, MAX_GELATO_PNG_SOURCE_BYTES, readGelatoPngResponse } from '../src/lib/books/build-gelato-print-pdf';
import type { W4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const payload = new Uint8Array(typeBytes.byteLength + data.byteLength);
  payload.set(typeBytes);
  payload.set(data, typeBytes.byteLength);
  return new Uint8Array([...uint32(data.byteLength), ...payload, ...uint32(crc32(payload))]);
}

function solidPng(width: number, height: number, fill = 255): Uint8Array {
  const rowLength = width * 3 + 1;
  const raw = new Uint8Array(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * rowLength;
    raw[row] = 0;
    raw.fill(fill, row + 1, row + rowLength);
  }
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', header),
    ...chunk('IDAT', new Uint8Array(deflateSync(raw))),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

function pngWithImageData(width: number, height: number, imageData: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', header),
    ...chunk('IDAT', imageData),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

function pngWithInterleavedImageData(width: number, height: number): Uint8Array {
  const rowLength = width * 3 + 1;
  const raw = new Uint8Array(rowLength * height);
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header[8] = 8;
  header[9] = 2;
  const compressed = new Uint8Array(deflateSync(raw));
  const split = Math.floor(compressed.byteLength / 2);
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', header),
    ...chunk('IDAT', compressed.subarray(0, split)),
    ...chunk('tEXt', new TextEncoder().encode('Comment\u0000interleaved')),
    ...chunk('IDAT', compressed.subarray(split)),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

function pngWithUnknownCriticalChunk(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', header),
    ...chunk('ABCD', new Uint8Array()),
    ...chunk('IDAT', new Uint8Array(deflateSync(new Uint8Array((width * 3 + 1) * height)))),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

function grayscalePngWithPalette(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header[8] = 8;
  header[9] = 0;
  const pixels = new Uint8Array((width + 1) * height);
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', header),
    ...chunk('PLTE', new Uint8Array([0, 0, 0])),
    ...chunk('IDAT', new Uint8Array(deflateSync(pixels))),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

function rgbPngWithTransparency(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = new Uint8Array((width * 3 + 1) * height);
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', header),
    ...chunk('tRNS', new Uint8Array(6)),
    ...chunk('IDAT', new Uint8Array(deflateSync(pixels))),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

const format = configFile.formats.standard;
assert.equal(format.print.provider, 'gelato');
const prefix = 'book-finding-our-inner-voice/orders/GELATO-PDF-TEST';
const coverKey = `${prefix}/preview-images/cover-spread.png`;
const pageKey = `${prefix}/preview-images/p00.png`;
const coverPng = solidPng(4832, 2434);
let pagePng = solidPng(2434, 2434);
const input = {
  orderId: 'GELATO-PDF-TEST',
  orderDbId: 1,
  amazonOrderId: null,
  rootOrderId: null,
  characterHash: 'synthetic',
  bookId: 'book-finding-our-inner-voice',
  formatId: 'standard',
  orderPrefix: prefix,
  orderR2BaseKey: prefix,
  oneManifestKey: `${prefix}/manifests/1-manifest.json`,
  oneManifestUrl: null,
  oneManifestSchema: null,
  manifest3Key: `${prefix}/manifests/3-manifest.json`,
  manifest3Url: 'https://admin.example.test/manifest.json',
  manifest4Key: `${prefix}/manifests/4-manifest.json`,
  manifest4Url: 'https://admin.example.test/manifest4.json',
  backendUrl: 'https://admin.example.test',
  isAmazonOrder: false,
  expectedPageCount: 32,
  pageLabels: format.interior.pageSequence.map((page) => page.label),
  pagePlan: format.interior.pageSequence,
  pageImageUrls: Array.from({ length: 32 }, (_, index) => `https://admin.example.test/${index}.png`),
  pagePreviewImageKeys: format.interior.pageSequence.map((page) => `${prefix}/preview-images/${page.label}.png`),
  pagesGenerated: 32,
  coverPreviewUrl: 'https://admin.example.test/cover.png',
  coverPreviewImageKey: coverKey,
  coverPreviewImageUrls: ['https://admin.example.test/cover.png'],
  interiorPreviewImageUrls: Array.from({ length: 32 }, (_, index) => `https://admin.example.test/${index}.png`),
  coverPdfFilename: 'cover.pdf',
  coverPdfR2Key: `${prefix}/cover.pdf`,
  pdfFilename: 'interior.pdf',
  pdfR2Key: `${prefix}/interior.pdf`,
  shippingAddress: {},
  customer: { email: null, name: null },
  title: 'Synthetic PDF fixture',
  marketplace_id: null,
  hasP00: true,
  hasPagesWithCloudflare: false,
  shipping_tier: 'standard',
  shippingTier: 'standard',
  ShipmentServiceLevelCategory: null,
  ShipServiceLevel: null,
  amazon_shipment_service_level: null,
  summary: {},
  pages: {},
  pagesWithCloudflare: {},
  pngGeneration: {},
  pdfGeneration: {},
  bookSpecs: {},
  orderDetails: {},
  characterSpecs: {},
  CONFIG: {},
  providerPrintConfig: format.print,
  bookConfigVersion: 2,
  generatedAt: '2026-10-11T00:00:00.000Z',
  runStamp: 'gelato-pdf-test',
  workflow: 'w4-gelato',
} as unknown as W4GelatoPrintInput;

async function main(): Promise<void> {
  await assert.rejects(() => readGelatoPngResponse(new Response(new Uint8Array(), {
    headers: { 'content-length': String(MAX_GELATO_PNG_SOURCE_BYTES + 1) },
  })), /PNG exceeds the source image size limit/);

  await assert.rejects(() => buildGelatoPrintPdf(input, 'https://admin.example.test', {
    loadImage: async (key) => key === coverKey ? pngWithImageData(4832, 2434, new Uint8Array()) : pagePng,
    putObject: async () => assert.fail('malformed PNG must not upload a PDF'),
    headObject: async () => false,
  }), /PNG image data is invalid/);

  const invalidFilterPixels = new Uint8Array((4832 * 3 + 1) * 2434);
  invalidFilterPixels.fill(5, 0, 1);
  await assert.rejects(() => buildGelatoPrintPdf(input, 'https://admin.example.test', {
    loadImage: async (key) => key === coverKey ? pngWithImageData(4832, 2434, new Uint8Array(deflateSync(invalidFilterPixels))) : pagePng,
    putObject: async () => assert.fail('invalid PNG filter must not upload a PDF'),
    headObject: async () => false,
  }), /PNG uses an invalid row filter/);

  await assert.rejects(() => buildGelatoPrintPdf(input, 'https://admin.example.test', {
    loadImage: async (key) => key === coverKey ? pngWithInterleavedImageData(4832, 2434) : pagePng,
    putObject: async () => assert.fail('non-consecutive IDAT chunks must not upload a PDF'),
    headObject: async () => false,
  }), /PNG has invalid image data ordering/);

  await assert.rejects(() => buildGelatoPrintPdf(input, 'https://admin.example.test', {
    loadImage: async (key) => key === coverKey ? pngWithUnknownCriticalChunk(4832, 2434) : pagePng,
    putObject: async () => assert.fail('unknown critical PNG chunk must not upload a PDF'),
    headObject: async () => false,
  }), /PNG uses an unsupported critical chunk/);

  await assert.rejects(() => buildGelatoPrintPdf(input, 'https://admin.example.test', {
    loadImage: async (key) => key === coverKey ? grayscalePngWithPalette(4832, 2434) : pagePng,
    putObject: async () => assert.fail('grayscale PNG palette must not upload a PDF'),
    headObject: async () => false,
  }), /PNG has an invalid palette chunk/);

  await assert.rejects(() => buildGelatoPrintPdf(input, 'https://admin.example.test', {
    loadImage: async (key) => key === coverKey ? rgbPngWithTransparency(4832, 2434) : pagePng,
    putObject: async () => assert.fail('transparent PNG must not upload a PDF without a mask'),
    headObject: async () => false,
  }), /PNG transparency is unsupported/);

  const uploaded: Uint8Array[] = [];
  const result = await buildGelatoPrintPdf(input, 'https://admin.example.test', {
  loadImage: async (key) => key === coverKey ? coverPng : pagePng,
  putObject: async (key, stream) => {
    assert.match(key, /\/gelato\/print\/v2\/[a-f0-9]{24}\.pdf$/);
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) uploaded.push(value);
    }
  },
  headObject: async () => false,
  });

  const pdf = Buffer.concat(uploaded.map((part) => Buffer.from(part))).toString('latin1');
  if (process.env.GELATO_TEST_PDF_PATH) writeFileSync(process.env.GELATO_TEST_PDF_PATH, Buffer.from(pdf, 'latin1'));
  assert.equal(result.pageCount, 35);
  assert.ok(result.sourceImageBytes > 0);
  assert.match(result.url, /\/api\/pdf\/book-finding-our-inner-voice\/orders\/GELATO-PDF-TEST\/gelato\/print\/v2\//);
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Count 35/);
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 35);
  assert.match(pdf, /\/MediaBox \[0 0 1159\.455118 583\.937008\]/);
  assert.match(pdf, /\/MediaBox \[0 0 583\.937008 583\.937008\]/);
  assert.match(pdf, /%%EOF\n$/);

  const originalFingerprint = result.sourceFingerprint;
  pagePng = solidPng(2434, 2434, 0);
  const changedSource = await buildGelatoPrintPdf(input, 'https://admin.example.test', {
    loadImage: async (key) => key === coverKey ? coverPng : pagePng,
    putObject: async (_key, stream) => {
      const reader = stream.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    },
    headObject: async () => false,
  });
  assert.notEqual(changedSource.sourceFingerprint, originalFingerprint, 'replacing PNG bytes must change the immutable PDF key');

  let changedPageReads = 0;
  await assert.rejects(() => buildGelatoPrintPdf(input, 'https://admin.example.test', {
    loadImage: async (key) => {
      if (key === coverKey) return coverPng;
      changedPageReads += 1;
      return changedPageReads > 32 ? solidPng(2434, 2434, 0) : solidPng(2434, 2434);
    },
    putObject: async (_key, stream) => {
      const reader = stream.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    },
    headObject: async () => false,
  }), /image changed during PDF assembly/);
  console.log('Gelato print PDF assembly checks passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
