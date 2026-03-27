# Repo-Centric Workflow Handoff — 2026-03-25 — W2A Live Proof Complete / Route Cleanup

> Update — on March 27, 2026 in Los Angeles time latest-latest-latest-latest-latest-latest-latest-latest-latest-latest-latest-latest-latest: a safe operator-facing `W4` recovery surface now exists in the admin app, and it is intentionally constrained to the sandbox-only single-order `W4` path.
>
> What changed in repo/backend:
>
> - new recovery helper [w4-recovery.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-recovery.ts) now inspects stage-`4` `workflow_jobs`, summarizes recent `W4` recovery candidates, and refuses replay when the order already has any real Lulu submission signal (`lulu_job_id`, `lulu_status`, or `print_submitted_at`)
> - new admin API [w4-recovery/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w4-recovery/route.ts) exposes recent candidate listing, per-order inspection, and a single replay action that posts only to live webhook `w4-pdf-print-repo`
> - new admin page [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-recovery/page.tsx) gives operators a read-first `W4` console with one-click replay only when the order is sandbox-safe
> - admin nav and home now link to the new surface via [navigation.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/ui/navigation.tsx) and [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/page.tsx)
>
> Safety contract for this console:
>
> - replay is allowed only when the latest single-order `W4` job failed or dead-lettered before any real Lulu submission state appeared
> - replay posts a forced fresh run through `w4-pdf-print-repo` with `backendUrl = https://admin.littleherolabs.com`
> - the imported repo-centric `W4` graph remains sandbox-only on that extracted path, so the recovery console cannot create a billable production Lulu job through this route
> - orders that already show Lulu submission state are `inspect` only and do not get a replay button
>
> Fresh artifacts from this pass:
>
> - backend deploy revision [3e6eb860.little-hero-labs-admin.pages.dev](https://3e6eb860.little-hero-labs-admin.pages.dev)
>
> Verification from this pass:
>
> - repo checks passed: `test:w4-recovery` plus targeted `eslint`
> - full Cloudflare Pages build passed and included `/admin/w4-recovery` and `/api/admin/w4-recovery`
> - deployed preview and custom-domain smoke reads both returned `200 {"success":true,...}` for `/api/admin/w4-recovery`
> - order-specific smoke read for proof order `W3-WFJ-PROOF-20260326194731-safe-v2` returned `recommendedAction = "none"`, `latestJobStatus = "succeeded"`, `safeToReplay = false`, which confirms successful sandbox `W4` completions are not being misclassified as recovery candidates
>
> Update — on March 27, 2026 in Los Angeles time latest-latest-latest-latest-latest-latest-latest-latest-latest-latest-latest-latest: the single-order `W4` sandbox-only repo extraction plan is now implemented and proven live without creating a billable Lulu job or any customer-facing completion side effect.
>
> What changed in repo/backend:
>
> - durable stage-`4` job control now exists for single-order `W4` through repo helper [w4-print-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w4-print-jobs.ts) with job type `w4-print-fulfillment`
> - repo-owned pre-submit worker routes now cover `W4` render, PDF materialization, QA, manifest publish, and submit-input build:
>   - [build-print-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-print-input/route.ts)
>   - [render-print-document/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/render-print-document/route.ts)
>   - [materialize-print-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/materialize-print-pdf/route.ts)
>   - [run-print-qa/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/run-print-qa/route.ts)
>   - [publish-print-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/publish-print-manifest/route.ts)
>   - [build-submit-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-submit-input/route.ts)
> - the repo-owned submit builder [w4-submit-input.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts) now hard-pins the extracted path to Lulu sandbox, never production, and now injects a safe non-production fallback phone number when a disposable proof order is missing shipping phone data
> - webhook [print-submitted/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/print-submitted/route.ts) now accepts structured sandbox `luluStatus` objects and marks sandbox runs `succeeded` in `workflow_jobs` without writing real print-submission lifecycle state or sending notifications
> - the imported live repo-centric `W4` graph already in cloud `n8n` is using thin repo adapters for this path, with sandbox token + submit nodes active and the production Lulu nodes structurally present but not used by the extracted proof path
>
> Fresh backend artifacts from this pass:
>
> - backend deploy revision [318b8ca4.little-hero-labs-admin.pages.dev](https://318b8ca4.little-hero-labs-admin.pages.dev)
> - backend deploy revision [d229a69f.little-hero-labs-admin.pages.dev](https://d229a69f.little-hero-labs-admin.pages.dev)
>
> Live proof sequence from this pass:
>
> - initial disposable `W4` sandbox proof execution `34448` proved the repo-owned render / QA / manifest path, but failed at repo route `Build Lulu Print Job Payload` because `build-submit-input` rejected a missing shipping phone on the disposable proof order
> - error-trigger execution `34450` confirmed that regression and kept the order row clean; disposable proof jobs `152` and `153` were then explicitly canceled after their respective fixes so no stale active W4 rows remained
> - backend route [`/api/internal/w4/build-submit-input`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-submit-input/route.ts) was then re-tested directly on the exact live `n8n` payload that had failed and returned `200` on both preview and production, with `submitMode = "sandbox"` and fallback `shippingAddress.phone_number = "555-555-5555"`
> - fresh disposable live execution `34451` is the clean proof after both fixes
> - durable stage job `workflow_jobs.id = 154` reached `succeeded`
> - durable attempt `workflow_job_attempts.id = 115` reached `succeeded`
> - the event stream ended with terminal `completed` event `1972`
> - the result snapshot for job `154` records `submitMode = "sandbox"`, `externalProvider = "lulu-sandbox"`, `luluStatus = "CREATED"`, and manifest `4-manifest` publication
>
> Safety result from the live proof:
>
> - the order row for disposable proof order `W3-WFJ-PROOF-20260326194731-safe-v2` stayed at `workflow_step = book_assembly_completed` / `execution_status = done` / `status = pending_assembly_review` / `next_workflow = 4`
> - `lulu_job_id` remained `null`
> - `print_submitted_at` remained `null`
> - no customer notification path ran
> - the extracted path used Lulu sandbox only and did not create a production print submission
>
> Practical meaning: single-order `W4` now has the same durable repo-owned control plane shape as `W3` for the sandbox-only proof path. The next `W4` decision is no longer whether sandbox-safe repo extraction works. It is whether to extend the same worker pattern to `W4.1`, add operator-facing W4 recovery tooling, or later design a separate production Lulu cutover with explicit paid-job guardrails.
>
> Update — on March 27, 2026 in Los Angeles time latest-latest-latest-latest-latest-latest-latest-latest-latest-latest-latest: the remaining forced-replay `W3` preview polling issue is now fixed in repo code, deployed, and proven live. I patched repo helper [`w3-pdfmonkey-preview.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w3-pdfmonkey-preview.ts) so transient poll-request transport failures from PDFMonkey are retried in-process instead of immediately surfacing a hard route failure back to `n8n`. This directly targets the earlier `pageNumber = 7` `provider-failed` / `pdfMonkeyStatus = pending` failure that had ended `workflow_jobs.id = 146`.
>
> What changed in repo/backend:
>
> - [`renderW3PreviewDocument(...)`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w3-pdfmonkey-preview.ts) now tolerates up to three consecutive poll-request transport failures before failing the preview render
> - transient first-poll failures now stay inside the repo-owned backend route instead of forcing `n8n` to retry the whole preview step from the top
> - [`test-w3-preview-render.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-preview-render.ts) now covers the exact recovery case where the first status fetch fails and a later poll succeeds
>
> Fresh artifacts from this pass:
>
> - backend deploy revision [7b6affc5.little-hero-labs-admin.pages.dev](https://7b6affc5.little-hero-labs-admin.pages.dev)
>
> Live validation from this pass:
>
> - repo verification passed with `npm --prefix back-end run test:w3-preview-render`
> - targeted lint passed for `scripts/test-w3-preview-render.ts` and `src/lib/w3-pdfmonkey-preview.ts`
> - production returned the expected auth-protected `401` for `/api/internal/w3/render-preview-document` after deploy
> - a forced live replay through webhook `book-assembly-repo` with `claimedAt = 2026-03-27T07:04:00Z` created durable stage job `workflow_jobs.id = 148`
> - the old failure point did not recur: page `7` recorded normal `provider-submitted` + `poll-tick` events `1865` through `1869`, ending `pdfMonkeyStatus = success` instead of `provider-failed`
> - the same forced replay then continued through the remaining page previews, cover preview, manifest publish, and completion callback without manual intervention
> - `workflow_jobs.id = 148` and `workflow_job_attempts.id = 109` both reached `succeeded`
> - the event stream ended with terminal `completed` event `1914`
> - order `W3-WFJ-PROOF-20260326195258-safe-v3` remained cleanly finalized at `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4` / `status = pending_assembly_review`
>
> Practical meaning: the old forced-replay `W3` failure is closed. Direct forced reruns now survive the transient preview-provider state that had previously killed the run at page `7`, while completed-order replays are still skipped by default unless `force: true` is set.
>
> Update — on March 26, 2026 in Los Angeles time latest-latest-latest-latest-latest-latest-latest-latest-latest-latest: completed `W3` orders now short-circuit at the repo-owned entry route unless the caller explicitly forces a replay. I patched [`build-assembly-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts) so after it resolves normalized `W3` assembly input, it looks up the current order row and, when the order is already at `book_assembly_completed` / has `manifest_3_url` / is `done` + `pending_assembly_review`, returns `workflowSkipped = true` with reason `w3-order-already-complete` instead of creating a new `workflow_job`. `force: true` still bypasses that short-circuit.
>
> What changed in repo/backend:
>
> - [`W3AssemblyWorkflowFields`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w3-assembly-jobs.ts) now allows null job ids for intentional short-circuit responses
> - repo helper [`buildSkippedW3AssemblyWorkflowFields(...)`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w3-assembly-jobs.ts) provides the normalized skipped response shape
> - [`build-assembly-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts) now looks up the order row and skips already-complete `W3` orders unless `force: true`
> - [`test-w3-assembly-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-assembly-input.ts) now covers both the completed-order short-circuit and the `force: true` override
>
> Fresh artifacts from this pass:
>
> - backend deploy revision [2e6df527.little-hero-labs-admin.pages.dev](https://2e6df527.little-hero-labs-admin.pages.dev)
>
> Live validation from this pass:
>
> - repo verification passed with `npm --prefix back-end run test:w3-assembly-input` and `npm --prefix back-end run test:workflow-jobs`
> - targeted lint passed for `scripts/test-w3-assembly-input.ts`, `src/app/api/internal/w3/build-assembly-input/route.ts`, and `src/lib/workflow-jobs/w3-assembly-jobs.ts`
> - production internal route `/api/internal/w3/build-assembly-input` now returns `workflowSkipped = true`, `workflowSkipReason = "w3-order-already-complete"`, and null workflow-job ids for already-complete order `W3-WFJ-PROOF-20260326195258-safe-v3`
> - an end-to-end live POST to webhook `book-assembly-repo` with `claimedAt = 2026-03-27T05:24:10Z` created **no** new `workflow_jobs` rows; the latest `W3` jobs for the order remained `147` / `146` / `145`
> - active `W3` job count for that proof order remained `0`
>
> Practical meaning: direct or accidental W3 reruns against an already-complete order no longer re-enter preview generation by default. That removes the replay failure class exposed by `workflow_jobs.id = 146` while preserving an explicit forced replay escape hatch for future operator tooling.
>
> Update — on March 26, 2026 in Los Angeles time latest-latest-latest-latest-latest-latest-latest-latest-latest: the `W3` overlap guard is now hardened at the backend claim layer and proven live. The earlier workflow-side `workflowSkipped` check was not enough under real concurrency; two near-simultaneous direct `book-assembly-repo` calls could still race past the pre-read and create duplicate active `workflow_jobs`. I patched repo helper [`w3-assembly-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w3-assembly-jobs.ts) so `claimAndStartW3AssemblyJob(...)` now re-checks for the canonical earliest active `W3` job after enqueue and again after claim, then cancels the losing duplicate row before provider work starts.
>
> What changed in repo/backend:
>
> - `claimAndStartW3AssemblyJob(...)` now picks a canonical active `W3` job by earliest create time / lowest id
> - if a newer duplicate row exists after enqueue or after claim, that newer row is marked with event `duplicate-trigger-superseded`, canceled immediately, and the caller is redirected to the winning job
> - the winning job gets append-only trace event `duplicate-trigger-skipped`
> - a new regression test covers the exact race where a later duplicate becomes visible only after enqueue
>
> Fresh artifacts from this pass:
>
> - backend deploy revision [f5deb17d.little-hero-labs-admin.pages.dev](https://f5deb17d.little-hero-labs-admin.pages.dev)
>
> Live validation from this pass:
>
> - repo verification passed with `npm --prefix back-end run test:workflow-jobs`
> - targeted lint passed for `scripts/test-workflow-jobs.ts` and `src/lib/workflow-jobs/w3-assembly-jobs.ts`
> - production returned the expected auth-protected `401` for `/api/internal/w3/build-assembly-input` after deploy
> - two near-simultaneous direct POSTs to live webhook `book-assembly-repo` with `claimedAt = 2026-03-27T05:14:10Z` and `2026-03-27T05:14:11Z` created `workflow_jobs.id = 146` and `147`
> - the important overlap result is that only `146` became active; `147` was canceled immediately with no claim and no attempt row
> - job `147` recorded `duplicate-trigger-superseded`, while winner `146` recorded `duplicate-trigger-skipped` naming skipped job `147`
> - after that overlap proof there were zero active `W3` jobs for the order again because `146` later reached a separate terminal `failed` state and `147` was already `canceled`
> - order `W3-WFJ-PROOF-20260326195258-safe-v3` remained at `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4` / `status = pending_assembly_review`
>
> Historical note: the overlap bug was fixed in this pass, but the winning replay `workflow_jobs.id = 146` later failed independently at `pageNumber = 7` with a provider-side `pdfMonkeyStatus = pending` / `provider-failed` path. That later forced-replay issue is now fixed too by the March 27 repo-side preview-poll hardening described at the top of this handoff.
>
> Update — on March 26, 2026 in Los Angeles time latest-latest-latest-latest-latest-latest-latest-latest: the shared workflow-job event logger no longer regresses terminal `W3` attempts back to `polling`, and that fix is now deployed + proven live. I patched backend route [`/api/internal/workflow-jobs/log-event`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts) so late non-terminal `poll-tick` / status-log events are ignored once a job or attempt is already terminal, and I locked that behavior into [`test-workflow-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-workflow-jobs.ts).
>
> What changed in repo/backend:
>
> - the log-event route now loads the current attempt row when `attemptId` is provided
> - if an attempt already has `ended_at` or already has terminal status, later non-terminal `attemptStatus` updates are ignored instead of rewriting it back to `polling`
> - if a job is already terminal, later non-terminal `jobStatus` updates are ignored too
> - a new regression test covers the exact late-`poll-tick` case that previously left `workflow_job_attempts.id = 103` ended but still marked `polling`
>
> Fresh artifacts from this pass:
>
> - backend deploy revision [9079c930.little-hero-labs-admin.pages.dev](https://9079c930.little-hero-labs-admin.pages.dev)
>
> Live validation from this pass:
>
> - repo verification passed with `npm --prefix back-end run test:workflow-jobs`
> - both preview and production returned the expected auth-protected `401` for `/api/internal/workflow-jobs/log-event` after deploy
> - I repaired the previously bad historical row `workflow_job_attempts.id = 103` to `status = succeeded` and appended audit event `attempt-status-reconciled` on `workflow_jobs.id = 141`
> - a fresh direct disposable replay against `book-assembly-repo` with `claimedAt = 2026-03-27T04:38:54Z` created durable stage job `workflow_jobs.id = 142`
> - an earlier hanging curl from the same proof accidentally also created `workflow_jobs.id = 143` with `claimedAt = 2026-03-27T04:37:52Z`; both runs completed cleanly and left no active `W3` jobs
> - the important regression proof is job `142`: `workflow_job_attempts.id = 104` ended with `status = succeeded`, `ended_at = 2026-03-27T04:43:42.860Z`, and terminal event `completed` `1580`
> - order `W3-WFJ-PROOF-20260326195258-safe-v3` again finalized cleanly to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
>
> Practical meaning: the old inconsistency is fixed. Late workflow log traffic can no longer take a finished `W3` attempt or job and push it back to `polling`, so durable `workflow_jobs` state now stays trustworthy after completion.
>
> Update — on March 26, 2026 in Los Angeles time latest-latest-latest-latest-latest-latest-latest: the remaining `W3` assembly-entry glue is now thin and proven live too. I removed the workflow-side static-data dedupe and HTTP response-normalization shim so the live `w3-Book-Assembly` entry path now relies on the repo-owned backend route [`/api/internal/w3/build-assembly-input`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts) for durable job claiming, idempotency, and normalized assembly input.
>
> What changed in the live/exported workflow:
>
> - `Idempotency Check` is now a pass-through adapter
> - `Extract Manifest URL (3)` is now a thin code-node adapter that calls `/api/internal/w3/build-assembly-input`
> - `Build Assembly Input From Manifest` is now a pass-through adapter because the repo route already returns normalized JSON
>
> Fresh artifacts from this pass:
>
> - [w3-Book-Assembly.live.before-assembly-entry-route-thinning-2026-03-27T04-15-13.043Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.before-assembly-entry-route-thinning-2026-03-27T04-15-13.043Z.json)
> - [w3-Book-Assembly.live.after-assembly-entry-route-thinning-2026-03-27T04-15-13.043Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.after-assembly-entry-route-thinning-2026-03-27T04-15-13.043Z.json)
>
> Live validation from this pass:
>
> - repo verification passed with `npm --prefix back-end run test:w2-workflow-contracts` and `npm --prefix back-end run test:w3-assembly-input`
> - a fresh direct disposable replay against `book-assembly-repo` with `claimedAt = 2026-03-27T04:19:12Z` created durable stage job `workflow_jobs.id = 141`
> - `workflow_jobs.id = 141` reached `succeeded`
> - the event stream ended with terminal `completed` event `1414`
> - the order row again finalized cleanly to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
> - order `status` remained `pending_assembly_review`, confirming the thinner entry path preserved the existing repo-owned `W3` lifecycle behavior
> - one overlapping proof rerun from an earlier helper also created `workflow_jobs.id = 140`; once `141` had succeeded, I explicitly canceled `140` as redundant so the order returned to zero active `W3` jobs
>
> Practical meaning: `W3` no longer depends on workflow-local dedupe state or n8n HTTP Request response parsing at the entry seam. The repo-owned `build-assembly-input` route is now the source of truth for claim/idempotency and the workflow only fans that response into the remaining preview / publish stages.
>
> Update — on March 26, 2026 in Los Angeles time latest-latest-latest-latest-latest-latest: the remaining `W3` manifest-storage tail is now repo-owned and proven live. I moved the `3-manifest` upload plus order-row/review-stage persistence out of workflow JSON and into backend route [`/api/internal/w3/publish-manifest`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/publish-manifest/route.ts), backed by repo worker [`w3-manifest-publish.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workers/w3-manifest-publish.ts). The live `w3-Book-Assembly` export now treats these legacy tail nodes as thin pass-throughs:
>
> - `Prep Manifest Upload (3)` calls `/api/internal/w3/publish-manifest`
> - `Upload 3 Manifest to R2` is now a pass-through adapter
> - `Fetch and Merge Review Stages (3)` is now a pass-through adapter
> - `Supabase Upsert 3` is now a pass-through adapter
>
> Fresh artifacts from this pass:
>
> - backend deploy revision [51306134.little-hero-labs-admin.pages.dev](https://51306134.little-hero-labs-admin.pages.dev)
> - [w3-Book-Assembly.live.before-manifest-publish-route-extraction-2026-03-27T03-39-58.401Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.before-manifest-publish-route-extraction-2026-03-27T03-39-58.401Z.json)
> - [w3-Book-Assembly.live.after-manifest-publish-route-extraction-2026-03-27T03-39-58.401Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.after-manifest-publish-route-extraction-2026-03-27T03-39-58.401Z.json)
>
> Live validation from this pass:
>
> - both preview deploy and production returned the expected auth-protected `401` for `/api/internal/w3/publish-manifest`
> - a fresh router-driven disposable rerun on order `W3-WFJ-PROOF-20260326195258-safe-v3` reached durable stage job `workflow_jobs.id = 139`
> - attempt `101` reached `succeeded`
> - the event stream ended with terminal `completed` event `1244`
> - the order row finalized cleanly again to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
> - the order status is back to `pending_assembly_review`, which confirms the repo-owned manifest-publish path also persisted the post-`W3` review state correctly
>
> Practical meaning: `W3` preview planning, provider submit/poll, preview artifact materialization, manifest assembly, manifest upload, order review-state persistence, and durable stage completion are all now repo-owned and proven together on the live backend/router path.
>
> Update — on March 26, 2026 in Los Angeles time latest-latest-latest-latest-latest: the next `W3` extraction slice is now proven live too. I moved page/cover preview artifact materialization out of workflow JSON and into the production backend route [`/api/internal/w3/materialize-preview-artifact`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/materialize-preview-artifact/route.ts), backed by repo worker [`w3-preview-artifacts.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workers/w3-preview-artifacts.ts). That route now owns the PDFMonkey PNG download, R2 upload, and best-effort Cloudflare Images publish for both page previews and the cover spread, while the live `w3-Book-Assembly` workflow only calls the route through thin adapter nodes.
>
> Fresh artifacts from this pass:
>
> - backend deploy revision [96d5e0b2.little-hero-labs-admin.pages.dev](https://96d5e0b2.little-hero-labs-admin.pages.dev)
> - [w3-Book-Assembly.live.before-preview-artifact-materialization-extraction-2026-03-27T03-17-23.230Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.before-preview-artifact-materialization-extraction-2026-03-27T03-17-23.230Z.json)
> - [w3-Book-Assembly.live.after-preview-artifact-materialization-extraction-2026-03-27T03-19-13.522Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.after-preview-artifact-materialization-extraction-2026-03-27T03-19-13.522Z.json)
>
> Live proof outcome from this rerun:
>
> - the production backend served the new route correctly after deploy, returning the expected auth-protected `401` when probed without a bearer token
> - a fresh router-driven disposable rerun on order `W3-WFJ-PROOF-20260326195258-safe-v3` reached durable stage job `workflow_jobs.id = 138`
> - attempt `100` reached `succeeded`
> - the event stream ended with terminal `completed` event `1162`
> - the order row finalized cleanly again to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
> - the final persisted `3-manifest` URL is `https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/SIB-E2E-2026-02-28-A-item-002-r2/manifests/3-manifest.json`
>
> Practical meaning: `W3` preview planning, preview document submission, preview artifact materialization, manifest assembly, and stage completion are all now repo-owned and proven together on the live backend/router path.
>
> Update — on March 26, 2026 in Los Angeles time latest-latest-latest-latest: after the new `w3-Book-Assembly` export was re-imported live, I verified that the production backend initially did **not** have the three new repo-owned `W3` routes yet. `POST` probes to `/api/internal/w3/prepare-assembly-run`, `/api/internal/w3/collect-preview-images`, and `/api/internal/w3/mark-previews-ready` were returning `404` on `https://admin.littleherolabs.com`, even though the freshly built Pages revision already served them. I rebuilt and redeployed the backend to Pages revision [fefdc390.little-hero-labs-admin.pages.dev](https://fefdc390.little-hero-labs-admin.pages.dev), rechecked those three routes until production returned the expected auth-protected `401` responses, then reran the same disposable router-driven `W3` proof order through the live backend router.
>
> Live proof outcome from this imported-live follow-up:
>
> - backend `GET /api/cron/router` returned `200` and reported `ordersProcessed = 1` for order `W3-WFJ-PROOF-20260326195258-safe-v3`
> - the new triggered `W3` stage job `workflow_jobs.id = 137` reached `succeeded`
> - attempt `99` reached `succeeded`
> - the event stream ended with terminal `completed` event `1076`
> - the order row finalized cleanly again to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
> - the imported live workflow exercised the newly deployed repo-owned routes all the way through page previews, cover preview, manifest callback, and stage completion without manual intervention
>
> Practical meaning: the currently imported live `W3` workflow and the currently deployed production backend are now proven together, not just separately.
>
> Update — on March 26, 2026 latest-latest-latest: the router-driven `W3` follow-up is now closed too. I hardened the sibling `W1.1` queue-manager path so `Workflow 3` reruns no longer depend on `one_manifest_url` being present on the order row and no longer point at the stale legacy `book-assembly-sibtest` webhook. The current live path now does all three of these correctly:
>
> - backend [`cron/router`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/cron/router/route.ts) forwards `one_manifest_key`, `manifest_2b_url`, and `manifest_3_url` into the sibling `W1.1` workflow payload instead of assuming `one_manifest_url` is enough
> - [`Prep Workflow 3 Orders`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json) now derives `orderPrefix` / `bookId` from any usable manifest or asset-path hint and only marks an order failed when all `W3` manifest context is missing
> - [`Trigger Workflow 3`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json) now posts to the active repo webhook `book-assembly-repo`, and [`Verify Order Claimed (3)`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json) preserves those manifest/path hints instead of stripping them back out
>
> Fresh live artifacts from this router-driven hardening pass:
>
> - [w1.1-Queue_Manager_and_Router.live.before-w3-manifest-context-hardening-2026-03-26T23-25-39-308Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w1.1-Queue_Manager_and_Router.live.before-w3-manifest-context-hardening-2026-03-26T23-25-39-308Z.json)
> - [w1.1-Queue_Manager_and_Router.live.after-w3-manifest-context-hardening-2026-03-26T23-25-39-308Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w1.1-Queue_Manager_and_Router.live.after-w3-manifest-context-hardening-2026-03-26T23-25-39-308Z.json)
> - [w1.1-Queue_Manager_and_Router.live.before-w3-webhook-path-fix-2026-03-26T23-32-50-381Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w1.1-Queue_Manager_and_Router.live.before-w3-webhook-path-fix-2026-03-26T23-32-50-381Z.json)
> - [w1.1-Queue_Manager_and_Router.live.after-w3-webhook-path-fix-2026-03-26T23-32-50-381Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w1.1-Queue_Manager_and_Router.live.after-w3-webhook-path-fix-2026-03-26T23-32-50-381Z.json)
> - [w1.1-Queue_Manager_and_Router.live.before-w3-claim-context-preservation-2026-03-26T23-37-32-542Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w1.1-Queue_Manager_and_Router.live.before-w3-claim-context-preservation-2026-03-26T23-37-32-542Z.json)
> - [w1.1-Queue_Manager_and_Router.live.after-w3-claim-context-preservation-2026-03-26T23-37-32-542Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w1.1-Queue_Manager_and_Router.live.after-w3-claim-context-preservation-2026-03-26T23-37-32-542Z.json)
>
> Live proof outcome from this router pass:
>
> - queue-manager execution `34315` is the clean router-driven proof after all three fixes
> - `Prep Workflow 3 Orders` emitted the sibling-safe `manifest3Url` plus `orderPrefix = book-mvp-simple-adventure/orders/SIB-E2E-2026-02-28-A-item-002-r2`
> - the triggered `W3` stage job `workflow_jobs.id = 136` reached `succeeded`
> - attempt `98` reached `succeeded`
> - the event stream ended with terminal `completed` event `992`
> - the proof order `W3-WFJ-PROOF-20260326195258-safe-v3` finalized cleanly to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
>
> Practical meaning: the `W3` repo extraction is now proven not only through direct disposable webhook contracts, but also through the real backend-router -> sibling-`W1.1` -> repo-`W3` live path.
>
> Update — on March 26, 2026 latest-latest: the stale backend router fallback is now fixed in repo and deployed. [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/cron/router/route.ts) no longer defaults to dead webhook path `w1-1-router`; it now falls back to the active live `W1.1` webhook path `w1-1-router-sibtest`, and [env.example](/Users/jeff/Projects/little-hero-books/back-end/env.example) now documents the same active path. The fix is live in Pages revision [0f8c04ad.little-hero-labs-admin.pages.dev](https://0f8c04ad.little-hero-labs-admin.pages.dev). Validation from this pass:
>
> - direct POST to `https://thepeakbeyond.app.n8n.cloud/webhook/w1-1-router-sibtest` returned `200`
> - `GET /api/cron/router` on the fresh deployed backend returned `200` with `skipped: true, reason: "no_orders"` instead of the earlier `502` / `404 not registered`
>
> Practical meaning: the backend router no longer points at a dead default W1.1 webhook when `N8N_ROUTER_WEBHOOK_URL` is unset.

> Update — on March 26, 2026 latest: the next `W3` extraction slice is now complete and proven live. I moved page/cover preview planning and `3-manifest` assembly out of workflow JSON and behind repo-owned backend routes, with the live `w3-Book-Assembly` export reduced to thin adapters at those seams. The current live path is now:
>
> - repo preview-planning logic in [w3-preview-plan.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w3-preview-plan.ts)
> - repo manifest-assembly logic in [w3-manifest.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w3-manifest.ts)
> - backend routes in [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-preview-plan/route.ts) and [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-manifest/route.ts)
> - thin live/exported workflow adapters in [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
> - contract + route tests in [test-w2-workflow-contracts.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w2-workflow-contracts.ts), [test-w3-preview-plan.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-preview-plan.ts), and [test-w3-manifest.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-manifest.ts)
>
> Live proof outcome from this pass:
>
> - the backend deploy that serves the new internal routes completed successfully with Pages revision [622cf7fb.little-hero-labs-admin.pages.dev](https://622cf7fb.little-hero-labs-admin.pages.dev)
> - live workflow `D4rQ0zJG8JlKhZqq` was updated again with fresh backups:
>   - [w3-Book-Assembly.live.before-render-preview-route-extraction-2026-03-26T22-57-23-846Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.before-render-preview-route-extraction-2026-03-26T22-57-23-846Z.json)
>   - [w3-Book-Assembly.live.after-render-preview-route-extraction-2026-03-26T22-57-23-846Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.after-render-preview-route-extraction-2026-03-26T22-57-23-846Z.json)
> - fresh disposable execution `34304` for order `W3-WFJ-PROOF-20260326195258-safe-v3` finished `success`
> - new `workflow_jobs.id = 135` reached `succeeded` with terminal event `completed`
> - the proof order row again finalized cleanly to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
> - this proof was triggered by replaying the same direct `book-assembly-repo` webhook contract that had produced earlier good execution `34291`, but with a fresh `claimedAt`, so the new live result validates the extracted preview-plan + manifest-assembly path rather than a different trigger shape
>
> Operational note from the same pass:
>
> - during proofing I found that backend `cron/router` was still defaulting to stale webhook path `w1-1-router` when `N8N_ROUTER_WEBHOOK_URL` was unset
> - that router fallback has since been fixed in repo and deployed, so the active default now matches live `W1.1` webhook `w1-1-router-sibtest`
> - that did not block the W3 extraction proof because the direct `book-assembly-repo` proof route worked, and the router follow-up is now closed
>
> Repo-side verification from this pass:
>
> - `npm --prefix back-end run test:w3-preview-plan`
> - `npm --prefix back-end run test:w3-manifest`
> - `npm --prefix back-end run test:w3-preview-render`
> - `npm --prefix back-end run test:w3-assembly-input`
> - `npm --prefix back-end run test:w2-workflow-contracts`
> - targeted `eslint` on the touched `W3` extraction files
>
> Practical meaning: the remaining `W3` gap is no longer preview planning, manifest assembly, or PDFMonkey submit/poll transport. Those seams are now repo-owned and proven live. The follow-up choice is extracting the rest of `W3` orchestration out of workflow JSON.

> Update — on March 26, 2026 newest still: the next `W3` extraction slice is now proven live. I moved the preview-render provider transport out of fragile `httpRequest` node serialization and behind the repo-owned [`/api/internal/w3/render-preview-document`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/render-preview-document/route.ts) backend route, with the live `w3-Book-Assembly` export calling it through thin code-node adapters instead of raw-body HTTP Request nodes. The live path is now:
>
> - repo worker logic in [w3-pdfmonkey-preview.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w3-pdfmonkey-preview.ts)
> - backend route in [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/render-preview-document/route.ts)
> - thin live/exported workflow adapters in [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
> - contract + route tests in [test-w2-workflow-contracts.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w2-workflow-contracts.ts) and [test-w3-preview-render.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-preview-render.ts)
>
> Live proof outcome from this pass:
>
> - live workflow `D4rQ0zJG8JlKhZqq` was updated again with fresh backups:
>   - [w3-Book-Assembly.live.before-render-preview-route-extraction-2026-03-26T22-17-17-862Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.before-render-preview-route-extraction-2026-03-26T22-17-17-862Z.json)
>   - [w3-Book-Assembly.live.after-render-preview-route-extraction-2026-03-26T22-17-17-862Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.after-render-preview-route-extraction-2026-03-26T22-17-17-862Z.json)
> - fresh disposable execution `34291` for order `W3-WFJ-PROOF-20260326195258-safe-v3` finished `success`
> - new `workflow_jobs.id = 134` / attempt `96` reached `succeeded` with terminal event `completed`
> - the order row is clean again at `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
> - the manifest callback now points at the sibling-safe path actually used for this proof: `book-mvp-simple-adventure/orders/SIB-E2E-2026-02-28-A-item-002-r2/manifests/3-manifest.json`
> - stale proof jobs `131`, `132`, and `133` that had been stranded in `running` from the pre-fix transport failures were explicitly closed as `failed`, so the operator monitor is back to `activeCount = 0` for this order
>
> Repo-side verification from this pass:
>
> - `npm --prefix back-end run test:w2-workflow-contracts`
> - `npm --prefix back-end run test:w3-preview-render`
> - targeted `eslint` on the touched `W3` preview route / lib / contract files
>
> Practical meaning: `W3` preview submit + poll provider work is no longer coupled to `n8n` HTTP Request node JSON quirks. The remaining `W3` extraction gap is now the surrounding page/cover planning and manifest assembly flow, not the PDFMonkey transport/poll loop itself.

> Update — on March 26, 2026 newest: there is now a broader read-only operator surface for the shared `workflow_jobs` control plane, not just the `W2A` recovery page. I added a stage-agnostic monitor in repo/admin:
>
> - [workflow-jobs-monitor.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs-monitor.ts) now provides shared recent-job summary + per-order inspection across `W2A`, `W2B`, and `W3`, including latest attempt and recent event hydration from `workflow_job_attempts` / `workflow_job_events`.
> - [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/workflow-jobs/route.ts) exposes that read-only monitor through `/api/admin/workflow-jobs`.
> - [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx) adds the new operator console at `/admin/workflow-jobs`.
> - [navigation.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/ui/navigation.tsx) and [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/page.tsx) now surface the new console in the admin nav and home page.
>
> Verification from this pass:
>
> - targeted `eslint` passed on the new monitor lib, API route, page, nav, and home page changes
> - a dotenv-backed smoke read against the new monitor returned the current live summary and confirmed that proof order `W3-WFJ-PROOF-20260326195258-safe-v3` resolves cleanly with `workflow_jobs.id = 130`, `status = succeeded`, and recent events ending in `completed`
>
> Practical meaning: operators now have one shared read-only place to inspect recent `workflow_jobs` state across stages before dropping into a stage-specific action page such as `W2A Recovery`.

> Update — on March 26, 2026 latest: the deliberately narrow `W3` follow-up is now fully proven through the live repo-centric workflow export, not just the backend seam. I wired durable `workflow_jobs` event logging into the repo `w3-Book-Assembly` export for PDFMonkey page + cover submit / poll / fail transitions, added the `Complete Workflow Job (3)` callback after `Supabase Upsert 3`, and pushed those changes to the live cloud workflow with fresh before/after backups. The disposable live proof sequence is now clear:
>
> - execution `34178` for order `W3-WFJ-PROOF-20260326194340-safe-v1` exposed a real live page-poll bug in my first instrumentation pass: `Poll PDFMonkey Image until ready` was still using `$input.first()` in per-item mode, which `n8n` rejected with `Can't use .first() here`. I fixed repo + live immediately and explicitly marked `workflow_jobs.id = 128` / attempt `90` failed through the backend log-event route so that stale disposable run no longer sits in `running`.
> - execution `34179` for order `W3-WFJ-PROOF-20260326194731-safe-v2` proved the new page / cover `provider-submitted` and `poll-tick` events were writing correctly, but it exposed a second live mismatch: `Complete Workflow Job (3)` was looking for `manifestUrl` even though `Supabase Upsert 3` returns `manifest_3_url`. I fixed repo + live again so the completion node accepts persisted `manifest_3_url` / `manifest3Url` / manifest-key fallbacks, then manually replayed the completion callback once to close `workflow_jobs.id = 129` / attempt `91` as `succeeded`.
> - execution `34181` for order `W3-WFJ-PROOF-20260326195258-safe-v3` is the clean proof after both fixes. It finished `success`, `workflow_jobs.id = 130` reached `succeeded`, attempt `92` reached `succeeded`, the event sequence ended with `completed`, the order row is `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`, and both `Complete Workflow Job (3)` and `Mark Previews Ready (3A status)` executed successfully without manual intervention.
>
> Fresh live `W3` backup artifacts from this proof-hardening pass:
>
> - [w3-Book-Assembly.live.before-workflow-jobs-instrumentation-2026-03-26T19-40-46-342Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.before-workflow-jobs-instrumentation-2026-03-26T19-40-46-342Z.json)
> - [w3-Book-Assembly.live.after-workflow-jobs-instrumentation-2026-03-26T19-40-46-342Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.after-workflow-jobs-instrumentation-2026-03-26T19-40-46-342Z.json)
> - [w3-Book-Assembly.live.before-page-poll-fix-2026-03-26T19-46-30-418Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.before-page-poll-fix-2026-03-26T19-46-30-418Z.json)
> - [w3-Book-Assembly.live.after-page-poll-fix-2026-03-26T19-46-30-418Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.after-page-poll-fix-2026-03-26T19-46-30-418Z.json)
> - [w3-Book-Assembly.live.before-complete-manifest-fix-2026-03-26T19-51-19-088Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.before-complete-manifest-fix-2026-03-26T19-51-19-088Z.json)
> - [w3-Book-Assembly.live.after-complete-manifest-fix-2026-03-26T19-51-19-088Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w3-Book-Assembly.live.after-complete-manifest-fix-2026-03-26T19-51-19-088Z.json)
>
> Repo-side verification from this latest `W3` pass:
>
> - `npm --prefix back-end run test:w2-workflow-contracts` passed after tightening the W3 contract to forbid `$input.first()` in the per-item page poll node and require persisted-manifest fallback in `Complete Workflow Job (3)`.
> - the live proof order `W3-WFJ-PROOF-20260326195258-safe-v3` confirms that the repo-centric `W3` export now writes durable submit / poll / completed telemetry and closes the stage job automatically.

> Update — on March 26, 2026 later still: I started the next extraction target after `W2A` hardening by landing the first durable `W3` stage-job slice in repo code and deploying it to the live backend. The current `W3` n8n graph already enters through [`/api/internal/w3/build-assembly-input`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts) and exits through [`/api/webhooks/workflow-3-complete`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-3-complete/route.ts), so I instrumented exactly that start/completion seam without changing the live workflow export yet:
>
> - [w3-assembly-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w3-assembly-jobs.ts) now creates one `w3-book-assembly` `workflow_jobs` row per claimed router run, using `claimedAt` in the logical key so deliberate reruns do not collapse into a single durable identity.
> - [`build-assembly-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts) now claims / starts that stage job and returns the same workflow-job metadata shape already used on `W2A` / `W2B`.
> - [`workflow-3-complete/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-3-complete/route.ts) now best-effort marks the latest active `w3-book-assembly` job succeeded when the `3-manifest` callback lands, including manifest/result snapshot data.
> - [`repository.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/repository.ts) now exposes latest-attempt lookup so completion can close the open attempt cleanly instead of leaving it `running`.
>
> Verification from this pass:
>
> - [`test-workflow-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-workflow-jobs.ts) now covers the `W3` start/completion lifecycle in addition to existing `W2A` / `W2B` cases.
> - [`test-w3-assembly-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-assembly-input.ts) was updated to stub the new job instrumenter so the existing `W3` seam contract still runs fully offline.
> - targeted `eslint` passed on the touched workflow-jobs / `W3` route files.
> - `npm --prefix back-end run test:workflow-jobs` passed.
> - `npm --prefix back-end run test:w3-assembly-input` passed.
> - `npx dotenv -e .env.local -- npm run pages:build` passed.
> - `npx dotenv -e .env.local -- npm run pages:deploy` completed successfully with Pages revision [`c0a93557.little-hero-labs-admin.pages.dev`](https://c0a93557.little-hero-labs-admin.pages.dev).
>
> Historical scope limit of the first `W3` durable slice before the later March 26 export hardening:
>
> - it initially tracked only start and successful completion on the live backend seam
> - later on March 26, that gap was closed by wiring page / cover submit / polling / failure telemetry plus the completion callback into the repo-centric `w3-Book-Assembly` export and proving it live with execution `34181`

> Update — on March 26, 2026 at the end of the follow-up: the March 26 disposable `W2A` replay-hardening pass is now confirmed complete, not just patched. After the second live `SW1` fallback-context fix, fresh top-level execution `34124` on `HduzTWm0ekmrvwrn` finished `success` at `2026-03-26T18:32:45.374Z`, all 13 `w2a-single-pose` jobs for `W2A-TOP-PROD-20260326171410` reached `succeeded`, and the order row finalized on its own to `workflow_step = 2A-complete` / `execution_status = done` with a valid `2a-manifest.json`. I also productized the operator recovery path in repo/admin:
>
> - [w2a-recovery.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w2a-recovery.ts) now centralizes `W2A` replay/finalize inspection logic instead of leaving it only in ad hoc shell scripts.
> - [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w2a-recovery/route.ts) exposes a focused admin API for recent `W2A` recovery candidates plus safe replay/finalize actions.
> - [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w2a-recovery/page.tsx) adds a thin operator console at `/admin/w2a-recovery`.
>
> Latest repo-side verification from that productization pass:
>
> - targeted `eslint` passed for the new recovery lib, API route, admin page, nav update, and home-page alert surface
> - live smoke call through the new recovery lib showed `candidateCount = 0` right now and confirmed `W2A-TOP-PROD-20260326171410` is already healthy / complete (`recommendedAction = none`, `alreadyCompleted = true`)

> Update — on March 26, 2026 later in the day: I continued hardening partial-run replay for disposable order `W2A-TOP-PROD-20260326171410`. The first new live `SW1` patch added a replay-download fallback so missing replay artifacts no longer die immediately in `Download Replay Generated Image`. That changed the live failure from the original replay-404 pattern to a narrower fallback-context bug: top execution `34100` reached fresh child execution `34122`, where the `S3` node's continue-on-error output had stripped most of the original pose item, so `Resolve Base Character Key` failed with `characterPath or characterHash required`. I then patched repo + live `SW1` again to restore the original `Prepare Replay Output` item before sending a missing-artifact case back into normal generation. Fresh live artifacts from these March 26 replay-hardening passes:
>
> - [w2A-SW1-Pose_Generation.live.before-replay-fallback-2026-03-26T18-12-15-831Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w2A-SW1-Pose_Generation.live.before-replay-fallback-2026-03-26T18-12-15-831Z.json)
> - [w2A-SW1-Pose_Generation.live.after-replay-fallback-2026-03-26T18-13-06-185Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w2A-SW1-Pose_Generation.live.after-replay-fallback-2026-03-26T18-13-06-185Z.json)
> - [w2A-SW1-Pose_Generation.live.before-replay-fallback-context-2026-03-26T18-21-37-449Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w2A-SW1-Pose_Generation.live.before-replay-fallback-context-2026-03-26T18-21-37-449Z.json)
> - [w2A-SW1-Pose_Generation.live.after-replay-fallback-context-2026-03-26T18-21-37-449Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w2A-SW1-Pose_Generation.live.after-replay-fallback-context-2026-03-26T18-21-37-449Z.json)
>
> Repo-side hardening from the same pass:
>
> - `claimAndStartW2APoseJob()` now verifies that a replay artifact actually exists in R2 before reusing a succeeded job; if the stored object is missing, repo code now falls back to the live generation path instead of trusting the stale replay envelope.
> - [replay-w2a-order.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/replay-w2a-order.ts) now reports reusable pose jobs based on verified replay artifacts rather than just `status = succeeded`.
>
> Current pause point from this March 26 follow-up:
>
> - the live fallback path is improved twice and the first replay after patch `#1` proved it got far enough to create a fresh top execution `34100`
> - that top execution no longer failed in `Download Replay Generated Image`; it failed later in the fallback path at child execution `34122`
> - the second live patch fixes exactly that stripped-context error path, but as of this handoff I have not yet observed a fresh post-patch top execution after `34100` complete far enough to confirm the next state transition in `workflow_jobs`

> Update — on March 26, 2026: the activation mystery is now substantially explained. `n8n` sent an email saying it was auto-deactivating `w2A-Orchestrator` due to repeated crashes. That fits the earlier evidence that the workflow was flipping from active to inactive without a content change. I patched the repo export and the live workflow entrypoint so `Webhook (Router)` now uses `responseMode = onReceived` and routes directly to `Normalize Router Payload` instead of depending on the separate `Respond to Webhook (Ack)` node at the front of the graph. Live artifacts from that change:
>
> - [w2A-Orchestrator.live.before-webhook-immediate-response-2026-03-26T17-00-46-456Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w2A-Orchestrator.live.before-webhook-immediate-response-2026-03-26T17-00-46-456Z.json)
> - [w2A-Orchestrator.live.after-webhook-immediate-response-2026-03-26T17-02-16-885Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-26/w2A-Orchestrator.live.after-webhook-immediate-response-2026-03-26T17-02-16-885Z.json)
>
> Validation after the patch:
>
> - the live route preflight still passes
> - the webhook now returns the built-in immediate ack `200 {"message":"Workflow was started"}`
> - a deliberately malformed smoke payload now creates a normal `error` execution (`33992`) instead of another `crashed` execution
>
> That does not prove every downstream `W2A` path is perfect, but it does remove the specific front-door crash pattern that was causing `n8n` to auto-deactivate the workflow.
>
> Update — later still on March 25, 2026: I pushed the activation root-cause investigation as far as the currently available access would allow. The useful conclusion is narrower but real: the suspicious flips on `HduzTWm0ekmrvwrn` are activation-only state changes, not workflow-content edits. Comparing the before/after live exports shows `versionId` and workflow content stay constant while `activeVersionId` flips between `null` and the current `versionId`, and `versionCounter` increments without `updatedAt` moving. Repo search also did not find any normal app path or workflow export that deactivates that workflow. What is still missing is historical attribution: the public `n8n` API does not expose audit/history for activation changes, the editor-only `/rest` endpoints reject the API key, and direct `psql` access to the configured `n8n` Postgres host timed out from this environment. To isolate the next occurrence cleanly, I added [watch-w2a-activation.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/watch-w2a-activation.ts) plus [investigate-w2a-deactivation.md](/Users/jeff/Projects/little-hero-books/back-end/scripts/investigate-w2a-deactivation.md). The watcher records baseline + change snapshots with orchestrator state, queue-manager state, webhook references, and recent executions whenever the activation fingerprint changes.
>
> - [watch-w2a-activation.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/watch-w2a-activation.ts)
> - [investigate-w2a-deactivation.md](/Users/jeff/Projects/little-hero-books/back-end/scripts/investigate-w2a-deactivation.md)

> Update — later on March 25, 2026: after adding a safe preflight check, I found that `HduzTWm0ekmrvwrn` had become inactive again even though the repo route had been restored earlier in the day. I captured fresh before-backups, confirmed the workflow content `versionId` was unchanged while `active` had flipped to `false`, saw queue-manager execution `33760` fail with `404 Active version not found for workflow with id "HduzTWm0ekmrvwrn"`, then reactivated `HduzTWm0ekmrvwrn` again via API and reran the safe preflight successfully. New artifacts from this follow-up:
>
> - [check-w2a-live-route.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/check-w2a-live-route.ts)
> - [w2A-Orchestrator.live.before-investigate-inactive-2026-03-25T211953Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.before-investigate-inactive-2026-03-25T211953Z.json)
> - [w1.1-Queue_Manager_and_Router.live.before-investigate-inactive-2026-03-25T211953Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w1.1-Queue_Manager_and_Router.live.before-investigate-inactive-2026-03-25T211953Z.json)
> - [w2A-Orchestrator.live.after-reactivate-investigation-2026-03-25T212505Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.after-reactivate-investigation-2026-03-25T212505Z.json)

> Update — later again on March 25, 2026: I traced the remaining disposable-order failures after the route cleanup. Execution `33668` was just a malformed smoke payload (`{ smoke: ... }`) and not a repo workflow bug. The more important issue is that later top-level `W2A` executions such as `33671`, `33698`, and `33715` landed in `crashed` even though downstream pose jobs continued. For disposable order `W2A-TOP-PROD-20260325145300`, all 13 `w2a-single-pose` jobs reached `succeeded` and the `2a-manifest.json` existed, but the order row stayed stuck at `workflow_step = order_intake` / `execution_status = error_requires_manual_review` because the top-level completion callback never advanced the row. I added [reconcile-w2a-completion.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/reconcile-w2a-completion.ts) as a dry-run/apply recovery path for exactly that state and used it to finalize `W2A-TOP-PROD-20260325145300` safely through the existing [workflow-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2a-complete/route.ts). Earlier disposable order `W2A-TOP-PROD-20260325143935` is still not safe to finalize because only 2 of its 13 pose jobs succeeded and 11 remain queued.

> Update — later once more on March 25, 2026: I finished the replay/recovery hardening pass for partial `W2A` runs. Repo code now exposes replay metadata for already-succeeded `w2a-single-pose` jobs in [w2a-pose-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts) and [build-pose-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/build-pose-input/route.ts), and the repo `SW1` export now short-circuits Gemini when a pose job is already succeeded by returning the stored artifact envelope through [w2A-SW1-Pose_Generation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json). I also added [replay-w2a-order.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/replay-w2a-order.ts) as a dry-run/apply operator replay tool. Because the live backend route is not yet deployed with the new replay fields, I patched live `SW1` to branch on the already-live `workflowClaimed = false` plus `workflowJobStatus = succeeded` contract as well. Using that live `SW1` gate plus repeated safe replays, disposable order `W2A-TOP-PROD-20260325143935` advanced from `2 succeeded / 11 queued` to all 13 `w2a-single-pose` jobs in `succeeded`, and then I finalized it safely with [reconcile-w2a-completion.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/reconcile-w2a-completion.ts). That order row is now `workflow_step = 2A-complete` and `execution_status = done`. I also confirmed the `n8n` activation endpoint is `POST /api/v1/workflows/{id}/activate`, reactivated `HduzTWm0ekmrvwrn` again after testing it, and reran [check-w2a-live-route.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/check-w2a-live-route.ts) successfully.

## Current objective

Carry forward the now-proven `workflow_jobs` control-plane work after both repo-centric `W2B` and repo-centric `W2A` have succeeded through live provider-backed top-level runs.

The original instrumentation objective is complete enough to stop treating `W2A` as a live proof gap. The workstream now shifts from proving the control-plane on `W2A` / `W2B` to preserving the corrected live route state, understanding one unexpected deactivation, and choosing the next extraction target.

## Exact pause point

As of March 25, 2026 in Los Angeles time:

- the disposable live repo-centric `W2A` proof order `W2A-TOP-PROD-20260325150228` finished successfully
- top-level live `W2A` execution `33588` on workflow `HduzTWm0ekmrvwrn` finished `success` at `2026-03-25T15:19:31.400Z`
- the proof order row is now:
  - `workflow_step = 2A-complete`
  - `execution_status = done`
  - `current_workflow = null`
  - `manifest_2a_url = https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/W2A-TOP-PROD-20260325150228/manifests/2a-manifest.json`
- all 13 `w2a-single-pose` workflow jobs for that proof order reached `succeeded` with one attempt each
- the top-level `W2A` tail also succeeded:
  - `Write Run Manifest1`
  - `Prepare Build 2A Manifest Body`
  - `Build + Upload 2A Manifest`
  - `Prepare 2A Completion Upsert Body`
  - `Supabase — Upsert from 2A Manifest`
- later disposable order `W2A-TOP-PROD-20260325145300` exposed a different operational issue:
  - all 13 `w2a-single-pose` jobs reached `succeeded`
  - `https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/W2A-TOP-PROD-20260325145300/manifests/2a-manifest.json` existed
  - but the order row stayed stuck at `workflow_step = order_intake` until I reconciled it manually through the new recovery script
- earlier disposable order `W2A-TOP-PROD-20260325143935` is now also recovered:
  - repeated live replays only resumed the still-queued poses once the live `SW1` replay gate was patched
  - all 13 `w2a-single-pose` jobs reached `succeeded`
  - [reconcile-w2a-completion.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/reconcile-w2a-completion.ts) then finalized the order safely
  - the order row is now:
    - `workflow_step = 2A-complete`
    - `execution_status = done`
    - `manifest_2a_url = https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/W2A-TOP-PROD-20260325143935/manifests/2a-manifest.json`
- while cleaning up stale workflows, the current repo webhook `https://thepeakbeyond.app.n8n.cloud/webhook/2a-start-repo` unexpectedly returned:
  - `404 Active version not found for workflow with id "HduzTWm0ekmrvwrn"`
- I confirmed the proven repo orchestrator `HduzTWm0ekmrvwrn` had somehow become inactive
- I reactivated `HduzTWm0ekmrvwrn`, rechecked `2a-start-repo`, and it returned `200 {"status":"accepted"}`
- after restoring the repo route, I deactivated the stale legacy `W2A` pair:
  - queue manager `n67NaAC0reqS7YUr`
  - orchestrator `sJogOTPUevnHGEka`
- final live route state is now:
  - active queue manager `TDwc85g03FqPf9D6`
  - active orchestrator `HduzTWm0ekmrvwrn`
  - live webhook `2a-start-repo`
  - inactive legacy queue manager `n67NaAC0reqS7YUr`
  - inactive legacy orchestrator `sJogOTPUevnHGEka`
  - closed legacy webhook `2a-start`

## What is already done

- real provider-backed top-level `W2B` proof was already completed earlier in this thread
- disposable live top-level `W2A` proof is now completed end-to-end through the repo route
- the `workflow_jobs` foundation is live in repo code under [workflow-jobs](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/)
- the `W2A` enqueue / claim / start instrumentation is live in:
  - [resolve-pose-worklist/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/resolve-pose-worklist/route.ts)
  - [build-pose-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/build-pose-input/route.ts)
  - [w2a-pose-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts)
- the `W2A` subworkflow instrumentation and post-submit failure handling are live in:
  - [w2A-SW1-Pose_Generation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json)
- the top-level `W2A` repo orchestrator was slimmed and proven in:
  - [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- the `W2A` completion webhook backend fix is live in:
  - [workflow-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2a-complete/route.ts)
- the safe live-route preflight is now available in:
  - [check-w2a-live-route.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/check-w2a-live-route.ts)
- the safe post-crash `W2A` completion reconciler is now available in:
  - [reconcile-w2a-completion.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/reconcile-w2a-completion.ts)
- the safe partial-run `W2A` replay helper is now available in:
  - [replay-w2a-order.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/replay-w2a-order.ts)
- live backup exports created on March 25, 2026:
  - [w2A-Orchestrator.live.before-reactivate-repo-route.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.before-reactivate-repo-route.json)
  - [w2A-Orchestrator.live.after-reactivate-repo-route.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.after-reactivate-repo-route.json)
  - [w2A-Orchestrator.live.before-deactivate-legacy-2a-start.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.before-deactivate-legacy-2a-start.json)
  - [w2A-Orchestrator.live.after-deactivate-legacy-2a-start.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.after-deactivate-legacy-2a-start.json)
  - [w1.1-Queue_Manager_and_Router.live.before-deactivate-legacy-2a-start.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w1.1-Queue_Manager_and_Router.live.before-deactivate-legacy-2a-start.json)
  - [w1.1-Queue_Manager_and_Router.live.after-deactivate-legacy-2a-start.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w1.1-Queue_Manager_and_Router.live.after-deactivate-legacy-2a-start.json)
  - [w2A-Orchestrator.live.before-investigate-inactive-2026-03-25T211953Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.before-investigate-inactive-2026-03-25T211953Z.json)
  - [w1.1-Queue_Manager_and_Router.live.before-investigate-inactive-2026-03-25T211953Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w1.1-Queue_Manager_and_Router.live.before-investigate-inactive-2026-03-25T211953Z.json)
  - [w2A-Orchestrator.live.after-reactivate-investigation-2026-03-25T212505Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.after-reactivate-investigation-2026-03-25T212505Z.json)
  - [w2A-SW1-Pose_Generation.live.before-replay-hardening-2026-03-25T220734Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-SW1-Pose_Generation.live.before-replay-hardening-2026-03-25T220734Z.json)
  - [w2A-SW1-Pose_Generation.live.after-replay-hardening-2026-03-25T220734Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-SW1-Pose_Generation.live.after-replay-hardening-2026-03-25T220734Z.json)
  - [w2A-SW1-Pose_Generation.live.before-restore-after-api-test-2026-03-25T22-07-35-385Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-SW1-Pose_Generation.live.before-restore-after-api-test-2026-03-25T22-07-35-385Z.json)
  - [w2A-SW1-Pose_Generation.live.after-restore-after-api-test-2026-03-25T22-07-35-385Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-SW1-Pose_Generation.live.after-restore-after-api-test-2026-03-25T22-07-35-385Z.json)
  - [w2A-SW1-Pose_Generation.live.before-live-succeeded-gate-2026-03-25T22-17-54-124Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-SW1-Pose_Generation.live.before-live-succeeded-gate-2026-03-25T22-17-54-124Z.json)
  - [w2A-SW1-Pose_Generation.live.after-live-succeeded-gate-2026-03-25T22-17-54-124Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-SW1-Pose_Generation.live.after-live-succeeded-gate-2026-03-25T22-17-54-124Z.json)
  - [w2A-Orchestrator.live.before-reactivate-after-api-probe-2026-03-25T22-24-12-942Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.before-reactivate-after-api-probe-2026-03-25T22-24-12-942Z.json)
  - [w2A-Orchestrator.live.after-reactivate-after-api-probe-2026-03-25T22-24-12-942Z.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-25/w2A-Orchestrator.live.after-reactivate-after-api-probe-2026-03-25T22-24-12-942Z.json)

## Immediate next steps

1. Treat the `W2A` / `W2B` workflow-jobs proof objective as complete.
2. Decide whether the next work item is:
   - run [watch-w2a-activation.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/watch-w2a-activation.ts) long enough to catch the next unexpected flip and attribute its timing, or
   - deploy the same replay-artifact verification semantics that now exist in repo code so live backend behavior no longer depends only on the patched `SW1` fallback, or
   - move the same durable job-control pattern into the next extraction target on top of the now-landed operator recovery surface such as `W3`
3. Before changing live `n8n` again, keep exporting before/after backups exactly like the March 25 cleanup did.
4. If another disposable live proof is needed, use the active repo route only:
   - queue manager `TDwc85g03FqPf9D6`
   - orchestrator `HduzTWm0ekmrvwrn`
   - webhook `2a-start-repo`

## Best source-of-truth docs

- [handoff-2026-03-25-w2a-live-proof-cleanup.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-25-w2a-live-proof-cleanup.md)
- [handoff-2026-03-24-workflow-jobs-w2b.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-24-workflow-jobs-w2b.md)
- [handoff-2026-03-19-w2b-next.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md)
- [repo-job-control-foundation-plan.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)
- [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- [w2A-SW1-Pose_Generation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json)
- [workflow-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2a-complete/route.ts)
- [w2a-pose-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts)
- [w2a-recovery.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w2a-recovery.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w2a-recovery/route.ts)
- [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w2a-recovery/page.tsx)

## Open blockers / waiting items

- There is no active `W2A` / `W2B` proof blocker right now.
- The unexplained item is operational: `HduzTWm0ekmrvwrn` was found inactive on March 25, 2026 even though the repo route had already been proven, and it flipped inactive again later the same day. I could isolate that this is an activation-state toggle rather than a workflow-content edit, but I still cannot attribute what actor performed the toggle from the public API alone.
- [watch-w2a-activation.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/watch-w2a-activation.ts) is now the capture path for the next occurrence; it writes baseline + change JSON artifacts under the live-backups folder with recent orchestrator and queue-manager executions.
- The second operational gap is now mitigated, not eliminated: later top-level `W2A` executions after `33588` can still end in `crashed` and fail to advance the order row even when the `2a-manifest.json` exists and child `workflow_jobs` succeeded, but there is now a working operator path:
  - [replay-w2a-order.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/replay-w2a-order.ts) to resume only the remaining queued poses on a partial order
  - [reconcile-w2a-completion.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/reconcile-w2a-completion.ts) to finalize orders whose `2A` pose jobs are all `succeeded`
  - [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w2a-recovery/page.tsx) to let operators inspect current `W2A` recovery candidates without dropping straight into SQL
  - live `SW1` now branches around Gemini for already-succeeded pose jobs using the existing `workflowClaimed = false` / `workflowJobStatus = succeeded` contract
- There is now a thin `W2A` operator recovery UI, but there is still no broad stage-agnostic `workflow_jobs` operations UI; deeper live inspection still depends on SQL / Supabase plus `n8n` execution inspection.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Remote: `origin/main`
- Worktree is still dirty
- No PR is open from this working state
- This turn changed docs, added replay hardening in backend code plus `SW1`, added [replay-w2a-order.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/replay-w2a-order.ts), recovered disposable order `W2A-TOP-PROD-20260325143935` to `2A-complete`, and updated live `n8n` `SW1` plus orchestrator activation state
- Repo verification run in this turn:
  - `npm --prefix back-end run test:w2a-pose-input`
  - `npm --prefix back-end run test:workflow-jobs`
  - `npm --prefix back-end run test:w2-workflow-contracts`
  - `npm --prefix back-end run check:w2a-live-route`

## Recommended opening prompt for the next chat

Continue from `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-25-w2a-live-proof-cleanup.md`. Treat `W2A` and `W2B` workflow-jobs proofing as complete and treat the live route as currently restored on `TDwc85g03FqPf9D6 -> HduzTWm0ekmrvwrn -> 2a-start-repo`. The March 25 replay/completion recovery pass is now done: `W2A-TOP-PROD-20260325143935` has been recovered to `2A-complete`, live `SW1` short-circuits already-succeeded pose jobs, and the operator tools are [replay-w2a-order.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/replay-w2a-order.ts), [reconcile-w2a-completion.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/reconcile-w2a-completion.ts), and [watch-w2a-activation.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/watch-w2a-activation.ts). The activation investigation already isolated the failure class to an activation-only toggle rather than a workflow-content edit; the next job is to leave the watcher running long enough to capture the next flip with execution context, or move on to productizing operator visibility / UI rather than SQL plus scripts.
