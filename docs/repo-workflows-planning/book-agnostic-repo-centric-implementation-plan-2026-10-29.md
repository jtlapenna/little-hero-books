# Shared repo-centric book workflows: implementation plan

Status: Jeff authorized safe plan publication and phased implementation. Read [current authority](book-agnostic-execution-authority-2026-10-30.md), which supersedes earlier no-commit and paused-automation directions. The implementation scope and phased format received independent review; new source still requires phase QA and release-safety. Runtime state, once initialized, records actual progress.

## Phased-heartbeat format

Use the [ten-phase package](book-agnostic-repo-centric-phases-2026-10-29/README.md). Checkpoints 0 through 6 below remain the detailed design. Run ordinary phased-heartbeat with fresh-context QA, required visual checks, release-safety and phase-scoped commits/pushes. Never stage the entire mixed worktree. Historical no-commit conversion reviews remain unchanged as dated evidence; no custom adapter is needed under current commit authority.

The local phase set ends at verified local artifacts and a concrete external pilot packet. Actual provider execution, deployments, uploads, hosted config/template creation and hosted test records remain separately authorized actions. A held external pilot is not marked passed or silently skipped to complete a local run. The later pilot has its own acceptance boundary in the [pilot plan](new-book-amazon-workflow-e2e-test-plan-2026-10-29.md).

## Outcome and boundary

Use one repo-centric workflow chain for the first book, Inner Voice and future books. A versioned book configuration supplies content, supported customization rules, references, poses, page sequence, layers, typography, guides, cover, dimensions and templates. Adding a book within the engine's documented capabilities requires configuration, assets and catalog registration, without editing workflow nodes or adding a book-ID branch. Unsupported capabilities must produce an explicit validation error.

This is not a promise that JSON can implement every future illustration or layout feature. New capabilities may require one reusable renderer/provider-input change, then become configuration options for all books. Provider endpoints, credentials, retries and approved model availability remain shared operational policy. Book content and appearance references must not live in workflow code.

Scope includes normal Amazon upload into the shared chain, W0 selection/snapshot, queue/router, all W2A subworkflows including QA/upload, W2B, W3, and PDF generation within W4. Include W4.1 and callbacks only where they carry book identity, configuration or artifact paths. Preserve print release behavior without implementing or executing paid submission. Website checkout recovery, payment redesign, new intake SQL architecture, heartbeat infrastructure and broad provider migrations remain excluded.

Use the [source audit](book-agnostic-workflow-audit-2026-10-29.md) and its evidence as starting claims to verify. The [Amazon pilot plan](new-book-amazon-workflow-e2e-test-plan-2026-10-29.md) describes later external acceptance, not permission to execute it.

## Contract to establish

- Resolve `bookId`, config version and `formatId` once at intake. A new order pins a validated configuration. Existing orders retain their stored snapshot/version through retries, revisions and reassembly. Never silently move an existing order to a newly active config.
- The frozen config and canonical order context own book-dependent values and artifact namespaces. Downstream stages consume that snapshot or values derived from it. They need not independently reload config. A conflicting caller override fails before storage/provider effects.
- Keep book config version, rendering schema version and workflow/export version distinct. Unknown book, unsupported schema/format, missing configured asset, conflicting selection and incomplete reference/pose plans fail explicitly. Legacy defaults apply only to identified legacy orders, never to a selected new book.
- Page/cover plans determine the required pose set, including zero, nonsequential, repeated, secondary and cover-only poses. No universal 13-pose count or 0..12 clamp applies to configured books.
- Rendering output, review availability, customer approval and permission to print are distinct states. Producing a review PDF must not imply print readiness, send messages or bypass John's revision/invalidation controls.
- Synthetic local tests replace external effects explicitly. A later hosted service-chain pass must traverse actual provider nodes. Neither mock output nor helper-only success is production end-to-end evidence.

## Checkpoint 0: preserve and reconcile John's baseline

Refresh a read-only comparison with current main. Last verified main was `ced6e3b15c28d0efa1640ae37ddcb8f796d352d9`, including PRs #64/#65; this mixed checkout's HEAD was `f7efbb3308df1111568890ed6de9ae5c7c38fe74`. Record the actual current hashes and an ownership map before implementation.

Preserve the complete local diff, relevant untracked source and existing backup/evidence. Reuse this checkout. Do not reset, rebase or import an entire upstream tree over it. Prepare a path/hunk integration map that includes any new upstream dependencies required by shared files. Incorporate only necessary baseline dependencies and book changes as reviewable phase edits. Stage/commit only the reviewed phase content. If ownership or concurrent edits cannot be distinguished, preserve that path and resolve the exact overlap before editing it; continue independent work.

Shared files already identified: backend package scripts, W3 publisher, configured W3 boundary tests and configured W3 pipeline tests. Keep John's invalidation before replacement of W3 output, stale-link rejection, correction/reapproval, queue ownership and print-release gates. Package additions must be additive. His newer baseline may reveal additional overlaps; four is not an assumed final count. Existing local Gelato changes with uncertain ownership are not cleanup targets.

Acceptance: source baseline/integration map records all intended edits and required dependencies, no foreign staged changes, no lost work, and named preservation checks for John's behavior. Historical receipts remain unchanged; refresh checks against the eventual combined source before claiming compatibility. This checkpoint changes no application behavior and performs no deployment.

## Checkpoint 1: configuration contract and first-book parity

Reuse the existing config schema, loader, page planner, render snapshot and configured renderer. Extend those contracts where necessary rather than adding a second registry or book engine. Separate shared operational settings from book-dependent configuration.

Inventory existing book-specific values in the first-book W3 branch and W2A reference/QA paths. Express the first book through the same configured content/layer/cover contract, including its edition differences, copy, placements and character/guide behavior. Preserve old snapshots through a versioned legacy compatibility path; do not rewrite historical manifests or repurpose an immutable published config version. Introduce a new config version if moving first-book output into recipes changes its definition. Keep legacy code only as an explicit old-order adapter; new configured books use the shared path.

Generalize the Inner Voice name-length rule and the inconsistent book-ID/provider tests for configured orders into supported config validation/capability checks. Preserve their intended limits and frozen character values. Do not weaken identity checks or expand into order authentication redesign. Configurable style/reference and prompt-profile choices may select typed, approved shared capabilities; config must not contain executable code or arbitrary provider credentials. Retain the current character vocabulary as the initial capability set and validate unsupported selections.

Add validation for book metadata/title templates, customization limits, namespaces, formats, geometry, templates and recipe requirements. Use the existing catalog/bundled-loader registration pattern; document the small explicit registration step. Config additions must not require workflow edits or hardcoded new-book conditions.

Acceptance: first-book standard/Amazon output matches accepted references for page sequence, text, placement, cover and templates. Inner Voice retains its editor-selected cover/orientation and flexible text. A third fixture with a neutral book ID can validate without a source branch for that ID. Invalid/unavailable capabilities fail before mutation. Any intentional first-book visual change requires separate review, not a silently refreshed golden file.

## Checkpoint 2: intake selection and immutable handoff

Extend the existing authenticated CSV/TXT upload and shared order/W0 builders. Derive book title/page metadata and identifiers from the selected config instead of first-book constants. For the pilot, plan an explicit book/edition/version selector in the existing multipart entry, carried through the existing parser/order creation/W0 path. Preserve existing first-book upload behavior for the documented legacy case. Treat SKU mapping as a later catalog integration unless Jeff supplies authoritative mapping; do not invent one or silently infer the new book from free text.

Resolve that selection once for all items that share it; line items with conflicting product selections must reject or use an explicit per-item mapping, never inherit the wrong book. Preserve uploader-generated root, child and quantity-expanded identities. Freeze the selected published config in W0; local tests use synthetic config/storage dependencies and never publish it. Resolve active/default selection before dispatch, then send the explicit version; an n8n fallback of 1 is not a way to select the latest book.

Preserve old-order replay/revision semantics. Newly selected unknown books/formats, absent versions and conflicting selectors fail clearly. Plan source changes for uploader controls only; do not enter website checkout/payment flows.

Acceptance: tests enter through the actual multipart upload handler, real CSV/customization parser and W0 builder with controlled download/storage/dispatch boundaries. Assert selected config, persisted metadata and emitted W0 request together. Cover first book, Inner Voice, third book, quantity/siblings, missing/conflicting selectors, invalid customization and replay. No test may replace the input with an already-built W0 manifest and claim upload coverage.

## Checkpoint 3: common orchestration, generation and callbacks

Use the repo-centric exports and their existing backend endpoints. Fix the queue's W4 manifest path using canonical order/manifest context. Carry the frozen identity through dispatch, subworkflow inputs, completion callbacks, normal retries and manual review/reassembly. Never derive a per-child key from a group root or reuse a different book's cache solely because the child appearance matches.

Audit W2A base, pose, QA and upload together. Replace reachable configured-path first-book roots/counts/clamps with inputs derived from the frozen config. Keep bounded legacy fallbacks for identified old orders. Use recipe references for QA and scale normalization as well as generation. W2B processes the approved configured pose set and writes into the selected book namespace. Inspect cache identity dependencies on config, references, prompt profile and rendering inputs; change only the key dependencies required to prevent wrong-book/stale-reference reuse, without invalidating historical assets in place.

Check W4.1 error and QA artifact writers as direct path consumers. Some saved repo-centric error nodes still construct first-book keys. Preserve group/member separation. For mixed-book or mixed-format siblings, either handle each member with its frozen geometry and identity or reject an unsupported combined artifact explicitly; never concatenate incompatible pages under an invented shared config. Print aggregation/release policy itself remains John's existing contract.

Acceptance: execute extracted/current node logic and actual backend producers/consumers locally with external effects stubbed, not merely search source for removed literals. Test nonsequential/cover-only poses, two books sharing appearance values, changed references, retried completion, sibling isolation and wrong-book/context rejection. Capture node inputs/outputs and canonical manifest linkage. Static graph reachability complements, but cannot replace, those behavior checks.

## Checkpoint 4: shared rendering and review PDFs

Complete the flexible-flow rendering capability as a generic recipe option. Keep text, guides, poses, dimensions and font references in the frozen config. First-book new-version recipes and Inner Voice must run through the same W3 configured producer. Validate actual short/long-name fit and guide substitutions; do not use string length alone as output evidence.

Resolve interior/cover dimensions and PDFMonkey template IDs from the frozen format config. Workflow-level credentials and provider settings remain operational; they must not silently override a selected book's geometry/template. Preserve documented legacy defaults only for known legacy artifacts. Validate PNG-to-PDF scaling, bleed, cover spread and page order for each supported format instead of assuming the original square dimensions.

PDFMonkey template discovery is part of implementation: determine which existing page/cover PNG and interior/cover PDF templates can be reused, which need parameter changes, and which require new templates. Prepare any new HTML/CSS, payload contracts, output settings and template specifications locally. Preserve John's and the first book's existing hosted templates. Bind newly created template IDs to a new config version only after separately authorized hosted creation and validation. Do not invent usable hosted IDs or edit a shared template in place as incidental testing. The need for new templates does not stop independent local work; record that hosted binding as pending in the pilot packet.

Reuse existing preview/PDF workers and job/event plumbing for review output. First inspect existing controls. If changes are needed, define a bounded review-artifact intent within that path, separate from print admission; do not clone the renderer or create an alternate book pipeline. A review case may publish draft/flow review artifacts while remaining ineligible for print submission. Preserve John's invalidation ordering and approvals. Permit flow publication only after its applicable source/input/output fit checks, and keep unverified flow output held. Do not remove W3/W4 refusals wholesale or set draft books active to bypass them.

Acceptance: local producer-to-consumer tests cover frozen config through W3 plan, publication, review PDF input, exact PDFMonkey request construction and returned artifact metadata with fake providers. Inspect every rendered page and cover separately in headless visual/usability QA. Cover template conflicts, changed assets, stale fit evidence, long/wide names and schema mismatch. Assert zero print-submission, payment and notification calls. A local assembled PDF remains labeled local and cannot satisfy the later actual-PDFMonkey gate.

## Checkpoint 5: prove a future book needs only configuration

Use three inputs: first-book standard/Amazon, Inner Voice with current approved provisional assets, and a synthetic third book that is not a renamed clone. Give the third book a different page count, nonsequential and cover-only poses, different copy/font/template references, and a second supported geometry. Use new config/assets/registration only. Do not edit workflow nodes or add its book ID to application branches. Synthetic provider template IDs are local fixtures, not invented hosted resources.

Run these through the same configured upload-to-review-artifact producer/consumer chain. Exercise cached/replayed orders separately and assert frozen old-order versions remain stable when a newer config is introduced. Verify invalid recipes/formats/config versions fail before external work. Retain page/cover parity references for the first book and editor-led visual expectations for Inner Voice.

Required checks include the existing configured book/pose/W3 tests, W0 freeze/selection tests, W3 publication/reassembly and revision-invalidation tests, W4 input/worker tests and the new upload-to-review contract regression. Add targeted source-contract scans for reachable new-book branches and literal overrides; scans are supporting evidence. Run repository-mandated gates applicable to the changed source. Any inherited failures need explicit baseline comparison; do not hide them or turn unrelated remediation into this project.

Acceptance: a reproducible local evidence packet links exact source/config/workflow hashes, inputs, provider-request fixtures, output hashes, negative results and visual review. No claim of hosted readiness yet. Missing final art, copyright text or physical-print review remains disclosed rather than blocking a provisional service-chain proof.

## Checkpoint 6: prepare the real service-chain pilot

Read-only authorized inspection must reconcile the deployed backend, W0 override, active n8n definitions, all referenced subworkflows, published config and PDFMonkey templates. Historical ownership docs conflict on the active track; do not infer it from names or saved active flags. If hosted access is unavailable, record exact missing bindings and continue local work without pretending they passed.

Prepare one synthetic Amazon-format upload/ZIP packet using the normal entry and an agreed config. Identify how it stays isolated while taking actual Gemini/Bria/PDFMonkey branches. Verify queue, reminders, callbacks and W4 cannot trigger customer/Amazon messages or print orders/drafts, including delayed and retry paths. A generic test flag or disabled Gelato gate does not prove those boundaries. Use existing controls where sufficient; isolate any required changes and review with the source owner.

Before any external execution, present Jeff with target versions, input/assets/config, proposed uploads/hosted records, provider usage/cost bound, stop controls and rollback. Existing restrictions remain until explicit authorization for that packet. Deployments, uploads, generation, hosted test records and messages are not authorized by plan approval. A run authorized later must collect actual provider execution/document IDs and inspect the returned PDFs; mocks and cache-only branches cannot pass. Follow the [pilot plan](new-book-amazon-workflow-e2e-test-plan-2026-10-29.md).

## Work controls and finish criteria

Execution has been requested. Keep changes phase-scoped; commit and push only after applicable reviews. Preserve frozen writers/receipts and pinned proofs. Only the scoped owned run may be scheduled under the current authority. New bulk output goes to the UUID-validated external project root. Use scrubbed local test environments, OS network denial and headless review. Builds/proofs use the shared heavy-job lock and approved foreground runner; do not install dependencies, run old frozen writers or delete evidence as incidental preparation.

Use checkpoint release-safety review for shared-contract changes, including John's producer/consumer regressions; final release gates and current human authority apply to every Git action. Hosted actions remain separately authorized. Unrelated scheduling, checkout recovery, financial-policy work and automatic cleanup stay out of scope. When a new issue is unrelated to configured book production, record it and stay within these checkpoints.

Done locally means the three-book config-only acceptance packet passes, first-book behavior and John's safeguards remain intact, onboarding instructions name required config/assets/registration steps, and every supported book uses the same repo-centric orchestration and shared configured render contract. Old-order legacy adapters may remain explicitly versioned. Hosted completion is a separate actual-provider pilot gate; physical printing and final-artwork approval remain outside this plan's execution authority.
