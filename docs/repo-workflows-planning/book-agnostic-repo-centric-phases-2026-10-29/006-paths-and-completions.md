# Phase 006: Preserve book identity through routing and background removal

## Metadata

- Slug: 006-paths-and-completions
- Status: planned
- Requires user approval: false
- Risk: high
- Visual QA: not required
- Pre-work adversarial review: required
- Expected branch: codex/book-agnostic-workflows-2026-10-30
- Depends on: 005-configured-generation
- Design source: Checkpoint 3: queue, W2B, callbacks and W4.1 in the parent implementation plan
- Execution authorization: granted by current execution-authority document

## Goal

Preserve book identity through routing and background removal. Reuse the shared configuration/workflow contract from the parent plan.

## Scope

Checkpoint 3: queue, W2B, callbacks and W4.1. Read the parent design and shared guardrails before work. This is a planning-phase file, not active runtime state.

## Explicit Tasks

1. Derive W4 manifest paths from canonical selected-book context.
2. Carry approved pose references and namespaces through W2B and normalization.
3. Verify completion/retry/reassembly identity and affected cache inputs.
4. Correct affected W4.1 artifact/error paths and explicitly handle or reject incompatible mixed-book grouping.

## Out Of Scope

Checkout/payment recovery, unrelated platform work, new heartbeat adapter development, unreviewed Git mutations, unrelated scheduling, deployment, hosted writes/provider calls and real messages or print orders/drafts. Template creation in the hosted PDFMonkey account is separately gated even when local template authoring is in scope.

## Acceptance Criteria

- Same-appearance children in different books cannot exchange outputs.
- Wrong-book and wrong-sibling completion rejects; normal retry remains compatible.
- No change to John's paid release or aggregation policy.

## Guardrails

Apply guardrails.md and current execution authority. Fresh-context QA is required after work; high-risk phases also require pre-work adversarial review and checkpoint release-safety. QA failure returns this phase to fixes. Record unknowns without turning them into passes. Preserve John's work and all pinned evidence. Use the owned runtime state to route execution; never resume the old checkout agenda.

## Verification Commands

These are planned checks, not results. Review actual script effects before running. Use the scrubbed, network-denied, headless foreground runner and external output rules from guardrails.md.

From backend, inside that runner: `node --import tsx scripts/test-configured-w3-boundaries.ts`.

Add/run the phase-specific producer-to-consumer and negative checks described above; record their exact commands and results during implementation. Existing tests alone do not establish new behavior.

## Files Likely Involved

- `/Users/jeff/.codex/worktrees/090a/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w2b-worklist.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w2b-pose-input.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/app/api/webhooks/workflow-2b-complete/route.ts`

## Work Log

Not started. At execution, record actual changes, commands, ownership decisions and source/evidence hashes in the owned run/checkpoint record, not in a historical proof receipt.

## Completion Notes

Pending. Completion requires the acceptance evidence and fresh QA for these exact bytes. A local phase completion does not establish hosted success.

## QA Notes

Pending. Record reviewer, scope, source fingerprints, findings/fixes, skips and visual artifacts where required. Recheck changed evidence before reuse.

## Commit

After fresh QA and required release-safety, stage only owned phase changes and commit through the stock phase-commit step. Push only the recorded topic branch when enabled. Preserve foreign/parked work. Final-phase push waits for finalize. Main merge remains conditional on final review and applicable checks; deployments and external provider actions remain prohibited.
