# W4 Gelato execution status

Date: 2026-10-11. Implementation remains local and uncommitted. Two synthetic Gelato drafts passed direct API checks and remain unconverted. Preview and provider stored-file repairs passed independent checkpoint review. Production release remains NOT READY because database administration/migration evidence is unavailable. No paid printing or customer messages occurred.

Worktree: `/Users/jeff/Projects/little-hero-books-w4-gelato`. Branch: `codex/w4-gelato-copies`. HEAD and fetched `origin/main`: `46c1f81f00f70de5ec04766bcf406de9735d40dd`.

The plan and its reviewed continuations are in `w4-gelato-copies-implementation-plan.md`. Earlier sections record prior checkpoints; the latest sections state current results and rollout limits.

## Source verification

Read project instructions, README, docs index, workflow docs, handoff, and approved plan. Copied plan matches originating checkout byte for byte. Local environment files and dependencies were already present.

Read-only n8n inventory and comparison covered these live workflows:

| Workflow | ID | Active | Webhook | Credential names |
| --- | --- | --- | --- | --- |
| W0 | `9E0oVs46bMoiyRIP` | yes | `order-intake-repo` | S3 account |
| W1.1 | `TDwc85g03FqPf9D6` | yes | `w1-1-router-sibtest` | none named |
| W4 | `m4qIN9PCgifUcYih` | yes | `w4-pdf-print-repo` | none named |
| W4.1 | `boWA0mB20qYK2g4x` | yes | `w4-1-sibling-aggregation-repo` | none named |

Compared node parameters and connections. W0, W1.1, and W4.1 matched exports. W4 differs at the production config node's `jsCode`; resolve that drift with a redacted semantic comparison before cloning. Existing Lulu W4 and W4.1 exports remain byte-identical to base.

Two plan claims needed correction: normalization already retained numeric config version, and existing W0 targets `book-mvp-simple-adventure`, not Inner Voice. Existing callers stay pinned to their current book at v1. The live W0 build caller currently omits the version, so deploy the updated caller together with strict backend selection, never backend enforcement alone.

Earlier source inspection found embedded credential literals in W1.1. The edited export now uses environment references and the secret scan passes. Rotate previously exposed historical keys before release.

## Implemented foundation

- W0 request parsing preserves selection across nested payloads, requires explicit numeric version and published source, and rejects conflicting selections. Updated W0 export and direct proof caller pin v1. Runtime manifest building rejects missing versions before lookup.
- Bundled defaults remain v1. Published fallback selects v1 when no active version exists. Published row identity, version, and checksum must match config contents.
- Shared print schemas accept separate Lulu and Gelato settings. Validation and normalization preserve frozen provider, product, API inner count, PDF count, and config version. Missing provider fallback is limited to Inner Voice v1. Original manifests are not mutated.
- Authenticated print routing loads canonical order-scoped R2 manifests, checks identity and frozen assignments, and validates sibling membership, provider, product, counts, and destination. Supported V2.1 records require a durable Lulu assignment. No arbitrary URL fetches.
- Added an authenticated routing-claim endpoint. It re-resolves canonical manifests and complete group membership, then calls the atomic Gelato claim RPC only for Gelato groups. Lulu groups return without a second claim path.
- Wired the W1.1 repo export through that endpoint before provider branching. The classifier now loads any root row plus all children and holds work if complete membership lookup fails. Lulu keeps its existing route. Gelato groups route to separate planned W4 and W4.1 Gelato webhook paths. Failed webhook calls attempt to fence the claim. The webhook targets do not exist yet, so Gelato dispatch is not operational. Embedded W1.1 credential literals were replaced with environment references.
- Added an authenticated fence endpoint for post-claim dispatch failure. The database rotates the claim token; a claim still in `claimed` becomes retryable `failed`, while a `submitting` claim becomes `outcome_unknown`.
- Added a shared Gelato API contract for quote and explicit draft requests. It checks exact item membership, SKU, quantity, configured API page count, one quote only, configured shipment method, 15-minute quote age, HTTPS file URLs, and policy version reuse for draft submission. It does not call Gelato.
- Kept `apiPageCount` separate from 32 inner pages and 35 PDF pages. The v2 value remains a provisional 32. Gelato generic docs say the count includes covers, while historical SKU-specific evidence reports the inner-page count. Do not create a quote or draft until product-specific behavior is verified against this product’s actual 35-page file. Shipment selection also remains blocked when a quote returns multiple methods with the configured type; UID priorities need destination-specific evidence.
- W0 order-upsert payloads now freeze provider, config version, product UID, inner page count, and expected PDF count from the same selected manifest config. This assigns post-migration orders created by the updated W0 path, including Lulu v1 orders, at creation. Deploy the backend and W0 caller together before routing changes. Existing rows remain covered by the bounded migration backfill.
- Existing Lulu single and sibling print submission helpers require a successful order lookup and an explicit `print_provider: lulu` assignment before signing URLs. Lookup rejection, missing rows, missing assignment, and Gelato assignment fail closed.
- Added provider-aware W4 input reuse for Gelato single orders and sibling groups. Both paths resolve the same canonical one-manifest and W3 assets as Lulu, while requiring persisted Gelato provider, exact order identity, matching frozen config version, product UID, and page counts. The sibling path also requires all children to share the same frozen Gelato product and counts. New authenticated endpoints are `/api/internal/w4/build-gelato-print-input` and `/api/internal/w4/build-gelato-sibling-print-input`. They do not claim a second workflow job because W1.1 already owns the submission claim. No Gelato W4/W4.1 workflow exports call them yet.
- Added a lossless, order-scoped Gelato PDF assembler for the 35-page layout. It validates 32 keyed page PNGs, 300 DPI minimum, exact cover/interior geometry, and claim ownership before writing to private R2. Single-order endpoint: `/api/internal/w4/build-gelato-print-pdf`.
- Added `/api/internal/w4/build-gelato-sibling-print-pdf`. It validates full claimed child membership, frozen product agreement, and each child's claim before assembling one PDF per sibling.
- Added separate inactive exports `w4-GELATO-Print_Fulfillment.repo-centric.json` and `w4.1-GELATO-Sibling-Aggregation.repo-centric.json`. Their distinct webhook paths match W1.1 dispatch targets. Each export contains only webhook acknowledgement and authenticated PDF assembly, with no Lulu, PDFMonkey, quote, or order-submission nodes. These copies stop after PDF assembly and are not end-to-end Gelato order workflows yet.
- Print-routing endpoint now checks requested IDs against the full resolved root membership even when the partial set has only one child. Focused endpoint-core test covers requesting only the root row when the group has one child.
- Prepared additive migration and aggregate verification SQL. Migration adds write-once assignments, bounded legacy Lulu backfill, disabled Gelato gate, shared submissions, stable child/item references, provider-order mappings, and notification outbox tables.
- PostgreSQL claim, begin, authorize, renew, and fence functions validate membership, token, lease, execution, gate, and assignment. Claims are atomic. Long-running active executions can renew a bounded lease. Proven pre-send failures restore queue eligibility; submissions with possible network effects remain blocked as `outcome_unknown`. Membership changes serialize with claims. Durable child references survive allowed archival.
- Added routing behavior tests and disposable PostgreSQL migration, recovery, permissions, and concurrency tests. No live migration or backfill ran.

These remain foundation pieces. W1.1 routes to the new local Gelato webhook paths, but the new workflow copies currently only assemble PDFs and fence a claim after a confirmed assembly failure. Quote, draft submission, connected-order mapping, lifecycle, and recovery are not wired. A database authorization check cannot stop an execution that already passed it and then paused before the HTTP request. Ambiguous provider submissions must remain `outcome_unknown`; no automatic retry/reset path exists. Before adding recovery, it must prove the old execution is terminated and its HTTP timeout has drained, then reconcile with Gelato. The migration alone does not provide a process-level fence.

## Checks

Passed:

- `npm run test:gelato-print-routing`
- `npm run test:gelato-api-contract`, including grouped quote membership, shipment policy ambiguity, quote age, explicit draft mode, and Lulu/Gelato claim isolation
- `npm run test:w1-gelato-claim-routing`, including root-plus-children membership, held claims, Lulu passthrough, dispatch-failure fencing, and W1.1 branch connections
- `npm run test:gelato-print-submissions`, including migration rerun, concurrent claims, membership guards, gate closure, stale tokens, archive identity, and rollback
- Latest provider-input checks: `npm run test:w4-print-input`, `npm run test:w4-sibling-print-input`, `npm run test:gelato-print-routing`, and ESLint for the new provider-aware helpers and endpoints. Gelato input coverage proves valid frozen assignment acceptance and rejects cross-provider and product mismatch.
- Latest PDF and workflow-copy checks: `npm run test:gelato-print-pdf`, `npm run test:gelato-workflow-copies`, `npm run test:w4-sibling-print-input`, ESLint on the new PDF endpoints and copy test, and `git diff --check` passed. PDF checks use synthetic RGB PNGs. They do not prove real order assets pass quality checks.
- `test:book-kernel`, `test:book-config-integrity`
- `test:w4-print-input`, `test:w4-submit-input`, `test:w4-sibling-print-input`
- `test:w4-production-preflight`, `test:w41-production-preflight`, `test:w4-recovery`, `test:w41-recovery`
- `test:workflow-export-secrets` and scanner against changed W0 and W1.1 exports
- Individual bundled W0 replay fixtures: `book1-standard-single`, `book1-amazon-single`, `book1-amazon-sibling`, `book2-standard-single`
- ESLint for new production helpers/endpoints and changed W0 endpoint
- `git diff --check`, exact plan comparison, unchanged Lulu export comparison, and base integration probe

Whole backend typecheck fails on both clean HEAD and this worktree. With the installed dependencies used here, the clean baseline reports 814 diagnostics and the current tree reports 815. The additional line is an existing W4 worker test type diagnostic involving `Blob`; the new Gelato helper and endpoint files have no diagnostics. The full replay discovery failure on the previous checkpoint reproduced on base and current with `TypeError: Cannot read properties of undefined (reading 'product_info')`; group fixtures lack the individual-order shape expected by that runner.

Production CI runs `npm run pages:build`; not run in this checkpoint. Next build disables TypeScript and lint enforcement, so the diagnostic comparison does not replace build proof. New SQL tests use disposable local PostgreSQL 17 with synthetic data and no TCP listener. No UI changed; rendered UI review does not apply yet.

## Template evidence and remaining work

### Gelato API lookup, 2026-10-11

The official Cover Dimensions docs define the request `pageCount` as all product pages, including covers, and define response `pagesCount` as the number of inner pages. These differ from the 35-page uploaded PDF structure and the existing quote API's page-count field. Docs: https://dashboard.gelato.com/docs/products/product/cover-dimensions/.

On 2026-10-11, the user added `GELATO_API_KEY` to `/Users/jeff/Projects/little-hero-books/.env` and authorized continuing. The key was read without displaying it. The selected product API returned these exact dimensions for the 32-count request: `pagesCount: 36`; `bleedSize` 409.03 x 206 mm with 3 mm thickness; back panel 200 x 200 mm at (3,3); spine 3.03 x 200 mm at (203,3); front panel 200 x 200 mm at (206.03,3). A comparison request with count 36 returned a 409.34 x 206 mm cover and 3.34 mm spine, so it does not match the supplied product template. The 32-count response geometry matches the 35-page template exactly, while its `pagesCount: 36` conflicts with the product page's label of 32 inner pages and the docs' response-field description. Keep `innerPageCount`, Gelato quote `pageCount`, cover-dimensions request `pageCount`, response `pagesCount`, and PDF page count as separate values. Quote behavior against the final 35-page file remains unverified.

The user downloaded the exact Gelato template to `/Users/jeff/Downloads/gelato.photobooks-softcover_pf_200x200-mm-8x8-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver.pdf` from the product page after selecting the confirmed 8 x 8 inch, 32-inner-page product. `pdfinfo` identifies it as a 35-page PDF/X-4. Independent PDF inspection confirms page 1 is a 409.03 x 206 mm cover spread; pages 2 and 35 are blank 206 x 206 mm pages; pages 3 through 34 are 32 individual 206 x 206 mm interior templates. The guides show dashed rectangles at 3 mm and 13 mm insets, plus cover panel boundaries at x=3, 203, 206.03, and 406.03 mm. PDF MediaBox, CropBox, BleedBox, TrimBox, and ArtBox are identical, so they do not encode trim or safe-area semantics. Gelato's help article confirms the 35-page structure and says to use the PDF as a guide layer: https://support.gelato.com/en/articles/8996282-how-do-i-design-a-photo-book. The authenticated product-specific API response was obtained on 2026-10-11. Its dimensions match the supplied template, although its `pagesCount: 36` conflicts with the confirmed 32-inner-page product selection. The guide lines remain template evidence, not trim or safe-area metadata. The repository's 208 mm guidance conflicts with this exact product template.

## New book-config checkpoint

Added `back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json` as a draft Gelato version. It preserves v1 story/page sequences, cover editions, and asset root. Both formats select the confirmed product, 32 inner pages, 35 expected PDF pages, 200 mm trim, 206 mm page canvas, and the measured 409.03 mm cover spread. Standard maps to Gelato's `normal` shipment type; priority and expedited map to `express`, matching existing order-tier semantics. Shipment availability and quote behavior remain unverified for the product and destination. The bundled loader includes v2, while its implicit version selection remains pinned to v1. No config was published or activated.

Checks after this checkpoint: `npm run test:gelato-print-routing`, `npm run test:w4-submit-input`, `npm run test:book-kernel`, `npm run test:book-config-integrity`, `npm run test:gelato-print-submissions`, and `git diff --check` passed. Config integrity assertions cover v1 Lulu preservation, v2 draft status, exact SKU, 32/35 page counts, and measured dimensions. Routing coverage includes W0-to-upsert Gelato fields, partial sibling routing, failed ownership lookup, and missing provider assignment.

Next:

1. Resolve confirmed live W4 `jsCode` drift with a redacted semantic comparison before any import. Keep new copies inactive until downstream Gelato steps exist and pass review.
2. Add quote validation and explicit draft submission to the copies. Quote must use actual assembled PDF URLs, preserve distinct page-count fields, resolve one shipment method under a destination-specific policy, and persist quote identity before draft creation. Automated creates must use `orderType: "draft"`.
3. Finish provider lifecycle paths: item/order mapping, approval, recovery, status webhooks, cancellation, projections, notification outbox, and process-level network fencing for ambiguous submissions.
4. Build representative real order PDFs and inspect pages and pixel quality. Then quote assembled PDFs to verify Gelato `pageCount` behavior and shipment UIDs. Synthetic PDF checks do not prove production assets pass.
5. Complete contract, workflow, PDF, status, UI, rollback, and production build checks. Obtain authorized publication/backfill evidence before enabling routing. Creative approval, physical proof, and a separate cutover decision remain required before production use.

No live writes, workflow imports, config publications, Gelato quote requests, drafts, paid orders, commits, pushes, PRs, deployments, or merges occurred in this execution turn.

## Checkpoint review

Result: CHECKPOINT BLOCKED. Two fresh-context reviewers checked the API/provider path and the migration/router path. The router reviewer confirmed W1.1 targets do not exist yet. The API reviewer confirmed three unresolved integration boundaries: a combined cover/interior PDF is missing, quote shipment types can match multiple methods without destination-specific UID priority, and `apiPageCount: 32` is not yet reconciled with the 35-page source and Gelato's generic page-count definition. The contract fails closed on ambiguous shipping, so no incorrect method is silently selected.

The API reviewer cited Gelato's quote examples with multiple methods of the same type and the v4 docs' definition of `pageCount` including covers. The downloaded 35-page product template remains useful geometry evidence, but it does not replace product-specific cover-dimensions data. No reviewer found a confirmed high-severity defect in the reviewed slice. The checkpoint is blocked because the full route is not implemented and dispatch cannot succeed until the missing exports and policy data exist.

Durable checkpoint receipt: `/Users/jeff/Projects/little-hero-books/.git/worktrees/little-hero-books-w4-gelato/release-safety/review.json`. It records the worktree diff, untracked source hashes, checks, findings, and reviewer coverage. Any file or base change invalidates that receipt.

## Gelato API client checkpoint

Added `back-end/src/lib/books/gelato-api-client.ts`. Quote and create calls use Gelato's fixed v4 host, `X-API-KEY`, bounded timeout, sanitized errors, and injectable fetch for local tests. Create always sends and requires `orderType: "draft"`; it checks response reference, item set, product, quantity, and page count when Gelato returns it. Ambiguous create outcomes raise `GELATO_DRAFT_OUTCOME_UNKNOWN` so callers cannot retry blindly. Mock tests pass. The client is not wired to either workflow and no network request was sent. Quote count remains unverified: Gelato docs say `pageCount` includes covers, while prior product-specific test evidence used 32 for a 35-page file. See [Gelato Quote order](https://dashboard.gelato.com/docs/orders/v4/quote/) and [Gelato Create order](https://dashboard.gelato.com/docs/orders/v4/create/).

The migration now stores quote identity, method, policy version, timestamp, and exact item membership. `record_gelato_print_quote` writes only under the current claim and rejects mismatched members or stale quotes. Submission start and send authorization require a quote less than 15 minutes old. Local PostgreSQL migration, claim, fence, retry, quote-membership, quote-expiry, and concurrency checks pass. No live database was changed.

## PNG validation follow-up

A fresh source review found the PDF assembler accepted empty or corrupt PNG `IDAT` data. Follow-up reviews also found invalid chunk ordering, unknown critical chunks, grayscale palettes, and transparency data that the PDF path could not preserve. `build-gelato-print-pdf.ts` now checks PNG chunk names, checksums, ordering, and supported critical chunks; rejects transparency; caps PNG bytes while reading R2 and caps decoded data; inflates the image data; verifies decoded row length; and rejects invalid row filters before embedding bytes. Tests cover these failures. Focused Gelato PDF, workflow-copy, API-contract, and routing checks pass. Targeted ESLint and `git diff --check` pass. Repeated review rounds kept finding new PNG edge cases, so review iteration stopped under the rigorous-build safety valve. A manual PNG parser pass covered the remaining structure and limits. The prior checkpoint receipt no longer matches the changed diff and is not reusable. The overall W4/W4.1 implementation remains blocked because quote, draft, persistence, status, recovery, and notification paths are unfinished.

## Quote guard checkpoint before product probes

The selected SKU's bundled v2 config now marks `apiPageCountVerified: false`. W1.1 routing and quote/draft request construction reject any Gelato config whose count is unverified. The current value remains 32 as a provisional product setting, while the assembled upload is 35 pages and Gelato's general quote docs say the count includes covers. No quote request or claim can proceed from the selected draft config until product-specific evidence resolves this mismatch.

The database now rechecks the current sorted item-reference membership against the saved quote snapshot in both `begin_gelato_print_submission` and `authorize_gelato_print_send`, and rejects a NULL shipment-policy version when recording a quote. SQL regressions exercise each case. Local checks passed: `test:gelato-api-contract`, `test:gelato-print-submissions` (including concurrency), `test:gelato-print-routing`, `test:book-config-integrity`, `test:gelato-workflow-copies`, and `git diff --check`. Targeted TypeScript diagnostics reported no issues in touched Gelato contract, client, types, routing, or test files.

The copies still stop after PDF assembly. Quote inputs and currency normalization, quote persistence route, explicit draft creation route, provider-order persistence, lifecycle/status reconciliation, and safe recovery integration remain unfinished. W4 and W4.1 exports remain inactive. Do not enable Gelato routing or import these copies. No API key was inspected during this continuation; no external Gelato or production database requests were made.

## Product probes and shipment resolution

The user's subsequent request authorized resolving product count and shipment selection through Gelato API quotes. The key was loaded privately from the specified root `.env`. A synthetic 35-page PDF was uploaded under an isolated `TEST-GELATO-COUNTPROBE` object key and downloaded back with matching SHA-256. Quotes used public sample destinations in New York and California, for one and two items, without customer data.

For this SKU, API count 32 returned HTTP 200 and echoed 32. Count 35 returned HTTP 400. Count 36 priced a larger book and produced a different cover/spine. The 32-count cover-dimensions response matches the selected template. Both v2 editions now mark API count 32 verified. Shipment policy version 2 selects `usps_ground_advantage`, `usps_priority_mail_standard`, and `ups_2_day` for standard, priority, and expedited. It is limited to US destinations; missing UIDs and other countries fail closed. Sanitized provider results are saved in `gelato-product-shipping-evidence-2026-10-11.json`; decisions and limits are in `w4-gelato-product-contract-resolution-2026-10-11.md`.

Quote acceptance does not establish PDF processing approval. Draft processing remains untested. The dispatch gate and both workflow copies remain inactive; no live schema, config, or workflow was changed. The previous checkpoint receipt is invalidated by these local config/schema/test/evidence changes.

## Full adversarial review

Result: NOT READY. Three independent discovery slices and two skeptic slices reviewed the current local work. Confirmed issues affect repeated intake, W0 book/version propagation, per-group routing failure, W4 manifest/page identity, quote request binding and retry generation, processing timestamps and generic recovery, claim/fence locking, and archive error handling. The changed W0 export also retains pre-existing credential literals that the current scanner misses. Source values are excluded from reports. Ordinary reachability of the pre-upload manifest overwrite scenario remains qualified until W0 selector propagation is repaired.

Details, candidate dispositions, checks, skipped acceptance work, and fix order are saved in `w4-gelato-adversarial-review-2026-10-11.md`. The product count and US shipping resolver changes match live quote evidence; no new resolver defect was found. Review did not apply the newly reported implementation fixes. Full Gelato quote/draft/lifecycle routing remains unfinished. Release checkpoint remains blocked; a fresh receipt records the final reviewed file hashes.

## Review repairs completed on 2026-10-11

The original R1/R2/R3/S1/P1/P2/R4/D1/D2/D3/P3/D4 findings are repaired locally. Fresh review cleared intake/routing, frozen W0 publication and W4 source contracts, and SQL/quote/archive/recovery boundaries. Additional repair-review findings are closed. See `w4-gelato-fixes-review-2026-10-11.md` for exact evidence and limits.

Product count and US shipment selection now have authenticated quote evidence in `w4-gelato-product-contract-resolution-2026-10-11.md`; earlier provisional-count notes above are historical. Quotes did not prove file processing. Production build completed locally. Standalone TypeScript remains unclean outside the inspected fix files. Quote/draft workflow integration and full provider lifecycle remain unfinished. Dispatch remains closed and copies inactive. No Git release or production action taken.

The release checkpoint found and repaired backend-first compatibility for the current W0: its existing MVP request stays pinned to v1, and delayed legacy upserts preserve downstream state. New publication remains strict. Pause/drain intake during schema/backend rollout, reconcile null-provider rows created after the backfill cutoff, and drain old raw-upload executions before workflow replacement.

## Quote/draft continuation on 2026-10-11

Checkpoint 1 adds server-registered PDF receipts, canonical quote and held-draft endpoints, a saved request snapshot, one consumed send ticket, connected-order Get retrieval, and atomic child/provider projections. Both inactive workflow copies now call those endpoints. `GELATO_DRAFT_SUBMISSION_ENABLED` defaults closed. Request bodies contain submission, claim, execution, and mode only. Recipient, tier, quantity, product, and files come from saved orders and receipts.

Disposable PostgreSQL proves migration replay, receipt ownership, frozen quoted artifacts, wrong execution rejection, partial and malformed graph rollback, connected graph membership, atomic projection, and replay without status regression. Mock service tests cover quote-to-draft, split orders, post-acceptance Get failure, retained root evidence, and no second create. API tests preserve a matching root ID from malformed responses. Workflow catches cannot fence another execution. Assembly failures wait for lease expiry; checkpoint 2 owns safe pre-send recovery.

Adversarial checkpoint review is in progress. Status/recovery, consumers, package notifications, and final checks remain. No live draft, workflow activation, database migration, Git release action, or customer message occurred. Earlier release-safety receipt is stale after these changes.

Checkpoint 1 adversarial result: clear after fixes. Independent service and SQL reviewers checked current repairs. Service reviewer also verified SQL connectivity; SQL reviewer independently verified response evidence, method echo, and workflow failure behavior. New skeptic launch was unavailable because the agent thread limit was reached. Discovery reviewers cross-checked findings authored by the other reviewer; main verified each accepted finding.

Confirmed and fixed: workflow failures could fence a competing sender; malformed responses lost matching accepted root IDs; shipment UID echoes were unchecked; quote recipients could inherit W3 manifest overrides; SQL could accept disconnected complete item unions. No unresolved blocker remains for this checkpoint. SQL deliberately permits post-send persistence after lease expiry if token and execution still own the consumed ticket. URL host derives from the server resolver, not HTTP caller data. Live file processing, print quality, runtime memory, and production rollout remain unproved.

Checkpoint checks: disposable PostgreSQL migration replay, atomic mapping and concurrency passed; quote-to-draft service, API contract, workflow copies and workflow secret scanner passed. Cloudflare/OpenNext production build passed, with pre-existing duplicate `approved` status key warning. Standalone TypeScript still reports repository-wide errors; no diagnostic targets the new submission/client/snapshot modules or quote/draft routes. No UI changed at checkpoint 1. Release readiness is not judged here.

## Status/recovery checkpoint on 2026-10-11

Checkpoint 2 adds Get/Search recovery with rotating ownership, safe expiry cleanup for unconsumed sends, immutable graph checks, snapshot compare-and-swap, explicit status transitions, and saved progress through holds. Unknown, old, equal conflicting, malformed, or changed item snapshots preserve accepted state and record attention. A saved accepted root can establish acceptance through exact authoritative Get despite Search indexing delay. Rootless empty Search stays held. Recovery contains no create call.

Cancellation remains gated closed. It accepts only verified production orders before production, attempts each connected order, then returns per-order outcomes and confirmed statuses. Timeout may count as fully canceled only when fresh Get confirms every root and child canceled without attention. Partial or unverified results record a hold. The authenticated status relay is also disabled; payloads supply a provider ID only and trigger authoritative Get.

Independent service and data reviews are clear after fixes. Confirmed fixes: terminal draft revival, missing documented statuses, hold progress loss, omitted cancellation attempts, false partial reports after accepted timeouts, and missing durable attention for changed item identities. A claimed accepted-root restriction was withdrawn after reading current saved source and proving successful recovery with PostgreSQL. Reviewers cross-checked the other slice's findings. Agent thread limit prevented a new reviewer session; existing independent reviewers were reused for this new checkpoint.

Checks passed: disposable PostgreSQL migration replay, snapshot CAS, safe pre-send release, consumed unknown ownership, accepted graph recovery without a second create, atomic projections, and concurrency probes. Service tests pass three-order cancellation and timeout cases, package allocation holds, old/conflicting snapshots, status transitions and graph identity changes. Targeted lint passes. Standalone TypeScript remains unclean outside new Gelato modules/routes. Checkpoint 3 consumers, polling and notifications remain. Final build and UI review will follow those edits. No external mutations or Git actions occurred.

## Consumers, polling and notification checkpoint

Checkpoint 3 now projects Gelato drafts, production states and package tracking into admin and customer views. The admin panel offers refresh, outcome recovery and gated pre-production group cancellation. Cancellation uses the existing administrator policy; the deployment must enforce its existing outer access controls before enabling the cancel gate. Partial cancellation reports each provider order and retains attention. Draft queue copy states that printing has not started.

Polling is separate from dispatch and defaults off. It limits candidate and notification batches, passes one deadline signal through provider requests, Supabase queries and outbox transitions, and stops starting work at the deadline. Production notifications use frozen quote targets, exact item quantities, immutable payloads and stable provider retry identities. Unknown targets, incomplete shared parcels and duplicate marketplace item mappings retain per-child notification review records. These records remain visible after later provider snapshots clear item attention.

First review confirmed target classification drift, silently omitted shared parcels, an unbounded database polling query, notification completion without send authorization, string-ID archive gaps and an authorization-time idempotency cutoff gap. Repairs and focused negative proofs are in progress. Consumer review also found stale provider status fallbacks, hidden attention rows, mixed sibling queue guards and returned-order analytics errors. A worker owns those bounded repairs; main owns lifecycle, outbox and cancellation controls. Independent skeptic review is running.

Synthetic quote-to-status-to-outbox-to-Amazon/Resend tests pass, including root-only Amazon identity, duplicate item holds, incomplete parcel holds and database deadline abortion. SQL checks, rendered headless admin review and final build are still underway. No real customer data or messages, provider draft, live migration, workflow activation or Git release action occurred. Checkpoint 2 receipt is stale after these edits.

## Continuation completed locally

Quote-to-held-draft, connected-order persistence, Get/Search reconciliation, cancellation, consumers, bounded polling and immutable notification delivery are implemented in the isolated worktree. Both Gelato workflow copies remain inactive. All provider and communication gates remain closed. This continuation made no live provider draft or paid order, customer message, live schema/config/workflow change, deployment or Git release action. Original Lulu workflows remain available.

Adversarial findings are closed in the bounded service, SQL, consumer and data/API slices. The final CI/rollout review requires migration-first production evidence. Fresh sessions were unavailable at the agent thread limit; independent existing reviewers covered the slices and cross-checked non-author changes. Main checked later layout fixes and the database-query provider predicate. Details are appended to `w4-gelato-fixes-review-2026-10-11.md`.

Checks passed on the current implementation:

- Quote/draft submission, lifecycle/cancellation, notification delivery, canonical API contract, workflow copies and changed-export secret scanning.
- Actual print and active/archived Regenerate 4 HTTP guards make no mutations on existing/mixed Gelato targets. Actual customer status HTTP responses retain canonical status copy and package arrays.
- Attention recovery rejects Gelato, mixed and missing selections; reports non-Gelato update errors and zero affected rows; and rechecks provider in mutation predicates.
- Disposable PostgreSQL migration replay, claim/send ownership, graph persistence, snapshot CAS, recovery, immutable outbox, retry cutoff, shared-package authorization, terminal/archive retention and concurrency.
- Routing, W1.1 claims, repeated intake, W0 freeze/legacy compatibility, recovery/archive compensation, book config/kernel and lossless PDF assembly.
- Legacy W4/W4.1 input, submit, production approval/preflight and recovery; Lulu status/webhook; mapper and R2 regressions.
- Focused lint and `git diff --check`. Full standalone TypeScript still reports existing repository errors. No current diagnostic targets the new Gelato modules, routes, component or new proof scripts.
- Current backend Cloudflare/OpenNext `pages:build` and frontend Astro build. The backend retains the existing duplicate `approved` key build warning.

Separate headless visual/task review used synthetic data and blocked external requests. Inspected admin status at 1440, 768 and 375 pixels, draft/production/unknown states, initial loading and failed inspection with reload, failed refresh, accepted recovery, package links, archived siblings, notification holds, cancellation confirmation/escape focus return and per-order partial results. Attention select-all includes eligible Lulu rows only; disabled Gelato selection and its Print Status link work. The link opens the correct panel, and the active tab scrolls into view. Mobile header spacing and tablet navigation overflow were repaired and rechecked; page width matches viewport.

Customer status review used outputs from the actual preview status API with mocked database transport. Draft, printing, shipped, delivered, canceled and returned states show the correct text. Separate package links render at desktop, tablet and mobile sizes. Dynamic tracking links use underlined, higher-contrast styling and keyboard focus outlines. External analytics/fonts were intentionally blocked. The unchanged React book viewer reported a development hydration error in this local harness; status text, tracking and controls remained usable. Full creative preview and live book/file processing are not proved by this status review. The viewer symptom is a deferred investigation, with unchanged source and local dependency/runtime behavior as the current uncertainty.

Final release-safety verdict: NOT READY for a Git release or production deployment. The complete implementation is unstaged/untracked, so no complete release-candidate index exists. More importantly, pushing to `main` automatically deploys backend changes while the separate production migration has not been applied or verified. Pause/drain intake and affected jobs, apply and verify the migration, resolve legacy null-provider rows, then deploy the backend. Check n8n environment-variable presence before importing workflows. Run controlled real single and sibling draft proofs, retain the draft-only gate and obtain file/physical proof approval before printing. The required manual release suites are listed in the implementation plan because current CI does not select them.

Current-base fetch succeeded; `HEAD`, merge base and `origin/main` remain `46c1f81f00f70de5ec04766bcf406de9735d40dd`. The merge-tree probe reports no committed-range conflict; the full work-in-progress diff is reviewed through its content fingerprints. A durable final receipt under worktree Git metadata records these identities, findings, checks and limits. Any later content/base/index change requires a new gate.

## Read-only production target and queue preflight (2026-10-11)

The configured Supabase target is `mdnthwpcnphjnnblbvxk`, from `/Users/jeff/Projects/little-hero-books/.env` and `back-end/.env.local`. Live W1.1 writes to the same project ref. Its production backend host is `admin.littleherolabs.com`.

PostgreSQL TLS now verifies safely. Local `/Users/jeff/Downloads/prod-ca-2021.crt` has Supabase Root 2021 CA fingerprint `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`; macOS download metadata points to Supabase's official `prod-ca-2021.crt` download. OpenSSL verified the served chain and hostname. `psql` with `sslmode=verify-full` and this root then failed authentication: `FATAL: password authentication failed for user "postgres"`. No Supabase management token is configured, and the Supabase CLI access-token file is absent. Direct catalog and migration-ledger queries remain unavailable. The Supabase service-role key can read the app's REST schema and aggregate order fields.

Production REST schema exposes legacy `orders`, but not Gelato provider columns or submission tables. This does not prove the database migration ledger state; direct catalog access is still needed to confirm it. No migration or schema change was attempted.

Live n8n inventory: W0 `9E0oVs46bMoiyRIP`, W1.1 `TDwc85g03FqPf9D6`, W4 `m4qIN9PCgifUcYih`, and W4.1 `boWA0mB20qYK2g4x` are active. W1.1 contains no Gelato route and calls existing W4/W4.1 only. Neither Gelato copy is installed. Execution API returned no retained records for these four IDs.

The live W1.1 classifier forwards W4 work only when `execution_status` is `ready_for_processing` and `next_workflow` is `4` or `4-aggregate`. Aggregate production order state: 9 rows, all `execution_status=done`; 0 processing; 2 have `next_workflow=4`; 7 have null `next_workflow`. The two W4 pointers do not meet router eligibility. Current evidence shows no eligible W4 work, so no intake drain or maintenance window appears necessary for this snapshot. Recheck queue state immediately before any migration or workflow cutover.

The primary checkout `.env` has `GELATO_API_KEY`; Cloudflare production project `little-hero-labs-admin` does not. Production also lacks `GELATO_DRAFT_SUBMISSION_ENABLED`; the draft gate therefore stays closed. `ENABLE_LULU_PRODUCTION_SUBMIT` remains configured. No Gelato API request, order creation, workflow change, deployment, or database write occurred during this preflight.

## Preview and direct draft continuation, 2026-10-11

Preview repaired the event hydration race, server-derived book manifest key and camelCase approval state. Approval now requires a valid pending token, loaded pages and a subscribed viewer. Missing/invalid manifests and blocked hydration cannot send approval. Independent headless review cleared fast/delayed loading, canonical new-book paths, absent-field older-backend fallback, conflicting field casing, used/expired approval states, repeated ready/replay and subscriber cleanup. Actual token POST proofs cover both books and valid/used/expired pending/approved combinations. Frontend and backend production builds pass. The earlier React cache symptom did not recur after a clean development cache; no dependency change was made.

Main separately inspected phone 390x844, tablet 768x1024 and desktop views, page buttons/keyboard, zoom/Escape, correction submission and mocked approval. Width matched viewport; screenshots used synthetic art. A missing image shows an error; existing page images are not all required to finish downloading before approval. Full creative and physical proof remain open.

Live read-only preflight resolves canonical book and order-prefix hints for all nine existing rows. No row lacks both hints, so the mapper's unknown-book placeholder does not affect current previews. Future records without canonical identity must be held for repair.

Two direct Gelato API tests created synthetic held drafts: root `ae4fd511-b90e-472c-b47b-7e0a24d33875` contains one item; root `de9bf2f5-12ea-48ff-9149-beaa30234b8d` contains two distinct items. Both use API page count 32, synthetic PDF count 35 and configured standard shipping. Get/Search confirmed complete membership and root order/financial/fulfillment statuses of draft. Item statuses are created. The tests used canonical request builders and validators with a private consumed-once local send journal; they did not execute deployed W4 or its database claims/projections. See `gelato-draft-proof-evidence-2026-10-11.json`.

Later Get replaces the source URL with Gelato's stored S3 copy. All three stored files have the exact submitted SHA256 and 784477-byte size. Each item has three preview metadata entries; processedFileUrl is absent. Existing strict URL validation rejects these copies. The next checkpoint repairs that comparison through bounded streamed byte verification, retaining strict membership and database artifact guards. No further create or paid conversion is needed. A purchase-type receipt exists in each draft response; financial status remains draft, so receipt presence alone is not evidence of a charge.

Live rollout still needs valid PostgreSQL/admin credentials, migration verification and a fresh release gate. The user was asked to update access while independent work continues. No live schema/config/workflow/app update, customer message, Git action or paid printing occurred.

## Stored-file repair checkpoint complete

The async graph wrapper now checks complete identity and mapping before file downloads, verifies copied bytes against each registered R2 artifact, and only then normalizes the copied URL to the immutable request URL. SQL guards stay unchanged. Missing receipts, changed bytes, unsafe hosts, redirects, byte limits and deadlines fail closed. Digests stay in memory within one verifier operation. Provider URLs are excluded from error messages and normalized file snapshots.

Verification streams one file at a time, with 256,000,000 bytes per file, 512,000,000 bytes per operation and one 30-second verification deadline. Polling also applies its existing shorter deadline. On poll abort, the store cannot persist cleanup; provider/child state stays unchanged, notifications skip, and an interrupted recovery claim may remain leased for 15 minutes. A later read-only attempt waits for expiry. Large groups may require a future reviewed budget policy.

Independent review found an R2 error-body read outside those budgets. Only the verifier now opts into raw error Responses; it cancels non-OK bodies before reading. Legacy getObject callers retain their strict default. The actual R2 error transport regression and an actual default poll-runtime stalled-file regression pass. The latter reaches the verifier through mocked SDK/database/Get/R2 transports and proves shared deadline cancellation, zero canonical writes and zero notifications.

Stored-file, submission, refresh/recovery, notifications, R2, API-contract and disposable PostgreSQL checks passed. Reproduce-first submission test rejected the copied URL before the repair and passed afterward. Two independent existing reviewer sessions cleared the repair and its error-body follow-up; the preview reviewer separately cleared the approval eligibility fix. No unresolved correctness finding remains in these checkpoints. Fresh-context reviewer capacity was limited; sessions were reused, with a different reviewer checking each accepted candidate.

Read-only Get of both existing drafts passed the repaired graph wrapper after SHA256 verification. All three stored copies remain identical to the original synthetic PDF. This live check uses the direct proof's recorded artifact hash; it does not fabricate or exercise production database artifact receipts. Live W1.1/W4/W4.1 execution, deployed resource behavior, processed production files and physical quality remain unproved.

Next rollout sequence: restore valid Supabase admin access; recheck exact target, queue and canonical legacy hints; apply and verify the migration; configure Gelato credentials while dispatch, draft submission, polling, notifications, cancellation and relay remain off; rerun the final release gate; deploy the app and updated W0 caller; import the inactive Gelato copies and verify bindings; then enable only a controlled test-order draft path once config and file approvals are met. Keep book readiness false until copy/artwork and proof requirements are met. Customer printing stays closed. The existing approval page's timing promises also need review before customer launch.

Final continuation checks: backend Cloudflare/OpenNext build and frontend build pass. Standalone TypeScript still fails on baseline diagnostics, including unchanged R2 lines 74 and 306; no new verifier, polling proof, submission/lifecycle or token-contract diagnostic appears. Changed workflow exports, including both new untracked copies, pass the secret scanner. Final release review remains NOT READY for rollout: the production migration is unverified and intended source/test/config changes remain unstaged. No commit, push or merge was attempted.

## Production database installed, 2026-10-13

Supabase access is restored through J+J Personal for the exact Little Hero Labs project `mdnthwpcnphjnnblbvxk`. Installed migration `20261013191407`, `gelato_print_provider_foundation`, with a 5-second lock timeout and 60-second statement timeout. Source SHA256 is `8adaac1b30fd5a073672ce00b399354d1ef51d91a4c0308ec3920812fcbfcd7f`. The migration tool reported success; catalog and ledger checks independently confirmed installation.

Live default privileges exposed inherited anonymous and authenticated access to the new package-reference sequence. Added an explicit revoke before the service-role grant. Disposable PostgreSQL reproduced the failure first, then passed the repaired privilege checks, double replay, atomicity, recovery, outbox and concurrency cases. W0 legacy/freeze, intake replay and workflow-copy checks passed. Two independent existing reviewers cleared the current schema checkpoint. Fresh reviewer sessions were unavailable; sessions were reused.

Verified all 17 order fields, five private RLS-enabled tables, 22 private service RPCs and three identity/ownership triggers. Anonymous and authenticated roles cannot access the private tables, mutating RPCs or sequence. Service-role REST reads return 200 for every new table. The new dispatch gate is false; all provider submission, item, order and notification tables are empty.

All nine existing orders are assigned to Lulu, remain done and have no Gelato submission. No known legacy row remains unassigned; no order is processing or eligible for W4. The existing 12 queued and one expired-running 2A jobs have no matching active order. Their state is unchanged. Manifest 2A/2B RPC definitions retain their original hashes. Backfill ran the existing updated_at trigger but did not change fulfillment state. Intake stayed active during this compatible schema expansion.

Security advisors report no new warning. Five additional no-policy RLS information notices describe the intended private backend tables. Existing public manifest-upsert, mutable search_path and vector-extension warnings remain outside this migration. See `gelato-database-rollout-evidence-2026-10-13.json` for sanitized catalog, permissions and ledger evidence.

The database-access and unapplied-migration blockers are resolved. Application release, runtime setup and inactive n8n installation remain. Before backend/caller cutover, inventory any old-W0 orders created after the migration cutoff and reconcile their canonical provider identity. Keep book readiness false and Gelato dispatch, draft submission, polling, notifications, cancellation and relay off. Full deployed W4 proof and creative/physical approval remain open. No app deployment, workflow import, Git release, new provider order, paid printing or customer message occurred in this database step.

## App release candidate, 2026-10-13

Final gate scope is the complete prepared app/workflow/config diff with all Gelato gates off and current live Lulu workflows retained. The database-first and incomplete-index findings are resolved. All 137 intended paths are staged; no foreign, unstaged or untracked content remains. Fresh fetch keeps HEAD and origin/main at `46c1f81f00f70de5ec04766bcf406de9735d40dd`; the merge-tree probe reports no committed-range conflict.

Three independent existing reviewers covered CI/rollout, provider services and config/callers/consumers. They found no confirmed release blocker. Current source and inputs match the prior complete application/workflow diff and untracked source hashes. Reused manual behavior, build, lint and rendered task evidence therefore applies; the corrected SQL and its production-default tests were rerun. Fresh service, workflow, intake, routing and scanner checks also passed. Standalone TypeScript retains prior repository failures; no new Gelato module diagnostic was introduced. Fresh reviewer sessions remained unavailable.

The impact map covers W0 manifest/config ownership, order triggers and provider claims, quote/draft/Get/Search persistence, polling and immutable outbox, existing Lulu writers, admin/customer status, archive/recovery, workflow bindings and automatic backend/frontend deployment. Legacy/null, retries, concurrency, partial graph/cancellation, stored-file byte validation, stale snapshots, notification eligibility and blocked preview approval have behavior proofs. Disposable database fixtures include production integer/timestamp types and default grants. UI proof uses synthetic data at phone/tablet/desktop sizes; live W4 resource limits, finished artwork and physical color/print quality remain unproved.

Near-final live inventory remains nine done/Lulu orders, zero unassigned or post-cutoff old-W0 rows, zero processing and zero W4 candidates. Authenticated Cloudflare project inspection confirms the canonical admin domain, absent Gelato key and absent draft/poll/notification/cancel/relay flags. These flags all require literal true in source and are disabled. The existing Lulu production flag is present. Existing checkout CORS OPTIONS returns 204 and an unknown preview-status GET returns 404 without creating an order. Runtime settings and live workflows were not changed.

Release result: READY WITH RESIDUAL RISK for the gated-off app candidate. The residual risk is missing deployed W1.1/W4/W4.1 execution and production resource/file proof. Closed dispatch and runtime gates prevent those paths from running in this release. Activation still needs runtime credentials, verified n8n environment values and bindings, canonical approved config/files, merchant contact and controlled deployed single/sibling draft tests. Recheck queues/provider assignment and the receipt identity immediately before Git release/deployment. No optional cleanup blocks the candidate; existing security advisories remain separate.

The exact result, complete diff fingerprints, policy ledger, checks and reviewer coverage are recorded under worktree Git metadata at `release-safety/review.json`. The prepared candidate has not been committed, pushed or merged. Rigorous-build requires separate user approval before those Git actions. A merge will trigger the existing app deployment workflows; Gelato activation remains a later step.
