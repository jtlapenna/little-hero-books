# Independent repair-plan review

Verdict: **bounded direction is sound; amend the concrete transitions below before implementation.** Configured partial recovery is intentionally unsupported tonight. Keeping that hold is compatible with completing early-failure recovery and a non-generating, guarded all-succeeded finalization path. Neither offline completion nor this review authorizes publication, billing, live advancement or paid acceptance.

Reviewed 2026-11-16 in `print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, HEAD/base `f0f1dc9a3d8c19c937c4cc5035ac284872150460`, with the existing dirty W2A checkpoint. Reviewed `plan.md` through its confirmed-blocker checkpoints. No application source changed. The parent independently supplied the conservative recovery constraints during this review; they agree with the source evidence below.

## Findings and required plan amendments

### PR-01 — High: specify post-pose hold/finalization, including the actual fenced write

**Plan:** `plan.md:19`. **Sources:** `back-end/src/lib/w2a-failure-recovery.ts:94`, `back-end/src/lib/w2a-recovery.ts:762`, `:840`; `back-end/src/lib/w2a-execution-failure.ts:99`; `back-end/src/app/api/webhooks/workflow-2a-complete/route.ts:153`.

The open representation question is material: recording any stopped W2A failure creates a durable unresolved hold, and both `safeToFinalize` and `safeToReplay` currently exclude every held failure. Merely allowing post-pose failures to be reported therefore removes the previous all-succeeded finalization capability. Conversely, removing the hold check alone is insufficient: finalization calls the actual completion endpoint, whose update clears `current_workflow` and `started_at` with only `.eq('id', orderRow.id)`. A new owner acquired between inspection and completion can be erased. Its manifest identity checks do not fence row ownership, job changes or the inspected revision.

**Smallest necessary change:** define observational failure evidence separately from authorization to generate, replay or finalize, reusing the existing failure record rather than adding a competing recovery system. Keep automatic generation on hold for recorded billing/auth failures. Add a narrowly guarded finalization transition for stopped, same-order work with every required job succeeded and a verified complete/current manifest. Revalidate at the actual mutation using the expected physical row, revision and owner fields; reject newer active/print owners and changed jobs/artifacts. Preserve failure history and represent that finalization was recovered without claiming the provider cause was fixed. Completion must leave the book at review, without queueing generation or paid downstream work.

Do not fix only `safeToFinalize` or only the recovery UI. Required test: record failure → inspect → actual finalize/actual completion write; interleave a competing claim before that write and prove the newer owner survives. Also test a partial/missing/mismatched manifest, changed job, already-complete idempotency and print owner. Successful finalization must produce zero provider submissions and zero workflow dispatches.

### PR-02 — High: make QA rejection evidence and atomic ownership explicit

**Plan:** `plan.md:20`. **Sources:** `back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts:418`, `back-end/src/lib/workflow-jobs/repository.ts:322`, `:417`, `back-end/src/lib/books/w2a-pose-input.ts:662`; W2A export nodes `IF: QA Combined Pass?`, `Bump retry counter`, `Retry Builder (Prompt Tweaks)`; actual W2A/W2B build-pose-input routes.

The proposed CAS is necessary, but “previous succeeded stopped generation, next retryAttempt” is not by itself proof that QA rejected that generation. The current build-input path accepts retry counters from input; the existing higher-counter exception skips configured replay checks but terminal jobs still cannot be claimed. A simple succeeded→queued reset would turn a caller counter into permission for additional image work and can expose a gap between reset and claim.

**Amendment:** state how the trusted existing QA branch supplies evidence bound to the exact preceding job/attempt, parent claim and frozen pose identity. Require exactly the next counter, server limit 3, stopped preceding generation, and verified rejection. Atomically compare the prior revision/status/attempt while establishing the next exclusive owner; only that owner may create the accountable attempt and reach the provider. Reset stale output/replay fields for the new attempt while retaining prior attempt history. A retry of the same transition, two contenders, a jump/reused counter, a counter without rejection, changed frozen input and an active prior owner must not buy additional work. If the available persistence API cannot prove this atomic behavior, hold the retry rather than using a general terminal-job reset.

Keep the no-claim/no-replay gate in both actual backend responses and exported consumers before binary download, generation, submission or upload. Replay download failure must not fall back to generation. Test real response→export branch→intercepted provider boundaries; eligibility-helper tests alone cannot prove this contract. Do not add a W2B force/reset policy as part of this repair.

### PR-03 — Medium: name both ordinary W3 queue producers, and fence before storage

**Plan:** `plan.md:22`. **Sources:** `back-end/src/components/stages/post-bria-stage.tsx:791`, `back-end/src/app/orders/[orderId]/page.tsx:948`, both `/api/orders/[orderId]/queue-workflow-3` and `/trigger-book-assembly` routes; `back-end/src/app/api/internal/w3/build-assembly-input/route.ts:104`, `:144`.

The Background Removal button actually calls `queue-workflow-3`; the order-page caller also uses `trigger-book-assembly`. The former unconditionally clears owner fields through `updateOrderStatus`, preserves completed W3 checkpoints and has no readiness/ownership checks. Fixing only the latter leaves the visible route exposed to the same queue→W3-skip failure. The latter can also mutate the 2B manifest during inventory reconciliation before its queue write, so its admission guard must precede storage work.

**Amendment:** explicitly put both ordinary producers under the same exact-row, ownership-fenced transition. A complete idle book gets a successful no-op before storage or queue changes. Busy/print-owned books are rejected; explicit supported reassembly continues to own review/link invalidation. Retain a producer→router-claim→actual-W3-entry regression for each route and assert no stranded processing owner. For final approval, reuse the canonical ownership predicate without invoking an invalidation mutation merely to validate; bind the approved artifact/review snapshot to the fenced row before tokens or notification work. Inspect actual server flags/manifest readiness rather than relying on disabled UI buttons.

This independently confirms the missing plan coverage of the actual queue route. AR-01/02/03 detailed reproductions remain attributed to the separate assembly review/challenge; this plan review does not claim to have executed the n8n router.

### CRP-01 and CRP-02 — Medium, independently confirmed: quote and release normalize differently

**Sources:** `back-end/src/lib/sibling-order-helpers.ts:39`, CSV upload handler use at `:552`; `back-end/src/lib/books/gelato-submission.ts:58`, `:84`; `back-end/src/lib/books/gelato-ordinary-release-core.ts:156`; `back-end/src/lib/books/gelato-release-review.ts:32`; server/service composition files.

Fresh source inspection and offline reproduction confirm both candidates. The CSV row producer leaves shipping tier absent and permits null customer email. Quote construction resolves the tier to `standard` and accepts the server merchant-contact fallback. The ordinary release core compares raw `row.shipping_tier` against saved `standard`; its review consumer calls `gelatoRecipientFromOrder(row)` without the quote's fallback. An unchanged order can therefore be quoted but held at release as `release_current_route_or_authority_changed` or `recipient_changed`. The observed consequence is a false release block, not an unauthorized print.

**Required change:** share the existing tier-resolution policy across quote/release validation. Pass the trusted server merchant-contact policy through ordinary-release server→service→core→review composition. Never infer a missing trusted contact from the saved request itself or accept it from an HTTP body; that would weaken current-recipient validation. Continue comparing the fully resolved current recipient with the saved recipient and retain all account/request/artifact/price bindings. The existing quote normalizes case/whitespace as well as missing values; test that same supported normalization, with explicit non-default tier changes still denied.

The plan's “if confirmed” can now become a concrete bounded repair. Acceptance: actual CSV producer absence/null → quote → review/release preparation passes with the configured fallback; missing/invalid trusted fallback remains held, and changing recipient/contact/tier remains held. No provider mutation is needed to demonstrate this.

## Minimal recovery matrix

| Verified state | Allowed preparation | Must remain unavailable |
|---|---|---|
| Stopped early failure; acknowledged cause; zero pose jobs; no base; absent or exact empty frozen bootstrap; current new physical claim | Ordinary early retry with narrowly authorized conditional-create/exact-bootstrap reuse | Replacing a mismatched/nonempty bootstrap or regenerating an existing base |
| Same early failure, but base exists, absence lookup fails, state/claim changed or equality is unproved | Inspect and explain hold | Retry/generation under optimistic absence |
| Post-pose stopped failure; all required jobs succeeded; complete identity-bound current manifest | Guarded non-generating finalization into review, preserving failure history | Clearing another owner, implicit replay or downstream dispatch |
| Partial configured run, including some succeeded jobs | Report/hold accurately with reason | Configured partial replay without generation provenance receipts |
| Legacy jobs | Preserve their existing supported replay/finalization contracts and truthful inspection | Claiming legacy partial restart works merely because generic metadata says replayable |

Legacy partial canonical replay already encounters the existing bootstrap barrier. Do not describe it as fully functioning baseline behavior or add an unverified bypass tonight. Keeping that limitation visible is acceptable. A future provenance-backed partial resume is deferred, not a blocker to the bounded early-failure fix.

Bootstrap reuse is a sound narrow design if rechecked at the actual bootstrap entry, not only when the operator queues. Compare canonical manifest content excluding only the known bootstrap clock fields (`runStamp`, `generatedAt`), retain all frozen/order/path fields, and leave the original object unchanged. Bind reuse permission to the acknowledged failure and new physical claim so generic duplicate requests cannot acquire it. Canonical base keys are book/character-hash scoped (`order-paths.ts:183`), so check the actual frozen-derived key and treat errors/unknown presence as held. Concurrent claims, newly appearing pose jobs/base and changed bootstrap/W0 must fail closed. No generic overwrite, delete or “ignore 409” branch is needed.

## Other planned changes and alignment

The intake/identity checkpoint is appropriately scoped: exact/word age labels, documented dedication labels in both orders, age 0–7 validation, actual CSV/ZIP regressions and unchanged nested-format controls; W1 must search the entire prep set for matching physical/per-book identity before considering an unambiguous legacy root fallback. Conflict tests must cover both ID disagreement and reversed/mixed successful sibling responses. No new routing abstraction is needed.

The nearest canonical owners are the existing W2A failure/recovery and manifest entry, workflow-job claim repository, book-review ownership/CAS boundary, CSV customization parser/W1 verifier, and Gelato recipient/quote/release composition. Extend these owners. Do not introduce a parallel recovery framework, discard succeeded jobs, remove configured receipt holds, or add unrequested paid paths. Maintainability disposition: fix these direct producer/consumer mismatches now; defer broader recovery redesign.

## Checks, dispositions and limits

Personally inspected the plan, candidate/challenge reports and direct sources listed above. Read workspace/repository instructions and finding-verification protocol; verified branch, HEAD, worktree registration and existing changes. This is the fresh challenge of CRP-01/02 and the concrete repair plan, not verification of my own authored discovery report.

Passed under `env -i`, installed Node/tsx, the existing deny-network preload and macOS `(deny network*)` sandbox:

1. Reran `output/workflow-readiness-audit-20261116/challenge-reviews-print/print-defaults-probe.ts`: actual CSV row producer → actual quote producer → release core; both mismatches reproduced, zero provider mutations/live requests.
2. Independently constructed additional controls using the real ordinary-release fixture/core: both null and undefined tiers held; restoring the original tier passed preparation; missing customer email matched the saved recipient when resolved with the canonical fallback but release still rejected it; explicitly changed customer email remained rejected. Zero provider mutations. The fixture's initial successful preparation is a positive control for the other authority/artifact/account guards.

One initial inline probe failed before executing assertions because tsx's CommonJS interop exposed exports through `default`; corrected module unwrapping passed. This environmental failure is not counterevidence.

Disposition: PR-01/02/03 are confirmed necessary plan amendments grounded in direct consumers; CRP-01/02 confirmed; speculative removal of configured replay hold rejected; a claim that legacy partial replay is already universally supported rejected. Actual post-fix races/DB CAS, exported n8n execution, UI rendering, full CI/build/compiled-worker verification and the required source-evidence successor remain implementation acceptance work. No live services, browser, secrets/environment files, private order records, provider generation, notifications, commits, pushes or publication were used. No failed reviewer assignment or nested delegation occurred.

Priorities: settle the recovery matrix and fenced finalization first; implement claim gate plus verified bounded QA ownership together; include both W3 queue routes; apply shared Gelato normalization/contact policy and intake identity repairs in coherent checkpoints. After each checkpoint, rerun the corresponding actual-handler/export tests and fresh review. Final required CI/build/rendered-state/release-safety checks are still necessary; production publication is explicitly excluded overnight.
