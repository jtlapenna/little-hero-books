# Phase 004: Select and freeze the correct book at upload

## Metadata

- Slug: 004-amazon-selection
- Status: planned
- Requires user approval: false
- Risk: high
- Visual QA: required
- Pre-work adversarial review: required
- Expected branch: codex/book-agnostic-workflows-2026-10-30
- Depends on: 003-first-book-parity
- Design source: Checkpoint 2 in the parent implementation plan
- Execution authorization: granted by current execution-authority document

## Goal

Select and freeze the correct book at upload. Reuse the shared configuration/workflow contract from the parent plan.

## Scope

Checkpoint 2. Read the parent design and shared guardrails before work. This is a planning-phase file, not active runtime state.

## Explicit Tasks

1. Add explicit book/edition/version selection to the existing multipart upload path.
2. Derive metadata from selected config and retain documented first-book legacy behavior.
3. Carry selection through actual parsing, row creation and W0 freezing.
4. Cover conflicting line-item selection, quantity, siblings and replay.

## Out Of Scope

Checkout/payment recovery, unrelated platform work, new heartbeat adapter development, unreviewed Git mutations, unrelated scheduling, deployment, hosted writes/provider calls and real messages or print orders/drafts. Template creation in the hosted PDFMonkey account is separately gated even when local template authoring is in scope.

## Acceptance Criteria

- Actual upload/parser/W0 tests assert metadata and selected frozen config together.
- Missing/conflicting new-book selection fails without wrong-book effects.
- Existing per-child and quantity-expanded identities remain correct.

## Guardrails

Apply guardrails.md and current execution authority. Fresh-context QA is required after work; high-risk phases also require pre-work adversarial review and checkpoint release-safety. QA failure returns this phase to fixes. Record unknowns without turning them into passes. Preserve John's work and all pinned evidence. Use the owned runtime state to route execution; never resume the old checkout agenda.

## Verification Commands

These are planned checks, not results. Review actual script effects before running. Use the scrubbed, network-denied, headless foreground runner and external output rules from guardrails.md.

From backend, inside that runner: `node --import tsx scripts/test-w0-deployed-selection.ts`.

From backend, inside that runner: `node --import tsx scripts/test-w0-manifest-freeze.ts`.

Add/run the phase-specific producer-to-consumer and negative checks described above; record their exact commands and results during implementation. Existing tests alone do not establish new behavior.

## Files Likely Involved

- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/app/admin/csv-upload/page.tsx`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/sibling-order-helpers.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/w0-manifest-request.ts`

## Work Log

Not started. At execution, record actual changes, commands, ownership decisions and source/evidence hashes in the owned run/checkpoint record, not in a historical proof receipt.

## Completion Notes

Pending. Completion requires the acceptance evidence and fresh QA for these exact bytes. A local phase completion does not establish hosted success.

## QA Notes

Pending. Record reviewer, scope, source fingerprints, findings/fixes, skips and visual artifacts where required. Recheck changed evidence before reuse.

## Commit

After fresh QA and required release-safety, stage only owned phase changes and commit through the stock phase-commit step. Push only the recorded topic branch when enabled. Preserve foreign/parked work. Final-phase push waits for finalize. Main merge remains conditional on final review and applicable checks; deployments and external provider actions remain prohibited.
