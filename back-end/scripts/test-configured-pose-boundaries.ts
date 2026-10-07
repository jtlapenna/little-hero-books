import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configuredBookFixture } from './configured-book-fixture';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW2APoseInput } from '../src/lib/books/w2a-pose-input';
import { buildW2ABaseInput } from '../src/lib/books/w2a-base-input';
import { resolveW2APoseWorklistResponse } from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import { read2BManifestWithPoseRequirements, sync2BManifestEntries } from '../src/lib/books/read-2b-manifest';

async function main() {
  const failures: string[] = [];
  const check = async (name: string, action: () => void | Promise<void>) => {
    try { await action(); console.log(`PASS ${name}`); }
    catch (error) { failures.push(name); console.error(`FAIL ${name}: ${String(error)}`); }
  };
  const config = configuredBookFixture(), orderId = 'BOUNDARY-01';
  const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: 'd2c', formatId: 'standard', characterHash: 'fixturehash' });
  const args = { orderId, bookId: config.bookId, formatId: 'standard', configVersion: 1, characterHash: 'fixturehash', poseNumber: 13, characterSpecs: { childName: 'Ada', hairStyle: 'side-part', skinTone: 'medium' } };
  const frozen = w0.book.resolved.renderSnapshot!;
  const latest = configuredBookFixture(); latest.rendering.recipe!.poses['custom-run'].referenceKey = `${config.bookId}/LATEST-WRONG.png`;
  const wrappers = [(snapshot: object) => ({ orderData: snapshot }), (snapshot: object) => ({ ctx: snapshot }), (snapshot: object) => ({ __meta: { snapshot } }), (snapshot: object) => ({ __meta: { deriveQaPass: { snapshot } } })];
  await check('retry snapshots retain frozen references', async () => {
    for (const wrap of wrappers) {
      const input = { ...args, ...wrap({ ...args, renderSnapshot: frozen }) };
      let reloads = 0;
      const options = { loadConfig: async () => { reloads++; return latest; } };
      const pose = await buildW2APoseInput(input, options);
      assert.equal(pose.poseRefKey, frozen.bookConfig.rendering.recipe!.poses['custom-run'].referenceKey);
      assert.ok(pose.renderSnapshot); assert.equal(reloads, 0);
      assert.ok((await buildW2ABaseInput(input, options)).renderSnapshot); assert.equal(reloads, 0);
    }
  });
  await check('retry manifest hints load frozen intake', async () => {
    for (const wrap of wrappers) {
      const options = { loadConfig: async () => { throw new Error('Mutable config loaded'); }, loadManifest: async () => w0 };
      const input = { ...args, ...wrap({ oneManifestUrl: w0.artifacts.manifestKey }) };
      assert.ok((await buildW2APoseInput(input, options)).renderSnapshot);
      assert.ok((await buildW2ABaseInput(input, options)).renderSnapshot);
    }
  });
  await check('canonical worklists survive actual W2A adapter', async () => {
    const empty = configuredBookFixture();
    for (const format of Object.values(empty.formats)) for (const page of format.interior.pageSequence) { page.layers = []; page.poseNumber = null; }
    for (const cover of Object.values(empty.rendering.recipe!.covers)) cover.layers = [];
    empty.qa.pose.requiredPoseNumbers = [];
    const emptyW0 = buildW0RunManifestFromConfig(empty, { orderId, platform: 'd2c', formatId: 'standard' });
    const workflow = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json', 'utf8')) as { nodes: { name: string; parameters: { jsCode: string } }[] };
    const expand = new Function('$input', '$execution', '$getWorkflowStaticData', workflow.nodes.find(node => node.name === 'Expand to N Poses')!.parameters.jsCode);
    for (const manifest of [emptyW0, w0]) {
      const response = await resolveW2APoseWorklistResponse({ ...args, oneManifestUrl: manifest.artifacts.manifestKey, includeZeroPose: false }, { downloadOneManifest: async () => manifest, instrumentPoseWorkItems: async input => input.poseWorklist });
      const output = expand({ first: () => ({ json: response }) }, { customData: {} }, () => ({})) as { json: Record<string, unknown> }[];
      assert.deepEqual(output.map(item => item.json.poseNumber), response.poseWorklist.map(item => item.poseNumber));
      for (const item of output) await buildW2APoseInput({ ...args, ...item.json }, { loadConfig: async () => latest, loadManifest: async () => manifest });
    }
    const legacy = expand({ first: () => ({ json: { orderId, totalPosesRequired: 2, includeZeroPose: false } }) }, { customData: {} }, () => ({})) as { json: { poseNumber: number } }[];
    assert.deepEqual(legacy.map(item => item.json.poseNumber), [1, 2]);
  });
  await check('implicit pose zero stays inside selected book', () => {
    for (const basePath of ['book-mvp-simple-adventure/characters/poses', `${config.bookId}/../poses`]) {
      const invalid = configuredBookFixture(); invalid.assets.poses.basePath = basePath;
      assert.throws(() => buildW0RunManifestFromConfig(invalid, { orderId, platform: 'd2c', formatId: 'standard' }), /root|relative|asset/i);
    }
  });
  await check('repair cannot invent legacy requirements', async () => {
    const twoB = { characterHash: 'fixturehash', order: { orderId, bookId: config.bookId, oneManifestUrl: w0.artifacts.manifestKey }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber, bgRemovedKey: `${config.bookId}/generated/pose${poseNumber}.png` })) };
    const valid = await read2BManifestWithPoseRequirements({ manifest: twoB, orderId, loadManifest: async () => w0 });
    const sync = sync2BManifestEntries({ entryByPoseNumber: valid.entryByPoseNumber, poseNumbers: valid.requiredPoseNumbers, bgRemovedByPose: new Map(), nowIso: '2026-10-06T00:00:00Z', trackMissingEntries: true });
    assert.deepEqual(sync.missingPoseNumbers, []);
    for (const loadManifest of [async () => null, async () => { throw new Error('network unavailable'); }]) await assert.rejects(() => read2BManifestWithPoseRequirements({ manifest: twoB, orderId, loadManifest }), /snapshot|intake|requirements/i);
    const legacyBookId = 'book-mvp-simple-adventure';
    const legacy = await read2BManifestWithPoseRequirements({ manifest: { ...twoB, order: { orderId, bookId: legacyBookId, oneManifestUrl: `${legacyBookId}/orders/${orderId}/manifests/1-manifest.json` } }, orderId, loadManifest: async () => null });
    assert.deepEqual(legacy.requiredPoseNumbers, Array.from({ length: 12 }, (_, index) => index + 1));
    const imported = await read2BManifestWithPoseRequirements({ manifest: twoB, orderId, loadManifest: async () => ({ schema: 'lhb.run-manifest@v2.0', bookId: config.bookId, orderId }) });
    assert.deepEqual(imported.requiredPoseNumbers, legacy.requiredPoseNumbers);
  });
  assert.deepEqual(failures, [], 'All configured pose boundary regressions must pass');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
