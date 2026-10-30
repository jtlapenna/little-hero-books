# Phase 010: Finalize local evidence and prepare the external pilot

## Metadata

- Slug: 010-local-finalize-and-pilot-packet
- Status: planned
- Requires user approval: false
- Risk: medium
- Visual QA: not required
- Pre-work adversarial review: not required
- Expected branch: codex/book-agnostic-workflows-2026-10-30
- Depends on: 009-three-book-proof
- Design source: Checkpoints 6 and local finish criteria in the parent implementation plan
- Execution authorization: granted by current execution-authority document

## Goal

Finalize local evidence and prepare the external pilot. Reuse the shared configuration/workflow contract from the parent plan.

## Scope

Checkpoints 6 and local finish criteria. Read the parent design and shared guardrails before work. This is a planning-phase file, not active runtime state.

## Explicit Tasks

1. Review all local checkpoint evidence, ownership preservation, alignment and remaining holds.
2. Write onboarding instructions and a plain-English local final summary.
3. Prepare exact workflow/backend/config/template binding checklist and new-template specifications.
4. Prepare the synthetic Amazon pilot packet, cost bound and no-order/no-message controls for separate authorization.

## Out Of Scope

Checkout/payment recovery, unrelated platform work, new heartbeat adapter development, unreviewed Git mutations, unrelated scheduling, deployment, hosted writes/provider calls and real messages or print orders/drafts. Template creation in the hosted PDFMonkey account is separately gated even when local template authoring is in scope.

## Acceptance Criteria

- Local completion accurately distinguishes evidence-backed passes from pending hosted checks.
- New PDFMonkey template creation, assets/config publication and real-provider execution remain pending explicit authority.
- At local completion, pause the owned scheduler. Only reviewed phase Git actions are allowed; no false completion, print order/draft or hosted mutation.

## Guardrails

Apply guardrails.md and current execution authority. Fresh-context QA is required after work; high-risk phases also require pre-work adversarial review and checkpoint release-safety. QA failure returns this phase to fixes. Record unknowns without turning them into passes. Preserve John's work and all pinned evidence. Use the owned runtime state to route execution; never resume the old checkout agenda.

## Verification Commands

These are planned checks, not results. Review actual script effects before running. Use the scrubbed, network-denied, headless foreground runner and external output rules from guardrails.md.

Add/run the phase-specific producer-to-consumer and negative checks described above; record their exact commands and results during implementation. Existing tests alone do not establish new behavior.

No implementation test command is applicable to the documentary output alone; verify manifests, ownership/source hashes, links, index state and evidence references.

## Files Likely Involved

- `/Users/jeff/.codex/worktrees/090a/little-hero-books/docs/repo-workflows-planning/book-agnostic-repo-centric-implementation-plan-2026-10-29.md`
- `/Users/jeff/.codex/worktrees/090a/little-hero-books/docs/repo-workflows-planning/new-book-amazon-workflow-e2e-test-plan-2026-10-29.md`

## Work Log

Not started. At execution, record actual changes, commands, ownership decisions and source/evidence hashes in the owned run/checkpoint record, not in a historical proof receipt.

## Completion Notes

Pending. Completion requires the acceptance evidence and fresh QA for these exact bytes. A local phase completion does not establish hosted success.

## QA Notes

Pending. Record reviewer, scope, source fingerprints, findings/fixes, skips and visual artifacts where required. Recheck changed evidence before reuse.

## Commit

After fresh QA and required release-safety, stage only owned phase changes and commit through the stock phase-commit step. Push only the recorded topic branch when enabled. Preserve foreign/parked work. Final-phase push waits for finalize. Main merge remains conditional on final review and applicable checks; deployments and external provider actions remain prohibited.
