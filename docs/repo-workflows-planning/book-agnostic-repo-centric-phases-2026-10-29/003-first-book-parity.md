# Phase 003: Move new first-book orders onto configured rendering

## Metadata

- Slug: 003-first-book-parity
- Status: planned
- Requires user approval: false
- Risk: high
- Visual QA: required
- Pre-work adversarial review: required
- Expected branch: codex/book-agnostic-workflows-2026-10-30
- Depends on: 002-shared-config-contract
- Design source: Checkpoint 1: first-book parity in the parent implementation plan
- Execution authorization: granted by current execution-authority document

## Goal

Move new first-book orders onto configured rendering. Reuse the shared configuration/workflow contract from the parent plan.

## Scope

Checkpoint 1: first-book parity. Read the parent design and shared guardrails before work. This is a planning-phase file, not active runtime state.

## Explicit Tasks

1. Capture accepted standard/Amazon layout and text references.
2. Define a new immutable first-book config version using shared recipes.
3. Retain an explicit old-order compatibility path.
4. Verify text, guides, cover and page parity with separate visual review.

## Out Of Scope

Checkout/payment recovery, unrelated platform work, new heartbeat adapter development, unreviewed Git mutations, unrelated scheduling, deployment, hosted writes/provider calls and real messages or print orders/drafts. Template creation in the hosted PDFMonkey account is separately gated even when local template authoring is in scope.

## Acceptance Criteria

- New first-book orders use the same configured rendering contract as Inner Voice.
- Historical config/manifest bytes stay unchanged.
- Any visual difference is explained and reviewed, not hidden by replacing references.

## Guardrails

Apply guardrails.md and current execution authority. Fresh-context QA is required after work; high-risk phases also require pre-work adversarial review and checkpoint release-safety. QA failure returns this phase to fixes. Record unknowns without turning them into passes. Preserve John's work and all pinned evidence. Use the owned runtime state to route execution; never resume the old checkout agenda.

## Verification Commands

These are planned checks, not results. Review actual script effects before running. Use the scrubbed, network-denied, headless foreground runner and external output rules from guardrails.md.

From backend, inside that runner: `node --import tsx scripts/test-configured-w3-pipeline.ts`.

Add/run the phase-specific producer-to-consumer and negative checks described above; record their exact commands and results during implementation. Existing tests alone do not establish new behavior.

## Files Likely Involved

- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w3-preview-plan.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/configured-book-rendering.ts`

## Work Log

Not started. At execution, record actual changes, commands, ownership decisions and source/evidence hashes in the owned run/checkpoint record, not in a historical proof receipt.

## Completion Notes

Pending. Completion requires the acceptance evidence and fresh QA for these exact bytes. A local phase completion does not establish hosted success.

## QA Notes

Pending. Record reviewer, scope, source fingerprints, findings/fixes, skips and visual artifacts where required. Recheck changed evidence before reuse.

## Commit

After fresh QA and required release-safety, stage only owned phase changes and commit through the stock phase-commit step. Push only the recorded topic branch when enabled. Preserve foreign/parked work. Final-phase push waits for finalize. Main merge remains conditional on final review and applicable checks; deployments and external provider actions remain prohibited.
