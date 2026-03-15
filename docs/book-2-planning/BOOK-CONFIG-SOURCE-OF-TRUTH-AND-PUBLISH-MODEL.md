# Book Config Source Of Truth And Publish Model

**Purpose:** define where `book_config` lives, how it becomes runtime-readable, and how orders pin an exact config version.
**Status:** Draft
**Created:** 2026-03-14

Companion docs:

- [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md)
- [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md)
- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)

---

## 1. Decision summary

For v1:

- canonical authored `book_config` lives in the repo
- published runtime snapshots live in Supabase
- W0 freezes an explicit `bookId + version + formatId` into the manifest at order start
- production runtime should not depend on mutable "latest" config after the manifest is created
- `system_config` should not be reused as the main storage model for versioned book configs

This keeps authoring reviewable in git while still allowing the live runtime to load a stable snapshot.

---

## 2. Why this model

Current repo evidence:

- there is no existing `book_config` or `book_configs` implementation in the backend
- the current schema docs center on `orders` and related operational tables, not book config tables
- the current W0 path still hardcodes Book 1 assumptions into code and manifest generation instead of loading a typed config

Relevant references:

- [little-hero-books-schema.sql](/Users/jeff/Projects/little-hero-books/docs/database/little-hero-books-schema.sql)
- [create-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts)
- [w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json)

Practical goals:

- configs must be diffable and code-reviewed
- runtime must be able to answer "what exact config did this order use?"
- in-flight orders must not change if a config is edited after order intake

---

## 3. Canonical authored location

Recommended repo location:

- `back-end/src/lib/books/configs/{bookId}/v{version}.json`

Examples:

- `back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`
- `back-end/src/lib/books/configs/book-2-example/v1.json`

Why JSON for authored config:

- easy to snapshot into manifests and Supabase without translation
- easy to validate with a typed loader
- easy to diff in git
- avoids mixing runtime logic into the authored config files

The repo should also own:

- `back-end/src/lib/books/types.ts`
- `back-end/src/lib/books/load-book-config.ts`
- `back-end/src/lib/books/validate-book-config.ts`
- `back-end/src/lib/books/resolve-page-plan.ts`

---

## 4. Published runtime model

Recommended new Supabase runtime table:

- `book_configs`

Suggested columns:

- `id`
- `book_id`
- `version`
- `schema`
- `status`
- `default_format_id`
- `config_json`
- `checksum`
- `published_at`
- `published_by`
- `is_active`
- `created_at`
- `updated_at`

Recommended invariants:

- `book_id + version` is unique
- published rows are immutable snapshots
- `is_active = true` marks the default production version for a book
- old versions remain queryable for replay and order archaeology

Why a dedicated table instead of `system_config`:

- `book_config` is structured, versioned, and large
- it needs immutable historical rows, not a loose key-value store
- runtime queries want `book_id + version + status`, not one generic config blob

---

## 5. Publish flow

Recommended publish flow:

1. author/update repo config JSON
2. run local validation against `BookConfig` schema
3. run a publish script that:
   - reads the repo file
   - validates it
   - computes checksum
   - upserts a new immutable row into `book_configs`
   - optionally marks it active for that `book_id`
4. production W0 reads the published snapshot from Supabase

Recommended first publish script target:

- `back-end/scripts/publish-book-config.ts`

The script should fail closed if:

- schema validation fails
- required asset slots are missing
- `expectedPageCount` does not equal `pageSequence.length`
- the version already exists with different content

---

## 6. Runtime lookup rules

### Production

Production runtime should load config from Supabase using:

- `bookId`
- explicit `version` when provided
- otherwise active version for that book

### Local development

Local/dev can support two modes:

- direct repo read for fast iteration
- Supabase snapshot read for integration testing

Recommended rule:

- local code may read directly from repo
- shared runtime paths and replay tests should prefer the published snapshot path as soon as it exists

---

## 7. Version pinning at order start

W0 must pin:

- `book.bookConfigRef.bookId`
- `book.bookConfigRef.version`
- `book.bookConfigRef.formatId`

Once written into the manifest:

- later stages must not resolve "latest active" again
- later stages must consume the frozen `book.resolved` snapshot from the manifest

This is the core rule that protects in-flight orders from config drift.

---

## 8. What does not belong in `book_config`

`book_config` should not contain:

- Supabase credentials
- R2 credentials
- Lulu credentials
- PDFMonkey tokens
- backend URLs
- signed URLs
- per-order shipping address or child data
- retry counts or queue state

Those belong in:

- runtime config or environment variables
- per-order manifests
- workflow state

Shipping mapping remains outside `book_config` for v1:

- `shippingLevelMap` should stay in global runtime config
- the manifest carries the resolved shipping level actually used

---

## 9. First implementation output this enables

This model is designed to support a narrow first repo-owned boundary:

- load config
- validate config
- resolve page plan
- emit `1-manifest` v3

It does not require the pipeline to rewrite W2A, W3, or W4 first.

---

## 10. Open follow-ups for later phases

- define the actual `book_configs` migration
- define how `is_active` is promoted safely in production
- decide whether a later admin UI should publish configs or only inspect them
- decide whether a later phase needs format-level QA overrides in the published row shape

For Phase 0, the important point is now explicit:

**author in repo, publish immutable snapshot to Supabase, pin exact version into the manifest at W0.**
