#!/usr/bin/env tsx
/**
 * Offline render-proof exporter for the BUNDLED Inner Voice v3 config. Successor of
 * export-inner-voice-external-flow-proof.ts: same canonical chain (buildW0RunManifestFromConfig ->
 * buildW3AssemblyInput -> buildW3PreviewPlan), but the config comes from the bundled loader and the art
 * from a prepare-inner-voice-v3-assets.ts directory. Writes a proof dir that local_custom_flow_pdf.py can render.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { computeBookConfigChecksum } from '../src/lib/books/runtime-book-config';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { LocalProofAssetMapSchema } from './helpers/inner-voice-local-assets';
import { artifactResolver, resolveExternalProofOutput, writeExternalProof } from './helpers/external-proof-output';
import { POSE_LEDGER_SHA256, PROOF_DIR, RETAINED_RECORD_SHA256 } from './prepare-inner-voice-v3-assets';
import { R3_SHA256, V3_FILE } from './build-inner-voice-config-v3';

const roles = Object.keys(RETAINED_RECORD_SHA256);
const need = (data: Buffer, expected: string, name: string) => assert.equal(sha256(data), expected, `${name} hash mismatch`);
const FLOW_MANIFEST_SHA256 = '03f5bba44fea0f6a9fadf877e98c3e5d84a7648bb189a4df0bc334ef1aa67036';

export async function run(argv: string[]) {
  const { values } = parseArgs({ args: argv, options: { 'asset-dir': { type: 'string' }, output: { type: 'string' } } });
  assert.ok(values['asset-dir'] && values.output, 'Supply --asset-dir and --output');
  const binding = resolveExternalProofOutput(values.output);
  const output = binding.output;
  const assetDir = resolve(values['asset-dir']);
  const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 3 });
  const configBytes = readFileSync(V3_FILE); need(configBytes, R3_SHA256, 'Bundled v3.json');
  assert.equal(config.status, 'draft');
  for (const f of ['standard', 'amazon']) validateBookRenderRecipe(config, f);
  const mapBytes = readFileSync(resolve(assetDir, 'local-asset-map.json'));
  const map = LocalProofAssetMapSchema.parse(JSON.parse(mapBytes.toString('utf8')));
  const assetManifest = JSON.parse(readFileSync(resolve(assetDir, 'manifest.json'), 'utf8'));
  assert.equal(assetManifest.configSha256, R3_SHA256);
  const flowManifestBytes = readFileSync(resolve(PROOF_DIR, 'flow-export-manifest.json')); need(flowManifestBytes, FLOW_MANIFEST_SHA256, 'Flow manifest');
  const ledgerBytes = readFileSync(resolve(PROOF_DIR, 'source-pose-ledger.json')); need(ledgerBytes, POSE_LEDGER_SHA256, 'Pose ledger');
  const records: Record<string, any> = {}, recordBytes: Record<string, Buffer> = {};
  for (const role of roles) {
    const bytes = readFileSync(resolve(PROOF_DIR, role, 'prepared-record.json')); need(bytes, RETAINED_RECORD_SHA256[role], `Record ${role}`);
    recordBytes[role] = bytes; records[role] = JSON.parse(bytes.toString('utf8'));
  }
  const poseNumbers = Object.values(config.rendering.recipe!.poses).map((p: any) => p.poseNumber);
  const poseKeysByRole = new Map<string, Array<{ poseNumber: number; key: string }>>();
  for (const role of roles) {
    const list = poseNumbers.map((n: number) => ({ poseNumber: n, key: buildBgRemovedPoseAssetKey(records[role].characterHash, n, config.bookId) }));
    for (const e of list) assert.ok(map.assets[e.key], `Missing pose asset ${role}/${e.poseNumber}`);
    poseKeysByRole.set(role, list);
  }
  const used = new Map<string, { path: string; sha256: string; bytes: Buffer; dest: string }>();
  const retain = (key: string) => {
    if (!used.has(key)) {
      const source = map.assets[key]; assert.ok(source, `Unmapped asset ${key}`);
      const bytes = readFileSync(source.path); need(bytes, source.sha256, `Asset ${key}`);
      used.set(key, { path: source.path, sha256: source.sha256, bytes, dest: resolve(output, 'assets', `${source.sha256}${extname(source.path)}`) });
    }
    return used.get(key)!;
  };
  for (const role of roles) for (const e of poseKeysByRole.get(role)!) retain(e.key);
  const localHtml = (html: string) => {
    const replaced = html.replace(/https?:\/\/[^/"']+\/api\/assets\/([A-Za-z0-9._/-]+)/g, (_m, key: string) => pathToFileURL(retain(key).dest).href.replace(/'/g, '%27').replace(/&/g, '%26'));
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
      const twoB = { characterHash: record.characterHash, order: { orderId, bookId: config.bookId }, entries: poseKeysByRole.get(role)!.map(e => ({ poseNumber: e.poseNumber, bgRemovedKey: e.key })) };
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
        pending.push({ file, bytes }); files.push({ label: item.label, file, sha256: sha256(bytes), width: item.width, height: item.height });
      }
      const w0Bytes = Buffer.from(JSON.stringify(w0, null, 2) + '\n'), twoBBytes = Buffer.from(JSON.stringify(twoB, null, 2) + '\n');
      pending.push({ file: `${role}/w0.json`, bytes: w0Bytes }, { file: `${role}/retained-2b.json`, bytes: twoBBytes });
      cases.push({ role, selection, orderId, rootOrderId: record.rootOrderId, characterHash: record.characterHash, files, w0Sha256: sha256(w0Bytes), twoBSha256: sha256(twoBBytes) });
    }
    assert.equal(globalFetchCalls, 0, 'Network attempted');
    writeExternalProof(binding, () => {
      mkdirSync(resolve(output, 'assets'));
      const written = new Set<string>();
      for (const a of used.values()) if (!written.has(a.dest)) { writeFileSync(a.dest, a.bytes, { flag: 'wx', mode: 0o600 }); need(readFileSync(a.dest), a.sha256, 'Copied asset'); written.add(a.dest); }
      for (const role of roles) mkdirSync(resolve(output, role));
      for (const item of pending) writeFileSync(resolve(output, item.file), item.bytes, { flag: 'wx', mode: 0o600 });
      for (const [name, bytes] of [['flow-config.json', configBytes], ['flow-export-manifest.json', flowManifestBytes], ['source-asset-map.json', mapBytes], ['source-pose-ledger.json', ledgerBytes]] as const) writeFileSync(resolve(output, name), bytes, { flag: 'wx', mode: 0o600 });
      for (const role of roles) writeFileSync(resolve(output, role, 'prepared-record.json'), recordBytes[role], { flag: 'wx', mode: 0o600 });
      const assetEvidence = Object.fromEntries([...used].map(([key, a]) => [key, { sourcePath: a.path, file: `assets/${basename(a.dest)}`, sha256: a.sha256 }]));
      const coverSelections = Object.fromEntries(Object.entries(config.rendering.recipe!.covers).map(([format, cover]) =>
        [format, cover.layers.filter((layer: any) => layer.kind === 'pose').map((layer: any) => ({ poseId: layer.poseId, poseNumber: layer.poseNumber, referenceKey: config.rendering.recipe!.poses[layer.poseId].referenceKey }))]));
      const evidence = { schema: 'lhb.custom-flow-local-proof@v1', status: 'provisional local review; not print-ready', approved: false, printReady: false,
        stages: { intake: 'W0 manifest builder only', generation: 'retained editor-aligned poses; W2 not run', preview: 'canonical local W3 assembly and renderer, bundled v3 config', pdf: 'not run' },
        bundledConfig: { version: 3, status: config.status, runtimeChecksum: computeBookConfigChecksum(config) },
        coverSelections, externalStorage: { project: 'little-hero-books', artifactRoot: binding.artifactRoot, output, resolver: artifactResolver, assetDir },
        configSha256: sha256(configBytes), flowManifestSha256: sha256(flowManifestBytes), assetMapSha256: sha256(mapBytes), poseLedgerSha256: POSE_LEDGER_SHA256,
        recordSha256: RETAINED_RECORD_SHA256, cases, assets: assetEvidence, globalFetchCalls };
      writeFileSync(resolve(output, 'proof-manifest.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    });
    console.log(JSON.stringify({ output, books: cases.length, htmlFiles: pending.filter(p => p.file.endsWith('.html')).length, assets: used.size, globalFetchCalls, printReady: false }));
  } finally { globalThis.fetch = originalFetch; }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) run(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
