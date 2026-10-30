# Phase 008: Make PDF geometry and template bindings config-driven

## Metadata

- Slug: 008-pdf-geometry-and-templates
- Status: planned
- Requires user approval: false
- Risk: high
- Visual QA: required
- Pre-work adversarial review: required
- Expected branch: codex/book-agnostic-workflows-2026-10-30
- Depends on: 007-shared-review-rendering
- Design source: Checkpoint 4: PDF worker and PDFMonkey templates in the parent implementation plan
- Execution authorization: granted by current execution-authority document

## Goal

Make PDF geometry and template bindings config-driven. Reuse the shared configuration/workflow contract from the parent plan.

## Scope

Checkpoint 4: PDF worker and PDFMonkey templates. Read the parent design and shared guardrails before work. This is a planning-phase file, not active runtime state.

## Explicit Tasks

1. Resolve dimensions and template precedence from frozen book/format config.
2. Inventory page/cover PNG and interior/cover PDF template contracts; classify reuse, parameter change or new template.
3. Prepare any needed HTML/CSS, payload/output specifications and validation cases locally.
4. Preserve existing hosted templates and record required new IDs/revisions as pending bindings.
5. Verify PDF request construction, scaling, bleed, cover spread and ordered output using fake providers.

## Out Of Scope

Checkout/payment recovery, unrelated platform work, new heartbeat adapter development, unreviewed Git mutations, unrelated scheduling, deployment, hosted writes/provider calls and real messages or print orders/drafts. Template creation in the hosted PDFMonkey account is separately gated even when local template authoring is in scope.

## Acceptance Criteria

- Two supported geometries and conflicting workflow defaults exercise actual worker requests.
- No invented hosted IDs or in-place edits to John's templates.
- New-template needs are explicit; local output is not called an actual PDFMonkey result.
- Review-only output still cannot invoke print, payment or notifications.

## Guardrails

Apply guardrails.md and current execution authority. Fresh-context QA is required after work; high-risk phases also require pre-work adversarial review and checkpoint release-safety. QA failure returns this phase to fixes. Record unknowns without turning them into passes. Preserve John's work and all pinned evidence. Use the owned runtime state to route execution; never resume the old checkout agenda.

## Verification Commands

These are planned checks, not results. Review actual script effects before running. Use the scrubbed, network-denied, headless foreground runner and external output rules from guardrails.md.

From backend, inside that runner: `node --import tsx scripts/test-w4-print-input.ts`.

From backend, inside that runner: `node --import tsx scripts/test-w4-print-worker.ts`.

Add/run the phase-specific producer-to-consumer and negative checks described above; record their exact commands and results during implementation. Existing tests alone do not establish new behavior.

## Files Likely Involved

- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/workers/w4-print-worker.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/back-end/src/lib/books/w4-print-input.ts`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json`

## Work Log

Not started. At execution, record actual changes, commands, ownership decisions and source/evidence hashes in the owned run/checkpoint record, not in a historical proof receipt.

## Completion Notes

Pending. Completion requires the acceptance evidence and fresh QA for these exact bytes. A local phase completion does not establish hosted success.

## QA Notes

Pending. Record reviewer, scope, source fingerprints, findings/fixes, skips and visual artifacts where required. Recheck changed evidence before reuse.

## Commit

After fresh QA and required release-safety, stage only owned phase changes and commit through the stock phase-commit step. Push only the recorded topic branch when enabled. Preserve foreign/parked work. Final-phase push waits for finalize. Main merge remains conditional on final review and applicable checks; deployments and external provider actions remain prohibited.
