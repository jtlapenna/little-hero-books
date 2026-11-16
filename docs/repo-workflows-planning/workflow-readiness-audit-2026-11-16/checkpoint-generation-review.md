# Generation ownership checkpoint review

CLEAR for the reviewed source snapshot. Two callback/claim defects discovered during this review were corrected by the implementation owner and independently rechecked. No remaining actionable finding was established in the assigned ownership checkpoint. This does not clear post-pose finalization, CI/bindings, UI, deployment or paid execution.

Reviewed 2026-11-16 in `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, HEAD `f0f1dc9a3d8c19c937c4cc5035ac284872150460` plus dirty implementation. Reviewer changed only this document and synthetic audit output, not implementation. Snapshot hashes: `output/workflow-readiness-audit-20261116/generation-ownership-review-source-sha256.json`.

## Findings resolved during the checkpoint

**GEN-C1: a terminal job-only callback could contradict its ended attempt.** Initially, `log-event/route.ts` checked ended-at conflict only against optional `attemptStatus`. An authenticated event with the current succeeded attempt ID, `jobStatus:'failed'` and no `attemptStatus` returned `historyOnly:false`, downgraded the job, and left its attempt succeeded. Demonstrated using the actual POST handler and existing synthetic repository transport. The implementation now compares requested job status as well as attempt status against an ended attempt. The actual transport regression now returns history-only and preserves succeeded state. This API gap was verified; no deployed producer emitting that exact missing-status shape was claimed.

**GEN-C2: normal lease reclaim initially reserved callback ownership too late.** `claimWorkflowJob` initially changed the lease before the caller's separate attempt-count increment. Injecting an old-attempt successful callback immediately after the claim PATCH cleared the new lease; startup subsequently returned `workflowClaimed:true`, attempt 2/running, with `lease_owner:null`. This is a concrete reclaim race involving the real repository/POST transport, not a hypothetical provider failure.

The implementation now passes `reserveAttemptCount:true` from both W2A/W2B generation starters. `repository.ts:322` reserves the next count in the same `updated_at` CAS as the new lease. Both callers use that reserved number, require persisted attempt creation, and require fenced `markWorkflowJobRunning` success. Independent rerun injects the same old completion at the same point: it becomes history-only, the new lease survives, attempt 2 is running, and an immediate competing start returns false without creating attempt 3. Probe: `generation-ownership-challenge.cjs`; output: adjacent `.log`.

## Ownership and retry checks

Source inspected: W2A base/pose request handlers; W2B pose request handler; worklist parent propagation; `w2a-parent-claim.ts`; W2A/W2B job identity/start paths; repository claim/QA CAS and state patches; types; authenticated log-event handler; actual W2A SW1, W2B single-pose, top-level Capture/worklist/QA handoff and final SW2 return exports.

Backend pose builders now reject refused claims before successful provider-ready responses. W2A permits verified replay as a separate outcome; W2B requires a claimed persisted attempt. The actual SW1 schema node and W2B payload builder additionally stop absent/false ownership; replay-download failure now throws before regeneration. Independent VM execution of actual export code exercises missing/false ownership, W2B true-without-attempt rejection, valid owned controls and replay-fallback failure. Graph inspection confirms these nodes precede Gemini/Bria submission. No provider request was made; this proves local control-flow denial, not hosted runtime acceptance.

QA retry validation binds the exact preceding job, attempt number/ID, successful ended generation, output identity, previous retry ordinal, current physical parent claim and unchanged frozen generation fields. Its server-read parent check and status/revision/count CAS reject held parents and duplicate retry ownership. The actual QA Handoff code produces the proof accepted by the real repository starter; accepted retry creates attempt 2 and subsequent reuse of the old proof fails. Existing transport cases reject missing proof, excessive retry, changed character identity, missing attempt, wrong artifact and explicit nonexistent job. Configured ordinary succeeded replay still throws before the artifact-existence callback. The configured provenance hold remains intact; partial resume is intentionally deferred.

Additional pure source controls verify an active parent/frozen selection succeeds and twelve changed physical/per-book ID, execution state/stage/start time, downstream claim/artifact, book/format/version/hash/manifest cases fail. Handler inspection confirms the base route enforces active parent plus frozen selection, and the pose POST checks them before claim/start and rechecks active parent before returning. These controls do not claim a distributed atomic transaction with a later provider request.

Actual graph propagation was checked beyond the hand-authored proof fixture: Capture builds the physical parent claim, Start preserves it through context, and Prepare Resolve Pose Worklist Body emits it. The backend worklist attaches it to each work item. SW0/SW1 return nodes preserve other fields; Expand merges work item fields; the SW2 return's added assignments read parent/job/attempt/frozen fields from the actual execute-workflow input. Executing those assignments verifies the exact values survive a QA return whose ordinary JSON has been narrowed. The full native SW2/provider chain was not run.

## Checks actually run

All runtime checks used `env -i PATH=/opt/homebrew/bin:/usr/bin:/bin`, installed Node 22.23.4/local tsx and `generation-removal/deny-network.cjs`; no dotenv loading. The attempt test installs a closed synthetic fetch transport, rejecting every nonfixture host. Other HTTP/TCP transports remain denied.

- Updated `scripts/test-workflow-attempt-fencing.ts`: passed actual authenticated POST/repository transport, QA producer/retry consumer, concurrent QA CAS winner, stale/missing attempts, job-only terminal conflict and job attempt-count race.
- `scripts/test-workflow-event-ownership.ts`: passed explicit job/key and foreign/missing attempt rejection, with legacy non-generation behavior preserved.
- `scripts/test-workflow-jobs.ts`: passed.
- `scripts/test-w2a-frozen-generation-input.ts`: passed frozen standard/Amazon identity and drift-before-claim cases, no fetches.
- New read-only `output/workflow-readiness-audit-20261116/generation-ownership-challenge.cjs`: passed actual export gates, graph parent/SW2 field propagation and injected normal-reclaim callback regression. It compiles the existing attempt test in memory and adds assertions; implementation source is unchanged.
- Inline active-parent/frozen-selection controls and configured-replay-hold probe: passed.
- `git diff --check`: passed.

Initial candidate probes were run against the earlier checkpoint and intentionally established the defects above. One GEN-C1 injection initially continued into an unrelated original rejection assertion after changing job state and exited 1 there; its preceding actual handler assertions had already demonstrated the candidate. Updated clean regressions pass on the final reviewed snapshot.

Unrun/excluded: live database CAS/trigger semantics, R2/provider/n8n services, hosted workflow bindings, image generation/billing, full native n8n execution and artifact quality. No browser, private data, credential reads, implementation edits, commit or push. Parent stop occurring after a valid response, concurrent same-attempt terminal callbacks and longer-running provider lease renewal were not proven exhaustively by this bounded checkpoint; they are not presented as observed current failures. The conclusions apply to the inspected snapshot only.
