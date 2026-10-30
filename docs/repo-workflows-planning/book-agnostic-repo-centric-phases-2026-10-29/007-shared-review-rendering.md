# Phase 007: Complete shared flexible rendering and review publication

## Metadata

- Slug: 007-shared-review-rendering
- Status: planned
- Requires user approval: false
- Risk: high
- Visual QA: required
- Pre-work adversarial review: required
- Expected branch: codex/book-agnostic-workflows-2026-10-30
- Depends on: 006-paths-and-completions
- Design source: Checkpoint 4: W3 and review intent in the parent implementation plan
- Execution authorization: granted by current execution-authority document

## Goal

Complete shared flexible rendering and review publication. Reuse the shared configuration/workflow contract from the parent plan.

## Scope

Checkpoint 4: W3 and review intent. Read the parent design and shared guardrails before work. This is a planning-phase file, not active runtime state.

## Explicit Tasks

1. Complete generic flow rendering and fit validation against frozen inputs.
2. Reuse existing worker/job plumbing for review output while retaining print ineligibility.
3. Preserve invalidation before artifact replacement and buyer reapproval behavior.
4. Test changed assets, stale fit evidence, short/long names, guides and schema mismatch.

## Out Of Scope

Checkout/payment recovery, unrelated platform work, new heartbeat adapter development, unreviewed Git mutations, unrelated scheduling, deployment, hosted writes/provider calls and real messages or print orders/drafts. Template creation in the hosted PDFMonkey account is separately gated even when local template authoring is in scope.

## Acceptance Criteria

- Connected W3 publication tests produce review artifacts without authorizing print/messages.
- No wholesale removal of readiness/fit guards.
- Each page and cover matches editor selections in separate headless visual QA.

## Guardrails

Apply guardrails.md and current execution authority. Fresh-context QA is required after work; high-risk phases also require pre-work adversarial review and checkpoint release-safety. QA failure returns this phase to fixes. Record unknowns without turning them into passes. Preserve John's work and all pinned evidence. Use the owned runtime state to route execution; never resume the old checkout agenda.

## Verification Commands

These are planned checks, not results. Review actual script effects before running. Use the scrubbed, network-denied, headless foreground runner and external output rules from guardrails.md.

From backend, inside that runner: `node --import tsx scripts/test-book-flow-contract.ts`.

From backend, inside that runner: `node --import tsx scripts/test-configured-w3-pipeline.ts`.

From backend, inside that runner: `node --import tsx scripts/test-configured-w3-boundaries.ts`.

Add/run the phase-specific producer-to-consumer and negative checks described above; record their exact commands and results during implementation. Existing tests alone do not establish new behavior.

## Files Likely Involved

- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/configured-book-rendering.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w3-manifest.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/workers/w3-manifest-publish.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w4-print-input.ts`

## Work Log

Not started. At execution, record actual changes, commands, ownership decisions and source/evidence hashes in the owned run/checkpoint record, not in a historical proof receipt.

## Completion Notes

Pending. Completion requires the acceptance evidence and fresh QA for these exact bytes. A local phase completion does not establish hosted success.

## QA Notes

Pending. Record reviewer, scope, source fingerprints, findings/fixes, skips and visual artifacts where required. Recheck changed evidence before reuse.

## Commit

After fresh QA and required release-safety, stage only owned phase changes and commit through the stock phase-commit step. Push only the recorded topic branch when enabled. Preserve foreign/parked work. Final-phase push waits for finalize. Main merge remains conditional on final review and applicable checks; deployments and external provider actions remain prohibited.
