import { z } from 'zod';
import { BookCharacterPlacementEntrySchema, bookPlacementOverrideSchema } from './book-placement-schema';
import { BookPageLayerSchema, BookRenderRecipeSchema } from './book-render-contract';

export const BookPageTypeSchema = z.enum([
  'title',
  'blank',
  'dedication',
  'story',
  'ending',
  'credits',
]);

export const MeasurementInchesSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
});

export const MeasurementPixelsSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

export { BookCharacterPlacementEntrySchema } from './book-placement-schema';

function characterPlacementConfigSchema<Entry extends z.ZodTypeAny>(entry: Entry) {
  return z.object({
    defaultByStoryPage: z.record(z.string(), entry).default({}),
    overridesByFormat: z.record(z.string(), z.record(z.string(), entry).default({})).default({}),
  });
}
function singlePlacementConfigSchema<Entry extends z.ZodTypeAny>(entry: Entry) {
  return z.object({ default: entry.nullable().default(null), overridesByFormat: z.record(z.string(), entry).default({}) });
}
export const BookCharacterPlacementConfigSchema = characterPlacementConfigSchema(BookCharacterPlacementEntrySchema);
export const BookSinglePlacementConfigSchema = singlePlacementConfigSchema(BookCharacterPlacementEntrySchema);

// Structural config shape. The rendering boundary applies the recipe-specific validator.
const ConfigPlacementEntrySchema = BookCharacterPlacementEntrySchema.extend({ zIndex: z.number().int().optional() });
const ConfigPlacementMapSchema = characterPlacementConfigSchema(ConfigPlacementEntrySchema);
const ConfigSinglePlacementSchema = singlePlacementConfigSchema(ConfigPlacementEntrySchema);

export const BookPageConfigSchema = z.object({
  layers: z.array(BookPageLayerSchema).optional(),
  index: z.number().int().nonnegative(),
  id: z.string().min(1),
  label: z.string().regex(/^p\d{2,}$/),
  type: BookPageTypeSchema,
  storyPageNumber: z.number().int().positive().nullable(),
  backgroundSlot: z.string().min(1).nullable(),
  poseNumber: z.number().int().nonnegative().nullable(),
  overlaySlot: z.string().min(1).nullable(),
  required: z.boolean(),
});

export const LuluPrintConfigSchema = z.object({
  provider: z.literal('lulu'),
  podPackageId: z.string().min(1),
  color: z.string().min(1),
  stock: z.string().min(1),
  binding: z.string().min(1),
  coverFinish: z.string().min(1),
  defaultQuantity: z.number().int().positive(),
});

export const GelatoShipmentMethodRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('uid'), uid: z.string().min(1) }).strict(),
  z.object({
    kind: z.literal('type'),
    type: z.string().min(1),
    uidPriority: z.array(z.string().min(1)).optional(),
  }).strict(),
]);

export const GelatoPrintConfigSchema = z.object({
  provider: z.literal('gelato'),
  productUid: z.string().min(1),
  innerPageCount: z.number().int().positive(),
  apiPageCount: z.number().int().positive(),
  apiPageCountVerified: z.boolean(),
  expectedPdfPageCount: z.number().int().positive(),
  printGeometryMm: z.object({
    trim: z.object({ w: z.number().positive(), h: z.number().positive() }).strict(),
    interiorCanvas: z.object({ w: z.number().positive(), h: z.number().positive() }).strict(),
    bleed: z.number().positive(),
    coverCanvas: z.object({ w: z.number().positive(), h: z.number().positive() }).strict(),
    backPanel: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), w: z.number().positive(), h: z.number().positive() }).strict(),
    spine: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), w: z.number().positive(), h: z.number().positive() }).strict(),
    frontPanel: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), w: z.number().positive(), h: z.number().positive() }).strict(),
  }).strict(),
  defaultQuantity: z.number().int().positive(),
  shipmentMethodPolicy: z.object({
    version: z.number().int().positive(),
    destinationCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
    tiers: z.record(z.string().min(1), GelatoShipmentMethodRuleSchema),
  }).strict(),
}).strict().superRefine((print, context) => {
  if (print.expectedPdfPageCount !== print.innerPageCount + 3) {
    context.addIssue({ code: 'custom', path: ['expectedPdfPageCount'], message: 'Gelato PDF requires cover spread and two blanks in addition to inner pages' });
  }
  const geometry = print.printGeometryMm;
  if (geometry.interiorCanvas.w !== geometry.trim.w + geometry.bleed * 2 ||
      geometry.interiorCanvas.h !== geometry.trim.h + geometry.bleed * 2) {
    context.addIssue({ code: 'custom', path: ['printGeometryMm'], message: 'Gelato interior canvas must equal trim plus bleed on all sides' });
  }
  if (geometry.backPanel.x + geometry.backPanel.w !== geometry.spine.x ||
      geometry.spine.x + geometry.spine.w !== geometry.frontPanel.x ||
      geometry.backPanel.y !== geometry.spine.y || geometry.frontPanel.y !== geometry.spine.y ||
      geometry.backPanel.h !== geometry.spine.h || geometry.frontPanel.h !== geometry.spine.h ||
      geometry.frontPanel.x + geometry.frontPanel.w + geometry.bleed !== geometry.coverCanvas.w ||
      geometry.backPanel.y + geometry.backPanel.h + geometry.bleed !== geometry.coverCanvas.h) {
    context.addIssue({ code: 'custom', path: ['printGeometryMm'], message: 'Gelato cover panels do not align with the configured bleed canvas' });
  }
});

export const BookPrintConfigSchema = z.discriminatedUnion('provider', [
  LuluPrintConfigSchema,
  GelatoPrintConfigSchema,
]);

export type BookPrintConfig = z.infer<typeof BookPrintConfigSchema>;

export const BookFormatConfigSchema = z.object({
  formatId: z.string().min(1),
  channels: z.array(z.string().min(1)).min(1),
  trimIn: MeasurementInchesSchema,
  bleedIn: MeasurementInchesSchema,
  interior: z.object({
    expectedPageCount: z.number().int().positive(),
    pageSequence: z.array(BookPageConfigSchema).min(1),
  }),
  cover: z.object({
    spreadSizeIn: MeasurementInchesSchema,
  }),
  templates: z.object({
    pdfMonkeyInteriorTemplateId: z.string().min(1),
    pdfMonkeyCoverTemplateId: z.string().min(1),
  }),
  print: BookPrintConfigSchema,
});

export const BookQaConfigSchema = z.object({
  pose: z
    .object({
      requiredPoseNumbers: z.array(z.number().int().nonnegative()),
      perPoseExpectations: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    })
    .default({
      requiredPoseNumbers: [],
      perPoseExpectations: {},
    }),
  backgroundRemoval: z
    .object({
      faceDefectReviewEnabled: z.boolean().default(true),
      compositeQaEnabled: z.boolean().default(true),
    })
    .default({
      faceDefectReviewEnabled: true,
      compositeQaEnabled: true,
    }),
  finalPdf: z
    .object({
      interior: z.object({
        expectedPreviewLabelPattern: z.string().min(1),
        minBytesPerPage: z.number().int().positive(),
      }),
      cover: z.object({
        expectedPageCount: z.number().int().positive(),
      }),
    })
    .default({
      interior: {
        expectedPreviewLabelPattern: 'p{index:02d}',
        minBytesPerPage: 30000,
      },
      cover: {
        expectedPageCount: 1,
      },
    }),
});

export const BookConfigSchema = z.object({
  schema: z.literal('lhb.book-config@v1'),
  bookId: z.string().min(1),
  slug: z.string().min(1),
  displayName: z.string().min(1),
  status: z.enum(['draft', 'active', 'archived']),
  version: z.number().int().positive(),
  defaultFormatId: z.string().min(1),
  intake: z.object({
    titleTemplate: z.string().trim().min(1).max(1000).optional(),
    bookType: z.string().trim().min(1).max(100).optional(),
    characterProfile: z.literal('storybook-child@v1').optional(),
    customization: z.object({
      childNameMaxLength: z.number().int().min(1).max(200).optional(),
      dedicationMaxLength: z.number().int().min(1).max(10000).optional(),
    }).strict().optional(),
  }).strict().optional(),
  formats: z.record(z.string(), BookFormatConfigSchema),
  assets: z.object({
    assetRoot: z.string().min(1),
    fonts: z.record(z.string(), z.string().min(1)),
    backgrounds: z.record(z.string(), z.string().min(1)),
    overlays: z.record(z.string(), z.string().min(1)).default({}),
    preview: z
      .object({
        baseCharactersPrefix: z.string().min(1),
        hairstylesPrefix: z.string().min(1),
      })
      .optional(),
    poses: z.object({
      basePath: z.string().min(1),
      skinToneVariantPaths: z.record(z.string(), z.string().min(1)).default({}),
    }),
    generated: z.object({
      characterBasePrefix: z.string().min(1),
      orderPrefix: z.string().min(1),
    }),
  }),
  rendering: z.object({
    recipe: BookRenderRecipeSchema.optional(),
    preview: z.object({
      interiorPx: MeasurementPixelsSchema,
      coverPx: MeasurementPixelsSchema,
    }),
    pdf: z.object({
      interiorFilenamePattern: z.string().min(1),
      coverFilenamePattern: z.string().min(1),
    }),
    html: z.object({
      useImageBackgrounds: z.boolean(),
    }),
    characterPlacement: ConfigPlacementMapSchema.default({
      defaultByStoryPage: {},
      overridesByFormat: {},
    }),
    animalPlacement: ConfigPlacementMapSchema.default({
      defaultByStoryPage: {},
      overridesByFormat: {},
    }),
    coverCharacterPlacement: ConfigSinglePlacementSchema.default({
      default: null,
      overridesByFormat: {},
    }),
  }).superRefine((rendering, context) => {
    const schema = bookPlacementOverrideSchema(rendering.recipe?.schema);
    const validate = (entry: unknown, path: string[]) => {
      const parsed = schema.safeParse(entry);
      if (!parsed.success) for (const issue of parsed.error.issues) {
        context.addIssue({ ...issue, path: [...path, ...issue.path] });
      }
    };
    for (const [name, placements] of [
      ['characterPlacement', rendering.characterPlacement], ['animalPlacement', rendering.animalPlacement],
    ] as const) {
      for (const [page, entry] of Object.entries(placements.defaultByStoryPage)) validate(entry, [name, 'defaultByStoryPage', page]);
      for (const [format, entries] of Object.entries(placements.overridesByFormat)) {
        for (const [page, entry] of Object.entries(entries)) validate(entry, [name, 'overridesByFormat', format, page]);
      }
    }
    if (rendering.coverCharacterPlacement.default !== null) validate(rendering.coverCharacterPlacement.default, ['coverCharacterPlacement', 'default']);
    for (const [format, entry] of Object.entries(rendering.coverCharacterPlacement.overridesByFormat)) {
      validate(entry, ['coverCharacterPlacement', 'overridesByFormat', format]);
    }
  }),
  qa: BookQaConfigSchema,
  logistics: z.record(z.string(), z.unknown()).default({}),
  contentModel: z.object({
    storyPageCount: z.number().int().nonnegative(),
    supportsDedication: z.boolean(),
    supportsAnimalCompanion: z.boolean(),
    supportsCoverBarcodeVariant: z.boolean(),
    characterSlots: z.number().int().positive(),
  }),
  notes: z.record(z.string(), z.unknown()).default({}),
});

export const BookRenderSnapshotSchema = z.object({
  testOnly: z.boolean().optional(),
  schema: z.literal('lhb.book-render-snapshot@v1'),
  bookConfig: BookConfigSchema,
  formatId: z.string().min(1),
});

export type BookRenderSnapshot = z.infer<typeof BookRenderSnapshotSchema>;

export const RunManifestTypeSchema = z.enum(['w0', 'w2a', 'w2b', 'w3', 'w4', 'w4-error']);

export const PlatformSchema = z.enum(['amazon', 'd2c']);

export const BookConfigRefSchema = z.object({
  schema: z.literal('lhb.book-config@v1'),
  bookId: z.string().min(1),
  version: z.number().int().positive(),
  formatId: z.string().min(1),
});

export const ResolvedBookPlanSchema = z.object({
  renderSnapshot: BookRenderSnapshotSchema.optional(),
  expectedPageCount: z.number().int().positive(),
  pageLabels: z.array(z.string().regex(/^p\d{2,}$/)).min(1),
  pagePlan: z.array(BookPageConfigSchema).min(1),
  trimIn: MeasurementInchesSchema,
  bleedIn: MeasurementInchesSchema,
  templates: z.object({
    pdfMonkeyInteriorTemplateId: z.string().min(1),
    pdfMonkeyCoverTemplateId: z.string().min(1),
  }),
  print: BookPrintConfigSchema,
  qaPolicy: BookQaConfigSchema,
});

export const RunManifestOrderSchema = z.object({
  orderId: z.string().min(1),
  rootOrderId: z.string().min(1),
  amazonOrderId: z.string().min(1).nullable(),
  orderDbId: z.number().int().positive().nullable().optional(),
  platform: PlatformSchema,
  workflow: z.string().min(1).nullable().optional(),
  customerApprovalRequired: z.boolean().default(false),
});

export const RunManifestShippingAddressSchema = z
  .object({
    name: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state_code: z.string().min(1).optional(),
    postcode: z.string().min(1).optional(),
    country_code: z.string().min(1).optional(),
  })
  .partial()
  .default({});

export const RunManifestShippingSchema = z.object({
  requestedTier: z.string().min(1).nullable().default(null),
  resolvedProviderLevel: z.string().min(1).nullable().default(null),
  address: RunManifestShippingAddressSchema,
});

export const RunManifestArtifactsSchema = z.object({
  manifestKey: z.string().min(1),
  orderPrefix: z.string().min(1),
  characterPrefix: z.string().min(1).nullable().default(null),
});

export const RunManifestBookSchema = z.object({
  bookConfigRef: BookConfigRefSchema,
  resolved: ResolvedBookPlanSchema,
});

export const RunManifestInputSchema = z.object({
  characterSpecs: z.record(z.string(), z.unknown()).default({}),
  bookSpecs: z.record(z.string(), z.unknown()).default({}),
  orderDetails: z.record(z.string(), z.unknown()).default({}),
  dedicationText: z.string().nullable().default(null),
});

export const RunManifestV3Schema = z.object({
  schema: z.literal('lhb.run-manifest@v3'),
  manifestType: RunManifestTypeSchema,
  stage: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  runId: z.string().min(1),
  order: RunManifestOrderSchema,
  book: RunManifestBookSchema,
  shipping: RunManifestShippingSchema,
  input: RunManifestInputSchema,
  artifacts: RunManifestArtifactsSchema,
  entries: z.array(z.unknown()).default([]),
  summary: z.record(z.string(), z.unknown()).default({}),
  errors: z.array(z.record(z.string(), z.unknown())).default([]),
});

export type BookPageType = z.infer<typeof BookPageTypeSchema>;
export type BookPageConfig = z.infer<typeof BookPageConfigSchema>;
export type BookFormatConfig = z.infer<typeof BookFormatConfigSchema>;
export type BookCharacterPlacementEntry = z.infer<typeof BookCharacterPlacementEntrySchema>;
export type BookCharacterPlacementConfig = z.infer<typeof BookCharacterPlacementConfigSchema>;
export type BookQaConfig = z.infer<typeof BookQaConfigSchema>;
export type BookConfig = z.infer<typeof BookConfigSchema>;
export type BookConfigRef = z.infer<typeof BookConfigRefSchema>;
export type ResolvedBookPlan = z.infer<typeof ResolvedBookPlanSchema>;
export type RunManifestType = z.infer<typeof RunManifestTypeSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type RunManifestV3 = z.infer<typeof RunManifestV3Schema>;
