# Repo-Centric Workflow Ownership Audit

**Purpose:** record, in one place, which Little Hero Books workflow responsibilities are now repo-owned, which still live in `n8n`, which are good candidates to move next, and which should stay as thin workflow orchestration unless or until a broader worker cutover is justified.
**Status:** Current as of 2026-03-31 (America/Los_Angeles)
**Created:** 2026-03-31

Companion docs:

- [repo-job-control-foundation-plan.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)
- [book2-hybrid-move-from-n8n.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/book2-hybrid-move-from-n8n.md)
- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md)

---

## Executive Summary

- The repo-centric model is real and proven live across `W0`, `W2A`, `W2B`, `W3`, `W4`, and `W4.1`.
- The repo now owns most of the **book-specific logic**, manifest shaping, contract enforcement, print-input shaping, and observability.
- `n8n` still owns most of the **orchestration shell**:
  - webhook wrappers
  - fan-out / fan-in
  - waits
  - execute-workflow chaining
  - some provider submit / poll loops
  - some legacy manifest merge / upload tails
- The best remaining extraction targets are not `W1.1`, `W1.5`, `W4`, or `W4.1`.
- The best remaining extraction targets are the still-heavy `W2A` / `W2B` subworkflow slices:
  - `W2A-SW0`
  - `W2A-SW2`
  - `W2A-SW3`
  - the remaining `W2B-sw1` Bria/Gemini QA/upload bundle

## Audit Rules

This audit uses four recommendation buckets:

- `Repo-owned now`
  The important stage logic already lives in repo code.
- `Keep thin in n8n for now`
  The workflow is still a useful orchestration shell and is not the best next extraction target.
- `Good candidate to move next`
  There is still meaningful business logic or provider-shaping logic trapped in workflow code nodes that would be better in typed repo code.
- `Do not move to plain request handlers`
  If this logic ever moves, it should move behind repo workers / job control, not ordinary HTTP request lifetime.

---

## Inventory Snapshot

### Repo-centric workflow copies that exist today

- [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
- [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- [w2A-SW1-Pose_Generation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- [w2B-sw1-single-pose.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)
- [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
- [w4-PRODUCTION-Print_Fulfillment.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json)
- [w4.1-Sibling-Aggregation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json)

### Workflow exports that still do not have a repo-centric copy

- [w1.1-Queue_Manager_and_Router.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w1.1-Queue_Manager_and_Router.json)
- [w1.5-Health_Monitor.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w1.5-Health_Monitor.json)
- [w2A-SW0-Base_Character_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW0-Base_Character_Generation.json)
- [w2A-SW2-Pose_and_Style_QA.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW2-Pose_and_Style_QA.json)
- [w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW3-Upload.json)
- [w4-SANDBOX-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-SANDBOX-Print_Fulfillment.json)

### Missing-copy summary

- `W1.1` and `W1.5` are not missing because the migration stalled. They were intentionally left as operational workflow shells while repo cron/watchdog/job control matured.
- `W2A-SW0`, `W2A-SW2`, and `W2A-SW3` are the most meaningful still-missing repo-centric copies.
- `W4-SANDBOX` likely does **not** need its own repo-centric copy because the repo-owned `W4` path already supports sandbox / dry-run / approval-gated production behavior.

---

## Workflow-By-Workflow Audit

## W0 - Order Intake Validation

- Workflow:
  - [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
- Repo-centric copy:
  - Yes
- Repo-owned now:
  - `1-manifest` building via [build-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w0/build-manifest/route.ts)
  - per-book order upsert via [upsert-order/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w0/upsert-order/route.ts)
  - config-driven book / format / page-plan resolution via [w0-manifest-builder.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w0-manifest-builder.ts)
- Still in `n8n`:
  - webhook wrapper
  - payload normalization shell
  - some local validation / dedication extraction glue
  - binary packaging and `1-manifest` upload shell
- Recommendation:
  - `Repo-owned now`
  - `Keep thin in n8n for now`
- Why:
  - the book kernel has already moved
  - the remaining workflow work is mostly intake glue, not the most valuable next extraction target

## W1.1 - Queue Manager and Router

- Workflow:
  - [w1.1-Queue_Manager_and_Router.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w1.1-Queue_Manager_and_Router.json)
  - [SIBLING - w1.1-Queue_Manager_and_Router.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json)
- Repo-centric copy:
  - No
- Repo-owned now:
  - upstream selection and routing context generation in [cron/router/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/cron/router/route.ts)
  - increasing amounts of manifest-path and book-context derivation before the workflow receives the payload
- Still in `n8n`:
  - webhook receiver
  - route-by-stage branching
  - mark-as-processing calls
  - per-stage prep code nodes
  - triggering `W2A`, `W2B`, `W3`, and `W4`
  - claim verification and some shipping validation side branches
- Recommendation:
  - `Keep thin in n8n for now`
  - `Do not move to plain request handlers`
- Why:
  - this is orchestration, fan-out, and ops glue more than book logic
  - the repo already owns the higher-value upstream router selection
  - replacing `W1.1` is only attractive once a repo-native dispatcher fully replaces workflow fan-out semantics

## W1.5 - Health Monitor

- Workflow:
  - [w1.5-Health_Monitor.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w1.5-Health_Monitor.json)
  - [SIBLING - w1.5-Health_Monitor.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.5-Health_Monitor.json)
- Repo-centric copy:
  - No
- Repo-owned now:
  - cron health scan in [health-monitor/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/cron/health-monitor/route.ts)
  - durable workflow alerts in [workflow-alerts.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-alerts.ts)
  - repo watchdog in [workflow-watchdog.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-watchdog.ts)
  - operator inspection and acknowledgment in [workflow-jobs/page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx)
- Still in `n8n`:
  - legacy stuck / retry / orphan branching
  - some direct order resets / manual-review patching
  - summary alert formatting
- Recommendation:
  - `Keep thin in n8n for now`
  - likely retire or shrink further into repo surfaces instead of creating a new repo-centric workflow copy
- Why:
  - most of the durable observability and alerting value has already moved
  - if more logic moves, it should probably move directly into repo recovery tools, not into another workflow branch tree

## W2A - Orchestrator

- Workflow:
  - [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- Repo-centric copy:
  - Yes
- Repo-owned now:
  - `2a-manifest` bootstrap/build via:
    - [bootstrap-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/bootstrap-manifest/route.ts)
    - [build-run-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/build-run-manifest/route.ts)
  - pose worklist resolution via [resolve-pose-worklist/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/resolve-pose-worklist/route.ts)
  - workflow-job enqueue / claim / tracking via [w2a-pose-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts)
- Still in `n8n`:
  - expand-to-N-poses fan-out
  - execute-workflow chaining across `SW0`, `SW1`, `SW2`, `SW3`
  - result accumulation and orchestration bookkeeping
  - some retry-builder / handoff shell logic
- Recommendation:
  - `Keep thin in n8n for now`
- Why:
  - the top-level value is orchestration, not hidden Book 1 business rules
  - the better next targets are the subworkflows, not the top-level wrapper

## W2A-SW0 - Base Character Generation

- Workflow:
  - [w2A-SW0-Base_Character_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW0-Base_Character_Generation.json)
- Repo-centric copy:
  - No
- Still in `n8n`:
  - base-character prompt shaping
  - hairstyle / skin-tone asset resolution
  - Gemini request construction
  - Gemini submit
  - response extraction
  - upload-key derivation
  - R2 upload shell
- Recommendation:
  - `Good candidate to move next`
  - `Do not move to plain request handlers` for the provider loop itself
- Why:
  - this is still prompt-heavy, book-sensitive, and difficult to test in workflow JSON
  - deterministic prep and result shaping belong in repo code
  - if Gemini submit/poll fully moves, it should move behind repo workers / job control

## W2A-SW1 - Pose Generation

- Workflow:
  - [w2A-SW1-Pose_Generation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json)
- Repo-centric copy:
  - Yes
- Repo-owned now:
  - pose input normalization and prompt-context shaping via [build-pose-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/build-pose-input/route.ts)
  - durable submit / fail / complete event logging into [log-event/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts)
- Still in `n8n`:
  - binary fetch / aliasing shell
  - Gemini request construction
  - Gemini submit
  - response extraction
  - pose artifact upload
  - some replay fallback and mock/test wiring
- Recommendation:
  - `Repo-owned now`
  - remaining body is a `Good candidate to move next`, but not as urgent as `SW0` / `SW2`
- Why:
  - the highest-value prep seam already moved
  - what remains is provider transport and artifact handling, which is useful to move eventually but no longer the biggest book-logic blocker

## W2A-SW2 - Pose and Style QA

- Workflow:
  - [w2A-SW2-Pose_and_Style_QA.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW2-Pose_and_Style_QA.json)
- Repo-centric copy:
  - No
- Still in `n8n`:
  - pose QA request building
  - style QA request building
  - Gemini QA submits
  - response parsing
  - pass/fail combination logic
  - binary reattachment and result packaging
- Recommendation:
  - `Good candidate to move next`
- Why:
  - QA policy is exactly the kind of config-driven, testable logic that should live in repo code
  - it would reduce opaque Gemini prompt / parser logic in workflow JSON
  - it is lower-risk than print extraction and higher-value than polishing already-thin shells

## W2A-SW3 - Upload / Auto-Flip / Canonical Publish

- Workflow:
  - [w2A-SW3-Upload.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w2A-SW3-Upload.json)
- Repo-centric copy:
  - No
- Still in `n8n`:
  - pre-flip upload shell
  - Gemini flip-verdict request build/call
  - auto-flip branch decisions
  - canonical publish finalization
  - some Cloudflare / asset reattachment glue
- Repo-owned adjacent surfaces:
  - [auto-flip-pose/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/auto-flip-pose/route.ts)
  - [workflow-2a-complete/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-2a-complete/route.ts)
- Recommendation:
  - `Good candidate to move next`
  - lower priority than `SW0` and `SW2`
- Why:
  - there is still too much canonical-publish behavior trapped in workflow code
  - but it is less strategically important than getting base generation and QA policy out of workflow JSON first

## W2B - Main Orchestrator

- Workflow:
  - [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- Repo-centric copy:
  - Yes
- Repo-owned now:
  - worklist and skip logic via [build-worklist/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-worklist/route.ts)
  - workflow-job tracking via [w2b-pose-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2b-pose-jobs.ts)
- Still in `n8n`:
  - subworkflow fan-out
  - result collection
  - `2b-manifest` merge shell
  - manifest upload shell
  - completion notification shell
- Recommendation:
  - `Keep thin in n8n for now`
  - later candidate for shrinking the merge/publish tail into repo code
- Why:
  - the current blocker is the heavy single-pose logic, not the top-level wrapper

## W2B-sw1 - Single Pose Background Removal

- Workflow:
  - [w2B-sw1-single-pose.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)
- Repo-centric copy:
  - Yes
- Repo-owned now:
  - initial input normalization via [build-pose-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-pose-input/route.ts)
  - workflow-job logging via [log-event/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts)
- Still in `n8n`:
  - Bria payload construction
  - Bria submit
  - Bria poll loop
  - binary download / compositing
  - Gemini transparency QA request construction
  - Gemini transparency QA submit
  - parse / confidence policy
  - upload prep and R2 upload
- Recommendation:
  - `Good candidate to move next`
  - move the whole single-pose prep + QA + upload bundle together
  - `Do not move to plain request handlers` for Bria submit/poll
- Why:
  - this is still the biggest remaining `W2B` concentration of real logic inside workflow code
  - moving only the raw Gemini POST would be low-value; the whole QA bundle should move together

## W3 - Book Assembly

- Workflow:
  - [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
- Repo-centric copy:
  - Yes
- Repo-owned now:
  - assembly input shaping via [build-assembly-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts)
  - preview plan via [build-preview-plan/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-preview-plan/route.ts)
  - preview provider orchestration via [render-preview-document/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/render-preview-document/route.ts)
  - preview artifact materialization via [materialize-preview-artifact/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/materialize-preview-artifact/route.ts)
  - `3-manifest` building and publish via:
    - [build-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-manifest/route.ts)
    - [publish-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/publish-manifest/route.ts)
  - durable stage-job semantics via [w3-assembly-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w3-assembly-jobs.ts)
- Still in `n8n`:
  - top-level webhook shell
  - remaining execute/wait/callback choreography
  - some thin pass-through adapter nodes preserved from the original graph
- Recommendation:
  - `Repo-owned now`
  - `Keep thin in n8n for now`
- Why:
  - `W3` is already far enough into repo ownership that further extraction is low-value unless the explicit goal is to eliminate the workflow shell entirely

## W4 - Production Print Fulfillment

- Workflow:
  - [w4-PRODUCTION-Print_Fulfillment.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json)
- Repo-centric copy:
  - Yes
- Repo-owned now:
  - print-input shaping via [build-print-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-print-input/route.ts)
  - PDF render/poll/materialize pipeline via:
    - [render-print-document/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/render-print-document/route.ts)
    - [poll-print-document/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/poll-print-document/route.ts)
    - [materialize-print-pdf/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/materialize-print-pdf/route.ts)
  - manifest publish via [publish-print-manifest/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/publish-print-manifest/route.ts)
  - renderer QA prep/evaluation via [run-print-qa/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/run-print-qa/route.ts)
  - submit shaping and approval gating via [build-submit-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-submit-input/route.ts)
  - post-submit persistence via:
    - [print-submitted/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/print-submitted/route.ts)
    - [lulu/status/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/lulu/status/route.ts)
- Still in `n8n`:
  - some token retrieval / submit shell
  - some PDFMonkey / Lulu transport choreography
  - some error/update/notify shell steps
  - the outer paid-print orchestration graph
- Recommendation:
  - `Repo-owned now`
  - `Keep thin in n8n for now`
  - `Do not move to plain request handlers`
- Why:
  - the risky side effects are already protected by repo-owned fail-closed gates
  - full print-cutover is no longer blocked by missing business logic
  - moving the remaining transport shell only makes sense if there is a deliberate repo-worker replacement for high-risk print orchestration

## W4 - Sandbox Print Fulfillment

- Workflow:
  - [w4-SANDBOX-Print_Fulfillment.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/w4-SANDBOX-Print_Fulfillment.json)
- Repo-centric copy:
  - No
- Current state:
  - legacy/final workflow still exists
  - much of the relevant print shaping now already exists in the repo-owned `W4` production path, which supports sandbox and production-dry-run behavior via repo gates
- Recommendation:
  - do **not** create a new dedicated repo-centric sandbox copy unless sandbox behavior diverges materially again
- Why:
  - a second repo-centric `W4` tree would duplicate logic that the current repo-owned `W4` builder already parameterizes

## W4.1 - Sibling Aggregation

- Workflow:
  - [w4.1-Sibling-Aggregation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json)
- Repo-centric copy:
  - Yes
- Repo-owned now:
  - sibling print-input shaping via [build-sibling-print-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-sibling-print-input/route.ts)
  - sibling submit shaping via [build-sibling-submit-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-sibling-submit-input/route.ts)
  - grouped job convergence and post-submit persistence via:
    - [print-submitted/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/print-submitted/route.ts)
    - [w4-sibling-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w4-sibling-jobs.ts)
- Still in `n8n`:
  - sibling fan-in
  - per-sibling PDF render/poll loops
  - grouped QA orchestration
  - Lulu token retrieval and grouped submit transport shell
  - per-row patch / notify shell
- Recommendation:
  - `Repo-owned now`
  - `Keep thin in n8n for now`
  - `Do not move to plain request handlers`
- Why:
  - this is the highest-risk orchestration surface in the system
  - the repo already owns the important grouped business rules and state convergence
  - moving the rest only makes sense as a deliberate repo-worker cutover, not as piecemeal handler extraction

---

## Best Next Extraction Targets

If the goal is to keep reducing `n8n` without destabilizing print or rebuilding orchestration prematurely, the best sequence is:

1. `W2B-sw1` deterministic prep + Gemini transparency QA + upload bundle
2. `W2A-SW0` base-character prep and result shaping
3. `W2A-SW2` pose/style QA bundle
4. `W2A-SW3` canonical publish / auto-flip bundle

Reason:

- these still contain the densest concentrations of review-hostile code-node logic
- they are more book- and prompt-sensitive than the routing/print shells
- they benefit most from typing, fixtures, and tests

## What Should Stay Thin In `n8n` For Now

- `W1.1` queue/routing shell
- `W1.5` health/recovery shell while repo watchdog/admin surfaces continue to mature
- top-level `W2A` and `W2B` orchestrator wrappers
- `W4` and `W4.1` paid-print orchestration shells

Reason:

- these are mostly orchestration and safety envelopes now
- their remaining value is fan-out, wait-state management, and operational control, not hidden book logic

## What Should Not Move To Plain Request Handlers

- Gemini submit/poll loops
- Bria submit/poll loops
- PDFMonkey submit/poll loops
- Lulu submit/poll or grouped paid-print orchestration

If any of those move, they should move behind the repo job-control foundation:

- [workflow-jobs/](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/)
- [workflow-watchdog.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-watchdog.ts)
- [workflow-jobs/page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx)

---

## Bottom Line

- The repo-centric migration already succeeded at moving the book kernel and operational visibility into the repo.
- The remaining `n8n` surface is now mostly orchestration, provider transport, and paid-print safety shell.
- The next sensible repo extractions are still in `W2A` / `W2B`, not in router/health-monitor or print orchestration.
- A missing repo-centric workflow copy is only a problem when it hides meaningful book logic. That is true for `W2A-SW0`, `W2A-SW2`, and `W2A-SW3`. It is mostly **not** true for `W1.1`, `W1.5`, or `W4-SANDBOX`.
