# Book configuration and workflow audit

Result: the source is partly configuration-driven, but the complete upload-to-PDF path is not yet demonstrably book-agnostic. The repo-centric implementation contains the shared machinery we need. The SIBLING exports retain first-book logic, and the repo-centric path still has concrete configuration gaps. No architecture change was made.

Scope: Amazon upload, W0, queue, W2A generation and pose handling, W2B background removal, W3 rendering/publication and W4 PDF generation. Checkout, payment redesign and print submission remain excluded. This is source inspection, not a hosted execution or a new test-suite pass. Everything remains uncommitted. The Little Hero Books automation was checked and remains PAUSED; other project automations were not changed.

## What was inspected

Inspected the current mixed local worktree at HEAD `f7efbb3308df1111568890ed6de9ae5c7c38fe74`, including its uncommitted book changes. [Source evidence](book-agnostic-workflow-audit-evidence-2026-10-29.json) records file hashes, workflow identifiers and structural connection checks. The previously verified published main `ced6e3b15c28d0efa1640ae37ddcb8f796d352d9` contains John's PRs #64 and #65; it has not been merged into this checkout. Local findings must not be described as deployed behavior.

The [older ownership audit](repo-centric-workflow-ownership-audit.md) says repo-centric stages were proven live in March. The [workflow README](../n8n-workflow-files/repo-centric/README.md) calls SIBLING the normal live master and repo-centric the migration track. Neither document establishes today's active chain. Saved workflow IDs or active flags do not settle that disagreement. We need a read-only inventory of actual backend/workflow bindings before selecting the hosted pilot target, not another agent's permission.

Connection checks followed webhook/subworkflow/schedule triggers through saved graph edges. They establish possible reachability, not which conditional branch will execute, effective credentials or the live version.

## Stage findings

| Stage | Config-driven behavior present | Remaining limit or gap |
| --- | --- | --- |
| Amazon upload | Shared handler, parser, sibling expansion and W0 dispatch already exist. | Handler forces the first book. Shared W0 payload supplies first-book title/page defaults. |
| W0, repo-centric | Calls shared build/publish endpoints. Selects book, format and version; builder resolves page plan and freezes the render snapshot. | Export defaults omitted version to 1 and omitted book to the first book. Latest layout cannot be inferred from a file named `v2.json`. |
| W0, SIBLING | Carries order/customization data. | Builds a legacy v2.1 manifest in the first-book namespace rather than resolving a selected book config. |
| Queue/router | Repo-centric W2A preparation can retrieve frozen manifest data; W3 preparation derives book context from manifest paths. | Repo-centric W4 preparation still constructs the W3 manifest path under the first-book prefix. |
| W2A, repo-centric | Base references derive from config asset roots. Named pose references and worklists derive from frozen page/cover layers. Actual provider nodes consume shared builder output. | Character vocabulary, base prompt and Gemini model remain shared code policy. Legacy pose/reference fallbacks remain. This supports the current character system, not arbitrary book styles through config alone. |
| W2A, SIBLING | Some reference/path inputs can override defaults. | First-book asset roots, sequential pose assumptions and a 0..12 clamp remain in the saved pose workflow. Overrides do not make this a complete recipe-driven path. |
| W2B, repo-centric | Reads approved pose entries and propagates book/order paths; shared builder computes background-removed keys from book ID. Normalization can resolve the frozen named reference through order context. | Several legacy asset fallbacks remain in exports. A stage need not reload config if it correctly consumes config-derived manifest inputs; absence of direct config access is not itself a defect. |
| W3, repo-centric | Configured renderer uses frozen page sequence, named layers, guide images, copy tokens, font, cover and preview templates. | Flexible-flow schema has an explicit publication hold. First-book rendering remains a legacy branch. |
| W3, SIBLING | Accepts some dynamic inputs and text. | Reachable Amazon HTML generator explicitly creates story positions 3..16 and uses first-book layout/assets. It cannot become a 32-page book merely by changing expected page count. |
| PDF generation, repo-centric W4 | Uses ordered preview images and the shared PDFMonkey worker. | Worker fixes canvas sizes and prioritizes workflow-level templates over book-level template inputs. Draft/flow readiness prevents treating the new layout as print-ready. |

## Confirmed gaps and their consequences

### G1. Upload chooses the first book

The [CSV route](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts:33) sets `AMAZON_CSV_BOOK_ID = 'book-mvp-simple-adventure'` and uses it for row metadata and W0 dispatch. [Shared payload construction](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/sibling-order-helpers.ts:147) accepts a book ID but still sets Adventure Compass title, 16 pages and adventure type. Its default W0 webhook is the SIBLING intake path unless the environment overrides it.

Effect: uploading the pilot through this source selects the first book. Fixing only the constant would leave misleading payload metadata and would not establish which workflow chain receives it. The v3 page planner separately derives actual page count from config, so the payload's 16-page field alone does not prove that v3 would render 16 pages.

Smallest direction: resolve explicit book/edition/version once at intake, derive book metadata from that selection, and preserve documented first-book compatibility. Decide with Jeff whether the uploader selects book explicitly or uses an authoritative SKU/ASIN mapping. Neither source nor the reply establishes a new-book mapping.

### G2. Workflow tracks are not interchangeable

The SIBLING W0 node `Build 1-manifest.json` writes a first-book key and legacy schema. Its W3 `Generate Complete HTML (Amazon)` node loops through the original 14 story pages. SIBLING pose resolution clamps to 0..12. These are active graph paths, not merely samples.

The repo-centric equivalents call config-aware backend builders for W0, pose worklists and W3 plans. Its [W0 selector node](/Users/jeff/.codex/worktrees/090a/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json:243) forwards explicit config version but supplies 1 when omitted. The request parser requires a published book/version/format for the normal selected path. The bundled loader also deliberately chooses baseline version 1 when no version is supplied, not the newest JSON file.

Effect: changing the book config cannot upgrade the legacy workflow implementation or select the new config version by itself. Exported variants reuse workflow identities; confirm deployed definitions and subworkflow references, not filenames alone.

### G3. Repo-centric W4 routing still uses a first-book path

In [queue/router W4 preparation](/Users/jeff/.codex/worktrees/090a/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json:62), node `Prep Workflow 4 Orders` sets a first-book prefix and always constructs `manifest3Key` from it. An existing `one_manifest_url` overrides the W0 fallback, but does not correct that W3 key.

Effect: a new-book order reaching this saved queue path receives a wrong-book W3 reference before PDF generation. Whether downstream code rejects or repairs it must be tested; the emitted payload itself is demonstrably inconsistent with the selected book. Derive the W3 path from canonical order/manifest context, preserving John's existing routing and revision guards.

### G4. Flexible text renders locally but cannot publish through the normal path yet

The [configured renderer](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/configured-book-rendering.ts:166) supports shared flow content selected by recipe schema. The retained Inner Voice `v2.json` is config version 2 using rendering schema `lhb.book-render@v1`; flow uses the distinct schema `lhb.book-render@v2`.

The [publisher](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/workers/w3-manifest-publish.ts:122) rejects flow publication. [W3 readiness](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w3-manifest.ts:335) keeps flow/draft/test output unready, and [W4 input](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w4-print-input.ts:1397) rejects unverified flow fit.

Effect: the local review PDFs do not prove that config can complete the hosted publication/PDF path. Keep those holds until the chosen review-only route verifies output. Do not switch off print guards or activate draft artwork merely to run a generation test.

### G5. PDF dimensions and template precedence are not fully config-driven

The [PDF worker](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/workers/w4-print-worker.ts:437) emits fixed 8.75-inch interior pages and 17.25 by 8.75-inch covers. Its template resolvers prefer `CONFIG.pdfMonkey` over per-document template fields. The repo-centric W4 config node supplies a fixed interior template. Book-format config already contains trim/bleed, cover spread and template fields, but these worker functions do not resolve geometry directly from that frozen config.

Effect: arbitrary dimensions/templates cannot be established by book config alone through this worker. This is a generality gap, not proof that the two current books have different dimensions or require different templates. Keep broader format support deferred unless needed by the selected pilot; verify the exact current-book template inputs and dimensions.

### G6. Some shared rules are book-specific or fixed in code

[W0 manifest construction](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/build-run-manifest.ts:55) requires a test marker for draft recipes, and applies a name-length rule specifically to Inner Voice version 2 or later. [W2A frozen input](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w2a-frozen-input.ts:30) identifies configured orders using Inner Voice book ID or Gelato provider. Other paths use recipe presence. Base generation uses shared dress/tee-shorts prompts and a fixed model; these are not arbitrary per-book prompt definitions in config.

Effect: the system supports a defined book/character family, not every conceivable book from a config file. The different definitions of configured order should be recorded for a later compatible shared-contract change, rather than starting an intake/identity redesign now. A common provider model and shared character vocabulary can remain application policy. Generalize them only if a selected book requires different behavior.

## What is already reusable

[Page planning](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/resolve-page-plan.ts:33) validates a chosen format's sequence and derives page count, templates, required poses and render snapshot. [Snapshot resolution](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/book-snapshot.ts:15) uses frozen config and rejects missing snapshots for configured orders. The [pose worklist](/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/review-page-plan.ts:138) includes page and cover poses. Configured W3 rendering selects copy, placements, orientation, backgrounds, guide assets and cover from that snapshot. These are suitable existing capabilities to complete, not reasons to build a parallel book engine.

The repo-centric W3 `preview-html` node still contains first-book fonts/overlays, but is disconnected from the trigger graph. It is not counted as a current pipeline blocker. Simulation nodes and fallback constants were likewise not treated as demonstrated overrides of valid configured inputs.

## Decisions for Jeff

1. **Authoritative path.** Recommend completing the existing shared repo-centric path and retaining first-book compatibility. Alternatives are retrofitting SIBLING with the same config contracts or accepting a temporary book-specific pilot path. The latter would weaken the requested proof of a book-agnostic system. Verify hosted bindings before selecting exact workflow versions. No broad migration or fork is authorized by this audit.
2. **Book selection at upload.** For the pilot, recommend an explicit book/edition/version selection that feeds the normal handler and frozen manifest. Use SKU mapping if it already represents the intended Amazon product catalog. Confirm the intended source of selection before changing this shared entry point.
3. **Review output versus print readiness.** Recommend using the existing PDF rendering capability for a bounded review-only path while draft/flow output remains ineligible for printing and customer messages. Determine whether existing controls already provide that boundary before adding anything. Approving this direction would authorize focused design/implementation, not hosted execution, uploads or print orders.

Keep fixed character policy and general format expansion deferred unless a current-book case demonstrates a need. No checkout, payment or database recovery work is required by these decisions.

## Checks and next action

Completed: read relevant producers/consumers and both workflow tracks, parsed configs and workflow exports, checked trigger reachability for cited nodes, compared explicit selectors/fallbacks/template precedence, and checked the empty Git index and paused book automation. Source hashes make this inspection reproducible. No provider calls, deployments, uploads, hosted reads, messages, order creation, migrations, builds or generation runs occurred.

Not established: deployed versions, runtime overrides, active published config, template contents, end-to-end field propagation at runtime or effective no-order/no-message behavior. Existing test files cover several configured boundaries but were not rerun; this audit makes no new runtime-pass claim.

After Jeff chooses the directions above, update the bounded implementation steps for G1/G3/G4 and verify any G5 settings needed for this book. Test first-book and Inner Voice through the same selected workflow with different configs, preserve the revision guards, then prepare the separately authorized hosted pilot. [Active test plan](new-book-amazon-workflow-e2e-test-plan-2026-10-29.md) remains the scope boundary.
