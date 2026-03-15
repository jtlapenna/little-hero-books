# Book Config Schema Draft

**Purpose:** define the shared `book_config` contract that allows Book 1 and Book 2 to run through the same pipeline without hardcoding book-specific assumptions into workflows.
**Status:** Draft
**Created:** 2026-03-14

---

## 1. Scope and boundaries

`book_config` should contain **book-specific, mostly static configuration**.

It should **not** contain:

- secrets
- provider credentials
- environment URLs
- per-order customer data
- per-run transient values like signed URLs, manifest URLs, or generated asset keys

Those belong elsewhere:

- **runtime config**: secrets, endpoints, credentials
- **order/manifests**: per-order and per-run data
- **workflow state**: execution status, retries, queueing, claim info

---

## 2. Design goals

The schema should let the system answer these questions from config alone:

1. What kind of book is this?
2. Which formats or channels does it support?
3. How many pages should exist, and what are they?
4. Which assets, templates, and provider settings apply?
5. Which QA expectations are book-specific?

This means `book_config` needs to drive:

- page structure
- asset roots and named asset slots
- render geometry
- template selection
- print package selection
- QA thresholds and pose expectations

---

## 3. Proposed top-level shape

```json
{
  "schema": "lhb.book-config@v1",
  "bookId": "book-mvp-simple-adventure",
  "slug": "simple-adventure",
  "displayName": "Simple Adventure",
  "status": "active",
  "version": 1,
  "defaultFormatId": "standard",
  "formats": {
    "standard": {},
    "amazon": {}
  },
  "assets": {},
  "rendering": {},
  "qa": {},
  "logistics": {},
  "contentModel": {},
  "notes": {}
}
```

---

## 4. Field-by-field draft

### Identity

```json
{
  "schema": "lhb.book-config@v1",
  "bookId": "book-mvp-simple-adventure",
  "slug": "simple-adventure",
  "displayName": "Simple Adventure",
  "status": "draft|active|archived",
  "version": 1,
  "defaultFormatId": "standard"
}
```

Rules:

- `schema` is the contract version for the config object itself
- `bookId` is the canonical runtime identifier used in manifests and storage paths
- `version` is the content/config revision, not the schema revision
- `defaultFormatId` must exist in `formats`

### Formats

Each format represents a production variant of the same book, for example:

- `standard`
- `amazon`
- future hardcover or alternate trim variants

```json
{
  "formats": {
    "standard": {
      "formatId": "standard",
      "channels": ["d2c"],
      "trimIn": { "w": 8.5, "h": 8.5 },
      "bleedIn": { "w": 8.75, "h": 8.75 },
      "interior": {
        "expectedPageCount": 15,
        "pageSequence": []
      },
      "cover": {
        "spreadSizeIn": { "w": 17.25, "h": 8.75 }
      },
      "templates": {
        "pdfMonkeyInteriorTemplateId": "REQUIRED",
        "pdfMonkeyCoverTemplateId": "REQUIRED"
      },
      "print": {
        "provider": "lulu",
        "podPackageId": "REQUIRED",
        "color": "premium-color",
        "stock": "80#-text",
        "binding": "saddle-stitch",
        "coverFinish": "matte",
        "defaultQuantity": 1
      }
    }
  }
}
```

Rules:

- `channels` is informational routing metadata, not the only source of routing truth
- `expectedPageCount` must match `pageSequence.length`
- `podPackageId` belongs at the format level because trim/binding/page-count variants can differ by format

### Page sequence

The page sequence is the most important part of the contract.

It should describe each page explicitly rather than relying on hidden assumptions like:

- “page 0 is dedication unless Amazon”
- “pages 3–16 are story pages”

Draft page item:

```json
{
  "index": 0,
  "id": "dedication",
  "label": "p00",
  "type": "dedication",
  "storyPageNumber": null,
  "backgroundSlot": "dedication",
  "poseNumber": null,
  "overlaySlot": null,
  "required": true
}
```

Suggested page `type` values:

- `title`
- `blank`
- `dedication`
- `story`
- `ending`
- `credits`

For story pages:

- `storyPageNumber` is the narrative page number
- `poseNumber` links the page to a generated pose when relevant
- `backgroundSlot` and `overlaySlot` map to named assets instead of hardcoded paths

This is what makes the pipeline book-anonymous.

### Assets

Assets should be represented as named slots plus roots, not buried in workflow code.

```json
{
  "assets": {
    "assetRoot": "book-mvp-simple-adventure",
    "fonts": {
      "primary": "book-mvp-simple-adventure/fonts/CustomBook.ttf"
    },
    "backgrounds": {
      "dedication": "book-mvp-simple-adventure/backgrounds/page00-dedication.png",
      "covers": "book-mvp-simple-adventure/backgrounds/page00-covers.png",
      "coversAmazon": "book-mvp-simple-adventure/backgrounds/page00-covers-barcode.png",
      "titlePage": "book-mvp-simple-adventure/backgrounds/page00-title-page.png"
    },
    "overlays": {
      "animalTracks": "book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png",
      "sparkles": "book-mvp-simple-adventure/overlays/sparkles/page12-sparkles.png"
    },
    "poses": {
      "basePath": "book-mvp-simple-adventure/characters/poses",
      "skinToneVariantPaths": {
        "medium-dark": "book-mvp-simple-adventure/characters/poses/skin-deep",
        "deep-dark": "book-mvp-simple-adventure/characters/poses/skin-deep"
      }
    },
    "generated": {
      "characterBasePrefix": "book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}",
      "orderPrefix": "book-mvp-simple-adventure/orders/{orderId}"
    }
  }
}
```

Rules:

- named slots are preferred over page-number-specific hardcoding in workflow logic
- runtime code can still derive final paths using templates like `{orderId}` and `{characterHash}`
- `skinToneVariantPaths` belongs here because it is book-specific art-direction behavior

### Rendering

This section controls geometry and output expectations.

```json
{
  "rendering": {
    "preview": {
      "interiorPx": { "w": 2625, "h": 2625 },
      "coverPx": { "w": 5203, "h": 2625 }
    },
    "pdf": {
      "interiorFilenamePattern": "interior_{orderId}.pdf",
      "coverFilenamePattern": "cover_{orderId}.pdf"
    },
    "html": {
      "useImageBackgrounds": true
    }
  }
}
```

Rules:

- these are book-specific render expectations, not environment settings
- renderer endpoints and auth stay out of this object

### QA

Book-specific QA should be configurable, especially when page structure or pose expectations differ by book.

```json
{
  "qa": {
    "pose": {
      "requiredPoseNumbers": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "perPoseExpectations": {
        "1": {
          "frontFacing": true,
          "strictSymmetry": true
        }
      }
    },
    "backgroundRemoval": {
      "faceDefectReviewEnabled": true,
      "compositeQaEnabled": true
    },
    "finalPdf": {
      "interior": {
        "expectedPreviewLabelPattern": "p{index:02d}",
        "minBytesPerPage": 30000
      },
      "cover": {
        "expectedPageCount": 1
      }
    }
  }
}
```

Rules:

- for v1, QA should be defined at the **book level by default**
- per-format QA overrides should be added only later if a real format-specific need appears
- final-PDF expectations should derive from `pageSequence` whenever possible, not duplicate it manually

### Logistics

Only book-specific print/logistics settings belong here.

```json
{
  "logistics": {
    "shippingLevelMap": {
      "mail": "MAIL",
      "ground_home": "GROUND_HD",
      "priority_mail": "PRIORITY_MAIL",
      "expedited": "EXPEDITED",
      "express": "EXPRESS"
    }
  }
}
```

For v1, this should remain in **global runtime config**, not `book_config`, because you do not currently expect different books to have different shipping rules. The example above is illustrative only if book-specific overrides are introduced later.

### Content model

This section explains the narrative/content assumptions of the book.

```json
{
  "contentModel": {
    "storyPageCount": 14,
    "supportsDedication": true,
    "supportsAnimalCompanion": true,
    "supportsCoverBarcodeVariant": true,
    "characterSlots": 1
  }
}
```

This is useful for validation and UI tooling, not just runtime generation.

---

## 5. Recommended minimum required fields for v1

If you want the leanest usable starting schema, require at least:

- `schema`
- `bookId`
- `displayName`
- `status`
- `version`
- `defaultFormatId`
- `formats`
- `formats[*].trimIn`
- `formats[*].bleedIn`
- `formats[*].interior.expectedPageCount`
- `formats[*].interior.pageSequence`
- `formats[*].templates.pdfMonkeyInteriorTemplateId`
- `formats[*].templates.pdfMonkeyCoverTemplateId`
- `formats[*].print.podPackageId`
- `assets.assetRoot`
- `assets.poses.basePath`
- `rendering.preview`

Everything else can be layered in after the first shared-path implementation exists.

---

## 6. Draft TypeScript shape

```ts
export interface BookConfig {
  schema: 'lhb.book-config@v1';
  bookId: string;
  slug: string;
  displayName: string;
  status: 'draft' | 'active' | 'archived';
  version: number;
  defaultFormatId: string;
  formats: Record<string, BookFormatConfig>;
  assets: BookAssetConfig;
  rendering: BookRenderingConfig;
  qa?: BookQaConfig;
  logistics?: BookLogisticsConfig;
  contentModel?: BookContentModel;
  notes?: Record<string, unknown>;
}

export interface BookFormatConfig {
  formatId: string;
  channels: string[];
  trimIn: { w: number; h: number };
  bleedIn: { w: number; h: number };
  interior: {
    expectedPageCount: number;
    pageSequence: BookPageConfig[];
  };
  cover: {
    spreadSizeIn: { w: number; h: number };
  };
  templates: {
    pdfMonkeyInteriorTemplateId: string;
    pdfMonkeyCoverTemplateId: string;
  };
  print: {
    provider: 'lulu';
    podPackageId: string;
    color: string;
    stock: string;
    binding: string;
    coverFinish: string;
    defaultQuantity: number;
  };
}

export interface BookPageConfig {
  index: number;
  id: string;
  label: string;
  type: 'title' | 'blank' | 'dedication' | 'story' | 'ending' | 'credits';
  storyPageNumber: number | null;
  backgroundSlot: string | null;
  poseNumber: number | null;
  overlaySlot: string | null;
  required: boolean;
}
```

---

## 7. Worked Book 1 example

This is intentionally partial. It shows the shape, not every page entry.

```json
{
  "schema": "lhb.book-config@v1",
  "bookId": "book-mvp-simple-adventure",
  "slug": "simple-adventure",
  "displayName": "Simple Adventure",
  "status": "active",
  "version": 1,
  "defaultFormatId": "standard",
  "formats": {
    "standard": {
      "formatId": "standard",
      "channels": ["d2c"],
      "trimIn": { "w": 8.5, "h": 8.5 },
      "bleedIn": { "w": 8.75, "h": 8.75 },
      "interior": {
        "expectedPageCount": 15,
        "pageSequence": [
          {
            "index": 0,
            "id": "dedication",
            "label": "p00",
            "type": "dedication",
            "storyPageNumber": null,
            "backgroundSlot": "dedication",
            "poseNumber": null,
            "overlaySlot": null,
            "required": true
          },
          {
            "index": 1,
            "id": "story_01",
            "label": "p01",
            "type": "story",
            "storyPageNumber": 1,
            "backgroundSlot": "story_01",
            "poseNumber": 1,
            "overlaySlot": null,
            "required": true
          },
          {
            "index": 5,
            "id": "story_05",
            "label": "p05",
            "type": "story",
            "storyPageNumber": 5,
            "backgroundSlot": "story_05",
            "poseNumber": 5,
            "overlaySlot": "animalTracks",
            "required": true
          }
        ]
      },
      "cover": {
        "spreadSizeIn": { "w": 17.25, "h": 8.75 }
      },
      "templates": {
        "pdfMonkeyInteriorTemplateId": "5539DDB4-EC78-4AE9-A3FB-DB1E7F8DD172",
        "pdfMonkeyCoverTemplateId": "D52F14C8-BBC3-4058-929F-195DFC707E75"
      },
      "print": {
        "provider": "lulu",
        "podPackageId": "0850X0850FCPRESS080CW444MXX",
        "color": "premium-color",
        "stock": "80#-text",
        "binding": "saddle-stitch",
        "coverFinish": "matte",
        "defaultQuantity": 1
      }
    },
    "amazon": {
      "formatId": "amazon",
      "channels": ["amazon"],
      "trimIn": { "w": 8.5, "h": 8.5 },
      "bleedIn": { "w": 8.75, "h": 8.75 },
      "interior": {
        "expectedPageCount": 17,
        "pageSequence": [
          {
            "index": 0,
            "id": "title",
            "label": "p00",
            "type": "title",
            "storyPageNumber": null,
            "backgroundSlot": "titlePage",
            "poseNumber": null,
            "overlaySlot": null,
            "required": true
          },
          {
            "index": 1,
            "id": "blank",
            "label": "p01",
            "type": "blank",
            "storyPageNumber": null,
            "backgroundSlot": null,
            "poseNumber": null,
            "overlaySlot": null,
            "required": true
          }
        ]
      },
      "cover": {
        "spreadSizeIn": { "w": 17.25, "h": 8.75 }
      },
      "templates": {
        "pdfMonkeyInteriorTemplateId": "5539DDB4-EC78-4AE9-A3FB-DB1E7F8DD172",
        "pdfMonkeyCoverTemplateId": "D52F14C8-BBC3-4058-929F-195DFC707E75"
      },
      "print": {
        "provider": "lulu",
        "podPackageId": "0850X0850FCPREPB080CW444MXX",
        "color": "premium-color",
        "stock": "80#-text",
        "binding": "perfect-bound",
        "coverFinish": "matte",
        "defaultQuantity": 1
      }
    }
  },
  "assets": {
    "assetRoot": "book-mvp-simple-adventure",
    "fonts": {
      "primary": "book-mvp-simple-adventure/fonts/CustomBook.ttf"
    },
    "backgrounds": {
      "dedication": "book-mvp-simple-adventure/backgrounds/page00-dedication.png",
      "covers": "book-mvp-simple-adventure/backgrounds/page00-covers.png",
      "coversAmazon": "book-mvp-simple-adventure/backgrounds/page00-covers-barcode.png",
      "titlePage": "book-mvp-simple-adventure/backgrounds/page00-title-page.png"
    },
    "poses": {
      "basePath": "book-mvp-simple-adventure/characters/poses",
      "skinToneVariantPaths": {
        "medium-dark": "book-mvp-simple-adventure/characters/poses/skin-deep",
        "deep-dark": "book-mvp-simple-adventure/characters/poses/skin-deep"
      }
    }
  },
  "rendering": {
    "preview": {
      "interiorPx": { "w": 2625, "h": 2625 },
      "coverPx": { "w": 5203, "h": 2625 }
    },
    "pdf": {
      "interiorFilenamePattern": "interior_{orderId}.pdf",
      "coverFilenamePattern": "cover_{orderId}.pdf"
    },
    "html": {
      "useImageBackgrounds": true
    }
  },
  "qa": {
    "pose": {
      "requiredPoseNumbers": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "perPoseExpectations": {
        "1": {
          "frontFacing": true,
          "strictSymmetry": true
        }
      }
    },
    "backgroundRemoval": {
      "faceDefectReviewEnabled": true,
      "compositeQaEnabled": true
    },
    "finalPdf": {
      "interior": {
        "minBytesPerPage": 30000
      },
      "cover": {
        "expectedPageCount": 1
      }
    }
  },
  "contentModel": {
    "storyPageCount": 14,
    "supportsDedication": true,
    "supportsAnimalCompanion": true,
    "supportsCoverBarcodeVariant": true,
    "characterSlots": 1
  }
}
```

---

## 8. Validation rules worth enforcing in code

At minimum, validation should reject configs where:

- `defaultFormatId` is missing from `formats`
- `expectedPageCount !== pageSequence.length`
- page `index` values are duplicated or non-contiguous
- two pages share the same `label`
- a `story` page is missing both `storyPageNumber` and `backgroundSlot`
- a format is missing required template IDs or `podPackageId`
- asset slot references point to missing named assets

---

## 9. Open design questions

These should be answered before the schema is considered final:

1. Amazon vs D2C: should every operational variant always be represented as a `format`, or do some channel differences belong only in routing metadata?
2. How generic should the provider/template section become before a second render or print stack actually exists?

Already decided for v1:

- shipping-tier mapping lives in **global runtime config**
- pose-to-page mapping lives directly in `formats[*].interior.pageSequence`
- manifests should snapshot the resolved page plan and QA policy at order start
- QA stays **book-level by default**, with per-format overrides deferred until needed
- Book 2 assumes the **same render and print stack as Book 1** for v1

---

## 10. Recommendation

For the first implementation:

- keep `book_config` intentionally narrow
- require only the fields needed to run W2A / W3 / W4 on a shared path
- avoid prematurely encoding every creative option

The v1 goal is not “perfect publishing metadata.”

The v1 goal is:

**enough typed structure that Book 1 and Book 2 can use one pipeline contract instead of two drifting workflow trees.**
