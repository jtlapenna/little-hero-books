#!/usr/bin/env tsx
/** External-output successor of the frozen local custom-flow exporter. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { BookConfigSchema } from '../src/lib/books/types';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { calculateCharacterHash } from '../src/lib/character-hash';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { LocalProofAssetMapSchema } from './helpers/inner-voice-local-assets';
import { artifactResolver, resolveExternalProofOutput, writeExternalProof } from './helpers/external-proof-output';
import { retainedHashes, ledgerHash, validateBindings } from './export-inner-voice-custom-flow-proof';

const roles = Object.keys(retainedHashes);
const requireHash = (data: Buffer, expected: string, name: string) => assert.equal(sha256(data), expected, `${name} hash mismatch`);

export async function run() {
  const { values } = parseArgs({ options: { 'flow-config': { type: 'string' }, 'flow-manifest': { type: 'string' }, 'config-sha256': { type: 'string' }, 'asset-map': { type: 'string' }, 'asset-map-sha256': { type: 'string' }, output: { type: 'string' } } });
  assert.ok(values['flow-config'] && values['flow-manifest'] && values['config-sha256'] && values['asset-map'] && values['asset-map-sha256'] && values.output, 'Supply --flow-config --flow-manifest --config-sha256 --asset-map --asset-map-sha256 --output');
  const root = realpathSync(resolve(__dirname, '../..'));
  const binding = resolveExternalProofOutput(values.output);
  const output = binding.output;
  const sourceFiles = [__filename, resolve(__dirname, 'helpers/external-proof-output.ts'), resolve(__dirname, 'export-inner-voice-custom-flow-proof.ts')];
  const writerSourceSha256 = Object.fromEntries(sourceFiles.map(file => [file, sha256(readFileSync(file))]));
  const checkSourceHashes = () => { for (const file of sourceFiles) requireHash(readFileSync(file), writerSourceSha256[file], 'Writer source'); };
  const configBytes = readFileSync(resolve(values['flow-config'])), manifestBytes = readFileSync(resolve(values['flow-manifest']));
  requireHash(configBytes, values['config-sha256'], 'Flow config');
  const manifest = JSON.parse(manifestBytes.toString());
  assert.equal(manifest.status, 'local provisional candidate; not approved or published');
  assert.equal(manifest.candidateSha256, sha256(configBytes), 'Flow manifest mismatch');
  const config = BookConfigSchema.parse(JSON.parse(configBytes.toString()));
  assert.equal(config.bookId, 'book-finding-our-inner-voice'); assert.equal(config.status, 'draft'); assert.equal(config.rendering.recipe?.schema, 'lhb.book-render@v2');
  for (const format of ['standard', 'amazon']) validateBookRenderRecipe(config, format);
  const base = resolve(root, 'output/inner-voice-workflow-e2e-2026-10-27');
  const records: Record<string, any> = {}, recordBytes: Record<string, Buffer> = {};
  for (const role of roles) {
    const bytes = readFileSync(resolve(base, 'customization-validation/prepared-current', `${role}.json`));
    requireHash(bytes, retainedHashes[role], `Record ${role}`); recordBytes[role] = bytes; records[role] = JSON.parse(bytes.toString());
  }
  const ledgerBytes = readFileSync(resolve(base, 'local-editor-aligned-cases/generated-assets.json'));
  requireHash(ledgerBytes, ledgerHash, 'Pose ledger');
  const mapBytes = readFileSync(resolve(values['asset-map']));
  requireHash(mapBytes, values['asset-map-sha256'], 'Asset map');
  const map = LocalProofAssetMapSchema.parse(JSON.parse(mapBytes.toString()));
  const byRole = validateBindings(records, JSON.parse(ledgerBytes.toString()).assets, config.rendering.recipe!.poses, resolve(root, 'output/imagegen'), map.assets);
  const sources = new Map(Object.entries(map.assets));
  for (const role of roles) for (const asset of byRole.get(role)!) {
    const key = buildBgRemovedPoseAssetKey(records[role].characterHash, asset.poseNumber, config.bookId);
    assert.ok(!sources.has(key), `Pose key collision ${key}`); sources.set(key, { path: asset.path, sha256: asset.sha256 });
  }
  const used = new Map<string, { sourcePath: string; path: string; sha256: string; bytes: Buffer }>();
  const retainAsset = (key: string) => {
    if (!used.has(key)) {
      const source = sources.get(key); assert.ok(source, `Unmapped asset ${key}`);
      const bytes = readFileSync(source.path); requireHash(bytes, source.sha256, `Asset ${key}`);
      const path = resolve(output, 'assets', `${source.sha256}${extname(source.path)}`);
      used.set(key, { sourcePath: realpathSync(source.path), path, sha256: source.sha256, bytes });
    }
    return used.get(key)!;
  };
  // Keep every retained manifest pose available, including an unused old cover pose.
  for (const role of roles) for (const asset of byRole.get(role)!) {
    retainAsset(buildBgRemovedPoseAssetKey(records[role].characterHash, asset.poseNumber, config.bookId));
  }
  const localHtml = (html: string) => {
    const replaced = html.replace(/https?:\/\/[^/"']+\/api\/assets\/([A-Za-z0-9._/-]+)/g, (_match, key: string) => {
      return pathToFileURL(retainAsset(key).path).href.replace(/'/g, '%27').replace(/&/g, '%26');
    });
    assert.ok(!replaced.includes('/api/assets/') && !/https?:\/\//i.test(replaced), 'Remote URL remains');
    assert.ok(!/\[(?:Child Name|animal guide|subject pronoun|object pronoun|dedication message)\]/i.test(replaced), 'Unresolved personalization');
    return replaced;
  };
  let globalFetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { globalFetchCalls++; throw new Error('Local proof forbids network'); };
  try {
    const pending: Array<{ file: string; bytes: Buffer }> = [], cases: any[] = [];
    for (const role of roles) {
      const record = records[role], selection = record.selection, orderId = record.orderId;
      const w0 = buildW0RunManifestFromConfig(config, { orderId, rootOrderId: record.rootOrderId, platform: selection.formatId === 'amazon' ? 'amazon' : 'd2c', formatId: selection.formatId,
        characterHash: record.characterHash, createdAt: '2026-10-27T12:00:00.000Z', runId: `local-flow-proof-${role}`,
        input: { characterSpecs: record.specs, bookSpecs: { testMode: true }, dedicationText: selection.dedication } });
      const twoB = { characterHash: record.characterHash, order: { orderId, bookId: config.bookId }, entries: byRole.get(role)!.map(asset => ({ poseNumber: asset.poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(record.characterHash, asset.poseNumber, config.bookId) })) };
      const prefix = `${config.bookId}/orders/${orderId}`;
      const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId: selection.formatId, testMode: true, testModePages: 0 }, {
        loadManifest: async key => key === `${prefix}/manifests/1-manifest.json` ? w0 : key === `${prefix}/manifests/2b-manifest.json` ? twoB : null,
      });
      const preview = buildW3PreviewPlan({ ...assembly, backendUrl: 'https://local.invalid' });
      assert.deepEqual(preview.pagePreviewItems.map(p => p.pageLabel), config.formats[selection.formatId].interior.pageSequence.map(p => p.label));
      const items = [{ label: 'cover', html: preview.coverPreviewItem.coverHTML, width: config.rendering.preview.coverPx.w, height: config.rendering.preview.coverPx.h }, ...preview.pagePreviewItems.map(p => ({ label: p.pageLabel, html: p.pageHtml, width: config.rendering.preview.interiorPx.w, height: config.rendering.preview.interiorPx.h }))];
      const files: any[] = [];
      for (const item of items) {
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="lhb-proof-status" content="provisional local review; not print-ready"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; font-src file:; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;padding:0;width:${item.width}px;height:${item.height}px;overflow:hidden}</style></head><body>${localHtml(item.html)}</body></html>`;
        const file = `${role}/${item.label}.html`, bytes = Buffer.from(html);
        pending.push({file, bytes}); files.push({label:item.label, file, sha256:sha256(bytes), width:item.width, height:item.height});
      }
      const w0Bytes = Buffer.from(JSON.stringify(w0, null, 2) + '\n'), twoBBytes = Buffer.from(JSON.stringify(twoB, null, 2) + '\n');
      pending.push({file:`${role}/w0.json`, bytes:w0Bytes}, {file:`${role}/retained-2b.json`, bytes:twoBBytes});
      cases.push({ role, selection, orderId, rootOrderId:record.rootOrderId, characterHash:record.characterHash, files, w0Sha256:sha256(w0Bytes), twoBSha256:sha256(twoBBytes) });
    }
    assert.equal(globalFetchCalls, 0, 'Network attempted');
    checkSourceHashes();
    writeExternalProof(binding, () => {
      mkdirSync(resolve(output, 'assets'));
      const written = new Set<string>();
      for (const asset of used.values()) if (!written.has(asset.path)) { writeFileSync(asset.path, asset.bytes, {flag:'wx',mode:0o600}); requireHash(readFileSync(asset.path), asset.sha256, 'Copied asset'); written.add(asset.path); }
      for (const role of roles) mkdirSync(resolve(output, role));
      for (const item of pending) writeFileSync(resolve(output, item.file), item.bytes, {flag:'wx',mode:0o600});
      for (const [name, bytes] of [['flow-config.json',configBytes],['flow-export-manifest.json',manifestBytes],['source-asset-map.json',mapBytes],['source-pose-ledger.json',ledgerBytes]] as const) writeFileSync(resolve(output,name),bytes,{flag:'wx',mode:0o600});
      for (const role of roles) writeFileSync(resolve(output,role,'prepared-record.json'),recordBytes[role],{flag:'wx',mode:0o600});
      const assetEvidence = Object.fromEntries([...used].map(([key, a]) => [key, {sourcePath:a.sourcePath, file:`assets/${basename(a.path)}`, sha256:a.sha256}]));
      const coverSelections = Object.fromEntries(Object.entries(config.rendering.recipe!.covers).map(([format, cover]) =>
        [format, cover.layers.filter((layer: any) => layer.kind === 'pose').map((layer: any) => ({ poseId: layer.poseId, poseNumber: layer.poseNumber,
          referenceKey: config.rendering.recipe!.poses[layer.poseId].referenceKey }))]));
      const usesOldCover = Object.values(coverSelections).some(layers => layers.some((layer: any) => layer.poseNumber === 0));
      const evidence = {schema:'lhb.custom-flow-local-proof@v1', status:'provisional local review; not print-ready', approved:false, printReady:false,
        stages: {intake:'W0 manifest builder only; intake worker/order trigger not run', generation:'retained editor-aligned interior poses and earlier cover poses; W2 not run in this proof', coverProvenance:usesOldCover ? 'Pose 0 reference and W2 provenance are not independently verified; cover remains provisional' : 'Configured cover uses retained named poses with recorded reference bindings; W2 was not rerun and cover remains provisional', preview:'canonical local W3 assembly and renderer', pdf:'not run'},
        coverSelections, externalStorage: { project: 'little-hero-books', artifactRoot: binding.artifactRoot, output, resolver: artifactResolver }, writerSourceSha256,
        configSha256:sha256(configBytes), flowManifestSha256:sha256(manifestBytes), assetMapSha256:sha256(mapBytes), poseLedgerSha256:ledgerHash, recordSha256:retainedHashes, cases, assets:assetEvidence, globalFetchCalls};
      checkSourceHashes();
      writeFileSync(resolve(output,'proof-manifest.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
    });
    checkSourceHashes();
    console.log(JSON.stringify({output,books:cases.length,htmlFiles:pending.filter(p=>p.file.endsWith('.html')).length,globalFetchCalls,printReady:false}));
  } finally { globalThis.fetch = originalFetch; }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) run().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
