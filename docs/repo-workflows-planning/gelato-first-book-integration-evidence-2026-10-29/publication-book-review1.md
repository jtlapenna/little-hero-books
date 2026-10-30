# Independent ordinary-book release consequence slice

NOT READY for the reviewed staged snapshot: two confirmed ordinary edit/review workflow blockers. This is a bounded independent slice; it is not the coordinator's full release receipt or a deployment/merge approval.

Identity: worktree `/Users/johncapogna/.codex/worktrees/gelato-first-book-integration/little-hero-books`; branch `codex/gelato-first-book-gap-closure`; HEAD and locally verified `origin/main` both `f7efbb3308df1111568890ed6de9ae5c7c38fe74`. Parent supplied freshly fetched base and explicitly prohibited networking/credential use. No fetch attempted by this reviewer. Reviewed staged raw-diff Git hash `541ed22764a09e11f5f63ae0afd9f81af0704242`, stable staged patch ID `0ebb12c476d7eb424f7100681e6b22ddb3cc8431`. No unstaged/relevant untracked files found during review. Timestamp: 2026-10-29, approximately 23:32 UTC.

## Confirmed blockers

### High / blocker: completed review rows are mistaken for actively executing work

Changed `back-end/src/lib/book-review-invalidation.ts:15–17` rejects every `execution_status === 'processing'` unless the internal-source stage exception applies. Actual W2A and W2B completion producers deliberately persist `processing` for `needsReview:true`, while setting `current_workflow` and `started_at` to null (`src/app/api/webhooks/workflow-2a-complete/route.ts:156–160`; `workflow-2b-complete/route.ts:117–123`). Those are completed assets awaiting manual review, including failed QA and replacement work, not active generation.

`replace-image/route.ts:293`, `auto-flip-pose/route.ts:472`, and non-approved `approveStage` now invoke this guard. A normal flagged pose/background replacement or reset of these completed rows therefore fails before the intended repair. The preexisting handlers accepted the edit. Print evidence and genuine active markers should remain hard stops.

Reproduction, actual producer plus actual new consumer: `/tmp/lhl-phase090-producer-probe.cjs`, run from `back-end` using installed ARM Node 24 with `--import tsx`, empty environment plus explicit synthetic bindings, and a global fetch interceptor rejecting every unexpected destination. Actual W2A completion POST returned 200 for body:

```json
{"orderId":"RELEASE-REVIEW-LOCAL","manifestUrl":"book-mvp-simple-adventure/orders/RELEASE-REVIEW-LOCAL/manifests/2a-manifest.json","characterHash":"synthetic-character","needsReview":true}
```

Its actual stored patch was `workflow_step=2A-complete, execution_status=processing, current_workflow=null, started_at=null`. Passing the resulting row to actual `bookReviewInvalidation(row,'preBria')` threw the active-workflow error. Live requests: 0. A second pure probe confirmed the same behavior for `bria_processing_complete`.

Smallest fix: distinguish completed, review-held processing rows from actual running work using the canonical completed stage plus null ownership markers (or normalize these producer states to a dedicated non-running review state and audit its consumers). Add actual completion-producer-to-edit coverage for both W2A and W2B, while proving real active work and every print-ownership field remain blocked.

### High / blocker: upstream proof invalidation leaves the W3 replay barrier intact

Changed `book-review-invalidation.ts:21–26` clears downstream review approvals and queue but keeps old `manifest_3_url` and `workflow_step`. After an existing proof is edited/reset at preBria or postBria, ordinary reapproval queues W3 through `approval-store.ts:119–125`. The real W3 input endpoint's `shouldSkipCompletedW3Replay` returns true when **any** of these holds (`src/app/api/internal/w3/build-assembly-input/route.ts:91–108`):

- `manifest_3_url` is nonempty;
- `workflow_step === 'book_assembly_completed'`;
- `execution_status === 'done' && status === 'pending_assembly_review'`.

Ordinary reapproval does not propagate `force:true` and does not withdraw the old manifest. The newly invalidated upstream book is therefore skipped as already complete instead of being assembled again. This can strand correction work and preserve the old proof despite the new stage decisions. Merely clearing the manifest URL is insufficient when the completed workflow step remains.

Reproduction, actual producer-to-consumer code: `/tmp/lhl-phase090-reassembly-probe.cjs` builds the canonical W0 manifest, applies actual `bookReviewInvalidation(postBria)`, calls actual `approveStage(postBria)` with intercepted orders transport, then calls actual `buildW3AssemblyInputResponse` using the real manifest builders and only injected pose/image/database transports. Result: next_workflow `3`, execution_status `ready_for_processing`, old manifest URL and completed workflow step retained; response `workflowSkipped=true`, reason `w3-order-already-complete`, assembly job attempts 0. Live requests: 0.

The added revision journey (`scripts/test-gelato-local-journey.ts:139–143`) directly calls `publishW3Manifest` after reapproval and bypasses this actual input/replay boundary, so its passing evidence does not disprove this failure.

Smallest complete fix: for upstream preBria/postBria invalidation, retire the downstream manifest/final output references and rewind the completed workflow checkpoint to the appropriate upstream stage, or introduce a proof-version/dirty marker explicitly consumed by the replay guard. Preserve postPdf-only edit behavior. Clear/retire `manifest_3_url` and stale final book/cover refs deliberately, rather than globally weakening duplicate replay protection. Regression must flow from ordinary upstream invalidation/reapproval through `buildW3AssemblyInputResponse` and prove one new assembly attempt; unchanged completed replay must still skip.

## Bounded impact map

- Canonical new invariant: any changed book withdraws affected/downstream review, previous human/customer decision, old preview links, and print queue. Producer/validator is `bookReviewInvalidation`; persistence is exact row ID with a snapshot CAS; token revocation happens only after durable hold.
- Direct editing consumers checked: replacement upload, automatic/manual flip, stage reset, flag-driven unapproval, W3 manifest publication. Direct completion producers checked: W2A, W2B, W3 completion and W3 input's duplicate-replay guard.
- Stage continuation checked: `approveStage` queues 2B/3; `determineNextWorkflow` prefers existing manifest/checkpoint; cron selects ready rows only with nonnull queue and null active markers; W4 still requires customer approval where required. New null queue prevents straightforward stale print dispatch; it does not solve W3 continuation.
- Customer action checked: customer mutation requires approved postPdf, final manifest, completed row and no active markers; actual approval uses the existing snapshot/RPC authority. Reset links are retired before asset mutation. One-correction notification helper now matches existing reject/RPC limit of one. Production ordinary release runtime remains unconditionally blocked.
- Visibility checked: mapper/display prefers nonpending review stages; first-review filters and secondary-review filter exist; an in-review held stage remains visible after resetting former customer-approved raw status. Existing focused test covers this. No new UI markup was changed.

## Checks, evidence, limits

Read AGENTS.md, release-safety-review skill and rubric; staged source hunks in the assigned slice; changed ordinary revision test and focused invalidation coverage; direct consumers/producers above; package scripts and added ordinary-release CI steps. Account-boundary pre-commit policy is coordinator-owned; no commit/push/auth inspection performed. No schema migration added by this patch. No actual database, provider, fixture, messaging, browser, network or print services used.

The two focused intercepted probes above passed their defect assertions. Initial shell Node 18/tsx attempt failed solely due x64 Node with arm64 esbuild; subsequent checks used the installed compatible ARM Node 24 runtime. This is an environment observation, not a repository defect.

Previously authored checks.json claims were treated as claims. Focused test source was inspected, including CAS failure and token-revocation failure cases, trusted internal active-stage exceptions, and actual reset mapping. Broad prior checks were not rerun. Hosted SQL/CI, n8n engine, production services, visual rendering and physical printing were excluded as requested. Full CI/rollout/financial review belongs to the other reviewer/coordinator slices. The blockers here do not depend on those unavailable environments.

Required before this slice is clear: fix both lifecycle mismatches, add producer-to-real-consumer regressions as described, refresh source-bound evidence, and rerun the release gate against the new exact staged identity. No unrelated launch hardening requested.
