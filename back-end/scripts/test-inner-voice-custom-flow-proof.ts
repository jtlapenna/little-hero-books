import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { validateBindings, retainedHashes, ledgerHash } from './export-inner-voice-custom-flow-proof';

const root = resolve(__dirname, '../..'), base = resolve(root, 'output/inner-voice-workflow-e2e-2026-10-27');
const configPath = resolve(root, 'output/inner-voice-flow-layout-config-2026-10-28-r3/authoring-draft.json');
const manifestPath = resolve(root, 'output/inner-voice-flow-layout-config-2026-10-28-r3/export-manifest.json');
const mapPath = resolve(base, 'editor-fidelity-audit/local-asset-map.json');
const generatedRoot = resolve(root, 'output/imagegen');
const records = Object.fromEntries(Object.entries(retainedHashes).map(([role, hash]) => {
  const bytes = readFileSync(resolve(base, 'customization-validation/prepared-current', `${role}.json`));
  assert.equal(sha256(bytes), hash); return [role, JSON.parse(bytes.toString())];
}));
const ledger = readFileSync(resolve(base, 'local-editor-aligned-cases/generated-assets.json'));
assert.equal(sha256(ledger), ledgerHash);
const assets = JSON.parse(ledger.toString()).assets;
const referenceAssets = JSON.parse(readFileSync(mapPath, 'utf8')).assets;
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const poses = config.rendering.recipe.poses;
const clone = <T>(x: T): T => structuredClone(x);
validateBindings(records, assets, poses, generatedRoot, referenceAssets);
const rejects = (mutate: (r: any, a: any[]) => void, pattern: RegExp) => {
  const r = clone(records), a = clone(assets); mutate(r,a);
  assert.throws(() => validateBindings(r,a,poses,generatedRoot,referenceAssets), pattern);
};
rejects((_,a) => { a.pop(); }, /pose count/);
rejects((_,a) => { a[1] = clone(a[0]); }, /Duplicate pose/);
rejects((_,a) => { a[0].path = a.find(x => x.role !== a[0].role && x.poseNumber === a[0].poseNumber).path; }, /Wrong child or pose path/);
rejects((_,a) => { a[0].sha256 = '0'.repeat(64); }, /hash mismatch/);
rejects((_,a) => { a[0].poseRefKey = 'wrong.png'; }, /Editor-selected pose reference mismatch/);
rejects((_,a) => { a.find(x => x.poseNumber === 1).referenceSha256 = '0'.repeat(64); }, /Editor-selected reference hash mismatch/);
rejects((_,a) => { a.find(x => x.poseNumber === 1).w2Input.characterHash = 'wrong'; }, /W2 child hash mismatch/);
rejects((_,a) => { a.find(x => x.poseNumber === 1).normalization.refKey = 'wrong'; }, /Normalization reference mismatch/);
rejects((r) => { r['WEB-A'].specs.animalGuide = 'lion'; }, /Selection mismatch/);
rejects((r) => { r['SIB-B'].orderId = r['SIB-A'].orderId; }, /Character hash mismatch|Duplicate order/);
const temp = mkdtempSync(resolve(root, 'output/custom-flow-test-'));
try {
  const out = resolve(temp, 'proof');
  const command = ['--import','tsx','scripts/export-inner-voice-custom-flow-proof.ts', '--flow-config',configPath,'--flow-manifest',manifestPath,'--config-sha256',sha256(readFileSync(configPath)),'--asset-map',mapPath,'--asset-map-sha256',sha256(readFileSync(mapPath)),'--output',out];
  const run = (args = command) => spawnSync(process.execPath,args,{cwd:resolve(root,'back-end'),encoding:'utf8',maxBuffer:4 * 1024 * 1024});
  const result = run(); assert.equal(result.status,0,result.stderr);
  const proof = JSON.parse(readFileSync(resolve(out,'proof-manifest.json'),'utf8'));
  assert.equal(proof.cases.length,4); assert.equal(proof.globalFetchCalls,0); assert.equal(proof.printReady,false);
  assert.equal(proof.stages.intake, 'W0 manifest builder only; intake worker/order trigger not run');
  assert.match(proof.stages.coverProvenance, /pose 0.*not independently verified/i);
  const seen = new Set<string>();
  for (const child of proof.cases) {
    assert.equal(child.files.length,33); assert.equal(child.selection.animalGuide,records[child.role].specs.animalGuide);
    assert.equal(child.characterHash,records[child.role].characterHash);
    const twoB = JSON.parse(readFileSync(resolve(out,child.role,'retained-2b.json'),'utf8'));
    assert.equal(twoB.characterHash,child.characterHash); assert.equal(twoB.entries.length,13);
    for (const entry of twoB.entries) { assert.match(entry.bgRemovedKey,new RegExp(child.characterHash)); assert.ok(proof.assets[entry.bgRemovedKey]); }
    for (const file of child.files) {
      const bytes = readFileSync(resolve(out,file.file)); assert.equal(sha256(bytes),file.sha256);
      const html = bytes.toString(); assert.ok(!/https?:\/\//i.test(html)); assert.match(html,/provisional local review; not print-ready/);
      const configured = file.label === 'cover' ? config.rendering.recipe.covers[child.selection.formatId] : config.formats[child.selection.formatId].interior.pageSequence.find((p: any) => p.label === file.label);
      assert.ok(configured, `Missing configured page ${file.label}`);
      for (const layer of configured.layers.filter((l: any) => l.kind === 'pose' || l.kind === 'animal')) {
        const tag = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]).find(t => t.includes(`data-layer-id="${layer.id}"`));
        assert.ok(tag, `Missing rendered layer ${child.role}/${file.label}/${layer.id}`);
        const key = layer.kind === 'pose' ? twoB.entries.find((entry: any) => entry.poseNumber === layer.poseNumber)?.bgRemovedKey : config.rendering.recipe.animals[child.selection.animalGuide][layer.role];
        const evidence = proof.assets[key]; assert.ok(evidence, `Missing asset for ${child.role}/${file.label}/${layer.id}`);
        const src = tag.match(/\bsrc="([^"]+)"/)?.[1]; assert.ok(src); assert.equal(src, new URL(evidence.file, `file://${out}/`).href);
        assert.equal(sha256(readFileSync(resolve(out,evidence.file))),evidence.sha256);
        if (file.label === 'p25') assert.equal(tag.includes('scaleX(-1)'), layer.placement.flipX === true, `Orientation differs for ${child.role}/${layer.id}`);
      }
      assert.ok(!seen.has(file.file)); seen.add(file.file);
    }
  }
  assert.equal(seen.size,132);
  const heartConfig = clone(config);
  for (const format of ['standard', 'amazon']) {
    const layer = heartConfig.rendering.recipe.covers[format].layers.find((item: any) => item.id === 'cover-child');
    layer.poseId = 'breath'; layer.poseNumber = 7;
  }
  const heartPath = resolve(temp, 'heart-config.json'), heartManifestPath = resolve(temp, 'heart-export.json');
  const heartBytes = Buffer.from(JSON.stringify(heartConfig)); writeFileSync(heartPath, heartBytes);
  const heartManifest = JSON.parse(readFileSync(manifestPath, 'utf8')); heartManifest.candidateSha256 = sha256(heartBytes);
  writeFileSync(heartManifestPath, JSON.stringify(heartManifest));
  const heartArgs = command.slice(), heartOut = resolve(temp, 'heart-proof');
  for (const [flag, value] of [['--flow-config', heartPath], ['--flow-manifest', heartManifestPath], ['--config-sha256', sha256(heartBytes)], ['--output', heartOut]]) heartArgs[heartArgs.indexOf(flag) + 1] = value;
  const heartResult = run(heartArgs); assert.equal(heartResult.status, 0, heartResult.stderr);
  const heartProof = JSON.parse(readFileSync(resolve(heartOut, 'proof-manifest.json'), 'utf8'));
  assert.match(heartProof.stages.coverProvenance, /retained named poses/);
  for (const child of heartProof.cases) {
    const coverHtml = readFileSync(resolve(heartOut, child.role, 'cover.html'), 'utf8');
    const key = buildBgRemovedPoseAssetKey(child.characterHash, 7, heartConfig.bookId);
    const asset = heartProof.assets[key]; assert.ok(asset);
    const tag = [...coverHtml.matchAll(/<img\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes('data-layer-id="cover-child"'));
    assert.ok(tag?.includes(asset.file.split('/').pop()));
    assert.equal(heartProof.coverSelections[child.selection.formatId][0].poseNumber, 7);
    assert.equal(heartProof.coverSelections[child.selection.formatId][0].poseId, 'breath');
  }
  const validate = spawnSync('python3', ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); from local_custom_flow_pdf import validate; validate(sys.argv[2])', resolve(root, 'tools/inner-voice-placement-editor'), heartOut], {encoding:'utf8'});
  assert.equal(validate.status, 0, validate.stderr);
  const existing = run(); assert.notEqual(existing.status,0); assert.ok(readFileSync(resolve(out,'proof-manifest.json')).length);
  const bad = command.slice(); bad[bad.indexOf('--config-sha256')+1] = '0'.repeat(64); bad[bad.indexOf('--output')+1] = resolve(temp,'bad');
  const mismatch = run(bad); assert.notEqual(mismatch.status,0); assert.match(mismatch.stderr,/Flow config hash mismatch/);
  const badMap = command.slice(); badMap[badMap.indexOf('--asset-map-sha256')+1] = '0'.repeat(64); badMap[badMap.indexOf('--output')+1] = resolve(temp,'bad-map');
  const mismatchMap = run(badMap); assert.notEqual(mismatchMap.status,0); assert.match(mismatchMap.stderr,/Asset map hash mismatch/);
  const broken = resolve(temp,'broken-manifest.json'); const badManifest = JSON.parse(readFileSync(manifestPath,'utf8')); badManifest.candidateSha256 = '0'.repeat(64); writeFileSync(broken,JSON.stringify(badManifest));
  const brokenArgs = command.slice(); brokenArgs[brokenArgs.indexOf('--flow-manifest')+1] = broken; brokenArgs[brokenArgs.indexOf('--output')+1] = resolve(temp,'bad-manifest');
  const mismatchManifest = run(brokenArgs); assert.notEqual(mismatchManifest.status,0); assert.match(mismatchManifest.stderr,/Flow manifest mismatch/);
  console.log('Custom flow proof: 132 HTML files, four bound children, rejection cases passed');
} finally { rmSync(temp,{recursive:true,force:true}); }
