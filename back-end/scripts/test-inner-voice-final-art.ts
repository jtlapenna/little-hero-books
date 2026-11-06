import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { finalArtFixture } from './final-art-fixture';
import { prepareFinalArtCandidate, validateFinalArtCandidate, reconcileFinalArtCandidate, FINAL_ART_ROLES } from '../src/lib/books/final-art-candidate';
import { sha256, type AssetStore } from '../src/lib/books/immutable-asset-upload';

async function main() {
  globalThis.fetch = async () => { throw new Error('No external network in final-art tests'); };
  const root = mkdtempSync(resolve(tmpdir(), 'lhb-final-art-'));
  const outside = mkdtempSync(resolve(tmpdir(), 'lhb-final-art-outside-'));
  let checks = 0;
  const check = () => { checks++; };
  try {
    const fixture = await finalArtFixture(root);
    const output = resolve(root, 'candidate');
    const prepare = (overrides = {}) => prepareFinalArtCandidate({ root, output, ...fixture, ...overrides });
    const inventoryFile = await prepare();
    const original = readFileSync(inventoryFile);
    const candidate = await validateFinalArtCandidate(root, inventoryFile);
    assert.equal(candidate.inventory.entries.length, 6);
    assert(candidate.inventory.entries.every(entry => entry.uploadApproved === false));
    assert.equal(candidate.config.status, 'draft'); check();
    // The output owns all bytes; inputs can disappear without invalidating it.
    rmSync(resolve(root, 'inputs'), { recursive: true });
    await validateFinalArtCandidate(root, inventoryFile); check();
    const approvalFile = resolve(root, 'test-only-approval.json');
    const approval = { schema: 'lhb.final-art-upload-approval@v1', bookId: candidate.config.bookId, configVersion: 2,
      status: 'APPROVED_FOR_UPLOAD', inventorySha256: candidate.inventorySha256, configSha256: candidate.inventory.configSha256,
      approvedBy: 'synthetic-test-only', approvedAt: '2026-10-27T00:00:00Z', reviewReference: 'synthetic fixture, never artwork approval' };
    const approve = () => writeFileSync(approvalFile, JSON.stringify(approval));
    approve();
    let storeCalls = 0, puts = 0;
    let failPut = 0, race: 'same' | 'different' | undefined;
    const objects = new Map<string, Uint8Array>();
    const store = async (): Promise<AssetStore> => {
      storeCalls++;
      return { get: async key => {
        const value = objects.get(key);
        return value ? new Response(Buffer.from(value)) : new Response(null, { status: 404 });
      }, putIfAbsent: async (key, bytes, contentType) => {
        puts++;
        assert.equal(contentType, 'image/png');
        if (puts === failPut) throw new Error('Synthetic interrupted upload');
        if (race) objects.set(key, race === 'same' ? bytes : new Uint8Array([1, 2, 3]));
        if (objects.has(key)) return new Response(null, { status: 412 });
        objects.set(key, bytes);
        return new Response(null, { status: 200 });
      } };
    };
    const reconcile = (write: boolean) => reconcileFinalArtCandidate({ root, inventoryFile, approvalFile, store, write });
    const mutate = async (change: (value: typeof candidate.inventory) => void, error: RegExp) => {
      const value = structuredClone(candidate.inventory); change(value); writeFileSync(inventoryFile, JSON.stringify(value));
      const before = storeCalls;
      await assert.rejects(reconcile(true), error);
      assert.equal(storeCalls, before, 'Invalid local input must fail before accessing store');
      writeFileSync(inventoryFile, original); check();
    };
    await mutate(value => { value.entries.pop(); }, /6|small/);
    await mutate(value => { value.entries[1] = value.entries[0]; }, /distinct/);
    await mutate(value => { value.entries[0].r2Key = `${candidate.config.bookId}/v2/backgrounds/existing.png`; }, /binding mismatch|Unsafe/);
    await mutate(value => { value.entries[0].source = '../../private.png'; }, /relative|ENOENT|inside/);
    await mutate(value => { value.entries[0].source = resolve(root, value.entries[0].source); }, /relative/);
    await mutate(value => { value.entries[0].dimensions[0]++; }, /dimensions/);
    await mutate(value => { Object.assign(value.entries[0], { uploadApproved: true }); }, /false/);
    await mutate(value => { Object.assign(value, { status: 'APPROVED_FOR_UPLOAD', uploadApproved: true }); }, /LOCAL_REVIEW_ONLY|false/);
    await mutate(value => { value.schema = 'lhb.final-art-candidate@v1' as typeof value.schema; }, /v2/);
    const asset = resolve(root, candidate.inventory.entries[0].source);
    const assetBytes = readFileSync(asset);
    writeFileSync(asset, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    await assert.rejects(reconcile(true), /Asset bytes changed/); writeFileSync(asset, assetBytes); check();
    rmSync(asset); writeFileSync(resolve(outside, 'art.png'), assetBytes); symlinkSync(resolve(outside, 'art.png'), asset);
    await assert.rejects(reconcile(true), /inside the project/); rmSync(asset); writeFileSync(asset, assetBytes); check();
    const configFile = resolve(root, candidate.inventory.configSource);
    const configBytes = readFileSync(configFile);
    writeFileSync(configFile, configBytes.toString() + ' ');
    await assert.rejects(reconcile(true), /Draft bytes changed/); writeFileSync(configFile, configBytes); check();
    writeFileSync(approvalFile, JSON.stringify({ ...approval, inventorySha256: '0'.repeat(64) }));
    const beforeApproval = storeCalls;
    await assert.rejects(reconcile(true), /Approval does not match/);
    assert.equal(storeCalls, beforeApproval); approve(); check();
    writeFileSync(inventoryFile, original.toString() + ' ');
    await assert.rejects(reconcile(true), /Approval does not match/); writeFileSync(inventoryFile, original); check();
    const fresh = await finalArtFixture(root);
    await assert.rejects(prepareFinalArtCandidate({ root, output, ...fresh }), /EEXIST/);
    assert.equal(sha256(readFileSync(inventoryFile)), candidate.inventorySha256); check();
    symlinkSync(outside, resolve(root, 'escape'), 'dir');
    await assert.rejects(prepare({ ...fresh, output: resolve(root, 'escape', 'candidate') }), /inside the project/); check();
    const invalidSource = resolve(root, 'inputs', 'truncated.png');
    writeFileSync(invalidSource, assetBytes.subarray(0, 16));
    await assert.rejects(prepare({ ...fresh, output: resolve(root, 'bad-png'), assets: { ...fresh.assets, 'cover-background': invalidSource } }), /png|PNG|header|buffer|corrupt/i); check();
    const verify = await reconcile(false);
    assert.deepEqual(Object.values(verify), FINAL_ART_ROLES.map(() => 'would-upload')); assert.equal(puts, 0); check();
    const last = candidate.inventory.entries[5]; objects.set(last.r2Key, new Uint8Array([9]));
    await assert.rejects(reconcile(true), /collision/); assert.equal(puts, 0); objects.clear(); check();
    failPut = 3;
    await assert.rejects(reconcile(true), /interrupted upload/); assert.equal(objects.size, 2); check();
    failPut = 0;
    await reconcile(true); assert.equal(objects.size, 6); const after = puts;
    await reconcile(true); assert.equal(puts, after); check();
    objects.clear(); race = 'same'; await reconcile(true); assert.equal(objects.size, 6); check();
    objects.clear(); race = 'different'; await assert.rejects(reconcile(true), /byte verification failed/); check();
    assert.equal(readFileSync(inventoryFile).compare(original), 0, 'Upload must not mutate inventory or draft approval');
    assert.equal(readFileSync(configFile).compare(configBytes), 0); check();
    const version3Root = resolve(root, 'version3'); mkdirSync(version3Root);
    const fixture3 = await finalArtFixture(version3Root, 3);
    const inventory3 = await prepareFinalArtCandidate({ root, output: resolve(version3Root, 'candidate'), ...fixture3 });
    const candidate3 = await validateFinalArtCandidate(root, inventory3);
    assert.equal(candidate3.config.version, 3); assert.equal(candidate3.inventory.configVersion, 3);
    assert(candidate3.inventory.entries.every(entry => entry.r2Key.startsWith(`${candidate3.config.bookId}/v3/review-candidates/`))); check();
    const original3 = readFileSync(inventory3);
    writeFileSync(inventory3, JSON.stringify({ ...candidate3.inventory, configVersion: 2 }));
    await assert.rejects(validateFinalArtCandidate(root, inventory3), /versions differ/); writeFileSync(inventory3, original3); check();
    const approval3File = resolve(root, 'test-only-v3-approval.json');
    const approval3 = { ...approval, configVersion: 3, inventorySha256: candidate3.inventorySha256, configSha256: candidate3.inventory.configSha256 };
    writeFileSync(approval3File, JSON.stringify({ ...approval3, configVersion: 2 }));
    const reconcile3 = () => reconcileFinalArtCandidate({ root, inventoryFile: inventory3, approvalFile: approval3File, store, write: true });
    const before3 = storeCalls;
    await assert.rejects(reconcile3(), /Approval does not match/); assert.equal(storeCalls, before3); check();
    writeFileSync(approval3File, JSON.stringify(approval3)); objects.clear(); race = undefined;
    await reconcile3(); assert.equal(objects.size, 6);
    assert([...objects.keys()].every(key => key.startsWith(`${candidate3.config.bookId}/v3/`))); check();
    console.log(`Final-art preparation, approval, containment, collision and retry: ${checks} checks passed; live requests 0`);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
