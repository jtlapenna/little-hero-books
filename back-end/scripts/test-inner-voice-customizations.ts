/** Offline customization parity from Book 1 through frozen Inner Voice generation inputs. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { BookConfigSchema, type BookConfig } from '../src/lib/books/types';
import { resolvePreviewCanonicalsForConfig } from '../src/lib/preview-canonicals';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW2ABaseInput } from '../src/lib/books/w2a-base-input';
import { buildW2APoseInput } from '../src/lib/books/w2a-pose-input';
import { buildW2APoseWorklist } from '../src/lib/books/review-page-plan';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { calculateCharacterHash } from '../src/lib/character-hash';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import ts from 'typescript';
import { HAIR_COLORS } from '../src/types/customization';

const frontendTraits = ts.createSourceFile('traitOptions.ts', readFileSync(new URL('../../frontend/src/lib/createFlow/traitOptions.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const frontendSkinTones = new Map<string, string>();
function collectSkinTones(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'SKIN_TONES' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
    for (const element of node.initializer.elements) {
      if (!ts.isObjectLiteralExpression(element)) continue;
      const fields = new Map(element.properties.flatMap(property => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && ts.isStringLiteral(property.initializer) ? [[property.name.text, property.initializer.text] as const] : []));
      const id = fields.get('id'), hex = fields.get('hex');
      if (id && hex) frontendSkinTones.set(id, hex);
    }
  }
  ts.forEachChild(node, collectSkinTones);
}
collectSkinTones(frontendTraits);
assert.equal(frontendSkinTones.size, 5);
const sha = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const selections = [
  { role: 'WEB-A', formatId: 'standard', name: 'Alexandra', age: 6, pronouns: 'she-her', skinTone: 'deep', hairStyle: 'afro', hairColor: 'black', favoriteColor: 'purple', clothingStyle: 't-shirt and shorts', animalGuide: 'cat', hometown: 'Oakland', dedication: 'Alexandra, your quiet voice matters. Love, your family.' },
  { role: 'AMZ-A', formatId: 'amazon', name: 'James', age: 4, pronouns: 'he/him', skinTone: 'light', hairStyle: 'curly-short', hairColor: 'red', favoriteColor: 'green', clothingStyle: 'tee-shorts', animalGuide: 'owl', hometown: 'Santa Fe', dedication: '' },
  { role: 'SIB-A', formatId: 'amazon', name: 'A', age: 3, pronouns: 'she/her', skinTone: 'medium-dark', hairStyle: 'pigtails', hairColor: 'dark-brown', favoriteColor: 'pink', clothingStyle: 'dress', animalGuide: 'dog', hometown: 'Lake Tahoe', dedication: 'For A, with love and room to grow.' },
  { role: 'SIB-B', formatId: 'amazon', name: 'Alexandria Isabella Montgomery', age: 7, pronouns: 'they-them', skinTone: 'tan', hairStyle: 'buzz', hairColor: 'blonde', favoriteColor: 'orange', clothingStyle: 'tee-shorts', animalGuide: 'unicorn', hometown: "St. John's & <Harbor>", dedication: "Alexandria, keep listening. Love, Mum & Dad <always>." },
] as const;

async function buildCase(config: BookConfig, selection: typeof selections[number]) {
  const orderId = `LOCAL-CUSTOMIZATION-${selection.role}`;
  const rootOrderId = selection.role.startsWith('SIB-') ? 'LOCAL-CUSTOMIZATION-SIBLINGS' : orderId;
  const specs = { childName: selection.name, age: selection.age, pronouns: selection.pronouns, skinTone: selection.skinTone,
    hairStyle: selection.hairStyle, hairColor: selection.hairColor, favoriteColor: selection.favoriteColor,
    clothingStyle: selection.clothingStyle, animalGuide: selection.animalGuide, hometown: selection.hometown };
  const characterHash = calculateCharacterHash(specs, orderId);
  const prefix = `${config.bookId}/orders/${orderId}`;
  const w0 = buildW0RunManifestFromConfig(config, { orderId, rootOrderId, platform: selection.formatId === 'amazon' ? 'amazon' : 'd2c',
    formatId: selection.formatId, characterHash, createdAt: '2026-10-27T12:00:00.000Z', runId: `customization-${selection.role}`,
    input: { characterSpecs: specs, dedicationText: selection.dedication, bookSpecs: { testMode: true } } });
  const normalized = normalizeW0Manifest(w0);
  assert.deepEqual(normalized.characterSpecs, specs);
  assert.equal(normalized.dedication?.text ?? '', selection.dedication);
  const baseRequest = { orderId, rootOrderId, bookId: config.bookId, configVersion: config.version, formatId: selection.formatId,
    characterHash, characterSpecs: specs, oneManifestKey: `${prefix}/manifests/1-manifest.json`, renderSnapshot: normalized.renderSnapshot,
    backendUrl: 'https://offline.invalid', testMode: true };
  const loaders = { loadConfig: async () => config, loadManifest: async (key: string) => key === `${prefix}/manifests/1-manifest.json` ? w0 : null };
  const base = await buildW2ABaseInput(baseRequest, loaders);
  const canonicals = resolvePreviewCanonicalsForConfig(specs, config);
  assert.equal(base.skinToneCanonical, `skin-${specs.skinTone}`);
  assert.equal(base.clothingTypeCanonical, specs.clothingStyle === 'dress' ? 'dress' : 'tee-shorts');
  assert.equal(base.favoriteColorHex, canonicals.favoriteColorHex);
  assert.equal(base.hairStyleCanonical, specs.hairStyle);
  assert.equal(base.hairColorCanonical, specs.hairColor);
  assert.ok(base.userPromptText.includes(base.skinToneHex!));
  assert.ok(base.userPromptText.includes(base.favoriteColorHex!));
  assert.ok(base.userPromptText.includes('EYEBROW LOCK'));
  const worklist = buildW2APoseWorklist(normalized.pagePlan, { includeZeroPose: true,
    coverLayers: normalized.renderSnapshot?.bookConfig.rendering.recipe?.covers[selection.formatId].layers });
  const poses = await Promise.all(worklist.map(async item => {
    const pose = await buildW2APoseInput({ ...baseRequest, ...item }, loaders);
    assert.equal(pose.characterHash, characterHash); assert.equal(pose.baseCharacterKey, base.baseCharacterKey);
    assert.equal(pose.clothingTypeCanonical, base.clothingTypeCanonical); assert.equal(pose.favoriteColorHex, base.favoriteColorHex);
    assert.equal(pose.hairRefS3Key, base.hairRefS3Key);
    assert.ok(pose.userPromptText.includes('Preserve BASE clothing and footwear exactly'));
    assert.ok(pose.uploadKey.startsWith(`${config.bookId}/order-generated-assets/characters/${characterHash}/`));
    return pose;
  }));
  const twoB = { characterHash, order: { orderId, bookId: config.bookId }, entries: worklist.map(p => ({
    poseNumber: p.poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, p.poseNumber, config.bookId) })) };
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId: selection.formatId, testMode: true, testModePages: 0 }, {
    loadManifest: async key => key === `${prefix}/manifests/1-manifest.json` ? w0 : key === `${prefix}/manifests/2b-manifest.json` ? twoB : null,
  });
  const preview = buildW3PreviewPlan({ ...assembly, backendUrl: 'https://offline.invalid' });
  const expectedSubject = selection.pronouns.toLowerCase().startsWith('she') ? 'she' : selection.pronouns.toLowerCase().startsWith('he') ? 'he' : 'they';
  assert.equal(preview.pronounsResolved.subject, expectedSubject);
  assert.equal(preview.pagePreviewItems.length, config.formats[selection.formatId].interior.expectedPageCount);
  if (config.rendering.recipe) {
    assert.equal(poses.length, 13);
    assert.deepEqual(poses.map(p => p.poseNumber), [...Array(13).keys()]);
    assert.ok(preview.pages_html.includes(specs.hometown.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;')));
    assert.ok(!/\[(?:Child Name|animal guide|subject pronoun|object pronoun|hometown|dedication message)\]/i.test(preview.pages_html));
  }
  return { selection, specs, characterHash, orderId, rootOrderId, w0, base, poses, preview,
    generationExecuted: false, backgroundRemovalExecuted: false, approved: false, printReady: false };
}

async function main() {
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Customization preparation forbids service access'); };
  const { values } = parseArgs({ options: { config: { type: 'string' }, output: { type: 'string' } }, allowPositionals: false });
  if (Boolean(values.config) !== Boolean(values.output)) throw new Error('Supply both --config and --output, or neither');
  const legacy = loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure', version: 1 });
  const bundled = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
  const config = values.config ? BookConfigSchema.parse(JSON.parse(readFileSync(values.config, 'utf8'))) : BookConfigSchema.parse({ ...bundled, version: 3 });
  const skinPairs = [['light', 'skin-light'], ['medium', 'skin-medium'], ['tan', 'skin-tan'], ['medium-dark', 'skin-medium-dark'], ['deep', 'skin-deep']] as const;
  for (const book of [legacy, config]) for (const [label, canonical] of skinPairs) {
    const input = { skinTone: label, pronouns: 'she-her', hairStyle: 'afro', hairColor: 'black', favoriteColor: 'purple' };
    assert.equal(resolvePreviewCanonicalsForConfig(input, book).skinToneHex, frontendSkinTones.get(label), `${book.bookId}: generation target must match selected skin swatch`);
    assert.deepEqual(resolvePreviewCanonicalsForConfig({ ...input, skinTone: canonical }, book), resolvePreviewCanonicalsForConfig(input, book), `${book.bookId}: canonical skin must retain chosen appearance`);
  }
  const results = [];
  for (const selected of selections) {
    const old = await buildCase(legacy, selected), current = await buildCase(config, selected);
    for (const field of ['skinToneCanonical', 'skinToneHex', 'clothingTypeCanonical', 'favoriteColorHex', 'hairStyleCanonical', 'hairColorCanonical'])
      assert.equal(current.base[field as keyof typeof current.base], old.base[field as keyof typeof old.base], `Book 1 parity: ${field}`);
    results.push(current);
  }
  for (const book of [legacy, config]) for (const hairColor of HAIR_COLORS) {
    const specs = { childName: 'Hair color control', skinTone: 'deep', pronouns: 'she-her', hairStyle: 'curly-short', hairColor, favoriteColor: 'green' };
    const built = await buildW2ABaseInput({ orderId: `LOCAL-HAIR-${hairColor}`, bookId: book.bookId, configVersion: book.version,
      formatId: 'standard', characterHash: 'local-hair-control', characterSpecs: specs, testMode: true }, { loadConfig: async () => book });
    assert.equal(built.hairColorCanonical, hairColor, `${book.bookId}: hair color ${hairColor}`);
    assert.ok(built.hairRefS3Key?.endsWith(`curly-short-${hairColor}.jpg`));
  }
  for (const pronouns of ['she', 'she/her', 'she-her', 'She / Her', 'he', 'he/him', 'he-him', 'He / Him', 'they/them', 'they-them']) {
    const sample = await buildCase(config, { ...selections[0], pronouns } as typeof selections[number]);
    const expected = pronouns.toLowerCase().startsWith('she') ? 'she' : pronouns.toLowerCase().startsWith('he') ? 'he' : 'they';
    assert.equal(sample.preview.pronounsResolved.subject, expected);
  }
  assert.equal(new Set(results.map(r => r.characterHash)).size, 4);
  assert.equal(results[2].rootOrderId, results[3].rootOrderId);
  assert.notEqual(results[2].base.uploadKey, results[3].base.uploadKey);
  assert.equal(networkAttempts, 0);
  if (values.output) {
    const output = resolve(values.output); mkdirSync(output, { mode: 0o700 });
    for (const result of results) writeFileSync(resolve(output, `${result.selection.role}.json`), JSON.stringify(result, null, 2)+'\n', { flag: 'wx', mode: 0o600 });
    writeFileSync(resolve(output, 'summary.json'), JSON.stringify({ configSha256: sha(readFileSync(values.config!)), bookId: config.bookId,
      version: config.version, cases: 3, children: 4, baseRequests: 4, poseRequests: results.reduce((sum,r)=>sum+r.poses.length,0),
      generationExecuted: false, networkAttempts, approved: false, printReady: false }, null, 2)+'\n', { flag: 'wx', mode: 0o600 });
  }
  console.log('Customization parity passed: four children, Book 1 controls, 10 canonical skin checks, 10 pronoun forms, frozen W0/W2/W3; network attempts 0');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
