#!/usr/bin/env tsx
/**
 * Local-only successor for Inner Voice v3 art: copies every mapped source file (verified source-asset-map
 * plus the 52 retained pose ledger entries) by sha256 into a NEW content-addressed directory under the
 * artifact root. Offline, never overwrites, aborts on any hash mismatch before or after copying.
 * Run only through: /Users/jeff/.local/bin/agent-heavy-job --kind build -- node --import tsx <this> --under-agent-heavy-job
 */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { BookConfigSchema } from '../src/lib/books/types';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { calculateCharacterHash } from '../src/lib/character-hash';
import { LocalProofAssetMapSchema, configuredLocalAssetUses } from './helpers/inner-voice-local-assets';
import { resolveArtifactRoot, resolveExternalProofOutput, writeExternalProof } from './helpers/external-proof-output';
import { ALLOWED_MISSING_KEYS, ASSET_MAP_SHA256, DEFAULT_ASSET_MAP, DEFAULT_R3, R3_SHA256, V3_FILE } from './build-inner-voice-config-v3';

export const POSE_LEDGER_SHA256 = '6bd07a1d40cd2372ef9b6777a5e04f848ef8d379c29cb817f0d72d4cd923d445';
export const RETAINED_RECORD_SHA256: Record<string, string> = {
  'WEB-A': 'fe34caddfaab54f871181f11e6cbefebcd16edf3177a6cd748af9da7e186bb58',
  'AMZ-A': '96b3fc26ac372dffacceb25c17070a2995747f6877952178654c33e1d5161daf',
  'SIB-A': '277441c3d8a279a611e8a32e28f05a4629bc7e3b074d1feceab1dd5350b89ea5',
  'SIB-B': '53e905b1e76e23a077fbb328b6984129397cfb23e71ff508aaec7177e49d9fdd',
};
export const PROOF_DIR = '/Volumes/WD_BLACK/AgentArtifacts/little-hero-books/inner-voice-external-proof-2026-10-29-r1';
const need = (data: Buffer, expected: string, name: string) => assert.equal(sha256(data), expected, `${name} hash mismatch`);
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function main(argv: string[]) {
  const { values } = parseArgs({ args: argv, options: { 'under-agent-heavy-job': { type: 'boolean' }, output: { type: 'string' } } });
  assert.ok(values['under-agent-heavy-job'], 'Run only through agent-heavy-job and pass --under-agent-heavy-job');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Offline: network forbidden'); };
  try {
    const r3 = readFileSync(DEFAULT_R3); need(r3, R3_SHA256, 'r3');
    assert.ok(readFileSync(V3_FILE).equals(r3), 'Bundled v3.json differs from r3');
    const config = BookConfigSchema.parse(JSON.parse(r3.toString('utf8')));
    for (const f of Object.keys(config.formats)) validateBookRenderRecipe(config, f);
    const mapBytes = readFileSync(DEFAULT_ASSET_MAP); need(mapBytes, ASSET_MAP_SHA256, 'source-asset-map');
    const map = LocalProofAssetMapSchema.parse(JSON.parse(mapBytes.toString('utf8')));
    const ledgerBytes = readFileSync(resolve(PROOF_DIR, 'source-pose-ledger.json')); need(ledgerBytes, POSE_LEDGER_SHA256, 'pose ledger');
    const ledger = JSON.parse(ledgerBytes.toString('utf8')).assets as any[];
    assert.equal(ledger.length, 52, 'Expected 52 pose ledger entries');
    const records: Record<string, any> = {};
    for (const role of Object.keys(RETAINED_RECORD_SHA256)) {
      const bytes = readFileSync(resolve(PROOF_DIR, role, 'prepared-record.json')); need(bytes, RETAINED_RECORD_SHA256[role], `record ${role}`);
      records[role] = JSON.parse(bytes.toString('utf8'));
      assert.equal(records[role].characterHash, calculateCharacterHash(records[role].specs, records[role].orderId), `character hash ${role}`);
    }
    const sources = new Map<string, { path: string; sha256: string; kind: 'static' | 'pose' }>();
    for (const [key, v] of Object.entries(map.assets)) sources.set(key, { ...v, kind: 'static' });
    for (const a of ledger) {
      assert.ok(records[a.role], `Unknown role ${a.role}`);
      const key = buildBgRemovedPoseAssetKey(records[a.role].characterHash, a.poseNumber, config.bookId);
      assert.ok(!sources.has(key), `Key collision ${key}`);
      sources.set(key, { path: a.path, sha256: a.sha256, kind: 'pose' });
    }
    // Verify every source before creating anything.
    const bytesBySha = new Map<string, Buffer>();
    for (const [key, s] of sources) {
      const data = readFileSync(s.path); need(data, s.sha256, `source ${key}`);
      if (!bytesBySha.has(s.sha256)) bytesBySha.set(s.sha256, data);
    }
    const binding = resolveExternalProofOutput(values.output ?? resolve(resolveArtifactRoot(), `inner-voice-v3-assets-${stamp()}-r1`));
    const out = binding.output;
    const extBySha = new Map<string, string>();
    for (const [key, s] of sources) {
      const ext = extname(s.path); assert.ok(['.png', '.ttf'].includes(ext), `Unexpected extension ${key}`);
      assert.ok((extBySha.get(s.sha256) ?? ext) === ext, `Extension conflict for ${s.sha256}`);
      extBySha.set(s.sha256, ext);
    }
    const v3Keys = new Set(configuredLocalAssetUses(config).keys());
    writeExternalProof(binding, () => {
      mkdirSync(resolve(out, 'files'), { mode: 0o700 });
      for (const [digest, ext] of extBySha) {
        const dest = resolve(out, 'files', digest + ext);
        const src = [...sources.values()].find(s => s.sha256 === digest)!;
        copyFileSync(src.path, dest, 1 /* COPYFILE_EXCL */); chmodSync(dest, 0o600);
        need(readFileSync(dest), digest, `copied ${digest}`);
      }
      const assets: Record<string, { path: string; sha256: string }> = {};
      for (const [key, s] of [...sources].sort(([a], [b]) => a.localeCompare(b))) assets[key] = { path: resolve(out, 'files', s.sha256 + extBySha.get(s.sha256)), sha256: s.sha256 };
      writeFileSync(resolve(out, 'local-asset-map.json'), JSON.stringify({ schema: 'lhb.local-proof-assets@v1', assets }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      const missingFromSources = [...v3Keys].filter(k => !sources.has(k)).sort();
      assert.deepEqual(missingFromSources, ALLOWED_MISSING_KEYS, 'Only the allowed-missing keys may be unmapped');
      const staticKeys = [...sources].filter(([, s]) => s.kind === 'static').map(([k]) => k);
      const manifest = {
        schema: 'lhb.inner-voice-v3-assets@v1', status: 'local review copy; not uploaded, not approved',
        bookId: config.bookId, configVersion: 3, configSha256: R3_SHA256, sourceAssetMapSha256: ASSET_MAP_SHA256, poseLedgerSha256: POSE_LEDGER_SHA256, recordSha256: RETAINED_RECORD_SHA256,
        counts: { mappedKeys: staticKeys.length, poseKeys: sources.size - staticKeys.length, totalKeys: sources.size, distinctFiles: extBySha.size,
          v3DeclaredKeys: v3Keys.size, v3DeclaredAndMapped: [...v3Keys].filter(k => sources.has(k)).length, mappedButNotUsedByV3: staticKeys.filter(k => !v3Keys.has(k)).length },
        mappedButNotUsedByV3: staticKeys.filter(k => !v3Keys.has(k)).sort(),
        allowedMissingKeys: ALLOWED_MISSING_KEYS, networkCalls: 0,
        externalStorage: { artifactRoot: binding.artifactRoot, output: out },
      };
      writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ output: out, ...manifest.counts }));
    });
  } finally { globalThis.fetch = originalFetch; }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
