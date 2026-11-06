import assert from 'node:assert/strict';
import { textFormatCases } from './helpers/book-v3-text-format-cases';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { BookV3CopyBlockSchema } from '../src/lib/books/book-render-contract';
import { renderBookV3Copy, renderBookV3Stacks } from '../src/lib/books/book-v3-copy';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { prepareW3AssemblyRun } from '../src/lib/workers/w3-assembly-worker';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { renderW3PreviewDocument } from '../src/lib/w3-pdfmonkey-preview';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

const expectation = process.env.B0_EXPECTATION ?? 'fixed';
assert.ok(expectation === 'old' || expectation === 'fixed', 'Explicit old/fixed expectation required');
const records: Array<Record<string, any>> = [];
let checks = 0, externalAttempts = 0, requestCount = 0, normalizationCount = 0;
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const baseCopy: any = { id: 'b0-copy', text: '[dedication message]', fontSize: 50, lineHeight: 1.3, color: '#123456', align: 'left', padding: 0, placement: { left: 0, top: 0, width: 2000 } };
function content(html: string, id: string): string {
  const block = html.match(new RegExp('data-copy-block-id="' + id + '"[^>]*>(<span[^>]*>)([\\s\\S]*?)</span>'));
  assert.ok(block, 'Actual copy block missing: ' + id); checks++;
  return block[2];
}
const assertContent = (html: string, id: string, expected: string) => { assert.equal(content(html, id), escape(expected)); checks++; };
function withMode(value: any, mode: string) { if (mode !== 'omitted') value.textFormat = mode; return value; }

function hasTextFormatIssue(value: unknown, targetPath: Array<string | number>, inheritedPath: Array<string | number> = []): boolean {
  if (Array.isArray(value)) return value.some(item => hasTextFormatIssue(item, targetPath, inheritedPath));
  if (!value || typeof value !== 'object') return false;
  const issue = value as Record<string, any>;
  const ownPath = Array.isArray(issue.path) ? issue.path : [];
  const absolute = ownPath.length >= inheritedPath.length && inheritedPath.every((part, i) => ownPath[i] === part);
  const path = absolute ? ownPath : [...inheritedPath, ...ownPath];
  const matches = (expected: Array<string | number>) => path.length === expected.length && expected.every((part, i) => path[i] === part);
  if ((issue.code === 'invalid_value' || issue.code === 'invalid_type') && matches([...targetPath, 'textFormat'])) return true;
  if (issue.code === 'unrecognized_keys' && matches(targetPath) && Array.isArray(issue.keys) && issue.keys.includes('textFormat')) return true;
  return Object.values(issue).some(item => hasTextFormatIssue(item, targetPath, path));
}

function matcherControls() {
  const target = ['rendering', 'recipe', 'copy', 'title'];
  const unrecognized = { code: 'unrecognized_keys', keys: ['textFormat'], path: [] };
  const cases = [
    { id: 'recorded-relative-union', value: [{ code: 'invalid_union', path: target, errors: [[unrecognized]] }], expected: true },
    { id: 'already-absolute-nested', value: [{ code: 'invalid_union', path: target, errors: [[{ ...unrecognized, path: target }]] }], expected: true },
    { id: 'wrong-parent', value: [{ code: 'invalid_union', path: ['rendering', 'recipe', 'copy', 'other'], errors: [[unrecognized]] }], expected: false },
    { id: 'wrong-key', value: [{ ...unrecognized, keys: ['other'], path: target }], expected: false },
    { id: 'missing-context', value: [unrecognized], expected: false },
    { id: 'sibling-context', value: [{ ...unrecognized, keys: ['other'], path: target }, unrecognized], expected: false },
    { id: 'outer-union-only', value: [{ code: 'invalid_union', path: target, errors: [] }], expected: false },
    { id: 'wrong-leaf', value: [{ code: 'invalid_value', path: [...target, 'other'] }], expected: false },
    { id: 'specific-enum-leaf', value: [{ code: 'invalid_value', path: [...target, 'textFormat'] }], expected: true },
  ];
  for (const item of cases) {
    const observation: Record<string, any> = { kind: 'matcher-control', ...item }; records.push(observation);
    observation.actual = hasTextFormatIssue(item.value, target);
    assert.equal(observation.actual, item.expected, item.id); checks++;
  }
}

async function pipeline(c: typeof textFormatCases[number], mode: string, formatId: string) {
  const raw = rawV3();
  const title = withMode({ ...raw.rendering.recipe.copy.title, text: '[dedication message]' }, mode);
  raw.rendering.recipe.copy.title = title;
  raw.rendering.recipe.covers[formatId].texts = [{ ...title, id: 'b0-cover' }];
  raw.rendering.recipe.covers[formatId].stacks = [{ id: 'b0-stack', placement: { left: 0, top: 0, width: 2000 }, children: [
    { ...withMode({ id: 'b0-stack-copy', kind: 'text', text: '[dedication message]', fontSize: 50, lineHeight: 1.3, color: '#123456', align: 'left', padding: 0 }, mode) },
  ] }];
  const observation: Record<string, any> = { kind: 'pipeline', id: c.id, mode, formatId, input: c.input, configInput: structuredClone(raw), stage: 'start', requests: [], manifestReads: [] };
  records.push(observation);
  const before = JSON.stringify(raw);
  const config = BookConfigSchema.parse(raw);
  const orderId = `B0-${formatId}-${c.id}-${mode}`, characterHash = 'synthetic-b0-child';
  const one = buildW0RunManifestFromConfig(config, { orderId, formatId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', characterHash,
    createdAt: '2026-10-31T00:00:00.000Z', runId: 'synthetic-b0-copy', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl', pronouns: 'they/them' }, dedicationText: c.input } });
  observation.stage = 'w0'; observation.snapshot = one.book.resolved.renderSnapshot;
  const two = { characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) };
  const twoKey = `${config.bookId}/orders/${orderId}/manifests/2b-manifest.json`;
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, oneManifestKey: one.artifacts.manifestKey, manifest2bKey: twoKey,
    dedicationText: c.input, bookSpecs: { dedicationMessage: '' }, orderDetails: { dedicationMessage: '' } }, {
    loadManifest: async key => { observation.manifestReads.push(key); return key === one.artifacts.manifestKey ? structuredClone(one) : key === twoKey ? structuredClone(two) : null; },
    normalizePoseScale: async ({ poseNumber, imageKey }) => {
      normalizationCount++;
      return { success: true, normalized: false, imageKey, refKey: '', poseNumber, bookId: config.bookId, scaleFactor: 1,
        verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0, sourceAnchorMetrics: null, referenceAnchorMetrics: null,
        sourceBBoxFound: true, referenceBBoxFound: true, message: 'Synthetic no-byte normalization boundary' };
    },
  });
  observation.stage = 'assembly'; observation.assemblyDedication = assembly.dedicationText;
  assert.deepEqual(observation.manifestReads, [twoKey, one.artifacts.manifestKey]); checks++;
  const prepared = prepareW3AssemblyRun({ ...assembly, runStamp: 'synthetic-b0-copy' });
  observation.assemblyStartedAt = prepared.assemblyStartedAt;
  const plan = buildW3PreviewPlan(prepared);
  observation.stage = 'plan'; observation.plan = plan;
  assert.ok(Array.isArray(plan.pagePreviewItems)); checks++;
  assert.equal(plan.pagePreviewItems.length, 3, 'Fixture must retain all configured pages'); checks++;
  assert.equal(plan.pagePreviewItems[0].pageLabel, 'p00'); checks++;
  assert.equal(typeof plan.coverPreviewItem?.coverHTML, 'string'); checks++;
  assert.ok(plan.coverPreviewItem.coverHTML.length > 0); checks++;
  observation.pageHtml = plan.pagePreviewItems[0].pageHtml; observation.coverHtml = plan.coverPreviewItem.coverHTML;
  observation.publicExpected = mode === 'legacy-lines' ? c.publicLegacy : c.input.trim();
  observation.pageContent = content(observation.pageHtml, title.id);
  observation.coverContent = content(observation.coverHtml, 'b0-cover');
  observation.stackContent = content(observation.coverHtml, 'b0-stack-copy');
  assertContent(observation.pageHtml, title.id, observation.publicExpected);
  assertContent(observation.coverHtml, 'b0-cover', observation.publicExpected);
  assertContent(observation.coverHtml, 'b0-stack-copy', observation.publicExpected);
  assert.equal(JSON.stringify(raw), before, 'Input config immutable'); checks++;
  for (const [kind, item] of [['page-preview', plan.pagePreviewItems[0]], ['cover-preview', plan.coverPreviewItem]] as const) {
    await renderW3PreviewDocument({ ...item, documentKind: kind }, { pdfMonkeyApiKey: 'synthetic-b0-copy-key',
      fetchImpl: async (url, init) => {
        const actual: Record<string, any> = { url: String(url), method: init?.method, rawBody: String(init?.body) };
        observation.requests.push(actual); requestCount++;
        const body = JSON.parse(actual.rawBody); actual.body = body;
        assert.equal(actual.url, 'https://api.pdfmonkey.io/api/v1/documents'); checks++;
        assert.equal(actual.method, 'POST'); checks++;
        assert.equal(body.document.payload.pages_html, kind === 'page-preview' ? observation.pageHtml.trim() : observation.coverHtml.trim()); checks++;
        return Response.json({ document: { id: `synthetic-b0-${requestCount}`, status: 'success', download_url: 'https://b0.example.test/local.png' } });
      }, sleep: async () => { throw new Error('Unexpected polling'); }, recordWorkflowEvent: async () => { throw new Error('Unexpected event write'); } });
  }
  observation.stage = 'complete';
}

async function main() {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { externalAttempts++; throw new Error('Unexpected global fetch'); };
  try {
    matcherControls();
    const modes = expectation === 'old' ? ['omitted'] : ['omitted', 'plain', 'legacy-lines'];
    for (const c of textFormatCases) {
      for (const mode of modes) {
        const copy = withMode(structuredClone(baseCopy), mode);
        const original = JSON.stringify(copy);
        const observation: Record<string, any> = { kind: 'serializer', id: c.id, mode, input: c.input, copyInput: structuredClone(copy), stage: 'start', expectedLegacy: c.legacy };
        records.push(observation);
        const parsed = BookV3CopyBlockSchema.parse(copy); observation.stage = 'schema';
        const html = renderBookV3Copy(parsed, () => c.input, { w: 2625, h: 2625 }); observation.html = html; observation.stage = 'copy';
        const stackHtml = renderBookV3Stacks([{ id: 'root', placement: { left: 0, top: 0, width: 2000 }, children: [
          withMode({ kind: 'text', id: 'nested', text: '[dedication message]', fontSize: 50, lineHeight: 1.3, color: '#123456', align: 'left', padding: 0 }, mode) as any,
        ] }], () => c.input, { w: 2625, h: 2625 });
        const expected = mode === 'legacy-lines' ? c.legacy : c.input;
        observation.stackHtml = stackHtml; observation.expected = expected; observation.stage = 'rendered';
        observation.actualContent = content(html, 'b0-copy');
        observation.actualDiffersFromLegacy = observation.actualContent !== escape(c.legacy);
        assertContent(html, 'b0-copy', expected); assertContent(stackHtml, 'nested', expected);
        if (mode === 'omitted') { assert.equal(Object.hasOwn(parsed, 'textFormat'), false); checks++; }
        assert.equal(JSON.stringify(copy), original); checks++;
        for (const formatId of ['standard', 'amazon']) await pipeline(c, mode, formatId);
      }
    }
    const invalid = expectation === 'old' ? ['legacy-lines'] : ['unknown', 'PLAIN', 1, null, {}, []];
    for (const value of invalid) {
      for (const shape of ['copy', 'stack']) {
        const raw = rawV3();
        if (shape === 'copy') raw.rendering.recipe.copy.title.textFormat = value;
        else raw.rendering.recipe.covers.standard.stacks[0].children[0].textFormat = value;
        const observation: Record<string, any> = { kind: 'schema-negative', shape, value, stage: 'start' }; records.push(observation);
        const result = BookConfigSchema.safeParse(raw);
        observation.accepted = result.success; observation.issues = result.success ? [] : result.error.issues; observation.stage = 'parsed';
        assert.equal(result.success, false); checks++;
        assert.ok(hasTextFormatIssue(observation.issues, shape === 'copy' ? ['rendering', 'recipe', 'copy', 'title'] : ['rendering', 'recipe', 'covers', 'standard', 'stacks', 0, 'children', 0]), 'Negative must identify intended textFormat path'); checks++;
      }
    }
    for (const mode of ['omitted', 'plain']) {
      if (mode === 'plain' && expectation === 'old') continue;
      const copy = withMode(structuredClone(baseCopy), mode);
      const output = renderBookV3Copy(BookV3CopyBlockSchema.parse(copy), value => value.replace('[dedication message]', 'Hello x'), { w: 2625, h: 2625 });
      records.push({ kind: 'default-byte-control', mode, output });
    }
    assert.equal(externalAttempts, 0); checks++;
  } finally { globalThis.fetch = previous; }
}
main().then(() => { console.log('B0_OBSERVATIONS=' + JSON.stringify({ result: 'PASS', expectation, checks, requestCount, normalizationCount, externalAttempts, records })); })
  .catch(error => { console.log('B0_OBSERVATIONS=' + JSON.stringify({ result: 'FAIL', expectation, checks, requestCount, normalizationCount, externalAttempts, records, error: String(error) })); console.error(error); process.exitCode = 1; });
