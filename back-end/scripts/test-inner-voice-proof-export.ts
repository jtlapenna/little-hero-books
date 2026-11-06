import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { finalArtFixture } from './final-art-fixture';
import { prepareFinalArtCandidate, validateFinalArtCandidate } from '../src/lib/books/final-art-candidate';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { writeLocalProof } from './helpers/local-proof-output';

async function main() {
  const root = resolve(__dirname, '../..');
  const output = resolve(root, 'output'); mkdirSync(output, { recursive: true });
  const directory = mkdtempSync(resolve(output, 'test-final-art-export-'));
  try {
    const partial = resolve(directory,'partial-output');
    assert.throws(() => writeLocalProof(partial, () => { writeFileSync(resolve(partial,'partial.txt'),'partial'); throw Error('synthetic write failure'); }), /synthetic write failure/);
    assert(!existsSync(partial), 'A caught write failure must remove the newly reserved output');
    const fixture = await finalArtFixture(directory, 3);
    const inventoryFile = await prepareFinalArtCandidate({ root, output: resolve(directory, 'candidate'), ...fixture });
    const candidate = await validateFinalArtCandidate(root, inventoryFile);
    assert.equal(candidate.inventory.configVersion, 3);
    const image = { path: fixture.assets['cover-background'], sha256: sha256(readFileSync(fixture.assets['cover-background'])) };
    const assets: Record<string, typeof image> = {};
    const visit = (value: unknown) => {
      if (typeof value === 'string' && value.startsWith(candidate.config.bookId + '/') && /\.(png|ttf)$/.test(value)) assets[value] = image;
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(candidate.config);
    const font = resolve(root, 'tools/inner-voice-placement-editor/assets/lettering-LoveYaLikeASister.ttf');
    assets[candidate.config.assets.fonts.primary] = { path: font, sha256: sha256(readFileSync(font)) };
    const mapFile = resolve(directory, 'map.json'); writeFileSync(mapFile, JSON.stringify({ schema: 'lhb.local-proof-assets@v1', assets }));
    const proof = resolve(directory, 'proof&review');
    const run = () => spawnSync(process.execPath, ['--import', 'tsx', resolve(__dirname, 'export-inner-voice-final-art-proof.ts'),
      '--inventory', inventoryFile, '--asset-map', mapFile, '--output', proof], {
      cwd: resolve(root, 'back-end'), env: { PATH: process.env.PATH, HOME: directory, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 60000,
    });
    const exported = run(); assert.equal(exported.status, 0, exported.stderr);
    const manifest = JSON.parse(readFileSync(resolve(proof, 'proof-manifest.json'), 'utf8'));
    assert.equal(manifest.files.length, 524);
    assert.equal(manifest.approved, false); assert.equal(manifest.printReady, false);
    let fileUrls = 0;
    for (const item of manifest.files) {
      const bytes = readFileSync(resolve(proof, item.file)); assert.equal(sha256(bytes), item.sha256);
      const html = bytes.toString('utf8'); assert(!html.includes('http://') && !html.includes('https://'));
      assert(!html.includes('&amp;review'), 'CSS file URLs must not use HTML entity escaping');
      for (const url of html.match(/file:\/\/\/[^'"\s<>]+/g) ?? []) {
        assert(url.includes('proof%26review/')); assert(existsSync(new URL(url)), url); fileUrls++;
      }
    }
    assert(fileUrls > 1000);
    for (const asset of Object.values(manifest.assets) as Array<{ path: string; sha256: string }>) assert.equal(sha256(readFileSync(asset.path)), asset.sha256);
    const before = sha256(readFileSync(resolve(proof, 'proof-manifest.json')));
    assert.notEqual(run().status, 0); assert.equal(sha256(readFileSync(resolve(proof, 'proof-manifest.json'))), before);
    const flowConfig = structuredClone(candidate.config) as any;
    flowConfig.rendering.recipe.schema = 'lhb.book-render@v2';
    flowConfig.rendering.recipe.copy['page-26'] = [{ id:'test-flow', text:'[Child Name] and [animal guide] flew.',
      placement:{left:100,top:100,width:2000,height:300}, fontSize:80, lineHeight:1.2, color:'#fff4d7', align:'left', padding:0,
      flow:{paragraphs:[{runs:[{text:'[Child Name] and [animal guide] '},{text:'flew',style:{color:'#ffe09a'}},{text:'.'}]}]}}];
    const flowFile = resolve(directory,'flow.json'); const flowBytes = Buffer.from(JSON.stringify(flowConfig)); writeFileSync(flowFile,flowBytes);
    const flowManifest = resolve(directory,'flow-manifest.json'); writeFileSync(flowManifest,JSON.stringify({status:'local provisional candidate; not approved or published',candidateSha256:sha256(flowBytes)}));
    const flowProof = resolve(directory,'flow-proof');
    const flowRun = (extra: string[] = [], target = flowProof) => spawnSync(process.execPath, ['--import','tsx',resolve(__dirname,'export-inner-voice-final-art-proof.ts'),
      '--flow-config',flowFile,'--flow-manifest',flowManifest,'--asset-map',mapFile,'--output',target,...extra], {
      cwd:resolve(root,'back-end'),env:{PATH:process.env.PATH,HOME:directory,NODE_ENV:'test'},encoding:'utf8',timeout:60000});
    const exportedFlow = flowRun(); assert.equal(exportedFlow.status,0,exportedFlow.stderr);
    const flowResult = JSON.parse(readFileSync(resolve(flowProof,'proof-manifest.json'),'utf8'));
    assert.equal(flowResult.approved,false); assert.equal(flowResult.printReady,false); assert.equal(flowResult.liveRequests,0);
    assert.equal(flowResult.files.filter((file: any)=>file.pageLabel==='p25').length,96);
    assert.equal(flowResult.files.length,604);
    const html = readFileSync(resolve(flowProof,flowResult.files.find((file:any)=>file.pageLabel==='p25' && file.guide==='cat' && file.name==='Alexandra').file),'utf8');
    assert.match(html,/lhb-flow-paragraph/); assert.match(html,/Alexandra and Cat /);
    assert.match(html,/Content-Security-Policy/); assert.match(html,/not print-ready/);
    assert.equal(sha256(readFileSync(resolve(flowProof,flowResult.flowConfigFile))), flowResult.configSha256);
    assert.equal(sha256(readFileSync(resolve(flowProof,flowResult.flowManifestFile))), flowResult.flowManifestSha256);
    assert.notEqual(flowRun().status,0,'Existing proof output must not be overwritten');
    const extendedPath = resolve(directory, 'extended-proof');
    const extended = flowRun(['--review-pages', 'p09,p24,p25'], extendedPath);
    assert.equal(extended.status, 0, extended.stderr);
    const extendedManifest = JSON.parse(readFileSync(resolve(extendedPath, 'proof-manifest.json'), 'utf8'));
    assert.deepEqual(extendedManifest.nameReviewPages, ['p09', 'p24', 'p25']);
    for (const label of ['p09', 'p24', 'p25']) assert.equal(extendedManifest.files.filter((file: any) => file.pageLabel === label).length, 96);
    assert.equal(extendedManifest.files.length, 764);
    for (const value of ['p99', 'p09,p09', '', 'cover']) {
      const target = resolve(directory, 'invalid-pages-' + value.replace(/[^a-z0-9]/g, '_'));
      const rejected = flowRun(['--review-pages', value], target);
      assert.notEqual(rejected.status, 0); assert(!existsSync(target));
    }
    writeFileSync(flowManifest,JSON.stringify({status:'local provisional candidate; not approved or published',candidateSha256:'0'.repeat(64)}));
    const rejectedOutput = resolve(directory,'rejected-proof');
    const rejected = spawnSync(process.execPath,['--import','tsx',resolve(__dirname,'export-inner-voice-final-art-proof.ts'), '--flow-config',flowFile,'--flow-manifest',flowManifest,'--asset-map',mapFile,'--output',rejectedOutput],{cwd:resolve(root,'back-end'),encoding:'utf8',timeout:60000});
    assert.notEqual(rejected.status,0,'Changed flow candidate must reject'); assert(!existsSync(rejectedOutput));
    console.log(`Local proof exporter: 524 HTML files, ${fileUrls} working file URLs, copied hashes and overwrite refusal passed`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
