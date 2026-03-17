# Manifest V2 V3 Cutover Strategy

**Purpose:** define how current `lhb.run-manifest@v2.0` and `@v2.1` orders coexist with the future `lhb.run-manifest@v3` contract during migration.
**Status:** Draft
**Created:** 2026-03-14

Companion docs:

- [BOOK-MANIFEST-CONTRACT-DRAFT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-MANIFEST-CONTRACT-DRAFT.md)
- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [BOOK-1-HARDCODED-AUDIT.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-1-HARDCODED-AUDIT.md)

---

## 1. Current state

The repo already has a mixed pre-v3 world:

- n8n W0 and sibling W0 still emit `lhb.run-manifest@v2.1`
- the backend recovery route [create-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts) now defaults to `lhb.run-manifest@v2.1` but has an explicit opt-in path for validated `lhb.run-manifest@v3`
- several W2A / W3 / W4 paths still emit or expect `lhb.run-manifest@v2.0`
- the same canonical filenames are used regardless of shape:
  - `1-manifest.json`
  - `2a-manifest.json`
  - `2b-manifest.json`
  - `3-manifest.json`
  - `4-manifest.json`

Examples:

- [create-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts)
- [w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json)
- [w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-Orchestrator.json)
- [w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json)

This means v3 should be treated as a compatibility migration, not a clean-sheet reset.

Working note as of 2026-03-17:

- the repo-owned builder seam now exists in backend code
- a shared W0 manifest normalizer now exists in backend code, and both [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts) and [create-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts) now use it
- a shared `2b-manifest` reader and pose-requirement helper now exists in backend code, and both [sync-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/sync-2b-manifest/route.ts) and [trigger-book-assembly/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts) now use it
- that same 2B helper boundary now also covers [repair-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/repair-2b-manifest/route.ts), and [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/route.ts) now exposes manifest-derived `bookContext` / review page semantics to the admin UI
- the first committed Book 1 fixture pair for shared dual-reader checks now exists under [fixtures/w0-manifests](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/fixtures/w0-manifests)
- [w2B-main-orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-main-orchestrator.json) now resolves 2A/2B manifest keys dynamically, reads required-pose semantics from the companion `1-manifest` when available, and keeps the legacy `2b-manifest` shape on the same canonical key
- [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json) now consumes the companion `1-manifest` when available, propagates W0-frozen `pagePlan` and required-pose semantics through active assembly nodes, and keeps the legacy `3-manifest` schema/key in place with additive metadata
- [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx), [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx), and [w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json) now read dynamic order roots and manifest-frozen page semantics in their active paths, while preserving legacy output schemas/keys
- [qa-check-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/qa-check-pdf/route.ts), [generate-approval-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/generate-approval-pdf/route.ts), and [api/assets/[...path]/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/assets/[...path]/route.ts) now accept dynamic order roots / explicit preview refs in their active paths, while preserving the current legacy fallback behavior
- [pre-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/pre-bria-stage.tsx), [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/orders/[orderId]/page.tsx), [presign-page-assets/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/presign-page-assets/route.ts), [inline-page-assets/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/inline-page-assets/route.ts), and [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts) now sit on the same shared `order-paths` seam for dynamic order roots and manifest URLs
- that same shared seam now also covers the active review actions in [approve/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/approve/route.ts), [flag/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/flag/route.ts), [unflag/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/unflag/route.ts), [regenerate-pose/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/regenerate-pose/route.ts), [regenerate-pose/[jobId]/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/regenerate-pose/[jobId]/route.ts), and [reject-revision/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/reject-revision/route.ts), which now prefer explicit `bookId` / `orderPrefix` hints from the UI before falling back
- [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts), [create-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts), and [repair-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/repair-2b-manifest/route.ts) now derive active manifest keys from companion manifest URLs before relying on the default order root
- the next major legacy assumptions are now centered in the intentionally unresolved debug-only manifest callers and any request boundaries that still omit explicit `bookId` / `formatId` hints for preview/background flows
- this does not change the cutover rule because downstream readers are still not dual-version capable
- the current safe posture remains: same key, explicit schema, non-default v3 creation only

---

## 2. Decision summary

Recommended cutover model:

- cut over by **order cohort**
- keep the same manifest filenames and keys
- use the manifest `schema` field as the version discriminator
- require readers to support both old and new schema during migration
- do not down-convert in-flight orders during rollback

This keeps pathing stable while allowing old and new orders to coexist.

---

## 3. What "order cohort" means

An order cohort is the set of new orders created after a specific W0 deployment or feature-flag change.

Recommended behavior:

- existing in-flight orders continue using the manifest version they started with
- newly created orders can start on v3 only when the required downstream readers are dual-version capable

This is safer than cutting over by raw workflow file alone because:

- W0 creates the contract that all downstream stages consume
- old orders may still be in W2A/W2B/W3/W4 when the new code is deployed

---

## 4. Canonical file naming rule

Do not change canonical manifest filenames during v3 migration.

Keep:

- `{bookId}/orders/{orderId}/manifests/1-manifest.json`
- `{bookId}/orders/{orderId}/manifests/2a-manifest.json`
- `{bookId}/orders/{orderId}/manifests/2b-manifest.json`
- `{bookId}/orders/{orderId}/manifests/3-manifest.json`
- `{bookId}/orders/{orderId}/manifests/4-manifest.json`

Reason:

- many current routes and workflows derive these keys directly
- changing both schema and filename conventions at once adds unnecessary migration risk

The discriminator is:

- `schema: "lhb.run-manifest@v2.0"`
- `schema: "lhb.run-manifest@v2.1"`
- `schema: "lhb.run-manifest@v3"`

---

## 5. Reader compatibility rules

During migration, readers must be categorized into two groups.

### A. Must become dual-version readers

These readers should inspect `schema` and branch accordingly:

- W2A readers of `1-manifest`
- W2B readers of `2a-manifest`
- W3 readers of `2b-manifest`
- W4 readers of `3-manifest`
- backend admin/review routes that load manifests directly
- replay tooling

Representative files and workflows:

- [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts)
- [create-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts)
- [sync-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/sync-2b-manifest/route.ts)
- [trigger-book-assembly/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts)
- [w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-Orchestrator.json)
- [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json)
- [w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json)

### B. Can remain version-agnostic

These should read derived fields or artifact pointers rather than raw old manifest internals whenever possible:

- order listing/admin views backed mostly by `orders`
- generic asset proxy routes
- generic signed-url helpers

---

## 6. Recommended migration sequence

1. build v3 types, resolver, and manifest builder in repo code
2. update downstream readers so they tolerate both v2.x and v3
3. add replay fixtures for both schemas
4. only then allow W0 to emit v3 for an opt-in cohort
5. once the cohort proves stable, expand v3 creation to all new orders
6. retire v2 writers only after in-flight v2 orders are drained and rollback window is acceptable

This sequence is intentionally conservative because W0 is the schema origin point.

Working note:

- step 3 has now started in repo code via committed Book 1 legacy/v3 W0 fixtures and normalization checks, but broader replay coverage is still pending
- the first shared 2B helper smoke coverage now exists in repo code as well, proving that W0-derived required poses can flow into non-admin 2B readers without changing the 2B manifest filename

---

## 7. W0 cutover rule

W0 should not emit v3 globally until:

- W2A, W2B, W3, W4, and the current admin review readers are dual-version capable
- replay harness validates representative Book 1 fixtures across both schemas

Recommended behavior once ready:

- W0 writes v3 for flagged cohorts
- W0 keeps writing the same canonical `1-manifest.json` key
- downstream readers branch on `schema`

Recommended behavior before ready:

- W0 continues writing v2.1

---

## 8. Rollback rule

If a downstream v3 issue is found:

- stop creating new v3 orders by disabling the W0 cohort flag
- do not rewrite existing v3 manifests into v2
- keep dual-version readers in place so in-flight v3 orders can finish safely

Reason:

- destructive in-place manifest rewrites create more risk than they remove
- rollback should affect only future cohort selection, not historical contracts

---

## 9. Replay and testing rule

Replay fixtures must record manifest schema explicitly.

Every replay/test case should identify:

- source schema version
- bookId
- formatId
- whether the order is single-item or sibling

The early replay harness should prove:

- the same order can be loaded correctly under old readers and new readers
- v3 orders are rejected early only when a reader truly lacks support, not because the schema is unknown

Working note:

- the first checked-in fixture pair currently proves shared W0 normalization across legacy and v3 plus preservation of v3 page-plan data

---

## 10. What this strategy rejects

For Phase 0, this plan rejects:

- changing manifest filenames for v3
- hard-cutting all production orders to v3 in one step
- rewriting old manifests in place during rollback
- relying on "latest config" or "latest reader" assumptions for in-flight orders

---

## 11. Practical takeaway

The migration rule is:

**same keys, explicit schema, dual readers first, W0 cohort cutover second, rollback only for future orders.**
