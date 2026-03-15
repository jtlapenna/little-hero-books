# Book 1 Hardcoded Audit

**Purpose:** inventory the main places where the current system assumes Book 1 storage paths, page structure, or manifest shapes so the Book 2 migration can remove them intentionally.
**Status:** Draft
**Created:** 2026-03-14

Companion docs:

- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [ASSET-TAXONOMY-AND-PATHING-RULES.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/ASSET-TAXONOMY-AND-PATHING-RULES.md)
- [MANIFEST-V2-V3-CUTOVER-STRATEGY.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/MANIFEST-V2-V3-CUTOVER-STRATEGY.md)

---

## 1. Scope

This is a Phase 0 baseline inventory, not an exhaustive repo-wide rewrite list.

It focuses on hardcoded assumptions that are likely to block or distort Book 2:

- literal `book-mvp-simple-adventure` pathing
- old manifest schema/version assumptions
- fixed page-count/page-label logic
- hidden pose-to-page mappings
- review UI helpers that reconstruct Book 1 assets from page numbers

---

## 2. Audit table

| Location | Hardcoded value or assumption | Assumption type | Risk if unchanged | Target replacement |
| --- | --- | --- | --- | --- |
| [pre-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/pre-bria-stage.tsx) | `book-mvp-simple-adventure/orders/{orderId}/manifests/2a-manifest.json` and `book-mvp-simple-adventure/characters/poses/poseNN.png` | Book 1 manifest path and pose ref path | Pre-Bria UI cannot locate non-Book-1 manifests or pose references | Read manifest/artifact pointers from config-backed manifest |
| [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx) | hardcoded `2b-manifest.json` / fallback `2a-manifest.json`; fixed `poseToFirstPage` map | Manifest naming plus Book 1 page-plan logic | Background comparisons and page associations break for a different page plan | Use `book.resolved.pagePlan` and manifest artifact pointers |
| [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx) | fixed dedication spread, interior spread pairing, and Book 1 cover assumptions | Book 1 page structure | Final approval UI mis-renders books with a different sequence or page count | Build spreads from resolved page plan in manifest |
| [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts) | page-number-to-slug array and `/api/assets/book-mvp-simple-adventure/backgrounds/pageNN-slug.png` | Book 1 background mapping | Any new book needs code changes just to display comparison backgrounds | Resolve background slots from `book_config` |
| [preview-canonicals.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/preview-canonicals.ts) | `book-mvp-simple-adventure/characters/bases` and `.../characters/hairstyles` | Book 1 asset root | Preview canonicals stay tied to one book root even if the character system becomes shared | Move to config-driven asset roots or explicit shared character root |
| [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts) | default `project = book-mvp-simple-adventure`; default `assetPrefix = book-mvp-simple-adventure/orders/{orderId}/` | Book 1 default namespace | Order model silently points new books at Book 1 paths | Resolve project/asset prefix from manifest or published config |
| [create-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts) | emits `lhb.run-manifest@v2.1` and writes `book-mvp-simple-adventure/orders/{orderId}/manifests/1-manifest.json` | Old manifest contract plus Book 1 path | Recovery route cannot create Book 2-compatible manifests | Replace with repo-owned manifest builder and config-aware key builder |
| [w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json) | hardcoded `book-mvp-simple-adventure/orders/.../1-manifest.json`, schema `@v2.1`, and static key prefix in config | W0 manifest origin | Book 2 cannot enter the pipeline without duplicating W0 logic | W0 should consume repo-built v3 manifest contract |
| [SIBLING - w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w0-Order_Intake_Validation.json) | same Book 1 manifest path assumptions for sibling orders | Sibling W0 contract | Sibling Book 2 orders would inherit Book 1 root naming and manifest rules | Same v3 W0 contract, with sibling-safe IDs |
| [w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-Orchestrator.json) | emits `lhb.run-manifest@v2.0`; hardcodes `book-mvp-simple-adventure/orders/{orderId}/manifests/2a-manifest.json` | Old stage manifest contract | W2A remains coupled to old manifest layout and Book 1 namespace | Consume v3 envelope plus config-resolved pose/page plan |
| [w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-sw1-single-pose.json) | neon QA background under `book-mvp-simple-adventure/backgrounds/transparency-qa/...`; output keys under Book 1 generated-asset root | Book 1 asset roots | Background-removal QA and output publishing require per-book node edits | Move static asset root and generated asset prefix into config/runtime helpers |
| [w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW3-Upload.json) | default `assetsRoot = book-mvp-simple-adventure/order-generated-assets` and fallback public URL expectations | Generated asset root | SW3 fallback logic will mispublish or misread non-Book-1 assets | Replace with config-aware generated asset prefixes |
| [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json) | Book 1 defaults for backgrounds, cover spread, page labels, output keys, and `lhb.run-manifest@v2.0` | Book 1 page plan and asset model | Book assembly stays locked to Book 1 slots and page count | Use resolved page plan plus asset-slot map from manifest |
| [SIBLING - w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w3-Book-Assembly.json) | same Book 1 defaults plus sibling-specific reuse of Book 1 page labels and paths | Sibling W3 pathing and page plan | Sibling Book 2 assembly would inherit wrong slots and path patterns | Same manifest-driven W3 inputs, still keyed by child `orderId` |
| [render/qa-check-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/qa-check-pdf/route.ts) | preview-image path reconstruction under `book-mvp-simple-adventure/orders/{orderId}/preview-images/...` | Preview artifact path | PDF QA assumes one preview layout and one namespace | Read preview artifact keys from manifest instead of reconstructing them |
| [generate-approval-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/generate-approval-pdf/route.ts) | `book-mvp-simple-adventure/orders/{orderId}/complete_book_{orderId}.pdf` | Final PDF naming | Approval PDF repair paths stay tied to Book 1 namespace | Use manifest artifacts or config-aware order prefix helper |
| [api/assets/[...path]/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/assets/[...path]/route.ts) | `key.startsWith('book-mvp-simple-adventure/orders/')` to determine order assets | Literal bucket-routing prefix | Asset proxy bucket routing fails for any new book namespace | Generalize to `{bookId}/orders/` pattern |

---

## 3. Highest-priority migrations implied by this audit

The audit points to four early replacement themes.

### A. W0 contract

The current W0 and recovery paths are still the main source of:

- Book 1 root keys
- v2.1 manifests
- implicit page structure

This is why the first repo-owned boundary should start at config resolution plus `1-manifest` building.

### B. Review UI page logic

The review UI currently reconstructs meaning from:

- page numbers
- pose numbers
- literal Book 1 paths

This will need manifest-driven page plan data before Book 2 can render correctly in admin.

### C. Generated asset prefixes

SW3, W2B, and repair routes still assume:

- one generated character root
- one order root
- one public serving convention

These need central helpers, even if the v1 path layout stays close to current Book 1.

### D. Manifest readers

The current system already mixes `@v2.0` and `@v2.1`.

That makes the v3 migration a reader-compatibility problem, not just a writer change.

---

## 4. Practical takeaway

The most important result of this audit is not the number of hits. It is the pattern:

**Book 1 assumptions are currently spread across W0, review UI helpers, manifest repair routes, and storage helpers.**

That is exactly why Phase 0 should lock:

- config ownership
- manifest cutover rules
- asset taxonomy
- the first repo-owned boundary

before attempting Book 2 onboarding.
