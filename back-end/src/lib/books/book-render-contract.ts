import { z } from 'zod';
export const BOOK_COPY_TOKENS = new Set(['child name', 'hometown', 'animal guide', 'animal clue', 'animal clues', 'object pronoun', 'subject pronoun', 'possessive pronoun', 'dedication message']);

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
const LayerBase = { id: Identifier, placement: BookLayerPlacementSchema };
export const BookPageLayerSchema = z.discriminatedUnion('kind', [
  z.object({ ...LayerBase, kind: z.literal('pose'), poseId: Identifier, poseNumber: z.number().int().min(0).max(99) }),
  z.object({ ...LayerBase, kind: z.literal('overlay'), assetSlot: Identifier }),
  z.object({ ...LayerBase, kind: z.literal('animal'), role: Identifier }),
]);
export const BookCopyBlockSchema = z.object({
  text: z.string(), placement: BookLayerPlacementSchema,
  fontSize: z.number().positive().max(512), lineHeight: z.number().min(1).max(4).default(1.3),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/).default('#fff4d7'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  backgroundColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
  padding: z.number().min(0).max(256).default(0),
});
export const BOOK_V3_COPY_TOKENS = new Set([...BOOK_COPY_TOKENS, 'child name possessive', 'hometown return']);
export const BookV3TypographySchema = z.object({
  trackingPx: z.number().finite().min(-20).max(100).optional(),
  verticalAlign: z.enum(['top', 'center', 'bottom']).optional(),
  wrap: z.enum(['pre-line', 'balanced', 'single-line']).optional(),
  case: z.enum(['none', 'uppercase']).optional(),
}).strict();
export const BookV3FitSchema = z.object({
  minFontSize: z.number().positive().max(512),
  softMinFontSize: z.number().positive().max(512).optional(),
  maxFontSize: z.number().positive().max(512),
}).strict().refine(value => value.minFontSize <= value.maxFontSize &&
  (value.softMinFontSize === undefined || value.softMinFontSize >= value.minFontSize && value.softMinFontSize <= value.maxFontSize),
  'Single-line fit font bounds are inconsistent');
const V3CopyFields = {
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  text: z.string().max(8000),
  fontSize: z.number().positive().max(512), lineHeight: z.number().min(0.5).max(4),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  align: z.enum(['left', 'center', 'right']),
  padding: z.number().min(0).max(256),
  backgroundColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
  typography: BookV3TypographySchema.optional(), fit: BookV3FitSchema.optional(),
};
function validV3TextBox(value: { typography?: z.infer<typeof BookV3TypographySchema>; fit?: z.infer<typeof BookV3FitSchema>; padding: number }, height?: number): boolean {
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
const V3NodeBase = {
  id: V3CopyFields.id, width: z.number().positive().max(100000).optional(),
  spacingBefore: V3Spacing.optional(), spacingAfter: V3Spacing.optional(),
};
const BookV3StackTextSchema = z.object({
  ...V3CopyFields, ...V3NodeBase, kind: z.literal('text'),
  boxHeight: z.number().positive().max(100000).optional(),
}).strict().refine(value => validV3TextBox(value, value.boxHeight), 'Flow text alignment and fit require a valid explicit box')
  .refine(value => (value.boxHeight === undefined || value.boxHeight > value.padding * 2) &&
    (value.width === undefined || value.width > value.padding * 2), 'Flow text padding must leave a text area');
export type BookV3StackText = z.infer<typeof BookV3StackTextSchema>;
export type BookV3Stack = {
  kind: 'stack'; id: string; width?: number; spacingBefore?: number; spacingAfter?: number;
  padding?: z.infer<typeof BookV3PaddingSchema>; frame?: z.infer<typeof BookV3FrameSchema>;
  gap?: number; alignment?: 'start' | 'center' | 'end'; children: Array<BookV3StackText | BookV3Stack>;
};
function stackNodeSchema(depth: number): z.ZodType<BookV3Stack> {
  return z.object({
    ...V3NodeBase, kind: z.literal('stack'), padding: BookV3PaddingSchema.optional(),
    frame: BookV3FrameSchema.optional(), gap: V3Spacing.optional(),
    alignment: z.enum(['start', 'center', 'end']).optional(),
    children: z.array(depth < 4 ? z.union([BookV3StackTextSchema, z.lazy(() => stackNodeSchema(depth + 1))]) : BookV3StackTextSchema).min(1).max(64),
  }).strict();
}
export type BookV3RootStack = { id: string; placement: z.infer<typeof BookLayerPlacementSchema>; children: BookV3Stack['children']; padding?: BookV3Stack['padding']; gap?: number; alignment?: BookV3Stack['alignment']; frame?: BookV3Stack['frame'] };
const BookV3RootStackSchema: z.ZodType<BookV3RootStack> = z.object({
  id: V3CopyFields.id, placement: BookLayerPlacementSchema,
  children: z.array(z.union([BookV3StackTextSchema, stackNodeSchema(2)])).min(1).max(64),
  padding: BookV3PaddingSchema.optional(), gap: V3Spacing.optional(),
  alignment: z.enum(['start', 'center', 'end']).optional(), frame: BookV3FrameSchema.optional(),
}).strict();
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

const BookRenderRecipeV1Schema = z.object({
  schema: z.literal('lhb.book-render@v1'),
  pagePreviewTemplateId: z.string().min(1),
  poses: z.record(Identifier, z.object({ poseNumber: z.number().int().min(0).max(99), referenceKey: BookAssetKeySchema })),
  copy: z.record(Identifier, BookCopyBlockSchema),
  animals: z.record(Identifier, z.record(Identifier, BookAssetKeySchema)),
  covers: z.record(Identifier, z.object({ backgroundSlot: Identifier, templateId: z.string().min(1), layers: z.array(BookPageLayerSchema), texts: z.array(BookCopyBlockSchema) })),
});
export const BookRenderRecipeSchema = z.discriminatedUnion('schema', [BookRenderRecipeV1Schema, BookRenderRecipeV3Schema]);
export type BookPageLayer = z.infer<typeof BookPageLayerSchema>;
export type BookCopyBlock = z.infer<typeof BookCopyBlockSchema>;
export type BookRenderRecipe = z.infer<typeof BookRenderRecipeSchema>;

export type BookLayerPlacement = z.infer<typeof BookLayerPlacementSchema>;
