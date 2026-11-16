# Completed W2A recovery checkpoint review

**CHECKPOINT BLOCKED on CR-02 below.** Reviewed 2026-11-16 in `print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, HEAD/base `f0f1dc9a3d8c19c937c4cc5035ac284872150460`. This is a bounded source/offline review of completed recovery, not release readiness. Application source was changing concurrently; closure applies only to mechanisms explicitly rechecked below.

Scope: `w2a-completed-recovery.ts`, its direct failure/inspection helpers, admin recovery POST and finalization scope producer, ordinary `workflow-2a-complete` handler, canonical manifest/pose worklist producers, and the expanded actual-handler test. Early retry and generation-attempt admission are separate checkpoints.

## CR-01 — Medium, corrected during review: job proof could change during asset inspection

Initial `verifyCompletedW2ARecovery` checked the succeeded-job snapshot before downloading/inspecting publication and issuing asset HEADs. Its final order CAS fenced only the order revision. An independent in-memory harness first demonstrated the stale snapshot with a direct synthetic job change; that alone was insufficient evidence for a broad transaction requirement, and the coordinator appropriately challenged it.

Direct-writer tracing identified the supported contender: configured QA retry reads the active parent in `validateQARejection`, then `claimRejectedW2APoseJob` CASes the succeeded job to claimed without a parent-row predicate. A previously admitted backend request can outlive the n8n failure/timeout and finish that job reservation after failure reporting places the parent on hold. The later parent reread refuses provider generation, but the job reservation has already changed.

The corrected independent harness invoked the **actual** `claimRejectedW2APoseJob` query/patch against intercepted PostgREST during the service's asset inspection. Before the fix, the actual admin POST returned 200, parent `done`, job `claimed`, attempt count 2. No provider was called. This probe used the repository writer; it did not claim to execute a complete concurrent QA HTTP request.

The coordinator added a final fresh job fingerprint comparison and semantic manifest reread after all asset checks. Repeating the actual writer interleaving now returns 400 and leaves the parent `error_requires_manual_review`. The stock handler suite also covers a job change during HEAD. **The demonstrated stale-proof mechanism is closed.**

This is intentionally not a cross-table/storage transaction. There remains a final inspection-to-CAS window for independently mutable jobs/assets. The transition performs no generation or dispatch, clears `next_workflow`, and returns only to pending human review. Naming that limit is proportionate; the row CAS must not be described as atomically locking jobs or storage. A broad locking redesign is not required by this checkpoint.

## CR-02 — High, open: late normal completion can undo recovered completion

The ordinary completion handler requires a physical parent claim only inside `if (orderRow.current_workflow === '2A')`. After successful completed recovery, the row is `done` with null current workflow and its historical failure marked resolved. The ordinary handler therefore skips parent ownership validation and does not treat the resolved record as a hold.

Independent actual-handler reproduction, appended in memory to the intercepted failure-recovery harness:

1. Complete the canonical producer → GET eligibility → admin finalization path successfully.
2. Invoke the actual ordinary `workflow-2a-complete` POST with the same order/manifest and `needsReview: true`.
3. Observe HTTP 200 and parent state changed to `processing`, with `current_workflow: null` and no live owner.

The exported completion-body producer legitimately derives `needsReview` from its manifest snapshot. Thus a delayed earlier callback can regress the recovered state; matching the current row revision at the eventual write does not prove the callback owns that revision.

**Required fix:** mutating ordinary completion must require its original active physical parent claim. An already resolved/recovered or completed idle row should reject the stale callback or return a verified idempotent no-op without rewriting state. Preserve deliberate supported historical compatibility explicitly rather than treating every idle row as permission to complete. Test actual admin finalization → late ordinary callback for both review values and original/stale claim envelopes, asserting the recovered row remains unchanged. Also retain the active-parent mismatch and revision-race negatives.

## Complete-publication proof inspected

- Failure evidence is reverified against the original physical claim, terminal linked executions and newer execution history.
- Required pose numbers come from the selected frozen W0 worklist with pose zero included. Exactly one successful, same-order/book/stage/type job must correspond to each required logical pose key.
- The canonical 2A manifest must match order, book, character hash and frozen W0 pointer; every required entry must be approved, unflagged, not awaiting review and reference its canonical generated image key. Asset HEAD failures hold.
- Current print owners, downstream manifests and approved reviews hold. Finalization uses exact physical row/revision/manual-hold/no-owner predicates, preserves server metadata/failure history and sets `next_workflow`/`next_retry_at` null.
- Partial replay is now visibly unsupported instead of offering full-webhook replay that reruns SW0. No provenance-backed configured partial replay is claimed.

## Evidence and limits

The expanded `test-w2a-failure-recovery.ts` passes in the intercepted in-memory harness. Independent probes are implemented by reading/transpiling that script in memory and adding one bounded interleaving/caller invocation; no application/test source was changed on disk. All remote transports remain intercepted by the actual fixture's synthetic host allowlist. CR-01 was reproduced before the coordinator's repair and refused after it; CR-02 was reproduced against the actual ordinary completion handler.

Tests inspect missing poses, review flags, foreign asset keys, running jobs, unavailable assets, foreign print/downstream ownership, stale revisions, row CAS races, canonical success and repeat finalization refusal. Native persistence, hosted n8n execution, full build/CI, UI rendering, source-evidence rebinding and other readiness-audit slices are outside this review. No secrets/private orders, live services, image generation, provider creation, billing, notifications, order advancement, commits or deployment were used. Only this review artifact was written.

## Closure supplement

**CHECKPOINT CLEAR for completed non-generating recovery.** CR-01 and CR-02 are closed in the current inspected slice. Historical blocked findings above are retained; this is not a full release verdict.

The ordinary completion handler now requires its original active physical parent claim for every mutation. After hold/print/downstream rejection, an already idle `2A-complete` row with the same current manifest pointer returns an idempotent no-op. The actual regression executes canonical admin finalization followed by the actual normal callback for both `needsReview` values and verifies byte-identical row state. The independent handler suite passed again under `env -i` with intercepted transports.

CR-01's final fresh job fingerprint and semantic manifest reread remain present. The independent actual `claimRejectedW2APoseJob`-during-HEAD probe was rerun after that change and returned 400, keeping the parent on manual review. No provider call occurred. The residual nontransactional job/storage window remains explicitly accepted only for this non-generating transition into pending human review; no next workflow, customer approval or printing is granted.

No further concrete blocker was found in this bounded slice. Its current aggregate SHA-256 is `f7b62b8e37b0c03e6875584f5008eb87f9bb467c5a426daef0808ce8137bcbb7`: SHA-256 of compact sorted JSON mapping each path to file-byte SHA-256 for `w2a-completed-recovery.ts`, `w2a-recovery.ts`, `w2a-failure-recovery.ts`, the admin recovery route, ordinary 2A completion route and `test-w2a-failure-recovery.ts` under `back-end`.

Generation-attempt ownership, other readiness slices, final artifact/evidence bindings, native/hosted acceptance, CI/build and deployment remain separately gated. No migration or new partial resume was introduced by this review. Only this receipt was changed.
