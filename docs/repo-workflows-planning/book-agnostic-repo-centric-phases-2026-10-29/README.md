# Phased implementation package

Prepared for execution under [Jeff's updated authority](../book-agnostic-execution-authority-2026-10-30.md). The [parent plan](../book-agnostic-repo-centric-implementation-plan-2026-10-29.md) remains the detailed design. Phase files use ordinary phased-heartbeat metadata and commit gates. Runtime state, once initialized, owns actual progress; this manifest is not status.json.

## Phase order

| Phase | Output |
| --- | --- |
| [001](001-baseline-and-ownership.md) | Preserved source and integration/ownership map for John's baseline |
| [002](002-shared-config-contract.md) | Shared configuration and capability contract |
| [003](003-first-book-parity.md) | First-book configured recipes with old-order compatibility |
| [004](004-amazon-selection.md) | Correct selected book through normal Amazon upload and W0 |
| [005](005-configured-generation.md) | Configured W2A generation, QA and upload |
| [006](006-paths-and-completions.md) | Correct routing, W2B, callbacks and sibling artifact paths |
| [007](007-shared-review-rendering.md) | Shared flexible rendering and review publication |
| [008](008-pdf-geometry-and-templates.md) | Config-driven PDF geometry and template specifications |
| [009](009-three-book-proof.md) | Connected three-book local proof and visual review |
| [010](010-local-finalize-and-pilot-packet.md) | Local final summary, onboarding and gated external pilot packet |

Phases begin planned; runtime records determine later progress. Local implementation is authorized. No extra approval is needed for ordinary phase work inside the guardrails. External actions remain separately gated.

## Execution and resumption policy

At execution, first read the latest user authority, parent plan, [guardrails](guardrails.md), manifest and relevant phase. Recheck branch, index, current source and foreign edits. Bind to the existing project branch unless Jeff directs otherwise. Verify actual upstream ownership/dependencies before editing shared files. Never resume the superseded checkout/heartbeat agenda.

During an authorized run, progress through guardrails, work, fresh QA, fixes if needed, and a reviewed phase commit before the next phase. Each phase has at most five tasks. Split a phase if its actual scope proves larger, preserving acceptance and authority. High-risk changes receive pre-work adversarial and checkpoint release-safety reviews; rendering/UI phases require separate headless visual review. Missing evidence is a hold or disclosed limit, not a pass.

At every handoff, store the next exact action, current phase, source/config/asset fingerprints, commands, gate results and evidence paths in the owned checkpoint record. Before resuming, compare current bytes with those fingerprints and invalidate affected stale checks. Before phase commit, a checkpoint identifies HEAD/base, complete unstaged diff content and relevant untracked source; HEAD alone cannot identify uncommitted work. Keep source local and bulk evidence at the validated external project root.

## Commits and scheduling

Current authority supersedes the earlier no-commit conversion. Use stock phase work, fresh QA, phase commit and finalize steps. Take/refresh the owned run lock; change runtime status only with its recorded scripts. Stage only reviewed phase content. Do not commit mixed foreign work or claim a historical receipt validates new bytes. Only the scoped run's wakeups may be enabled. Leave unrelated automations untouched.

Before a handoff, persist runtime progress, exact next action and evidence. The watchdog and one-shot prompts must reload the owned run and preserve external-action restrictions. Never reuse the superseded checkout heartbeat prompt. Main merge is conditional on final review and green applicable checks; it does not authorize deployment.

## PDFMonkey work and completion boundary

Phase 008 determines whether each output can use an existing template or needs a new one. Prepare HTML/CSS, payload/output settings and test cases locally. Existing first-book/John templates stay intact. Actual hosted template creation or changes, new IDs and provider validation belong in the later approved external packet. Keep local fixture IDs plainly synthetic. Template uncertainty does not prevent independent source preparation.

The local run ends after phase 010's evidence review and final summary. It reports hosted/template/artwork holds and makes no full-production claim. Actual Amazon-format hosted intake, generation, uploads, template creation and PDFMonkey results require the separate pilot authorization. Do not add a pending external phase to the local completion count, mark it skipped or treat its absence as a pass.

[Resume prompt](resume-prompt.md) defines the scoped continuation. Runtime prompts must add exact run ID, directory, owner and step.
