# W4 Gelato adversarial review

Date: 2026-10-11. Verdict: NOT READY for release. Product count and US shipping selection are resolved for quoting. Existing local intake, routing, ownership, retry, and archive defects require fixes before dispatch can be enabled.

Scope: all tracked changes and relevant new Gelato files in `/Users/jeff/Projects/little-hero-books-w4-gelato`, branch `codex/w4-gelato-copies`, base `46c1f81f00f70de5ec04766bcf406de9735d40dd`. Source summaries and prior checkpoint results were treated as claims. Three independent discovery reviewers covered routing/intake, SQL/lifecycle, and PDF/API contracts. Two independent skeptics challenged the candidates. The coordinator checked material findings against source. No review agent changed repository files or called Gelato.

Parent's separate product investigation added quote evidence, verified count 32, explicit US shipment UIDs, country validation, and related tests while discovery ran. W0/W1.1, SQL, and W4 identity/page sources remained unchanged. Skeptic verification covered current source and the same-country quote-reuse trigger after country validation was added. The final receipt hashes the complete resulting tree.

An additional reviewer allocation hit the session's agent thread limit. The independent routing skeptic also verified the PDF/API candidate batch and resolver evidence. No planned review slice remained unassigned.

## High findings

### R1. Existing orders reject ordinary repeated Amazon intake

`back-end/src/lib/books/print-assignment.ts:15` compares every persisted print field against the incoming payload, including omitted fields. Its new caller in `back-end/src/lib/supabase-client.ts:408` is shared by `/api/amazon/orders`, whose normal update payload has no print fields. Offline probes of the actual upsert path showed both Lulu and Gelato rows rejected before PATCH with `Frozen print assignment mismatch: print_provider`.

Fix: compare fields explicitly supplied by the writer. Preserve persisted fields on partial updates; continue rejecting explicit changes or clearing of frozen values. Add an intake-to-shared-upsert regression for repeated Lulu and Gelato orders.

### R2. W0 loses the requested book, config version, and format

`docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json:128` reconstructs normalized `bookSpecs` without selection fields and drops top-level selection. Preparation at line 245 reads only that normalized object. Executing the actual Normalize, Dedication, and Prepare chain with Inner Voice v2/amazon selected produced MVP v1/standard. Existing tests bypass the failing upstream node.

Fix: preserve and validate selection through the full producer chain, including conflict checks. Test the actual node sequence through the backend parser and selected config.

### R3. A later routing failure strands earlier successful claims

The W1.1 `Claim and Route Gelato Groups` node in `docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json:746` saves output until the complete loop returns. If an earlier group commits its claim and a later group returns 409 or an invalid result, the node throws and none of its outputs reaches dispatch or the fence branch. An actual node replay reproduced a committed claim with no dispatch. Valid Lulu outputs are also discarded.

Fix: isolate per-group failures and preserve successful outputs. Fence a claimed group if its result cannot safely be dispatched. Test mixed valid/invalid groups and response-validation failures, not only a single group's dispatch failure.

### S1. Changed W0 export retains credential literals despite the scan passing

The W0 `CONFIG (PRODUCTION)` code contains literal credential fields for `supabase.serviceKey`, `r2.apiToken`, and S3 access keys. These literals existed on base. `npm run check:workflow-export-secrets` passed for all four changed exports, so its current syntax/key coverage misses this form. Credential activity was not tested. Values are excluded from this report and quote evidence.

Fix: replace credential literals in the changed export with environment/credential references. Add sanitized scanner regressions for the actual JavaScript property syntax and field names. Rotate exposed credentials through the authorized owner before release. Unrelated legacy exports also contain credential fields; their cleanup is a separate follow-up.

## Medium findings

### P1. Gelato W4 accepts a different order's frozen W0 manifest

`back-end/src/lib/books/w4-print-input.ts:1355` normalizes the loaded W0 object without matching its original identity to the requested order. Normalization substitutes the loaded key. Later ownership checks at line 1483 compare the persisted requested row and print settings. Offline probes served valid order B W0 at order A's canonical key; `buildW4PrintInput` and `assertW4GelatoPrintInput` accepted A.

Fix: match original W0 and W3 order/book/config identities and artifact paths to the persisted order before normalization or use. Test misfiled and conflicting manifests through the actual adapters and assembly route.

### P2. Correct page count can hide a wrong frozen page set

`back-end/src/lib/books/w4-print-input.ts:892` prefers W3 labels and line 910 filters the frozen W0 plan to those labels. `w4-gelato-print-input.ts:18` checks count without exact membership. A probe replaced required `p31` with `p99`; the accepted result had 32 raster labels, 31 plan entries, and the `p99` raster path.

Fix: require exact ordered labels and plan equality with frozen W0 for Gelato, plus canonical raster paths for every required page. Reject missing and unexpected pages before PDF assembly.

### D1. Gelato claim omits processing timestamp and conflicts with generic recovery

Both claim paths at `database/migration-print-provider-fields.sql:212` and line 225 set `processing` without `started_at`. Approval and print-queue producers clear that timestamp. The local orphan RPC treats this as `processing_no_timestamp`; generic W1.5 reset writes by order ID without revoking Gelato ownership. Disposable SQL probes confirmed a NULL timestamp and a reset that changed the order while its submission stayed claimed/submitting.

Fix: stamp processing time on initial claim and retry. Exclude owned Gelato rows from generic recovery until provider-specific fencing and recovery exists. Duplicate provider creation was not established; the confirmed consequence is incorrect recovery/status and stranded work.

### D2. Claim and fence use conflicting lock order

Claim locks orders before submission (`migration-print-provider-fields.sql:164`, line 198). Fence locks submission before orders (line 275, line 282), without the root advisory lock. Disposable two-session probes produced `deadlock detected`; fence can be the aborted transaction. The endpoint returns 409 and its current workflow caller does not retry.

Fix: use a consistent root/advisory and row-lock sequence for all mutations. Cover claim-versus-fence concurrency; current tests cover claim-versus-claim. Duplicate sends were not established.

### D3 / P3. Quote selection is not bound to the complete request or claim generation

`back-end/src/lib/books/gelato-api-contract.ts:212` returns quote/method/policy/time only. Draft construction accepts independently supplied order, customer, items, quantity, file URL, currency, and US address. Current-source offline probes reused a quote with these fields changed. SQL stores item references only. Fence/reclaim rotates ownership without clearing the quote (`migration-print-provider-fields.sql:210`, line 287). A disposable probe changed destination, reclaimed, then began/authorized using the old quote.

Fix: bind a validated quote to its complete canonical request and persist its fingerprint and claim generation. Recheck before building/sending draft. Clear quote fields on retry and require a new quote whenever bound inputs change. No automated quote/create route exists yet, so this is a current contract defect, not evidence of a live incorrect order.

### D4. Protected D2C deletion reports archive success without deleting

The new Gelato membership trigger rejects unresolved deletion (`migration-print-provider-fields.sql:365`). `back-end/src/lib/order-lifecycle.ts:340` checks `error && deleteError`; for a D2C row without Amazon ID, `deleteError` stays NULL. A failed second deletion therefore skips rollback and exception after inserting the archive copy. An actual helper mock reproduced reported success with both active and archived records.

Fix: handle every failed deletion and roll back the archive insert, preferably transactionally. Test the existing manual archive endpoint against the new deletion guard.

### R4. Frozen manifest can be overwritten before conflicting assignment is rejected

The internal W0 builder (`back-end/src/app/api/internal/w0/build-manifest/route.ts:52`) does not load persisted assignment before returning a same-key manifest. W0 uploads before upsert. In-memory replay showed an Inner Voice v1/Lulu object replaced by v2/Gelato at the same key before the new upsert guard rejected the row change.

Fix: check persisted assignment and existing manifest before upload, and reuse the frozen object on compatible retries. This guard gap is confirmed. Ordinary webhook reachability is qualified because R2 currently drops Inner Voice selection; correcting R2 exposes the path. No live R2 order manifest was overwritten during review.

## Confirmed, rejected, and unresolved claims

- Confirmed: R1, R2, R3, P1, P2, D1, D2, D3/P3, D4, S1. R4's missing pre-upload freeze guard is confirmed; ordinary webhook reachability depends on fixing R2.
- Rejected interpretations: generic documentation does not justify changing this SKU's API count to 35; the live product probe rejected 35. Quote acceptance does not prove PDF processing. D1/D2 probes do not establish duplicate Gelato sends. P3's original cross-country trigger is blocked by the new country guard; same-country drift still reproduces it.
- Unresolved: actual deployed orphan RPC/W1.5 versions, credential validity, provider PDF processing, real-book raster compatibility, Cloudflare memory use, and production integration/build evidence. No reviewed claim depends on asserting these passed.

## Checks and coverage

Observed passing: Gelato API contract, print routing, print PDF, workflow-copy isolation, W1.1 claim routing, book config integrity, SQL migration/submission/concurrency tests, scanner unit tests, changed-export scan, and `git diff --check`. The scan's passing result does not override S1. Targeted TypeScript output had no diagnostics for changed resolver files; full TypeScript previously failed on repository diagnostics and was not treated as green.

Discovery and skeptic probes exercised the actual W0 node chain, shared upsert, W1.1 group loop, W4 manifest/page adapters, quote/draft builders, archive helper, and disposable PostgreSQL state/lock paths with synthetic data. The country/UID resolution tests replay sanitized live single-item and sibling quotes from both states through the bundled config and all three tiers.

Alignment remains with the approved outcome: separate Gelato copies and provider settings, retaining existing Lulu fulfillment. Canonical owners are book config/manifest, persisted order assignment, submission membership, and provider state. The defects occur at their direct boundaries; fixing them does not require a new parallel fulfillment architecture.

Not exercised: live workflow import/activation, production migration/backfill, config publication, deployment, draft/paid order creation, provider processing of finished-book PDFs, all-edition real asset proofs, webhook authenticity/status/cancellation, notification delivery, complete recovery, and `npm run pages:build`. No UI changes were made in this resolution; rendered operator workflows remain acceptance work when added.

## Remaining implementation and next order

1. Fix R1-R3 and S1 before shared intake/router exports can ship.
2. Fix canonical identity/page checks and pre-upload freezing (P1/P2/R4).
3. Fix claim timestamps, recovery boundaries, lock ordering, and archive failure handling (D1/D2/D4).
4. Bind quote inputs and retry generation (D3/P3), then connect quote and explicit draft routes, atomic provider-order/item persistence, and safe recovery.
5. Finish provider status/tracking/cancellation, notifications, operator actions, rollout checks, representative PDF processing proof, and final release review.

Both Gelato workflow copies remain inactive and assembly-only. Their dispatch gate remains closed by default. The review does not authorize release actions or production orders.
