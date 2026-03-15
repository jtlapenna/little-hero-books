# Book Manifest Contract Draft

**Purpose:** define the first shared manifest contract that consumes `book_config` and carries a frozen, book-anonymous runtime plan through W0 / 2A / 2B / 3 / 4.
**Status:** Draft
**Created:** 2026-03-14

Companion docs:

- [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md)
- [BOOK-2-PREP-PRIORITY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-PREP-PRIORITY.md)

---

## 1. Decisions this contract assumes

This draft is based on the decisions already made:

- each `format` has its own `formats[*].interior.pageSequence`
- the manifest stores a **resolved page plan snapshot** for the run
- internal page labels stay absolute, like `p00`, `p01`, `p02`
- pose mapping lives directly on each page entry for v1
- shipping mapping stays in global runtime config for now
- the manifest stores the **resolved QA policy** used for that run
- QA remains **book-level by default** for v1
- Book 2 uses the **same render and print stack as Book 1** for v1

---

## 2. Manifest design goals

The manifest should let later stages operate without re-deriving book structure from scattered assumptions.

That means the manifest should answer:

1. Which book and format is this?
2. What exact page plan applies to this order?
3. Which templates, geometry, and print package apply?
4. Which QA rules were active?
5. What did each stage produce?

---

## 3. Proposed schema family

Use one schema family with a stage-specific manifest type:

```json
{
  "schema": "lhb.run-manifest@v3",
  "manifestType": "w0|w2a|w2b|w3|w4|w4-error",
  "stage": "1-order-intake"
}
```

The main shift from the current manifest shape is:

- `book_config` is no longer implied
- the resolved page/render/QA plan is carried explicitly

---

## 4. Common envelope

Every stage manifest should share this base envelope.

```json
{
  "schema": "lhb.run-manifest@v3",
  "manifestType": "w0",
  "stage": "1-order-intake",
  "createdAt": "2026-03-14T00:00:00.000Z",
  "updatedAt": "2026-03-14T00:00:00.000Z",
  "runId": "uuid-or-trace-id",
  "order": {},
  "book": {},
  "shipping": {},
  "input": {},
  "artifacts": {},
  "entries": [],
  "summary": {},
  "errors": []
}
```

### `order`

```json
{
  "order": {
    "orderId": "child-or-single-order-id",
    "rootOrderId": "root-group-id-or-orderId",
    "amazonOrderId": "root-group-id-or-amazon-id",
    "orderDbId": 123,
    "platform": "amazon|d2c",
    "workflow": "1|2A|2B|3|4",
    "customerApprovalRequired": false
  }
}
```

Rules:

- `orderId` is the per-book runtime identity
- `rootOrderId` groups siblings
- `amazonOrderId` remains the external/legacy root reference when needed
- `orderId` must never be recomputed from the root after W0

### `book`

This is the key section that consumes `book_config`.

```json
{
  "book": {
    "bookConfigRef": {
      "schema": "lhb.book-config@v1",
      "bookId": "book-mvp-simple-adventure",
      "version": 1,
      "formatId": "standard"
    },
    "resolved": {
      "expectedPageCount": 15,
      "pageLabels": ["p00", "p01", "p02"],
      "pagePlan": [],
      "trimIn": { "w": 8.5, "h": 8.5 },
      "bleedIn": { "w": 8.75, "h": 8.75 },
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
      },
      "qaPolicy": {}
    }
  }
}
```

Rules:

- `bookConfigRef` points back to the config source
- `resolved` is the frozen runtime snapshot for this order
- later stages may append outputs, but must not mutate `book.resolved.pagePlan`
- `book.resolved.qaPolicy` should reflect the book-level policy in v1 unless a later schema version explicitly introduces format-level overrides

### `shipping`

Because shipping mapping remains global for now, the manifest should carry resolved shipping values, not config ownership logic.

```json
{
  "shipping": {
    "requestedTier": "expedited",
    "resolvedProviderLevel": "EXPEDITED",
    "address": {
      "name": "Test Recipient",
      "city": "San Francisco",
      "state_code": "CA",
      "postcode": "94107",
      "country_code": "US"
    }
  }
}
```

### `input`

Per-order inputs normalized by W0.

```json
{
  "input": {
    "characterSpecs": {},
    "bookSpecs": {},
    "orderDetails": {},
    "dedicationText": "optional string"
  }
}
```

### `artifacts`

Use this for stable storage references and stage-level keys.

```json
{
  "artifacts": {
    "manifestKey": "book-root/orders/{orderId}/manifests/1-manifest.json",
    "orderPrefix": "book-root/orders/{orderId}",
    "characterPrefix": "book-root/order-generated-assets/characters/{characterHash}"
  }
}
```

---

## 5. Resolved page plan shape

This is the core runtime structure later stages should consume.

```json
{
  "index": 5,
  "id": "story_05",
  "label": "p05",
  "type": "story",
  "storyPageNumber": 5,
  "poseNumber": 5,
  "backgroundSlot": "story_05",
  "overlaySlot": "animalTracks",
  "required": true
}
```

Why this lives in the manifest:

- W2A can understand which poses are required
- W3 can render pages without hidden Book 1 assumptions
- W4 QA can compare against expected page labels/count
- replay/debugging can inspect the exact plan used for the order

---

## 6. Stage-specific requirements

### W0 / `1-manifest`

Purpose:

- normalize the order
- select the `book_config`
- select the `formatId`
- freeze the resolved plan into the manifest

Required fields:

- common envelope
- full `book.bookConfigRef`
- full `book.resolved.pagePlan`
- `book.resolved.qaPolicy`
- normalized `input.characterSpecs`
- normalized `shipping.requestedTier`
- `artifacts.manifestKey`

This is the first manifest that all later stages depend on.

### W2A / `2a-manifest`

Purpose:

- capture pose-generation outcomes and approvals

Required additions:

```json
{
  "entries": [
    {
      "poseNumber": 1,
      "pageLabels": ["p01"],
      "approvedKey": "r2/path/to/pose01.png",
      "qa": {
        "pose": {
          "passed": true,
          "reviewReason": null
        }
      }
    }
  ],
  "summary": {
    "requiredPoseCount": 12,
    "generatedPoseCount": 12,
    "approvedPoseCount": 12
  }
}
```

Notes:

- `pageLabels` should be derived from the frozen `pagePlan`, not guessed
- one pose may map to multiple labels if a future book reuses poses

### W2B / `2b-manifest`

Purpose:

- capture background-removal results per pose

Required additions:

```json
{
  "entries": [
    {
      "poseNumber": 1,
      "approvedKey": "r2/path/to/pose01.png",
      "bgRemovedKey": "r2/path/to/pose01-nobg.png",
      "qa": {
        "backgroundRemoval": {
          "passed": true,
          "needsReview": false,
          "reviewReason": null
        }
      }
    }
  ]
}
```

### W3 / `3-manifest`

Purpose:

- assemble page previews and final PDFs using the frozen page plan

Required additions:

```json
{
  "pages": {
    "p00": "r2/path/to/p00.png",
    "p01": "r2/path/to/p01.png"
  },
  "preview": {
    "pageImageUrls": [],
    "coverPreviewUrl": "url"
  },
  "pdf": {
    "interiorR2Key": "r2/path/to/interior.pdf",
    "coverR2Key": "r2/path/to/cover.pdf"
  },
  "summary": {
    "expectedPageCount": 15,
    "renderedPageCount": 15,
    "readyForPrint": true
  }
}
```

Rules:

- `summary.expectedPageCount` must equal `book.resolved.expectedPageCount`
- page outputs must match `book.resolved.pageLabels`

### W4 / `4-manifest`

Purpose:

- capture print submission and final print QA/provider results

Required additions:

```json
{
  "qa": {
    "interior": {},
    "cover": {}
  },
  "provider": {
    "name": "lulu",
    "jobId": "provider-job-id",
    "status": "created|in_production|shipped|error"
  },
  "summary": {
    "qaPassed": true,
    "submittedToProvider": true
  }
}
```

### W4 error manifest / `4-error-manifest`

Purpose:

- fail closed with a sibling-safe or single-order-safe error record

Required additions:

```json
{
  "manifestType": "w4-error",
  "errors": [
    {
      "code": "print_qa_failed",
      "phase": "qa_gate",
      "message": "Failed pages: 4, 6"
    }
  ],
  "summary": {
    "submittedToProvider": false,
    "qaPassed": false
  }
}
```

---

## 7. Worked `1-manifest` example

```json
{
  "schema": "lhb.run-manifest@v3",
  "manifestType": "w0",
  "stage": "1-order-intake",
  "createdAt": "2026-03-14T00:00:00.000Z",
  "updatedAt": "2026-03-14T00:00:00.000Z",
  "runId": "run_abc123",
  "order": {
    "orderId": "44a4fe50-a33f-4437-b7a1-ef87f3a94a6e",
    "rootOrderId": "44a4fe50-a33f-4437-b7a1-ef87f3a94a6e",
    "amazonOrderId": "44a4fe50-a33f-4437-b7a1-ef87f3a94a6e",
    "orderDbId": 803,
    "platform": "d2c",
    "workflow": "1",
    "customerApprovalRequired": false
  },
  "book": {
    "bookConfigRef": {
      "schema": "lhb.book-config@v1",
      "bookId": "book-mvp-simple-adventure",
      "version": 1,
      "formatId": "standard"
    },
    "resolved": {
      "expectedPageCount": 15,
      "pageLabels": ["p00", "p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p09", "p10", "p11", "p12", "p13", "p14"],
      "pagePlan": [
        {
          "index": 0,
          "id": "dedication",
          "label": "p00",
          "type": "dedication",
          "storyPageNumber": null,
          "poseNumber": null,
          "backgroundSlot": "dedication",
          "overlaySlot": null,
          "required": true
        },
        {
          "index": 1,
          "id": "story_01",
          "label": "p01",
          "type": "story",
          "storyPageNumber": 1,
          "poseNumber": 1,
          "backgroundSlot": "story_01",
          "overlaySlot": null,
          "required": true
        }
      ],
      "trimIn": { "w": 8.5, "h": 8.5 },
      "bleedIn": { "w": 8.75, "h": 8.75 },
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
      },
      "qaPolicy": {
        "pose": {
          "perPoseExpectations": {
            "1": { "frontFacing": true, "strictSymmetry": true }
          }
        },
        "backgroundRemoval": {
          "faceDefectReviewEnabled": true,
          "compositeQaEnabled": true
        }
      }
    }
  },
  "shipping": {
    "requestedTier": "expedited",
    "resolvedProviderLevel": "EXPEDITED"
  },
  "input": {
    "characterSpecs": {},
    "bookSpecs": {},
    "orderDetails": {},
    "dedicationText": "To our little hero"
  },
  "artifacts": {
    "manifestKey": "book-mvp-simple-adventure/orders/44a4fe50-a33f-4437-b7a1-ef87f3a94a6e/manifests/1-manifest.json",
    "orderPrefix": "book-mvp-simple-adventure/orders/44a4fe50-a33f-4437-b7a1-ef87f3a94a6e",
    "characterPrefix": "book-mvp-simple-adventure/order-generated-assets/characters/819a54be3388f093"
  },
  "entries": [],
  "summary": {
    "readyFor2A": true
  },
  "errors": []
}
```

---

## 8. Validation rules

At minimum, manifest validation should enforce:

- `book.bookConfigRef.schema` matches the supported config schema
- `book.resolved.pageLabels.length === book.resolved.expectedPageCount`
- `book.resolved.pagePlan.length === book.resolved.expectedPageCount`
- every page label in `pagePlan` is unique
- every `entries[*].pageLabels[*]` exists in `book.resolved.pageLabels`
- later stage manifests do not mutate the frozen `pagePlan`
- `order.orderId` remains the per-book identity across all manifests in the chain

---

## 9. Recommendation

The first implementation should focus on one strong invariant:

**W0 produces a `1-manifest` that already contains the resolved page plan, render settings, print settings, and QA policy for the order.**

If that contract is correct, the later stages become much simpler and much less Book-1-specific.
