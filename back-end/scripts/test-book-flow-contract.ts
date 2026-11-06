import assert from 'node:assert/strict';
import { configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { renderConfiguredBook } from '../src/lib/books/configured-book-rendering';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { renderFlowContent } from '../src/lib/books/flow-layout.mjs';

const raw = configuredBookRaw();
const flow = {
  id: 'flying-headline', text: '[Child Name] and [Animal Guide] flew through the stars.',
  placement: { left: 100, top: 100, width: 1000, height: 300 }, fontSize: 80,
  flow: { paragraphs: [{ runs: [
    { text: '[Child Name] and [Animal Guide] ' },
    { text: 'flew', style: { color: '#ffd966', sizeRatio: 1.2, rotateDeg: -4 } },
    { text: ' through the stars.' },
  ] }] },
};
raw.rendering.recipe.schema = 'lhb.book-render@v2';
raw.rendering.recipe.copy.title = flow;
raw.rendering.recipe.covers.standard.texts = [flow];
const config = BookConfigSchema.parse(raw);
const w0 = buildW0RunManifestFromConfig(config, { orderId: 'FLOW-01', platform: 'd2c', formatId: 'standard', characterHash: 'flow-child', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
const snapshot = normalizeW0Manifest(JSON.parse(JSON.stringify(w0))).renderSnapshot!;
assert.deepEqual(snapshot.bookConfig.rendering.recipe!.copy.title, config.rendering.recipe!.copy.title, 'Flow must survive the frozen W0 producer path');
const manifest = buildW3Manifest({ orderId: 'FLOW-01', bookId: config.bookId, formatId: 'standard',
  configVersion: config.version, renderSnapshot: snapshot, backendUrl: 'https://local.invalid',
  pagePreviewImages: config.formats.standard.interior.pageSequence.map(page => ({ pageNumber: page.index, r2Key: `${config.bookId}/orders/FLOW-01/${page.label}.png` })),
  coverPngR2Key: `${config.bookId}/orders/FLOW-01/cover.png` });
assert.equal((manifest.manifest.summary as { readyForBook: boolean }).readyForBook, false, 'Flow cannot be ready without verified fit');
const rendered = renderConfiguredBook({ bookId: config.bookId, formatId: 'standard', configVersion: config.version,
  backendUrl: 'https://local.invalid', characterHash: 'flow-child',
  characterSpecs: { childName: "O'Neil & <Joy> [Animal Guide]", animalGuide: 'owl' },
  processedImages: [13, 17, 18].map(poseNumber => ({ poseNumber, publicUrl: `https://local.invalid/pose${poseNumber}.png` })) }, snapshot);
const titleHtml = rendered.pageBlocks.find(block => block.page.id === 'title')!.html;
assert.match(titleHtml, /<p class="lhb-flow-paragraph">/);
assert.match(titleHtml, /O&#39;Neil &amp; &lt;Joy&gt; \[Animal Guide\] and Owl /);
assert.match(titleHtml, /rotate\(-4deg\)/);
assert.match(titleHtml, />flew<\/span>/);
assert.match(rendered.coverHTML, /\.lhb-flow-paragraph\{margin:0/);
assert.match(rendered.coverHTML, /<p class="lhb-flow-paragraph">/);
const preview = buildW3PreviewPlan({ orderId: 'FLOW-01', bookId: config.bookId, formatId: 'standard', configVersion: config.version,
  renderSnapshot: snapshot, backendUrl: 'https://local.invalid', characterHash: 'flow-child',
  characterSpecs: { childName: "O'Neil & <Joy> [Animal Guide]", animalGuide: 'owl' },
  processedImages: [13, 17, 18].map(poseNumber => ({ poseNumber, publicUrl: `https://local.invalid/pose${poseNumber}.png` })) });
assert.match(preview.pagePreviewItems[0].pageHtml, /<p class="lhb-flow-paragraph">/);
assert.match(preview.coverPreviewItem.coverHTML, /<p class="lhb-flow-paragraph">/);
assert.match(preview.page_css, /\.lhb-flow-paragraph\{margin:0/);
const tokens = { 'child name': '<img src=x> & [Animal Guide]' };
const ungrouped = { paragraphs: [{ runs: [{ text: '[Child Name] ' }, { text: 'flew', style: { color: '#abcdef', sizeRatio: 1.2 } }, { text: ' home' }] }] };
assert.equal(renderFlowContent(ungrouped, tokens), '<p class="lhb-flow-paragraph"><span>&lt;img src=x&gt; &amp; [Animal Guide] </span><span style="color:#abcdef;font-size:120%;">flew</span><span> home</span></p>', 'Unflagged markup remains byte-for-byte unchanged');
const grouped = structuredClone(ungrouped) as typeof ungrouped & { paragraphs: Array<{ runs: Array<{ text: string; style?: { color?: string; sizeRatio?: number }; keepWithNext?: boolean }> }> };
grouped.paragraphs[0].runs[0].keepWithNext = true;
grouped.paragraphs[0].runs[1].keepWithNext = true;
assert.equal(renderFlowContent(grouped, tokens), '<p class="lhb-flow-paragraph"><span style="white-space:pre;overflow-wrap:normal;"><span>&lt;img src=x&gt; &amp; [Animal Guide] </span><span style="color:#abcdef;font-size:120%;">flew</span><span> home</span></span></p>', 'Grouped mixed styles and token values must be escaped exactly once');
for (const separator of ['\r', '\n', '\f']) {
  assert.throws(() => renderFlowContent(grouped, { 'child name': `Ada${separator}Lee` }), /Grouped flow values cannot contain line breaks/);
  assert.match(renderFlowContent(ungrouped, { 'child name': `Ada${separator}Lee` }), new RegExp(`Ada${separator}Lee`), 'Ungrouped token values retain existing multiline behavior');
}
const groupedConfig = structuredClone(raw);
const emptyRuns = structuredClone(raw);
emptyRuns.rendering.recipe.copy.title.flow.paragraphs[0].runs = [];
assert.equal(BookConfigSchema.safeParse(emptyRuns).success, false, 'Empty runs must return a validation error without throwing');
groupedConfig.rendering.recipe.copy.title.flow.paragraphs[0].runs[0].keepWithNext = true;
const parsedGrouped = BookConfigSchema.parse(groupedConfig);
const groupedW0 = buildW0RunManifestFromConfig(parsedGrouped, { orderId: 'FLOW-GROUP', platform: 'd2c', formatId: 'standard', characterHash: 'flow-child' });
const groupedSnapshot = normalizeW0Manifest(JSON.parse(JSON.stringify(groupedW0))).renderSnapshot!;
assert.deepEqual(groupedSnapshot.bookConfig.rendering.recipe!.copy.title, parsedGrouped.rendering.recipe!.copy.title, 'Grouping must survive the frozen W0 JSON snapshot');
const groupedRendered = renderConfiguredBook({ bookId: parsedGrouped.bookId, formatId: 'standard', configVersion: parsedGrouped.version,
  backendUrl: 'https://local.invalid', characterHash: 'flow-child', characterSpecs: { childName: '<Ada> & [Animal Guide]', animalGuide: 'owl' },
  processedImages: [13, 17, 18].map(poseNumber => ({ poseNumber, publicUrl: `https://local.invalid/pose${poseNumber}.png` })) }, groupedSnapshot);
assert.match(groupedRendered.pageBlocks.find(block => block.page.id === 'title')!.html,
  /<span style="white-space:pre;overflow-wrap:normal;"><span>&lt;Ada&gt; &amp; \[Animal Guide\] and Owl <\/span><span style="color:#ffd966;font-size:120%;display:inline-block;transform:rotate\(-4deg\);">flew<\/span><\/span>/,
  'W3 renders the frozen grouping with escaped token values and preserved emphasis');
const groupedManifest = buildW3Manifest({ orderId: 'FLOW-GROUP', bookId: parsedGrouped.bookId, formatId: 'standard', configVersion: parsedGrouped.version,
  renderSnapshot: groupedSnapshot, backendUrl: 'https://local.invalid',
  pagePreviewImages: parsedGrouped.formats.standard.interior.pageSequence.map(page => ({ pageNumber: page.index, r2Key: `fixture/${page.label}.png` })), coverPngR2Key: 'fixture/cover.png' });
assert.equal((groupedManifest.manifest.summary as { readyForBook: boolean }).readyForBook, false, 'Grouped or oversized runs cannot imply verified fit');
const phraseRaw = structuredClone(raw);
phraseRaw.rendering.recipe.copy.title.text = 'Hello [Animal Guide]  friend';
phraseRaw.rendering.recipe.copy.title.flow.paragraphs[0].runs = [{ text: 'Hello [Animal Guide]  friend', atomicPhrase: true, style: { rotateDeg: -5, color: '#abcdef', sizeRatio: 1.2 } }];
const phraseConfig = BookConfigSchema.parse(phraseRaw);
const phraseW0 = buildW0RunManifestFromConfig(phraseConfig, { orderId: 'FLOW-PHRASE', platform: 'd2c', formatId: 'standard', characterHash: 'flow-child' });
const phraseSnapshot = normalizeW0Manifest(JSON.parse(JSON.stringify(phraseW0))).renderSnapshot!;
assert.deepEqual(phraseSnapshot.bookConfig.rendering.recipe!.copy.title, phraseConfig.rendering.recipe!.copy.title, 'Atomic phrase must survive the frozen W0 snapshot');
const phraseRendered = renderConfiguredBook({ bookId: phraseConfig.bookId, formatId: 'standard', configVersion: phraseConfig.version,
  backendUrl: 'https://local.invalid', characterHash: 'flow-child', characterSpecs: { childName: 'Ada', animalGuide: 'unicorn' },
  processedImages: [13, 17, 18].map(poseNumber => ({ poseNumber, publicUrl: `https://local.invalid/pose${poseNumber}.png` })) }, phraseSnapshot);
assert.match(phraseRendered.pageBlocks.find(block => block.page.id === 'title')!.html, /white-space:pre;overflow-wrap:normal;transform:rotate\(-5deg\);">Hello Unicorn  friend<\/span>/);
const phrase = { paragraphs: [{ runs: [{ text: 'Hello [Animal Guide]  friend', atomicPhrase: true as const, style: { rotateDeg: -5 } }] }] };
assert.equal(renderFlowContent(phrase, { 'animal guide': '<img src=x> & [Animal Guide]' }), '<p class="lhb-flow-paragraph"><span style="display:inline-block;white-space:pre;overflow-wrap:normal;transform:rotate(-5deg);">Hello &lt;img src=x&gt; &amp; [Animal Guide]  friend</span></p>');
for (const separator of ['\r', '\n', '\v', '\f', '\u0085', '\u2028', '\u2029']) {
  assert.throws(() => renderFlowContent(phrase, { 'animal guide': `Cat${separator}Dog` }), /Atomic phrase values cannot contain line breaks/);
}
const punctuation = { paragraphs: [{ runs: [{ text: '[Animal Guide]', atomicPhrase: true as const }, { text: '.' }] }] };
assert.throws(() => renderFlowContent(punctuation, { 'animal guide': 'Unicorn' }), /Adjacent punctuation/);
const tiedPunctuation = { paragraphs: [{ runs: [{ text: '[Animal Guide]', atomicPhrase: true as const, keepWithNext: true }, { text: '.' }] }] };
assert.match(renderFlowContent(tiedPunctuation, { 'animal guide': 'Unicorn' }), /white-space:pre;overflow-wrap:normal;"><span style="display:inline-block;white-space:pre;overflow-wrap:normal;">Unicorn<\/span><span>\.<\/span>/);
for (const text of ['\ud800', '\udc00']) {
  assert.throws(() => renderFlowContent(phrase, { 'animal guide': text }), /unpaired surrogates/);
  const invalid = structuredClone(raw);
  invalid.rendering.recipe.copy.title.text = text;
  invalid.rendering.recipe.copy.title.flow.paragraphs[0].runs = [{ text, atomicPhrase: true }];
  assert.equal(BookConfigSchema.safeParse(invalid).success, false, 'Atomic phrases reject unpaired surrogates');
}
const astral = structuredClone(raw);
astral.rendering.recipe.copy.title.text = 'guide 😀';
astral.rendering.recipe.copy.title.flow.paragraphs[0].runs = [{ text: 'guide 😀', atomicPhrase: true }];
assert.equal(BookConfigSchema.safeParse(astral).success, true, 'Valid surrogate pairs remain valid');
const untiedRaw = structuredClone(raw);
untiedRaw.rendering.recipe.copy.title.text = '[Animal Guide].';
untiedRaw.rendering.recipe.copy.title.flow = punctuation;
assert.equal(BookConfigSchema.safeParse(untiedRaw).success, false, 'Untied punctuation must be rejected');
untiedRaw.rendering.recipe.copy.title.flow = tiedPunctuation;
assert.equal(BookConfigSchema.safeParse(untiedRaw).success, true, 'Explicitly tied punctuation is accepted');
for (const runs of [
  [{ text: '[Animal Guide]', atomicPhrase: true }, { text: ' ' }, { text: '.' }],
  [{ text: '[Animal Guide]', atomicPhrase: true, keepWithNext: true }, { text: ' ' }, { text: '.' }],
  [{ text: '“' }, { text: ' ' }, { text: '[Animal Guide]', atomicPhrase: true }],
  [{ text: '“', keepWithNext: true }, { text: ' ' }, { text: '[Animal Guide]', atomicPhrase: true }],
]) {
  const candidate = structuredClone(raw);
  candidate.rendering.recipe.copy.title.text = runs.map(run => run.text).join('');
  candidate.rendering.recipe.copy.title.flow = { paragraphs: [{ runs }] };
  assert.equal(BookConfigSchema.safeParse(candidate).success, false, 'Punctuation and intervening spaces require a complete grouping chain');
  assert.throws(() => renderFlowContent({ paragraphs: [{ runs: runs as Array<{ text: string; atomicPhrase?: true; keepWithNext?: boolean }> }] }, { 'animal guide': 'Unicorn' }), /Adjacent punctuation/);
}
for (const runs of [
  [{ text: '[Animal Guide]', atomicPhrase: true, keepWithNext: true }, { text: ' ', keepWithNext: true }, { text: '.' }],
  [{ text: '“', keepWithNext: true }, { text: ' ', keepWithNext: true }, { text: '[Animal Guide]', atomicPhrase: true }],
]) {
  const candidate = structuredClone(raw);
  candidate.rendering.recipe.copy.title.text = runs.map(run => run.text).join('');
  candidate.rendering.recipe.copy.title.flow = { paragraphs: [{ runs }] };
  assert.equal(BookConfigSchema.safeParse(candidate).success, true, 'A complete chain binds punctuation across spaces');
}
const sentenceBreak = { paragraphs: [{ runs: [{ text: 'left. ' }, { text: 'Then right.', atomicPhrase: true as const }] }] };
const sentenceConfig = structuredClone(raw);
sentenceConfig.rendering.recipe.copy.title.text = 'left. Then right.';
sentenceConfig.rendering.recipe.copy.title.flow = sentenceBreak;
assert.equal(BookConfigSchema.safeParse(sentenceConfig).success, true, 'A previous sentence may wrap before an atomic phrase');
assert.match(renderFlowContent(sentenceBreak, {}), /left\. <\/span><span style="display:inline-block;white-space:pre;overflow-wrap:normal;">Then right\./);
const phraseManifest = buildW3Manifest({ orderId: 'FLOW-PHRASE', bookId: phraseConfig.bookId, formatId: 'standard', configVersion: phraseConfig.version,
  renderSnapshot: phraseSnapshot, backendUrl: 'https://local.invalid', pagePreviewImages: phraseConfig.formats.standard.interior.pageSequence.map(page => ({ pageNumber: page.index, r2Key: `fixture/${page.label}.png` })), coverPngR2Key: 'fixture/cover.png' });
assert.equal((phraseManifest.manifest.summary as { readyForBook: boolean }).readyForBook, false, 'Atomic phrases do not establish fit');
const oldConfig = BookConfigSchema.parse(configuredBookRaw());
const oldW0 = buildW0RunManifestFromConfig(oldConfig, { orderId: 'FLOW-LEGACY', platform: 'd2c', formatId: 'standard', characterHash: 'legacy-child', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
const oldSnapshot = normalizeW0Manifest(JSON.parse(JSON.stringify(oldW0))).renderSnapshot!;
const oldManifest = buildW3Manifest({ orderId: 'FLOW-LEGACY', bookId: oldConfig.bookId, formatId: 'standard', configVersion: oldConfig.version,
  renderSnapshot: oldSnapshot, backendUrl: 'https://local.invalid',
  pagePreviewImages: oldConfig.formats.standard.interior.pageSequence.map(page => ({ pageNumber: page.index, r2Key: `${oldConfig.bookId}/orders/FLOW-LEGACY/${page.label}.png` })),
  coverPngR2Key: `${oldConfig.bookId}/orders/FLOW-LEGACY/cover.png` });
assert.equal((oldManifest.manifest.summary as { readyForBook: boolean }).readyForBook, true, 'Complete v1 manifests retain their existing readiness behavior');
const legacy = structuredClone(raw); legacy.rendering.recipe.schema = 'lhb.book-render@v1';
assert.throws(() => BookConfigSchema.parse(legacy), 'A v1 reader must reject flow rather than discard it');
for (const bad of [
  { ...flow, text: 'mismatched' },
  { ...flow, placement: { left: 100, top: 100, width: 1000 } },
  { ...flow, placement: { left: 100, top: 100, width: 1000, height: 20 }, padding: 20 },
  { ...flow, nameFit: { thresholdChars: 5, minScale: .5 } },
  { ...flow, text: 'ab', flow: { paragraphs: [{ runs: [{ text: 'a', keepWithNext: 'true' }, { text: 'b' }] }] } },
  { ...flow, text: 'a', flow: { paragraphs: [{ runs: [{ text: 'a', keepWithNext: true }] }] } },
  { ...flow, text: 'a', flow: { paragraphs: [{ runs: [{ text: 'a', keepWithNext: false }] }] } },
  { ...flow, html: '<script>unsafe</script>' },
  { ...flow, text: '<script>unsafe</script>', flow: { paragraphs: [{ runs: [{ text: '<script>unsafe</script>' }] }] } },
  { ...flow, text: '<!-- hidden -->', flow: { paragraphs: [{ runs: [{ text: '<!-- hidden -->' }] }] } },
  { ...flow, text: '<script>unsafe</script>', flow: { paragraphs: [{ runs: [{ text: '<scr' }, { text: 'ipt>unsafe</scr' }, { text: 'ipt>' }] }] } },
  { ...flow, text: '[Unknown Token]', flow: { paragraphs: [{ runs: [{ text: '[Unknown Token]' }] }] } },
  { ...flow, text: '[Child Name]', flow: { paragraphs: [{ runs: [{ text: '[Child ' }, { text: 'Name]' }] }] } },
  { ...flow, text: 'fly away', flow: { paragraphs: [{ runs: [{ text: 'fly away', style: { rotateDeg: 5 } }] }] } },
  { ...flow, text: '[Child Name]', flow: { paragraphs: [{ runs: [{ text: '[Child Name]', style: { rotateDeg: 5 } }] }] } },
  { ...flow, text: 'hello', flow: { paragraphs: [{ runs: [{ text: 'hello', atomicPhrase: false }] }] } },
  { ...flow, text: '[Child Name]', flow: { paragraphs: [{ runs: [{ text: '[Child Name]', atomicPhrase: true }] }] } },
  { ...flow, text: 'a'.repeat(257), flow: { paragraphs: [{ runs: [{ text: 'a'.repeat(257), atomicPhrase: true }] }] } },
  { ...flow, text: 'a\u2028b', flow: { paragraphs: [{ runs: [{ text: 'a\u2028b', atomicPhrase: true }] }] } },
  { ...flow, flow: { paragraphs: [{ runs: [{ text: 'x', style: { color: 'url(evil)' } }] }] } },
]) {
  const candidate = structuredClone(raw); candidate.rendering.recipe.copy.title = bad;
  assert.throws(() => BookConfigSchema.parse(candidate), 'Malformed flow must be rejected');
}
const unused = structuredClone(raw);
unused.rendering.recipe.copy['unused-page'] = { ...flow, text: '[Unknown Token]', flow: { paragraphs: [{ runs: [{ text: '[Unknown Token]' }] }] } };
assert.throws(() => BookConfigSchema.parse(unused), 'Unknown tokens in unused copy must not enter a frozen recipe');
const unusedLegacyBlock = structuredClone(raw);
unusedLegacyBlock.rendering.recipe.copy['unused-page'] = { text: '[Unknown Token]', placement: { left: 0, top: 0, width: 100 }, fontSize: 20 };
assert.throws(() => buildW0RunManifestFromConfig(BookConfigSchema.parse(unusedLegacyBlock), { orderId: 'FLOW-BAD', platform: 'd2c', formatId: 'standard', characterHash: 'flow-child' }), /Unknown copy token/);
console.log('Book flow contract tests passed');
