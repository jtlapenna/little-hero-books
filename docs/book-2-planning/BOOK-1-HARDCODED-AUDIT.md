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
| [pre-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/pre-bria-stage.tsx) | now builds `2a` manifest URLs from `order.bookContext` / `assetPrefix` and reference-pose asset URLs from the current book id via shared `order-paths`; pose reference still assumes the shared `{bookId}/characters/poses/poseNN.png` convention | Partial admin UI seam for Pre-Bria manifest and pose paths | Active Pre-Bria review no longer hardcodes the Book 1 namespace for manifest or reference-pose lookups, but server-side pose tools still embed Book 1 pose keys and the client does not yet read explicit pose-reference refs from manifest/config | Keep the shared path seam and move server-side pose/template helpers onto the same config-aware reference-key model |
| [post-bria-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-bria-stage.tsx) | now reads dynamic `2b` / `2a` manifest roots from `order.bookContext` and consumes manifest-derived comparison page/background metadata instead of the fixed `poseToFirstPage` map; fallback UI behavior still assumes Book 1 comparison assets exist | Partial review/UI dual-reader seam | Active Post-Bria review no longer guesses page associations from a local Book 1 map, but comparison asset fallback still depends on Book 1 config being bundled and no generalized multi-book comparison helper exists yet | Keep the shared page-plan seam and move remaining comparison/background helpers onto config-driven asset resolution |
| [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx) | now reads dynamic `3-manifest` / preview roots from `order.bookContext`, builds spreads from resolved page order, and uses page labels instead of `p00_dedication` reconstruction; legacy preview/cover compatibility fallbacks still exist | Partial review/UI dual-reader seam | Final approval UI no longer depends on fixed dedication spread rules or Book 1 preview roots in the active path, but some preview / cover fallbacks still assume Book 1-compatible assets and downstream PDF helpers still reconstruct keys | Keep the manifest-driven spread/page-label seam and remove the remaining fallback reconstruction in shared PDF helper routes |
| [order-paths.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-paths.ts) | now centralizes book-id / order-prefix inference from order-like rows, manifest URLs, and asset keys, and now drives the active runtime/admin manifest callers including orders list fallback, preview token validation, workflow completion webhooks, regeneration/repair actions, `sync-2b`, `trigger-book-assembly`, `auto-flip-pose`, and `replace-image` | Shared manifest-key/root seam | Active runtime/admin routes no longer silently snap back to the Book 1 namespace when they already have manifest or asset refs, but debug-only routes and some request boundaries still preserve the old default surface | Keep routing new callers through the shared candidate-builder until only intentional debug surfaces or explicit request-boundary defaults remain |
| [background-images.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/background-images.ts) | now resolves page background keys from bundled `book_config` page/background slots and supports optional `bookId` / `formatId` lookup hints, while preserving the current Cloudflare mapping env as an overlay | Config-driven background lookup seam | Background fallback URLs are no longer tied to a Book 1 literal path, but callers that omit `bookId` / `formatId` still intentionally default to the bundled Book 1 config | Keep the config-driven lookup and thread explicit request hints where multi-book background callers appear |
| [preview-canonicals.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/preview-canonicals.ts) | now resolves preview base/hair prefixes from bundled `book_config.assets.preview` (or `assetRoot` convention fallback) and accepts an explicit `bookId` option | Config-driven preview asset seam | Preview asset resolution is no longer hardcoded to the Book 1 root, but current D2C callers still omit `bookId` and therefore intentionally default to the bundled Book 1 config | Keep the config-driven lookup and pass `bookId` explicitly once preview generation becomes multi-book |
| [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts) | now infers `project` and `assetPrefix` from existing manifest/asset refs before falling back to Book 1, and now resolves `4-manifest` on the inferred order root; legacy default still exists when no path hints are present | Partial order-model namespace seam | Existing orders with real manifest/asset refs no longer silently snap back to Book 1 roots, but totally path-less records still default to Book 1 and broader `buildManifestKey()` callers remain hardcoded elsewhere | Keep path inference here, then generalize shared manifest-key helpers and remove the remaining default root assumptions |
| [create-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts) | still defaults to `lhb.run-manifest@v2.1`; now has an additive repo-owned helper path that can emit validated `lhb.run-manifest@v3` to the same canonical key; Book 1 fallback `bookId` still exists | Partial W0 seam plus remaining Book 1 defaulting | Recovery path is no longer a blind handwritten manifest writer, but production-safe behavior still depends on the old default shape and Book 1 fallback | Keep the shared helper, remove remaining Book 1 fallback assumptions, and reuse the same seam in real W0 plus dual-version readers |
| [create-2a-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2a-manifest/route.ts) | previously read legacy `oneManifest.order.*` fields directly; now uses a shared W0 normalizer that accepts v2.x and v3 `1-manifest`, and now derives the active 2A manifest key from the companion `1-manifest` root before falling back | First downstream dual-reader seam, with legacy output still in place | The route can now tolerate v3 W0 input and no longer assumes the Book 1 root in its active publish path, but later stage contracts and sibling equivalents still assume legacy downstream manifests | Keep the shared reader seam and extend the same compatibility model into remaining W2/W3 readers before any W0 cohort expansion |
| [create-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/create-2b-manifest/route.ts) | previously depended on the current `orders` row plus legacy assumptions around `1-manifest`; now uses the same shared W0 normalizer, still emits the existing 2B manifest shape, and now derives the active 2B manifest key from the companion `1-manifest` root before falling back | Second downstream dual-reader seam, with legacy 2B output still in place | Admin repair flow can now tolerate v3 W0 input and no longer assumes the Book 1 root in its active publish path, but non-admin W2B/W3 readers still assume old downstream contracts | Reuse the same reader boundary in `sync-2b`, book-assembly triggers, and n8n readers before expanding W0 v3 creation |
| [sync-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/sync-2b-manifest/route.ts) | previously hardcoded a local `0..12` pose loop and read raw 2B entries directly; now uses a shared 2B reader and W0-derived pose requirements when available, but still writes the legacy 2B manifest shape | First non-admin 2B reader seam, with legacy output still in place | The route no longer has to guess required poses when a companion v3 W0 manifest exists, but fallback behavior and downstream W3/UI readers still assume Book 1 defaults | Reuse the same helper in repair/UI readers and then remove the remaining Book 1 fallback once W0 cohort cutover is ready |
| [trigger-book-assembly/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/trigger-book-assembly/route.ts) | previously enforced hardcoded story poses `1..12` directly against raw 2B entries; now uses the shared 2B reader and pose-requirement helper before queueing W3 | First W3-adjacent dual-reader seam, with legacy 2B and W3 outputs still in place | The queue gate can now honor W0-derived required poses when available, but W3 assembly itself and related review surfaces still assume Book 1 pose/page behavior | Extend the same helper boundary into repair/UI/W3 readers before any wider W0 v3 rollout |
| [repair-2b-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/orders/[orderId]/repair-2b-manifest/route.ts) | previously rebuilt 2B from 2A with local assumptions; now uses the shared 2B reader, sync helper, W0-derived required poses, and companion manifest URLs to resolve the active 2A/2B keys before it falls back | Admin repair seam, with legacy 2B output still in place | Repair no longer blindly publishes an incomplete 2B manifest or assumes the Book 1 root in its active path, but it still does not move n8n/W3 to manifest-driven semantics | Keep the shared helper boundary here, then remove the remaining key/path defaults when W2B and W3 consume the same semantics |
| [orders/[orderId]/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/route.ts) | now loads `2a` / `2b` / `3` manifests from the order’s resolved book root, emits `bookContext`, and attaches manifest-derived page/background associations to Post-Bria pose assets; legacy review flags and several asset fields still stay loosely typed | Partial review/UI reader seam | The order detail API now provides the data needed for manifest-driven review UIs, but some surrounding helpers and downstream PDF routes still reconstruct Book 1 preview keys or rely on loose legacy shapes | Keep the route seam, then move shared PDF/preview helpers to the same manifest-driven order-root and page-label contract |
| [w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json) | hardcoded `book-mvp-simple-adventure/orders/.../1-manifest.json`, schema `@v2.1`, and static key prefix in config | W0 manifest origin | Book 2 cannot enter the pipeline without duplicating W0 logic | W0 should consume repo-built v3 manifest contract |
| [SIBLING - w0-Order_Intake_Validation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w0-Order_Intake_Validation.json) | same Book 1 manifest path assumptions for sibling orders | Sibling W0 contract | Sibling Book 2 orders would inherit Book 1 root naming and manifest rules | Same v3 W0 contract, with sibling-safe IDs |
| [w2A-Orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-Orchestrator.json) | emits `lhb.run-manifest@v2.0`; hardcodes `book-mvp-simple-adventure/orders/{orderId}/manifests/2a-manifest.json` | Old stage manifest contract | W2A remains coupled to old manifest layout and Book 1 namespace | Consume v3 envelope plus config-resolved pose/page plan |
| [w2B-main-orchestrator.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-main-orchestrator.json) | now resolves 2A/2B manifest keys dynamically, derives required-pose coverage from the companion `1-manifest` when available, and still merges into legacy `lhb.run-manifest@v2.0` 2B manifests with inline fallback defaults | Partial W2B dual-reader seam | Active W2B no longer hardcodes canonical Book 1 keys or target pose coverage, but the compatibility logic still lives inline in n8n and W3 still assumes Book 1 page/pose behavior | Keep the same canonical key/shape for now, then move W3 and sibling W2/W3 exports onto the same manifest-frozen semantics |
| [w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2B-sw1-single-pose.json) | neon QA background under `book-mvp-simple-adventure/backgrounds/transparency-qa/...`; output keys under Book 1 generated-asset root | Book 1 asset roots | Background-removal QA and output publishing require per-book node edits | Move static asset root and generated asset prefix into config/runtime helpers |
| [w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW3-Upload.json) | default `assetsRoot = book-mvp-simple-adventure/order-generated-assets` and fallback public URL expectations | Generated asset root | SW3 fallback logic will mispublish or misread non-Book-1 assets | Replace with config-aware generated asset prefixes |
| [w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w3-Book-Assembly.json) | active nodes now resolve dynamic `2b` / `1-manifest` keys, load companion W0 data, carry `pagePlan` and required-pose semantics forward, and write preview / `3-manifest` keys on the resolved order root; legacy `3-manifest@v2.0` shape plus Book 1 story/canvas/cover assets remain in place | Partial W3 dual-reader seam with Book 1 rendering assets still inline | W3 no longer depends on fixed 15/17-page or `1..12` pose loops in the active path, but review/UI and W4 still infer meaning from Book 1 preview-page conventions and asset roots | Keep the active W3 seam, then move Post-Bria/Post-PDF/W4 readers to manifest-driven page labels and artifact pointers before widening W0 v3 creation |
| [w4-PRODUCTION-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json) | active validation now accepts `orderPrefix`, `pageLabels`, and manifest-frozen page counts when present, and active 4-manifest / QA-failure writers now publish on the resolved order root; legacy schema/output shape remains in place | Partial W4 dual-reader seam | W4 no longer hardcodes Book 1 order roots or fixed `15/17` page loops in its active validation path, but renderer QA and approval-PDF helpers still reconstruct preview keys from `{orderId}` alone | Keep the W4 seam and move shared renderer / approval helpers onto manifest-provided page labels and order roots |
| [SIBLING - w3-Book-Assembly.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w3-Book-Assembly.json) | same Book 1 defaults plus sibling-specific reuse of Book 1 page labels and paths | Sibling W3 pathing and page plan | Sibling Book 2 assembly would inherit wrong slots and path patterns | Same manifest-driven W3 inputs, still keyed by child `orderId` |
| [render/qa-check-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/qa-check-pdf/route.ts) | now accepts signed `pdfUrl`, explicit `previewImageUrls`, and `orderPrefix` / `pageLabels` fallback reconstruction instead of hardcoding `book-mvp-simple-adventure/orders/{orderId}/preview-images/...` | Partial renderer QA dual-reader seam | Active PDF QA can now consume W4-provided preview refs and dynamic order roots, but older callers may still rely on legacy fallback reconstruction and no shared manifest-reader wrapper exists yet | Keep the explicit preview-ref seam and move remaining callers onto manifest-provided artifact pointers |
| [generate-approval-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/generate-approval-pdf/route.ts) | now resolves the final PDF root from `asset_prefix` or `project` via a shared order-prefix helper instead of assuming `book-mvp-simple-adventure/orders/{orderId}/complete_book_{orderId}.pdf` | Partial approval-PDF path seam | Active approval HTML generation no longer assumes the Book 1 namespace, but it still infers the PDF filename from current Book 1 conventions and does not read manifest-frozen artifact pointers yet | Reuse shared order-prefix helpers now, then move approval helpers onto manifest artifact refs when downstream schemas widen |
| [api/assets/[...path]/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/assets/[...path]/route.ts) | now routes order assets through shared `{bookId}/orders/` helper logic instead of `key.startsWith('book-mvp-simple-adventure/orders/')` | Shared bucket-routing seam | Core asset proxy can now serve non-Book-1 order namespaces, but other render helper routes still duplicate Book 1 order-bucket detection | Reuse the same shared helper in presign/inline render routes and remove duplicate prefix checks |
| [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/orders/[orderId]/page.tsx) | now builds manifest polling URLs from `order.bookContext.orderPrefix` / `assetPrefix` via shared `order-paths` instead of `/api/manifests/book-mvp-simple-adventure/orders/{orderId}/...` | Partial admin UI manifest URL seam | Order detail polling no longer assumes the Book 1 namespace for review counts, but other order-page logic still contains broader legacy typing/UI debt and some actions still rely on server defaults | Keep the path seam and continue removing Book 1 assumptions from the server routes those actions call |
| [presign-page-assets/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/presign-page-assets/route.ts) | now uses the shared bucket helper instead of a local `book-mvp-simple-adventure/orders/` prefix check | Render helper bucket-routing seam | Signed asset generation now respects non-Book-1 order roots, but the HTML still depends on callers to supply the right `/api/assets/...` keys | Reuse shared path helpers at call sites and move more asset refs to manifest-frozen keys |
| [inline-page-assets/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/render/inline-page-assets/route.ts) | now uses the shared bucket helper instead of a local `book-mvp-simple-adventure/orders/` prefix check | Render helper bucket-routing seam | Inline asset rendering now respects non-Book-1 order roots, but upstream callers still need to stop manufacturing Book 1 asset keys | Reuse shared path helpers at call sites and move more asset refs to manifest-frozen keys |

---

## 3. Highest-priority migrations implied by this audit

The audit points to four early replacement themes.

### A. W0 contract

The current W0 and recovery paths are still the main source of:

- Book 1 root keys
- v2.1 manifests
- implicit page structure

This is why the first repo-owned boundary should start at config resolution plus `1-manifest` building.

Progress note as of 2026-03-17:

- the backend recovery route is now the first guarded integration point for that boundary
- the remaining W0 hardcoding problem is centered in n8n W0 and downstream readers, not in the new repo kernel itself

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
