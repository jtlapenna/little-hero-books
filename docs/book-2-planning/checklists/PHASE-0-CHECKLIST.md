# Phase 0 Checklist: Contract Lock And Inventory Baseline

**Purpose:** convert Phase 0 of the Book 2 implementation plan into an execution checklist that can be used as a real task list.
**Status:** Draft
**Created:** 2026-03-14

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

- [ ] Finalized v1 config contract
- [ ] Finalized v1 manifest contract
- [ ] Written `book_config` source-of-truth and publish model
  - [BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md)
- [ ] Written manifest v2/v3 coexistence and rollback plan
  - [MANIFEST-V2-V3-CUTOVER-STRATEGY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/MANIFEST-V2-V3-CUTOVER-STRATEGY.md)
- [ ] Hardcoded Book 1 audit
  - [BOOK-1-HARDCODED-AUDIT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-1-HARDCODED-AUDIT.md)
- [ ] Asset taxonomy and pathing rules
  - [ASSET-TAXONOMY-AND-PATHING-RULES.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/ASSET-TAXONOMY-AND-PATHING-RULES.md)
- [ ] Explicit decision note for the first repo-owned implementation boundary
  - [FIRST-REPO-OWNED-BOUNDARY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/FIRST-REPO-OWNED-BOUNDARY.md)

---

## A. Lock The Core Contracts

- [ ] Review [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md) for unresolved v1 decisions
- [ ] Confirm `formats[*].interior.pageSequence` is the authoritative page blueprint
- [ ] Confirm page labels stay absolute internal labels like `p00`, `p01`, `p02`
- [ ] Confirm `poseNumber` lives on page entries for v1
- [ ] Confirm QA remains book-level by default for v1
- [ ] Confirm shipping mapping stays in global runtime config
- [ ] Confirm Book 2 assumes the same print/render stack as Book 1 for v1
- [ ] Review [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md) for stage contract completeness
- [ ] Confirm `W0` is responsible for freezing:
  - resolved page plan
  - resolved print settings
  - resolved QA policy
- [ ] Confirm later stages are not allowed to mutate `book.resolved.pagePlan`
- [ ] Record any remaining non-blocking open questions separately so they do not hold Phase 1

Definition of done:

- [ ] The config and manifest docs can be treated as implementation inputs, not brainstorming notes

---

## B. Define `book_config` Ownership And Publish Model

- [ ] Choose the canonical repo location for authored `book_config`
- [ ] Decide file format for authored config
  - likely JSON or TypeScript data
- [ ] Define the publish path into Supabase
- [ ] Define which fields identify a runtime config snapshot
  - `bookId`
  - `version`
  - `formatId`
- [ ] Define whether runtime always reads from Supabase, or can read directly from repo in local/dev mode
- [ ] Define version pinning behavior at order start
  - recommended: W0 pins explicit version into the manifest
- [ ] Define who/what is allowed to publish a new config version
- [ ] Define validation gates before publish

Output to produce:

- [ ] A short written source-of-truth and publish-model note
  - [BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md)

Definition of done:

- [ ] An engineer can answer “where does config live?” and “what exact config did this order use?” without ambiguity

---

## C. Define Manifest Cutover And Rollback Rules

- [ ] Decide whether cutover happens:
  - by stage
  - by workflow
  - by order cohort
- [ ] Inventory which current readers assume `lhb.run-manifest@v2.0`
- [ ] Identify which readers must temporarily support both `v2.0` and `v3`
- [ ] Decide whether W0 temporarily writes both manifest shapes or only `v3`
- [ ] Define rollback behavior if a downstream stage is not yet `v3`-ready
- [ ] Define how in-flight orders created under `v2.0` continue safely during migration
- [ ] Define how replay/testing should indicate manifest version

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

- [ ] A concise manifest cutover note with coexistence and rollback rules
  - [MANIFEST-V2-V3-CUTOVER-STRATEGY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/MANIFEST-V2-V3-CUTOVER-STRATEGY.md)

Definition of done:

- [ ] It is clear how `v2.0` and `v3` orders coexist without breaking in-flight work

---

## D. Produce The Hardcoded Book 1 Audit

- [ ] Create an audit table with these columns:
  - file/workflow
  - hardcoded value
  - assumption type
  - risk if unchanged
  - target replacement
- [ ] Search for hardcoded `book-mvp-simple-adventure`
- [ ] Search for hardcoded manifest filenames and keys
- [ ] Search for hardcoded page counts
- [ ] Search for hardcoded page labels and page numbers
- [ ] Search for hardcoded background, overlay, and pose asset paths
- [ ] Search for hidden pose-to-page mappings

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

- [ ] A hardcoded Book 1 audit doc or table
  - [BOOK-1-HARDCODED-AUDIT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-1-HARDCODED-AUDIT.md)

Definition of done:

- [ ] You have a concrete list of what must be de-hardcoded before or during migration

---

## E. Produce The Asset Taxonomy And Pathing Rules

- [ ] Define canonical book-scoped asset roots
- [ ] Define character asset roots
- [ ] Define generated order asset roots
- [ ] Define manifest path rules
- [ ] Define preview image path rules
- [ ] Define cover/interior PDF path rules
- [ ] Define named background slot conventions
- [ ] Define named overlay slot conventions
- [ ] Define pose asset naming conventions
- [ ] Define whether format-specific assets live under:
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

- [ ] An asset taxonomy and pathing rules doc in `docs/book-2-planning/`
  - [ASSET-TAXONOMY-AND-PATHING-RULES.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/ASSET-TAXONOMY-AND-PATHING-RULES.md)

Definition of done:

- [ ] Future Book 2 assets can be named and stored without inventing new conventions ad hoc

---

## F. Choose The First Repo-Owned Implementation Boundary

- [ ] Confirm the first repo-owned boundary is:
  - config load + validation
  - page-plan resolution
  - manifest building
  - manifest validation
- [ ] Explicitly reject bigger initial scope:
  - full W2A rewrite
  - full W3 rewrite
  - full orchestration rewrite
- [ ] Define the exact first code area to create
  - recommended: `back-end/src/lib/books/`
- [ ] Define the exact first outputs to support
  - Book 1 `standard`
  - Book 1 `amazon`
  - `1-manifest` v3 generation

Output to produce:

- [ ] A short boundary decision note
  - [FIRST-REPO-OWNED-BOUNDARY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/FIRST-REPO-OWNED-BOUNDARY.md)

Definition of done:

- [ ] Phase 1 can begin writing code without reopening the scope question

---

## Final Phase 0 Signoff

- [ ] Contract docs are stable enough to code against
- [ ] `book_config` source-of-truth and publish model are documented
- [ ] Manifest coexistence/rollback rules are documented
- [ ] Hardcoded Book 1 audit exists
- [ ] Asset taxonomy doc exists
- [ ] First repo-owned boundary is explicitly chosen
- [ ] Phase 1 is unblocked

If all boxes above are checked, Phase 0 is complete.
