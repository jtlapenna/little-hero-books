/** Flow publication gate (allow-list + active) and approval-entry validator, through W0 -> W3 assembly -> publish -> consumers. Offline. */
import assert from 'node:assert/strict';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { BookConfigSchema, type BookConfig } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { computeBookConfigChecksum } from '../src/lib/books/runtime-book-config';
import {
  BUNDLED_APPROVALS, FLOW_PUBLICATION_ALLOWLIST, flowPublicationAllowed, flowReleaseApprovalsProblems,
  hasRecordedFlowReleaseApproval, sha256Hex, type FlowReleaseApprovalEntry,
} from '../src/lib/books/flow-release';
import { publishW3Manifest } from '../src/lib/workers/w3-manifest-publish';
import { buildCustomerPreviewFiles } from '../src/lib/customer-preview-files';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { configuredBookRaw } from './configured-book-fixture';

const BOOK_ID = 'book-finding-our-inner-voice';
const failed: string[] = [];
async function check(name: string, action: () => Promise<void> | void) {
  try { await action(); console.log('PASS', name); } catch (error) { failed.push(name); console.error('FAIL', name, String(error)); }
}

function activeV3(): BookConfig {
  const config = BookConfigSchema.parse(JSON.parse(JSON.stringify(loadBundledBookConfig({ bookId: BOOK_ID, version: 3 }))));
  return BookConfigSchema.parse({ ...config, status: 'active' }); // In memory only; the bundled file is never written.
}

/** Real producer chain: W0 manifest -> normalized intake -> W3 assembly input -> W3 preview plan -> publish input. */
async function publishInput(config: BookConfig, formatId: string, orderId: string, extra: Record<string, unknown> = {}, testMode = false) {
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
    input: { ...preview, renderSnapshot: intake.renderSnapshot, pagePreviewImages, coverPngR2Key: preview.coverPreviewItem.coverPngR2Key, ...extra } as Record<string, unknown>,
    w0, twoB, pageCount: pagePreviewImages.length, prefix: `${config.bookId}/orders/${orderId}`,
  };
}

interface Effects { puts: Array<{ key: string; body: string }>; patches: Array<Record<string, unknown>>; invalidated: number }
async function publish(input: Record<string, unknown>, order: Record<string, unknown> | null = null) {
  const effects: Effects = { puts: [], patches: [], invalidated: 0 };
  const result = await publishW3Manifest(input, {
    putObjectImpl: async (_bucket, key, body) => { effects.puts.push({ key, body: String(body) }); },
    invalidateReviewImpl: async () => { effects.invalidated++; },
    getOrderImpl: async () => order,
    updateOrderImpl: async (_id, patch) => { effects.patches.push(patch); return true; },
    loadManifestImpl: async () => null,
  });
  return { result, effects };
}
const noEffects = (e: Effects) => assert.equal(e.puts.length + e.patches.length + e.invalidated, 0);

function entryFor(config: BookConfig, formatId: string, overrides: Partial<FlowReleaseApprovalEntry> = {}): FlowReleaseApprovalEntry {
  const configChecksum = computeBookConfigChecksum(config);
  const approvalQuote = `Approved: ${configChecksum.slice(0, 12)} standard and amazon`;
  return {
    bookId: config.bookId, version: config.version, formatId, recipeSchema: 'lhb.book-render@v2', configChecksum,
    hostedFitReceipt: { orderId: 'SYNTHETIC', note: 'unit-test fixture' }, approvalQuote, approvedAt: '2026-11-06T00:00:00.000Z',
    approver: 'Jeff', approvalReceiptSha256: sha256Hex(approvalQuote), ...overrides,
  };
}

async function main() {
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Offline test forbids network'); };
  const config = activeV3();

  await check('allow-list is exactly the Inner Voice book and the bundled approvals file is empty and valid', () => {
    assert.deepEqual([...FLOW_PUBLICATION_ALLOWLIST], [BOOK_ID]);
    assert.deepEqual([...BUNDLED_APPROVALS], []);
    assert.deepEqual(flowReleaseApprovalsProblems(BUNDLED_APPROVALS), []);
    assert.equal(loadBundledBookConfig({ bookId: BOOK_ID, version: 3 }).status, 'active', 'bundled v3 is active (r3 plus one status line); no approval entry exists');
  });

  await check('flowPublicationAllowed needs allow-list AND active', () => {
    assert.equal(flowPublicationAllowed(config), true);
    assert.equal(flowPublicationAllowed({ bookId: BOOK_ID, status: 'draft' }), false);
    assert.equal(flowPublicationAllowed({ bookId: BOOK_ID, status: 'archived' }), false);
    assert.equal(flowPublicationAllowed({ bookId: 'book-contract-fixture', status: 'active' }), false);
    assert.equal(flowPublicationAllowed({ bookId: `${BOOK_ID}-copy`, status: 'active' }), false);
  });

  for (const formatId of ['standard', 'amazon']) {
    await check(`allow-listed active v3 publishes (${formatId}): 33 keys, admin stage approvals remain the gates`, async () => {
      const orderId = `FLOWREL-${formatId.toUpperCase()}-1`;
      const { input, pageCount, prefix } = await publishInput(config, formatId, orderId);
      assert.equal(pageCount, 32);
      const { result, effects } = await publish(input);
      assert.equal(effects.puts.length, 1);
      assert.equal(effects.puts[0].key, `${prefix}/manifests/3-manifest.json`);
      const saved = JSON.parse(effects.puts[0].body);
      assert.equal(saved.summary.readyForBook, true);
      assert.equal(saved.testOnly, false);
      assert.equal(saved.formatId, formatId);
      const keys = [saved.pngGeneration.coverSpreadImage, ...Object.values(saved.pngGeneration.pages as Record<string, string>)] as string[];
      assert.equal(keys.length, 33);
      assert(keys.every((key) => key.startsWith(`${prefix}/preview-images/`)));
      assert(keys.includes(`${prefix}/preview-images/cover-spread.png`));
      assert.equal(effects.patches.length, 1);
      assert.equal(effects.patches[0].next_workflow, '4');
      assert.equal(effects.patches[0].workflow_step, 'book_assembly_completed');
      assert.equal(effects.invalidated, 1);
      assert.equal(result.manifestReady, true);
      // Customer preview opens for a ready, non-test manifest; a test-only marker still closes it.
      process.env.BACKEND_API_TOKEN = `unit-test-${'x'.repeat(40)}`;
      const open = await buildCustomerPreviewFiles(saved, prefix, new Date(Date.now() + 600_000).toISOString());
      assert.equal(open.ready, true);
      const control = JSON.parse(JSON.stringify(saved));
      control.testOnly = true; control.summary.readyForBook = false;
      assert.equal((await buildCustomerPreviewFiles(control, prefix, new Date(Date.now() + 600_000).toISOString())).ready, false, 'control: testOnly closes the preview');
    });
  }

  await check('a postBria-stage order keeps its stage on publish (W4 admission is gated by the admin stage approvals)', async () => {
    const { input } = await publishInput(config, 'standard', 'FLOWREL-POSTBRIA');
    const order = { orderId: 'FLOWREL-POSTBRIA', status: 'pending_bg_removal_review', review_stages: { postBria: { status: 'in-review' } } };
    const { effects } = await publish(input, order);
    const patch = effects.patches[0];
    assert.equal(patch.next_workflow, '4', 'ready flow book queues for W4 like any configured book; W4 print input still requires the admin stage approvals');
    assert.deepEqual((patch.review_stages as Record<string, unknown>).postBria, { status: 'in-review' }, 'postBria stage untouched');
  });

  await check('non-allow-listed flow config still throws the original message with zero effects', async () => {
    const raw = configuredBookRaw();
    raw.rendering.recipe.schema = 'lhb.book-render@v2';
    raw.rendering.recipe.copy.title = { id: 'headline', text: '[Child Name] flies.', placement: { left: 0, top: 0, width: 500, height: 200 }, fontSize: 50,
      flow: { paragraphs: [{ runs: [{ text: '[Child Name] flies.' }] }] } };
    const flowConfig = BookConfigSchema.parse(raw);
    assert.equal(flowConfig.status, 'active');
    assert.equal(flowPublicationAllowed(flowConfig), false);
    const hash = 'testhash', orderId = 'FLOWREL-OTHER';
    const w0 = JSON.parse(JSON.stringify(buildW0RunManifestFromConfig(flowConfig, { orderId, platform: 'd2c', characterHash: hash,
      input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } })));
    const snapshot = normalizeW0Manifest(w0).renderSnapshot;
    const effects: Effects = { puts: [], patches: [], invalidated: 0 };
    await assert.rejects(() => publishW3Manifest({ orderId, bookId: flowConfig.bookId, renderSnapshot: snapshot, pagePreviewImages: [] }, {
      putObjectImpl: async () => { effects.puts.push({ key: '', body: '' }); }, getOrderImpl: async () => { effects.invalidated++; return null; },
      updateOrderImpl: async () => { effects.patches.push({}); return true; }, invalidateReviewImpl: async () => { effects.invalidated++; },
      loadManifestImpl: async () => null,
    }), /Flow publication is not yet available/);
    noEffects(effects);
  });

  await check('allow-listed but DRAFT config still throws, names the book, zero effects', async () => {
    const draft = BookConfigSchema.parse({ ...JSON.parse(JSON.stringify(loadBundledBookConfig({ bookId: BOOK_ID, version: 3 }))), status: 'draft' }); // draft in memory only
    assert.equal(draft.status, 'draft');
    const { input } = await publishInput(draft, 'standard', 'FLOWREL-DRAFT', {}, true);
    const effects: Effects = { puts: [], patches: [], invalidated: 0 };
    await assert.rejects(() => publishW3Manifest(input, {
      putObjectImpl: async () => { effects.puts.push({ key: '', body: '' }); }, getOrderImpl: async () => null,
      updateOrderImpl: async () => { effects.patches.push({}); return true; }, invalidateReviewImpl: async () => { effects.invalidated++; },
      loadManifestImpl: async () => null,
    }), (error: unknown) => /Flow publication is not yet available/.test(String(error)) && String(error).includes(BOOK_ID));
    noEffects(effects);
  });

  await check('release gate: allow-listed active flow config passes with no sign-off file; revoke is a kill switch', () => {
    const good = entryFor(config, 'standard');
    assert.deepEqual(flowReleaseApprovalsProblems([good]), []);
    assert.equal(hasRecordedFlowReleaseApproval(config, 'standard'), true, 'empty bundled file does not block');
    assert.equal(hasRecordedFlowReleaseApproval(config, 'amazon'), true);
    assert.equal(hasRecordedFlowReleaseApproval(config, 'standard', [good]), true);
    const revoked = { ...good, revokedAt: '2026-11-07T00:00:00.000Z' };
    assert.equal(hasRecordedFlowReleaseApproval(config, 'standard', [revoked]), false, 'revoked entry blocks that format');
    assert.equal(hasRecordedFlowReleaseApproval(config, 'amazon', [revoked]), true, 'revoke is per format');
    assert.equal(hasRecordedFlowReleaseApproval(config, 'standard', [{ ...revoked, version: 2 }]), true, 'revoke is per version');
    assert.equal(hasRecordedFlowReleaseApproval(config, 'standard', [{ ...revoked, bookId: 'other' }]), true, 'revoke is per book');
    const draft = BookConfigSchema.parse({ ...config, status: 'draft' });
    assert.equal(hasRecordedFlowReleaseApproval(draft, 'standard'), false, 'draft config');
    const copied = BookConfigSchema.parse({ ...config, bookId: 'book-contract-copy' });
    assert.equal(hasRecordedFlowReleaseApproval(copied, 'standard'), false, 'not allow-listed');
    assert.equal(hasRecordedFlowReleaseApproval(config, 'standard', 'nope' as unknown as unknown[]), false);
  });

  await check('checksum ignores object key order but not values', () => {
    const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as object).reverse().map(([k, v]) => [k, reorder(v)])) : value;
    const reordered = reorder(JSON.parse(JSON.stringify(config))) as BookConfig;
    assert.notEqual(JSON.stringify(reordered), JSON.stringify(config));
    assert.equal(computeBookConfigChecksum(reordered), computeBookConfigChecksum(config));
    assert.equal(hasRecordedFlowReleaseApproval(reordered, 'amazon', [entryFor(config, 'amazon')]), true);
  });

  await check('entry validity rules (shape and traceability)', () => {
    const good = entryFor(config, 'standard');
    const problems = (entry: unknown) => flowReleaseApprovalsProblems([entry]).join(';');
    assert.match(problems({ ...good, approvalQuote: 'approved, no checksum' }), /checksum prefix/);
    assert.match(problems({ ...good, approvalQuote: '' }), /approvalQuote empty/);
    assert.match(problems({ ...good, approvalReceiptSha256: sha256Hex('something else') }), /does not match approvalQuote/);
    assert.match(problems({ ...good, approvalReceiptSha256: 'abc' }), /64 hex/);
    const { hostedFitReceipt: _drop, ...noReceipt } = good;
    assert.match(problems(noReceipt), /hostedFitReceipt missing/);
    assert.match(problems({ ...good, hostedFitReceipt: {} }), /hostedFitReceipt missing/);
    assert.match(problems({ ...good, approvedAt: 'yesterday' }), /approvedAt/);
    assert.match(problems({ ...good, approver: ' ' }), /approver/);
    assert.match(problems({ ...good, recipeSchema: 'lhb.book-render@v1' }), /recipeSchema/);
    assert.match(problems({ ...good, configChecksum: 'ABC' }), /configChecksum/);
    assert.match(problems({ ...good, revokedAt: 'x' }), /revokedAt/);
    assert.match(problems(null), /not an object/);
    assert.deepEqual(flowReleaseApprovalsProblems({}), ['approvals must be an array']);
    // A malformed entry has no effect on the gate.
    assert.equal(hasRecordedFlowReleaseApproval(config, 'standard', [{ ...good, approvalQuote: 'no prefix', approvalReceiptSha256: sha256Hex('no prefix') }]), true);
  });

  await check('injected approvals do not change whether publication happens (readiness is covered by test-flow-release-print.ts)', async () => {
    const { input } = await publishInput(config, 'standard', 'FLOWREL-INJECT');
    const effects: Effects = { puts: [], patches: [], invalidated: 0 };
    await publishW3Manifest(input, {
      putObjectImpl: async (_b, key, body) => { effects.puts.push({ key, body: String(body) }); }, getOrderImpl: async () => null,
      updateOrderImpl: async (_id, patch) => { effects.patches.push(patch); return true; }, invalidateReviewImpl: async () => {},
      loadManifestImpl: async () => null, flowApprovals: [entryFor(config, 'standard')],
    });
    assert.equal(effects.patches.length, 1);
  });

  assert.equal(networkAttempts, 0);
  assert.deepEqual(failed, []);
  console.log('flow release gate: all checks passed; network attempts 0');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
