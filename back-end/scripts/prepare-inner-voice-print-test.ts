#!/usr/bin/env tsx
/** Prepare a new, offline book candidate with approved shadows baked into its backgrounds. */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { BookConfigSchema } from '../src/lib/books/types';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { assertBookConfigSemantics } from '../src/lib/books/book-config-semantics';
import { computeBookConfigChecksum } from '../src/lib/books/runtime-book-config';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { LocalProofAssetMapSchema, configuredLocalAssetUses } from './helpers/inner-voice-local-assets';

const BOOK = 'book-finding-our-inner-voice';
export interface PreparationInput {
  base: string; review: string; sourceRoot: string; assetMap: string; retainedAssets: string;
  output: string; version: number;
}
export async function preparePrintTest(input: PreparationInput) {
  assert.ok(Number.isSafeInteger(input.version) && input.version > 3, 'Use an unused version greater than 3');
  const output = resolve(input.output);
  assert.ok(!existsSync(output), 'Refuse to overwrite an existing preparation');
  const baseBytes = readFileSync(input.base);
  const config = BookConfigSchema.parse(JSON.parse(baseBytes.toString('utf8')));
  assert.equal(config.bookId, BOOK); assert.equal(config.version, 3);
  assert.equal(config.rendering.recipe?.schema, 'lhb.book-render@v2');
  const recipe = config.rendering.recipe!;
  const review = realpathSync(input.review), sourceRoot = realpathSync(input.sourceRoot);
  const previousQa = JSON.parse(readFileSync(resolve(review, 'qa-review.json'), 'utf8'));
  assert.equal(previousQa.all5EditorControlsUnchanged, true, 'Review input controls were not verified');
  const approvedArt = JSON.parse(readFileSync(resolve(review, 'updated-art-manifest.json'), 'utf8')) as {records: Array<{role: string; sha256: string}>};
  const before = structuredClone(config);
  config.version = input.version; config.status = 'draft';
  config.displayName = 'Finding Our Inner Voice (print-test candidate)';
  const rawMap = LocalProofAssetMapSchema.parse(JSON.parse(readFileSync(input.assetMap, 'utf8')));
  const resolved = new Map<string, {path: string; sha256: string; bytes?: Buffer}>();
  // Retained proofs moved during workspace organization. Resolve exact hashes, never approximate images.
  for (const [key, asset] of Object.entries(rawMap.assets)) {
    const paths = [asset.path,
      asset.path.replace('/Users/jeff/Projects/little-hero-books/', sourceRoot + '/'),
      resolve(input.retainedAssets, asset.sha256 + extname(asset.path))];
    const path = paths.find(p => existsSync(p) && sha256(readFileSync(p)) === asset.sha256);
    if (path) resolved.set(key, {path: realpathSync(path), sha256: asset.sha256});
  }
  for (const [key, asset] of Object.entries(rawMap.assets)) {
    if (resolved.has(key)) continue;
    const sameBytes = [...resolved.values()].find(value => value.sha256 === asset.sha256);
    if (sameBytes) resolved.set(key, sameBytes);
  }
  const entries: Array<{role: string; key: string; source: string; sourceSha256: string; sha256: string; dimensions: [number, number]; shadowApplication: string}> = [];
  async function background(role: string, file: string): Promise<string> {
    const path = realpathSync(resolve(review, file));
    let bytes: Buffer = readFileSync(path);
    const accepted = approvedArt.records.find(row => row.role === (role === 'cover-wrap' ? 'covers' : role));
    assert.ok(accepted, `Missing approved background identity: ${role}`);
    assert.equal(sha256(bytes), accepted.sha256, `Background changed after review: ${role}`);
    const meta = await sharp(bytes, {failOn: 'warning'}).metadata();
    assert.equal(meta.format, 'png'); assert.ok(meta.channels === 3 || meta.channels === 4, 'Background must be RGB or opaque RGBA');
    assert.ok(meta.width && meta.height); assert.equal(meta.depth, 'uchar');
    if (role === 'cover-wrap') assert.ok(meta.width >= 1766 && meta.height >= 891 && Math.abs(meta.width / meta.height - 409.03 / 206) < 0.01, 'Unexpected native cover dimensions');
    else assert.ok(meta.width >= 2048 && meta.width === meta.height, 'Interior backgrounds require at least 2048 square native pixels');
    if (meta.channels === 4) {
      const stats = await sharp(bytes).stats();
      assert.equal(stats.channels[3].min, 255, 'A background may not retain transparent pixels');
      bytes = await sharp(bytes).removeAlpha().png().toBuffer();
    }
    await sharp(bytes).raw().toBuffer();
    const hash = sha256(bytes), key = `${BOOK}/v${input.version}/backgrounds/${hash}/${basename(path)}`;
    resolved.set(key, {path, sha256: hash, bytes});
    entries.push({role, key, source: path, sourceSha256: accepted.sha256, sha256: hash, dimensions: [meta.width, meta.height], shadowApplication: 'baked into background pixels; no runtime shadow layer'});
    return key;
  }
  for (const page of config.formats.standard.interior.pageSequence) {
    const number = page.index + 1;
    const slot = page.backgroundSlot; assert.ok(slot, 'Every prepared page needs its saved background slot');
    const key = await background(`page-${String(number).padStart(2, '0')}`, `backgrounds/page-${String(number).padStart(2, '0')}.png`);
    const shared = config.assets.backgrounds[slot];
    // Every edition must use the same background slot for this immutable page identity.
    for (const edition of Object.values(config.formats)) assert.equal(edition.interior.pageSequence[page.index].backgroundSlot, page.backgroundSlot);
    config.assets.backgrounds[slot] = key;
    for (const [slot, existing] of Object.entries(config.assets.backgrounds)) if (existing === shared) config.assets.backgrounds[slot] = key;
  }
  for (const [slot, variants] of Object.entries(config.assets.guideBackgrounds ?? {})) {
    const number = Number(slot.split('_')[1]);
    for (const guide of Object.keys(variants)) {
      variants[guide] = await background(`page-${String(number).padStart(2, '0')}-${guide}`, `backgrounds/guide-variants/page-${String(number).padStart(2, '0')}-${guide}.png`);
    }
  }
  const cover = await background('cover-wrap', 'backgrounds/cover-wrap.png');
  config.assets.backgrounds.covers = cover; config.assets.backgrounds.coversAmazon = cover;
  // Jeff permitted a general LHL note instead of duplicating title/imprint information.
  const imprint = recipe.copy['page-31'];
  assert.ok(Array.isArray(imprint), 'Expected the existing three-block imprint page');
  assert.equal(imprint.length, 3);
  imprint[1].text = 'Every child is the hero of their own story.\n\nPersonalized books for little readers\nand the people who love them.';
  imprint[1].lineHeight = 1.45;
  imprint[2].text = 'www.LittleHeroLabs.com';
  assert.ok(!JSON.stringify(config).includes('Copyright details pending'));
  for (const format of ['standard', 'amazon']) {
    assert.deepEqual(config.formats[format].interior, before.formats[format].interior, 'Saved placements and clipping must not change');
    assert.deepEqual(recipe.covers[format], before.rendering.recipe!.covers[format], 'Preserve current release cover fitting');
    validateBookRenderRecipe(config, format);
  }
  assert.deepEqual(recipe.poses, before.rendering.recipe!.poses);
  assertBookConfigSemantics(config);
  const uses = configuredLocalAssetUses(config), missing = [...uses.keys()].filter(key => !resolved.has(key));
  // These original guide clue aliases are declared for compatibility but are not rendered by this book.
  assert.ok(missing.every(key => /\/v1\/animals\/(?:cat|dog|lion|penguin|t-rex|tiger|unicorn)-clues\.png$/.test(key)), `Missing selected assets: ${missing.join(', ')}`);
  mkdirSync(resolve(output, 'assets'), {recursive: true});
  const assets: Record<string, {path: string; sha256: string}> = {};
  for (const key of uses.keys()) {
    const source = resolved.get(key); if (!source) continue;
    const target = resolve(output, 'assets', source.sha256 + extname(source.path));
    if (!existsSync(target)) {
      if (source.bytes) writeFileSync(target, source.bytes, {flag:'wx'});
      else copyFileSync(source.path, target);
    }
    assert.equal(sha256(readFileSync(target)), source.sha256);
    assets[key] = {path: target, sha256: source.sha256};
  }
  const candidateBytes = Buffer.from(JSON.stringify(config, null, 2) + '\n');
  const manifest = {schema: 'lhb.inner-voice-print-test-preparation@v1', status: 'local provisional candidate; not approved or published',
    bookId: BOOK, version: config.version, baseConfigSha256: sha256(baseBytes), candidateSha256: sha256(candidateBytes),
    runtimeChecksum: computeBookConfigChecksum(config), sourceReview: review, approvedShadowRevision: 39,
    entries, runtimeShadowLayers: 0, savedFigureGeometryPreserved: true, currentLongNameFittingPreserved: true,
    unusedUnmappedAliases: missing, uploaded: false, activated: false, paidPrintingEnabled: false,
    nextGate: 'Verify unused version against published config store, upload immutable assets with readback, then publish/activate the exact reviewed config before a hosted proof.'};
  writeFileSync(resolve(output, 'authoring-draft.json'), candidateBytes, {flag:'wx'});
  writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2)+'\n', {flag:'wx'});
  writeFileSync(resolve(output, 'local-asset-map.json'), JSON.stringify(LocalProofAssetMapSchema.parse({schema:'lhb.local-proof-assets@v1', assets}), null, 2)+'\n', {flag:'wx'});
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  const {values} = parseArgs({options: {base:{type:'string'},review:{type:'string'},'source-root':{type:'string'},'asset-map':{type:'string'},'retained-assets':{type:'string'},output:{type:'string'},version:{type:'string'}}});
  assert.ok(values.base && values.review && values['source-root'] && values['asset-map'] && values['retained-assets'] && values.output && values.version, 'Supply all paths and --version');
  preparePrintTest({base:values.base, review:values.review, sourceRoot:values['source-root'], assetMap:values['asset-map'],retainedAssets:values['retained-assets'],output:values.output,version:Number(values.version)})
    .then(result => console.log(JSON.stringify({backgroundBindings:result.entries.length, checksum:result.runtimeChecksum, version:result.version, uploaded:false})))
    .catch(error => {console.error(error instanceof Error ? error.message : error);process.exitCode=1;});
}
