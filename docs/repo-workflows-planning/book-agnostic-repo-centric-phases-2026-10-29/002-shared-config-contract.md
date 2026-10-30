# Phase 002: Define the shared configuration contract

## Metadata

- Slug: 002-shared-config-contract
- Status: planned
- Requires user approval: false
- Risk: high
- Visual QA: not required
- Pre-work adversarial review: required
- Expected branch: codex/book-agnostic-workflows-2026-10-30
- Depends on: 001-baseline-and-ownership
- Design source: Checkpoint 1: schema and capabilities in the parent implementation plan
- Execution authorization: granted by current execution-authority document

## Goal

Define the shared configuration contract. Reuse the shared configuration/workflow contract from the parent plan.

## Scope

Checkpoint 1: schema and capabilities. Read the parent design and shared guardrails before work. This is a planning-phase file, not active runtime state.

## Explicit Tasks

1. Extend existing config/snapshot validation for book metadata, limits, references, templates and geometry.
2. Replace book-ID-specific configured classification with the shared contract without weakening frozen identity.
3. Define supported style/profile capabilities and explicit unsupported-input errors.
4. Keep config version, rendering schema and workflow version distinct.

## Out Of Scope

Checkout/payment recovery, unrelated platform work, new heartbeat adapter development, unreviewed Git mutations, unrelated scheduling, deployment, hosted writes/provider calls and real messages or print orders/drafts. Template creation in the hosted PDFMonkey account is separately gated even when local template authoring is in scope.

## Acceptance Criteria

- Neutral future-book ID validates through the existing loader/registry.
- Conflicts and unsupported capabilities reject before effects; old snapshots retain semantics.

## Guardrails

Apply guardrails.md and current execution authority. Fresh-context QA is required after work; high-risk phases also require pre-work adversarial review and checkpoint release-safety. QA failure returns this phase to fixes. Record unknowns without turning them into passes. Preserve John's work and all pinned evidence. Use the owned runtime state to route execution; never resume the old checkout agenda.

## Verification Commands

These are planned checks, not results. Review actual script effects before running. Use the scrubbed, network-denied, headless foreground runner and external output rules from guardrails.md.

From backend, inside that runner: `node --import tsx scripts/test-configured-book-contract.ts`.

From backend, inside that runner: `node --import tsx scripts/test-w0-manifest-freeze.ts`.

Add/run the phase-specific producer-to-consumer and negative checks described above; record their exact commands and results during implementation. Existing tests alone do not establish new behavior.

## Files Likely Involved

- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/types.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/book-render-contract.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/build-run-manifest.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w2a-frozen-input.ts`

## Work Log

Not started. At execution, record actual changes, commands, ownership decisions and source/evidence hashes in the owned run/checkpoint record, not in a historical proof receipt.

## Completion Notes

Pending. Completion requires the acceptance evidence and fresh QA for these exact bytes. A local phase completion does not establish hosted success.

## QA Notes

Pending. Record reviewer, scope, source fingerprints, findings/fixes, skips and visual artifacts where required. Recheck changed evidence before reuse.

## Commit

After fresh QA and required release-safety, stage only owned phase changes and commit through the stock phase-commit step. Push only the recorded topic branch when enabled. Preserve foreign/parked work. Final-phase push waits for finalize. Main merge remains conditional on final review and applicable checks; deployments and external provider actions remain prohibited.
