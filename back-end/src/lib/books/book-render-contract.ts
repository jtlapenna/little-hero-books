import { z } from 'zod';

export const BookAssetKeySchema = z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/).refine(
  (key) => !key.split('/').includes('..') && !key.includes('//'), 'Asset keys must be relative R2 keys',
);
const Identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const BookLayerPlacementSchema = z.object({
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
export const BookRenderRecipeSchema = z.object({
  schema: z.literal('lhb.book-render@v1'),
  pagePreviewTemplateId: z.string().min(1),
  poses: z.record(Identifier, z.object({ poseNumber: z.number().int().min(0).max(99), referenceKey: BookAssetKeySchema })),
  copy: z.record(Identifier, BookCopyBlockSchema),
  animals: z.record(Identifier, z.record(Identifier, BookAssetKeySchema)),
  covers: z.record(Identifier, z.object({ backgroundSlot: Identifier, templateId: z.string().min(1), layers: z.array(BookPageLayerSchema), texts: z.array(BookCopyBlockSchema) })),
});
export type BookPageLayer = z.infer<typeof BookPageLayerSchema>;
export type BookCopyBlock = z.infer<typeof BookCopyBlockSchema>;
export type BookRenderRecipe = z.infer<typeof BookRenderRecipeSchema>;
