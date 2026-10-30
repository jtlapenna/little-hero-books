import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveExternalProofOutput, writeExternalProof } from './helpers/external-proof-output';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { renderW3PreviewDocument } from '../src/lib/w3-pdfmonkey-preview';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

type RecordValue = Record<string, unknown>;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

async function main() {
  assert.equal(process.argv.length, 4, 'Usage: export-first-book-head-baseline.ts --output ABSOLUTE_EXTERNAL_OUTPUT');
  assert.equal(process.argv[2], '--output');
  const binding = resolveExternalProofOutput(process.argv[3]);
  const config = loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure', version: 1 });
  assert.equal(config.rendering.recipe, undefined, 'Baseline must use the historical renderer');
  const priorFetch = globalThis.fetch;
  let attemptedExternalRequests = 0;
  globalThis.fetch = async () => { attemptedExternalRequests++; throw new Error('Baseline forbids external requests'); };
  const results: RecordValue[] = [];
  const emitted: Array<{ relative: string; bytes: string }> = [];
  let syntheticCreateCalls = 0;
  const emitJson = (relative: string, value: unknown) => emitted.push({ relative, bytes: JSON.stringify(value, null, 2) + '\n' });
  try {
    const guides = ['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 't-rex', 'unicorn'];
    const names = ['A', 'James', 'Alexandra Isabella Montgomery', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW'];
    for (const formatId of ['standard', 'amazon'] as const) {
      for (const [index, guide] of guides.entries()) {
        const id = `HEAD-FIRST-${formatId}-${guide}`;
        const characterHash = `synthetic-head-child-${index}`;
        const specs = { childName: names[index % names.length], animalGuide: guide,
          pronouns: ['she/her', 'he/him', 'they/them'][index % 3], hometown: index % 2 ? 'Grass Valley' : '',
          skinTone: 'deep', hairStyle: 'afro', hairColor: 'black', favoriteColor: 'purple' };
        const dedication = index % 2 ? 'For you.\nKeep listening to your heart.' : '';
        const w0 = buildW0RunManifestFromConfig(config, { orderId: id, platform: formatId === 'amazon' ? 'amazon' : 'd2c',
          amazonOrderId: formatId === 'amazon' ? id : null, formatId, characterHash, runId: 'head-baseline-fixed',
          createdAt: '2026-10-30T00:00:00.000Z', input: { characterSpecs: specs, bookSpecs: {}, dedicationText: dedication } });
        const w2b = { characterHash, order: { orderId: id, characterHash, characterSpecs: specs, bookSpecs: {} },
          entries: Array.from({ length: 12 }, (_, i) => ({ poseNumber: i + 1,
            bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, i + 1, config.bookId), briaStatus: 'completed' })) };
        const prefix = `${config.bookId}/orders/${id}`;
        const assembly = await buildW3AssemblyInput({ orderId: id, bookId: config.bookId, formatId, orderPrefix: prefix,
          backendUrl: 'https://baseline.example.test' }, {
          loadManifest: async key => key === w0.artifacts.manifestKey ? w0 : key === `${prefix}/manifests/2b-manifest.json` ? w2b : null,
          normalizePoseScale: async ({ poseNumber, imageKey }) => ({ success: true, normalized: false, imageKey,
            refKey: '', poseNumber, bookId: config.bookId, message: 'Synthetic no-byte baseline boundary',
            scaleFactor: 1, verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0,
            sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true }),
        });
        const preview = buildW3PreviewPlan({ ...assembly, runStamp: 'head-baseline-fixed', runId: 'head-baseline-fixed' });
        assert.equal(preview.pagePreviewItems.length, formatId === 'amazon' ? 17 : 15);
        assert.equal(preview.bookId, config.bookId);
        const captureRequest = async (input: Parameters<typeof renderW3PreviewDocument>[0]) => {
          let body: RecordValue | undefined;
          await renderW3PreviewDocument(input, { pdfMonkeyApiKey: 'synthetic-baseline-no-provider-key',
            fetchImpl: async (url, init) => {
              assert.equal(String(url), 'https://api.pdfmonkey.io/api/v1/documents');
              assert.equal(init?.method, 'POST');
              assert.equal(body, undefined, 'Synthetic successful document needs one create, no polling');
              body = JSON.parse(String(init?.body)) as RecordValue;
              syntheticCreateCalls++;
              return Response.json({ document: { id: 'synthetic-baseline-document', status: 'success',
                download_url: 'https://baseline.example.test/no-image-bytes.png' } });
            }, sleep: async () => { throw new Error('Baseline must not poll'); },
            recordWorkflowEvent: async () => { throw new Error('Baseline must not persist events'); },
          });
          assert.ok(body);
          return body;
        };
        const pages: RecordValue[] = [];
        for (const page of preview.pagePreviewItems) {
          const request = await captureRequest({ ...page, documentKind: 'page-preview' });
          emitJson(`${id}/${page.pageLabel}.request.json`, request);
          emitted.push({ relative: `${id}/${page.pageLabel}.html`, bytes: page.pageHtml });
          pages.push({ label: page.pageLabel, index: page.pageIndex, htmlSha256: sha(page.pageHtml),
            templateId: page.pdfMonkeyImageTemplateId, outputKey: page.pageImageR2Key });
        }
        const cover = preview.coverPreviewItem;
        emitJson(`${id}/cover.request.json`, await captureRequest({ ...cover, documentKind: 'cover-preview' }));
        emitted.push({ relative: `${id}/cover.html`, bytes: cover.coverHTML });
        emitted.push({ relative: `${id}/page.css`, bytes: preview.page_css });
        emitJson(`${id}/w0.json`, w0);
        emitJson(`${id}/synthetic-2b.json`, w2b);
        emitJson(`${id}/assembly.json`, assembly);
        emitJson(`${id}/render-contract.json`, { storyTexts: preview.storyTexts, pagePlan: assembly.pagePlan,
          backgroundImages: preview.backgroundImages, overlayImages: preview.overlayImages,
          animalImages: preview.animalImages, coverSpreadImagePath: preview.coverSpreadImagePath,
          characterPlacement: config.rendering.characterPlacement, animalPlacement: config.rendering.animalPlacement,
          coverCharacterPlacement: config.rendering.coverCharacterPlacement, preview: config.rendering.preview,
          finalTemplates: config.formats[formatId].templates, fonts: config.assets.fonts,
          sourceScope: 'Exact HEAD behavioral request baseline; no image/PDF bytes or visual acceptance' });
        results.push({ id, formatId, input: specs, dedication, pages, cover: { templateId: cover.pdfMonkeyCoverTemplateId,
          htmlSha256: sha(cover.coverHTML), outputKey: cover.coverImageR2Key }, trailType: preview.trailType,
          animalDisplayName: preview.animalDisplayName, pronouns: preview.pronounsResolved });
      }
    }
    assert.equal(attemptedExternalRequests, 0);
    assert.equal(syntheticCreateCalls, 272);
    emitJson('baseline.json', { schema: 'lhb.first-book-head-baseline@1', bookId: config.bookId, configVersion: 1,
      label: 'HEAD behavioral baseline, not accepted hosted or visual evidence', cases: results,
      syntheticBoundaries: ['image generation', 'background removal', 'pose normalization', 'PDFMonkey create response'],
      sourceProducerPath: ['W0 bundled builder', 'W3 manifest assembly', 'W3 preview planner', 'W3 PDFMonkey request builder'],
      externalRequests: attemptedExternalRequests, interceptedSyntheticCreateCalls: syntheticCreateCalls,
      hostedRecordsCreated: 0, uploadedAssets: 0, ordersPlaced: 0, visualParityEstablished: false,
      limitations: ['No image/PDF bytes rendered', 'Font and local asset alias equivalence needs separate evidence',
        'Template snapshots not verified against current hosted versions'] });
    writeExternalProof(binding, () => {
      for (const file of emitted) {
        const destination = join(binding.output, file.relative);
        mkdirSync(join(destination, '..'), { recursive: true, mode: 0o700 });
        writeFileSync(destination, file.bytes, { flag: 'wx', mode: 0o600 });
      }
    });
    console.log(JSON.stringify({ cases: results.length, pageRequests: 256, coverRequests: 16,
      externalRequests: 0, visualParityEstablished: false, output: binding.output }));
  } finally { globalThis.fetch = priorFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
