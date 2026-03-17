import { z } from 'zod';

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

export const BookPageConfigSchema = z.object({
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
  print: z.object({
    provider: z.literal('lulu'),
    podPackageId: z.string().min(1),
    color: z.string().min(1),
    stock: z.string().min(1),
    binding: z.string().min(1),
    coverFinish: z.string().min(1),
    defaultQuantity: z.number().int().positive(),
  }),
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

export const RunManifestTypeSchema = z.enum(['w0', 'w2a', 'w2b', 'w3', 'w4', 'w4-error']);

export const PlatformSchema = z.enum(['amazon', 'd2c']);

export const BookConfigRefSchema = z.object({
  schema: z.literal('lhb.book-config@v1'),
  bookId: z.string().min(1),
  version: z.number().int().positive(),
  formatId: z.string().min(1),
});

export const ResolvedBookPlanSchema = z.object({
  expectedPageCount: z.number().int().positive(),
  pageLabels: z.array(z.string().regex(/^p\d{2,}$/)).min(1),
  pagePlan: z.array(BookPageConfigSchema).min(1),
  trimIn: MeasurementInchesSchema,
  bleedIn: MeasurementInchesSchema,
  templates: z.object({
    pdfMonkeyInteriorTemplateId: z.string().min(1),
    pdfMonkeyCoverTemplateId: z.string().min(1),
  }),
  print: z.object({
    provider: z.literal('lulu'),
    podPackageId: z.string().min(1),
    color: z.string().min(1),
    stock: z.string().min(1),
    binding: z.string().min(1),
    coverFinish: z.string().min(1),
    defaultQuantity: z.number().int().positive(),
  }),
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
export type BookQaConfig = z.infer<typeof BookQaConfigSchema>;
export type BookConfig = z.infer<typeof BookConfigSchema>;
export type BookConfigRef = z.infer<typeof BookConfigRefSchema>;
export type ResolvedBookPlan = z.infer<typeof ResolvedBookPlanSchema>;
export type RunManifestType = z.infer<typeof RunManifestTypeSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type RunManifestV3 = z.infer<typeof RunManifestV3Schema>;
