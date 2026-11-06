#!/usr/bin/env tsx
/** Export draft W0/W3 HTML with hash-checked local assets for headless review. */
import { constants, copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateFinalArtCandidate } from '../src/lib/books/final-art-candidate';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { LocalProofAssetMapSchema } from './helpers/inner-voice-local-assets';
import { BookConfigSchema } from '../src/lib/books/types';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { writeLocalProof } from './helpers/local-proof-output';

async function main() {
  const { values } = parseArgs({ options: { inventory: { type: 'string' }, 'flow-config': { type: 'string' }, 'flow-manifest': { type: 'string' }, 'asset-map': { type: 'string' }, 'review-pages': { type: 'string' }, output: { type: 'string' } }, allowPositionals: false });
  const flowMode = !!values['flow-config'] && !!values['flow-manifest'];
  if ((!values.inventory && !flowMode) || (values.inventory && (values['flow-config'] || values['flow-manifest'])) || (!!values['flow-config'] !== !!values['flow-manifest']) || !values['asset-map'] || !values.output) throw new Error('Supply one candidate source, --asset-map and --output (new directory, existing parent)');
  const root = realpathSync(resolve(__dirname, '../..'));
  const output = resolve(values.output);
  if (!output.startsWith(root + sep) || !realpathSync(dirname(output)).startsWith(root + sep)) throw new Error('Proof output must be inside this project');
  const candidate = values.inventory ? await validateFinalArtCandidate(root, resolve(values.inventory)) : null;
  let config = candidate?.config;
  let flowManifestSha256: string | null = null;
  let flowConfigBytes: Buffer | null = null, flowManifestBytes: Buffer | null = null;
  let configSha256 = candidate?.inventory.configSha256;
  if (flowMode) {
    const bytes = readFileSync(resolve(values['flow-config']!)), manifestBytes = readFileSync(resolve(values['flow-manifest']!));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.status !== 'local provisional candidate; not approved or published' || manifest.candidateSha256 !== sha256(bytes)) throw new Error('Flow export manifest does not match candidate bytes');
    config = BookConfigSchema.parse(JSON.parse(bytes.toString('utf8')));
    if (config.bookId !== 'book-finding-our-inner-voice' || config.status !== 'draft' || config.rendering.recipe?.schema !== 'lhb.book-render@v2') throw new Error('Expected a provisional Inner Voice flow draft');
    for (const format of ['standard', 'amazon']) validateBookRenderRecipe(config, format);
    configSha256 = sha256(bytes); flowManifestSha256 = sha256(manifestBytes);
    flowConfigBytes = bytes; flowManifestBytes = manifestBytes;
  }
  if (!config || !configSha256) throw new Error('Missing candidate configuration');
  if (!flowMode && values['review-pages'] !== undefined) throw new Error('Review pages require a flow candidate');
  const nameReviewPages = (values['review-pages'] ?? 'p25').split(',');
  if (nameReviewPages.some(label => !/^p\d{2}$/.test(label)) || new Set(nameReviewPages).size !== nameReviewPages.length ||
      ['standard', 'amazon'].some(format => nameReviewPages.some(label => !config!.formats[format].interior.pageSequence.some(page => page.label === label)))) {
    throw new Error('Review pages must be distinct configured interior labels');
  }
  const rawMap = readFileSync(resolve(values['asset-map']));
  const map = LocalProofAssetMapSchema.parse(JSON.parse(rawMap.toString('utf8')));
  const source = new Map<string, string>();
  const usedAssets = new Map<string, { path: string; sourcePath: string; sha256: string }>();
  for (const entry of candidate?.inventory.entries ?? []) source.set(entry.r2Key, resolve(root, entry.source));
  const poseHash = 'synthetic-local-proof';
  for (const pose of Object.values(config.rendering.recipe!.poses)) {
    const reference = map.assets[pose.referenceKey];
    if (!reference) throw new Error(`Missing pose reference fixture: ${pose.referenceKey}`);
    map.assets[buildBgRemovedPoseAssetKey(poseHash, pose.poseNumber, config.bookId)] = reference;
  }
  const localHtml = (html: string) => {
    const replaced = html.replace(/https?:\/\/[^/"']+\/api\/assets\/([A-Za-z0-9._/-]+)/g, (_match, key: string) => {
      const cached = usedAssets.get(key);
      if (cached) return pathToFileURL(cached.path).href.replace(/'/g, '%27').replace(/&/g, '%26');
      const path = source.get(key) ?? map.assets[key]?.path;
      if (!path) throw new Error(`Missing local proof asset: ${key}`);
      const bytes = readFileSync(path);
      const expected = candidate?.inventory.entries.find(entry => entry.r2Key === key)?.sha256 ?? map.assets[key]?.sha256;
      if (sha256(bytes) !== expected) throw new Error(`Local proof asset hash mismatch: ${key}`);
      const frozen = resolve(output, 'assets', `${expected}${extname(path)}`);
      usedAssets.set(key, { path: frozen, sourcePath: realpathSync(path), sha256: expected! });
      return pathToFileURL(frozen).href.replace(/'/g, '%27').replace(/&/g, '%26');
    });
    if (replaced.includes('/api/assets/') || /https?:\/\//.test(replaced)) throw new Error('Unmapped remote URL in proof HTML');
    return replaced;
  };
  const names = ['A', 'Alexandra', 'James', 'Alexandria Isabella Montgomery', 'm'.repeat(30), "O'Neil & <Joy>"];
  const guides = ['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 't-rex', 'unicorn'];
  const files: Array<{ formatId: string; guide: string; name: string; pageLabel: string; width: number; height: number; file: string; sha256: string }> = [];
  const pending: Array<{ file: string; html: string }> = [];
  for (const formatId of ['standard', 'amazon']) for (const guide of guides) {
    // Full interiors for all guides; six cover-name cases share the cat fixture.
    for (const [nameIndex, name] of (flowMode || guide === 'cat' ? names : ['Alexandra']).entries()) {
      const orderId = `LOCAL-PROOF-${formatId}-${guide}-${nameIndex}`;
      const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', formatId,
        characterHash: poseHash, input: { bookSpecs: { testMode: true }, characterSpecs: { childName: name, animalGuide: guide, pronouns: 'they/them', hometown: 'Grass Valley' } } });
      const twoB = { characterHash: poseHash, order: { orderId, bookId: config.bookId }, entries: Object.values(config.rendering.recipe!.poses).map(pose => ({
        poseNumber: pose.poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(poseHash, pose.poseNumber, config.bookId),
      })) };
      const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, testMode: true, testModePages: 0 }, {
        loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? twoB : null,
      });
      const preview = buildW3PreviewPlan({ ...assembly, backendUrl: 'https://local.invalid' });
      const items = [
        ...(guide === 'cat' ? [{ pageLabel: 'cover', html: preview.coverPreviewItem.coverHTML,
          width: config.rendering.preview.coverPx.w, height: config.rendering.preview.coverPx.h }] : []),
        ...preview.pagePreviewItems.filter(page => flowMode ? nameIndex === 1 || nameReviewPages.includes(page.pageLabel) : nameIndex === (guide === 'cat' ? 1 : 0)).map(page => ({
          pageLabel: page.pageLabel, html: page.pageHtml, width: config.rendering.preview.interiorPx.w, height: config.rendering.preview.interiorPx.h,
        })),
      ];
      for (const item of items) {
        const file = `${formatId}-${guide}-${nameIndex}-${item.pageLabel}.html`;
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="lhb-proof-status" content="provisional local review; not print-ready"><title>Provisional local review</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; font-src file:; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;padding:0;width:${item.width}px;height:${item.height}px;overflow:hidden}</style></head><body>${localHtml(item.html)}</body></html>`;
        pending.push({ file, html }); files.push({ formatId, guide, name, pageLabel: item.pageLabel,
          width: item.width, height: item.height, file, sha256: sha256(Buffer.from(html)) });
      }
    }
  }
  writeLocalProof(output, () => {
  mkdirSync(resolve(output, 'assets'));
  const copied = new Set<string>();
  for (const asset of usedAssets.values()) {
    if (!copied.has(asset.path)) copyFileSync(asset.sourcePath, asset.path, constants.COPYFILE_EXCL);
    if (sha256(readFileSync(asset.path)) !== asset.sha256) throw new Error('Local proof asset changed while copying');
    copied.add(asset.path);
  }
  for (const item of pending) writeFileSync(resolve(output, item.file), item.html, { flag: 'wx', mode: 0o600 });
  if (flowConfigBytes && flowManifestBytes) {
    writeFileSync(resolve(output, 'flow-config.json'), flowConfigBytes, {flag:'wx',mode:0o600});
    writeFileSync(resolve(output, 'flow-export-manifest.json'), flowManifestBytes, {flag:'wx',mode:0o600});
  }
  writeFileSync(resolve(output, 'proof-manifest.json'), JSON.stringify({ schema: 'lhb.final-art-local-proof@v1',
    inventorySha256: candidate?.inventorySha256 ?? null, flowManifestSha256, configSha256,
    flowConfigFile: flowMode ? 'flow-config.json' : null, flowManifestFile: flowMode ? 'flow-export-manifest.json' : null,
    assetMapSha256: sha256(rawMap), poseInputs: 'configured pose reference fixtures, not generated W2 outputs',
    approved: false, printReady: false, liveRequests: 0, ...(flowMode ? {nameReviewPages} : {}), assets: Object.fromEntries(usedAssets), files }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, htmlFiles: files.length, covers: files.filter(file => file.pageLabel === 'cover').length, interiorPages: files.filter(file => file.pageLabel !== 'cover').length, liveRequests: 0, printReady: false }));
  });
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
