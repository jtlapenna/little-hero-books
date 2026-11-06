import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { blockTextCases, blockLayouts, blockSchemaCases, oldStackCases, schemaMethods, exactFormatCases, positiveDeclarationExpectations } from './helpers/book-v3-block-flow-cases';
import { rawV3 } from './helpers/book-layout-v3-fixture';
import { configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema } from '../src/lib/books/types';
import { BookV3CopyBlockSchema, BookRenderRecipeSchema, BookRenderRecipeV3Schema } from '../src/lib/books/book-render-contract';
import { renderBookV3Copy, renderBookV3Stacks, BOOK_V3_FIT_SCRIPT } from '../src/lib/books/book-v3-copy';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { prepareW3AssemblyRun } from '../src/lib/workers/w3-assembly-worker';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { renderW3PreviewDocument } from '../src/lib/w3-pdfmonkey-preview';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

const expectation = process.env.BLOCK_FLOW_EXPECTATION, family = process.env.BLOCK_FLOW_SOURCE_FAMILY;
const b0 = process.env.B0_EXPECTATION, textSupport = process.env.TEXT_SUPPORT_EXPECTATION, widthFit = process.env.WIDTH_FIT_EXPECTATION;
const records: Array<Record<string, any>> = [];
let checks = 0, requests = 0, normalizations = 0, externalAttempts = 0;
const canvas = { w: 2625, h: 2625 };
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const progress = (o: Record<string, any>, stage: string) => { o.stage = stage; console.log('BLOCK_FLOW_PROGRESS=' + JSON.stringify({ recordIndex: records.indexOf(o), record: o })); };
type Layout = typeof blockLayouts[number];
const block = (layout: Layout) => !['default', 'finite', 'width'].includes(layout);
function ownValues(value: any, path: Array<string | number> = [], rows: any[] = []): any[] {
  if (value && typeof value === 'object') for (const key of Object.keys(value)) {
    const item = value[key], target = [...path, Array.isArray(value) ? Number(key) : key];
    if (item === undefined || typeof item === 'number' && !Number.isFinite(item)) rows.push({ path: target, descriptor: String(item) });
    else ownValues(item, target, rows);
  }
  return rows;
}
function exceptionalMembership(rows: Array<{ path: Array<string | number>; descriptor: string }>): Map<string, string> {
  return new Map(rows.map((row): [string, string] => [JSON.stringify(row.path), row.descriptor]));
}
function copyFor(layout: Layout, textFormat = 'plain'): any {
  const copy: any = { id: 'flow-copy', text: '[dedication message]', fontSize: 86, lineHeight: 'normal', color: '#123456', align: 'center', padding: 0, textFormat, placement: { left: 0, top: 0, width: 2000 } };
  if (layout === 'finite') Object.assign(copy, { typography: { wrap: 'single-line' }, fit: { minFontSize: 24, maxFontSize: 120 }, placement: { ...copy.placement, height: 200 } });
  if (layout === 'width') Object.assign(copy, { typography: { wrap: 'single-line' }, fit: { mode: 'width-only', softMinFontSize: 60 } });
  return copy;
}
function textFor(layout: Layout, id = 'flow-text', text = '[dedication message]', textFormat = 'plain'): any {
  const { placement: _, ...copy } = copyFor(layout, textFormat);
  return { ...copy, kind: 'text', id, text, ...(layout === 'finite' ? { boxHeight: 200 } : {}) };
}
function treeFor(layout: Layout, textFormat = 'plain'): any {
  const first = textFor(layout, 'flow-text', '[dedication message]', textFormat);
  const root: any = { id: 'flow-root', placement: { left: 0, top: 200, width: 2200 }, children: [first] };
  if (!block(layout)) return root;
  Object.assign(root, { flowMode: 'block', blockTextAlign: 'center', padding: { top: 0, right: 220, bottom: 0, left: 220 } });
  Object.assign(first, { blockText: { whiteSpace: layout === 'block-normal' ? 'normal' : 'pre-line' }, blockBox: { maxWidth: 2000, inlineMargin: 'auto' }, spacingAfter: 80 });
  const following = textFor('default', 'following-label', 'Following label');
  following.blockText = { whiteSpace: 'normal' }; following.spacingBefore = 12;
  if (layout === 'block-nested-flex') {
    const child = textFor('default', 'nested-flex-text', 'Nested flex');
    root.children.push({ id: 'nested-flex', kind: 'stack', width: 1600, spacingBefore: 200, spacingAfter: 400, blockBox: { inlineMargin: 'auto', position: 'relative' }, frame: { color: '#FFFFFF', opacity: 0.8, width: 8, radius: 98 }, padding: { top: 40, right: 60, bottom: 40, left: 60 }, children: [child] });
  }
  if (layout === 'block-nested-block') {
    root.children.push({ id: 'try-wrap', kind: 'stack', flowMode: 'block', width: 2000, spacingBefore: 200, spacingAfter: 400, blockBox: { inlineMargin: 'auto', position: 'relative' }, padding: { top: 12, right: 0, bottom: 0, left: 0 }, children: [
      { ...textFor('default', 'try-header', 'TRY THIS'), fontSize: 140, typography: { trackingPx: 8 }, blockText: { whiteSpace: 'normal' }, spacingAfter: 28 },
      { id: 'try-panel', kind: 'stack', flowMode: 'block', width: 1600, blockBox: { inlineMargin: 'auto' }, frame: { color: '#FFFFFF', opacity: 0.8, width: 8, radius: 98 }, padding: { top: 40, right: 60, bottom: 40, left: 60 }, children: [
        { ...textFor('default', 'try-text', '[dedication message]', textFormat), lineHeight: 1.25, typography: { trackingPx: 1 }, blockText: { whiteSpace: 'pre-line' } },
      ] },
    ] });
  }
  if (layout === 'flex-nested-block') {
    delete root.flowMode; delete root.blockTextAlign;
    delete first.blockText; delete first.blockBox;
    delete following.blockText;
    root.children.push({ id: 'nested-block', kind: 'stack', flowMode: 'block', blockTextAlign: 'right', children: [{ ...textFor('default', 'nested-block-text', 'Nested block'), blockText: { whiteSpace: 'normal' }, blockBox: { widthMode: 'fill', position: 'relative' } }] });
  }
  if (layout === 'block-empty' || layout === 'block-omitted') {
    first.text = ''; first.omitIfEmpty = layout === 'block-omitted';
    root.children.push({ id: 'empty-ancestor', kind: 'stack', flowMode: 'block', children: [{ ...textFor('default', 'empty-nested', ''), blockText: { whiteSpace: 'normal' }, omitIfEmpty: true }] });
  }
  root.children.push(following);
  return root;
}
function configFor(layout: Layout, formatId = 'standard', textFormat = 'plain'): any {
  const raw = rawV3();
  raw.rendering.recipe.copy.title = { ...copyFor(block(layout) ? 'default' : layout, textFormat), id: 'title' };
  raw.rendering.recipe.covers[formatId].texts = [{ ...copyFor(block(layout) ? 'default' : layout, textFormat), id: 'flow-cover' }];
  raw.rendering.recipe.covers[formatId].stacks = [treeFor(layout, textFormat)];
  return raw;
}
const stackPath = ['rendering', 'recipe', 'covers', 'standard', 'stacks', 0] as const;
function issueMatches(value: any, target: Array<string | number>, match: (issue: any) => boolean, inherited: Array<string | number> = []): boolean {
  if (Array.isArray(value)) return value.some(item => issueMatches(item, target, match, inherited));
  if (!value || typeof value !== 'object') return false;
  const own = Array.isArray(value.path) ? value.path : [];
  const path = own.length >= inherited.length && inherited.every((part, i) => own[i] === part) ? own : [...inherited, ...own];
  if (path.length === target.length && target.every((part, i) => path[i] === part) && match(value)) return true;
  return Object.values(value).some(item => issueMatches(item, target, match, path));
}
function mutation(id: string): any {
  const raw = configFor('block-pre-line'), root = raw.rendering.recipe.covers.standard.stacks[0], child = root.children[0];
  switch (id) {
    case 'root-block': break;
    case 'block-zero-gap': root.gap = 0; break;
    case 'nested-block': root.children.push({ id: 'nested', kind: 'stack', flowMode: 'block', blockBox: { widthMode: 'auto' }, children: [{ ...textFor('default', 'nested-text'), blockText: { whiteSpace: 'normal' } }] }); break;
    case 'nested-flex': root.children.push({ id: 'nested', kind: 'stack', blockBox: { widthMode: 'auto' }, children: [textFor('finite', 'nested-text')] }); break;
    case 'numeric-width': child.width = 1800; child.blockBox.widthMode = undefined; child.lineHeight = 1.25; break;
    case 'fill-width': child.blockBox.widthMode = 'fill'; break;
    case 'auto-width': child.blockBox.widthMode = 'auto'; break;
    case 'max-boundary': child.blockBox.maxWidth = 100000; break;
    case 'wrong-flow': root.flowMode = 'flex'; break;
    case 'unknown-root': root.extra = true; break;
    case 'unknown-box': child.blockBox.extra = true; break;
    case 'unknown-text': child.blockText.extra = true; break;
    case 'wrong-whitespace': child.blockText.whiteSpace = 'single-line'; break;
    case 'wrong-width-mode': child.blockBox.widthMode = 'other'; break;
    case 'wrong-inline-margin': child.blockBox.inlineMargin = 'other'; break;
    case 'wrong-position': child.blockBox.position = 'absolute'; break;
    case 'max-zero': child.blockBox.maxWidth = 0; break;
    case 'max-large': child.blockBox.maxWidth = 100001; break;
    case 'max-string': child.blockBox.maxWidth = '2000'; break;
    case 'missing-block-text': delete child.blockText; break;
    case 'nonzero-gap': root.gap = 1; break;
    case 'alignment': root.alignment = 'center'; break;
    case 'numeric-width-conflict': child.width = 100; child.blockBox.widthMode = 'auto'; break;
    case 'flex-block-box': delete root.flowMode; delete root.blockTextAlign; delete child.blockText; delete root.children[1].blockText; break;
    case 'flex-block-text': delete root.flowMode; delete root.blockTextAlign; delete child.blockBox; break;
    case 'flex-text-align': delete root.flowMode; delete child.blockText; delete child.blockBox; delete root.children[1].blockText; break;
    case 'root-block-box': root.blockBox = {}; break;
    case 'text-fit': child.fit = { minFontSize: 24, maxFontSize: 120 }; break;
    case 'text-height': child.boxHeight = 200; break;
    case 'text-center': child.typography = { verticalAlign: 'center' }; break;
    case 'wrap-pre-line': child.typography = { wrap: 'pre-line' }; break;
    case 'wrap-single-line': child.typography = { wrap: 'single-line' }; break;
    case 'wrap-balanced': child.typography = { wrap: 'balanced' }; break;
    case 'wrap-undefined': child.typography = { wrap: undefined }; break;
    case 'nested-no-inheritance': root.children.push({ id: 'nested', kind: 'stack', children: [{ ...textFor('default', 'nested-text'), blockText: { whiteSpace: 'normal' } }] }); break;
    case 'flex-box-undefined': delete root.flowMode; delete root.blockTextAlign; root.children = [{ ...textFor('default'), blockBox: undefined }]; break;
    case 'flex-text-undefined': delete root.flowMode; delete root.blockTextAlign; root.children = [{ ...textFor('default'), blockText: undefined }]; break;
    case 'flex-align-undefined': delete root.flowMode; root.blockTextAlign = undefined; root.children = [textFor('default')]; break;
    case 'block-text-undefined': child.blockText = undefined; break;
    case 'block-alignment-undefined': root.alignment = undefined; break;
    case 'optional-values-undefined': root.blockTextAlign = undefined; root.gap = undefined; child.fit = undefined; child.boxHeight = undefined; child.width = undefined; child.blockBox.widthMode = 'auto'; child.typography = { verticalAlign: 'top' }; break;
    case 'flex-mode-undefined': root.flowMode = undefined; delete root.blockTextAlign; root.children = [textFor('default')]; break;
    case 'max-padding-below': child.padding = 60; child.blockBox.maxWidth = 119; break;
    case 'max-padding-equal': child.padding = 60; child.blockBox.maxWidth = 120; break;
    case 'max-padding-above': child.padding = 60; child.width = 1800; child.blockBox.maxWidth = 121; break;
    case 'max-padding-numeric-width': child.padding = 60; child.width = 1800; child.blockBox.maxWidth = 100; break;
    case 'small-max-zero-padding': child.blockBox.maxWidth = 0.1; break;
    default: throw new Error('Unknown source-bound mutation ' + id);
  }
  return raw;
}
// Exact context messages and paths are bound to the reviewed source proposal.
const contextFailures: Record<string, { path: Array<string | number>; message: string }> = {
  'missing-block-text': { path: ['children', 0, 'blockText'], message: 'Block-flow text requires an explicit whitespace mode' },
  'nonzero-gap': { path: ['gap'], message: 'Block flow does not allow a nonzero gap' },
  alignment: { path: ['alignment'], message: 'Block flow does not allow flex alignment' },
  'numeric-width-conflict': { path: ['children', 0, 'blockBox', 'widthMode'], message: 'Block width mode conflicts with numeric width' },
  'flex-block-box': { path: ['children', 0, 'blockBox'], message: 'Block box requires a direct block-flow parent' },
  'flex-block-text': { path: ['children', 0, 'blockText'], message: 'Block text requires a direct block-flow parent' },
  'flex-text-align': { path: ['blockTextAlign'], message: 'Block text alignment requires block flow mode' },
  'text-fit': { path: ['children', 0, 'fit'], message: 'Block text does not allow fit' },
  'text-height': { path: ['children', 0, 'boxHeight'], message: 'Block text does not allow an explicit height' },
  'text-center': { path: ['children', 0, 'typography', 'verticalAlign'], message: 'Block text requires top vertical alignment' },
  'nested-no-inheritance': { path: ['children', 2, 'children', 0, 'blockText'], message: 'Block text requires a direct block-flow parent' },
  'flex-box-undefined': { path: ['children', 0, 'blockBox'], message: 'Block box requires a direct block-flow parent' },
  'flex-text-undefined': { path: ['children', 0, 'blockText'], message: 'Block text requires a direct block-flow parent' },
  'flex-align-undefined': { path: ['blockTextAlign'], message: 'Block text alignment requires block flow mode' },
  'block-text-undefined': { path: ['children', 0, 'blockText'], message: 'Block-flow text requires an explicit whitespace mode' },
  'block-alignment-undefined': { path: ['alignment'], message: 'Block flow does not allow flex alignment' },
  ...Object.fromEntries(['max-padding-below', 'max-padding-equal', 'max-padding-numeric-width'].map(id => [id, { path: ['children', 0, 'blockBox', 'maxWidth'], message: 'Block text maximum width must leave a text area' }])),
  ...Object.fromEntries(['wrap-pre-line', 'wrap-single-line', 'wrap-balanced', 'wrap-undefined'].map(id => [id, { path: ['children', 0, 'typography', 'wrap'], message: 'Block text does not allow typography wrap' }])),
};
function assertOldNewFieldRejection(issues: any[], root: any) {
  const oldRootFields = ['id', 'placement', 'children', 'padding', 'gap', 'alignment', 'frame'];
  const oldTextFields = ['id', 'text', 'fontSize', 'lineHeight', 'color', 'align', 'padding', 'backgroundColor', 'typography', 'fit', 'textFormat', 'omitIfEmpty', 'width', 'spacingBefore', 'spacingAfter', 'kind', 'boxHeight'];
  const rootKeys = Object.keys(root).filter(key => !oldRootFields.includes(key));
  const path: Array<string | number> = [...stackPath], keys = rootKeys.length ? rootKeys : Object.keys(root.children[0]).filter(key => !oldTextFields.includes(key));
  if (!rootKeys.length) path.push('children', 0);
  check(keys.length > 0, 'Old rejection oracle has explicit new keys');
  check(issueMatches(issues, path, issue => issue.code === 'unrecognized_keys' && JSON.stringify([...issue.keys].sort()) === JSON.stringify([...keys].sort())), 'Old schema rejects complete exact new key set at intended stack scope');
}
async function newSchemaControls() {
  for (const c of blockSchemaCases) {
    const input = mutation(c.mutation), o: Record<string, any> = { kind: 'block-schema', id: c.id, input, exceptionalOwnValues: ownValues(input) }; records.push(o); progress(o, 'start');
    const result = BookConfigSchema.safeParse(input); o.accepted = result.success; o.issues = result.success ? [] : result.error.issues; if (result.success) o.data = result.data; progress(o, 'parsed');
    assert.equal(result.success, expectation === 'fixed' && c.accepted); checks++;
    if (!result.success) {
      if (expectation === 'old') assertOldNewFieldRejection(o.issues, input.rendering.recipe.covers.standard.stacks[0]);
      else if ('context' in c) { const expected = contextFailures[c.id]; check(expected, 'Every new context rejection has a source-bound exact oracle'); check(issueMatches(o.issues, [...stackPath, ...expected.path], issue => issue.code === 'custom' && issue.message === expected.message), 'Exact new parent-context path and message'); }
      else if ('target' in c) check(issueMatches(o.issues, [...stackPath, ...c.target], issue => issue.code === c.code && (!('keys' in c) || JSON.stringify([...issue.keys].sort()) === JSON.stringify([...c.keys].sort()))), 'Exact new strict or enum/numeric leaf');
    } else {
      const recipe: any = result.data.rendering.recipe;
      check(recipe?.schema === 'lhb.book-render@v3', 'Actual parsed config retains v3 recipe');
      const root: any = recipe.covers.standard.stacks?.[0];
      o.inputRootExceptionalOwnValues = ownValues(input.rendering.recipe.covers.standard.stacks[0]);
      o.parsedRootExceptionalOwnValues = ownValues(root);
      progress(o, 'parsed-root-own-values');
      assert.equal(root.flowMode, c.id === 'flex-mode-undefined' ? undefined : 'block'); checks++; assert.deepEqual(root, input.rendering.recipe.covers.standard.stacks[0]); checks++;
      const actualExceptional = exceptionalMembership(o.parsedRootExceptionalOwnValues), expectedExceptional = exceptionalMembership(o.inputRootExceptionalOwnValues);
      assert.equal(actualExceptional.size, o.parsedRootExceptionalOwnValues.length, 'Parsed exceptional paths are unique'); checks++; assert.equal(expectedExceptional.size, o.inputRootExceptionalOwnValues.length, 'Input exceptional paths are unique'); checks++;
      assert.equal(actualExceptional.size, expectedExceptional.size, 'Exceptional own-property membership has the same size'); checks++;
      for (const [path, descriptor] of expectedExceptional) { check(actualExceptional.has(path), 'Parsed exceptional own property remains present at exact path'); assert.equal(actualExceptional.get(path), descriptor, 'Exceptional own-property value descriptor remains equal'); checks++; }
      o.html = renderBookV3Stacks([root], text => text, canvas); progress(o, 'serialized');
      const rootTag = opening(o.html, 'flow-root', true)!, childTag = opening(o.html, 'flow-text')!;
      requireStyle(rootTag, 'display', c.id === 'flex-mode-undefined' ? 'flex' : 'block');
      if (c.id !== 'flex-mode-undefined') {
        const declarations = positiveDeclarationExpectations[c.id]; check(declarations, 'Every positive case has explicit source declaration expectations');
        requireAbsentStyle(rootTag, 'gap'); requireStyle(childTag, 'width', declarations.width); requireStyle(childTag, 'max-width', declarations.maxWidth); requireStyle(childTag, 'line-height', declarations.lineHeight);
        if (c.id === 'optional-values-undefined') requireAbsentStyle(rootTag, 'text-align');
      } else { const absent = structuredClone(root); delete absent.flowMode; o.htmlWithoutUndefinedMode = renderBookV3Stacks([absent], text => text, canvas); assert.equal(o.html, o.htmlWithoutUndefinedMode); checks++; }
    }
    assert.deepEqual(ownValues(input), o.exceptionalOwnValues); checks++;
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    const input = mutation('root-block'); input.rendering.recipe.covers.standard.stacks[0].children[0].blockBox.maxWidth = value;
    const o: Record<string, any> = { kind: 'block-nonfinite', valueDescriptor: String(value), input, exceptionalOwnValues: ownValues(input) }; records.push(o);
    const result = BookConfigSchema.safeParse(input); o.accepted = result.success; o.issues = result.success ? [] : result.error.issues; progress(o, 'parsed'); check(!result.success, 'Nonfinite maxWidth rejected');
    if (expectation === 'fixed') check(issueMatches(o.issues, [...stackPath, 'children', 0, 'blockBox', 'maxWidth'], issue => issue.code === 'invalid_type'), 'Exact nonfinite maxWidth leaf');
    else check(issueMatches(o.issues, [...stackPath], issue => issue.code === 'unrecognized_keys' && issue.keys.includes('flowMode')), 'Old rejects new block parent');
  }
}
function oldInput(id: string): any {
  const raw = configFor('default'), root = raw.rendering.recipe.covers.standard.stacks[0], text = root.children[0];
  if (id === 'text-padding') { text.width = 100; text.padding = 60; }
  if (id === 'node-width') text.width = 0;
  if (id === 'negative-spacing') text.spacingBefore = -1;
  if (id === 'frame-opacity') root.frame = { color: '#FFFFFF', opacity: 2, width: 8, radius: 98 };
  if (id === 'unknown-child') text.extra = true;
  if (id === 'bad-alignment') root.alignment = 'middle';
  if (id === 'bad-wrap') text.typography = { wrap: 'normal' };
  if (id === 'empty-children') root.children = [];
  if (id === 'excess-roots') raw.rendering.recipe.covers.standard.stacks = Array.from({ length: 9 }, (_, i) => ({ ...structuredClone(root), id: 'root-' + i }));
  if (id === 'excess-nodes') root.children = Array.from({ length: 65 }, (_, i) => ({ ...structuredClone(text), id: 'text-' + i }));
  if (id === 'excess-depth') { let node: any = text; for (let i = 0; i < 5; i++) node = { kind: 'stack', id: 'nested-' + i, children: [node] }; root.children = [node]; }
  return raw;
}
async function observeSchema(schema: any, input: any, o: Record<string, any>, method: string, custom: boolean) {
  o.input = structuredClone(input); o.exceptionalOwnValues = ownValues(input); o.errorMapCalls = []; records.push(o); progress(o, 'start');
  const error = (issue: any) => { const call: Record<string, any> = { code: issue.code, path: issue.path, input: issue.input, keys: issue.keys, minimum: issue.minimum, maximum: issue.maximum, expected: issue.expected, origin: issue.origin, inclusive: issue.inclusive, ownKeys: Object.keys(issue).sort(), schemaType: issue.inst?._zod?.def?.type }; o.errorMapCalls.push(call); call.returned = 'block-map:' + issue.code + ':' + JSON.stringify(issue.path ?? []); return call.returned; };
  try {
    const result = await schema[method](input, { reportInput: true, ...(custom ? { error } : {}) });
    if (method.startsWith('safe')) { o.accepted = result.success; o.issues = result.success ? [] : result.error.issues; if (result.success) o.data = result.data; else { o.errorName = result.error.name; o.errorMessage = result.error.message; o.errorStack = result.error.stack; } }
    else { o.accepted = true; o.data = result; }
  } catch (e: any) { o.accepted = false; o.errorName = e.name; o.errorMessage = e.message; o.errorString = String(e); o.errorStack = e.stack; o.issues = e.issues; }
  o.inputAfter = structuredClone(input); o.exceptionalOwnValuesAfter = ownValues(input); progress(o, 'observed');
  assert.deepEqual(o.inputAfter, o.input); checks++; assert.deepEqual(o.exceptionalOwnValuesAfter, o.exceptionalOwnValues); checks++;
}
async function oldSchemaControls() {
  for (const id of oldStackCases) for (const scope of ['recipe', 'config'] as const) for (const method of schemaMethods) for (const custom of [false, true]) {
    const raw = oldInput(id), input = scope === 'recipe' ? raw.rendering.recipe : raw, schema = scope === 'recipe' ? BookRenderRecipeV3Schema : BookConfigSchema;
    const o: Record<string, any> = { kind: 'old-schema', id, scope, method, custom }; await observeSchema(schema, input, o, method, custom);
    const existingEncodeLimit = method.toLowerCase().includes('encode') && o.errorName === 'ZodEncodeError' && o.errorMessage === 'Encountered unidirectional transform during encode: ZodTransform'; o.knownNestedEncodeLimitation = existingEncodeLimit; progress(o, 'complete');
    if (id === 'valid' && !existingEncodeLimit) {
      check(o.accepted, 'Omitted-option complete old recipe/config remains accepted');
      if (scope === 'recipe') { assert.deepEqual(o.data, input); checks++; }
      else {
        assert.deepEqual(o.data.rendering.recipe, input.rendering.recipe); checks++;
        assert.deepEqual(o.data.rendering.characterPlacement, { defaultByStoryPage: {}, overridesByFormat: {} }); checks++;
        assert.deepEqual(o.data.rendering.animalPlacement, { defaultByStoryPage: {}, overridesByFormat: {} }); checks++;
        assert.deepEqual(o.data.rendering.coverCharacterPlacement, { default: null, overridesByFormat: {} }); checks++;
      }
    }
    else check(o.accepted === false && (Array.isArray(o.issues) && o.issues.length > 0 || existingEncodeLimit), 'Complete old rejection or exact installed nested encode limitation retained');
  }
  for (const id of ['valid', 'bad-wrap', 'bad-padding', 'missing-height', 'unknown-key'] as const) for (const method of schemaMethods) for (const custom of [false, true]) {
    const input = copyFor('finite');
    if (id === 'bad-wrap') input.typography.wrap = 'normal'; if (id === 'bad-padding') input.padding = -1; if (id === 'missing-height') delete input.placement.height; if (id === 'unknown-key') input.extra = true;
    const o: Record<string, any> = { kind: 'old-copy-schema', id, scope: 'copy', method, custom }; await observeSchema(BookV3CopyBlockSchema, input, o, method, custom);
    assert.equal(o.accepted, id === 'valid'); checks++; if (id !== 'valid') check(Array.isArray(o.issues) && o.issues.length > 0, 'Absolute copy retains complete old issues');
  }
  for (const wrapper of ['clone', 'optional', 'array', 'meta', 'check'] as const) for (const valid of [false, true]) for (const method of ['safeParse', 'safeParseAsync', 'safeDecode', 'safeDecodeAsync', 'safeEncode', 'safeEncodeAsync']) {
    const base: any = BookRenderRecipeV3Schema; let schema: any, wrapperChecks = 0;
    if (wrapper === 'clone') schema = base.clone(); else if (wrapper === 'optional') schema = base.optional(); else if (wrapper === 'array') schema = base.array(); else if (wrapper === 'meta') schema = base.meta({ source: 'block-flow-preservation' }); else schema = base.check(() => { wrapperChecks++; });
    const recipe = oldInput(valid ? 'valid' : 'node-width').rendering.recipe;
    const input = wrapper === 'array' ? [recipe] : recipe, o: Record<string, any> = { kind: 'old-wrapped-schema', scope: 'recipe', wrapper, valid, method, custom: true }; await observeSchema(schema, input, o, method, true); o.wrapperChecks = wrapperChecks;
    o.knownNestedEncodeLimitation = method.toLowerCase().includes('encode') && o.errorName === 'ZodEncodeError' && o.errorMessage === 'Encountered unidirectional transform during encode: ZodTransform'; progress(o, 'complete');
    if (o.knownNestedEncodeLimitation) check(o.accepted === false, 'Exact installed nested encode limitation retained');
    else { assert.equal(o.accepted, valid); checks++; }
  }
}
function scripts(html: string): string[] { return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]); }
function opening(html: string, id: string, stack = false): string | undefined {
  return html.match(new RegExp('<div[^>]*' + (stack ? 'data-lhb-v3-stack' : 'data-copy-block-id') + '="' + id + '"[^>]*>'))?.[0];
}
function styleDeclarations(tag: string): Array<[string, string]> { return (tag.match(/style="([^"]*)"/)?.[1] ?? '').split(';').filter(Boolean).map(pair => { const colon = pair.indexOf(':'); return [pair.slice(0, colon), pair.slice(colon + 1)] as [string, string]; }); }
function requireStyle(tag: string, property: string, value: string) { const matches = styleDeclarations(tag).filter(([key]) => key === property); assert.deepEqual(matches, [[property, value]], 'One explicit source declaration for ' + property); checks++; }
function requireAbsentStyle(tag: string, property: string) { assert.deepEqual(styleDeclarations(tag).filter(([key]) => key === property), [], 'Absent source declaration ' + property); checks++; }
function textContent(html: string, id: string, blockText = false): string | undefined {
  const tag = opening(html, id); if (!tag) return undefined; const tail = html.slice(html.indexOf(tag) + tag.length);
  return blockText ? tail.slice(0, tail.indexOf('</div>')) : tail.match(/^<span[^>]*>([\s\S]*?)<\/span>/)?.[1];
}
function blockSourceOracle(html: string, layout: Layout, expected: string) {
  const root = opening(html, 'flow-root', true)!; check(root, 'Actual stack root emitted');
  if (layout === 'flex-nested-block') {
    requireStyle(root, 'display', 'flex'); requireAbsentStyle(root, 'text-align'); const nested = opening(html, 'nested-block', true)!; requireStyle(nested, 'display', 'block'); requireStyle(nested, 'text-align', 'right');
    const text = opening(html, 'nested-block-text')!; requireStyle(text, 'position', 'relative'); requireStyle(text, 'width', '100%'); requireStyle(text, 'white-space', 'normal');
    requireStyle(opening(html, 'flow-text')!, 'display', 'flex'); assert.equal(textContent(html, 'flow-text'), escape(expected)); checks++; assert.equal(textContent(html, 'nested-block-text', true), 'Nested block'); checks++;
    return;
  }
  requireStyle(root, 'display', 'block'); requireStyle(root, 'text-align', 'center'); requireStyle(root, 'padding', '0px 220px 0px 220px');
  for (const property of ['flex-direction', 'align-items', 'gap', 'overflow', 'contain', 'height']) requireAbsentStyle(root, property);
  const first = opening(html, 'flow-text');
  if (layout === 'block-omitted') check(first === undefined, 'Only explicitly empty text wrapper omitted');
  else {
    check(first, 'Block text retained'); requireStyle(first!, 'display', 'block'); requireStyle(first!, 'position', 'static'); requireStyle(first!, 'width', 'auto'); requireStyle(first!, 'max-width', '2000px'); requireStyle(first!, 'margin', '0px auto 80px'); requireStyle(first!, 'line-height', 'normal'); requireStyle(first!, 'white-space', layout === 'block-normal' ? 'normal' : 'pre-line');
    for (const property of ['flex', 'align-items', 'justify-content', 'height', 'text-wrap', 'overflow-wrap']) requireAbsentStyle(first!, property);
    check(first!.includes('data-lhb-v3-text="true"'), 'Block text diagnostic hook on wrapper'); assert.equal(textContent(html, 'flow-text', true), layout === 'block-empty' ? '' : escape(expected)); checks++;
  }
  if (layout === 'block-empty' || layout === 'block-omitted') { check(opening(html, 'empty-ancestor', true), 'All-omitted nested wrapper retained'); check(!opening(html, 'empty-nested'), 'Explicitly omitted nested text removed'); }
  if (layout === 'block-nested-flex') {
    const nested = opening(html, 'nested-flex', true)!, child = opening(html, 'nested-flex-text')!;
    requireStyle(nested, 'display', 'flex'); requireStyle(nested, 'position', 'relative'); requireStyle(nested, 'width', '1600px'); requireStyle(nested, 'margin', '200px auto 400px'); requireStyle(nested, 'padding', '40px 60px 40px 60px'); requireStyle(nested, 'border', '8px solid #FFFFFFcc'); requireStyle(nested, 'border-radius', '98px'); requireStyle(child, 'display', 'flex'); requireStyle(child, 'position', 'relative'); requireStyle(child, 'width', '100%');
  }
  if (layout === 'block-nested-block') {
    const wrap = opening(html, 'try-wrap', true)!, header = opening(html, 'try-header')!, panel = opening(html, 'try-panel', true)!, text = opening(html, 'try-text')!, following = opening(html, 'following-label')!;
    check(wrap && header && panel && text && following, 'Complete ordinary block and framed block subtree retained');
    requireStyle(wrap, 'display', 'block'); requireStyle(wrap, 'position', 'relative'); requireStyle(wrap, 'width', '2000px'); requireStyle(wrap, 'margin', '200px auto 400px'); requireStyle(wrap, 'padding', '12px 0px 0px 0px');
    requireStyle(header, 'display', 'block'); requireStyle(header, 'white-space', 'normal'); requireStyle(header, 'font-size', '140px'); requireStyle(header, 'line-height', 'normal'); requireStyle(header, 'letter-spacing', '8px'); requireStyle(header, 'margin', '0px 0 28px');
    requireStyle(panel, 'display', 'block'); requireStyle(panel, 'position', 'static'); requireStyle(panel, 'width', '1600px'); requireStyle(panel, 'margin', '0px auto 0px'); requireStyle(panel, 'padding', '40px 60px 40px 60px'); requireStyle(panel, 'border', '8px solid #FFFFFFcc'); requireStyle(panel, 'border-radius', '98px');
    requireStyle(text, 'display', 'block'); requireStyle(text, 'position', 'static'); requireStyle(text, 'width', 'auto'); requireStyle(text, 'white-space', 'pre-line'); requireStyle(text, 'line-height', '1.25'); requireStyle(text, 'font-size', '86px'); requireStyle(text, 'letter-spacing', '1px');
    for (const tag of [wrap, header, panel, text]) for (const property of ['flex', 'flex-direction', 'align-items', 'gap', 'height', 'overflow', 'contain']) requireAbsentStyle(tag, property);
    check(header.includes('data-lhb-v3-text="true"') && text.includes('data-lhb-v3-text="true"'), 'Both nested block text hooks remain on their wrappers');
    assert.equal(textContent(html, 'try-header', true), 'TRY THIS'); checks++; assert.equal(textContent(html, 'try-text', true), escape(expected)); checks++;
    const positions = [wrap, header, panel, text, following].map(tag => html.indexOf(tag)); assert.deepEqual([...positions].sort((a, b) => a - b), positions); checks++;
    check(html.includes(`${panel}${text}${escape(expected)}</div></div></div>${following}`), 'Direct panel text closes inside panel and try wrapper before following sibling');
  }
  check(opening(html, 'following-label'), 'Following sibling remains after empty/nested content');
  requireStyle(opening(html, 'following-label')!, 'margin', '12px 0 0px');
  if (first) check(html.indexOf(first) < html.indexOf(opening(html, 'following-label')!), 'Sibling source order retained');
}
function directControls() {
  for (const c of blockTextCases) for (const layout of blockLayouts.filter(layout => expectation === 'fixed' || !block(layout))) {
    const copy = copyFor(block(layout) ? 'default' : layout, c.format), tree = treeFor(layout, c.format), o: Record<string, any> = { kind: 'direct', id: c.id, layout, input: copy, stackInput: tree, interpolation: [] }; records.push(o); progress(o, 'start');
    const interpolate = (text: string) => { o.interpolation.push(text); return text.replace('[dedication message]', c.assembled); };
    try { o.copyHtml = renderBookV3Copy(copy, interpolate, canvas); progress(o, 'copy'); o.stackHtml = renderBookV3Stacks([tree], interpolate, canvas); } catch (e: any) { o.errorName = e.name; o.errorMessage = e.message; o.errorStack = e.stack; progress(o, 'failed'); throw e; }
    progress(o, 'rendered'); assert.equal(textContent(o.copyHtml, 'flow-copy'), escape(c.formatted)); checks++;
    if (block(layout)) blockSourceOracle(o.stackHtml, layout, c.formatted); else { assert.equal(textContent(o.stackHtml, 'flow-text'), escape(c.formatted)); checks++; requireStyle(opening(o.stackHtml, 'flow-root', true)!, 'display', 'flex'); }
    check(!o.copyHtml.includes('<script>') && !o.stackHtml.includes('<script>'), 'Personalized source cannot become executable markup');
    assert.deepEqual(o.interpolation, ['[dedication message]', ...expectedInterpolation(tree)]); checks++;
    progress(o, 'complete');
  }
}
function expectedInterpolation(node: any): string[] { return node.children.flatMap((child: any) => child.kind === 'stack' ? expectedInterpolation(child) : [child.text]); }
function directEmptyAndErrorControls() {
  for (const layout of (expectation === 'fixed' ? ['default', 'block-normal'] : ['default']) as Layout[]) for (const c of exactFormatCases) for (const omit of [false, true]) {
    const tree = treeFor(layout), child = tree.children[0]; child.text = c.value; child.textFormat = c.format; child.omitIfEmpty = omit;
    const o: Record<string, any> = { kind: 'exact-format', id: c.id, layout, omit, input: tree, calls: [] }; records.push(o); progress(o, 'start');
    o.html = renderBookV3Stacks([tree], text => { o.calls.push(text); return text; }, canvas); progress(o, 'rendered');
    const absent = omit && c.expected === ''; assert.equal(Boolean(opening(o.html, 'flow-text')), !absent); checks++;
    if (!absent) { assert.equal(textContent(o.html, 'flow-text', block(layout)), escape(c.expected)); checks++; }
    assert.deepEqual(o.calls, expectedInterpolation(tree)); checks++;
  }
  for (const layout of (expectation === 'fixed' ? ['default', 'block-normal'] : ['default']) as Layout[]) for (const value of ['', '\n', '  ', 'A\nB'] as const) for (const omit of [false, true]) {
    const tree = treeFor(layout), child = tree.children[0]; child.text = value; child.omitIfEmpty = omit;
    const o: Record<string, any> = { kind: 'exact-empty', layout, value, omit, input: tree, calls: [] }; records.push(o); progress(o, 'start');
    o.html = renderBookV3Stacks([tree], text => { o.calls.push(text); return text; }, canvas); progress(o, 'rendered');
    assert.equal(Boolean(opening(o.html, 'flow-text')), !(omit && value === '')); checks++; check(opening(o.html, 'flow-root', true), 'Root remains when text omits'); assert.deepEqual(o.calls, expectedInterpolation(tree)); checks++;
  }
  for (const layout of (expectation === 'fixed' ? ['default', 'block-normal'] : ['default']) as Layout[]) for (const fault of ['first-interpolation', 'second-interpolation', 'formatter'] as const) {
    const tree = treeFor(layout); tree.children.push({ ...textFor('default', 'last', 'LAST'), ...(block(layout) ? { blockText: { whiteSpace: 'normal' } } : {}) });
    if (fault === 'formatter') { tree.children[0].textFormat = 'legacy-lines'; tree.children[0].text = null; }
    const o: Record<string, any> = { kind: 'direct-error', layout, fault, input: tree, calls: [] }; records.push(o); progress(o, 'start');
    try { o.html = renderBookV3Stacks([tree], text => { o.calls.push(text); if (fault === 'first-interpolation' && o.calls.length === 1 || fault === 'second-interpolation' && o.calls.length === 2) throw new Error('Synthetic block interpolation failure'); return text; }, canvas); }
    catch (e: any) { o.errorName = e.name; o.errorMessage = e.message; o.errorString = String(e); o.errorStack = e.stack; }
    progress(o, 'observed'); check(o.html === undefined && typeof o.errorStack === 'string', 'Raw serializer failure retained before assertion');
    if (fault === 'formatter') { assert.equal(o.errorName, 'TypeError'); checks++; assert.deepEqual(o.calls, [null]); checks++; }
    else { assert.equal(o.errorMessage, 'Synthetic block interpolation failure'); checks++; assert.equal(o.calls.length, fault === 'first-interpolation' ? 1 : 2); checks++; }
  }
}
async function pipeline(c: typeof blockTextCases[number], formatId: string, layout: Layout) {
  const raw = configFor(layout, formatId, c.format), before = structuredClone(raw), o: Record<string, any> = { kind: 'pipeline', id: c.id, formatId, layout, configInput: structuredClone(raw), requests: [], manifestReads: [], normalizerCalls: [] }; records.push(o); progress(o, 'start');
  const config = BookConfigSchema.parse(raw); o.parsedConfig = config;
  const orderId = `BLOCK-${formatId}-${c.id}-${layout}`, characterHash = 'synthetic-block-child';
  const one = buildW0RunManifestFromConfig(config, { orderId, formatId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', characterHash, createdAt: '2026-11-01T00:00:00.000Z', runId: 'synthetic-block-flow', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl', pronouns: 'they/them' }, dedicationText: c.fallback } });
  o.snapshot = one.book.resolved.renderSnapshot; progress(o, 'snapshot'); assert.deepEqual(o.snapshot.bookConfig.rendering.recipe, config.rendering.recipe); checks++;
  const two = { characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({ poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId) })) }, twoKey = `${config.bookId}/orders/${orderId}/manifests/2b-manifest.json`;
  const assembly = await buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId, oneManifestKey: one.artifacts.manifestKey, manifest2bKey: twoKey, dedicationText: c.primary, bookSpecs: { dedicationMessage: '' }, orderDetails: { dedicationMessage: '' } }, {
    loadManifest: async key => { o.manifestReads.push(key); return key === one.artifacts.manifestKey ? structuredClone(one) : key === twoKey ? structuredClone(two) : null; },
    normalizePoseScale: async ({ poseNumber, imageKey }) => { normalizations++; o.normalizerCalls.push({ poseNumber, imageKey }); return { success: true, normalized: false, imageKey, refKey: '', poseNumber, bookId: config.bookId, scaleFactor: 1, verticalOffset: 0, horizontalOffset: 0, groundContactOffset: 0, sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true, message: 'Synthetic no-byte block-flow boundary' }; },
  });
  o.assembly = assembly; progress(o, 'assembly'); assert.deepEqual(o.manifestReads, [twoKey, one.artifacts.manifestKey]); checks++; assert.equal(assembly.dedicationText, c.assembled || null); checks++; assert.deepEqual(o.normalizerCalls.map((entry: any) => entry.poseNumber).sort((a: number, b: number) => a - b), [13, 17, 18]); checks++;
  const prepared = prepareW3AssemblyRun({ ...assembly, runStamp: 'synthetic-block-flow' }); o.assemblyStartedAt = prepared.assemblyStartedAt;
  o.plan = buildW3PreviewPlan(prepared); progress(o, 'plan'); assert.deepEqual(o.plan.pagePreviewItems.map((item: any) => item.pageLabel), ['p00', 'p01', 'p02']); checks++; check(o.plan.coverPreviewItem?.coverHTML, 'Complete actual cover retained');
  o.pageHtml = o.plan.pagePreviewItems[0].pageHtml; o.coverHtml = o.plan.coverPreviewItem.coverHTML;
  o.scripts = [...o.plan.pagePreviewItems.map((item: any) => scripts(item.pageHtml)), scripts(o.coverHtml)]; progress(o, 'scripts'); check(o.scripts.every((script: string[]) => script.length === 1), 'Every actual page and cover has one trusted routine');
  if (layout === 'width') { check(o.scripts[0][0] !== BOOK_V3_FIT_SCRIPT, 'Existing width mode remains enhanced'); check(o.scripts.every((script: string[]) => script[0] === o.scripts[0][0]), 'Width script stays recipe-wide'); }
  else check(o.scripts.every((script: string[]) => script[0] === BOOK_V3_FIT_SCRIPT), 'Block/default/finite preserve static existing script');
  o.scriptSha256 = digest(o.scripts[0][0]);
  assert.equal(textContent(o.pageHtml, 'title'), escape(c.formatted)); checks++; assert.equal(textContent(o.coverHtml, 'flow-cover'), escape(c.formatted)); checks++;
  if (block(layout)) blockSourceOracle(o.coverHtml, layout, c.formatted); else { assert.equal(textContent(o.coverHtml, 'flow-text'), escape(c.formatted)); checks++; }
  for (const [kind, item] of [['page-preview', o.plan.pagePreviewItems[0]], ['cover-preview', o.plan.coverPreviewItem]] as const) await renderW3PreviewDocument({ ...item, documentKind: kind }, { pdfMonkeyApiKey: 'synthetic-block-key', fetchImpl: async (url, init) => {
    const request: Record<string, any> = { kind, url: String(url), method: init?.method, rawBody: String(init?.body) }; o.requests.push(request); requests++; progress(o, 'request-attempt'); request.body = JSON.parse(request.rawBody);
    assert.equal(request.url, 'https://api.pdfmonkey.io/api/v1/documents'); checks++; assert.equal(request.method, 'POST'); checks++; assert.equal(request.body.document.payload.pages_html, (kind === 'page-preview' ? o.pageHtml : o.coverHtml).trim()); checks++;
    return Response.json({ document: { id: `synthetic-block-${kind}`, status: 'success', download_url: 'https://synthetic.example.test/local.png' } });
  }, sleep: async () => { throw new Error('Unexpected polling'); }, recordWorkflowEvent: async () => { throw new Error('Unexpected event write'); } });
  o.requestKinds = o.requests.map((r: any) => r.kind); progress(o, 'requests-captured'); assert.equal(o.requests.length, 2); checks++; assert.deepEqual(o.requestKinds, ['page-preview', 'cover-preview']); checks++; assert.deepEqual(raw, before); checks++; progress(o, 'complete');
}
function familyControls() {
  const raw = configuredBookRaw(); raw.rendering.recipe.schema = 'lhb.book-render@v2';
  const result = BookRenderRecipeSchema.safeParse(raw.rendering.recipe), o: Record<string, any> = { kind: 'family', input: raw.rendering.recipe, family, accepted: result.success, issues: result.success ? [] : result.error.issues }; records.push(o); progress(o, 'parsed'); assert.equal(result.success, family === 'composed'); checks++;
  for (const version of ['lhb.book-render@v1', 'lhb.book-render@v2']) {
    const value = configuredBookRaw().rendering.recipe; value.schema = version; value.copy.title.blockText = { whiteSpace: 'normal' };
    const parsed = BookRenderRecipeSchema.safeParse(value), row: Record<string, any> = { kind: 'legacy-family-field', version, input: value, accepted: parsed.success, issues: parsed.success ? [] : parsed.error.issues, ...(parsed.success ? { data: parsed.data } : {}) }; records.push(row); progress(row, 'observed');
    // Existing v1/v2 objects may strip unknown fields. Full old/fixed observations, not an invented rejection rule, are compared later.
  }
}
async function main() {
  check(expectation === 'old' || expectation === 'fixed', 'BLOCK_FLOW_EXPECTATION must be old or fixed'); check(family === 'clean' || family === 'composed', 'BLOCK_FLOW_SOURCE_FAMILY must be clean or composed');
  for (const [name, value] of [['B0_EXPECTATION', b0], ['TEXT_SUPPORT_EXPECTATION', textSupport], ['WIDTH_FIT_EXPECTATION', widthFit]]) { assert.equal(value, 'fixed', name + ' must be fixed'); checks++; }
  const priorFetch = globalThis.fetch; globalThis.fetch = async () => { externalAttempts++; throw new Error('Unexpected global fetch after imports'); };
  try { familyControls(); await oldSchemaControls(); await newSchemaControls(); directControls(); directEmptyAndErrorControls();
    for (const c of blockTextCases) for (const formatId of ['standard', 'amazon']) for (const layout of blockLayouts.filter(layout => expectation === 'fixed' || !block(layout))) await pipeline(c, formatId, layout);
    const expectedCounts = { family: 1, 'legacy-family-field': 2, 'old-schema': oldStackCases.length * 2 * schemaMethods.length * 2, 'old-copy-schema': 5 * schemaMethods.length * 2, 'old-wrapped-schema': 5 * 2 * 6, 'block-schema': blockSchemaCases.length, 'block-nonfinite': 3, direct: blockTextCases.length * (expectation === 'fixed' ? blockLayouts.length : 3), 'exact-format': (expectation === 'fixed' ? 2 : 1) * exactFormatCases.length * 2, 'exact-empty': (expectation === 'fixed' ? 2 : 1) * 4 * 2, 'direct-error': (expectation === 'fixed' ? 2 : 1) * 3, pipeline: blockTextCases.length * 2 * (expectation === 'fixed' ? blockLayouts.length : 3) };
    const actualCounts = Object.fromEntries(Object.keys(expectedCounts).map(kind => [kind, records.filter(record => record.kind === kind).length]));
    console.log('BLOCK_FLOW_COUNTS=' + JSON.stringify({ expected: expectedCounts, actual: actualCounts })); assert.deepEqual(actualCounts, expectedCounts); checks++;
    assert.equal(records.length, Object.values(expectedCounts).reduce((sum, count) => sum + count, 0), 'No unknown or missing record kinds'); checks++;
    assert.equal(requests, expectedCounts.pipeline * 2); checks++; assert.equal(normalizations, expectedCounts.pipeline * 3); checks++;
    assert.equal(externalAttempts, 0); checks++;
  } finally { globalThis.fetch = priorFetch; }
}
const envelope = (result: string) => ({ result, expectation, family, b0, textSupport, widthFit, checks, requests, normalizations, externalAttempts, actualDomMeasured: false, browserGeometryMeasured: false, realFontMeasured: false, unmeasuredEffects: ['Module-import effects before scoped fetch interception', 'Other transports and installed transitive package bytes', 'Normal-flow geometry, line boxes, margin collapse, font and visual behavior'], records });
main().then(() => console.log('BLOCK_FLOW_OBSERVATIONS=' + JSON.stringify(envelope('PASS')))).catch(error => { console.log('BLOCK_FLOW_OBSERVATIONS=' + JSON.stringify({ ...envelope('FAIL'), error: String(error), errorDetails: { name: error?.name, message: error?.message, issues: error?.issues, stack: error?.stack } })); console.error(error); process.exitCode = 1; });
