# Book 2 Implementation Plan

**Purpose:** define the concrete phased execution plan for making the pipeline Book-2-ready without forking Book 1 and Book 2 into permanently separate workflow trees.
**Status:** In progress
**Created:** 2026-03-14
**Last Updated:** 2026-03-18

Companion docs:

- [BOOK-2-PREP-PRIORITY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-PREP-PRIORITY.md)
- [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md)
- [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md)
- [BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md)
- [MANIFEST-V2-V3-CUTOVER-STRATEGY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/MANIFEST-V2-V3-CUTOVER-STRATEGY.md)
- [ASSET-TAXONOMY-AND-PATHING-RULES.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/ASSET-TAXONOMY-AND-PATHING-RULES.md)
- [BOOK-1-HARDCODED-AUDIT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-1-HARDCODED-AUDIT.md)
- [FIRST-REPO-OWNED-BOUNDARY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/FIRST-REPO-OWNED-BOUNDARY.md)
- [PHASE-0-CHECKLIST.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/checklists/PHASE-0-CHECKLIST.md)
- [book2-hybrid-move-from-n8n.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/book2-hybrid-move-from-n8n.md)

---

## Current status snapshot (2026-03-18)

### Commit-backed milestones

The committed planning history for this work currently looks like:

- `dbe48e9` - initial Book 2 implementation planning doc
- `5d9f351` - refinement of the implementation plan
- `3b3c288` - addition of the Phase 0 execution checklist
- `12f098c` - completion/signoff of the Phase 0 deliverables
- `f809c61` - shared repo-owned book kernel foundation
- `ff2c870` - runtime wiring onto the shared book kernel

### Current repo state

- Phase 0 is complete and committed.
- The first repo-owned shared kernel is now committed under:
  - `back-end/src/lib/books/`
  - `back-end/src/lib/w0-manifest-builder.ts`
  - `back-end/scripts/test-book-kernel.ts`
- That kernel currently covers:
  - typed `BookConfig` and `RunManifest` schemas
- bundled config loading
- page-plan resolution
- W0 `lhb.run-manifest@v3` building and validation
- legacy/v3 manifest normalization
- 2B pose-requirement loading from companion W0 manifests
- review page-plan fallback helpers
- The first runtime-adoption slice is also now committed, including:
  - repo-backed admin manifest creation and normalization paths
  - dynamic manifest/order-root resolution via `order-paths`
  - review UI consumers using `bookContext` / manifest-derived page semantics
  - dynamic order-root handling in W2B, W3, and W4
  - generalized render/asset helpers for non-Book-1 order roots
- The active repo-owned migration path is now using the sibling exports as the source of truth for workflow changes:
  - `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/`
- The sibling W0 export now calls repo-owned internal routes for canonical `1-manifest` build + order upsert.
- The sibling W2A orchestrator now calls repo-owned internal routes for:
  - pose worklist resolution from the frozen page plan
  - `2a-manifest` bootstrap build + upload
  - final `2a-manifest` build + upload
- The kernel test harness currently passes via `npm run test:book-kernel`.
- A first published-snapshot replay harness now exists at:
  - `back-end/scripts/test-book-replay.ts`
  - `back-end/src/lib/books/fixtures/order-intake/`
- That replay harness now passes against the live published Book 1 snapshot via `npm run test:book-replay`.
- The current bundled config set is still Book-1-only:
  - `back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`
- There is still no actual Book 2 authored config or asset/config onboarding in the repo yet.
- Several runtime paths still carry Book 1 defaults or fallback assumptions, so full Book 2 onboarding is not ready yet.

### Practical status

The project is no longer in pure planning mode, but it is also not yet at “add Book 2 config and ship.”

The real state today is:

1. the contracts and migration direction are defined
2. the shared kernel and first runtime-adoption slice are now committed in repo code
3. the system still needs the remaining de-hardcoding work plus an actual Book 2 config before Book 2 can ride the shared path

---

## 1. Planning assumptions

This plan assumes the decisions already made:

- each book format owns its own `formats[*].interior.pageSequence`
- page labels remain absolute internal labels like `p00`, `p01`, `p02`
- each page entry carries its own `poseNumber` in v1
- manifests freeze the resolved page plan and QA policy at order start
- QA stays book-level by default in v1
- shipping mapping stays in global runtime config
- Book 2 uses the same render and print stack as Book 1 in v1

The goal is not just "support Book 2." The goal is:

**support Book 2 by introducing a shared, config-driven kernel that Book 1 also uses.**

Operational planning assumptions for implementation:

- `book_config` should be **authored and versioned in the repo**, then published into Supabase as a runtime-readable snapshot
- the system will need a **mixed-manifest period** where current `lhb.run-manifest@v2.0` readers and new `lhb.run-manifest@v3` readers can coexist safely
- asset taxonomy should be treated as a first-class implementation deliverable, not just a planning concept
- replay tooling should arrive early enough to support migration work, not only final validation

---

## 2. Current system touchpoints that this plan must address

### Existing workflow exports

Single-item workflow exports:

- [w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json)
- [w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-Orchestrator.json)
- [w2A-SW0-Base_Character_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW0-Base_Character_Generation.json)
- [w2A-SW1-Pose_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW1-Pose_Generation.json)
- [w2A-SW2-Pose_and_Style_QA.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW2-Pose_and_Style_QA.json)
- [w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW3-Upload.json)
- [w2B-main-orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-main-orchestrator.json)
- [w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-sw1-single-pose.json)
- [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json)
- [w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json)

Sibling workflow exports:

- [SIBLING - w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w0-Order_Intake_Validation.json)
- [SIBLING - w1.1-Queue_Manager_and_Router.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json)
- [SIBLING - w1.5-Health_Monitor.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.5-Health_Monitor.json)
- [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json)
- [SIBLING - w2A-SW0-Base_Character_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-SW0-Base_Character_Generation.json)
- [SIBLING - w2A-SW1-Pose_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-SW1-Pose_Generation.json)
- [SIBLING - w2A-SW2-Pose_and_Style_QA.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-SW2-Pose_and_Style_QA.json)
- [SIBLING - w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-SW3-Upload.json)
- [SIBLING - w2B-main-orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2B-main-orchestrator.json)
- [SIBLING - w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2B-sw1-single-pose.json)
- [SIBLING - w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w3-Book-Assembly.json)
- [SIBLING - w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w4-PRODUCTION-Print_Fulfillment.json)
- [SIBLING - w4.1-Sibling-Aggregation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w4.1-Sibling-Aggregation.json)

### Current backend files with Book 1 assumptions

These are likely first-wave backend touchpoints for de-hardcoding:

- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/manifests/[...path]/route.ts)
- [pre-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/pre-bria-stage.tsx)
- [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx)
- [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx)
- [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts)
- [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts)
- [preview-canonicals.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/preview-canonicals.ts)
- [r2-service.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-service.ts)
- [r2-utils.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-utils.ts)

### Current backend APIs tied to existing manifest shapes

- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/sync-2b-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/regenerate-pose/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/auto-flip-pose/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/flag/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/unflag/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/approve/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/print/route.ts)

### Related open issues that should be folded into execution

- [31-supabase-columns-not-populated-audit-and-fixes.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/31-supabase-columns-not-populated-audit-and-fixes.md)
- [32-missing-2a-manifest-urls-on-completed-orders.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/32-missing-2a-manifest-urls-on-completed-orders.md)
- [46-gemini-image-generation-daily-quota-hardening.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/46-gemini-image-generation-daily-quota-hardening.md)
- [49-sibling-orders-require-group-send-to-print.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/49-sibling-orders-require-group-send-to-print.md)

---

## 3. Success criteria

Book 2 should be considered implementation-ready only when:

1. W0 can select a `bookId` and `formatId`, load `book_config`, and freeze a valid `1-manifest`.
2. W2A / W2B / W3 / W4 consume the frozen plan instead of re-deriving Book 1 assumptions.
3. The backend admin/review UI can read manifests and assets without hardcoding `book-mvp-simple-adventure`.
4. Single-item and sibling orders both preserve correct `orderId` vs `rootOrderId` semantics.
5. A replay harness can run at least one full stage locally against recorded Book 1 and Book 2 fixtures.
6. Book 2 can be onboarded mainly by adding config and assets, not cloning the whole workflow tree.

---

## 4. Phase plan

## Phase 0: Contract lock and inventory baseline

**Goal:** finish the planning artifacts and inventory the current hardcoded surface area before implementation starts.

### Tasks

- Freeze the first contract set:
  - [BOOK-CONFIG-SCHEMA-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SCHEMA-DRAFT.md)
  - [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md)
- Decide and document the `book_config` lifecycle:
  - repo authoring location
  - publish process into Supabase
  - runtime lookup semantics
  - version pinning rules
- Define the manifest cutover strategy:
  - how `v2.0` and `v3` manifests coexist
  - which readers must support both
  - whether cutover is by stage, by workflow, or by order cohort
- Produce a hardcoded-book audit covering:
  - `book-mvp-simple-adventure`
  - Book 1-specific background path assumptions
  - fixed manifest filenames and page count assumptions
- Produce an asset taxonomy and storage-rules doc covering:
  - book-scoped asset roots
  - format-aware manifests
  - named asset slots
  - generated asset path rules
- Decide the first repo-owned implementation boundary.

### Recommended boundary

Start with:

- config load + validation
- page-plan resolution
- manifest building
- manifest validation

Do **not** start with a full workflow rewrite.

### Deliverables

- final v1 planning docs
- documented `book_config` source-of-truth and publish model
- documented manifest v2/v3 coexistence strategy
- inventory list of hardcoded Book 1 touchpoints
- asset taxonomy and pathing rules
- one decision doc naming the first repo-owned step
- execution checklist:
  - [PHASE-0-CHECKLIST.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/checklists/PHASE-0-CHECKLIST.md)

Phase 0 deliverable docs:

- [BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-CONFIG-SOURCE-OF-TRUTH-AND-PUBLISH-MODEL.md)
- [MANIFEST-V2-V3-CUTOVER-STRATEGY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/MANIFEST-V2-V3-CUTOVER-STRATEGY.md)
- [ASSET-TAXONOMY-AND-PATHING-RULES.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/ASSET-TAXONOMY-AND-PATHING-RULES.md)
- [BOOK-1-HARDCODED-AUDIT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-1-HARDCODED-AUDIT.md)
- [FIRST-REPO-OWNED-BOUNDARY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/FIRST-REPO-OWNED-BOUNDARY.md)

### Validation

- all future phases reference the same `book_config` and manifest contracts
- no remaining "open question" should block Phase 1

---

## Phase 1: Runtime contract cleanup in current system

**Goal:** reduce ambiguity in the existing Book 1 pipeline before adding Book 2.

**Current status:** complete as of 2026-03-17. The Phase 1 deliverables now exist and the main runtime guardrail gap for sibling print submission is closed.

### Tasks

- Resolve or materially reduce the risk in:
  - [31-supabase-columns-not-populated-audit-and-fixes.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/31-supabase-columns-not-populated-audit-and-fixes.md)
  - [32-missing-2a-manifest-urls-on-completed-orders.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/32-missing-2a-manifest-urls-on-completed-orders.md)
  - [49-sibling-orders-require-group-send-to-print.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/49-sibling-orders-require-group-send-to-print.md)
- Inventory which `orders` columns are authoritative at each stage.
- Standardize manifest URL / key ownership across W0, W2A, W2B, W3, and W4.
- Confirm the group-send invariant for sibling orders before expanding grouped-book complexity.

### Files and workflows to inspect/update

- [SIBLING - w1.1-Queue_Manager_and_Router.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json)
- [SIBLING - w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w4-PRODUCTION-Print_Fulfillment.json)
- [SIBLING - w4.1-Sibling-Aggregation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w4.1-Sibling-Aggregation.json)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/print/route.ts)
- [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts)

### Deliverables

- a field-ownership table for `orders`
- [orders-column-ownership-matrix.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_artifacts/orders-column-ownership-matrix.md)
- [manifest-pointer-ownership-table.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_artifacts/manifest-pointer-ownership-table.md)
- documented sibling send-to-print policy in [49-sibling-orders-require-group-send-to-print.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/49-sibling-orders-require-group-send-to-print.md)

### Exit criteria

- no stage depends on nonexistent Supabase columns for normal error handling
- manifest URLs and keys are consistently available or intentionally derivable
- sibling orders cannot be partially sent to print accidentally

---

## Phase 2: Create the shared repo-owned book kernel

**Goal:** introduce typed repo code that owns book-specific decisions instead of leaving them embedded in n8n Code nodes or UI helpers.

**Current status:** initial foundation committed in `f809c61`.

Current implementation includes:

- `back-end/src/lib/books/types.ts`
- `back-end/src/lib/books/load-book-config.ts`
- `back-end/src/lib/books/resolve-page-plan.ts`
- `back-end/src/lib/books/build-run-manifest.ts`
- `back-end/src/lib/books/validate-run-manifest.ts`
- `back-end/src/lib/books/normalize-w0-manifest.ts`
- `back-end/src/lib/books/read-2b-manifest.ts`
- `back-end/src/lib/books/review-page-plan.ts`

Important limitation:

- only Book 1 is currently bundled as config input
- only Book 1 is currently published/readable unless additional `book_configs` rows are published

### Tasks

- Create a new backend module area, recommended under:
  - `/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/`
- Define types under:
  - `/Users/jeff/Projects/little-hero-books/back-end/src/types/`
- Implement:
  - `BookConfig` type
  - config loader
  - config validator
  - format selector
  - page-plan resolver
  - manifest builder
  - manifest validator
- Implement the config publication/runtime pattern:
  - canonical config files in repo
  - validation at publish time
  - Supabase runtime snapshot write/read path
  - explicit `bookId + version + formatId` lookup semantics
- Add central path/key helpers for:
  - order prefix
  - character prefix
  - manifest keys
  - preview image keys
  - cover/interior PDF keys
- Implement asset taxonomy helpers for:
  - named background slots
  - named overlay slots
  - pose asset roots
  - generated order/character prefixes

### Current files this should replace or de-hardcode over time

- [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts)
- [preview-canonicals.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/preview-canonicals.ts)
- [r2-service.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-service.ts)
- [r2-utils.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/r2-utils.ts)
- [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts)

### Recommended new code shape

- `back-end/src/lib/books/types.ts`
- `back-end/src/lib/books/config-loader.ts`
- `back-end/src/lib/books/resolve-format.ts`
- `back-end/src/lib/books/resolve-page-plan.ts`
- `back-end/src/lib/books/manifest-v3.ts`
- `back-end/src/lib/books/paths.ts`

### Deliverables

- one reusable typed module that can resolve Book 1 today and Book 2 later
- one publish/read path for `book_config`
- unit tests for:
  - config loading
  - format selection
  - page-plan resolution
  - manifest v3 building

### Exit criteria

- Book 1 can be expressed through the new config model
- the backend can resolve page plans without hardcoded `page00` / `page05` assumptions in business logic

---

## Phase 2.5: Early replay harness for migration work

**Goal:** ensure contract and migration work can be tested locally before W0 and downstream cutovers begin.

**Current status:** minimum Book 1 replay harness is now in place.

Current harness:

- `back-end/scripts/test-book-kernel.ts`
- `back-end/scripts/test-book-replay.ts`
- `back-end/src/lib/books/fixtures/order-intake/book1-standard-single.json`
- `back-end/src/lib/books/fixtures/order-intake/book1-amazon-single.json`
- `back-end/src/lib/books/fixtures/order-intake/book1-amazon-sibling.json`

What it already covers:

- Book 1 standard page-plan resolution
- Book 1 Amazon page-plan resolution
- W0 manifest v3 building/validation
- legacy/v3 normalization checks
- workflow contract assertions for W3/W4
- published `book_configs` replay for Book 1 standard, Amazon single-item, and Amazon sibling fixtures
- published-vs-bundled parity checks for the resolved Book 1 page plan
- explicit `book.bookConfigRef.version` pinning in the replayed v3 manifests

What is still missing for the original goal:

- a real Book 2 fixture
- a real Book 2 config in the bundle set
- a broader stage runner beyond the current kernel checks

### Tasks

- Build a minimum repo-local runner that can:
  - load a Book 1 fixture
  - load `book_config`
  - resolve the page plan
  - build and validate `1-manifest` v3
- Add fixture cases for:
  - Book 1 standard single-item
  - Book 1 amazon single-item
  - Book 1 sibling order
- Add a compatibility check for mixed-manifest handling where needed.

### Deliverables

- implemented: minimum replay command for config -> page plan -> `1-manifest`
  - `npm run test:book-replay`
- implemented: small Book 1 fixture set checked into the repo
- pending: schema validation in CI for the minimum harness

### Exit criteria

- W0 conversion can be tested locally before live workflow changes
- the team can validate config and manifest changes without relying on n8n runs

---

## Phase 3: W0 conversion to config-driven `1-manifest`

**Goal:** make W0 the first shared kernel entry point.

**Current status:** repo-side cutover seam is in place; live Book 1 import/testing is the next gate.

Current working-tree implementation already includes:

- `back-end/src/lib/w0-manifest-builder.ts`
- repo-side W0 v3 manifest generation through `buildW0RunManifest()`
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w0/build-manifest/route.ts) for repo-owned W0 manifest building with `published-first` config loading
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w0/upsert-order/route.ts) for repo-owned per-book `orders` upsert
- the versioned main/sibling W0 exports at [w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json) and [SIBLING - w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w0-Order_Intake_Validation.json) now call those internal routes instead of building the manifest or patching Supabase inline

What is not done yet:

- importing the updated W0 exports into live n8n and proving the Book 1 path end to end
- moving the remaining W0 normalization/dedication parsing/R2-upload orchestration behind repo-owned seams if we decide that extra thinning is worth it
- actual Book 2 selection/onboarding path
- final mixed-manifest production rollout across live workflow boundaries

### Tasks

- Update W0 to:
  - determine `bookId`
  - determine `formatId`
  - load `book_config`
  - resolve the page plan
  - resolve print settings
  - resolve QA policy
  - write `lhb.run-manifest@v3`
- Add mixed-manifest compatibility rules:
  - define whether W0 writes both v2 and v3 temporarily, or only v3 with fallback readers
  - identify every downstream reader that must tolerate both shapes during migration
  - document rollback behavior if a downstream stage is not yet v3-ready
- Keep the surrounding orchestration in n8n, but move the heavy logic into repo code if possible.
- Preserve support for:
  - single-item orders
  - sibling orders
  - Amazon vs D2C formats

### Current implementations to use as source material

- [w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json)
- [SIBLING - w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w0-Order_Intake_Validation.json)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/manifests/[...path]/route.ts)

### Deliverables

- W0 manifest builder that outputs `1-manifest` v3
- a documented cutover/rollback plan for W0 manifest production
- migration notes from current `lhb.run-manifest@v2.0` shape
- one Book 1 fixture manifest and one Book 2 fixture manifest

### Exit criteria

- every later stage can rely on `book.resolved.pagePlan`
- no later stage needs to guess expected page count or page labels

---

## Phase 4: W2A and W2B conversion to the shared contract

**Goal:** make pose generation and background removal consume the frozen page plan rather than embedded Book 1 rules.

### W2A tasks

- Refactor pose requirements to derive from `pagePlan.poseNumber`.
- Ensure pose QA consumes book-level QA policy from the manifest.
- Keep pose-specific prompt behavior as manifest/config-driven data where possible.
- Ensure 2A manifest entries carry `pageLabels` based on the frozen page plan.

### W2B tasks

- Keep the existing working composite-image QA path, but make the stage driven by manifest inputs.
- Ensure background-removal outputs and QA map to page-plan-derived pose/page relationships.
- Standardize `2b-manifest` keys and reconciliation logic.

### Existing sources

Migration note:

- ongoing n8n migration changes should now land in the sibling exports first, because those are the workflows intended to replace the older `finals` copies after validation

- [w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-Orchestrator.json)
- [w2A-SW0-Base_Character_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW0-Base_Character_Generation.json)
- [w2A-SW1-Pose_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW1-Pose_Generation.json)
- [w2A-SW2-Pose_and_Style_QA.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW2-Pose_and_Style_QA.json)
- [w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW3-Upload.json)
- [w2B-main-orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-main-orchestrator.json)
- [w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-sw1-single-pose.json)
- [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json)
- [SIBLING - w2B-main-orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2B-main-orchestrator.json)

### Backend/UI/API touchpoints

- [pre-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/pre-bria-stage.tsx)
- [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/sync-2b-manifest/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/regenerate-pose/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/auto-flip-pose/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/flag/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/unflag/route.ts)

### Deliverables

- `2a-manifest` and `2b-manifest` v3-compatible stage outputs
- clear mapping from poses to page labels
- Book 1 still working through the shared path

### Exit criteria

- W2A no longer needs a hidden Book 1 page/pose map
- W2B can operate from the manifest without assuming fixed Book 1 filenames or pose-to-page rules

---

## Phase 5: W3 conversion to page-plan-driven assembly

**Goal:** make assembly fully consume the frozen `pagePlan`.

### Tasks

- Render interior pages from `pagePlan` instead of hardcoded Book 1 page expectations.
- Resolve backgrounds and overlays from named asset slots in config.
- Generate page previews, cover previews, and PDFs from the manifest-driven plan.
- enforce the asset taxonomy rules agreed in Phase 0 so W3 is not forced to infer Book 1 paths
- Ensure W3 summary data aligns with:
  - `expectedPageCount`
  - `pageLabels`
  - `preview outputs`

### Existing sources

- [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json)
- [SIBLING - w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w3-Book-Assembly.json)
- [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts)
- [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/presign-page-assets/route.ts)

### Deliverables

- W3 assembly path that can render Book 1 and Book 2 from config
- removal of fixed Book 1 page assumptions in assembly code
- W3 replay fixture for both books

### Exit criteria

- `summary.expectedPageCount` comes from manifest/config, not hidden logic
- W3 can handle different page structures for `standard` vs `amazon`

---

## Phase 6: W4 and print-ops hardening on the shared contract

**Goal:** keep print submission operationally safe while allowing Book 2 to ride the same path.

### Tasks

- Update W4/W4.1 to consume the v3 manifest structure.
- Preserve the working renderer QA gate behavior.
- Keep sibling-safe error fanout and single-item-safe behavior.
- Enforce group-send requirements for sibling orders.
- Ensure provider submission and QA use manifest-derived page counts and assets.

### Existing sources

- [w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json)
- [SIBLING - w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w4-PRODUCTION-Print_Fulfillment.json)
- [SIBLING - w4.1-Sibling-Aggregation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w4.1-Sibling-Aggregation.json)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/print/route.ts)
- [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx)
- [46-gemini-image-generation-daily-quota-hardening.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/46-gemini-image-generation-daily-quota-hardening.md)
- [49-sibling-orders-require-group-send-to-print.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/49-sibling-orders-require-group-send-to-print.md)

### Deliverables

- W4 contracts aligned to manifest v3
- explicit group-send safety for sibling orders
- provider-safe Book 2 rollout path

### Exit criteria

- Book 2 can reach print using the same operational safety gates as Book 1
- grouped orders cannot be partially submitted

---

## Phase 7: Test harness and replay tooling

**Goal:** make stage-level development possible without live n8n runs for every change.

### Tasks

- Build a CLI or scripted harness in the repo that can:
  - load a recorded manifest fixture
  - invoke one stage locally
  - validate outputs against schema
- extend the early harness from Phase 2.5 rather than building a second test path
- Capture fixture sets for:
  - Book 1 single-item standard
  - Book 1 sibling order
  - Book 1 amazon format
  - Book 2 standard
  - Book 2 amazon, if applicable
- Add schema validation and fixture checks to CI.

### Existing references

- [sibling-orders-end-to-end-testing-guide.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-orders-end-to-end-testing-guide.md)
- [sibling-orders-test-data-pack.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-orders-test-data-pack.md)
- [test-execution-guide.md](/Users/jeff/Projects/little-hero-books/docs/testing/test-execution-guide.md)

### Recommended scope for first harness

Start with:

- manifest load
- page-plan resolution
- W3 preview assembly validation

Then expand to:

- W2A pose-plan derivation
- W4 print QA input preparation

### Deliverables

- a repo-local replay command
- fixture bundle for Book 1 and Book 2
- CI check for schema validity

### Exit criteria

- at least one stage can be run end-to-end locally from a fixture
- contract regressions are caught before live n8n testing

---

## Phase 8: Book 2 onboarding and staged rollout

**Goal:** onboard Book 2 using config and assets, not workflow duplication.

### Tasks

- Add Book 2 assets using the agreed taxonomy.
- Author Book 2 `book_config`.
- Produce Book 2 format entries:
  - `standard`
  - `amazon`, if needed
- Create Book 2 fixture manifests.
- Run sandbox stage tests.
- Run one internal end-to-end Book 2 order.
- Roll out behind controlled traffic or operator-only usage first.

### Deliverables

- Book 2 config
- Book 2 asset map
- one successful internal Book 2 order through the shared path

### Exit criteria

- Book 2 does not require a second long-lived workflow tree
- adding a future Book 3 would look like "new config + assets + selective overrides", not "copy every workflow"

---

## 5. Parallel tracks that should not block the core plan

- [28-amazon-orders-api-v2026-migration.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/28-amazon-orders-api-v2026-migration.md)
- [05-audit-error-resolution-system.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/05-audit-error-resolution-system.md)
- [09-improve-pose-01-prompt-front-facing.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/09-improve-pose-01-prompt-front-facing.md)
- [30-reprint-badge.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/30-reprint-badge.md)
- [44-refresh-background-art-sharper-less-grainy-handmade-look.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/44-refresh-background-art-sharper-less-grainy-handmade-look.md)
- [15-r2-asset-cleanup-strategy.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/15-r2-asset-cleanup-strategy.md)

These matter, but they should not derail the core book-config -> manifest -> shared-stage migration.

---

## 6. Recommended execution order

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 2.5
5. Phase 3
6. Phase 4
7. Phase 5
8. Phase 7
9. Phase 6
10. Phase 8

Why this order:

- contracts must exist before migration work
- runtime contract cleanup reduces false starts
- repo kernel should exist before W0 conversion
- the first replay harness should exist before the first workflow cutover
- W0 must freeze the page plan before W2A / W2B / W3 can fully consume it
- replay tooling should exist before final rollout hardening and Book 2 onboarding

---

## 7. Immediate next actions

Progress update as of 2026-03-18:

- Phase 0 planning/docs were completed in commit `12f098c`.
- The repo-owned `back-end/src/lib/books/` kernel is now committed in `f809c61` for Book 1 `standard` and `amazon`.
- The first runtime-adoption slice is now committed in `ff2c870`.
- The admin recovery path in [create-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts) now routes through repo-owned manifest code, keeps the canonical `1-manifest.json` key, defaults to `lhb.run-manifest@v2.1`, and can explicitly emit validated `lhb.run-manifest@v3`.
- A shared W0 manifest normalizer now exists in repo code and both [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts) and [create-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts) now consume either legacy or v3 `1-manifest` shape through that normalizer.
- The first committed dual-reader fixtures now exist at [book1-amazon-legacy-v2_1.json](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/fixtures/w0-manifests/book1-amazon-legacy-v2_1.json) and [book1-amazon-v3.json](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/fixtures/w0-manifests/book1-amazon-v3.json), and the current kernel smoke script uses them to prove shared normalization plus v3 page-plan preservation.
- A shared `2b-manifest` reader and pose-requirement helper now exists in repo code, and both [sync-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/sync-2b-manifest/route.ts) and [trigger-book-assembly/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts) now use it to resolve required poses from companion W0 data when available, with the current Book 1 fallback preserved when it is not.
- That same shared `2b-manifest` helper is now also used by [repair-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/repair-2b-manifest/route.ts), and the order-detail API at [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/route.ts) now also exposes a shared `bookContext` plus manifest-derived Post-Bria page/background associations for review UI consumers.
- [w2B-main-orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-main-orchestrator.json) now resolves 2A/2B manifest keys dynamically, derives required-pose coverage from the companion `1-manifest` when available, and keeps the current legacy `2b-manifest` key/shape in place.
- [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json) now resolves dynamic `2b`/`1-manifest` keys, loads the companion W0 manifest when available, carries `pagePlan` and required-pose semantics through the active assembly path, writes preview and `3-manifest` keys on the resolved order root, and keeps the current legacy `3-manifest` schema/key in place.
- [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx) now reads dynamic manifest roots from `order.bookContext` and consumes manifest-derived comparison page/background metadata instead of the fixed Book 1 `poseToFirstPage` map.
- [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx) now reads dynamic `3-manifest` / preview roots from `order.bookContext`, builds spreads from the resolved page sequence, and uses page labels instead of Book 1-only `p00_dedication` / fixed `15/17` fallback reconstruction.
- [w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json) now accepts manifest-provided `orderPrefix`, `pageLabels`, and `pagePlan`-derived counts in the active validation path, and writes `4-manifest` / QA-failure manifests on the resolved order root while keeping the legacy manifest schema in place.
- [qa-check-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/qa-check-pdf/route.ts) now accepts either canonical `pdfR2Key` or signed `pdfUrl`, prefers explicit `previewImageUrls`, and only reconstructs preview refs from `orderPrefix` / `pageLabels` as a fallback.
- [generate-approval-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/generate-approval-pdf/route.ts) now resolves the final PDF root from `asset_prefix` or `project` instead of assuming the Book 1 namespace.
- [api/assets/[...path]/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/assets/[...path]/route.ts) now routes order assets by the generic `{bookId}/orders/` pattern through shared helpers instead of a Book 1-only prefix check.
- A new pure path helper now exists at [order-paths.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-paths.ts), and [pre-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/pre-bria-stage.tsx), [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/orders/[orderId]/page.tsx), [presign-page-assets/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/presign-page-assets/route.ts), and [inline-page-assets/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/inline-page-assets/route.ts) now use shared order-root and bucket-routing semantics instead of literal Book 1 paths in their active code paths.
- That same `order-paths` layer now also provides manifest-key candidate resolution, and the active review actions in [pre-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/pre-bria-stage.tsx), [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx), [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx), and [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/orders/[orderId]/page.tsx) now pass explicit `bookId` / `orderPrefix` hints into [approve/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/approve/route.ts), [flag/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/flag/route.ts), [unflag/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/unflag/route.ts), [regenerate-pose/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/regenerate-pose/route.ts), [regenerate-pose/[jobId]/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/regenerate-pose/[jobId]/route.ts), and [reject-revision/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/reject-revision/route.ts) so those routes only fall back to the Book 1 default root as a last resort.
- [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts), [create-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts), and [repair-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/repair-2b-manifest/route.ts) now derive their active manifest publish/read keys from the companion `1-manifest` or stored manifest URLs before they fall back to the default order root.
- That same `order-paths` seam now also resolves order-like manifest hints for [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/route.ts), [validate-token/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/preview/validate-token/route.ts), [workflow-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2a-complete/route.ts), [workflow-2b-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2b-complete/route.ts), [workflow-3-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-3-complete/route.ts), [regenerate-2a/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/regenerate-2a/route.ts), [regenerate-2b/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/regenerate-2b/route.ts), [regenerate-3/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/regenerate-3/route.ts), [character-specs/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/character-specs/route.ts), and [fix-eye-transparency/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/fix-eye-transparency/route.ts), so those active runtime/admin paths now prefer stored manifest or asset roots before the Book 1 default.
- The remaining runtime/admin bare callers and route-local fallback chains have now also been moved onto that same seam in [order-reset.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-reset.ts), [read-2b-manifest.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/read-2b-manifest.ts), [sync-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/sync-2b-manifest/route.ts), [trigger-book-assembly/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts), [repair-workflow-step/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/repair-workflow-step/route.ts), [auto-flip-pose/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/auto-flip-pose/route.ts), and [replace-image/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/replace-image/route.ts).
- [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts), [get-url/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/backgrounds/get-url/route.ts), and [get-urls/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/backgrounds/get-urls/route.ts) now resolve fallback background asset keys from bundled `book_config` page/background slots with optional `bookId` / `formatId`, while still honoring the legacy Cloudflare mapping env for current Book 1 deployments.
- [preview-canonicals.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/preview-canonicals.ts), [preview/generate/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/preview/generate/route.ts), and the bundled [v1.json](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json) config now resolve preview base/hair asset prefixes from book config instead of a literal Book 1 root, with a convention fallback when preview-specific config is absent.
- [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts) now infers `project` and `assetPrefix` from existing manifest/asset references before falling back to the Book 1 namespace, and now looks up `4-manifest` via the resolved order root instead of a Book 1-only builder.
- Phase 1 runtime cleanup is now closed through the committed ownership artifacts plus the sibling print guardrail:
  - [orders-column-ownership-matrix.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_artifacts/orders-column-ownership-matrix.md)
  - [manifest-pointer-ownership-table.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_artifacts/manifest-pointer-ownership-table.md)
  - [49-sibling-orders-require-group-send-to-print.md](/Users/jeff/Projects/little-hero-books/docs/_ongoing-issues-list/_needs-review/49-sibling-orders-require-group-send-to-print.md)
- The remaining debug-only and request-boundary Book 1 assumptions are now also moved onto the shared seam in [runtime-book-config.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/runtime-book-config.ts), [publish-book-config.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/publish-book-config.ts), [r2/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/debug/r2/route.ts), [r2-diagnostic/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/debug/r2-diagnostic/route.ts), [orders-simple/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/debug/orders-simple/route.ts), [orders-test/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/debug/orders-test/route.ts), [r2-get/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/debug/r2-get/route.ts), [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx), [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx), [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/orders/[orderId]/page.tsx), and [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/route.ts).
- Shared runtime readers can now prefer published `book_configs` snapshots and fall back safely to bundled configs when the published table or row is unavailable. That new path is intentionally additive because W0 still defaults to the bundled config path until the wider cutover/replay work is complete.
- The live Supabase `book_configs` table now exists, Book 1 `book-mvp-simple-adventure@v1` has been published and marked active, and the published-mode runtime read path has been verified through [verify-book-config-publish.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/verify-book-config-publish.ts).
- A new async W0 builder now exists for safe cutover work:
  - [build-run-manifest.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/build-run-manifest.ts)
- The sibling W0 export at [SIBLING - w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w0-Order_Intake_Validation.json) is now wired to repo-owned internal routes for canonical manifest build and per-book order upsert.
- The sibling W2A orchestrator at [SIBLING - w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-Orchestrator.json) now keeps three Book-logic decisions in repo code instead of n8n:
  - pose worklist resolution through [resolve-pose-worklist/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/resolve-pose-worklist/route.ts)
  - `2a-manifest` bootstrap build/upload through [bootstrap-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/bootstrap-manifest/route.ts)
  - final `2a-manifest` build/upload through [build-run-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/build-run-manifest/route.ts)
- Those W2A routes are backed by a shared repo helper at [w2a-manifest.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w2a-manifest.ts), and they have been smoke-tested directly with Book 1-compatible inputs against the live published-config path.
- The repo-centric W2A export at [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json) has now been exercised in live n8n against Book 1-compatible inputs:
  - the bootstrap/pose-plan half reached the legacy `SW0` boundary successfully, proving the repo-owned W2A front-half seams are live
  - the isolated `Simulate TEST-ORDER-016 -> Write Run Manifest1 -> Build + Upload 2A Manifest` branch now passes, proving the repo-owned W2A run-manifest builder/uploader path works in live n8n
  - the final `Supabase — Upsert from 2A Manifest` simulation still fails only because the test branch uses a fake per-item order row (`TEST-ORDER-016-ITEM-001`) that does not exist in `orders`; that is a simulation limitation, not a W2A builder failure
  - [w0-manifest-builder.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w0-manifest-builder.ts)
- Repo-owned W0 HTTP seams now exist at [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w0/build-manifest/route.ts) and [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w0/upsert-order/route.ts), and both the main and sibling W0 exports now call those routes with `published-first` config loading instead of building manifests or patching `orders` inline inside n8n.
- The repo-owned W0 build + upsert route pair has been smoke-tested directly with a throwaway Amazon sibling-style order, including verification that `root_order_id`, `amazon_order_id`, and the canonical `1-manifest` key are preserved through the backend path.
- The published replay harness now proves that Book 1 standard, Amazon single-item, and Amazon sibling fixtures can build validated `lhb.run-manifest@v3` manifests against the live published snapshot while preserving the same resolved page plan as the bundled config.
- The admin recovery path can now opt into published-first config loading for v3 manifest rebuilds, so manual/recovery manifests stop depending on implicit bundled-latest behavior.

From the current state, the next concrete actions should be:

1. Start the repo-centric `W2B` migration using Book 1 as the dress rehearsal, since the repo-centric `W0` path is live and the repo-centric `W2A` builder path is now proven in live n8n.
2. Keep `SW0/SW1/SW2/SW3` out of scope for the repo-centric test path unless a specific legacy bridge is unavoidable; the current goal is to move decision-making into repo routes, not to harden every legacy sibling subworkflow.
3. Extend the replay harness from `1-manifest` creation into at least one downstream stage reader before broader W0 v3 cutover.
4. Add the first real Book 2 authored config, Book 2 fixtures, and Book 2 asset mappings so the same replay path can validate non-Book-1 inputs once those values exist.

That is now the smallest useful slice that advances Book 2 without prematurely cutting production over to v3.
