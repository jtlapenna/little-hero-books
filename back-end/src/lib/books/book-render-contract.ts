import { z } from 'zod';

export const BookAssetKeySchema = z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/).refine(
  (key) => !key.split('/').includes('..') && !key.includes('//'), 'Asset keys must be relative R2 keys',
);
const Identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const BookLayerLayoutSchema = z.object({
  units: z.enum(['px', 'percent']),
  referenceCanvas: z.object({ w: z.number().positive().max(100000), h: z.number().positive().max(100000) }).strict().optional(),
  rounding: z.enum(['none', 'nearest']).optional(),
  anchorXPercent: z.number().min(0).max(100).optional(), anchorYPercent: z.number().min(0).max(100).optional(),
  originXPercent: z.number().min(0).max(100).optional(), originYPercent: z.number().min(0).max(100).optional(),
  scale: z.number().positive().max(10).optional(),
}).strict().refine(value => !(value.units === 'percent' && (value.referenceCanvas || value.rounding)) &&
  (!value.rounding || Boolean(value.referenceCanvas)), 'Layout coordinate settings conflict');
export const BookLayerPlacementSchema = z.object({
  layout: BookLayerLayoutSchema.optional(),
  left: z.number().min(-100000).max(100000), top: z.number().min(-100000).max(100000),
  width: z.number().positive().max(100000), height: z.number().positive().max(100000).optional(),
  rotateDeg: z.number().min(-360).max(360).optional(), flipX: z.boolean().optional(),
  zIndex: z.number().int().min(0).max(1000).optional(),
});
export const BookLayerClipSchema = z.object({
  left: z.number().min(0).max(1), top: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
  cornerRadiusPercent: z.number().min(0).max(50).optional(),
}).refine(value => value.left + value.width <= 1 && value.top + value.height <= 1,
  'Layer clip must fit inside the image frame');
const LayerBase = { id: Identifier, placement: BookLayerPlacementSchema, clip: BookLayerClipSchema.optional() };
export const BookPageLayerSchema = z.discriminatedUnion('kind', [
  z.object({ ...LayerBase, kind: z.literal('pose'), poseId: Identifier, poseNumber: z.number().int().min(0).max(99) }),
  z.object({ ...LayerBase, kind: z.literal('overlay'), assetSlot: Identifier, effect: z.enum(['cover-shadow']).optional() }),
  z.object({ ...LayerBase, kind: z.literal('animal'), role: Identifier }),
]);
export const BookCopyBlockSchema = z.object({
  id: Identifier.optional(),
  text: z.string(), placement: BookLayerPlacementSchema,
  fontSize: z.number().positive().max(512), lineHeight: z.number().min(0.5).max(4).default(1.3),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/).default('#fff4d7'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  backgroundColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
  padding: z.number().min(0).max(256).default(0),
  edgeStyle: z.enum(['stroke', 'soft-shadow', 'cover-shadow']).optional(),
  nameFit: z.object({
    thresholdChars: z.number().int().min(1).max(100),
    minScale: z.number().positive().max(1),
  }).optional(),
  longName: z.object({
    minChars: z.number().int().min(1).max(100),
    placement: BookLayerPlacementSchema.optional(),
    fontSize: z.number().positive().max(512).optional(),
    keepNameTogether: z.boolean().optional(),
  }).optional(),
  flow: z.never().optional(),
});
export const BOOK_COPY_TOKENS = new Set(['child name', 'hometown', 'animal guide', 'animal clue', 'animal clues', 'object pronoun', 'subject pronoun', 'possessive pronoun', 'dedication message']);
const FlowRunSchema = z.object({
  keepWithNext: z.boolean().optional(),
  atomicPhrase: z.literal(true).optional(),
  text: z.string().min(1).max(8000)
    .regex(/^(?:[^\[\]\r\n]|\[[^\[\]\r\n]+\])*$/, 'Tokens must remain within one run')
    .refine(value => !/<(?:\/?[a-z]|!|\?)[^>]*>/i.test(value), 'Flow templates must not contain HTML markup')
    .refine(value => (value.match(/\[[^\]]+\]/g) ?? []).every(token => BOOK_COPY_TOKENS.has(token.slice(1, -1).toLowerCase())), 'Unknown copy token'),
  style: z.object({
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
    sizeRatio: z.number().min(0.5).max(2).optional(),
    rotateDeg: z.number().min(-15).max(15).optional(),
  }).strict().optional(),
}).strict().refine(run => run.atomicPhrase || !run.style?.rotateDeg || !/[\s\[\]]/.test(run.text),
  'Rotated emphasis must be one literal word unless it is an atomic phrase')
  .refine(run => !run.atomicPhrase || (run.text.length <= 256 && !/\p{Surrogate}/u.test(run.text) && !/[\r\n\v\f\u0085\u2028\u2029]/.test(run.text)
    && (run.text.match(/\[[^\]]+\]/g) ?? []).every(token => ['animal guide', 'animal clue', 'animal clues'].includes(token.slice(1, -1).toLowerCase()))),
  'Atomic phrases must be bounded and may contain guide tokens only');
function punctuationBound(runs: Array<{ text: string; atomicPhrase?: true; keepWithNext?: boolean }>): boolean {
  return runs.every((run, index) => {
    if (!run.atomicPhrase) return true;
    let before = index - 1;
    while (before >= 0 && !runs[before].text.trim()) before--;
    if (before >= 0 && /^[\s\p{P}]+$/u.test(runs[before].text.replace(/\[[^\]]+\]/g, 'X')) && runs.slice(before, index).some(item => item.keepWithNext !== true)) return false;
    let after = index + 1;
    while (after < runs.length && !runs[after].text.trim()) after++;
    return after >= runs.length || !/^[\s\p{P}]+$/u.test(runs[after].text.replace(/\[[^\]]+\]/g, 'X')) || runs.slice(index, after).every(item => item.keepWithNext === true);
  });
}
export const BookFlowCopyBlockSchema = BookCopyBlockSchema.omit({ flow: true, nameFit: true, longName: true }).extend({
  id: Identifier,
  placement: BookLayerPlacementSchema.extend({ height: z.number().positive().max(100000) }).strict(),
  nameFit: z.never().optional(),
  longName: z.never().optional(),
  flow: z.object({ paragraphs: z.array(z.object({ runs: z.array(FlowRunSchema).min(1).max(100) }).strict()
    .refine(paragraph => paragraph.runs.length === 0 || !Object.hasOwn(paragraph.runs[paragraph.runs.length - 1], 'keepWithNext'), 'The last run cannot have keepWithNext')
    .refine(paragraph => punctuationBound(paragraph.runs), 'Adjacent punctuation must stay with an atomic phrase')).min(1).max(100) }).strict(),
}).strict().refine(block => block.text.length <= 8000 && block.text === block.flow.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n'),
  'Flow text must equal the concatenated paragraph templates')
  .refine(block => block.padding * 2 < Math.min(block.placement.width, block.placement.height), 'Flow padding must leave a text area')
  .refine(block => !/<(?:\/?[a-z]|!|\?)[^>]*>/i.test(block.text), 'Flow templates must not contain HTML markup');
const BookV2CopyBlockSchema = z.union([BookFlowCopyBlockSchema, BookCopyBlockSchema]);
export const BookReadingAreaSchema = z.object({
  left: z.number().min(-100000).max(100000), top: z.number().min(-100000).max(100000),
  width: z.number().positive().max(100000), height: z.number().positive().max(100000),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/), opacity: z.number().min(0).max(1),
  feather: z.number().min(0).max(1000),
});
const recipeFields = {
  pagePreviewTemplateId: z.string().min(1),
  poses: z.record(Identifier, z.object({ poseNumber: z.number().int().min(0).max(99), referenceKey: BookAssetKeySchema })),
  readingAreas: z.record(Identifier, z.array(BookReadingAreaSchema)).optional(),
  animals: z.record(Identifier, z.record(Identifier, BookAssetKeySchema)),
};
const recipeFor = <T extends z.ZodType>(copy: T) => ({
  ...recipeFields,
  copy: z.record(Identifier, z.union([copy, z.array(copy).min(1)])),
  covers: z.record(Identifier, z.object({ backgroundSlot: Identifier, templateId: z.string().min(1), layers: z.array(BookPageLayerSchema), texts: z.array(copy) })),
});
export const BOOK_V3_COPY_TOKENS = new Set([...BOOK_COPY_TOKENS, 'child name possessive', 'hometown return']);
export const BookV3TypographySchema = z.object({
  trackingPx: z.number().finite().min(-20).max(100).optional(),
  verticalAlign: z.enum(['top', 'center', 'bottom']).optional(),
  wrap: z.enum(['pre-line', 'balanced', 'single-line']).optional(),
  case: z.enum(['none', 'uppercase']).optional(),
}).strict();
const BookV3BoxFitSchema = z.object({
  minFontSize: z.number().positive().max(512),
  softMinFontSize: z.number().positive().max(512).optional(),
  maxFontSize: z.number().positive().max(512),
}).strict().refine(value => value.minFontSize <= value.maxFontSize &&
  (value.softMinFontSize === undefined || value.softMinFontSize >= value.minFontSize && value.softMinFontSize <= value.maxFontSize),
  'Single-line fit font bounds are inconsistent');
const BookV3WidthFitSchema = z.object({
  mode: z.literal('width-only'),
  maxFontSize: z.number().positive().max(512).optional(),
  softMinFontSize: z.number().positive().max(512).optional(),
}).strict();
const BookV3FitDispatcher = z.core.$constructor<z.ZodUnion<[typeof BookV3BoxFitSchema, typeof BookV3WidthFitSchema]>>('BookV3Fit', (instance, definition) => {
  const assertCanonicalOptions = () => {
    if (definition.type !== 'union' || !Array.isArray(definition.options) || definition.options.length !== 2 ||
      definition.options[0] !== BookV3BoxFitSchema || definition.options[1] !== BookV3WidthFitSchema) {
      throw new Error('V3 fit dispatcher options must remain canonical');
    }
  };
  assertCanonicalOptions();
  z.ZodUnion.init(instance, definition);
  instance._zod.parse = (payload, context) => {
    assertCanonicalOptions();
    const value: unknown = payload.value;
    const widthOnly = value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.hasOwn(value, 'mode') && (value as { mode?: unknown }).mode === 'width-only';
    return definition.options[widthOnly ? 1 : 0]._zod.run(payload, context);
  };
});
export const BookV3FitSchema = new BookV3FitDispatcher({ type: 'union', options: [BookV3BoxFitSchema, BookV3WidthFitSchema] });

const V3CopyFields = {
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  text: z.string().max(8000),
  fontSize: z.number().positive().max(512), lineHeight: z.union([z.number().min(0.5).max(4), z.literal('normal')]),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  align: z.enum(['left', 'center', 'right']),
  padding: z.number().min(0).max(256),
  backgroundColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
  typography: BookV3TypographySchema.optional(), fit: BookV3FitSchema.optional(),
  textFormat: z.enum(['plain', 'legacy-lines']).optional(),
  omitIfEmpty: z.boolean().optional(),
};
function validV3TextBox(value: { typography?: z.infer<typeof BookV3TypographySchema>; fit?: z.infer<typeof BookV3FitSchema>; padding: number }, height?: number): boolean {
  if (value.fit && 'mode' in value.fit && value.fit.mode === 'width-only') {
    return height === undefined && value.typography?.wrap === 'single-line' &&
      (value.typography.verticalAlign === undefined || value.typography.verticalAlign === 'top');
  }
  if ((value.fit || value.typography?.verticalAlign && value.typography.verticalAlign !== 'top') && height === undefined) return false;
  return !value.fit || value.typography?.wrap === 'single-line';
}
export const BookV3CopyBlockSchema = z.object({ ...V3CopyFields, placement: BookLayerPlacementSchema }).strict()
  .refine(value => validV3TextBox(value, value.placement.height), 'Copy alignment and fit require a valid explicit box; fit requires single-line wrap')
;
export type BookV3CopyBlock = z.infer<typeof BookV3CopyBlockSchema>;
const V3Spacing = z.number().min(0).max(2048);
const BookV3PaddingSchema = z.object({ top: V3Spacing, right: V3Spacing, bottom: V3Spacing, left: V3Spacing }).strict();
const BookV3FrameSchema = z.object({
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/), opacity: z.number().min(0).max(1),
  width: z.number().min(0).max(256), radius: z.number().min(0).max(2048),
}).strict();
const BookV3BlockBoxSchema = z.object({
  widthMode: z.enum(['auto', 'fill']).optional(),
  maxWidth: z.number().finite().positive().max(100000).optional(),
  inlineMargin: z.enum(['zero', 'auto']).optional(),
  position: z.enum(['static', 'relative']).optional(),
}).strict();
const BookV3BlockTextSchema = z.object({ whiteSpace: z.enum(['normal', 'pre-line']) }).strict();
const V3NodeBase = {
  id: V3CopyFields.id, width: z.number().positive().max(100000).optional(),
  spacingBefore: V3Spacing.optional(), spacingAfter: V3Spacing.optional(),
  blockBox: BookV3BlockBoxSchema.optional(),
};
const BookV3StackTextSchema = z.object({
  ...V3CopyFields, ...V3NodeBase, kind: z.literal('text'),
  boxHeight: z.number().positive().max(100000).optional(),
  blockText: BookV3BlockTextSchema.optional(),
}).strict().refine(value => validV3TextBox(value, value.boxHeight), 'Flow text alignment and fit require a valid explicit box')
  .refine(value => (value.boxHeight === undefined || value.boxHeight > value.padding * 2) &&
    (value.width === undefined || value.width > value.padding * 2), 'Flow text padding must leave a text area');
export type BookV3StackText = z.infer<typeof BookV3StackTextSchema>;
export type BookV3Stack = {
  kind: 'stack'; id: string; width?: number; spacingBefore?: number; spacingAfter?: number;
  blockBox?: z.infer<typeof BookV3BlockBoxSchema>; flowMode?: 'block'; blockTextAlign?: 'left' | 'center' | 'right';
  padding?: z.infer<typeof BookV3PaddingSchema>; frame?: z.infer<typeof BookV3FrameSchema>;
  gap?: number; alignment?: 'start' | 'center' | 'end'; children: Array<BookV3StackText | BookV3Stack>;
};
function stackNodeSchema(depth: number): z.ZodType<BookV3Stack> {
  return z.object({
    ...V3NodeBase, kind: z.literal('stack'), padding: BookV3PaddingSchema.optional(),
    frame: BookV3FrameSchema.optional(), gap: V3Spacing.optional(),
    alignment: z.enum(['start', 'center', 'end']).optional(),
    flowMode: z.literal('block').optional(), blockTextAlign: z.enum(['left', 'center', 'right']).optional(),
    children: z.array(depth < 4 ? z.union([BookV3StackTextSchema, z.lazy(() => stackNodeSchema(depth + 1))]) : BookV3StackTextSchema).min(1).max(64),
  }).strict();
}
export type BookV3RootStack = { id: string; placement: z.infer<typeof BookLayerPlacementSchema>; children: BookV3Stack['children']; padding?: BookV3Stack['padding']; gap?: number; alignment?: BookV3Stack['alignment']; frame?: BookV3Stack['frame']; flowMode?: BookV3Stack['flowMode']; blockTextAlign?: BookV3Stack['blockTextAlign'] };
function validateBlockContext(root: BookV3RootStack, context: z.RefinementCtx): void {
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  const visit = (value: unknown, path: Array<string | number>, parentBlock: boolean, isRoot = false): void => {
    if (!record(value)) return;
    const issue = (field: string[], message: string) => context.addIssue({ code: 'custom', path: [...path, ...field], message });
    const block = value.flowMode === 'block';
    if (Object.hasOwn(value, 'blockTextAlign') && !block) issue(['blockTextAlign'], 'Block text alignment requires block flow mode');
    if (block) {
      if (value.gap !== undefined && value.gap !== 0) issue(['gap'], 'Block flow does not allow a nonzero gap');
      if (Object.hasOwn(value, 'alignment')) issue(['alignment'], 'Block flow does not allow flex alignment');
    }
    if (!isRoot) {
      if (!parentBlock) {
        if (Object.hasOwn(value, 'blockBox')) issue(['blockBox'], 'Block box requires a direct block-flow parent');
        if (Object.hasOwn(value, 'blockText')) issue(['blockText'], 'Block text requires a direct block-flow parent');
      } else {
        if (record(value.blockBox) && value.blockBox.widthMode !== undefined && value.width !== undefined) {
          issue(['blockBox', 'widthMode'], 'Block width mode conflicts with numeric width');
        }
        if (value.kind === 'text') {
          if (!record(value.blockText)) issue(['blockText'], 'Block-flow text requires an explicit whitespace mode');
          if (record(value.blockBox) && typeof value.blockBox.maxWidth === 'number' && typeof value.padding === 'number' &&
            value.blockBox.maxWidth <= value.padding * 2) {
            issue(['blockBox', 'maxWidth'], 'Block text maximum width must leave a text area');
          }
          if (record(value.typography) && Object.hasOwn(value.typography, 'wrap')) {
            issue(['typography', 'wrap'], 'Block text does not allow typography wrap');
          }
          if (value.fit !== undefined) issue(['fit'], 'Block text does not allow fit');
          if (value.boxHeight !== undefined) issue(['boxHeight'], 'Block text does not allow an explicit height');
          if (record(value.typography) && value.typography.verticalAlign !== undefined && value.typography.verticalAlign !== 'top') {
            issue(['typography', 'verticalAlign'], 'Block text requires top vertical alignment');
          }
        }
      }
    }
    if (Array.isArray(value.children)) value.children.forEach((child, index) => visit(child, [...path, 'children', index], block));
  };
  visit(root, [], false, true);
}
const BookV3RootStackSchema: z.ZodType<BookV3RootStack> = z.object({
  id: V3CopyFields.id, placement: BookLayerPlacementSchema,
  children: z.array(z.union([BookV3StackTextSchema, stackNodeSchema(2)])).min(1).max(64),
  padding: BookV3PaddingSchema.optional(), gap: V3Spacing.optional(),
  alignment: z.enum(['start', 'center', 'end']).optional(), frame: BookV3FrameSchema.optional(),
  flowMode: z.literal('block').optional(), blockTextAlign: z.enum(['left', 'center', 'right']).optional(),
}).strict().superRefine(validateBlockContext);
const BookV3StacksSchema = z.preprocess((value, context) => {
  if (!Array.isArray(value)) return value;
  let count = 0;
  const visit = (node: unknown, depth: number): boolean => {
    if (++count > 64 || depth > 4) return false;
    if (node && typeof node === 'object' && 'children' in node) {
      const children = (node as { children: unknown }).children;
      if (Array.isArray(children) && !children.every(child => visit(child, depth + 1))) return false;
    }
    return true;
  };
  if (value.length > 8 || !value.every(root => visit(root, 1))) {
    context.addIssue({ code: 'custom', message: 'Cover stacks exceed depth, root or node limits' });
    return z.NEVER;
  }
  return value;
}, z.array(BookV3RootStackSchema).max(8));
export const BookRenderRecipeV3Schema = z.object({
  schema: z.literal('lhb.book-render@v3'),
  pagePreviewTemplateId: z.string().min(1),
  poses: z.record(V3CopyFields.id, z.object({ poseNumber: z.number().int().min(0).max(99), referenceKey: BookAssetKeySchema }).strict()),
  animals: z.record(V3CopyFields.id, z.record(V3CopyFields.id, BookAssetKeySchema)),
  fontRoles: z.array(V3CopyFields.id).min(1).max(4).refine(roles => new Set(roles).size === roles.length, 'Font roles must be unique').optional(),
  copy: z.record(V3CopyFields.id, z.union([BookV3CopyBlockSchema, z.array(BookV3CopyBlockSchema).min(1).max(20)])),
  covers: z.record(V3CopyFields.id, z.object({
    backgroundSlot: V3CopyFields.id, templateId: z.string().min(1),
    layers: z.array(BookPageLayerSchema), texts: z.array(BookV3CopyBlockSchema).max(20),
    stacks: BookV3StacksSchema.optional(),
  }).strict()),
}).strict();

export const BookRenderRecipeSchema = z.discriminatedUnion('schema', [
  z.object({ schema: z.literal('lhb.book-render@v1'), ...recipeFor(BookCopyBlockSchema) }),
  z.object({ schema: z.literal('lhb.book-render@v2'), ...recipeFor(BookV2CopyBlockSchema) }),
  BookRenderRecipeV3Schema,
]);
export type BookPageLayer = z.infer<typeof BookPageLayerSchema>;
export type BookCopyBlock = z.infer<typeof BookV2CopyBlockSchema>;
export type BookRenderRecipe = z.infer<typeof BookRenderRecipeSchema>;

export type BookLayerPlacement = z.infer<typeof BookLayerPlacementSchema>;
