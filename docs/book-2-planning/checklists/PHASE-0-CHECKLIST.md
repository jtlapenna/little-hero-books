# Phase 0 Checklist: Contract Lock And Inventory Baseline

**Purpose:** convert Phase 0 of the Book 2 implementation plan into an execution checklist that can be used as a real task list.
**Status:** Complete
**Created:** 2026-03-14

Completion note:

- Phase 0 planning deliverables were completed in commit `12f098c` on 2026-03-14.
- This checklist is now the historical signoff record for that phase.

Parent docs:

- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md)
- [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md)

---

## Phase objective

Finish the design and inventory work needed so implementation can begin without reopening architecture decisions.

Phase 0 is complete when:

- the v1 contracts are stable enough to code against
- the `book_config` source-of-truth and publish model are explicit
- the manifest cutover strategy is explicit
- the current Book 1 hardcoded surface area is inventoried
- asset taxonomy/pathing rules are written down
- the first repo-owned implementation boundary is formally chosen

---

## Deliverables

- [x] Finalized v1 config contract
- [x] Finalized v1 manifest contract
- [x] Written `book_config` source-of-truth and publish model
  - [BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md)
- [x] Written manifest v2/v3 coexistence and rollback plan
  - [MANIFEST-V2-V3-CUTOVER-STRATEGY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/MANIFEST-V2-V3-CUTOVER-STRATEGY.md)
- [x] Hardcoded Book 1 audit
  - [BOOK-1-HARDCODED-AUDIT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-1-HARDCODED-AUDIT.md)
- [x] Asset taxonomy and pathing rules
  - [ASSET-TAXONOMY-AND-PATHING-RULES.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/ASSET-TAXONOMY-AND-PATHING-RULES.md)
- [x] Explicit decision note for the first repo-owned implementation boundary
  - [FIRST-REPO-OWNED-BOUNDARY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/FIRST-REPO-OWNED-BOUNDARY.md)

---

## A. Lock The Core Contracts

- [x] Review [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md) for unresolved v1 decisions
- [x] Confirm `formats[*].interior.pageSequence` is the authoritative page blueprint
- [x] Confirm page labels stay absolute internal labels like `p00`, `p01`, `p02`
- [x] Confirm `poseNumber` lives on page entries for v1
- [x] Confirm QA remains book-level by default for v1
- [x] Confirm shipping mapping stays in global runtime config
- [x] Confirm Book 2 assumes the same print/render stack as Book 1 for v1
- [x] Review [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md) for stage contract completeness
- [x] Confirm `W0` is responsible for freezing:
  - resolved page plan
  - resolved print settings
  - resolved QA policy
- [x] Confirm later stages are not allowed to mutate `book.resolved.pagePlan`
- [x] Record any remaining non-blocking open questions separately so they do not hold Phase 1

Definition of done:

- [x] The config and manifest docs can be treated as implementation inputs, not brainstorming notes

---

## B. Define `book_config` Ownership And Publish Model

- [x] Choose the canonical repo location for authored `book_config`
- [x] Decide file format for authored config
  - likely JSON or TypeScript data
- [x] Define the publish path into Supabase
- [x] Define which fields identify a runtime config snapshot
  - `bookId`
  - `version`
  - `formatId`
- [x] Define whether runtime always reads from Supabase, or can read directly from repo in local/dev mode
- [x] Define version pinning behavior at order start
  - recommended: W0 pins explicit version into the manifest
- [x] Define who/what is allowed to publish a new config version
- [x] Define validation gates before publish

Output to produce:

- [x] A short written source-of-truth and publish-model note
  - [BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md)

Definition of done:

- [x] An engineer can answer “where does config live?” and “what exact config did this order use?” without ambiguity

---

## C. Define Manifest Cutover And Rollback Rules

- [x] Decide whether cutover happens:
  - by stage
  - by workflow
  - by order cohort
- [x] Inventory which current readers assume `lhb.run-manifest@v2.0`
- [x] Identify which readers must temporarily support both `v2.0` and `v3`
- [x] Decide whether W0 temporarily writes both manifest shapes or only `v3`
- [x] Define rollback behavior if a downstream stage is not yet `v3`-ready
- [x] Define how in-flight orders created under `v2.0` continue safely during migration
- [x] Define how replay/testing should indicate manifest version

Files and workflows to inspect:

- [w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json)
- [w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-Orchestrator.json)
- [w2B-main-orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-main-orchestrator.json)
- [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json)
- [w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json)
- [SIBLING - w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w0-Order_Intake_Validation.json)
- [SIBLING - w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w4-PRODUCTION-Print_Fulfillment.json)
- [SIBLING - w4.1-Sibling-Aggregation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w4.1-Sibling-Aggregation.json)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/manifests/[...path]/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts)

Output to produce:

- [x] A concise manifest cutover note with coexistence and rollback rules
  - [MANIFEST-V2-V3-CUTOVER-STRATEGY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/MANIFEST-V2-V3-CUTOVER-STRATEGY.md)

Definition of done:

- [x] It is clear how `v2.0` and `v3` orders coexist without breaking in-flight work

---

## D. Produce The Hardcoded Book 1 Audit

- [x] Create an audit table with these columns:
  - file/workflow
  - hardcoded value
  - assumption type
  - risk if unchanged
  - target replacement
- [x] Search for hardcoded `book-mvp-simple-adventure`
- [x] Search for hardcoded manifest filenames and keys
- [x] Search for hardcoded page counts
- [x] Search for hardcoded page labels and page numbers
- [x] Search for hardcoded background, overlay, and pose asset paths
- [x] Search for hidden pose-to-page mappings

Priority files:

- [pre-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/pre-bria-stage.tsx)
- [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx)
- [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx)
- [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts)
- [preview-canonicals.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/preview-canonicals.ts)
- [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts)
- [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json)
- [SIBLING - w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w3-Book-Assembly.json)
- [w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW3-Upload.json)
- [SIBLING - w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-SW3-Upload.json)

Output to produce:

- [x] A hardcoded Book 1 audit doc or table
  - [BOOK-1-HARDCODED-AUDIT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-1-HARDCODED-AUDIT.md)

Definition of done:

- [x] You have a concrete list of what must be de-hardcoded before or during migration

---

## E. Produce The Asset Taxonomy And Pathing Rules

- [x] Define canonical book-scoped asset roots
- [x] Define character asset roots
- [x] Define generated order asset roots
- [x] Define manifest path rules
- [x] Define preview image path rules
- [x] Define cover/interior PDF path rules
- [x] Define named background slot conventions
- [x] Define named overlay slot conventions
- [x] Define pose asset naming conventions
- [x] Define whether format-specific assets live under:
  - per-format subpaths
  - or shared roots with named slot indirection

Files to inspect while drafting:

- [r2-service.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-service.ts)
- [r2-utils.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-utils.ts)
- [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts)
- [preview-canonicals.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/preview-canonicals.ts)
- [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json)
- [SIBLING - w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w3-Book-Assembly.json)

Output to produce:

- [x] An asset taxonomy and pathing rules doc in `docs/book-2-planning/`
  - [ASSET-TAXONOMY-AND-PATHING-RULES.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/ASSET-TAXONOMY-AND-PATHING-RULES.md)

Definition of done:

- [x] Future Book 2 assets can be named and stored without inventing new conventions ad hoc

---

## F. Choose The First Repo-Owned Implementation Boundary

- [x] Confirm the first repo-owned boundary is:
  - config load + validation
  - page-plan resolution
  - manifest building
  - manifest validation
- [x] Explicitly reject bigger initial scope:
  - full W2A rewrite
  - full W3 rewrite
  - full orchestration rewrite
- [x] Define the exact first code area to create
  - recommended: `back-end/src/lib/books/`
- [x] Define the exact first outputs to support
  - Book 1 `standard`
  - Book 1 `amazon`
  - `1-manifest` v3 generation

Output to produce:

- [x] A short boundary decision note
  - [FIRST-REPO-OWNED-BOUNDARY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/FIRST-REPO-OWNED-BOUNDARY.md)

Definition of done:

- [x] Phase 1 can begin writing code without reopening the scope question

---

## Final Phase 0 Signoff

- [x] Contract docs are stable enough to code against
- [x] `book_config` source-of-truth and publish model are documented
- [x] Manifest coexistence/rollback rules are documented
- [x] Hardcoded Book 1 audit exists
- [x] Asset taxonomy doc exists
- [x] First repo-owned boundary is explicitly chosen
- [x] Phase 1 is unblocked

If all boxes above are checked, Phase 0 is complete.
