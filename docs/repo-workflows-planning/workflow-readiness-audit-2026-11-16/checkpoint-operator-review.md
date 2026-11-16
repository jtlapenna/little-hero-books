# Operator transition checkpoint review

## Supplemental force-control hold-consumer recheck

The later focused hold-consumer check passes. The regenerate-2a, regenerate-2b and regenerate-4 route diffs each add only the `heldW2AFailure` import and early 409 refusal after loading the active order, before the normal force storage/queue mutations. Their non-held legacy force policies were not otherwise changed. Matching order-detail controls are disabled for W2A error types; regenerate-3 already uses the shared raw/mapped ownership helper, whose current line 14 explicitly refuses durable W2A failure holds.

Reran `test-w2a-failure-recovery.ts` with the same empty-environment/OS-network-denied command: passed the actual three new force-handler refusal cases with no extra writes. Supplemental temporary `output/workflow-readiness-audit-20261116/assembly-review/w2a-force-hold-probe.ts` adds regenerate-3 to that same actual-handler loop and also passes: all four force routes return 409 and preserve the durable hold. A preliminary concern about regenerate-3 was based on the earlier helper slice; rereading the current task-worktree source and the actual probe rejected that suspicion. No finding is recorded.

Recovery inspection GET now uses an AbortController with a 25-second deadline, clears that timer in `finally`, and marks failed/timed-out data unverified before enabling further actions. The revised guidance accurately says that partial runs remain held until verified resume is available. These are source/handler checks only; no additional browser, live operations, secrets or source edits were used by this reviewer. Checkout/branch reconfirmed as `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`, `codex/w2a-error-reporting-recovery`.

## Follow-up disposition after AR-04–AR-06 repair

The later narrow implementation review accepts **AR-04, AR-05 and AR-06 as repaired in the reviewed local checkpoint**. The original findings and hashes below are historical checkpoint evidence, not descriptions of the final source. No new blocking finding was established in this bounded follow-up.

- AR-04: final approval now checks authoritative persisted metadata through `customerPreviewHasReviewFlags`; the canonical preview readiness consumer also refuses those flags. The flag producer saves its canonical review hold before writing R2, and the actual flag producer → failed flag-count mirror → final-approval test remains held. Wrapper selection is shared with the preview parser rather than independently guessing manifest shape.
- AR-05: Send for Customer Approval now requires exactly approved postPdf; an invalidated in-review stage is rejected before mutation/token creation. Stage approval remains an explicit separate transition.
- AR-06: stage approval now loads the exact physical order, rejects active/print ownership, performs its status/queue update under the shared CAS, and treats an already approved duplicate as a no-op. The actual first approval still queues W3; a later duplicate does not rewrite it. Missing/unreadable stage manifests no longer degrade into a successful approval.

Checks rerun: current `test-book-operator-transitions.ts` passes all its handler positive/negative cases, including the new AR-04–AR-06 regressions. Additional independent narrow probe `output/workflow-readiness-audit-20261116/assembly-review/operator-final-checkpoint-probe.ts` also passes:

1. Null `updated_at`/`has_flags` legacy row: actual initial postBria approval succeeds and queues W3 using null-aware CAS.
2. Stage approval racing a W3 claim between row load and PATCH: actual approval route returns 409, performs zero writes and preserves the W3 owner.
3. Manifest-only `needsReview` flag in all four supported object/array/nested wrapper forms: pure flag detector, canonical preview readiness and actual final-approval handler all refuse; zero approval writes/tokens.

Probe output: `{"review":"AR04-06-followup","approvedStageCasRaceRefused":true,"nullLegacyRevisionPositive":true,"manifestFlagWrappersRefused":4,"externalRequests":0}`. Same empty-environment/OS-network-denied command form described below; source remains untouched by the reviewer. UI rendering, CI/source packaging, hosted deployment and physical/paid acceptance remain separate coordinator gates. The earlier speculative storage-sync race and intentionally deferred adjacent regeneration policy were not broadened into new findings.

Follow-up source SHA-256: final-approval route `4f0c2814e00a1c5fdaecf97bcc92b6b10bb32d7914a87b73958c8914429031c5`; approval-store `935fea9a0f8939786bf668a2e38090a4cd1d8f01a81e04e0af24faab44f56873`; customer-preview-files `2c95a8daa17a588c0b709cc196bb363769a5c78e0cd45b953eb3e844c2c1a17b`; flag route `a742443abe56670fa16941e0ff4c02ab2217c0a191fdb0396203386b87a01913`; approve route `242cd82e759ae061e33487c71733cdd7c67b337efd36547456820a625b34acbd`.

---

Reviewed 2026-11-16 approximately 07:50 UTC against the active uncommitted checkpoint on `codex/w2a-error-reporting-recovery`, baseline `f0f1dc9a3d8c19c937c4cc5035ac284872150460`. Read-only source review and network-denied synthetic probes only. No source edits, browser, external requests, paid/provider/image-generation operations, customer notifications, commits or pushes. This review challenges the implementation of AR-01–AR-03; it is not a second independent challenge of those original candidate claims.

**Verdict: changes close the directly tested AR-01–AR-03 entrypoints, but three concrete gaps remain in the final-approval/automatic-queue producer boundary.** Findings below need coordinator reconciliation and fresh challenge before final acceptance.

## Checks passed

- Actual `test-book-operator-transitions.ts`: active W3 and print-owned rows are refused by regenerate-3, both ordinary assembly queue routes and final approval with zero writes/token creation; completed ordinary queue is a no-op; fresh reviewed preassembly queue succeeds; changed row revision refuses CAS; incomplete preview and row-based flags refuse final approval; valid final preview creation succeeds.
- `test-book-review-invalidation.ts`: 33 checks, including actual reset/review caller.
- `test-book-reassembly.ts`: nine producer/completion/review/reassembly checks.
- `test-preview-book-contract.ts`: 90 real token-route readiness/read-only checks.

Commands ran from `back-end` using `env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*)' /opt/homebrew/bin/node --import tsx ...`. Existing scripts use intercepted transports. A first attempt to create the supplemental probe used a wrong relative cwd and failed before it created a file or ran a test; corrected invocation passed.

Supplemental probe: `output/workflow-readiness-audit-20261116/assembly-review/operator-checkpoint-probe.ts`, derived from the new handler test with imports redirected to the real backend sources, adds the three counterexamples below. Its assertions deliberately record the observed unsafe 200 responses; a green exit does not mean these behaviors are safe.

## AR-04 — final approval ignores persisted manifest flags when database counts are stale

- **Suggested severity:** P2; actual handler failure reproduced, producer reachability source-grounded. New checkpoint gap, not a hypothetical corrupted fixture.
- **Source:** `back-end/src/app/api/orders/[orderId]/final-approval/route.ts:154` checks only `orderRecord.flags`/`has_flags`; `:166` calls `buildCustomerPreviewFiles`, which never inspects `pngGeneration.pagesMetadata`. Canonical flag writer: `back-end/src/app/api/orders/[orderId]/flag/route.ts:167` writes `isFlagged:true, needsReview:true` into manifest metadata, persists R2 at `:176`, and intentionally does not fail on later database flag-count errors at `:189`. `back-end/src/lib/review-state.ts:136` explicitly swallows DB update errors and identifies the manifest as the source of truth.
- **Trigger:** page flag persisted in R2, database flag-count update temporarily failed, leaving row flag counts zero. A later final-approval request sees the complete flagged manifest and stale zero row flags.
- **Expected:** reject the flagged current preview before CAS/token creation, consulting its persisted metadata as well as row counts.
- **Observed:** complete valid manifest with `pngGeneration.pagesMetadata.p00 = {isFlagged:true,needsReview:true}` and zero row counts returns 200 and creates a preview token. Supplemental result: `{"candidate":"AR-04","manifestFlagged":true,"databaseFlagCount":0,"actualFinalApprovalStatus":200,"tokenCreated":true}`.
- **Consequence:** a flagged page can be promoted to customer approval. This also weakens the intended explicit Approve Stage gate, which already reads manifest metadata to reject flags.
- **Smallest repair:** inspect authoritative metadata flags from the same downloaded/identity-checked manifest before approval CAS. Add an actual handler regression with only manifest flags, preserving the valid unflagged preview positive test.
- **Counterevidence:** row flag counts and `has_flags:true` are correctly rejected, and CAS catches concurrent row revision changes. Neither counters this existing producer's intentional manifest-first/nonfatal-count failure behavior.

## AR-05 — sending for customer approval still promotes an invalidated stage without its explicit review

- **Suggested severity:** P2; directly reproduced, stale admin tab/edit scenario source-grounded.
- **Source:** final approval `route.ts:158` explicitly permits postPdf `in-review` and `ready`, then overwrites it as approved at `:184` (line varies slightly as coordinator edits). Canonical `bookReviewInvalidation` writes `postPdf:{status:'in-review'}` after a page edit/regenerate hold and leaves the previous complete manifest checkpoint until the caller writes/queues. The UI presents a distinct Approve Stage action before Send for Customer Approval (`post-pdf-stage.tsx` around `:2831` onward).
- **Trigger:** an admin tab still shows Stage Approved while another action has invalidated the page review after a replacement/regeneration request. Its stale Send request reaches the new server gate with a complete idle row whose postPdf status is `in-review` and customer state `not_requested`.
- **Expected:** require current postPdf approval, refusing the invalidated stage. The subsequent explicit stage approval should be what returns the new artifact to customer-preview eligibility.
- **Observed:** actual final-approval handler returns 200, changes `in-review` → `approved`, and creates the token. Supplemental result: `{"candidate":"AR-05","postPdfBefore":"in-review","actualFinalApprovalStatus":200,"postPdfAfter":"approved","tokenCreated":true}`.
- **Consequence:** CAS protects against *later* row changes but the handler willingly approves the already-invalidated snapshot it just loaded. It can also reopen customer approval during regenerate-3's interval after invalidation/reload and before its final queue fence.
- **Smallest repair:** require exactly approved postPdf for this Send action. Keep final approval as the customer-preview transition rather than an alternate implicit stage approval; add an actual handler rejection for in-review/ready and positive approved state.
- **Counterevidence:** UI button visibility usually requires `isApproved`, but stale tabs are precisely the reason server readiness must be checked. Active-owner rejection is correct but an invalidation hold is idle and has no workflow owner yet.

## AR-06 — automatic queue-on-stage-approval bypasses the new guarded queue transitions

- **Suggested severity:** P2; actual handler reproduced and concrete UI race.
- **Source:** `back-end/src/app/api/orders/[orderId]/approve/route.ts` calls `approveStage`; `back-end/src/lib/approval-store.ts:101` constructs unconditional `execution_status:'ready_for_processing',current_workflow:null,started_at:null` for an approved preBria/postBria transition, and `:125` selects next stage 3 for postBria. This producer does not call the new ownership assertion, completion no-op or CAS helper. The user-facing Approve Stage action is the canonical automatic queue producer, not an alternate undocumented endpoint.
- **Trigger:** two admin tabs initially display an unapproved Background Removal stage. First tab approves and W1 claims W3. A stale second tab submits the same postBria `status:'approved'` request after ownership is established. This is also possible from an ordinary duplicate request.
- **Expected:** reject/return idempotently without clearing a current workflow or requeueing an already completed W3. Use the same ownership/revision policy as both new ordinary queue handlers.
- **Observed:** actual `/orders/[id]/approve` with postBria approved against active W3 returns 200, sets `current_workflow:null`, and sets next workflow 3. Supplemental result: `{"candidate":"AR-06","action":"stage-approval-postBria","actualStatus":200,"activeW3OwnerCleared":true,"nextWorkflow":"3"}`.
- **Consequence:** the new trigger/queue route guards are bypassed by the normal approval producer, so an active assembly can still lose ownership and be dispatched again. The same producer can also queue a completed assembly without clearing the replay checkpoint.
- **Smallest repair:** integrate shared ownership/completion/CAS rules into approval-store's actual stage approval transition, preserving the W2 completion compatibility cases already proved by `test-book-reassembly`. Add actual handler duplicate/stale approval tests and real positive first approval → queue tests. Consider the sibling preBria automatic W2B producer under the same concrete ownership rule; do not just patch the postBria visible button.
- **Counterevidence:** the new ordinary queue helpers work correctly, but `approveStage` still writes its own queue patch and never reaches them. This is distinct from intentionally deferred adjacent regenerate-2a/regenerate-2b policy.

## Other inspection conclusions and limits

- Factored pure ownership helper preserves the prior W2 completed-for-review exception and separates trusted internal own-stage publishing from manual edits. UI mapped properties (`currentWorkflow`, `startedAt`, provider fields) are handled alongside raw row keys. Canonical invalidation and new queue CAS use null-aware filters.
- Regenerate-3 now guards before storage mutation, invalidates reviews/links, reloads ownership, and fences the eventual queue write. Its `.eq(updated_at)` uses the timestamp just written by invalidation, so the apparent legacy null-timestamp concern is not a reachable blocker in the successful invalidation path.
- Ordinary completed queue admission and W3 replay share a helper, avoiding the previously demonstrated completed queue/skip mismatch. There is a minor normalization difference from the former W3 local predicate (workflow/status strings no longer trim), but no canonical producer of whitespace-padded enum states was found, so it is not reported as a blocker.
- Trigger-book-assembly still does its best-effort 2B manifest inventory sync before the final queue CAS. A concurrent stage claim during that sync could cause storage-side work before a rejected queue CAS; this review did not reproduce a concrete wrong manifest mutation and does not elevate that possibility to a finding.
- Adjacent regenerate-2a/regenerate-2b still have unconditional ownership clears. Their source pattern is visible, but this checkpoint's decisive bypass is the ordinary `approveStage` producer (AR-06). No broad recovery redesign or unrelated audit expansion is requested here.
- No full browser rendering, exact hosted config/state, paid generation, external PDFMonkey rendering, printer behavior, CI/source packaging or PDF certification was exercised. Those remain the coordinator's stated pending gates.

## Snapshot hashes

These bind the reviewed checkpoint and probe results; recheck changed files after the coordinator's repairs.

| File | SHA-256 |
| --- | --- |
| final-approval/route.ts | `f98dc7948e91b8082d71e7ed427e75f077d5ace1f81879eea193d0ee2235f66d` |
| book-assembly-queue.ts | `c76dd29976a503cf948c8dd05c11ec6274145ee4c76b26aa851fb3a94869e886` |
| book-review-invalidation.ts | `4191495834e766c8cc325980bca24da45abdaf54bcd672f1759feccb3141bdce` |
| approval-store.ts | `1a497f78a848fdf6735e0d0f0efc8b537296de353509690b515b33ffc06ed692` |
