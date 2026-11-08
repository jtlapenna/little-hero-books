/**
 * Phase 006: recipe-level flow release approval gates readyForBook (W3) and W4 print input (rechecked at consumption).
 * Real bundled Inner Voice v3 with status flipped to active IN MEMORY (the file is never written); approval entries are
 * injected through the `flowApprovals` seams, built with real checksums and valid receipts. Offline.
 */
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { BookConfigSchema, type BookConfig } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { buildW4PrintInput } from '../src/lib/books/w4-print-input';
import { assertW4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
import { buildGelatoPrintPdf } from '../src/lib/books/build-gelato-print-pdf';
import { ordinaryPrintRoutingBlocker } from '../src/lib/books/gelato-print-admission';
import { computeBookConfigChecksum } from '../src/lib/books/runtime-book-config';
import { BUNDLED_APPROVALS, flowReleaseApprovalsSha256, sha256Hex, type FlowReleaseApprovalEntry } from '../src/lib/books/flow-release';
import { publishW3Manifest } from '../src/lib/workers/w3-manifest-publish';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

const BOOK_ID = 'book-finding-our-inner-voice';
const HOLD_MESSAGE = 'W4 print input rejected because flow layout fit is not yet verified';
const failed: string[] = [];
async function check(name: string, action: () => Promise<void> | void) {
  try { await action(); console.log('PASS', name); } catch (error) { failed.push(name); console.error('FAIL', name, String(error)); }
}

function activeV3(mutate?: (config: BookConfig) => void): BookConfig {
  const config = JSON.parse(JSON.stringify(loadBundledBookConfig({ bookId: BOOK_ID, version: 3 })));
  config.status = 'active'; // In memory only; the bundled file is never written.
  mutate?.(config);
  return BookConfigSchema.parse(config);
}

function entryFor(config: BookConfig, formatId: string, overrides: Partial<FlowReleaseApprovalEntry> = {}): FlowReleaseApprovalEntry {
  const configChecksum = computeBookConfigChecksum(config);
  const approvalQuote = `Approved ${configChecksum.slice(0, 12)} ${formatId}`;
  return {
    bookId: config.bookId, version: config.version, formatId, recipeSchema: 'lhb.book-render@v2', configChecksum,
    hostedFitReceipt: { orderId: 'SYNTHETIC', note: 'unit-test fixture' }, approvalQuote, approvedAt: '2026-11-06T00:00:00.000Z',
    approver: 'Jeff', approvalReceiptSha256: sha256Hex(approvalQuote), ...overrides,
  };
}

interface Prepared {
  config: BookConfig; formatId: string; orderId: string; prefix: string; w0: Record<string, unknown>;
  assemblyPreview: ReturnType<typeof buildW3PreviewPlan>; publishInput: Record<string, unknown>;
}
async function prepare(config: BookConfig, formatId: string, orderId: string, testMode = false): Promise<Prepared> {
  const hash = `synthetic-${orderId}`;
  const w0 = JSON.parse(JSON.stringify(buildW0RunManifestFromConfig(config, {
    orderId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', formatId, characterHash: hash,
    input: { ...(testMode ? { bookSpecs: { testMode: true } } : {}), characterSpecs: { childName: 'Alexandra', animalGuide: 'owl', pronouns: 'they/them', hometown: 'Grass Valley' } },
  })));
  const intake = normalizeW0Manifest(w0);
  const twoB = { characterHash: hash, order: { orderId, bookId: config.bookId }, entries: Object.values(config.rendering.recipe!.poses).map((pose) => ({
    poseNumber: pose.poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, pose.poseNumber, config.bookId),
  })) };
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, testMode, testModePages: 0 }, {
    loadManifest: async (key) => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? twoB : null,
  });
  const preview = buildW3PreviewPlan({ ...assembly, backendUrl: 'https://offline.example.test' });
  const pagePreviewImages = preview.pagePreviewItems.map((item) => ({ pageNumber: item.pageNumber, pageLabel: item.pageLabel, r2Key: item.pageImageR2Key }));
  return {
    config, formatId, orderId, prefix: `${config.bookId}/orders/${orderId}`, w0, assemblyPreview: preview,
    publishInput: { ...preview, renderSnapshot: intake.renderSnapshot, pagePreviewImages, coverPngR2Key: preview.coverPreviewItem.coverPngR2Key } as Record<string, unknown>,
  };
}

async function publish(p: Prepared, approvals?: readonly unknown[]) {
  const puts: Array<{ key: string; body: string }> = [];
  const patches: Array<Record<string, unknown>> = [];
  await publishW3Manifest(p.publishInput, {
    putObjectImpl: async (_bucket, key, body) => { puts.push({ key, body: String(body) }); },
    invalidateReviewImpl: async () => {}, getOrderImpl: async () => null,
    updateOrderImpl: async (_id, patch) => { patches.push(patch); return true; }, loadManifestImpl: async () => null,
    flowApprovals: approvals,
  });
  assert.equal(puts.length, 1); assert.equal(patches.length, 1);
  return { saved: JSON.parse(puts[0].body) as Record<string, any>, patch: patches[0] };
}

function consumer(p: Prepared, saved: Record<string, unknown>) {
  const print = p.config.formats[p.formatId].print;
  assert.equal(print.provider, 'gelato');
  const row = { orderId: p.orderId, root_order_id: p.orderId, print_provider: 'gelato', print_config_version: p.config.version,
    print_product_uid: print.productUid, print_inner_page_count: print.innerPageCount,
    print_api_page_count: print.apiPageCount, print_expected_pdf_page_count: print.expectedPdfPageCount };
  return (approvals?: readonly unknown[], three: Record<string, unknown> = saved) => buildW4PrintInput(
    { orderId: p.orderId, bookId: p.config.bookId, formatId: p.formatId, backendUrl: 'https://offline.example.test' }, {
      expectedProvider: 'gelato', loadOrder: async () => row, flowApprovals: approvals,
      loadManifest: async (key) => key === `${p.prefix}/manifests/1-manifest.json` ? p.w0 : key === `${p.prefix}/manifests/3-manifest.json` ? three : null,
    });
}

// Minimal solid RGB PNG (same encoding approach as test-gelato-print-pdf.ts).
const crcTable = Array.from({ length: 256 }, (_, index) => { let v = index; for (let b = 0; b < 8; b += 1) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1; return v >>> 0; });
const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = (v: number) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
function chunk(type: string, data: Uint8Array) {
  const t = new TextEncoder().encode(type); const payload = new Uint8Array(t.length + data.length); payload.set(t); payload.set(data, t.length);
  return new Uint8Array([...u32(data.length), ...payload, ...u32(crc32(payload))]);
}
function solidPng(width: number, height: number): Uint8Array {
  const rowLength = width * 3 + 1; const raw = new Uint8Array(rowLength * height);
  for (let y = 0; y < height; y += 1) raw.fill(255, y * rowLength + 1, (y + 1) * rowLength);
  const header = new Uint8Array(13); header.set(u32(width), 0); header.set(u32(height), 4); header[8] = 8; header[9] = 2;
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', header), ...chunk('IDAT', new Uint8Array(deflateSync(raw))), ...chunk('IEND', new Uint8Array())]);
}

async function main() {
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Offline test forbids network'); };
  assert.deepEqual([...BUNDLED_APPROVALS], [], 'bundled approvals stay empty');
  assert.equal(loadBundledBookConfig({ bookId: BOOK_ID, version: 3 }).status, 'active', 'bundled v3 is active; no approval entry exists');
  const config = activeV3();
  const pngs = { interior: solidPng(2625, 2625), cover: solidPng(5203, 2625) };

  for (const formatId of ['standard', 'amazon']) {
    const p = await prepare(config, formatId, `FLOWPRINT-${formatId.toUpperCase()}-A`);

    await check(`(a) no sign-off file, ${formatId}: W3 ready, W4 builds the input; admin stage approvals remain the gates`, async () => {
      const { saved, patch } = await publish(p);
      assert.equal(saved.summary.readyForBook, true);
      assert.equal(saved.testOnly, false);
      assert.equal(patch.next_workflow, '4');
      assert.ok(await consumer(p, saved)());
      assert.ok(await consumer(p, saved)([]));
      // A revoked bundled entry is the kill switch: it blocks W4 even for an already-ready manifest.
      const revokedNow = [entryFor(config, formatId, { revokedAt: '2026-11-07T00:00:00.000Z' })];
      await assert.rejects(consumer(p, saved)(revokedNow), { message: HOLD_MESSAGE });
    });

    await check(`(b) valid ${formatId} approval: ready, routes to W4, builds 35-page Gelato input, router blocks while drafts disabled`, async () => {
      const entry = entryFor(config, formatId);
      const approvals = [entry];
      const { saved, patch } = await publish(p, approvals);
      assert.equal(saved.summary.readyForBook, true);
      assert.equal(saved.testOnly, false);
      assert.equal(patch.next_workflow, '4');
      const printInput = assertW4GelatoPrintInput(await consumer(p, saved)(approvals));
      assert.equal(printInput.pagePlan.length, 32);
      assert.equal(printInput.pagePreviewImageKeys.length, 32);
      assert.equal(printInput.providerPrintConfig.expectedPdfPageCount, 35);
      const geometry = (printInput.providerPrintConfig as unknown as { printGeometryMm: { interiorCanvas: { w: number }; coverCanvas: { w: number } } }).printGeometryMm;
      assert.deepEqual(geometry, (config.formats[formatId].print as unknown as { printGeometryMm: unknown }).printGeometryMm);
      assert.equal(geometry.interiorCanvas.w, 206);
      assert.equal(geometry.coverCanvas.w, 409.03);
      assert.deepEqual(printInput.flowReleaseApproval, {
        approvalId: entry.approvalReceiptSha256, formatId, configChecksum: entry.configChecksum, approvalsFileSha256: flowReleaseApprovalsSha256(approvals),
      });
      // The 33 W3 rasters are the print master: build the 35-page PDF from correctly sized PNGs.
      const uploaded: Uint8Array[] = [];
      const pdf = await buildGelatoPrintPdf(printInput, 'https://admin.example.test', {
        loadImage: async (key) => key === printInput.coverPreviewImageKey ? pngs.cover : pngs.interior,
        putObject: async (_key, stream) => { const reader = stream.getReader(); for (;;) { const r = await reader.read(); if (r.done) break; uploaded.push(r.value); } },
        headObject: async () => false,
      });
      assert.equal(pdf.pageCount, 35);
      // Router/admission: approved W3 yields next_workflow '4'; the ordinary path still blocks while drafts are disabled.
      const routed = { ...patch, print_provider: 'gelato' };
      assert.equal(ordinaryPrintRoutingBlocker(routed, false), 'gelato_draft_submission_disabled');
      assert.equal(ordinaryPrintRoutingBlocker({ ...routed, next_workflow: null }, false), null, 'control: only routed orders are gated');
    });
  }

  const standard = await prepare(config, 'standard', 'FLOWPRINT-NEG');
  await check('(c) a revoke for the other format does not block this edition (both directions)', async () => {
    const amazonRevoked = [entryFor(config, 'amazon', { revokedAt: '2026-11-07T00:00:00.000Z' })];
    const { saved, patch } = await publish(standard, amazonRevoked);
    assert.equal(saved.summary.readyForBook, true); assert.equal(patch.next_workflow, '4');
    assert.ok(await consumer(standard, saved)(amazonRevoked));
    const amazon = await prepare(config, 'amazon', 'FLOWPRINT-NEG-AMZ');
    const standardRevoked = [entryFor(config, 'standard', { revokedAt: '2026-11-07T00:00:00.000Z' })];
    const out = await publish(amazon, standardRevoked);
    assert.equal(out.saved.summary.readyForBook, true);
    assert.ok(await consumer(amazon, out.saved)(standardRevoked));
  });

  await check('(c) revoked entry is rejected at W3 and W4', async () => {
    const revoked = [entryFor(config, 'standard', { revokedAt: '2026-11-07T00:00:00.000Z' })];
    const { saved } = await publish(standard, revoked);
    assert.equal(saved.summary.readyForBook, false);
    await assert.rejects(consumer(standard, saved)(revoked), { message: HOLD_MESSAGE });
  });

  await check('(c) revoke after publish: W4 recheck blocks the already-ready manifest', async () => {
    const { saved } = await publish(standard, []);
    assert.equal(saved.summary.readyForBook, true);
    assert.ok(await consumer(standard, saved)([]));
    await assert.rejects(consumer(standard, saved)([{ ...entryFor(config, 'standard'), revokedAt: '2026-11-07T00:00:00.000Z' }]), { message: HOLD_MESSAGE });
  });

  await check('(c) an edited active config still publishes: release is by allow-list and admin stages, not a config checksum', async () => {
    const edited = activeV3((c) => { c.displayName = `${c.displayName} edited`; });
    const p = await prepare(edited, 'standard', 'FLOWPRINT-EDITED');
    const { saved, patch } = await publish(p, []);
    assert.equal(saved.summary.readyForBook, true); assert.equal(patch.next_workflow, '4');
  });

  await check('(c) entry copied for another book id stays blocked (allow-list and bookId binding)', async () => {
    const copied = BookConfigSchema.parse(JSON.parse(JSON.stringify(activeV3()).split(BOOK_ID).join('book-contract-copy')));
    assert.equal(copied.bookId, 'book-contract-copy');
    const copiedEntry = entryFor(copied, 'standard');
    assert.equal(copiedEntry.bookId, 'book-contract-copy');
    const p = await prepare(copied, 'standard', 'FLOWPRINT-COPY');
    const built = buildW3Manifest(p.publishInput, { intake: normalizeW0Manifest(p.w0), flowApprovals: [copiedEntry] });
    assert.equal((built.manifest.summary as Record<string, unknown>).readyForBook, false);
    await assert.rejects(publishW3Manifest(p.publishInput, {
      putObjectImpl: async () => assert.fail('no write'), updateOrderImpl: async () => assert.fail('no write'), getOrderImpl: async () => null,
      invalidateReviewImpl: async () => assert.fail('no write'), loadManifestImpl: async () => null, flowApprovals: [copiedEntry],
    }), /Flow publication is not yet available/);
    // The original book's entry (with its checksum) does not approve the copy either.
    const mismatched = buildW3Manifest(p.publishInput, { intake: normalizeW0Manifest(p.w0), flowApprovals: [entryFor(config, 'standard', { bookId: 'book-contract-copy' })] });
    assert.equal((mismatched.manifest.summary as Record<string, unknown>).readyForBook, false);
  });

  await check('(c) testMode order with a valid entry stays held and unprintable', async () => {
    const approvals = [entryFor(config, 'standard')];
    const p = await prepare(config, 'standard', 'FLOWPRINT-TESTMODE', true);
    const { saved, patch } = await publish(p, approvals);
    assert.equal(saved.summary.readyForBook, false); assert.equal(saved.testOnly, true); assert.equal(patch.next_workflow, null);
    await assert.rejects(consumer(p, saved)(approvals), /saved summary.readyForBook is false/);
  });

  await check('(c) draft config with a valid-looking entry is rejected everywhere', async () => {
    const draft = BookConfigSchema.parse({ ...JSON.parse(JSON.stringify(loadBundledBookConfig({ bookId: BOOK_ID, version: 3 }))), status: 'draft' }); // draft in memory only
    assert.equal(draft.status, 'draft');
    const approvals = [entryFor(draft, 'standard')];
    const p = await prepare(draft, 'standard', 'FLOWPRINT-DRAFT', true);
    const built = buildW3Manifest(p.publishInput, { intake: normalizeW0Manifest(p.w0), flowApprovals: approvals });
    assert.equal((built.manifest.summary as Record<string, unknown>).readyForBook, false);
    assert.equal(built.manifest.testOnly, true);
    await assert.rejects(publishW3Manifest(p.publishInput, {
      putObjectImpl: async () => assert.fail('no write'), updateOrderImpl: async () => assert.fail('no write'), getOrderImpl: async () => null,
      invalidateReviewImpl: async () => assert.fail('no write'), loadManifestImpl: async () => null, flowApprovals: approvals,
    }), /Flow publication is not yet available/);
    await assert.rejects(consumer(p, built.manifest as Record<string, unknown>)(approvals), { message: HOLD_MESSAGE });
  });

  await check('(c) partial page selection with a valid entry stays held', async () => {
    const approvals = [entryFor(config, 'standard')];
    const p = await prepare(config, 'standard', 'FLOWPRINT-PARTIAL');
    const built = buildW3Manifest({ ...p.publishInput, testModePages: '1' }, { intake: normalizeW0Manifest(p.w0), flowApprovals: approvals });
    assert.equal((built.manifest.summary as Record<string, unknown>).readyForBook, false);
  });

  assert.equal(networkAttempts, 0);
  assert.deepEqual(failed, []);
  console.log('flow release print gate: all checks passed; network attempts 0');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
