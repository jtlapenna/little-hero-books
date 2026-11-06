import assert from 'node:assert/strict';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { resolveW2APoseWorklistResponse } from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import { attachWorkflowJobsToW2AWorkItems, type W2APoseJobRepository } from '../src/lib/workflow-jobs/w2a-pose-jobs';
import type { WorkflowJobRecord } from '../src/lib/workflow-jobs/types';
import { buildW2APoseInput } from '../src/lib/books/w2a-pose-input';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { resolveRecipePoseReference } from '../src/lib/books/book-render-recipe';

// Finding Our Inner Voice v2, both editions: frozen W0 manifest -> W2A worklist -> per-pose input -> 2B manifest -> W3 assembly input.
// All dependencies are in-memory stubs: no network, provider, database or storage access.
const BOOK_ID = 'book-finding-our-inner-voice';
const POSES = Array.from({ length: 13 }, (_, i) => i);

async function rejectsFor(fn: () => Promise<unknown>, expect: RegExp, label: string) {
  try { await fn(); } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert.match(m, expect, `${label}: rejected for the wrong reason: ${m}`);
    if (process.env.POSE_CHAIN_VERBOSE) console.log(`  reject[${label}] ${m}`);
    return;
  }
  assert.fail(`${label}: expected rejection`);
}

async function chain(formatId: 'standard' | 'amazon') {
  const config = loadBundledBookConfig({ bookId: BOOK_ID, version: 2 });
  const testMode = config.status === 'draft';
  const orderId = `IV-CHAIN-${formatId.toUpperCase()}-A`;
  const hash = `synthetic-${orderId}`;
  const prefix = `${BOOK_ID}/orders/${orderId}`;
  const oneKey = `${prefix}/manifests/1-manifest.json`;
  const specs = { childName: 'Ada', animalGuide: 'owl', pronouns: 'they/them', hometown: 'Grass Valley' };
  const w0 = JSON.parse(JSON.stringify(buildW0RunManifestFromConfig(config, {
    orderId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', formatId, characterHash: hash,
    input: { bookSpecs: { testMode }, characterSpecs: specs },
  })));

  const stored: Record<string, unknown>[] = [];
  const unused = async () => { throw new Error('Unexpected repository call'); };
  const repo: W2APoseJobRepository = {
    enqueueWorkflowJob: async input => { stored.push(input.normalizedInputSnapshot!); return { id: stored.length, status: 'queued', idempotency_key: input.idempotencyKey } as WorkflowJobRecord; },
    getWorkflowJobById: async () => null, getWorkflowJobByIdempotencyKey: async () => null,
    claimWorkflowJob: unused, incrementWorkflowJobAttemptCount: unused, createWorkflowJobAttempt: unused,
    markWorkflowJobRunning: unused, appendWorkflowJobEvent: async () => ({ id: 1 } as Awaited<ReturnType<W2APoseJobRepository['appendWorkflowJobEvent']>>),
  };
  const worklist = await resolveW2APoseWorklistResponse({ orderId, bookId: BOOK_ID, formatId, oneManifestUrl: oneKey }, {
    downloadOneManifest: async () => w0,
    instrumentPoseWorkItems: p => attachWorkflowJobsToW2AWorkItems({ orderId, bookId: BOOK_ID, workItems: p.poseWorklist }, repo),
  });
  assert.deepEqual(worklist.poseWorklist.map(p => p.poseNumber), POSES, `${formatId}: worklist must cover poses 0..12 exactly once, in order`);
  assert.equal(stored.length, 13, `${formatId}: one persisted job snapshot per pose`);

  // Every persisted job rebuilds its own pose input from the frozen snapshot, never from mutable config.
  let reloads = 0;
  const loadConfig = async () => { reloads++; return config; };
  const inputs = [];
  for (const [i, snap] of stored.entries()) {
    const input = await buildW2APoseInput({ ...snap, characterHash: hash, characterSpecs: specs, retryAttempt: 0 }, { loadConfig });
    const n = POSES[i];
    assert.equal(input.bookId, BOOK_ID);
    assert.match(input.uploadKey, new RegExp(`pose${String(n).padStart(2, '0')}(?!\\d)`), `${formatId}: pose ${n} upload key ${input.uploadKey}`);
    assert.ok(input.baseCharacterKey.startsWith(`${BOOK_ID}/`), `${formatId}: base character key stays in the selected book`);
    assert.ok(input.poseRefKey.startsWith(`${BOOK_ID}/`), `${formatId}: pose ${n} reference stays in the selected book`);
    const recipeRef = resolveRecipePoseReference(config, n);
    if (recipeRef) assert.equal(input.poseRefKey, recipeRef, `${formatId}: pose ${n} reference must come from the frozen recipe`);
    // Retry of the same persisted job keeps book, hash and reference identity and only changes the upload key.
    const retry = await buildW2APoseInput({ ...snap, characterHash: hash, characterSpecs: specs, retryAttempt: 1 }, { loadConfig });
    assert.equal(retry.bookId, BOOK_ID);
    assert.equal(retry.characterHash, hash);
    assert.equal(retry.poseRefKey, input.poseRefKey);
    assert.equal(retry.baseCharacterKey, input.baseCharacterKey);
    assert.notEqual(retry.uploadKey, input.uploadKey, `${formatId}: retry upload key must be retry-tagged`);
    assert.ok(retry.uploadKey.startsWith(`${BOOK_ID}/`));
    inputs.push(input);
  }
  assert.equal(reloads, 0, `${formatId}: recovered jobs must not reload mutable config`);
  assert.equal(new Set(inputs.map(i => i.uploadKey)).size, 13, `${formatId}: upload keys must be distinct per pose`);
  assert.ok(inputs.every(i => i.uploadKey.startsWith(`${BOOK_ID}/`)), `${formatId}: upload keys stay inside the selected book`);

  // Wrong-book and wrong-order identity must reject at the pose input.
  await rejectsFor(() => buildW2APoseInput({ ...stored[1], bookId: 'book-mvp-simple-adventure', characterHash: hash }, { loadConfig }), /Render snapshot identity mismatch/, `${formatId}: wrong-book pose input`);
  // Order binding is enforced at the worklist (the only hop that loads the frozen W0 manifest): a sibling orderId or wrong edition must reject there.
  await rejectsFor(() => resolveW2APoseWorklistResponse({ orderId, bookId: BOOK_ID, formatId, oneManifestUrl: oneKey, orderContext: { orderId: `${orderId}-SIBLING` } }, { downloadOneManifest: async () => w0 }), /Conflicting workflow order identity/, `${formatId}: sibling-order worklist`);
  await rejectsFor(() => resolveW2APoseWorklistResponse({ orderId, bookId: BOOK_ID, formatId: formatId === 'standard' ? 'amazon' : 'standard', oneManifestUrl: oneKey }, { downloadOneManifest: async () => w0 }), /format identity does not match W2A request/, `${formatId}: wrong-edition worklist`);
  await rejectsFor(() => buildW2APoseInput({ ...stored[1], configVersion: 99, characterHash: hash }, { loadConfig }), /Render snapshot identity mismatch/, `${formatId}: wrong-config-version pose input`);

  // 2B manifest -> W3 assembly: 32 interior pages, 12 pose pages, all required poses present.
  const twoB = (poseNumbers: number[], over: Record<string, unknown> = {}) => ({
    characterHash: hash, order: { orderId, bookId: BOOK_ID }, ...over,
    entries: poseNumbers.map(poseNumber => ({ poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(hash, poseNumber, BOOK_ID) })),
  });
  const assemble = (manifest: unknown, over: Record<string, unknown> = {}) => buildW3AssemblyInput(
    { orderId, bookId: BOOK_ID, formatId, testMode, testModePages: 0, orderPrefix: prefix, ...over },
    { loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? manifest as never : null },
  );
  const ok = await assemble(twoB(POSES));
  assert.equal(ok.expectedPageCount, 32, `${formatId}: 32 interior pages`);
  assert.deepEqual([...ok.requiredPoseNumbers].sort((a, b) => a - b), POSES.filter(p => p !== 0), `${formatId}: required poses are 1..12 (0 is the cover base)`);

  await rejectsFor(() => assemble(twoB([...POSES, 5])), /invalid or duplicated/, `${formatId}: repeated pose entry`);
  // Missing, wrong-book, wrong-order and stale-hash 2B manifests must reject.
  await rejectsFor(() => assemble(twoB(POSES.filter(p => p !== 7))), /required pose 7 is missing from the manifest/, `${formatId}: missing pose 7`);
  await rejectsFor(() => assemble(twoB(POSES, { order: { orderId, bookId: 'book-mvp-simple-adventure' } })), /W2B book identity conflicts with frozen W0/, `${formatId}: wrong-book 2B manifest`);
  await rejectsFor(() => assemble(twoB(POSES, { order: { orderId: `${orderId}-SIBLING`, bookId: BOOK_ID } })), /W2B child order identity conflicts with frozen W0/, `${formatId}: sibling-order 2B manifest`);
  await rejectsFor(() => assemble(twoB(POSES, { characterHash: 'stale-hash' })), /W3 character identity conflicts with frozen W0/, `${formatId}: stale character hash`);
  await rejectsFor(() => assemble(twoB(POSES), { configVersion: 99 }), /Render snapshot identity mismatch/, `${formatId}: wrong config version`);
  console.log(`PASS inner voice v2 ${formatId}: W0 -> worklist(13) -> pose inputs -> W3 assembly(32) with rejections`);
}

async function main() {
  for (const formatId of ['standard', 'amazon'] as const) await chain(formatId);
  console.log('Inner Voice pose chain tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
