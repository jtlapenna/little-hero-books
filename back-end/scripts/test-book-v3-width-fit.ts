import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { toJSONSchema } from 'zod';
import { widthTextCases, widthSchemaCases, fixedFitErrorCases, widthVmCases } from './helpers/book-v3-width-fit-cases';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { BookV3FitSchema, BookV3CopyBlockSchema, BookRenderRecipeSchema } from '../src/lib/books/book-render-contract';
import { renderBookV3Copy, renderBookV3Stacks, BOOK_V3_FIT_SCRIPT } from '../src/lib/books/book-v3-copy';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { prepareW3AssemblyRun } from '../src/lib/workers/w3-assembly-worker';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { renderW3PreviewDocument } from '../src/lib/w3-pdfmonkey-preview';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

const expectation = process.env.WIDTH_FIT_EXPECTATION;
const family = process.env.WIDTH_FIT_SOURCE_FAMILY;
const b0 = process.env.B0_EXPECTATION, textSupport = process.env.TEXT_SUPPORT_EXPECTATION;
const records: Array<Record<string, any>> = [];
let checks = 0, requests = 0, normalizations = 0, externalAttempts = 0;
const canvas = { w: 2625, h: 2625 };
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const progress = (o: Record<string, any>, stage: string) => { o.stage = stage; console.log('WIDTH_FIT_PROGRESS=' + JSON.stringify({ recordIndex: records.indexOf(o), record: o })); };
const base: any = { id: 'width-copy', text: '[dedication message]', fontSize: 120, lineHeight: 'normal', color: '#123456', align: 'left', padding: 0, placement: { left: 0, top: 0, width: 2000 } };
type Mode = 'default' | 'finite' | 'width-computed' | 'width-explicit';
type Routing = 'all' | 'later-only' | 'cover-only' | 'mixed';
const widthMode = (mode: Mode) => mode.startsWith('width-');
function options(mode: Mode): any {
  if (mode === 'default') return {};
  return { typography: { wrap: 'single-line' }, fit: mode === 'finite' ? { minFontSize: 24, maxFontSize: 120, softMinFontSize: 60 } : mode === 'width-explicit' ? { mode: 'width-only', maxFontSize: 120, softMinFontSize: 60 } : { mode: 'width-only', softMinFontSize: 60 } };
}
function copyFor(mode: Mode, textFormat = 'plain'): any {
  const copy = { ...structuredClone(base), textFormat, ...options(mode) };
  if (mode === 'finite') copy.placement.height = 200;
  return copy;
}
function stackFor(mode: Mode, textFormat = 'plain'): any {
  const { placement: _, ...text } = copyFor(mode, textFormat);
  return { id: 'width-root', placement: { left: 0, top: 0, width: 2000 }, children: [{ id: 'width-inner', kind: 'stack', children: [{ ...text, id: 'width-nested', kind: 'text', ...(mode === 'finite' ? { boxHeight: 200 } : {}) }] }] };
}
function scripts(html: string): string[] { return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]); }
function textContent(html: string, id: string): string | undefined { return html.match(new RegExp('data-copy-block-id="' + id + '"[^>]*><span[^>]*>([\\s\\S]*?)</span>'))?.[1]; }
function configFor(mode: Mode, formatId: string, textFormat: string, routing: Routing = 'all'): any {
  const raw = rawV3();
  const interior = routing === 'cover-only' || routing === 'later-only' ? 'default' : mode;
  raw.rendering.recipe.copy.title = { ...copyFor(interior, textFormat), id: 'title' };
  if (routing === 'later-only' || routing === 'mixed') raw.rendering.recipe.copy['scene-b'] = { ...copyFor(mode, textFormat), id: 'later-width' };
  if (routing === 'mixed') raw.rendering.recipe.copy.title = { ...copyFor('finite', textFormat), id: 'title' };
  const coverMode = routing === 'later-only' ? 'default' : mode;
  raw.rendering.recipe.covers[formatId].texts = [{ ...copyFor(coverMode, textFormat), id: 'width-cover' }];
  raw.rendering.recipe.covers[formatId].stacks = [stackFor(coverMode, textFormat)];
  return raw;
}
function schemaTarget(shape: 'copy' | 'stack', fields: any): { raw: any; target: any } {
  const raw = configFor('default', 'standard', 'plain');
  const target = shape === 'copy' ? raw.rendering.recipe.copy.title : raw.rendering.recipe.covers.standard.stacks[0].children[0].children[0];
  Object.assign(target, fields); return { raw, target };
}
function issueMatches(value: any, target: Array<string | number>, match: (issue: any) => boolean, inherited: Array<string | number> = []): boolean {
  if (Array.isArray(value)) return value.some(item => issueMatches(item, target, match, inherited));
  if (!value || typeof value !== 'object') return false;
  const own = Array.isArray(value.path) ? value.path : [];
  const path = own.length >= inherited.length && inherited.every((part, i) => own[i] === part) ? own : [...inherited, ...own];
  if (path.length === target.length && target.every((part, i) => path[i] === part) && match(value)) return true;
  return Object.values(value).some(item => issueMatches(item, target, match, path));
}
function issueAt(value: any, target: Array<string | number>, message: string): boolean {
  return issueMatches(value, target, issue => issue.code === 'custom' && issue.message === message);
}
const fitPath = (shape: 'copy' | 'stack'): Array<string | number> => shape === 'copy' ? ['rendering', 'recipe', 'copy', 'title', 'fit'] : ['rendering', 'recipe', 'covers', 'standard', 'stacks', 0, 'children', 0, 'children', 0, 'fit'];
function assertWidthRejection(issues: any[], shape: 'copy' | 'stack', c: typeof widthSchemaCases[number]) {
  const target = fitPath(shape), oldShape = expectation === 'old' || c.id === 'wrong-mode';
  if (oldShape || c.id === 'forbidden-min' || c.id === 'extra-key') {
    const allowed = oldShape ? ['minFontSize', 'maxFontSize', 'softMinFontSize'] : ['mode', 'maxFontSize', 'softMinFontSize'];
    const unknown = Object.keys(c.fit).filter(key => !allowed.includes(key)).sort();
    check(unknown.length > 0 && issueMatches(issues, target, issue => issue.code === 'unrecognized_keys' && Array.isArray(issue.keys) && JSON.stringify([...issue.keys].sort()) === JSON.stringify(unknown)), 'Reject exact unknown fit keys at intended copy/stack path');
  }
  const numeric: Record<string, [string, string]> = { 'max-zero': ['maxFontSize', 'too_small'], 'max-negative': ['maxFontSize', 'too_small'], 'max-too-large': ['maxFontSize', 'too_big'], 'max-null': ['maxFontSize', 'invalid_type'], 'max-string': ['maxFontSize', 'invalid_type'], 'soft-zero': ['softMinFontSize', 'too_small'], 'soft-too-large': ['softMinFontSize', 'too_big'], 'soft-null': ['softMinFontSize', 'invalid_type'] };
  if (numeric[c.id]) { const [key, code] = numeric[c.id]; check(issueMatches(issues, [...target, key], issue => issue.code === code), 'Reject exact numeric fit key and code at intended copy/stack path'); }
}
async function schemaControls() {
  for (const shape of ['copy', 'stack'] as const) {
    for (const c of widthSchemaCases) {
      const { raw } = schemaTarget(shape, { fit: c.fit, typography: { wrap: 'single-line' } });
      const o: Record<string, any> = { kind: 'width-schema', id: c.id, shape, input: structuredClone(raw), stage: 'start' }; records.push(o);
      const parsed = BookConfigSchema.safeParse(raw); o.accepted = parsed.success; o.issues = parsed.success ? [] : parsed.error.issues;
      if (parsed.success) { const recipe: any = parsed.data.rendering.recipe; o.parsedFit = (shape === 'copy' ? recipe.copy.title : recipe.covers.standard.stacks[0].children[0].children[0]).fit; }
      progress(o, 'parsed'); assert.equal(o.accepted, expectation === 'fixed' && c.accept); checks++;
      if (parsed.success) { assert.deepEqual(o.parsedFit, c.fit); checks++; assert.equal(Object.hasOwn(o.parsedFit, 'maxFontSize'), Object.hasOwn(c.fit, 'maxFontSize')); checks++; check(!Object.hasOwn(o.parsedFit, 'minFontSize'), 'Width alternative adds no min/default'); }
      else assertWidthRejection(o.issues, shape, c);
    }
    for (const [id, fields] of [
      ['height', shape === 'copy' ? { placement: { left: 0, top: 0, width: 2000, height: 200 } } : { boxHeight: 200 }],
      ['wrap-absent', { typography: undefined }], ['wrap-pre-line', { typography: { wrap: 'pre-line' } }], ['wrap-balanced', { typography: { wrap: 'balanced' } }],
      ['align-center', { typography: { wrap: 'single-line', verticalAlign: 'center' } }], ['align-bottom', { typography: { wrap: 'single-line', verticalAlign: 'bottom' } }],
    ] as const) {
      const { raw } = schemaTarget(shape, { fit: { mode: 'width-only' }, typography: { wrap: 'single-line' }, ...fields });
      const o: Record<string, any> = { kind: 'width-geometry-rejection', id, shape, input: structuredClone(raw) }; records.push(o);
      const parsed = BookConfigSchema.safeParse(raw); o.accepted = parsed.success; o.issues = parsed.success ? [] : parsed.error.issues; progress(o, 'parsed'); check(!parsed.success && o.issues.length, 'Width mode rejects unsupported height/wrap/vertical alignment');
      if (expectation === 'fixed') { const target = shape === 'copy' ? ['rendering', 'recipe', 'copy', 'title'] : ['rendering', 'recipe', 'covers', 'standard', 'stacks', 0, 'children', 0, 'children', 0]; check(issueAt(o.issues, target, shape === 'copy' ? 'Copy alignment and fit require a valid explicit box; fit requires single-line wrap' : 'Flow text alignment and fit require a valid explicit box'), 'Actual width geometry rejection must identify exact target and refinement'); }
    }
    for (const field of ['maxFontSize', 'softMinFontSize']) for (const value of [NaN, Infinity, -Infinity]) {
      const { raw } = schemaTarget(shape, { fit: { mode: 'width-only', [field]: value }, typography: { wrap: 'single-line' } });
      const o: Record<string, any> = { kind: 'width-nonfinite', shape, field, valueDescriptor: String(value), input: raw }; records.push(o);
      const parsed = BookConfigSchema.safeParse(raw); o.accepted = parsed.success; o.issues = parsed.success ? [] : parsed.error.issues; progress(o, 'parsed'); check(!parsed.success && issueMatches(o.issues, [...fitPath(shape), field], issue => issue.code === 'invalid_type'), 'Nonfinite rejection identifies exact copy/stack fit field and invalid_type');
    }
    for (const align of [undefined, 'top']) {
      const { raw } = schemaTarget(shape, { fit: { mode: 'width-only' }, typography: { wrap: 'single-line', ...(align ? { verticalAlign: align } : {}) } });
      const o: Record<string, any> = { kind: 'width-top', shape, align: align ?? 'absent', input: raw }; records.push(o); const parsed = BookConfigSchema.safeParse(raw); o.accepted = parsed.success; o.issues = parsed.success ? [] : parsed.error.issues; progress(o, 'parsed'); assert.equal(parsed.success, expectation === 'fixed'); checks++;
    }
  }
  const v2: any = configuredBookRaw().rendering.recipe; v2.schema = 'lhb.book-render@v2';
  const parsed = BookRenderRecipeSchema.safeParse(v2); const o: Record<string, any> = { kind: 'family', family, input: v2, accepted: parsed.success, issues: parsed.success ? [] : parsed.error.issues }; records.push(o); progress(o, 'parsed'); assert.equal(o.accepted, family === 'composed'); checks++;
}
async function oldErrorControls() {
  for (const c of fixedFitErrorCases) for (const scope of ['fit', 'copy', 'nested-copy', 'nested-stack'] as const) {
    let schema: any, input: any;
    if (scope === 'fit') { schema = BookV3FitSchema; input = c.fit; }
    else {
      const copy = copyFor('finite'); copy.fit = c.fit;
      if ('combined' in c && c.combined) { delete copy.placement.height; copy.typography = { wrap: 'pre-line' }; copy.padding = 1100; }
      if (scope === 'copy') { schema = BookV3CopyBlockSchema; input = copy; }
      else {
        const raw = configFor('finite', 'standard', 'plain');
        if (scope === 'nested-copy') raw.rendering.recipe.copy.title = copy;
        else { const { placement: _, ...node } = copy; if (!('combined' in c && c.combined)) node.boxHeight = 200; const target = raw.rendering.recipe.covers.standard.stacks[0].children[0].children[0]; Object.assign(target, node); if ('combined' in c && c.combined) { delete target.boxHeight; target.width = 2000; } }
        schema = BookConfigSchema; input = raw;
      }
    }
    const group: Record<string, any>[] = [];
    for (const method of ['safeParse', 'safeParseAsync', 'parse', 'parseAsync', 'safeDecode', 'safeDecodeAsync', 'decode', 'decodeAsync', 'safeEncode', 'safeEncodeAsync', 'encode', 'encodeAsync'] as const) for (const custom of [false, true]) {
      const o: Record<string, any> = { kind: 'legacy-fit-error', id: c.id, scope, method, custom, input: structuredClone(input), errorMapCalls: [] }; records.push(o); group.push(o);
      const error = (issue: any) => {
        const call: Record<string, any> = { code: issue.code, path: issue.path, input: issue.input, keys: issue.keys, minimum: issue.minimum, maximum: issue.maximum, expected: issue.expected, origin: issue.origin, inclusive: issue.inclusive, ownKeys: Object.keys(issue).sort(), schemaType: issue.inst?._zod?.def?.type };
        o.errorMapCalls.push(call); const message = `width-map:${issue.code}:${JSON.stringify(issue.path ?? [])}`; call.returned = message; return message;
      };
      try {
        const result = await schema[method](input, { reportInput: true, ...(custom ? { error } : {}) });
        if (method.startsWith('safe')) { o.accepted = result.success; o.issues = result.success ? [] : result.error.issues; if (!result.success) { o.errorName = result.error.name; o.errorMessage = result.error.message; o.errorStack = result.error.stack; } else o.data = result.data; }
        else { o.accepted = true; o.data = result; }
      } catch (e: any) { o.accepted = false; o.errorName = e.name; o.errorMessage = e.message; o.errorString = String(e); o.errorStack = e.stack; o.issues = e.issues; }
      o.inputAfter = structuredClone(input);
      o.knownNestedEncodeLimitation = scope.startsWith('nested-') && method.toLowerCase().includes('encode') && o.errorName === 'ZodEncodeError' && o.errorMessage === 'Encountered unidirectional transform during encode: ZodTransform';
      progress(o, 'observed'); assert.deepEqual(o.inputAfter, o.input, 'Schema parse does not mutate source input'); checks++; check(o.accepted === false && (Array.isArray(o.issues) && o.issues.length > 0 || o.knownNestedEncodeLimitation), 'Retain structured legacy issues or exact existing nested preprocess encode error');
      if (custom && c.id === 'missing-min' && !o.knownNestedEncodeLimitation) check(o.errorMapCalls.length > 0, 'Installed per-parse error callback must remain active');
    }
    for (const custom of [false, true]) for (const direction of ['parse', 'decode', 'encode']) {
      const rows = group.filter(r => r.custom === custom && r.method.toLowerCase().includes(direction));
      for (const row of rows.slice(1)) { assert.deepEqual(row.issues, rows[0].issues, 'Same direction sync/async/throw paths preserve complete issue ordering'); checks++; assert.equal(row.errorName, rows[0].errorName); assert.equal(row.errorMessage, rows[0].errorMessage); checks += 2; assert.deepEqual(row.errorMapCalls, rows[0].errorMapCalls, 'Same direction callback order'); checks++; }
    }
  }
}
function directControls() {
  for (const c of widthTextCases) for (const mode of (expectation === 'fixed' ? ['default', 'finite', 'width-computed', 'width-explicit'] : ['default', 'finite']) as Mode[]) {
    const input = copyFor(mode, c.format), stack = stackFor(mode, c.format);
    const o: Record<string, any> = { kind: 'direct', id: c.id, mode, input, stackInput: stack, interpolation: [] }; records.push(o); progress(o, 'start');
    const parsed = BookV3CopyBlockSchema.parse(input); const interpolate = (s: string) => { o.interpolation.push(s); return c.assembled; };
    o.html = renderBookV3Copy(parsed, interpolate, canvas); progress(o, 'copy-rendered');
    o.stackHtml = renderBookV3Stacks([stack], interpolate, canvas); progress(o, 'rendered');
    assert.deepEqual(o.interpolation, [base.text, base.text]); checks++; assert.equal(textContent(o.html, 'width-copy'), escape(c.formatted)); checks++; assert.equal(textContent(o.stackHtml, 'width-nested'), escape(c.formatted)); checks++;
    check(o.html.includes('line-height:normal;') && o.stackHtml.includes('line-height:normal;'), 'Post-text-support normal preserved');
    if (widthMode(mode)) {
      check(o.html.includes('data-lhb-v3-fit-container="single-line"') && o.stackHtml.includes('data-lhb-v3-fit-container="single-line"'), 'Width wrapper marks actual container');
      check(o.html.includes('data-lhb-v3-fit="width-only"') && o.stackHtml.includes('data-lhb-v3-fit="width-only"'), 'Actual inner spans carry width target');
      check(!o.html.includes('data-lhb-v3-min='), 'No serialized min default');
      assert.equal(o.html.includes('data-lhb-v3-max='), mode === 'width-explicit'); checks++;
    } else assert.equal(o.html.includes('data-lhb-v3-fit="width-only"'), false);
    o.stage = 'complete';
  }
  if (expectation === 'fixed') {
    const copy = { ...copyFor('width-computed'), omitIfEmpty: true };
    const o: Record<string, any> = { kind: 'empty-omission', input: copy }; records.push(o); o.html = renderBookV3Copy(BookV3CopyBlockSchema.parse(copy), () => '', canvas);
    const s = stackFor('width-computed'); s.children[0].children[0].omitIfEmpty = true; o.stackHtml = renderBookV3Stacks([s], () => '', canvas); progress(o, 'rendered'); assert.equal(o.html, ''); checks++; check(!o.stackHtml.includes('data-copy-block-id="width-nested"') && o.stackHtml.includes('data-lhb-v3-stack="width-root"'), 'Width fit preserves exact-empty wrapper omission'); o.stage = 'complete';
  }
}
function rawFixedModeControls() {
  for (const value of [undefined, 'garbage', null, 0]) {
    const baseline = copyFor('finite'), baselineStack = stackFor('finite');
    const raw = structuredClone(baseline), stack = structuredClone(baselineStack); raw.fit.mode = value; stack.children[0].children[0].fit.mode = value;
    const o: Record<string, any> = { kind: 'raw-fixed-mode', valueDescriptor: String(value), fitModeOwnPresent: Object.hasOwn(raw.fit, 'mode'), input: raw, stackInput: stack }; records.push(o); progress(o, 'start');
    o.baselineHtml = renderBookV3Copy(baseline, () => 'raw-mode-control', canvas); o.baselineStackHtml = renderBookV3Stacks([baselineStack], () => 'raw-mode-control', canvas);
    o.html = renderBookV3Copy(raw, () => 'raw-mode-control', canvas); o.stackHtml = renderBookV3Stacks([stack], () => 'raw-mode-control', canvas);
    const direct = BookV3CopyBlockSchema.safeParse(raw), config = configFor('finite', 'standard', 'plain'); config.rendering.recipe.covers.standard.stacks[0].children[0].children[0].fit.mode = value; const nested = BookConfigSchema.safeParse(config);
    o.directAccepted = direct.success; o.directIssues = direct.success ? [] : direct.error.issues; o.nestedAccepted = nested.success; o.nestedIssues = nested.success ? [] : nested.error.issues; progress(o, 'observed');
    assert.equal(o.html, o.baselineHtml, 'Only literal width-only opts raw copy into new attrs'); checks++; assert.equal(o.stackHtml, o.baselineStackHtml, 'Only literal width-only opts raw stack into new attrs'); checks++; check(!direct.success && !nested.success, 'Canonical strict fit rejects unknown mode key even when undefined');
  }
}
function alteredDispatchControls() {
  if (expectation !== 'fixed') return;
  const schema: any = BookV3FitSchema, def = schema._zod.def, canonical = def.options;
  check(Array.isArray(canonical) && canonical.length === 2, 'Truthful union metadata exposes canonical options');
  for (const alteration of ['reorder', 'replace', 'extra', 'missing', 'mutate'] as const) {
    const altered = alteration === 'replace' ? [BookV3CopyBlockSchema, canonical[1]] : alteration === 'extra' ? [...canonical, canonical[0]] : alteration === 'missing' ? [canonical[0]] : [...canonical].reverse();
    const o: Record<string, any> = { kind: 'altered-dispatch', alteration, expectedError: 'V3 fit dispatcher options must remain canonical' }; records.push(o);
    try {
      if (alteration === 'mutate') { def.options = altered; o.result = schema.safeParse({ minFontSize: 24, maxFontSize: 120 }); }
      else { const candidate = schema.clone({ ...def, options: altered }); o.result = { schemaType: candidate?._zod?.def?.type }; }
      o.outcome = 'returned';
    } catch (error: any) { o.outcome = 'threw'; o.error = String(error); o.errorName = error.name; o.errorMessage = error.message; }
    finally { def.options = canonical; }
    progress(o, 'observed'); assert.equal(o.outcome, 'threw'); checks++; assert.equal(o.errorMessage, o.expectedError); checks++;
    check(schema.safeParse({ minFontSize: 24, maxFontSize: 120 }).success, 'Canonical dispatcher remains valid after isolated mutation control');
  }
}
function errorOrderControls() {
  for (const mode of (expectation === 'fixed' ? ['default', 'finite', 'width-computed', 'width-explicit'] : ['default', 'finite']) as Mode[]) for (const shape of ['copy', 'stack'] as const) for (const fault of ['canvas', 'interpolation']) {
    const input = copyFor(mode), stack = stackFor(mode), o: Record<string, any> = { kind: 'render-error', mode, shape, fault, input, stackInput: stack, calls: 0 }; records.push(o); progress(o, 'start');
    const parsed = BookV3CopyBlockSchema.parse(input), currentCanvas = fault === 'canvas' ? { w: 0, h: 2625 } : canvas;
    const interpolate = () => { o.calls++; throw new Error('width-interpolation-sentinel'); };
    try { o.output = shape === 'copy' ? renderBookV3Copy(parsed, interpolate, currentCanvas) : renderBookV3Stacks([stack], interpolate, currentCanvas); o.outcome = 'returned'; }
    catch (error: any) { o.outcome = 'threw'; o.error = String(error); o.errorName = error.name; o.errorMessage = error.message; o.issues = error.issues; o.errorStack = error.stack; }
    progress(o, 'observed'); assert.equal(o.outcome, 'threw'); checks++; assert.equal(o.calls, fault === 'canvas' ? 0 : 1); checks++; assert.equal(o.error, fault === 'canvas' ? 'Error: Book placement requires a finite positive canvas' : 'Error: width-interpolation-sentinel'); checks++;
  }
}
async function pipeline(c: typeof widthTextCases[number], formatId: string, mode: Mode, routing: Routing = 'all') {
  const raw = configFor(mode, formatId, c.format, routing); const before = JSON.stringify(raw);
  const o: Record<string, any> = { kind: 'pipeline', id: c.id, formatId, mode, routing, configInput: structuredClone(raw), requests: [], manifestReads: [] }; records.push(o); progress(o, 'start');
  const config = BookConfigSchema.parse(raw); o.parsedConfig = config;
  const orderId = `WIDTH-${formatId}-${c.id}-${routing}`, characterHash = 'synthetic-width-child';
  const one = buildW0RunManifestFromConfig(config, { orderId, formatId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', characterHash, createdAt: '2026-11-01T00:00:00.000Z', runId: 'synthetic-width-fit', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl', pronouns: 'they/them' }, dedicationText: c.fallback } });
  o.snapshot = one.book.resolved.renderSnapshot; progress(o, 'snapshot');
  assert.deepEqual(o.snapshot.bookConfig.rendering.recipe, config.rendering.recipe); checks++;
  const two = { characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) };
  const twoKey = `${config.bookId}/orders/${orderId}/manifests/2b-manifest.json`;
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, oneManifestKey: one.artifacts.manifestKey, manifest2bKey: twoKey, dedicationText: c.primary, bookSpecs: { dedicationMessage: '' }, orderDetails: { dedicationMessage: '' } }, {
    loadManifest: async key => { o.manifestReads.push(key); return key === one.artifacts.manifestKey ? structuredClone(one) : key === twoKey ? structuredClone(two) : null; },
    normalizePoseScale: async ({ poseNumber, imageKey }) => { normalizations++; return { success: true, normalized: false, imageKey, refKey: '', poseNumber, bookId: config.bookId, scaleFactor: 1, verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0, sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true, message: 'Synthetic no-byte width-fit boundary' }; },
  });
  o.assembly = assembly; progress(o, 'assembly'); assert.deepEqual(o.manifestReads, [twoKey, one.artifacts.manifestKey]); checks++; assert.equal(assembly.dedicationText, c.assembled || null); checks++;
  const prepared = prepareW3AssemblyRun({ ...assembly, runStamp: 'synthetic-width-fit' }); o.assemblyStartedAt = prepared.assemblyStartedAt;
  o.plan = buildW3PreviewPlan(prepared); progress(o, 'plan'); check(o.plan.pagePreviewItems?.length === 3 && o.plan.pagePreviewItems.map((i: any) => i.pageLabel).join(',') === 'p00,p01,p02', 'Retain complete actual three-page plan');
  o.pageHtml = o.plan.pagePreviewItems[0].pageHtml; o.coverHtml = o.plan.coverPreviewItem?.coverHTML;
  o.scripts = [...o.plan.pagePreviewItems.map((i: any) => scripts(i.pageHtml)), scripts(o.coverHtml)]; progress(o, 'scripts'); check(o.scripts.every((s: string[]) => s.length === 1), 'Every actual page and cover has exactly one trusted routine');
  const selected = o.scripts[0][0];
  if (widthMode(mode)) { check(selected !== BOOK_V3_FIT_SCRIPT, 'Width recipe selects the static enhanced routine'); check(o.scripts.every((s: string[]) => s[0] === selected), 'Recipe-wide opt-in handles first-page installer and later width target'); }
  else check(o.scripts.every((s: string[]) => s[0] === BOOK_V3_FIT_SCRIPT), 'Default/finite and escaped selector strings preserve exact old routine');
  o.scriptSha256 = digest(selected);
  assert.equal(textContent(o.pageHtml, 'title'), escape(c.formatted)); checks++; assert.equal(textContent(o.coverHtml, 'width-cover'), escape(c.formatted)); checks++; assert.equal(textContent(o.coverHtml, 'width-nested'), escape(c.formatted)); checks++;
  if (mode === 'width-computed' && routing === 'all') {
    const recipe: any = o.snapshot.bookConfig.rendering.recipe; const nodes = [recipe.copy.title, recipe.covers[formatId].texts[0], recipe.covers[formatId].stacks[0].children[0].children[0]]; o.maxPresence = nodes.map(n => Object.hasOwn(n.fit, 'maxFontSize')); assert.deepEqual(o.maxPresence, [false, false, false]); checks++;
  }
  for (const [kind, item] of [['page-preview', o.plan.pagePreviewItems[0]], ['cover-preview', o.plan.coverPreviewItem]] as const) {
    await renderW3PreviewDocument({ ...item, documentKind: kind }, { pdfMonkeyApiKey: 'synthetic-width-key', fetchImpl: async (url, init) => {
      const request: Record<string, any> = { kind, url: String(url), method: init?.method, rawBody: String(init?.body) }; o.requests.push(request); requests++; progress(o, 'request-attempt'); request.body = JSON.parse(request.rawBody);
      assert.equal(request.url, 'https://api.pdfmonkey.io/api/v1/documents'); checks++; assert.equal(request.method, 'POST'); checks++; assert.equal(request.body.document.payload.pages_html, (kind === 'page-preview' ? o.pageHtml : o.coverHtml).trim()); checks++;
      return Response.json({ document: { id: `synthetic-width-${kind}`, status: 'success', download_url: 'https://synthetic.example.test/local.png' } });
    }, sleep: async () => { throw new Error('Unexpected polling'); }, recordWorkflowEvent: async () => { throw new Error('Unexpected event write'); } });
  }
  o.requestKinds = o.requests.map((r: any) => r.kind); progress(o, 'requests-captured'); assert.equal(o.requests.length, 2, 'Both actual preview requests must be observed'); checks++; assert.deepEqual(o.requestKinds, ['page-preview', 'cover-preview'], 'Actual request kind order is nonvacuous'); checks++;
  assert.equal(JSON.stringify(raw), before); checks++; progress(o, 'complete'); return o;
}

function introspectionControls() {
  for (const io of ['input', 'output'] as const) {
    const o: Record<string, any> = { kind: 'public-json-schema', io }; records.push(o);
    try { o.schema = toJSONSchema(BookV3FitSchema, { io }); o.outcome = 'returned'; }
    catch (error) { o.outcome = 'threw'; o.error = String(error); }
    progress(o, 'observed'); assert.equal(o.outcome, 'returned', 'Public fit schema introspection must not throw'); checks++;
    const choices = expectation === 'fixed' ? o.schema.anyOf : [o.schema];
    check(Array.isArray(choices), 'Union metadata exposes actual alternatives');
    o.fixedOption = choices.find((x: any) => x.type === 'object' && x.properties?.minFontSize && !x.properties?.mode);
    o.widthOption = choices.find((x: any) => x.type === 'object' && x.properties?.mode?.const === 'width-only');
    check(o.fixedOption?.additionalProperties === false && JSON.stringify(o.fixedOption.required) === JSON.stringify(['minFontSize', 'maxFontSize']), 'Fixed option retains strict old required fields');
    assert.equal(!!o.widthOption, expectation === 'fixed'); checks++;
    if (expectation === 'fixed') { assert.deepEqual(o.widthOption.required, ['mode']); checks++; check(o.widthOption.additionalProperties === false && !o.widthOption.properties.minFontSize, 'Width and fixed metadata alternatives remain strict and distinct'); }
    o.fixedOptionWithoutRootDialect = Object.fromEntries(Object.entries(o.fixedOption).filter(([key]) => key !== '$schema'));
    o.fixedOptionComparisonPolicy = 'Future old/fixed comparison removes only explicit root $schema key. Full original public input/output schemas and fixed option remain retained; union widening is intentional, not whole-schema byte parity.';
    progress(o, 'complete');
  }
}

async function wrappedCodecControls() {
  for (const wrapper of ['clone', 'optional', 'array', 'meta', 'describe', 'check', 'refine'] as const) for (const valid of [false, true]) for (const method of ['safeParse', 'safeParseAsync', 'safeDecode', 'safeDecodeAsync', 'safeEncode', 'safeEncodeAsync'] as const) {
    const fit = valid ? { minFontSize: 24, maxFontSize: 120 } : { minFontSize: 60, maxFontSize: 40 };
    const o: Record<string, any> = { kind: 'wrapped-codec', wrapper, valid, method, input: wrapper === 'array' ? [fit] : fit, wrapperChecks: 0, errorMapCalls: [] }; records.push(o);
    let schema: any = BookV3FitSchema;
    if (wrapper === 'clone') schema = schema.clone();
    if (wrapper === 'optional') schema = schema.optional();
    if (wrapper === 'array') schema = schema.array();
    if (wrapper === 'describe') schema = schema.describe('Synthetic dispatch clone control');
    if (wrapper === 'refine') schema = schema.refine(() => { o.wrapperChecks++; return true; });
    if (wrapper === 'meta') schema = schema.meta({ title: 'Synthetic width-fit dispatch clone control' });
    if (wrapper === 'check') schema = schema.check(() => { o.wrapperChecks++; });
    try {
      const result = await schema[method](o.input, { reportInput: true, error: (issue: any) => { o.errorMapCalls.push({ code: issue.code, path: issue.path, input: issue.input }); return 'width-wrapper:' + issue.code; } });
      o.accepted = result.success; o.issues = result.success ? [] : result.error.issues; if (result.success) o.data = result.data; else { o.errorName = result.error.name; o.errorMessage = result.error.message; o.errorStack = result.error.stack; }
    } catch (e: any) { o.errorName = e.name; o.errorMessage = e.message; o.issues = e.issues; }
    progress(o, 'observed'); assert.equal(o.accepted, valid, 'Legacy wrapper cannot turn invalid fixed bounds into a pass'); checks++;
    if (valid) { assert.deepEqual(o.data, o.input); checks++; } else check(Array.isArray(o.issues) && o.issues.length > 0, 'Wrapped invalid input retains actual issues');
  }
}

/** Synthetic metric objects exercise emitted code only. They do not implement a fitter or a renderer. */
async function vmMechanics(script: string, c: any, finite = false, joinedScripts?: string[]) {
  const o: Record<string, any> = { kind: 'vm', id: c.id, finite, input: c, script, scriptSha256: digest(script), environment: 'Isolated Node VM, synthetic DOM metrics and synthetic font readiness; no browser geometry or real font measurement', styleWrites: [], fontCalls: [], timers: [], frames: 0 }; records.push(o); progress(o, 'start');
  const sourceRecordIndex = records.findIndex(r => r.kind === 'pipeline' && r.scripts?.[0]?.[0] === script);
  o.scriptSourceRecordIndex = sourceRecordIndex; o.scriptSourcePageHtmlSha256 = sourceRecordIndex < 0 ? null : digest(records[sourceRecordIndex].pageHtml);
  o.inputNumberDescriptors = { initial: String(c.initial), max: String(c.max), soft: String(c.soft), widths: c.widths?.map((n: number) => String(n)), scroll: String(c.scroll) };
  progress(o, 'source-bound'); check(sourceRecordIndex >= 0, 'VM consumes a retained actual configured producer script');
  let frameNumber = 0, currentSize = c.initial ?? 120, event: (() => void) | undefined;
  const dataset: Record<string, string> = { lhbV3Fit: finite ? 'single-line' : 'width-only' };
  if (finite) { dataset.lhbV3Min = String(c.min ?? 24); dataset.lhbV3Max = String(c.max ?? 120); }
  else if (c.max !== null && c.max !== undefined) dataset.lhbV3Max = String(c.max);
  if (c.soft !== undefined) dataset.lhbV3SoftMin = String(c.soft);
  const style: Record<string, any> = {};
  Object.defineProperty(style, 'fontSize', { get: () => currentSize + 'px', set: value => { currentSize = parseFloat(value); o.styleWrites.push({ frame: frameNumber, value: String(value), numeric: currentSize }); }, enumerable: true });
  const available = () => c.widths?.[Math.min(Math.max(0, frameNumber - 1), 1)] ?? 600;
  const parentAvailable = () => c.parentWidths?.[Math.min(Math.max(0, frameNumber - 1), 1)] ?? available();
  const parent: any = { dataset: {}, get clientWidth() { return parentAvailable(); }, getBoundingClientRect: () => ({ width: parentAvailable() }) };
  const container: any = { dataset: { lhbV3FitContainer: 'single-line' }, get clientWidth() { return c.clientZero ? 0 : available(); }, getBoundingClientRect: () => ({ width: available() }) };
  const inner: any = { get scrollWidth() { o.scrollReads = (o.scrollReads ?? 0) + 1; return c.scroll === undefined ? currentSize * (c.scale ?? 10) : c.scroll; }, get offsetHeight() { return currentSize * (c.heightScale ?? 1); } };
  const target: any = { dataset, style, getAttribute: (name: string) => name === 'data-lhb-v3-max' ? Object.hasOwn(dataset, 'lhbV3Max') ? dataset.lhbV3Max : null : name === 'data-lhb-v3-soft-min' ? Object.hasOwn(dataset, 'lhbV3SoftMin') ? dataset.lhbV3SoftMin : null : null, parentElement: c.missingContainer ? null : parent, closest: (selector: string) => {
    o.closestSelector = selector; o.closestSelectors = [...(o.closestSelectors ?? []), selector];
    if (selector !== '[data-lhb-v3-fit-container="single-line"]') return null;
    return c.missingContainer || c.parentOnly ? null : c.selfContainer ? target : container;
  }, get clientWidth() { return available(); }, getBoundingClientRect: () => ({ width: available() }), get scrollWidth() { return inner.scrollWidth; }, get clientHeight() { return c.height ?? 200; }, querySelector: () => c.missingInner ? null : inner };
  const root: any = { dataset: { pageLabel: 'synthetic-p00' }, querySelectorAll: (selector: string) => { o.targetSelectors = [...(o.targetSelectors ?? []), selector]; return selector === '[data-lhb-v3-fit="single-line"]' ? finite ? [target] : [] : selector === '[data-lhb-v3-fit="width-only"]' ? finite ? [] : [target] : []; } };
  let fixedSize = 80;
  const fixedStyle: any = {};
  Object.defineProperty(fixedStyle, 'fontSize', { get: () => fixedSize + 'px', set: value => { fixedSize = parseFloat(value); o.fixedStyleWrites = [...(o.fixedStyleWrites ?? []), { frame: frameNumber, value: String(value) }]; }, enumerable: true });
  const fixedBox: any = { dataset: { lhbV3Fit: 'single-line', lhbV3Min: '24', lhbV3Max: '80' }, style: fixedStyle, clientWidth: 1000, clientHeight: 40, querySelector: () => ({ get scrollWidth() { return fixedSize * 10; }, get offsetHeight() { return fixedSize; } }) };
  const firstRoot: any = { dataset: { pageLabel: 'p00' }, querySelectorAll: () => [] };
  const fixedRoot: any = { dataset: { pageLabel: 'p01' }, querySelectorAll: (selector: string) => selector === '[data-lhb-v3-fit="single-line"]' ? [fixedBox] : [] };
  if (c.joined) root.dataset.pageLabel = 'p02';
  const html: any = { dataset: {} };
  const faces = [{ status: c.font === 'unloaded' ? 'error' : 'loaded' }];
  const fonts: any = c.font === 'missing' ? undefined : { load: (query: string) => { o.fontCalls.push(query); o.fontFacesOffered = c.font === 'empty' ? [] : faces; return c.font === 'reject' ? Promise.reject(new Error('synthetic-font-reject')) : c.font === 'timeout' ? new Promise(() => {}) : Promise.resolve(c.font === 'empty' ? [] : faces); }, ready: c.font === 'ready-reject' ? Promise.reject(new Error('synthetic-font-ready-reject')) : Promise.resolve() };
  const document: any = { documentElement: html, fonts, readyState: c.loading ? 'loading' : 'complete', addEventListener: (name: string, fn: () => void, opts: any) => { o.listener = { name, opts }; event = fn; }, querySelectorAll: () => c.noRoots ? [] : c.joined ? [firstRoot, fixedRoot, root] : [root] };
  const window: any = {};
  const context = createContext({ document, window, requestAnimationFrame: (fn: (time: number) => void) => { frameNumber++; o.frames = frameNumber; queueMicrotask(() => fn(0)); return frameNumber; },
    getComputedStyle: (node: any) => { if (c.styleThrows) throw new Error('synthetic-computed-style'); return { fontSize: node === fixedBox ? fixedSize + 'px' : currentSize ? currentSize + 'px' : c.computed ?? '0px', paddingLeft: String(c.padding ?? 0), paddingRight: String(c.padding ?? 0), paddingTop: String(c.padding ?? 0), paddingBottom: String(c.padding ?? 0) }; },
    setTimeout: (fn: () => void, delay: number) => { o.timers.push({ kind: 'set', delay }); if (c.font === 'timeout') queueMicrotask(fn); return 1; }, clearTimeout: (id: unknown) => { o.timers.push({ kind: 'clear', id }); },
  });
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    for (const source of joinedScripts ?? [script]) runInContext(source, context, { timeout: 1000 });
    const ready = window.__lhbV3LayoutReady; o.installed = html.dataset.lhbV3RoutineInstalled; o.promisePresent = !!ready && typeof ready.then === 'function'; progress(o, 'installed');
    check(o.promisePresent, 'Actual emitted routine installs readiness promise');
    if (c.loading) { o.fontCallsBeforeDomEvent = [...o.fontCalls]; progress(o, 'waiting-dom'); assert.deepEqual(o.fontCallsBeforeDomEvent, []); checks++; check(o.listener.name === 'DOMContentLoaded' && o.listener.opts.once, 'Loading document schedules one DOM event'); event!(); }
    o.ready = await Promise.race([ready, new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('Synthetic VM readiness watchdog')), 1500); })]);
    o.targetDataset = { ...dataset }; o.rootDataset = { ...root.dataset }; o.htmlDataset = { ...html.dataset }; o.finalSize = currentSize; o.styles = { ...style }; progress(o, 'observed');
    check(o.installed === 'true' && o.promisePresent, 'Trusted install flag and readiness retained');
    if (c.font && c.font !== 'loaded') { assert.equal(o.ready.status, 'failed'); checks++; assert.equal(root.dataset.lhbV3LayoutStatus, 'font-error'); checks++; assert.equal(o.styleWrites.length, 0); checks++; if (c.font === 'ready-reject') { assert.deepEqual(o.fontFacesOffered, [{ status: 'loaded' }]); checks++; assert.equal(o.fontCalls.length, 1); checks++; } }
    else if (c.noRoots) { assert.equal(o.ready.status, 'failed'); checks++; }
    else if (c.styleThrows) { assert.equal(o.ready.status, 'failed'); checks++; assert.equal(root.dataset.lhbV3LayoutStatus, 'error'); checks++; }
    else {
      if (!finite) { check(o.closestSelectors?.length > 0 && o.closestSelectors.every((selector: string) => selector === '[data-lhb-v3-fit-container="single-line"]'), 'Actual width loop must query the exact nearest-container selector'); }
      const expectedStatus = c.status ?? 'fit'; assert.equal(dataset.lhbV3FitStatus, expectedStatus); checks++;
      if (c.final !== undefined) { assert.equal(currentSize, c.final); checks++; assert.equal(dataset.lhbV3FitApplied, String(c.final)); checks++; }
      assert.equal(o.ready.status, ['overflow', 'invalid-box'].includes(expectedStatus) ? 'failed' : 'ready'); checks++;
      if (c.secondStart !== undefined) { assert.equal(o.styleWrites.find((w: any) => w.frame === 2)?.numeric, c.secondStart); checks++; }
      if (c.stickySoft) { assert.equal(dataset.lhbV3FitSoftMinExceeded, 'true'); checks++; }
      if (c.stickyOverflow) { assert.equal(dataset.lhbV3FitOverflow, 'true'); checks++; assert.equal(html.dataset.lhbV3FitOverflow, 'true'); checks++; }
      if (!finite) { assert.equal(o.scrollReads ?? 0, o.styleWrites.length, 'Each width measurement reads scrollWidth once per inline-size assignment'); checks++; }
      if (!finite && !['invalid-box'].includes(expectedStatus)) check(style.whiteSpace === 'nowrap' && style.display === 'inline-block' && style.maxWidth === 'none', 'Width loop applies legacy target style mechanics');
    }
    if (c.joined) { o.fixedBoxDataset = { ...fixedBox.dataset }; o.joinedRoots = [firstRoot.dataset, fixedRoot.dataset, root.dataset]; progress(o, 'joined-observed'); assert.equal(fixedBox.dataset.lhbV3FitApplied, '40'); checks++; assert.equal(o.ready.roots.length, 3); checks++; assert.equal(o.fontCalls.length, 1); checks++; }
    const oldPromise = window.__lhbV3LayoutReady, oldLoads = o.fontCalls.length; runInContext(script, context, { timeout: 1000 }); assert.equal(window.__lhbV3LayoutReady, oldPromise); checks++; assert.equal(o.fontCalls.length, oldLoads); checks++;
    progress(o, 'complete');
  } catch (error) { o.error = String(error); progress(o, 'failed'); throw error; }
  finally { clearTimeout(watchdog); }
}
async function main() {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { externalAttempts++; throw new Error('Unexpected global fetch'); };
  try {
    check(expectation === 'old' || expectation === 'fixed', 'WIDTH_FIT_EXPECTATION must be old or fixed'); check(family === 'clean' || family === 'composed', 'WIDTH_FIT_SOURCE_FAMILY must be clean or composed'); assert.equal(b0, 'fixed'); assert.equal(textSupport, 'fixed'); checks += 2;
    await schemaControls(); await oldErrorControls(); await wrappedCodecControls(); introspectionControls(); alteredDispatchControls(); directControls(); rawFixedModeControls(); errorOrderControls();
    let enhanced: string | undefined, joined: string[] | undefined;
    for (const c of widthTextCases) for (const formatId of ['standard', 'amazon']) for (const mode of (expectation === 'fixed' ? ['default', 'finite', 'width-computed', 'width-explicit'] : ['default', 'finite']) as Mode[]) {
      const o = await pipeline(c, formatId, mode); if (mode === 'width-computed') enhanced = o.scripts[0][0];
    }
    if (expectation === 'fixed') for (const formatId of ['standard', 'amazon']) for (const routing of ['later-only', 'cover-only', 'mixed'] as Routing[]) {
      const o = await pipeline(widthTextCases[0], formatId, 'width-computed', routing); if (routing === 'later-only') joined = o.scripts.slice(0, 3).map((s: string[]) => s[0]);
    }
    const finiteScript = records.find(r => r.kind === 'pipeline' && r.mode === 'finite')?.scripts[0][0]; check(finiteScript === BOOK_V3_FIT_SCRIPT, 'Finite VM consumes actual configured emitted old routine');
    await vmMechanics(finiteScript, { id: 'finite-height-limits', max: 120, min: 24, initial: 80, widths: [1000, 1000], height: 40, scale: 10, final: 40, secondStart: 120, status: 'fit' }, true);
    await vmMechanics(finiteScript, { id: 'finite-clamped-floor', max: 24.2, min: 24, initial: 80, widths: [1, 1], final: 24, secondStart: 24.2, status: 'overflow' }, true);
    await vmMechanics(finiteScript, { id: 'finite-missing-inner', missingInner: true, widths: [600, 600], status: 'invalid-box' }, true);
    if (expectation === 'fixed') {
      check(!!enhanced && enhanced !== finiteScript, 'VM source comes from actual configured width output');
      for (const c of widthVmCases) await vmMechanics(enhanced!, c);
      for (const c of [
        { id: 'width-negative', widths: [-1, -1], status: 'invalid-box' }, { id: 'width-nonfinite', widths: [Infinity, Infinity], status: 'invalid-box' }, { id: 'scroll-negative', widths: [600, 600], scroll: -1, status: 'invalid-box' }, { id: 'scroll-nonfinite', widths: [600, 600], scroll: Infinity, status: 'invalid-box' },
        { id: 'missing-container', missingContainer: true, status: 'invalid-box' }, { id: 'malformed-max', max: 'bad', status: 'invalid-box' }, { id: 'maximum-nonfinite', max: Infinity, status: 'invalid-box' }, { id: 'maximum-zero', max: 0, status: 'invalid-box' }, { id: 'maximum-too-large', max: 513, status: 'invalid-box' },
        { id: 'malformed-soft', max: 80, soft: 'bad', status: 'invalid-box' }, { id: 'computed-infinite', initial: Infinity, status: 'invalid-box' }, { id: 'computed-negative', initial: -1, status: 'invalid-box' }, { id: 'computed-too-large', initial: 513, status: 'invalid-box' }, { id: 'computed-zero-fallback', initial: 0, widths: [1200, 1200], final: 120 }, { id: 'empty-max-computed', max: '', initial: 80, widths: [400, 400], final: 40, secondStart: 40 }, { id: 'font-missing', font: 'missing' }, { id: 'font-reject', font: 'reject' }, { id: 'font-ready-reject', font: 'ready-reject' }, { id: 'font-empty', font: 'empty' }, { id: 'font-unloaded', font: 'unloaded' }, { id: 'font-timeout', font: 'timeout' },
        { id: 'no-roots', noRoots: true }, { id: 'computed-style-error', styleThrows: true }, { id: 'loading-dom', loading: true, max: 80, widths: [800, 800], initial: 80, final: 80 },
      ]) await vmMechanics(enhanced!, c);
      await vmMechanics(enhanced!, { id: 'joined-later-width-installer', joined: true, max: 80, widths: [400, 400], initial: 80, final: 40, secondStart: 80 }, false, joined);
    }
    assert.equal(externalAttempts, 0); checks++;
  } finally { globalThis.fetch = previous; }
}
main().then(() => { console.log('WIDTH_FIT_OBSERVATIONS=' + JSON.stringify({ result: 'PASS', expectation, family, b0, textSupport, checks, requests, normalizations, externalAttempts, vmIsSynthetic: true, browserGeometryMeasured: false, realFontMeasured: false, records })); })
  .catch(error => { console.log('WIDTH_FIT_OBSERVATIONS=' + JSON.stringify({ result: 'FAIL', expectation, family, b0, textSupport, checks, requests, normalizations, externalAttempts, vmIsSynthetic: true, browserGeometryMeasured: false, realFontMeasured: false, records, error: String(error), errorDetails: { name: error?.name, message: error?.message, issues: error?.issues, stack: error?.stack } })); console.error(error); process.exitCode = 1; });
