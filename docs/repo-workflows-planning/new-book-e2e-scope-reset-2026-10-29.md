# New-book scope reset and comparison

Current authority: prepare an Amazon-upload-to-review-PDF test of the new book through n8n, Gemini, Bria and PDFMonkey. Everything stays uncommitted. Automations stay paused. No hosted execution, uploads, deployments, customer messages or print orders are authorized by this preparation.

## Work set aside

Website checkout recovery, Stripe transport, private checkout/intake SQL and heartbeat infrastructure are excluded. They do not need finishing before the book test. Linux validation is not a separate prerequisite for this test; investigate a runtime problem only if it blocks the selected workflow.

Before cleanup, preserved the tracked binary diff, source copies and file inventory at `/Volumes/WD_BLACK/AgentArtifacts/little-hero-books/new-book-e2e-scope-reset-2026-10-29-r1`. `backup-manifest.json` identifies the snapshot; `scope-reset-actions.json` records exact actions and hashes. Large generated files and pinned deliverables remain in place. This backup is not a deployable release.

Restored ten identified checkout, browser-storage, frontend package and checkout-CI files to unchanged upstream bytes. Removed only three unrelated CI invocations and the backend no-order-prototype package script. Five unused SQL/fixture drafts now have `.parked` extensions under `parked-order-platform-work-2026-10-29/`, outside migration and TypeScript discovery. The action receipt lists every path. These restorations retain the baseline checkout behavior, including its known limitations.

Other diagnostic helpers, frozen harnesses, receipts and historical plans remain preserved. They are excluded from this test, not all physically archived. In particular, frozen `test-intake-reservation-postgres.sh` and `test-checkout-operation-reservation-postgres.sh` still reference parked migration paths and cannot rerun unchanged from this tree. Ownership of other local Gelato changes is unresolved, so those changes remain untouched. No broad reset or automatic cleanup occurred. Old test results describe their recorded source snapshots; cleanup does not make those results current-tree passes.

## Published work comparison

Compared local HEAD `f7efbb3308df1111568890ed6de9ae5c7c38fe74` with published main `98e50d913a622e8fb18b06b9f3f67413f1418490`. Main was one commit ahead: [PR #64](https://github.com/jtlapenna/little-hero-books/pull/64), which preserves revision/reapproval and adds guarded print approval. Its payable production runtime remains held. This comparison cannot reveal John's unpublished changes or deployed versions.

Four modified paths overlap:

| Path | Published change | Integration requirement |
| --- | --- | --- |
| `back-end/package.json` | Adds review-invalidation and release-application test scripts | Preserve both scripts when adding book-specific checks. Only our unrelated prototype script was removed during cleanup. |
| `back-end/src/lib/workers/w3-manifest-publish.ts` | Invalidates prior review before publishing a new manifest | Preserve invalidation. Our separate flow-publication refusal needs book-specific review; do not overwrite the file. |
| `back-end/scripts/test-configured-w3-boundaries.ts` | Injects review-invalidation test hook | Keep hook alongside local book assertions. |
| `back-end/scripts/test-configured-w3-pipeline.ts` | Injects review-invalidation test hook | Keep hook alongside local book assertions. |

These are file overlaps, not a demonstrated merge conflict. No merge, rebase or branch update was performed. The local branch still lacks the rest of PR #64. Before shared execution or publication, agree on John's current baseline and combine only the required book changes, preserving his revision and print guards. Do not publish this mixed worktree wholesale.

## Scope control

Use [the focused test plan](new-book-amazon-workflow-e2e-test-plan-2026-10-29.md) as the active plan. Older checkout/heartbeat plans are historical and do not authorize continued work. Automations were checked: 95 paused, zero active.

For each proposed change, identify the failing stage between upload and review PDF and its observable effect on this book. Fix only that stage's necessary book behavior. Record unrelated findings for later; obtain Jeff's approval before expanding scope. Reviews and agents cannot add project goals. Reconcile shared-file ownership with John before editing his order paths. Do not restart automation without Jeff's explicit request.

Project Reflect disposition: narrow execution to the existing Amazon upload and selected n8n chain. Confirm book selection and the publication hold now; defer checkout and platform redesign. The next outcome is one traceable service-generated review book.
