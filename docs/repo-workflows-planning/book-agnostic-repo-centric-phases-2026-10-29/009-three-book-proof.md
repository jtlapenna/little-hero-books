# Phase 009: Prove future-book onboarding uses configuration alone

## Metadata

- Slug: 009-three-book-proof
- Status: planned
- Requires user approval: false
- Risk: high
- Visual QA: required
- Pre-work adversarial review: required
- Expected branch: codex/book-agnostic-workflows-2026-10-30
- Depends on: 008-pdf-geometry-and-templates
- Design source: Checkpoint 5 in the parent implementation plan
- Execution authorization: granted by current execution-authority document

## Goal

Prove future-book onboarding uses configuration alone. Reuse the shared configuration/workflow contract from the parent plan.

## Scope

Checkpoint 5. Read the parent design and shared guardrails before work. This is a planning-phase file, not active runtime state.

## Explicit Tasks

1. Run first-book standard/Amazon, Inner Voice and a structurally different third fixture through the same producer/consumer chain.
2. Add third-book config/assets/registration only, with different count/poses/geometry/templates.
3. Verify frozen replay behavior, negative cases and John's preservation regressions.
4. Inspect every resulting local page and cover and bind evidence to final source/config bytes.

## Out Of Scope

Checkout/payment recovery, unrelated platform work, new heartbeat adapter development, unreviewed Git mutations, unrelated scheduling, deployment, hosted writes/provider calls and real messages or print orders/drafts. Template creation in the hosted PDFMonkey account is separately gated even when local template authoring is in scope.

## Acceptance Criteria

- No workflow-node edits or new book-ID branches for the third book.
- Local upload-to-review coverage is connected, not fabricated intermediate objects.
- Source bindings, negative cases, visual review and inherited-check limitations are recorded.
- No claim of actual hosted providers or final artwork acceptance.

## Guardrails

Apply guardrails.md and current execution authority. Fresh-context QA is required after work; high-risk phases also require pre-work adversarial review and checkpoint release-safety. QA failure returns this phase to fixes. Record unknowns without turning them into passes. Preserve John's work and all pinned evidence. Use the owned runtime state to route execution; never resume the old checkout agenda.

## Verification Commands

These are planned checks, not results. Review actual script effects before running. Use the scrubbed, network-denied, headless foreground runner and external output rules from guardrails.md.

From backend, inside that runner: `node --import tsx scripts/test-configured-book-contract.ts`.

From backend, inside that runner: `node --import tsx scripts/test-configured-pose-pipeline.ts`.

From backend, inside that runner: `node --import tsx scripts/test-configured-w3-pipeline.ts`.

From backend, inside that runner: `node --import tsx scripts/test-w4-print-worker.ts`.

Add/run the phase-specific producer-to-consumer and negative checks described above; record their exact commands and results during implementation. Existing tests alone do not establish new behavior.

## Files Likely Involved

- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/scripts/test-configured-book-contract.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/scripts/test-configured-w3-pipeline.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/docs/repo-workflows-planning/new-book-amazon-workflow-e2e-test-plan-2026-10-29.md`

## Work Log

Not started. At execution, record actual changes, commands, ownership decisions and source/evidence hashes in the owned run/checkpoint record, not in a historical proof receipt.

## Completion Notes

Pending. Completion requires the acceptance evidence and fresh QA for these exact bytes. A local phase completion does not establish hosted success.

## QA Notes

Pending. Record reviewer, scope, source fingerprints, findings/fixes, skips and visual artifacts where required. Recheck changed evidence before reuse.

## Commit

After fresh QA and required release-safety, stage only owned phase changes and commit through the stock phase-commit step. Push only the recorded topic branch when enabled. Preserve foreign/parked work. Final-phase push waits for finalize. Main merge remains conditional on final review and applicable checks; deployments and external provider actions remain prohibited.
