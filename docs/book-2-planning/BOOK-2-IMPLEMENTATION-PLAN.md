# Book 2 Implementation Plan

**Purpose:** define the concrete phased execution plan for making the pipeline Book-2-ready without forking Book 1 and Book 2 into permanently separate workflow trees.
**Status:** Draft
**Created:** 2026-03-14

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
- a manifest pointer ownership table
- documented sibling send-to-print policy

### Exit criteria

- no stage depends on nonexistent Supabase columns for normal error handling
- manifest URLs and keys are consistently available or intentionally derivable
- sibling orders cannot be partially sent to print accidentally

---

## Phase 2: Create the shared repo-owned book kernel

**Goal:** introduce typed repo code that owns book-specific decisions instead of leaving them embedded in n8n Code nodes or UI helpers.

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

- a minimum replay command for config -> page plan -> `1-manifest`
- a small fixture set checked into the repo
- schema validation in CI for the minimum harness

### Exit criteria

- W0 conversion can be tested locally before live workflow changes
- the team can validate config and manifest changes without relying on n8n runs

---

## Phase 3: W0 conversion to config-driven `1-manifest`

**Goal:** make W0 the first shared kernel entry point.

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

If implementation started now, the first concrete actions should be:

1. Create the shared backend module skeleton under `back-end/src/lib/books/`
2. Add `BookConfig` and manifest v3 types under `back-end/src/types/` or `back-end/src/lib/books/types.ts`
3. Build a Book 1 `book_config` object that reproduces current `standard` and `amazon` behavior
4. Implement page-plan resolution for Book 1
5. Build a repo function that produces `1-manifest` v3 from:
   - order input
   - `book_config`
   - selected `formatId`
6. Add one Book 1 fixture test proving that the v3 `1-manifest` matches current operational expectations

That is the smallest useful slice that moves the system toward Book 2 without committing to a risky big-bang rewrite.
