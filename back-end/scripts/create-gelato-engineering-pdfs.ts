/** Local fixture assembly and independent raster/geometry checks. No service access. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import config from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import { buildGelatoPrintPdf } from '../src/lib/books/build-gelato-print-pdf';
import { assertW4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
import type { BuildW4PrintInputResult } from '../src/lib/books/w4-print-input';
import { BookConfigSchema, GelatoPrintConfigSchema } from '../src/lib/books/types';

const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
type Asset = { filename: string; label: string; width: number; height: number; pngSha256: string; graySha256: string };
type Child = { role: string; formatId: 'standard' | 'amazon'; orderId: string; assets: Asset[] };
async function main() {
  assert.equal(process.argv.length, 3, 'Pass the local raster output directory');
  const directory = path.resolve(process.argv[2]);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'rasters.json'), 'utf8')) as { bookId: string; caseChildren: Child[]; configSha256: string };
  assert.equal(manifest.bookId, 'book-finding-our-inner-voice');
  assert.equal(manifest.configSha256, sha(await fs.readFile(path.resolve(__dirname, '../src/lib/books/configs/book-finding-our-inner-voice/v2.json'))));
  assert.equal(manifest.caseChildren.length, 4);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Fixture assembly may not use network'); };
  const receipts: unknown[] = [];
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    for (const child of manifest.caseChildren) {
      assert.match(child.orderId, /^TEST-GELATO-U-[A-Za-z0-9-]+$/);
      assert.ok(['WEB-A', 'AMZ-A', 'SIB-A', 'SIB-B'].includes(child.role));
      assert.ok(['standard', 'amazon'].includes(child.formatId));
      const edition = BookConfigSchema.parse(config).formats[child.formatId];
      const print = GelatoPrintConfigSchema.parse(edition.print);
      assert.equal(print.innerPageCount, 32); assert.equal(print.apiPageCount, 32); assert.equal(print.expectedPdfPageCount, 35);
      assert.deepEqual(print.printGeometryMm.trim, { w:200, h:200 });
      assert.equal(child.assets.length, 33);
      const prefix = `${manifest.bookId}/orders/${child.orderId}`;
      const pageKeys = edition.interior.pageSequence.map(p => `${prefix}/preview-images/${p.label}.png`);
      const coverKey = `${prefix}/preview-images/cover-spread.png`;
      const sources = new Map<string, Asset>([...pageKeys, coverKey].map((key, i) => [key, child.assets[i]]));
      const pageUrls = pageKeys.map(key => 'https://fixture.example.test/'+key);
      const input: BuildW4PrintInputResult = {
        orderId: child.orderId, orderDbId: null, rootOrderId: null, amazonOrderId: null, characterHash:'synthetic',
        bookId: manifest.bookId, formatId: child.formatId, orderPrefix: prefix, orderR2BaseKey: prefix,
        oneManifestKey: `${prefix}/manifests/1-manifest.json`, manifest3Key: `${prefix}/manifests/3-manifest.json`,
        manifest4Key: `${prefix}/manifests/4-manifest.json`, pageLabels: edition.interior.pageSequence.map(p => p.label),
        pagePlan: edition.interior.pageSequence, pagePreviewImageKeys: pageKeys, coverPreviewImageKey: coverKey,
        providerPrintConfig: print, bookConfigVersion: 2, expectedPageCount:print.innerPageCount,
        pageImageUrls:pageUrls, pagesGenerated:print.innerPageCount, oneManifestUrl:null, oneManifestSchema:null,
        manifest3Url:'https://fixture.example.test/'+prefix+'/manifests/3-manifest.json',
        manifest4Url:'https://fixture.example.test/'+prefix+'/manifests/4-manifest.json', backendUrl:'https://fixture.example.test',
        isAmazonOrder:child.formatId === 'amazon', coverPreviewUrl:'https://fixture.example.test/'+coverKey,
        coverPreviewImageUrls:['https://fixture.example.test/'+coverKey], interiorPreviewImageUrls:pageUrls,
        coverPdfFilename:'cover.pdf', coverPdfR2Key:prefix+'/cover.pdf', pdfFilename:'interior.pdf', pdfR2Key:prefix+'/interior.pdf',
        shippingAddress:{}, customer:{ email:null, name:null }, title:'Synthetic engineering fixture', marketplace_id:null,
        hasP00:true, hasPagesWithCloudflare:false, shipping_tier:'standard', shippingTier:'standard',
        ShipmentServiceLevelCategory:null, ShipServiceLevel:null, amazon_shipment_service_level:null,
        summary:{}, pages:{}, pagesWithCloudflare:{}, pngGeneration:{}, pdfGeneration:{}, bookSpecs:{}, orderDetails:{}, characterSpecs:{},
        generatedAt:null, runStamp:null, workflow:'local-engineering-fixture',
      };
      let bytes: Buffer | undefined;
      const built = await buildGelatoPrintPdf(assertW4GelatoPrintInput(input), 'https://fixture.example.test', {
        loadImage: async key => {
          const asset = sources.get(key); assert.ok(asset, 'Unexpected source image');
          assert.match(asset.filename, /^(WEB-A|AMZ-A|SIB-A|SIB-B)\/[A-Za-z0-9_-]+\.png$/);
          const data = await fs.readFile(path.join(directory, asset.filename)); assert.equal(sha(data), asset.pngSha256); return data;
        },
        putObject: async (_key, stream) => {
          assert.equal(bytes, undefined, 'Only one local PDF per child');
          const chunks: Uint8Array[] = []; const reader = stream.getReader();
          for (;;) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); }
          bytes = Buffer.concat(chunks);
        },
      });
      assert.ok(bytes); assert.equal(built.pageCount, 35);
      const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
      const pages: Array<{ page: number; sourceLabel: string | null; rasterVerified: boolean }> = [];
      try {
        assert.equal(document.numPages, 35);
        for (let n = 1; n <= 35; n++) {
          const asset = n === 1 ? child.assets[32] : n === 2 || n === 35 ? null : child.assets[n-3];
          const page = await document.getPage(n), geometry = n === 1 ? print.printGeometryMm.coverCanvas : print.printGeometryMm.interiorCanvas;
          assert.equal(page.rotate, 0); assert.equal(page.view[0], 0); assert.equal(page.view[1], 0);
          assert.ok(Math.abs(page.view[2]-geometry.w*72/25.4) < 0.00001 && Math.abs(page.view[3]-geometry.h*72/25.4) < 0.00001);
          const ops = await page.getOperatorList();
          const images = ops.fnArray.map((op, i) => ({ op, i })).filter(o => o.op === pdfjs.OPS.paintImageXObject);
          assert.equal(images.length, asset ? 1 : 0);
          const allowed = asset ? [pdfjs.OPS.save, pdfjs.OPS.transform, pdfjs.OPS.dependency, pdfjs.OPS.paintImageXObject, pdfjs.OPS.restore] : [pdfjs.OPS.save, pdfjs.OPS.restore];
          assert.ok(ops.fnArray.every(op => allowed.includes(op)), 'Unexpected clipping or drawing operation');
          const transforms = ops.fnArray.map((op, i) => ({ op, i })).filter(o => o.op === pdfjs.OPS.transform);
          assert.equal(transforms.length, asset ? 1 : 0);
          if (asset) {
            const matrix = ops.argsArray[transforms[0].i] as number[];
            const expected = [page.view[2], 0, 0, page.view[3], 0, 0];
            assert.equal(matrix.length, 6);
            assert.ok(matrix.every((value,i) => Math.abs(value-expected[i]) < 0.00001), 'Raster placement differs');
          }
          if (asset) {
            const id = ops.argsArray[images[0].i][0] as string;
            const image = await new Promise<{ width: number; height: number; data: Uint8Array }>((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error('Image decode timeout')), 15000);
              (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, (value: { width: number; height: number; data: Uint8Array }) => { clearTimeout(timer); resolve(value); });
            });
            assert.equal(image.width, asset.width); assert.equal(image.height, asset.height);
            const channels = image.data.length/(asset.width*asset.height); assert.ok(channels === 3 || channels === 4);
            const gray = Buffer.alloc(asset.width*asset.height); let channelsMatch = true;
            for (let pixel = 0; pixel < gray.length; pixel++) {
              const offset = pixel*channels; gray[pixel] = image.data[offset];
              if (image.data[offset+1] !== gray[pixel] || image.data[offset+2] !== gray[pixel] || (channels === 4 && image.data[offset+3] !== 255)) { channelsMatch = false; break; }
            }
            assert.ok(channelsMatch, 'Decoded grayscale channels differ');
            assert.equal(sha(gray), asset.graySha256, 'Decoded PDF page or child identity was swapped');
          }
          pages.push({ page:n, sourceLabel:asset?.label ?? null, rasterVerified:true }); page.cleanup();
        }
      } finally { await document.destroy(); }
      await fs.writeFile(path.join(directory, child.role+'.pdf'), bytes, { flag:'wx', mode:0o600 });
      receipts.push({ role:child.role, orderId:child.orderId, formatId:child.formatId, productUid:print.productUid,
        physicalInnerPages:print.innerPageCount, apiPageCount:print.apiPageCount, uploadedPages:print.expectedPdfPageCount, bytes:bytes.length, sha256:sha(bytes),
        immutableArtifactKey:built.key, sourceFingerprint:built.sourceFingerprint, pages,
        canonicalAssembler:true, independentDecodedRasterAndGeometryVerified:true, liveWorkflowExecuted:false });
    }
    assert.equal(new Set((receipts as Array<{ sha256:string }>).map(r => r.sha256)).size, 4, 'Each child needs distinct PDF bytes');
    await fs.writeFile(path.join(directory, 'pdf-receipts.json'), JSON.stringify({ receipts, liveRequests:0 }, null, 2)+'\n', { flag:'wx', mode:0o600 });
    console.log(JSON.stringify({ childPdfs:4, distinctFiles:true, uploadedPages:35, innerPages:32, apiPageCount:32, independentPagesChecked:140, liveRequests:0 }));
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Local fixture creation failed'); process.exitCode = 1; });
