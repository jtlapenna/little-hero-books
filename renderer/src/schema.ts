
import { z } from "zod";

export const PageSchema = z.object({
  id: z.string(),
  text: z.string().max(450), // Reduced to fit layout constraints
  illustration_prompt: z.string().max(280)
});

export const ManuscriptSchema = z.object({
  title: z.string().max(60), // Shorter for book title
  pages: z.array(PageSchema).length(14), // Exactly 14 interior pages
  meta: z.object({
    reading_age: z.string().optional(),
    theme: z.string().optional()
  }).optional()
});

export const ChildSchema = z.object({
  name: z.string().min(1).max(20),
  age: z.number().int().min(0).max(10),
  hair: z.enum(["black", "brown", "blonde", "red", "other"]),
  skin: z.enum(["light", "medium", "dark", "olive", "tan"]),
  pronouns: z.string().optional().default("they/them")
});

export const OptionsSchema = z.object({
  favorite_animal: z.string().optional(),
  favorite_food: z.string().optional(), 
  favorite_color: z.string().optional(),
  hometown: z.string().optional(),
  occasion: z.enum(["birthday", "holiday", "milestone", "general"]).optional(),
  dedication: z.string().max(500).optional()
});

export const ShippingSchema = z.object({
  name: z.string(),
  address1: z.string(),
  address2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  country: z.string().default("US"),
  phone: z.string().optional(),
  email: z.string().email().optional()
});

export const RenderRequestSchema = z.object({
  orderId: z.string(),
  spec: z.object({
    trim: z.string().default("8x10"),
    bleed: z.string().default("0.125in"),
    pages: z.number().default(16), // 14 interior + 2 covers
    color: z.enum(["CMYK", "RGB"]).default("CMYK"),
    binding: z.enum(["softcover", "hardcover"]).default("softcover")
  }),
  manuscript: ManuscriptSchema,
  child: ChildSchema,
  options: OptionsSchema.optional(),
  shipping: ShippingSchema.optional(),
  assets: z.object({
    images: z.array(z.object({ 
      id: z.string(), 
      url: z.string().url() 
    })).optional()
  }).optional()
});
