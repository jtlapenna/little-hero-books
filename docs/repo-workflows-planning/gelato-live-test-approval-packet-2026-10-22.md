# Proposed live draft-only acceptance window

Prepared October 21–22 Pacific / October 22 UTC, 2026. **Local preparation only. No live approval has been granted.** Baseline main and last recorded serving source: `4703b609ccaee65fd131105a7f3f87f3fc084f90`. Local source changes below are unpublished and undeployed. No hosted state or historical orders were queried during this preparation.

## Decision to review

Authorize, in stages, the narrowly described source/configuration/diagnostic setup and then three fresh, isolated, **unconverted draft** cases. The proposed maximum spend is **USD 0**, with no payment/funding change. Normal controls stay OFF; all six historical orders are excluded from every selector and action. A zero price or absent payment method does not guarantee no production. Actual printing/regular submission remains forbidden by this proposal.

This packet is ready for **setup review**, not immediate execution. The [exact setup manifest](gelato-draft-approval-evidence-2026-10-22/setup-manifest.json) names proposed resources and bounds diagnostic setup; four [inert credential probes](gelato-draft-approval-evidence-2026-10-22/probe-candidates.json) are separately reviewable. Its [machine-readable packet](gelato-draft-approval-evidence-2026-10-22/packet.json) deliberately has null hosted IDs, dates, approval and final private-context hashes, plus `canExecute=false`. No runnable authority, fake database identity, fabricated approval or scope has been created. Do not pass it to the live launcher.

Jeff/Gelato's explanation is deferred, as John requested. That is no longer a prerequisite for preparing this draft-only window. Existing regular-conversion and legacy queue locks remain in force.

## Three cases and nine shipping comparisons

| Case | Actual diagnostic path | Immutable dummy roles / quantity | Primary requested tier | Exact expected service |
|---|---|---|---|---|
| Website single | Isolated queue, native W4 assembly + native W4 quote/draft | WEB-A standard, 1 | standard | `usps_ground_advantage` |
| Amazon single | Isolated queue, native W4 assembly + native W4 quote/draft | AMZ-A Amazon, 1 | priority | `usps_priority_mail_standard` |
| Amazon siblings | Isolated queue, native W4.1 assembly + native W4.1 quote/draft | SIB-A + SIB-B Amazon, 1 each | expedited | `ups_2_day` |

Use `book-finding-our-inner-voice`, config version 2 and the selected 200 x 200 mm softcover product. Counts stay separate: **32 physical inner pages, API pageCount 32, 35 uploaded PDF pages**. No placement-review PDF is included.

Exactly three primary quote POSTs and at most three draft-create attempts are proposed. Each native quote snapshot retains all provider shipping options through `observeGelatoMonetaryQuote`; compare its standard/priority/expedited options without six extra quote calls. This yields nine comparison cells and three genuinely persisted primary service selections, not nine live orders. Missing/unavailable tiers must fail or remain unavailable; no substitute service or extra request is automatically authorized. Unsupported-country/service negative cases retain local proof unless a separately approved real request is added.

Fresh PDFs passed SHA-256, all 140 page geometries/blank positions, 132 source-image pixel associations, and rendered identity review. Four readonly copies and [private visual review](../../.gelato-testing/live-test-approval-20261022/book-review.md) are available locally. Source hashes and sizes are in the evidence packet. Inspect the four roles/editions and confirm the existing private destination before live approval; this engineering inspection is not final creative approval or provider prepress approval.

## Stage A1: proposed source and isolated setup approval

This stage requires real approval before any publication or hosted action. It grants **no provider request or order submission** by itself.

1. Review/publish the exact local source diff and its passing regression evidence. Use the personal repository/account boundary, required release-safety review and hosted checks. Final commit identity must replace the baseline-only proposal before deployment. No unrelated release may be silently absorbed.
2. Deploy only the reviewed backend exact-root confirmation fix while keeping all six settings and both gates OFF. No new migration is proposed. Verify current migration inventory/source and OFF state; a missing or mismatched prerequisite is a stop, not permission to install other SQL.
3. Verify the intended Jeff/LHL account and order-key digest through approved, order-free account/configuration checks and owner confirmation. Add `GELATO_STATUS_API_KEY` only if missing, using the same exact scoped order-key value through protected storage; never rotate/replace the normal Gelato account globally. Record saved/serving digests privately, not key values.
4. Bind new diagnostic-only managed backend, intake and per-case scope credentials; never edit ordinary callers or historical workflows. Backend credential no-op must call GET `/api/internal/w4/submit-gelato-draft` without order selectors and prove request-time OFF. Scope capability must match the exact stored digest and approved cohort before dispatch. Any extra probe workflow/call must be explicitly enumerated in the setup manifest, not improvised after approval.
5. Prepare only four fresh synthetic fixture rows, three root groups and immutable test artifacts. Suggested prefixes are `TEST-GELATO-48H-WEB`, `TEST-GELATO-48H-AMZ`, `TEST-GELATO-48H-SIB`, each with a fresh suffix. Do not reuse consumed claims, submission IDs, signed URLs, scopes or webhook paths. The four local candidate rows retain null database IDs, an invalid synthetic destination and pending customer approval; they are marked non-persistable. Real recipient/IDs are bound only after setup approval. Controlled ready-manifest injection is an explicit upstream substitution, not proof of a real preview/customer approval. Bundled draft/test-mode W3 still reports not ready and is rejected by W4. The proposed per-test W0/W3 fixture uses an explicitly reviewed in-memory active-config clone solely to supply complete dummy ready inputs, while its database row remains testMode=true; no bundled/global configuration is changed or activated. This substitution must be approved explicitly before uploading any such fixture.
6. Compile four diagnostic definitions per case (12 total: queue, assembly, draft, timer) from the pinned native W4/W4.1 sources. Install only those new exact definitions with managed references, disabled execution-data persistence, no HTTP retries/redirects and terminal response semantics. Keep all 12 case workflows inactive until the later approved case window; verify published versions/content and credential-reference digests. Normal W1, old diagnostic workflows and ordinary schedules stay unchanged.
7. Produce a final private execution manifest with actual row/artifact/account/workflow/source bindings and prospective scope UUIDs, exact allowed operations, fixed positive window <=30 minutes per case, journal root and cleanup commands. Stop for Stage A2 if any operation differs. Setup reserves but does not issue scope identities or mark customer approval; A2 must expressly authorize the four fixture approval transitions before queueing. Reserve scope identities privately but do not issue usable execution authority before Stage A2.

A1 is bounded setup, not a blanket operational approval. The accompanying setup manifest enumerates seven new managed credentials, twelve case workflows plus four temporary no-order probes, at most four probe activations/invocations/deactivations, forty exact workflow metadata GETs, four fresh row inserts and 140 source-object uploads (132 PNGs/eight manifests), with zero existing-row updates or scope issuance. Probe readback validates the backend header portion; a diagnostic GET does not validate its ignored scope header. Final source digests and bound readbacks must match before A2. This document does not fabricate unknown hosted IDs or claim those readbacks already happened.

## Stage A2: exact live-window approval

After A1 readback, present the final stable case manifest for human approval: exact fresh cohort/root/member identities, source/version/config/PDF/recipient/service hashes, account digest, workflow identities, time windows, call/byte budgets, deny list and independent close plan. Ask for approval of **those three draft-only cases**, not a generic permission to test Gelato. No stage starts until the actual human decision covers its operations and bindings.

Keep the human decision separate from machine integrity. `LaunchContext.approval` and `--approved-context-sha256` bind inputs; they do not authenticate Jeff's approval. Record the real decision reference privately. Obtain fresh funding/message facts within 60 seconds of preflight and compile/review the final private context immediately before launch. Its fresh timestamp/evidence fields must satisfy the approved invariant policy; changed case/source/file/recipient/service/operation/window bindings require a renewed decision. Do not ask someone to approve a raw context days ahead and then silently edit it, or pretend a self-generated boolean is consent.

Only then may the separately approved parent window/scope be issued and the exact three new case webhook workflows activated. A2 also requires named fixture approval transitions, never ordinary customer approval or notification. Its cleanup deactivates all four owned copies. Scope must bind the exact account key, four readonly PDF hashes and fresh members; no fallback credentials. Never enable global admission, polling, relay, cancellation or notifications. Once authority exists, an independent monitor is armed before the primary; retain an external owned close path for host/process failure.

## Source changes prepared locally

- Terminal response timing: shared workflow limit 240 seconds, terminal webhook HTTP limit 250 seconds, enclosing stage limit 290 seconds (six metadata reads can consume 30 seconds), all clipped by case expiry. Ordinary metadata requests retain 5 seconds; cleanup retains separate budgets. A delayed assembly response beyond 5 seconds is now tested.
- Adapter observation loop: at most 12 complete iterations, consistent with its 200-call budget. Timer ticks and actual claimed provider refreshes are counted separately. No additional polling claims are minted to force success.
- Engineering-OFF draft confirmation: reject any connected ID other than the newly accepted root **before** a provider GET. Save/fence the accepted root on failure; no resend. Ordinary enabled split-order graph behavior is preserved.
- Cleanup now deactivates/verifies all four owned diagnostic copies even if failure occurred before timer activation; later copies/windows cannot inherit active webhooks.
- Explicit `--execute-approved-draft-only` local launcher: strict HTTPS/private context and the existing draft-only runner. Old `--execute-approved-unpaid` remains unconditionally paused; unknown runtime modes and loopback contexts are rejected by the new live mode. Legacy conversion/queue paths are unchanged. No live mode was run during preparation.

## Execution and evidence sequence per approved case

1. Verify current serving/source/migration/workflow/account/recipient/message-suppression bindings, six OFF flags and both OFF gates. Account/funding facts are prerequisites, not a production barrier.
2. Arm the independent monitor and acquire the never-reused fsynced account/root journal. Claim only the exact new queue scope once. A consumed/unknown acknowledgement stops the cohort.
3. Await terminal native assembly; download only the new allowlisted artifacts and independently compare all PDF bytes. A mismatch stops before the draft request.
4. Await terminal quote-and-explicit-draft stage once. Verify exact product, page counts, tier/service, currency, items, quantities, recipient and file associations. Compare quote product/shipping prices, options/ETAs, parcel count, taxes/fees/discounts where available with the order/dashboard estimate. Missing values are unknown, not zero. Record raw financial state privately and redact evidence.
5. GET only the newly returned root and its approved original-file URLs. Require unconverted draft order/financial/fulfillment state, correct root/item/child mappings, and no payment/production/tracking evidence. Do not follow an unapproved connected root, convert, cancel or search account orders. Record whatever provider file-processing evidence is actually returned; absence is not a payment-block pass.
6. Register only this new scope. Activate only its exact owned timer and observe a genuine successful hosted refresh with execution metadata and persisted claim/result provenance. No-op ticks do not pass. Inspect the exact new order URL in the signed-in admin shell and record meaningful display/failure evidence without customer messaging.
7. On success or failure, close scope/parent first, deactivate all four owned copies (including the timer), and independently verify disabled registration, cleared lease, closed scope/parent, all four owned workflow copies inactive and all controls/gates OFF. Retain journals and settled activation evidence. A primary failure cannot suppress cleanup. Unconfirmed close or timer activation stops later cases.
8. Never replay an uncertain create. Preserve known accepted-root information and prepare a separately approved exact-root read-only reconciliation if needed; no searches, cancellation, new create or historical-order access. Unexpected paid/regular/production/tracking state stops the cohort and triggers owned closure plus a human report; no automatic remediation of provider orders.

## Exact layered budgets

Let N be child/PDF count, T complete observer iterations (1–12), and A actual scoped status claims (1 normally, lifetime maximum 3).

| Layer | Per case bound / expected observation |
|---|---|
| Primary adapter business requests | `70 + 2N + 10T`; minimum 82 singles / 84 siblings; maximum complete 192 / 194; hard cap 200 |
| Primary and monitor cleanup | Normally 21 + 21 calls; independent hard caps 24 each; no provider reads in cleanup |
| Adapter byte caps | 160 MB business per case; 16 MB cleanup per adapter; 32 MB PDF / 2 MB JSON per response |
| Adapter direct PDF reads | `2N`: source bytes once and returned provider-original bytes once |
| Gelato order API requests, including backend | `4 + A`: quote 1, create 1, confirmation GET 1, adapter GET 1, status GET A; max 7 per case / 21 total |
| App-controlled full PDF GETs, including backend | At most `(4 + 2A)N`: max 10 single / 20 sibling, 40 total; successful identical-file responses total at most 144,141,580 bytes across all three when A=3 |
| Backend artifact HEADs | `2N`: 2 single / 4 sibling, 8 total |
| Draft attempts / regular conversion | At most 1 / 0 per case; total 3 / 0; 4 books |

The order/PDF bounds assume the reviewed exact-root fence and existing lifetime-claim/file-count guards. They are not the adapter's direct counter alone. Assembly assets/manifests, backend database/R2 operations, setup/readback, admin rendering and Gelato's own asset fetches are separate; do not claim these transport counters cap them. The setup manifest and final run sheet must identify those permitted scoped actions without inventing an unenforceable universal byte cap. The successful identical-file byte sum is not a hard cap on malformed/oversized responses: the backend verifier separately permits up to 256 MB per file and 512 MB per verification operation before refusal. Source-derived bounds are not measured live receipts. A complete minimum healthy launcher uses 124 calls per single case and 126 for siblings (374 across three), including primary and monitor cleanup; backend-internal work is additional.

The packet has three native quote requests, not nine: all returned options are retained. Additional quote/recovery requests, manual polls, debug calls or reopening authority require review and approval; none are hidden in a generic budget.

## Completion report and remaining limits

Use one requirement matrix: Requirement | Case/workflow | Expected | Observed | Evidence | Status. Use Jeff's statuses exactly. Historical passes stay historical; fresh OFF is a timestamped observation.

The isolated native paths do not establish ordinary hosted intake, W0/W3 personalization/generation, preview/customer approval, ordinary W1 scheduling or continuous unmodified W4 execution. Their local producer/consumer tests are reusable evidence, not hosted passes. Live deterministic failure/backoff and recurring-state transitions remain open unless actually exercised under the approved scope. Do not mark all expanded engineering acceptance complete because these three drafts pass.

Actual provider prepress may be unavailable for held drafts. Missing returned processing results remain Not tested; no regular order is authorized to force progression. All-in final payable price, actual tax/fees/discounts, provider-enforced spending limit and ordinary automatic paid transport remain unresolved. Historical quote estimates are not invoices or a charge guarantee.

Physical proof remains a separate exact approval: proposed website W4 one book plus Amazon W4.1 two siblings (two new orders, three books), privately confirmed address, final reviewed PDFs, product/service/ETA, complete quote/checkout total and maximum spend, and account isolation that cannot release excluded orders. No funding restoration is authorized. Actual charges, production, tracking, shipment, delivery and recipient inspection remain pending. Live cancellation requires separate named approval. Real webhook delivery is optional with polling primary.

## Review and reproduction

See [redacted evidence/reproduction](gelato-draft-approval-evidence-2026-10-22/README.md) and [48-hour plan](gelato-48-hour-acceptance-plan-2026-10-21.md). Final local QA and review receipts are separate from approval. This packet preserves private originals and does not commit/push/publish/deploy itself.
