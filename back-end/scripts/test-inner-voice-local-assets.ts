import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { finalArtFixture } from './final-art-fixture';
import { configuredLocalAssetUses, prepareInnerVoiceLocalAssets } from './helpers/inner-voice-local-assets';
import { prepareFinalArtCandidate, validateFinalArtCandidate } from '../src/lib/books/final-art-candidate';
import { sha256 } from '../src/lib/books/immutable-asset-upload';

async function main() {
  globalThis.fetch = async () => { throw new Error('No network in local asset audit'); };
  const root = resolve(__dirname, '../..');
  mkdirSync(resolve(root, 'output'), { recursive: true });
  const directory = mkdtempSync(resolve(root, 'output/test-local-assets-'));
  let checks = 0;
  try {
    const fixture = await finalArtFixture(directory, 3);
    const inventoryFile = await prepareFinalArtCandidate({ root, output: resolve(directory, 'candidate'), ...fixture });
    const candidate = await validateFinalArtCandidate(root, inventoryFile);
    const configFile = resolve(root, candidate.inventory.configSource);
    const configBytes = readFileSync(configFile);
    const image = { path: fixture.assets['cover-background'], sha256: sha256(readFileSync(fixture.assets['cover-background'])) };
    const assets: Record<string, typeof image> = Object.fromEntries([...configuredLocalAssetUses(candidate.config).keys()].map(key => [key, image]));
    for (const entry of candidate.inventory.entries) delete assets[entry.r2Key];
    const font = resolve(root, 'tools/inner-voice-placement-editor/assets/lettering-LoveYaLikeASister.ttf');
    assets[candidate.config.assets.fonts.primary] = { path: font, sha256: sha256(readFileSync(font)) };
    const plannedKey = candidate.config.assets.guideBackgrounds!.page_09.cat;
    delete assets[plannedKey];
    const assetMapFile = resolve(directory, 'input-map.json');
    const saveMap = (value = assets) => writeFileSync(assetMapFile, JSON.stringify({ schema: 'lhb.local-proof-assets@v1', assets: value }));
    saveMap();
    const plan = { schema: 'lhb.inner-voice-v2-upload-plan@v1', bookId: candidate.config.bookId, configVersion: 2,
      entries: [{ taskId: 'guide-cat', source: image.path.slice(directory.length + 1), r2Key: plannedKey, sha256: image.sha256, uploadApproved: true }] };
    const uploadPlanFile = resolve(directory, 'plan.json');
    const savePlan = () => writeFileSync(uploadPlanFile, JSON.stringify(plan)); savePlan();
    const run = (name: string, extra = {}) => prepareInnerVoiceLocalAssets({ root, configFile, assetMapFile, uploadPlanFile,
      sourceRoot: directory, inventoryFile, output: resolve(directory, name), ...extra });
    const good = await run('complete');
    assert.equal(good.report.localReferenceClosureComplete, true);
    assert.equal(good.report.finalArtCandidateBound, true);
    assert.equal(good.report.uploadApproved, false); assert.equal(good.report.printReady, false);
    assert.equal(good.report.uploadPlan.locallyVerified, 1);
    assert.equal(good.report.localAssetMapSha256, sha256(readFileSync(resolve(good.output, 'local-asset-map.json')))); checks++;
    // Exercise the real audit producer, CLI boundary and W0/W3 proof consumer together.
    const exported = spawnSync(process.execPath, ['--import', 'tsx', resolve(__dirname, 'export-inner-voice-final-art-proof.ts'),
      '--inventory', inventoryFile, '--asset-map', resolve(good.output, 'local-asset-map.json'), '--output', resolve(directory, 'proof')], {
      cwd: resolve(root, 'back-end'), env: { PATH: process.env.PATH, HOME: directory, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 60000,
    });
    assert.equal(exported.status, 0, exported.stderr);
    const proof = JSON.parse(readFileSync(resolve(directory, 'proof/proof-manifest.json'), 'utf8'));
    assert.equal(proof.files.length, 524); assert.equal(proof.approved, false); checks++;
    for (const [key, source] of [[plannedKey, image], [candidate.inventory.entries[0].r2Key,
      { path: resolve(root, candidate.inventory.entries[0].source), sha256: candidate.inventory.entries[0].sha256 }]] as const) {
      saveMap({ ...assets, [key]: { ...source, path: resolve(directory, 'missing-old-map-path.png') } });
      const repaired = await run(`repaired-${checks}`);
      assert.equal(repaired.report.localReferenceClosureComplete, true);
      const repairedMap = JSON.parse(readFileSync(resolve(repaired.output, 'local-asset-map.json'), 'utf8'));
      assert.equal(repairedMap.assets[key].path, source.path); checks++;
    }
    saveMap();
    const missingArt = await run('without-candidate', { inventoryFile: undefined });
    assert.equal(missingArt.report.missing.length, 6); assert.equal(missingArt.report.finalArtCandidateBound, false);
    assert.equal(missingArt.report.finalArtRolesAwaitingCandidate.length, 6); checks++;
    const missingFont = { ...assets }; delete missingFont[candidate.config.assets.fonts.primary]; saveMap(missingFont);
    const missing = await run('missing-font');
    assert.deepEqual(missing.report.missing.map(item => item.key), [candidate.config.assets.fonts.primary]);
    assert.equal(missing.report.localReferenceClosureComplete, false); saveMap(); checks++;
    saveMap({ ...assets, [candidate.config.assets.fonts.primary]: { ...assets[candidate.config.assets.fonts.primary], path: resolve(directory, 'missing-font.ttf') } });
    const absent = await run('absent-font');
    assert.equal(absent.report.missing[0].reason, 'missing-file'); saveMap(); checks++;
    const before = sha256(readFileSync(resolve(good.output, 'asset-audit.json')));
    await assert.rejects(run('complete'), /EEXIST/);
    assert.equal(sha256(readFileSync(resolve(good.output, 'asset-audit.json'))), before); checks++;
    saveMap({ ...assets, [plannedKey]: { ...image, sha256: '0'.repeat(64) } });
    await assert.rejects(run('conflict'), /Conflicting local asset hashes/); assert(!existsSync(resolve(directory, 'conflict'))); saveMap(); checks++;
    const badKey = Object.keys(assets)[0]; saveMap({ ...assets, [badKey]: { ...image, path: 'relative.png' } });
    await assert.rejects(run('relative'), /absolute local path/); saveMap(); checks++;
    saveMap({ ...assets, [badKey]: { ...image, sha256: '0'.repeat(64) } });
    await assert.rejects(run('stale-map'), /hash mismatch/); saveMap(); checks++;
    const originalHash = plan.entries[0].sha256; plan.entries[0].sha256 = '0'.repeat(64); savePlan();
    await assert.rejects(run('stale-plan'), /Upload-plan bytes changed/); plan.entries[0].sha256 = originalHash; savePlan(); checks++;
    symlinkSync(font, resolve(directory, 'escape.ttf')); const originalSource = plan.entries[0].source;
    plan.entries[0].source = 'escape.ttf'; savePlan();
    await assert.rejects(run('symlink'), /inside its source root/); plan.entries[0].source = originalSource; savePlan(); checks++;
    plan.entries.push({ ...plan.entries[0] }); savePlan();
    await assert.rejects(run('duplicate'), /Duplicate upload-plan/); plan.entries.pop(); savePlan(); checks++;
    writeFileSync(configFile, configBytes.toString() + ' ');
    await assert.rejects(run('stale-config'), /exact config bytes|Draft bytes changed/); writeFileSync(configFile, configBytes); checks++;
    assert.equal(good.report.isolatedProviderWorkflow.compatible, true);
    assert.equal(good.report.isolatedProviderWorkflow.requiresExplicitVersionPacket, true);
    const future = structuredClone(candidate.config); future.version = 4;
    const futureFile = resolve(directory, 'future.json'); writeFileSync(futureFile, JSON.stringify(future));
    const futureResult = await run('future', { configFile: futureFile, inventoryFile: undefined });
    assert.equal(futureResult.report.isolatedProviderWorkflow.compatible, false);
    assert.equal(futureResult.report.isolatedProviderWorkflow.canExecute, false); checks++;
    const cli = spawnSync(process.execPath, ['--import', 'tsx', resolve(__dirname, 'prepare-inner-voice-local-assets.ts'),
      '--config', configFile, '--asset-map', assetMapFile, '--upload-plan', uploadPlanFile, '--source-root', directory,
      '--output', resolve(directory, 'cli-missing')], {
      cwd: resolve(root, 'back-end'), env: { PATH: process.env.PATH, HOME: directory, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 60000,
    });
    assert.equal(cli.status, 2, cli.stderr); assert.equal(JSON.parse(cli.stdout).missing, 6); checks++;
    assert.equal(readFileSync(configFile).compare(configBytes), 0);
    assert.equal(readFileSync(inventoryFile).compare(Buffer.from(JSON.stringify(candidate.inventory, null, 2) + '\n')), 0); checks++;
    console.log(`Local asset audit: ${checks} checks passed, actual 524-file W0/W3 export, live requests 0`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
