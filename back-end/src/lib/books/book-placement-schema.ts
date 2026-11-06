import { z } from 'zod';

export const BookCharacterPlacementEntrySchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number().positive(),
  rotateDeg: z.number().optional(),
  zIndex: z.number().int().positive().optional(),
  anchorXPercent: z.number().optional(),
  anchorYPercent: z.number().optional(),
});

export const V3PlacementOverrideSchema = BookCharacterPlacementEntrySchema.extend({
  left: z.number().finite().min(-100000).max(100000),
  top: z.number().finite().min(-100000).max(100000),
  width: z.number().positive().max(100000),
  rotateDeg: z.number().min(-360).max(360).optional(),
  zIndex: z.number().int().min(0).max(1000).optional(),
  anchorXPercent: z.number().min(0).max(100).optional(),
  anchorYPercent: z.number().min(0).max(100).optional(),
});

/** Use the frozen recipe version; historical overrides keep their original parser. */
export function bookPlacementOverrideSchema(renderingSchema?: string) {
  return renderingSchema === 'lhb.book-render@v3' ? V3PlacementOverrideSchema : BookCharacterPlacementEntrySchema;
}
