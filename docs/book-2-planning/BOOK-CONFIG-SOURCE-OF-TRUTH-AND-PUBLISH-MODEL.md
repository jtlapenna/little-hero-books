# Book Config Source Of Truth And Publish Model

**Purpose:** define where `book_config` lives, how it becomes runtime-readable, and how orders pin an exact config version.
**Status:** In progress
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

- typed bundled config loading already exists in [load-book-config.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/load-book-config.ts)
- a published snapshot runtime reader now exists in [runtime-book-config.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/runtime-book-config.ts)
- the first publish script now exists at [publish-book-config.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/publish-book-config.ts)
- the current W0 path still hardcodes Book 1 assumptions into code and manifest generation instead of loading a pinned published snapshot

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

Current implementation status:

- implemented: bundled config validation plus publish script
- implemented: published snapshot read path with bundled fallback
- implemented in repo: `book_configs` migration SQL at [migration-add-book-configs.sql](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-book-configs.sql)
- implemented in repo: migration apply helper at [apply-book-configs-migration.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/apply-book-configs-migration.ts)
- implemented in repo: publish verification helper at [verify-book-config-publish.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/verify-book-config-publish.ts)
- completed in live Supabase: `book_configs` table created and Book 1 `book-mvp-simple-adventure@v1` published as the active snapshot
- implemented: published-snapshot replay harness at [test-book-replay.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-book-replay.ts) with checked-in Book 1 order fixtures
- implemented: async runtime-backed W0 manifest builders in [build-run-manifest.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/build-run-manifest.ts) and [w0-manifest-builder.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w0-manifest-builder.ts)
- implemented for the admin recovery seam: [create-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts) can now rebuild v3 manifests against the published snapshot path with `published-first` behavior
- implemented in repo exports: W0 main/sibling now call [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w0/build-manifest/route.ts) and [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w0/upsert-order/route.ts) so manifest build + order-row persistence are repo-owned, while n8n still handles normalization/orchestration/R2 upload
- note from this machine: the project still does not expose `public.exec_sql(...)`, so automated DDL depends on a Management API token or manual SQL execution
- not yet completed in production: importing those updated W0 exports into live n8n and proving the Book 1 path end to end

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

Current practical state:

- shared runtime readers can already follow this rule
- replay tooling now follows this rule when run with `npm run test:book-replay`
- the admin manifest recovery path can now follow this rule for v3 rebuilds
- the versioned W0 exports are now wired for this rule, but the live n8n import/test pass is still the remaining cutover target

### Local development

Local/dev can support two modes:

- direct repo read for fast iteration
- Supabase snapshot read for integration testing

Recommended rule:

- local code may read directly from repo
- shared runtime paths may prefer the published snapshot path and fall back to bundled config until the table is present
- replay and admin cutover paths should prefer published snapshots now
- the next live proof point should be Book 1 through the updated W0 exports before we treat published-snapshot W0 as production-default

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

- define or commit the actual `book_configs` migration
- define how `is_active` is promoted safely in production
- decide whether a later admin UI should publish configs or only inspect them
- decide whether a later phase needs format-level QA overrides in the published row shape

For Phase 0, the important point is now explicit:

**author in repo, publish immutable snapshot to Supabase, pin exact version into the manifest at W0.**
