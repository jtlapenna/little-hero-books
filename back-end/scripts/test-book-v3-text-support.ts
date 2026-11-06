import assert from 'node:assert/strict';
import { visibilityCases, pipelineCases } from './helpers/book-v3-text-support-cases';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { BookV3CopyBlockSchema, BookRenderRecipeSchema, BookCopyBlockSchema } from '../src/lib/books/book-render-contract';
import { renderBookV3Copy, renderBookV3Stacks } from '../src/lib/books/book-v3-copy';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { prepareW3AssemblyRun } from '../src/lib/workers/w3-assembly-worker';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { renderW3PreviewDocument } from '../src/lib/w3-pdfmonkey-preview';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

const expectation = process.env.TEXT_SUPPORT_EXPECTATION;
const b0 = process.env.B0_EXPECTATION;
const family = process.env.TEXT_SUPPORT_SOURCE_FAMILY;
const records: Array<Record<string, any>> = [];
let checks = 0, externalAttempts = 0, requests = 0, normalizations = 0;
const canvas = { w: 2625, h: 2625 };
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const base: any = { id: 'text-support-copy', text: '[dedication message]', fontSize: 50, lineHeight: 1.3, color: '#123456', align: 'left', padding: 0, placement: { left: 0, top: 0, width: 2000 } };
const node = (options: Record<string, unknown> = {}) => {
  const { placement: _placement, ...copy } = { ...base, ...options };
  return { ...copy, id: 'text-support-nested', kind: 'text' };
};
const stack = (options: Record<string, unknown> = {}): any => ({ id: 'outer', placement: { left: 0, top: 0, width: 2000 }, children: [{ kind: 'stack', id: 'inner', children: [node(options)] }] });
const content = (html: string, id: string): string | undefined => {
  const match = html.match(new RegExp('data-copy-block-id="' + id + '"[^>]*><span[^>]*>([\\s\\S]*?)</span>'));
  return match?.[1];
};
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
function targetIssue(value: unknown, target: Array<string | number>, leaf: string, inherited: Array<string | number> = []): boolean {
  if (Array.isArray(value)) return value.some(item => targetIssue(item, target, leaf, inherited));
  if (!value || typeof value !== 'object') return false;
  const issue = value as Record<string, any>;
  const own = Array.isArray(issue.path) ? issue.path : [];
  const path = own.length >= inherited.length && inherited.every((part, i) => part === own[i]) ? own : [...inherited, ...own];
  const equal = (expected: Array<string | number>) => path.length === expected.length && expected.every((part, i) => part === path[i]);
  if (equal(target) && issue.code === 'custom' && ((leaf === '@copy-refinement' && issue.message === 'Copy alignment and fit require a valid explicit box; fit requires single-line wrap') || (leaf === '@stack-refinement' && issue.message === 'Flow text alignment and fit require a valid explicit box'))) return true;
  if (equal([...target, leaf]) && ['invalid_value', 'invalid_type', 'too_small', 'too_big', 'invalid_union'].includes(issue.code)) return true;
  if (equal(target) && issue.code === 'unrecognized_keys' && issue.keys?.includes(leaf)) return true;
  return Object.values(issue).some(item => targetIssue(item, target, leaf, path));
}
function configFor(options: Record<string, unknown>, formatId = 'standard'): any {
  const raw = rawV3();
  const copy = { ...raw.rendering.recipe.copy.title, ...options, text: '[dedication message]' };
  raw.rendering.recipe.copy.title = copy;
  raw.rendering.recipe.covers[formatId].texts = [{ ...copy, id: 'text-support-cover' }];
  raw.rendering.recipe.covers[formatId].stacks = [stack(options)];
  return raw;
}
function schemaCase(shape: 'copy' | 'stack', key: string, value: unknown, accepted: boolean, id: string, omit = false) {
  const raw = rawV3();
  const target = shape === 'copy' ? raw.rendering.recipe.copy.title : raw.rendering.recipe.covers.standard.stacks[0].children[0];
  if (omit) delete target[key]; else target[key] = value;
  const path = shape === 'copy' ? ['rendering', 'recipe', 'copy', 'title'] : ['rendering', 'recipe', 'covers', 'standard', 'stacks', 0, 'children', 0];
  const o: Record<string, any> = { kind: 'schema', id, shape, key, value, valueDescriptor: typeof value === 'number' && !Number.isFinite(value) ? String(value) : undefined, omit, targetInput: structuredClone(target), stage: 'start' }; records.push(o);
  const parsed = BookConfigSchema.safeParse(raw);
  o.accepted = parsed.success; o.issues = parsed.success ? [] : parsed.error.issues; o.stage = 'parsed';
  assert.equal(parsed.success, accepted, `${id}: expected acceptance ${accepted}`); checks++;
  if (!parsed.success) { check(targetIssue(o.issues, path, key), `${id}: rejection must identify ${key} at exact path`); }
  if (parsed.success && key === 'lineHeight' && typeof value === 'number' && Number.isFinite(value)) {
    const recipe: any = parsed.data.rendering.recipe;
    const result = shape === 'copy' ? recipe.copy.title : recipe.covers.standard.stacks[0].children[0];
    o.parsedLineHeight = result.lineHeight;
    o.numericHtml = shape === 'copy' ? renderBookV3Copy(result, () => 'x', canvas) : renderBookV3Stacks([{ id: 'numeric-root', placement: { left: 0, top: 0, width: 2000 }, children: [result] }], () => 'x', canvas);
    assert.equal(o.parsedLineHeight, value, 'Numeric line height preserved'); checks++;
    check(o.numericHtml.includes(`line-height:${value};`), 'Numeric serializer emits exact CSS');
  }
  if (parsed.success && omit && key === 'omitIfEmpty') {
    const recipe: any = parsed.data.rendering.recipe;
    const result = shape === 'copy' ? recipe.copy.title : recipe.covers.standard.stacks[0].children[0];
    check(!Object.hasOwn(result, key), 'Missing visibility must remain absent, without default');
  }
}
function schemaControls() {
  for (const shape of ['copy', 'stack'] as const) {
    for (const value of [.5, 1.3, 4]) schemaCase(shape, 'lineHeight', value, true, `number-${value}`);
    for (const value of [.499, 4.001, NaN, Infinity, -Infinity, null, true, 'NORMAL', ' normal', 'normal ', 'initial', '1.3', {}, []]) schemaCase(shape, 'lineHeight', value, false, `invalid-line-${String(value)}`);
    schemaCase(shape, 'lineHeight', undefined, false, 'missing-line', true);
    schemaCase(shape, 'lineHeight', 'normal', expectation === 'fixed', 'normal');
    schemaCase(shape, 'omitIfEmpty', undefined, true, 'visibility-absent', true);
    for (const value of [true, false]) schemaCase(shape, 'omitIfEmpty', value, expectation === 'fixed', `visibility-${value}`);
    for (const value of [null, 0, 1, 'true', 'preserve', {}, []]) schemaCase(shape, 'omitIfEmpty', value, false, `invalid-visibility-${String(value)}`);
  }
  for (const version of ['v1']) {
    const recipe: any = configuredBookRaw().rendering.recipe;
    recipe.schema = `lhb.book-render@${version}`;
    const target = recipe.copy.title;
    target.lineHeight = 'normal';
    const bad = BookRenderRecipeSchema.safeParse(recipe);
    const o: Record<string, any> = { kind: 'legacy-schema', version, test: 'normal', input: structuredClone(recipe), accepted: bad.success, issues: bad.success ? [] : bad.error.issues }; records.push(o);
    check(!bad.success && targetIssue(o.issues, ['copy', 'title'], 'lineHeight'), `${version} must reject normal at intended field`);
    target.lineHeight = 1.3; target.omitIfEmpty = true;
    const stripped = BookRenderRecipeSchema.safeParse(recipe);
    o.visibilityAccepted = stripped.success; o.visibilityIssues = stripped.success ? [] : stripped.error.issues;
    check(stripped.success, `${version} legacy baseline should parse`);
    if (stripped.success) { const copy: any = stripped.data.copy.title; o.parsedCopy = copy; check(!Object.hasOwn(copy, 'omitIfEmpty'), `${version} strips the unsupported option`); }
  }
  const v2: any = configuredBookRaw().rendering.recipe;
  v2.schema = 'lhb.book-render@v2';
  const v2Record: Record<string, any> = { kind: 'family-v2', family, stage: 'start', baselineInput: structuredClone(v2) }; records.push(v2Record);
  const baseline = BookRenderRecipeSchema.safeParse(v2);
  v2Record.baselineAccepted = baseline.success; v2Record.baselineIssues = baseline.success ? [] : baseline.error.issues;
  if (family === 'clean') {
    check(!baseline.success && targetIssue(v2Record.baselineIssues, [], 'schema'), 'Clean source must explicitly reject unsupported v2 discriminator');
  } else {
    check(baseline.success, 'Composed v2 baseline must parse');
    v2.copy.title = { id: 'flow-title', text: 'Title', placement: { left: 0, top: 0, width: 1000, height: 200 }, fontSize: 50,
      lineHeight: 1.3, color: '#123456', align: 'left', padding: 0, flow: { paragraphs: [{ runs: [{ text: 'Title' }] }] } };
    const flowBaseline = BookRenderRecipeSchema.safeParse(v2);
    v2Record.flowBaselineInput = structuredClone(v2); v2Record.flowBaselineAccepted = flowBaseline.success;
    v2Record.flowBaselineIssues = flowBaseline.success ? [] : flowBaseline.error.issues;
    check(flowBaseline.success, 'Composed v2 flow baseline must parse');
    v2.copy.title.lineHeight = 'normal';
    v2Record.normalInput = structuredClone(v2);
    const normal = BookRenderRecipeSchema.safeParse(v2);
    v2Record.normalAccepted = normal.success; v2Record.normalIssues = normal.success ? [] : normal.error.issues;
    check(!normal.success && targetIssue(v2Record.normalIssues, ['copy', 'title'], 'lineHeight'), 'Composed v2 flow rejects normal at field');
    v2.copy.title.lineHeight = 1.3; v2.copy.title.omitIfEmpty = true;
    v2Record.flowVisibilityInput = structuredClone(v2);
    const visibility = BookRenderRecipeSchema.safeParse(v2);
    v2Record.flowVisibilityAccepted = visibility.success; v2Record.flowVisibilityIssues = visibility.success ? [] : visibility.error.issues;
    check(!visibility.success && targetIssue(v2Record.flowVisibilityIssues, ['copy', 'title'], 'omitIfEmpty'), 'Composed v2 strict flow rejects visibility field');
    v2.copy.title = { ...configuredBookRaw().rendering.recipe.copy.title, omitIfEmpty: true };
    v2Record.plainVisibilityInput = structuredClone(v2);
    const plain = BookRenderRecipeSchema.safeParse(v2);
    v2Record.plainVisibilityAccepted = plain.success; v2Record.plainVisibilityParsed = plain.success ? plain.data.copy.title : null;
    check(plain.success && !Object.hasOwn(plain.data.copy.title, 'omitIfEmpty'), 'Composed v2 plain legacy strips visibility');
  }
  v2Record.stage = 'complete';
  const legacyBase = configuredBookRaw().rendering.recipe.copy.title;
  const directNormal = BookCopyBlockSchema.safeParse({ ...legacyBase, lineHeight: 'normal' });
  const directVisible = BookCopyBlockSchema.safeParse({ ...legacyBase, omitIfEmpty: true });
  const o: Record<string, any> = { kind: 'shared-legacy-copy-schema', normalAccepted: directNormal.success,
    normalIssues: directNormal.success ? [] : directNormal.error.issues, visibilityAccepted: directVisible.success,
    parsed: directVisible.success ? directVisible.data : null }; records.push(o);
  check(!directNormal.success && targetIssue(o.normalIssues, [], 'lineHeight'), 'Shared legacy copy schema rejects normal');
  check(directVisible.success && !Object.hasOwn(directVisible.data, 'omitIfEmpty'), 'Shared legacy copy schema strips visibility');
}
function directControls() {
  for (const c of visibilityCases) {
    for (const visibility of expectation === 'fixed' ? ['omitted', 'false', 'true'] : ['omitted']) {
      const options: any = { textFormat: c.format };
      if (visibility !== 'omitted') options.omitIfEmpty = visibility === 'true';
      const copyInput = { ...base, ...options };
      const o: Record<string, any> = { kind: 'direct', id: c.id, visibility, input: c.input, copyInput: structuredClone(copyInput), stage: 'start', interpolation: [] }; records.push(o);
      const copy = BookV3CopyBlockSchema.parse(copyInput);
      const interpolate = (template: string) => { o.interpolation.push(template); return c.input; };
      o.html = renderBookV3Copy(copy, interpolate, canvas); o.stage = 'copy-rendered';
      o.stackHtml = renderBookV3Stacks([stack(options)], interpolate, canvas); o.stage = 'stack-rendered';
      o.copyContent = content(o.html, base.id); o.nestedContent = content(o.stackHtml, 'text-support-nested');
      o.expectedOmitted = visibility === 'true' && c.omit;
      o.expectedContent = o.expectedOmitted ? undefined : escape(c.formatted);
      o.desiredExplicitOmitContent = c.omit ? undefined : escape(c.formatted);
      o.oldDefaultDiffersFromDesiredOmit = expectation === 'old' && c.omit && o.copyContent !== undefined;
      assert.deepEqual(o.interpolation, [base.text, base.text]); checks++;
      assert.equal(o.copyContent, o.expectedContent); checks++;
      if (o.expectedOmitted) {
        assert.equal(o.html, '', 'Omitted direct text must remove the entire wrapper'); checks++;
        check(!o.stackHtml.includes('data-copy-block-id="text-support-nested"'), 'Omitted stack node has no wrapper');
      } else {
        check(o.html.includes('data-copy-block-id="text-support-copy"') && o.stackHtml.includes('data-copy-block-id="text-support-nested"'), 'Retained text preserves direct and stack wrappers');
      }
      assert.equal(o.nestedContent, o.expectedContent); checks++;
      check(o.stackHtml.includes('data-lhb-v3-stack="outer"') && o.stackHtml.includes('data-lhb-v3-stack="inner"'), 'Empty text must not remove enclosing stacks');
      if (visibility === 'false') {
        const omitted = records.find(r => r.kind === 'direct' && r.id === c.id && r.visibility === 'omitted');
        assert.equal(o.html, omitted?.html, 'false matches omitted full copy bytes'); checks++;
        assert.equal(o.stackHtml, omitted?.stackHtml, 'false matches omitted full stack bytes'); checks++;
      }
      o.stage = 'complete';
    }
  }
  if (expectation === 'fixed') {
    const o: Record<string, any> = { kind: 'normal-serializer', stage: 'start' }; records.push(o);
    o.html = renderBookV3Copy(BookV3CopyBlockSchema.parse({ ...base, lineHeight: 'normal' }), () => 'example', canvas);
    o.stackHtml = renderBookV3Stacks([stack({ lineHeight: 'normal' })], () => 'example', canvas);
    check(o.html.includes('line-height:normal;') && o.stackHtml.includes('line-height:normal;'), 'Both actual serializers must emit normal'); o.stage = 'complete';
  }
}
async function pipeline(c: typeof pipelineCases[number], formatId: string, visibility: 'omitted' | 'false' | 'true' | 'normal') {
  const options: Record<string, unknown> = { textFormat: c.format };
  if (visibility === 'false' || visibility === 'true') options.omitIfEmpty = visibility === 'true';
  if (visibility === 'normal') options.lineHeight = 'normal';
  const raw = configFor(options, formatId);
  const o: Record<string, any> = { kind: 'pipeline', id: c.id, formatId, visibility, input: c, configInput: structuredClone(raw), stage: 'start', requests: [], manifestReads: [] }; records.push(o);
  const before = JSON.stringify(raw);
  const config = BookConfigSchema.parse(raw); o.stage = 'config';
  const orderId = `TEXT-SUPPORT-${formatId}-${c.id}`, characterHash = 'synthetic-text-child';
  const one = buildW0RunManifestFromConfig(config, { orderId, formatId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', characterHash,
    createdAt: '2026-10-31T00:00:00.000Z', runId: 'synthetic-text-support', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl', pronouns: 'they/them' }, dedicationText: c.manifest } });
  o.snapshot = one.book.resolved.renderSnapshot; o.stage = 'w0';
  if (visibility === 'omitted') {
    const snapshotRecipe: any = o.snapshot.bookConfig.rendering.recipe;
    const snapshotNodes = [snapshotRecipe.copy.title, snapshotRecipe.covers[formatId].texts[0], snapshotRecipe.covers[formatId].stacks[0].children[0].children[0]];
    o.snapshotVisibilityPresent = snapshotNodes.map(item => Object.hasOwn(item, 'omitIfEmpty'));
    assert.deepEqual(o.snapshotVisibilityPresent, [false, false, false], 'W0 snapshot preserves omitted optional field'); checks++;
  } else {
    const recipe: any = o.snapshot.bookConfig.rendering.recipe;
    const nodes = [recipe.copy.title, recipe.covers[formatId].texts[0], recipe.covers[formatId].stacks[0].children[0].children[0]];
    if (visibility === 'normal') {
      o.snapshotLineHeights = nodes.map(item => item.lineHeight);
      assert.deepEqual(o.snapshotLineHeights, ['normal', 'normal', 'normal']); checks++;
    } else {
      o.snapshotVisibility = nodes.map(item => item.omitIfEmpty);
      assert.deepEqual(o.snapshotVisibility, [visibility === 'true', visibility === 'true', visibility === 'true']); checks++;
    }
  }
  const two = { characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) };
  const twoKey = `${config.bookId}/orders/${orderId}/manifests/2b-manifest.json`;
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, oneManifestKey: one.artifacts.manifestKey, manifest2bKey: twoKey,
    dedicationText: c.primary, bookSpecs: { dedicationMessage: '' }, orderDetails: { dedicationMessage: '' } }, {
    loadManifest: async key => { o.manifestReads.push(key); return key === one.artifacts.manifestKey ? structuredClone(one) : key === twoKey ? structuredClone(two) : null; },
    normalizePoseScale: async ({ poseNumber, imageKey }) => {
      normalizations++;
      return { success: true, normalized: false, imageKey, refKey: '', poseNumber, bookId: config.bookId, scaleFactor: 1,
        verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0, sourceAnchorMetrics: null, referenceAnchorMetrics: null,
        sourceBBoxFound: true, referenceBBoxFound: true, message: 'Synthetic no-byte normalization boundary' };
    },
  });
  o.assembly = assembly; o.stage = 'assembly';
  assert.deepEqual(o.manifestReads, [twoKey, one.artifacts.manifestKey]); checks++;
  assert.equal(assembly.dedicationText, c.assemblyText || null, 'Public path trims and selects manifest fallback'); checks++;
  const prepared = prepareW3AssemblyRun({ ...assembly, runStamp: 'synthetic-text-support' });
  o.assemblyStartedAt = prepared.assemblyStartedAt; o.stage = 'prepared';
  const plan = buildW3PreviewPlan(prepared); o.plan = plan; o.stage = 'plan';
  check(Array.isArray(plan.pagePreviewItems) && plan.pagePreviewItems.length === 3, 'All fixture pages retained');
  check(plan.pagePreviewItems[0].pageLabel === 'p00', 'Title page retained');
  o.pageHtml = plan.pagePreviewItems[0].pageHtml; o.coverHtml = plan.coverPreviewItem?.coverHTML;
  check(typeof o.pageHtml === 'string' && typeof o.coverHtml === 'string', 'Real producer must expose page and cover');
  const expected = visibility === 'true' && !c.formatted ? undefined : escape(c.formatted);
  o.expectedOmitted = expected === undefined;
  o.pageContent = content(o.pageHtml, raw.rendering.recipe.copy.title.id);
  o.coverContent = content(o.coverHtml, 'text-support-cover'); o.nestedContent = content(o.coverHtml, 'text-support-nested'); o.expectedContent = expected;
  const marker = (id: string) => `data-copy-block-id="${id}"`;
  const pageMarker = marker(raw.rendering.recipe.copy.title.id), coverMarker = marker('text-support-cover'), nestedMarker = marker('text-support-nested');
  o.wrapperPresent = [o.pageHtml.includes(pageMarker), o.coverHtml.includes(coverMarker), o.coverHtml.includes(nestedMarker)];
  assert.deepEqual(o.wrapperPresent, [!o.expectedOmitted, !o.expectedOmitted, !o.expectedOmitted], 'Producer wrapper presence matches actual omission'); checks++;
  assert.equal(o.pageContent, expected); checks++;
  assert.equal(o.coverContent, expected); checks++;
  assert.equal(o.nestedContent, expected); checks++;
  check(o.coverHtml.includes('data-lhb-v3-stack="outer"') && o.coverHtml.includes('data-lhb-v3-stack="inner"'), 'Producer retains empty stacks');
  assert.equal(JSON.stringify(raw), before, 'Input config remains unchanged'); checks++;
  for (const [kind, item] of [['page-preview', plan.pagePreviewItems[0]], ['cover-preview', plan.coverPreviewItem]] as const) {
    await renderW3PreviewDocument({ ...item, documentKind: kind }, { pdfMonkeyApiKey: 'synthetic-text-support-key',
      fetchImpl: async (url, init) => {
        const request: Record<string, any> = { kind, url: String(url), method: init?.method, rawBody: String(init?.body) };
        o.requests.push(request); requests++;
        request.body = JSON.parse(request.rawBody);
        assert.equal(request.url, 'https://api.pdfmonkey.io/api/v1/documents'); checks++;
        assert.equal(request.method, 'POST'); checks++;
        assert.equal(request.body.document.payload.pages_html, (kind === 'page-preview' ? o.pageHtml : o.coverHtml).trim()); checks++;
        return Response.json({ document: { id: `synthetic-text-${kind}`, status: 'success', download_url: 'https://synthetic.example.test/local.png' } });
      }, sleep: async () => { throw new Error('Unexpected polling'); }, recordWorkflowEvent: async () => { throw new Error('Unexpected event write'); } });
  }
  if (visibility === 'false') {
    const omitted = records.find(r => r.kind === 'pipeline' && r.id === c.id && r.formatId === formatId && r.visibility === 'omitted');
    assert.equal(o.pageHtml, omitted?.pageHtml, 'false matches omitted full page HTML'); checks++;
    assert.equal(o.coverHtml, omitted?.coverHtml, 'false matches omitted full cover HTML'); checks++;
    assert.deepEqual(o.requests.map((r: any) => r.rawBody), omitted?.requests.map((r: any) => r.rawBody), 'false matches omitted full request bodies'); checks++;
  }
  if (visibility === 'normal') check(o.pageHtml.includes('line-height:normal;') && (o.coverHtml.match(/line-height:normal;/g) ?? []).length >= 2, 'W3 page, cover and stack emit normal');
  o.stage = 'complete';
}
function resilienceControls() {
  const options = expectation === 'fixed' ? { omitIfEmpty: true } : {};
  const parsed = BookV3CopyBlockSchema.parse({ ...base, ...options });
  for (const shape of ['copy', 'stack'] as const) {
    const o: Record<string, any> = { kind: 'interpolation-error', shape, calls: 0, stage: 'start' }; records.push(o);
    const fail = () => { o.calls++; throw new Error('interpolation-sentinel'); };
    try { o.output = shape === 'copy' ? renderBookV3Copy(parsed, fail, canvas) : renderBookV3Stacks([stack(options)], fail, canvas); o.outcome = 'returned'; }
    catch (error) { o.outcome = 'threw'; o.error = String(error); }
    o.stage = 'observed';
    assert.equal(o.outcome, 'threw'); assert.equal(o.error, 'Error: interpolation-sentinel'); assert.equal(o.calls, 1); checks += 3;
  }
  if (expectation === 'fixed') {
    for (const shape of ['copy', 'stack'] as const) {
      const o: Record<string, any> = { kind: 'invalid-canvas-order', shape, calls: 0, stage: 'start' }; records.push(o);
      const callback = () => { o.calls++; return ''; };
      try { o.output = shape === 'copy' ? renderBookV3Copy(parsed, callback, { w: 0, h: 2625 }) : renderBookV3Stacks([stack(options)], callback, { w: 0, h: 2625 }); o.outcome = 'returned'; }
      catch (error) { o.outcome = 'threw'; o.error = String(error); }
      o.stage = 'observed';
      assert.equal(o.outcome, 'threw'); assert.equal(o.error, 'Error: Book placement requires a finite positive canvas'); assert.equal(o.calls, 0); checks += 3;
    }
    const o: Record<string, any> = { kind: 'sibling-preservation', stage: 'start' }; records.push(o);
    const s = stack({ omitIfEmpty: true });
    s.children[0].children.push({ ...node({ text: 'sibling' }), id: 'sibling' });
    o.stackHtml = renderBookV3Stacks([s], value => value === 'sibling' ? value : '', canvas); o.stage = 'rendered';
    check(o.stackHtml.includes('data-lhb-v3-stack="outer"') && o.stackHtml.includes('data-lhb-v3-stack="inner"') && content(o.stackHtml, 'sibling') === 'sibling' && !o.stackHtml.includes('data-copy-block-id="text-support-nested"'), 'Omission must preserve ancestors and sibling, remove empty child');
    const bad: any = { ...base, text: '', omitIfEmpty: true, placement: { left: 0, top: 0, width: -1 } };
    const result = BookV3CopyBlockSchema.safeParse(bad); o.invalidGeometry = result.success ? [] : result.error.issues; o.geometryAccepted = result.success;
    check(!result.success && targetIssue(o.invalidGeometry, ['placement'], 'width'), 'Omission must not accept invalid geometry');
    for (const shape of ['copy', 'stack'] as const) for (const item of [
      { id: 'fit-without-height', fields: { fit: { minFontSize: 20, maxFontSize: 50 }, typography: { wrap: 'single-line' } } },
      { id: 'center-without-height', fields: { typography: { verticalAlign: 'center' } } },
      { id: 'fit-without-single-line', fields: { fit: { minFontSize: 20, maxFontSize: 50 }, typography: { wrap: 'pre-line' } } },
    ]) {
      const raw = rawV3();
      const target = shape === 'copy' ? raw.rendering.recipe.copy.title : raw.rendering.recipe.covers.standard.stacks[0].children[0];
      Object.assign(target, { text: '', omitIfEmpty: true, ...item.fields });
      if (shape === 'copy' && item.id === 'fit-without-single-line') target.placement.height = 200;
      if (shape === 'stack' && item.id === 'fit-without-single-line') target.boxHeight = 200;
      const path = shape === 'copy' ? ['rendering', 'recipe', 'copy', 'title'] : ['rendering', 'recipe', 'covers', 'standard', 'stacks', 0, 'children', 0];
      const x: Record<string, any> = { kind: 'refinement', shape, id: item.id, targetInput: structuredClone(target), stage: 'start' }; records.push(x);
      const outcome = BookConfigSchema.safeParse(raw); x.accepted = outcome.success; x.issues = outcome.success ? [] : outcome.error.issues; x.stage = 'parsed';
      check(!outcome.success && targetIssue(x.issues, path, shape === 'copy' ? '@copy-refinement' : '@stack-refinement'), 'Empty omitted text must not bypass exact copy refinement');
    }
    o.stage = 'complete';
  }
}

async function main() {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { externalAttempts++; throw new Error('Unexpected global fetch'); };
  try {
    assert.ok(expectation === 'old' || expectation === 'fixed', 'TEXT_SUPPORT_EXPECTATION must be old or fixed'); checks++;
    assert.equal(b0, 'fixed', 'Both variants require post-B0 formatter'); checks++;
    assert.ok(family === 'clean' || family === 'composed', 'TEXT_SUPPORT_SOURCE_FAMILY must be clean or composed'); checks++;
    schemaControls(); directControls(); resilienceControls();
    for (const c of pipelineCases) for (const formatId of ['standard', 'amazon']) {
      for (const visibility of expectation === 'fixed' ? ['omitted', 'false', 'true', 'normal'] as const : ['omitted'] as const) await pipeline(c, formatId, visibility);
    }
    assert.equal(externalAttempts, 0); checks++;
  } finally { globalThis.fetch = previous; }
}
main().then(() => { console.log('TEXT_SUPPORT_OBSERVATIONS=' + JSON.stringify({ result: 'PASS', expectation, b0, family, checks, requests, normalizations, externalAttempts, records })); })
  .catch(error => { console.log('TEXT_SUPPORT_OBSERVATIONS=' + JSON.stringify({ result: 'FAIL', expectation, b0, family, checks, requests, normalizations, externalAttempts, records, error: String(error) })); console.error(error); process.exitCode = 1; });
