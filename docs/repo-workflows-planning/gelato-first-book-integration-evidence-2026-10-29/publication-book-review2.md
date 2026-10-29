# Independent ordinary-book release consequence review 2

READY WITH RESIDUAL RISK for the bounded source fixes to the two findings in `/tmp/lhl-phase090-book-release-review.md`: both confirmed lifecycle blockers are resolved in the reviewed working content. No remaining material blocker found in this slice. This does not declare the entire release ready and is not reusable for commit until the coordinator stages the corrected content and records the complete final identity.

Reviewed 2026-10-29 about 23:36 UTC in `/Users/johncapogna/.codex/worktrees/gelato-first-book-integration/little-hero-books`, branch `codex/gelato-first-book-gap-closure`. HEAD and local origin/main remain `f7efbb3308df1111568890ed6de9ae5c7c38fe74`. No networking, credentials, commits, index mutation or source edits performed. The final fixes were unstaged and the new regression untracked when read; the index still contained the originally reviewed helper. This is an explicit working-content review, not an assertion that the then-staged patch was fixed.

## Findings disposition

1. **Resolved: completed needsReview rows blocked as active execution.** `back-end/src/lib/book-review-invalidation.ts:15–19` now permits only recognized completed review checkpoints when both current_workflow and started_at are clear. Unknown processing checkpoints and real ownership markers remain blocked; every prior print-ownership field remains a hard stop. An idle hold normalizes execution_status to done. The actual W2A needsReview POST in the new regression produces the prior failing processing/null/null state, after which the actual invalidation succeeds. The W2B canonical completed checkpoint is explicitly exercised as well.

2. **Resolved: stale downstream completion evidence causes W3 to skip corrected books.** For upstream preBria/postBria holds, `book-review-invalidation.ts:25–28` withdraws manifest_3_url and changes workflow_step to the existing customer_revision checkpoint. Actual ordinary stage approval subsequently sets ready_for_processing and next_workflow=3. The real W3 input endpoint therefore sees none of its three completed-replay predicates. The new regression goes through real approveStage and buildW3AssemblyInputResponse for both upstream stages and proves exactly one instrumentation attempt each. The unchanged W3 replay guard remains intact for normal completed-order retries. postPdf-only holds retain their completed proof pointer/checkpoint, as needed for direct page review.

## Executed checks and credibility

From back-end with an empty environment and compatible installed ARM64 Node 24.5.0:

- `node --import tsx scripts/test-book-reassembly.ts`: passed 9 checks; actual W2A completion and W3 entry; externalRequests=0.
- `node --import tsx scripts/test-book-review-invalidation.ts`: passed 32 checks; actual reset caller, dashboard mapper/filter visibility, downstream hold, approval requirement, known print/active ownership rejection, trusted internal ownership, CAS loss, and token-retirement failure; liveRequests=0.

Both ran against the exact working source identified below. The new regression uses canonical W0 production construction and the actual lifecycle functions/endpoints; image normalization and database/job transport are injected. These substitutions preserve the two failing predicates rather than mocking them away. CI working content was inspected and explicitly invokes test-book-reassembly.ts between the prior invalidation and application checks.

## Bounded impact, policy and residual limits

The fix changes only inactive completed review eligibility and upstream proof lifecycle evidence. Customer and human approval withdrawal, link retirement ordering, print-ownership stops, queue hold, and CAS behavior remain unchanged. Reapproval restores queue readiness and the current W3 worker will publish the new manifest through the existing producer. First/secondary review visibility remains covered by the existing real mapper/filter checks.

Read root AGENTS and release-safety-review skill/rubric in review 1; no new path policy appeared in this bounded follow-up. No migration added. Account-boundary Git checks and complete final staged fingerprint remain coordinator-owned. Real PostgREST/SQL, hosted CI/n8n, physical printing, messaging, deployment and the broader financial/application slice were not exercised, as instructed. These are named residual environments rather than blockers for the two deterministic fixes. Parent's in-progress ordinary website journey was not credited as passed here.

Source Git blob hashes (`git hash-object --no-filters`, working content):

- book-review-invalidation.ts: `a263554d0ca1e7494c2962993cbd36df1fdc370f`
- test-book-reassembly.ts: `4dc11fff5c4243d91e6f109a9181df777b14c355`
- test-book-review-invalidation.ts: `f9e6dd754f696e94592b5ce785f815585cd18ca8`
- internal/w3/build-assembly-input/route.ts: `038561bdc234616e0231890c6ee64257272f7dc9`
- approval-store.ts: `47bd1e6f337a31d8ca9b8aa3435f5e3f18d946be`

Before commit: stage the source/test/CI corrections; reconcile the final scope and updated evidence in the coordinator's gate; recompute the final receipt identity. No additional corrective source work required by this slice.
