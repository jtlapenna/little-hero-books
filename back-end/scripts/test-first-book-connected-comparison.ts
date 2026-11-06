import assert from 'node:assert/strict';
import { buildW0RunManifest, buildW2APoseInput, buildW2BPoseInput, buildW2BWorklist, loadBundledBookConfig } from '../src/lib/books';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { buildW4PrintInput } from '../src/lib/books/w4-print-input';
import { buildManifestKeyFromOrderPrefix, buildOrderPrefix } from '../src/lib/order-paths';

// In-memory stage boundaries imitate successful image generation, approval,
// background removal and preview rendering. They do not attest to image bytes.
const bookId = 'book-mvp-simple-adventure';
const amazonSiblingA = 'LOCAL-FIRST-AMAZON-A';
const amazonSiblingB = 'LOCAL-FIRST-AMAZON-B';
const cases = [
  { id: 'LOCAL-FIRST-WEB', root: 'LOCAL-FIRST-WEB', format: 'standard', name: 'Ada', guide: 'owl', pronouns: 'she/her', town: 'Portland', dedication: 'For Ada' },
  { id: 'LOCAL-FIRST-AMAZON-SINGLE-ITEM', root: 'LOCAL-FIRST-AMAZON-SINGLE-ROOT', format: 'amazon', name: 'Dara', guide: 'unicorn', pronouns: 'she/her', town: 'Bend', dedication: 'For Dara' },
  { id: amazonSiblingA, root: 'LOCAL-FIRST-AMAZON', format: 'amazon', name: 'Bea', guide: 'cat', pronouns: 'he/him', town: 'Salem', dedication: 'For Bea' },
  { id: amazonSiblingB, root: 'LOCAL-FIRST-AMAZON', format: 'amazon', name: 'Cleo', guide: 'dog', pronouns: 'they/them', town: 'Eugene', dedication: 'For Cleo' },
] as const;

async function main() {
  const outputs: Array<{ id: string; w0: unknown; w2b: Record<string, unknown> }> = [];
  for (const c of cases) {
    const hash = `local${c.name.toLowerCase()}hash`;
    const amazon = c.format === 'amazon' ? c.root : null;
    const prefix = buildOrderPrefix(c.id, bookId);
    const key = (stage: string) => buildManifestKeyFromOrderPrefix(prefix, stage as '1' | '2a' | '2b' | '3');
    const specs = { childName: c.name, animalGuide: c.guide, pronouns: c.pronouns, hometown: c.town, skinTone: 'medium', hairStyle: 'short', hairColor: 'brown' };
    const w0 = buildW0RunManifest({ orderId: c.id, rootOrderId: c.root, amazonOrderId: amazon, platform: amazon ? 'amazon' : 'd2c', bookId, formatId: c.format, characterHash: hash, input: { characterSpecs: specs, bookSpecs: {}, orderDetails: { quantity: 1 }, dedicationText: c.dedication } });
    const frozenSpecs = w0.input.characterSpecs;
    assert.deepEqual(frozenSpecs, specs);
    const generated = [];
    for (let poseNumber = 1; poseNumber <= 12; poseNumber++) {
      const pose = await buildW2APoseInput({ orderId: c.id, rootOrderId: c.root, amazonOrderId: amazon, bookId, characterHash: hash, characterSpecs: frozenSpecs, poseNumber }, { loadConfig: async ({ bookId, version }) => loadBundledBookConfig({ bookId, version }) });
      assert.equal(pose.poseNumber, poseNumber);
      assert.ok(pose.uploadKey.includes(hash));
      generated.push({ poseNumber, approved: true, status: 'approved', approvedKey: pose.uploadKey });
    }
    const w2a = { order: { orderId: c.id, rootOrderId: c.root, amazonOrderId: amazon, characterHash: hash }, characterHash: hash, entries: generated };
    const work = await buildW2BWorklist({ orderId: c.id, rootOrderId: c.root, amazonOrderId: amazon, orderPrefix: prefix, bookId, backendUrl: 'https://example.invalid' }, { loadManifest: async (k) => k === key('2a') ? w2a : null });
    assert.equal(work.workItems.length, 12);
    const entries = work.workItems.map(item => {
      const result = buildW2BPoseInput(item);
      assert.ok(result.bgRemovedKey.includes(hash));
      return { poseNumber: result.poseNumber, bgRemovedKey: result.bgRemovedKey, sourceApprovedKey: item.approvedKey, briaStatus: 'completed' };
    });
    const w2b = { characterHash: hash, order: { orderId: c.id, rootOrderId: c.root, amazonOrderId: amazon, characterHash: hash, characterSpecs: frozenSpecs, bookSpecs: {}, orderDetails: { quantity: 1 } }, entries };
    const manifests = new Map<string, unknown>([[key('1'), w0], [key('2b'), w2b]]);
    const loadManifest = async (k: string) => manifests.get(k) as Record<string, unknown> | undefined ?? null;
    const normalizePoseScale = async ({ poseNumber, imageKey }: { poseNumber: number; imageKey: string }) => ({ success: true, normalized: false, imageKey, refKey: '', poseNumber, bookId, message: 'synthetic adapter', scaleFactor: 1, verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0, sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true });
    const assembly = await buildW3AssemblyInput({ orderId: c.id, rootOrderId: c.root, amazonOrderId: amazon, orderPrefix: prefix, bookId, backendUrl: 'https://example.invalid' }, { loadManifest, normalizePoseScale });
    const preview = buildW3PreviewPlan(assembly);
    assert.equal(preview.pagePreviewItems.length, c.format === 'amazon' ? 17 : 15);
    assert.ok(preview.pages_html.includes(c.name), `${c.id} child name`);
    assert.ok(preview.pages_html.includes(c.town), `${c.id} hometown`);
    assert.equal(assembly.dedicationText, c.dedication, `${c.id} dedication at assembly`);
    assert.ok(preview.pagePreviewItems[c.format === 'standard' ? 0 : 2].pageHtml.replace(/\u00a0/g, ' ').includes(c.dedication), `${c.id} rendered dedication`);
    assert.equal(preview.pronounsExtracted, c.pronouns);
    const expectedPossessive = c.pronouns === 'she/her' ? 'her' : c.pronouns === 'he/him' ? 'his' : 'their';
    assert.match(preview.pages_html, new RegExp(`closed ${expectedPossessive} eyes`));
    assert.equal(String(preview.animalDisplayName).toLowerCase(), c.guide);
    const pagePreviewImages = preview.pagePreviewItems.map(item => ({ orderId: item.orderId, rootOrderId: item.rootOrderId, amazonOrderId: item.amazonOrderId, pageNumber: item.pageNumber, r2Key: item.pageImageR2Key, filename: item.pageImageFilename, imageUrl: `https://example.invalid/${item.pageImageR2Key}` }));
    const built = buildW3Manifest({ ...preview, pagePreviewImages, coverPngR2Key: preview.coverPreviewItem.coverPngR2Key });
    manifests.set(key('3'), built.manifest);
    // W4 builds print inputs only. No PDF generation or print submission occurs.
    const print = await buildW4PrintInput({ orderId: c.id, rootOrderId: c.root, amazonOrderId: amazon, orderPrefix: prefix, manifest3Key: key('3'), bookId }, { loadManifest, loadOrder: async () => ({ orderId: c.id, print_provider: 'lulu' }) });
    assert.equal(print.orderId, c.id);
    assert.equal(print.rootOrderId, c.root);
    assert.equal(print.amazonOrderId, amazon);
    assert.equal(print.expectedPageCount, c.format === 'amazon' ? 17 : 15);
    await assert.rejects(() => buildW4PrintInput({ orderId: c.id, manifest3Key: key('3'), bookId }, { loadManifest: async () => null, loadOrder: async () => null }), /could not load the 3-manifest/);
    outputs.push({ id: c.id, w0, w2b });
  }
  const sibling = cases.find(c => c.id === amazonSiblingA)!;
  const siblingOutput = outputs.find(c => c.id === amazonSiblingA)!;
  const otherSiblingOutput = outputs.find(c => c.id === amazonSiblingB)!;
  assert.notDeepEqual(siblingOutput.w0, otherSiblingOutput.w0);
  const prefix = buildOrderPrefix(sibling.id, bookId);
  const mismatchLoader = async (k: string) => k.endsWith('/1-manifest.json') ? siblingOutput.w0 as Record<string, unknown> : k.endsWith('/2b-manifest.json') ? otherSiblingOutput.w2b : null;
  await assert.rejects(() => buildW3AssemblyInput({ orderId: sibling.id, orderPrefix: prefix, bookId }, { loadManifest: async () => null }), /manifest/i);
  // A sibling's manifest must never become this child's assembly input.
  await assert.rejects(() => buildW3AssemblyInput({ orderId: sibling.id, rootOrderId: sibling.root, amazonOrderId: sibling.root, orderPrefix: prefix, bookId }, { loadManifest: mismatchLoader, normalizePoseScale: async ({ imageKey, poseNumber }) => ({ success: true, normalized: false, imageKey, refKey: '', poseNumber, bookId, message: 'synthetic adapter', scaleFactor: 1, verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0, sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true }) }), /identity|mismatch|character|sibling/i, 'W3 must reject a 2B manifest for a different sibling');
  console.log('First-book connected builder comparison passed: website, Amazon single and siblings; W0, W2A pose input, W2B worklist/pose input, W3 assembly/HTML/manifest, W4 print input. Image generation, approval, background removal, preview images and normalization were synthetic; no bytes, provider, hosted workflow or submission tested.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
