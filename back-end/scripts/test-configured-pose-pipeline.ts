import assert from 'node:assert/strict';
import { parsePublishedBookConfigRow, canFallbackToBundled, PublishedBookConfigError } from '../src/lib/books/runtime-book-config';
import { configuredBookFixture } from './configured-book-fixture';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { resolveW2APoseWorklistResponse } from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import { attachWorkflowJobsToW2AWorkItems, type W2APoseJobRepository } from '../src/lib/workflow-jobs/w2a-pose-jobs';
import type { WorkflowJobRecord } from '../src/lib/workflow-jobs/types';
import { buildW2APoseInput } from '../src/lib/books/w2a-pose-input';
import { buildW2ABaseInput } from '../src/lib/books/w2a-base-input';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import type { NormalizePoseScaleFn } from '../src/lib/pose-scale-normalization';
import { read2BManifestWithPoseRequirements } from '../src/lib/books/read-2b-manifest';
import { readOrderPoseContext, orderReviewPoseNumbers } from '../src/lib/books/order-pose-context';

async function main() {
  const config = configuredBookFixture();
  const orderId = 'FROZEN-POSE-01';
  const prefix = `${config.bookId}/orders/${orderId}`;
  const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: 'd2c', formatId: 'standard', characterHash: 'fixturehash', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl', hairStyle: 'side-part', skinTone: 'medium' } } });
  const oneKey = `${prefix}/manifests/1-manifest.json`;
  const stored: Record<string, unknown>[] = [];
  const unused = async () => { throw new Error('Unexpected repository call'); };
  const repo: W2APoseJobRepository = {
    enqueueWorkflowJob: async input => {
      stored.push(input.normalizedInputSnapshot!);
      return { id: stored.length, status: 'queued', idempotency_key: input.idempotencyKey } as WorkflowJobRecord;
    },
    getWorkflowJobById: async () => null, getWorkflowJobByIdempotencyKey: async () => null,
    claimWorkflowJob: unused, incrementWorkflowJobAttemptCount: unused, createWorkflowJobAttempt: unused,
    markWorkflowJobRunning: unused, appendWorkflowJobEvent: async () => ({ id: 1 } as Awaited<ReturnType<W2APoseJobRepository['appendWorkflowJobEvent']>>),
  };
  const worklist = await resolveW2APoseWorklistResponse({ orderId, bookId: config.bookId, formatId: 'standard', oneManifestUrl: oneKey }, {
    downloadOneManifest: async () => w0,
    instrumentPoseWorkItems: p => attachWorkflowJobsToW2AWorkItems({ orderId, bookId: config.bookId, workItems: p.poseWorklist }, repo),
  });
  assert.deepEqual(worklist.poseWorklist.map(p => p.poseNumber), [0,13,17,18]);
  assert.ok(stored[1].renderSnapshot, 'Persisted recovery job must keep the W0 snapshot');
  config.rendering.recipe!.poses['custom-run'].referenceKey = `${config.bookId}/LATEST-WRONG.png`;
  let reloads = 0;
  const generated = await buildW2APoseInput({ ...stored[1], characterHash: 'fixturehash', characterSpecs: { childName: 'Ada', skinTone: 'medium' }, retryAttempt: 1 }, { loadConfig: async () => { reloads++; return config; } });
  assert.equal(reloads, 0, 'Recovered configured job must not reload mutable config');
  assert.equal(generated.poseRefKey, `${config.bookId}/characters/references/custom-run.png`);
  assert.ok(generated.uploadKey.endsWith('pose13_r1.png'));
  const base = await buildW2ABaseInput({ orderId, bookId: config.bookId, formatId: 'standard', oneManifestUrl: oneKey, characterHash: 'fixturehash', characterSpecs: { childName: 'Ada', hairStyle: 'side-part', skinTone: 'medium' } }, { loadConfig: async () => { throw new Error('Mutable config loaded'); }, loadManifest: async () => w0 });
  assert.equal(base.configVersion, 1);
  const context = await readOrderPoseContext({ bookId: config.bookId, orderPrefix: prefix }, async () => w0);
  assert.ok(context.allowed.includes(13)); assert.ok(!context.allowed.includes(99));
  assert.equal(context.referenceKeys['13'], generated.poseRefKey, 'Review/revision must use the generated frozen reference');
  await assert.rejects(() => buildW2APoseInput({ ...stored[1], bookId: 'wrong-book', characterHash: 'fixturehash' }, { loadConfig: async () => config }), /identity/);
  const twoB = { characterHash: 'fixturehash', order: { orderId, bookId: config.bookId }, entries: [13,17,18].map(p => ({ poseNumber: p, bgRemovedKey: `${config.bookId}/characters/generated/pose${p}.png`, briaStatus: 'completed' })) };
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId: 'standard', orderPrefix: prefix }, { loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? twoB : null });
  assert.equal(assembly.renderSnapshot?.bookConfig.rendering.recipe?.poses['custom-run'].referenceKey, generated.poseRefKey);
  assert.equal(assembly.expectedPageCount, 3);
  assert.deepEqual(orderReviewPoseNumbers({ frozen: normalizeW0Manifest(w0), legacyCount: 4 }), [0,13,17,18]);
  const normalized: { poseNumber: number; referenceKey?: string }[] = [];
  const normalize: NormalizePoseScaleFn = async input => {
    normalized.push(input);
    return { success: true, normalized: false, imageKey: input.imageKey, refKey: input.referenceKey!, poseNumber: input.poseNumber, bookId: config.bookId, message: 'fixture', scaleFactor: null, verticalOffset: null, horizontalOffset: null, groundContactOffset: null, sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true };
  };
  await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId: 'standard', orderPrefix: prefix }, { loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? twoB : null, normalizePoseScale: normalize });
  assert.deepEqual(normalized.map(p => p.poseNumber), [13,17,18]);
  assert.equal(normalized[0].referenceKey, generated.poseRefKey);
  await assert.rejects(() => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId: 'standard', configVersion: 99, orderPrefix: prefix }, { loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? twoB : null }), /identity/);
  await assert.rejects(() => buildW3AssemblyInput({ orderId, bookId: config.bookId, orderPrefix: prefix }, { loadManifest: async key => key.endsWith('2b-manifest.json') ? twoB : null }), /snapshot/);
  await assert.rejects(() => resolveW2APoseWorklistResponse({ orderId, bookId: config.bookId, oneManifestUrl: oneKey }, { downloadOneManifest: async () => null, loadBookConfig: async () => config }), /snapshot/);

  for (const conflict of [{ bookId: 'wrong-book' }, { formatId: 'amazon' }, { configVersion: 99 }]) {
    await assert.rejects(() => resolveW2APoseWorklistResponse({ orderId, bookId: config.bookId, oneManifestUrl: oneKey, orderContext: conflict }, { downloadOneManifest: async () => w0 }), /identity/);
  }
  await assert.rejects(() => resolveW2APoseWorklistResponse({ orderId, bookId: config.bookId }, { downloadOneManifest: async () => null, loadBookConfig: async () => { const invalid = configuredBookFixture(); invalid.rendering.recipe!.poses['custom-run'].poseNumber = 100; return (await import('../src/lib/books/types')).BookConfigSchema.parse(invalid); } }), /100|99/);
  await assert.rejects(() => resolveW2APoseWorklistResponse({ orderId, bookId: 'book-mvp-simple-adventure', configSource: 'published' }, { downloadOneManifest: async () => null, loadBookConfig: async () => {
    const invalid = configuredBookFixture(); invalid.bookId = 'book-mvp-simple-adventure'; invalid.rendering.recipe!.poses['custom-run'].poseNumber = 100;
    return parsePublishedBookConfigRow({ book_id: invalid.bookId, config_json: invalid }).config;
  } }), /schema validation/);
  assert.equal(canFallbackToBundled(new PublishedBookConfigError('invalid-row', 'invalid')), false);
  assert.equal(canFallbackToBundled(new PublishedBookConfigError('query-failed', 'failed')), false);
  assert.equal(canFallbackToBundled(new PublishedBookConfigError('not-found', 'missing')), true);
  const legacyConfig = configuredBookFixture();
  delete legacyConfig.rendering.recipe;
  for (const format of Object.values(legacyConfig.formats)) for (const page of format.interior.pageSequence) delete page.layers;
  const legacyW0 = buildW0RunManifestFromConfig(legacyConfig, { orderId, platform: 'd2c', formatId: 'standard', characterHash: 'fixturehash' });
  const legacyContext = await readOrderPoseContext({ bookId: config.bookId, orderPrefix: prefix }, async () => legacyW0);
  assert.deepEqual(legacyContext.allowed, Array.from({ length: 13 }, (_, i) => i));
  const legacyAssembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, orderPrefix: prefix }, { loadManifest: async key => key.endsWith('1-manifest.json') ? legacyW0 : key.endsWith('2b-manifest.json') ? twoB : null });
  assert.equal(legacyAssembly.renderSnapshot, undefined);
  const empty = configuredBookFixture();
  for (const format of Object.values(empty.formats)) for (const page of format.interior.pageSequence) { page.layers = []; page.poseNumber = null; }
  for (const cover of Object.values(empty.rendering.recipe!.covers)) cover.layers = [];
  empty.qa.pose.requiredPoseNumbers = [];
  const emptyW0 = buildW0RunManifestFromConfig(empty, { orderId, platform: 'd2c', formatId: 'standard', characterHash: 'fixturehash' });
  const ready = await read2BManifestWithPoseRequirements({ manifest: { ...twoB, entries: [], order: { orderId, oneManifestUrl: oneKey } }, orderId, loadManifest: async () => emptyW0 });
  assert.deepEqual(ready.requiredPoseNumbers, []);
  const staticAssembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId: 'standard', orderPrefix: prefix }, { loadManifest: async key => key.endsWith('1-manifest.json') ? emptyW0 : key.endsWith('2b-manifest.json') ? { ...twoB, entries: [] } : null });
  assert.deepEqual(staticAssembly.requiredPoseNumbers, []);
  console.log('Configured pose producer/recovery/review/assembly tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
