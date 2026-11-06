#!/usr/bin/env tsx
/**
 * Builds (or checks) bundled Inner Voice config version 3 from the reviewed October 29
 * "long-name candidate r3". Offline and deterministic. v3.json is r3 with exactly one line changed
 * (status "draft" -> "active", line 6). Active only changes who MAY select v3: it still needs a published,
 * active database row, and print stays blocked until a recorded flow-release approval exists.
 *
 *   build:  tsx scripts/build-inner-voice-config-v3.ts [--r3 <file>] [--asset-map <file>]
 *   check:  tsx scripts/build-inner-voice-config-v3.ts --check
 *           (committed files only: v3.json bytes vs manifest, recomputed checksum/keys/allowed-missing)
 *   check:  tsx scripts/build-inner-voice-config-v3.ts --check --verify-inputs [--r3 ..] [--asset-map ..]
 *           (additionally recomputes everything from the local r3 and source-asset-map inputs)
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { BookConfigSchema, type BookConfig } from '../src/lib/books/types';
import { assertBookConfigSemantics } from '../src/lib/books/book-config-semantics';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { computeBookConfigChecksum } from '../src/lib/books/runtime-book-config';
import { configuredLocalAssetUses, LocalProofAssetMapSchema } from './helpers/inner-voice-local-assets';

export const R3_SHA256 = '8dc06d4b76cf10fc1610383abafb47fab006a07cce714ef039b5f7bdc08344af';
/** sha256 of r3 with only the status line (line 6) changed from draft to active; the bytes bundled as v3.json. */
export const V3_ACTIVE_SHA256 = '3514215239afeedd876a65142deaabf7db749d08cbd2b1cdbf91fbbdf78d92f9';
export const ASSET_MAP_SHA256 = '3e87091b41504a95f0a31da2071be20cc3b23e72d6f5996b299cc2f7f00e4166';
const BOOK = 'book-finding-our-inner-voice';
const ROOT = resolve(__dirname, '../..');
export const DEFAULT_R3 = resolve(ROOT, 'output/inner-voice-long-name-candidate-2026-10-29-r3/authoring-draft.json');
export const DEFAULT_ASSET_MAP = '/Volumes/WD_BLACK/AgentArtifacts/little-hero-books/inner-voice-external-proof-2026-10-29-r1/source-asset-map.json';
const CONFIG_DIR = resolve(__dirname, '../src/lib/books/configs/book-finding-our-inner-voice');
export const V3_FILE = resolve(CONFIG_DIR, 'v3.json');
export const V3_MANIFEST_FILE = resolve(CONFIG_DIR, 'v3.manifest.json');

/** Keys r3 declares that have no art and are never rendered (guide backgrounds supply pages 9, 10, 13). */
export const ALLOWED_MISSING_KEYS = [
  ...['cat', 'dog', 'lion', 'penguin', 't-rex', 'tiger', 'unicorn'].map(g => `${BOOK}/v1/animals/${g}-clues.png`),
  ...['09', '10', '13'].map(p => `${BOOK}/v1/backgrounds/page_${p}.png`),
].sort();

/** Returns r3 with line 6 changed from draft to active. Throws unless that line is exactly the expected draft line. */
export function r3ToV3ActiveBytes(r3: Buffer): Buffer {
  const lines = r3.toString('utf8').split('\n');
  assert.equal(lines[5], '  "status": "draft",', 'r3 line 6 must be the draft status line');
  lines[5] = '  "status": "active",';
  return Buffer.from(lines.join('\n'), 'utf8');
}

function validate(bytes: Buffer): BookConfig {
  const config = BookConfigSchema.parse(JSON.parse(bytes.toString('utf8')));
  assert.equal(config.bookId, BOOK);
  assert.equal(config.version, 3, 'Config must be version 3');
  assert.equal(config.status, 'active', 'v3 is bundled active; selection still requires a published active row');
  assertBookConfigSemantics(config);
  for (const formatId of Object.keys(config.formats)) validateBookRenderRecipe(config, formatId);
  assert.deepEqual(Object.keys(config.formats).sort(), ['amazon', 'standard']);
  return config;
}

export function declaredAssetKeys(config: BookConfig): string[] {
  return [...configuredLocalAssetUses(config).keys()].sort();
}

function buildManifest(v3Bytes: Buffer, inputs?: { r3Path: string; r3Sha256: string; mapPath: string; mapSha256: string; mapKeys: Set<string> }) {
  const config = validate(v3Bytes);
  const keys = declaredAssetKeys(config);
  const missing = ALLOWED_MISSING_KEYS.filter(k => keys.includes(k));
  assert.deepEqual(missing, ALLOWED_MISSING_KEYS, 'Allowed-missing keys must all be declared by the config');
  if (inputs) {
    const unmapped = keys.filter(k => !inputs.mapKeys.has(k)).sort();
    assert.deepEqual(unmapped, ALLOWED_MISSING_KEYS, 'Exactly the allowed-missing keys may be absent from the source asset map');
  }
  return {
    schema: 'lhb.inner-voice-config-v3-manifest@v1',
    bookId: BOOK, version: 3, status: config.status,
    note: 'Bundled config, status active (r3 plus one status line). Selection still requires a published active database row. Recipe is render@v2 and layout review is absent, so print stays blocked until a recorded flow-release approval exists.',
    inputs: {
      r3: { relativePath: 'output/inner-voice-long-name-candidate-2026-10-29-r3/authoring-draft.json', sha256: R3_SHA256 },
      sourceAssetMap: { sha256: ASSET_MAP_SHA256, externalProofDir: 'inner-voice-external-proof-2026-10-29-r1' },
    },
    v3JsonSha256: sha256(v3Bytes),
    runtimeChecksum: computeBookConfigChecksum(config),
    assetKeyCount: keys.length,
    assetKeys: keys,
    allowedMissingKeys: ALLOWED_MISSING_KEYS,
  };
}

function loadInputs(r3Path: string, mapPath: string) {
  const r3 = readFileSync(r3Path); assert.equal(sha256(r3), R3_SHA256, 'r3 hash mismatch');
  const mapBytes = readFileSync(mapPath); assert.equal(sha256(mapBytes), ASSET_MAP_SHA256, 'source-asset-map hash mismatch');
  const map = LocalProofAssetMapSchema.parse(JSON.parse(mapBytes.toString('utf8')));
  return { r3, r3Path, r3Sha256: R3_SHA256, mapPath, mapSha256: ASSET_MAP_SHA256, mapKeys: new Set(Object.keys(map.assets)) };
}

export function run(argv: string[]): void {
  const { values } = parseArgs({ args: argv, options: { check: { type: 'boolean' }, 'verify-inputs': { type: 'boolean' }, r3: { type: 'string' }, 'asset-map': { type: 'string' } } });
  const r3Path = resolve(values.r3 ?? DEFAULT_R3), mapPath = resolve(values['asset-map'] ?? DEFAULT_ASSET_MAP);
  if (values.check) {
    assert.ok(existsSync(V3_FILE) && existsSync(V3_MANIFEST_FILE), 'v3.json and v3.manifest.json must exist');
    const v3 = readFileSync(V3_FILE);
    let inputs: ReturnType<typeof loadInputs> | undefined;
    if (values['verify-inputs']) {
      inputs = loadInputs(r3Path, mapPath);
      assert.ok(v3.equals(r3ToV3ActiveBytes(inputs.r3)), 'v3.json differs from r3 modulo the status line');
    }
    assert.equal(sha256(v3), V3_ACTIVE_SHA256, 'v3.json must match the pinned active hash');
    const expected = JSON.stringify(buildManifest(v3, inputs), null, 2) + '\n';
    assert.equal(readFileSync(V3_MANIFEST_FILE, 'utf8'), expected, 'v3.manifest.json differs from recomputed manifest');
    console.log(`build-inner-voice-config-v3 --check: ok (sha256 ${sha256(v3)}${inputs ? ', inputs verified' : ''})`);
    return;
  }
  const inputs = loadInputs(r3Path, mapPath);
  const active = r3ToV3ActiveBytes(inputs.r3);
  assert.equal(sha256(active), V3_ACTIVE_SHA256, 'active bytes hash mismatch');
  validate(active);
  if (existsSync(V3_FILE)) assert.ok(readFileSync(V3_FILE).equals(active), 'Refusing to overwrite a different existing v3.json');
  else writeFileSync(V3_FILE, active, { flag: 'wx' });
  const manifest = JSON.stringify(buildManifest(active, inputs), null, 2) + '\n';
  if (existsSync(V3_MANIFEST_FILE)) assert.equal(readFileSync(V3_MANIFEST_FILE, 'utf8'), manifest, 'Refusing to overwrite a different existing v3.manifest.json');
  else writeFileSync(V3_MANIFEST_FILE, manifest, { flag: 'wx' });
  console.log(`build-inner-voice-config-v3: wrote ${V3_FILE} (sha256 ${sha256(active)})`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  try { run(process.argv.slice(2)); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
