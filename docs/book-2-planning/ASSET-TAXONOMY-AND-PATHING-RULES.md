# Asset Taxonomy And Pathing Rules

**Purpose:** define the naming and storage rules that Book 1 and Book 2 should share so later stages stop inventing book-specific paths ad hoc.
**Status:** Draft
**Created:** 2026-03-14

Companion docs:

- [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md)
- [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md)
- [BOOK-1-HARDCODED-AUDIT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-1-HARDCODED-AUDIT.md)

---

## 1. Design goals

The pathing rules should make it obvious:

- which bucket an asset belongs to
- which assets are static book assets
- which assets are generated character assets
- which assets are per-order artifacts
- which identifier controls sibling safety

The key rule is:

**`orderId` is the per-book storage identity.**

For sibling orders:

- `orderId` owns order artifact paths
- `rootOrderId` is grouping metadata only

---

## 2. Buckets and ownership

### Static and character assets bucket

Current bucket:

- `little-hero-assets`

This bucket should contain:

- static book assets
- static pose references
- shared or book-scoped character canonicals
- generated character assets that are reused across stages

### Order artifacts bucket

Current bucket:

- `little-hero-orders`

This bucket should contain:

- manifests
- preview images
- PDFs
- order-scoped repair/revision artifacts

This matches the current split already implied by:

- [r2-service.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-service.ts)
- [r2-utils.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-utils.ts)

---

## 3. Namespace rule

All book-scoped assets should live under:

- `{bookId}/...`

Examples:

- `book-mvp-simple-adventure/backgrounds/...`
- `book-mvp-simple-adventure/orders/{orderId}/...`
- `book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/...`

No future book should create top-level ad hoc roots outside its `bookId` namespace unless there is an intentional shared asset system.

---

## 4. Static book asset roots

Recommended v1 roots:

- `{bookId}/fonts/...`
- `{bookId}/backgrounds/...`
- `{bookId}/overlays/...`
- `{bookId}/characters/poses/...`
- `{bookId}/characters/bases/...`
- `{bookId}/characters/hairstyles/...`

These should be referenced by named slots from `book_config`, not constructed from page-number code in the workflows.

Examples from current Book 1:

- `book-mvp-simple-adventure/backgrounds/page00-dedication.png`
- `book-mvp-simple-adventure/backgrounds/page00-covers.png`
- `book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png`
- `book-mvp-simple-adventure/characters/poses/pose01.png`

---

## 5. Generated character asset roots

For v1 compatibility, keep generated character assets under:

- `{bookId}/order-generated-assets/characters/{characterHash}/...`

Recommended file rules:

- base character:
  - `{bookId}/order-generated-assets/characters/{characterHash}/base-character.png`
- pose outputs:
  - `{bookId}/order-generated-assets/characters/{characterHash}/poses/poseNN.png`
  - `{bookId}/order-generated-assets/characters/{characterHash}/poses/poseNN_r1.png`
- background-removed outputs:
  - `{bookId}/order-generated-assets/characters/{characterHash}/characters_{characterHash}_poseNN_nobg.png`

This matches the current runtime more closely than introducing a second path migration now.

Relevant current references:

- [w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-sw1-single-pose.json)
- [r2-service.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-service.ts)
- [replace-image/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/replace-image/route.ts)

---

## 6. Order artifact roots

Per-book order artifacts must live under:

- `{bookId}/orders/{orderId}/...`

Recommended subpaths:

- manifests:
  - `{bookId}/orders/{orderId}/manifests/{stage}-manifest.json`
- preview images:
  - `{bookId}/orders/{orderId}/preview-images/p00.png`
  - `{bookId}/orders/{orderId}/preview-images/cover-spread.png`
- PDFs:
  - `{bookId}/orders/{orderId}/interior_{orderId}.pdf`
  - `{bookId}/orders/{orderId}/cover_{orderId}.pdf`
- revisions and repairs:
  - `{bookId}/orders/{orderId}/revisions/...`
  - `{bookId}/orders/{orderId}/repairs/...`

Sibling rule:

- never use `rootOrderId` for child-book artifact paths
- every sibling book gets its own `orderId` path root

---

## 7. Format-aware asset rule

Formats may differ, but path branching should be used only when the actual asset differs.

Recommended rule:

- keep slot names stable across formats
- let `book_config` decide whether a slot resolves to a shared asset or a format-specific asset

Examples:

- `covers` may resolve differently for `standard` and `amazon`
- interior story backgrounds may remain shared

Possible format-specific patterns:

- shared path:
  - `{bookId}/backgrounds/page05-meadow.png`
- format-specific path:
  - `{bookId}/formats/amazon/backgrounds/covers.png`

Do not force per-format subpaths for every asset if only a few differ.

---

## 8. Named slot rule

Workflows and UI should reference named slots, not derive file paths from page numbers.

Examples:

- `backgroundSlot: dedication`
- `backgroundSlot: story_05`
- `overlaySlot: animalTracks`
- `fontSlot: primary`

This is the bridge between `pageSequence` and real storage keys.

Current code that should eventually stop deriving paths directly:

- [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts)
- [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx)

---

## 9. API proxy rule

Current helpers still detect order assets with a Book 1 hardcoded prefix:

- [r2-utils.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-utils.ts)
- [api/assets/[...path]/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/assets/[...path]/route.ts)

Future rule:

- bucket selection should be based on a generalized order-artifact prefix rule, not literal `book-mvp-simple-adventure/orders/`

Recommended target:

- if key matches `{bookId}/orders/...`, treat as order artifact
- otherwise treat as static/character asset unless explicitly overridden

---

## 10. Naming conventions summary

### Pages

- internal labels stay `p00`, `p01`, `p02`, ...

### Poses

- two-digit pose naming in filenames:
  - `pose01.png`
  - `pose07_r1.png`

### Manifests

- keep existing stage filenames:
  - `1-manifest.json`
  - `2a-manifest.json`
  - `2b-manifest.json`
  - `3-manifest.json`
  - `4-manifest.json`

### Generated PDFs

- interior:
  - `interior_{orderId}.pdf`
- cover:
  - `cover_{orderId}.pdf`

---

## 11. Practical takeaway

For v1:

- static and character assets stay under `{bookId}/...` in `little-hero-assets`
- order artifacts stay under `{bookId}/orders/{orderId}/...` in `little-hero-orders`
- slot names come from `book_config`
- sibling safety always keys off per-book `orderId`

That is enough to onboard Book 2 without inventing a second storage taxonomy.
