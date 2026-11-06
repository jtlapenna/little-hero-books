/** Local-only fixture. A real W4 rejects the unapproved W3; no provider calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW4PrintInput, type BuildW4PrintInputResult } from '../src/lib/books/w4-print-input';
import { assertW4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
import { buildGelatoPrintPdf } from '../src/lib/books/build-gelato-print-pdf';

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const read = async (p: string) => fs.readFile(p);
async function checked(root: string, relative: string, hash: string) {
  assert.ok(typeof relative === 'string' && !path.isAbsolute(relative));
  const actual = await fs.realpath(path.resolve(root, relative));
  assert.ok(actual.startsWith(root + path.sep), `Path outside input: ${relative}`);
  const bytes = await read(actual);
  assert.equal(sha(bytes), hash, `Hash mismatch: ${relative}`);
  return bytes;
}

export async function writeAll(handle: { write: (buffer: Uint8Array, offset: number, length: number) => Promise<{ bytesWritten: number }> }, bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset);
    assert.ok(Number.isInteger(bytesWritten) && bytesWritten > 0 && bytesWritten <= bytes.length - offset, 'Invalid or stalled PDF write');
    offset += bytesWritten;
  }
}

export async function assemble(proofArg: string, rasterArg: string, outputArg: string) {
  const proof = await fs.realpath(proofArg), rasters = await fs.realpath(rasterArg), output = path.resolve(outputArg);
  const manifestBytes = await read(path.join(proof, 'proof-manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString());
  assert.equal(manifest.schema, 'lhb.custom-flow-local-proof@v1');
  assert.equal(manifest.approved, false); assert.equal(manifest.printReady, false);
  const config = JSON.parse((await checked(proof, 'flow-config.json', manifest.configSha256)).toString());
  await checked(proof, 'flow-export-manifest.json', manifest.flowManifestSha256);
  await checked(proof, 'source-asset-map.json', manifest.assetMapSha256);
  await checked(proof, 'source-pose-ledger.json', manifest.poseLedgerSha256);
  for (const asset of Object.values(manifest.assets) as any[]) await checked(proof, asset.file, asset.sha256);
  const rasterManifestPath = path.join(rasters, 'render-results.json');
  const rasterManifestBytes = await read(rasterManifestPath), rasterManifestSha256 = sha(rasterManifestBytes);
  const rendered = JSON.parse(rasterManifestBytes.toString());
  assert.equal(rendered.schema, 'lhb.custom-flow-local-rasters@v1');
  assert.equal(rendered.proofManifestSha256, sha(manifestBytes));
  assert.equal(rendered.approved, false); assert.equal(rendered.printReady, false);
  assert.deepEqual(rendered.networkAttempts, []);
  const roles = new Set<string>(), orders = new Set<string>();
  let count = 0;
  for (const child of manifest.cases) {
    assert.ok(typeof child.role === 'string' && /^[A-Za-z0-9-]+$/.test(child.role) && !roles.has(child.role) && typeof child.orderId === 'string' && /^[A-Za-z0-9-]+$/.test(child.orderId) && !orders.has(child.orderId)); roles.add(child.role); orders.add(child.orderId);
    const record = JSON.parse((await checked(proof, `${child.role}/prepared-record.json`, manifest.recordSha256[child.role])).toString());
    assert.equal(record.orderId, child.orderId); assert.equal(record.rootOrderId, child.rootOrderId);
    assert.equal(record.characterHash, child.characterHash); assert.deepEqual(record.selection, child.selection);
    await checked(proof, `${child.role}/w0.json`, child.w0Sha256);
    await checked(proof, `${child.role}/retained-2b.json`, child.twoBSha256);
    const plan = config.formats[child.selection.formatId].interior.pageSequence;
    assert.deepEqual(child.files.map((item: any) => item.label), ['cover', ...plan.map((p: any) => p.label)]);
    for (const item of child.files) {
      assert.equal(item.file, `${child.role}/${item.label}.html`);
      const size = config.rendering.preview[item.label === 'cover' ? 'coverPx' : 'interiorPx'];
      assert.equal(item.width, size.w); assert.equal(item.height, size.h);
      await checked(proof, item.file, item.sha256);
      const matches = rendered.pages.filter((p: any) => p.role === child.role && p.label === item.label);
      assert.equal(matches.length, 1); const page = matches[0];
      assert.equal(page.file, `${child.role}/${item.label}.png`);
      assert.equal(page.width, item.width); assert.equal(page.height, item.height);
      await checked(rasters, page.file, page.sha256); count++;
    }
  }
  assert.ok(count > 0); assert.equal(count, rendered.pages.length);
  // mkdir is exclusive and cleanup is limited to this newly created directory.
  await fs.mkdir(output, { mode: 0o700 });
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Local fixture forbids network'); };
  try {
    const receipts: any[] = [];
    for (const child of manifest.cases) {
      const role = child.role, formatId = child.selection.formatId, prefix = `${config.bookId}/orders/${child.orderId}`;
      const w0 = JSON.parse((await checked(proof, `${role}/w0.json`, child.w0Sha256)).toString());
      const twoB = JSON.parse((await checked(proof, `${role}/retained-2b.json`, child.twoBSha256)).toString());
      const intake = normalizeW0Manifest(w0);
      const assembly = await buildW3AssemblyInput({ orderId: child.orderId, bookId: config.bookId, formatId, testMode: true, testModePages: 0 }, {
        loadManifest: async key => key === `${prefix}/manifests/1-manifest.json` ? w0 : key === `${prefix}/manifests/2b-manifest.json` ? twoB : null,
      });
      const backend = 'https://local.invalid';
      const preview = buildW3PreviewPlan({ ...assembly, backendUrl: backend });
      const plan = config.formats[formatId].interior.pageSequence;
      assert.deepEqual(preview.pagePreviewItems.map(p => p.pageLabel), plan.map((p: any) => p.label));
      const images = preview.pagePreviewItems.map(p => ({ pageNumber: p.pageNumber, pageLabel: p.pageLabel, r2Key: p.pageImageR2Key }));
      const w3 = buildW3Manifest({ ...preview, pagePreviewImages: images, coverPngR2Key: preview.coverPreviewItem.coverPngR2Key }, { intake });
      assert.equal(w3.manifest.testOnly, true); assert.equal((w3.manifest.summary as any).readyForBook, false);
      const print = config.formats[formatId].print;
      const row = { orderId: child.orderId, root_order_id: child.rootOrderId, print_provider: 'gelato', print_config_version: 3,
        print_product_uid: print.productUid, print_inner_page_count: 32, print_api_page_count: 32, print_expected_pdf_page_count: 35 };
      const consume = (three: any) => buildW4PrintInput({ orderId: child.orderId, bookId: config.bookId, formatId, backendUrl: backend }, {
        expectedProvider: 'gelato', loadOrder: async () => row, loadManifest: async key => key === `${prefix}/manifests/1-manifest.json` ? w0 : key === `${prefix}/manifests/3-manifest.json` ? three : null,
      });
      await assert.rejects(consume(w3.manifest), /flow layout fit is not yet verified|original W3 source is not ready/);
      await assert.rejects(consume({ ...w3.manifest, orderId: 'OTHER-CHILD' }), /canonical order\/book identity/);
      await assert.rejects(consume({ ...w3.manifest, pageLabels: [...(w3.manifest.pageLabels as string[])].reverse() }), /frozen W0 sequence/);
      const keys = plan.map((p: any) => `${prefix}/preview-images/${p.label}.png`);
      const coverKey = `${prefix}/preview-images/cover-spread.png`;
      const fixture = { orderId: child.orderId, orderDbId: null, rootOrderId: child.rootOrderId, amazonOrderId: null, characterHash: child.characterHash,
        bookId: config.bookId, formatId, orderPrefix: prefix, orderR2BaseKey: prefix,
        oneManifestKey: `${prefix}/manifests/1-manifest.json`, oneManifestSchema: w0.schema, oneManifestUrl: null,
        manifest3Key: `${prefix}/manifests/3-manifest.json`, manifest4Key: `${prefix}/manifests/4-manifest.json`,
        manifest3Url: `${backend}/${prefix}/manifests/3-manifest.json`, manifest4Url: `${backend}/${prefix}/manifests/4-manifest.json`,
        pageLabels: plan.map((p: any) => p.label), pagePlan: plan, pagePreviewImageKeys: keys, coverPreviewImageKey: coverKey,
        providerPrintConfig: print, bookConfigVersion: 3, expectedPageCount: 32, pagesGenerated: 32, pageImageUrls: keys.map((k: string) => `${backend}/api/assets/${k}`), backendUrl: backend,
        isAmazonOrder: formatId === 'amazon', coverPreviewUrl: `${backend}/api/assets/${coverKey}`, coverPreviewImageUrls: [`${backend}/api/assets/${coverKey}`],
        interiorPreviewImageUrls: keys.map((k: string) => `${backend}/api/assets/${k}`), coverPdfFilename: 'cover.pdf', coverPdfR2Key: `${prefix}/cover.pdf`, pdfFilename: 'interior.pdf', pdfR2Key: `${prefix}/interior.pdf`,
        shippingAddress: {}, customer: { email: null, name: null }, title: 'LOCAL PROVISIONAL REVIEW, NOT FOR PRINT', marketplace_id: null,
        hasP00: true, hasPagesWithCloudflare: false, shipping_tier: null, shippingTier: null, ShipmentServiceLevelCategory: null, ShipServiceLevel: null,
        amazon_shipment_service_level: null, summary: {}, pages: {}, pagesWithCloudflare: {}, pngGeneration: {}, pdfGeneration: {},
        bookSpecs: { testMode: true }, orderDetails: {}, characterSpecs: w0.input.characterSpecs,
        generatedAt: '2026-10-27T12:00:00.000Z', runStamp: `local-review-${role}`, workflow: 'local-review-fixture' } as BuildW4PrintInputResult;
      const keyMap = new Map<string, any>();
      keyMap.set(coverKey, rendered.pages.find((p: any) => p.role === role && p.label === 'cover'));
      plan.forEach((p: any, i: number) => keyMap.set(keys[i], rendered.pages.find((r: any) => r.role === role && r.label === p.label)));
      let writes = 0;
      const rawPdf = path.join(output, `${role}-raw.pdf`);
      const artifact = await buildGelatoPrintPdf(assertW4GelatoPrintInput(fixture), backend, {
        loadImage: async key => { const item = keyMap.get(key); assert.ok(item, `Unowned raster ${key}`); return checked(rasters, item.file, item.sha256); },
        putObject: async (key, stream) => {
          assert.match(key, new RegExp(`^${prefix}/gelato/print/v3/[a-f0-9]{24}\\.pdf$`)); assert.equal(++writes, 1);
          const handle = await fs.open(rawPdf, 'wx', 0o600), reader = stream.getReader();
          try { for (;;) { const part = await reader.read(); if (part.done) break; await writeAll(handle, part.value); } } finally { await handle.close(); }
        },
      });
      assert.equal(writes, 1); assert.equal(artifact.pageCount, 35);
      // Add explicit metadata after canonical assembly. This does not approve W4.
      const finalPdf = path.join(output, `${role}-PROVISIONAL-LOCAL-REVIEW.pdf`);
      const marker = spawnSync('python3', ['-c', 'from pypdf import PdfReader, PdfWriter\nimport sys\nr=PdfReader(sys.argv[1]); w=PdfWriter(); w.append_pages_from_reader(r); w.add_metadata({"/Title":"LOCAL PROVISIONAL REVIEW, NOT FOR PRINT", "/Subject":"Local fixture. Unapproved draft; production W4 refused."});\nwith open(sys.argv[2], "xb") as f: w.write(f)', rawPdf, finalPdf], { encoding:'utf8' });
      assert.equal(marker.status, 0, marker.stderr); await fs.unlink(rawPdf);
      const pdf = await read(finalPdf);
      receipts.push({ role, orderId: child.orderId, rootOrderId: child.rootOrderId, characterHash: child.characterHash, pdfFile: path.basename(finalPdf), pdfSha256: sha(pdf), pages: artifact.pageCount,
        approved:false, printReady:false, normalW4DraftRefused:true, localFixture:true, providerRequests:0 });
    }
    assert.equal(networkCalls, 0);
    assert.equal(sha(await read(path.join(proof, 'proof-manifest.json'))), sha(manifestBytes));
    assert.equal(sha(await read(rasterManifestPath)), rasterManifestSha256, 'Raster manifest changed during assembly');
    await fs.writeFile(path.join(output, 'review-receipts.json'), JSON.stringify({ schema:'lhb.local-custom-flow-review-pdfs@v1', proofManifestSha256:sha(manifestBytes), rasterManifestSha256, receipts,
      status:'local provisional review; not print-ready', approved:false, printReady:false, networkCalls, source:'Canonical PDF assembler called with explicit local fixture after normal W4 refused draft. Metadata added locally with pypdf.' }, null, 2) + '\n', { flag:'wx', mode:0o600 });
  } catch (error) { await fs.rm(output, { recursive:true }); throw error; }
  finally { globalThis.fetch = originalFetch; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  if (process.argv.length !== 5) throw new Error('Usage: assemble-inner-voice-custom-flow-review.ts PROOF RASTERS OUTPUT');
  assemble(process.argv[2], process.argv[3], process.argv[4]).catch(error => { console.error(error); process.exitCode = 1; });
}
