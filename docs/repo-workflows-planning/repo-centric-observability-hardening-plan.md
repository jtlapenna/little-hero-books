# Repo-Centric Observability Hardening Plan

## Summary

- The repo-centric workflow path is now proven across `W2A`, `W2B`, `W3`, `W4`, and `W4.1`.
- The next observability problem is not “do we have any logs?” It is “do operators have one canonical, durable run history that joins repo jobs, `n8n` orchestration, and provider lifecycle changes?”
- The best strategy is to make `workflow_jobs` the shared event spine, keep the dedicated `W4` / `W4.1` pages as curated operational views, and mirror external lifecycle signals into the same canonical timeline.

## Current surfaces

### 1. Durable repo job records

The current repo-centric path already writes durable execution state through:

- [`workflow_jobs`](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql)
- [`workflow_job_attempts`](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql)
- [`workflow_job_events`](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql)
- event-ingest route [`log-event/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts)

Strengths:

- append-only event breadcrumbs
- durable attempt state
- external provider ids and payload snapshots
- terminal-state protection against late regressions

### 2. Shared job monitor

The shared monitor backend exists in:

- [`workflow-jobs-monitor.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs-monitor.ts)
- [`/api/admin/workflow-jobs`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/workflow-jobs/route.ts)
- [`/admin/workflow-jobs`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx)

Strengths:

- cross-stage list and inspection backend already exists
- works well for order/job inspection and recent event history

Current gap:

- the shared UI is still staged and worded mainly around `2A`, `2B`, and `W3`
- [`STAGE_OPTIONS`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx) currently omit `W4` and `W4.1`, even though those stages now have real durable job activity

### 3. Dedicated print operator pages

Dedicated print surfaces exist for:

- [`/admin/w4-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-recovery/page.tsx)
- [`/admin/w41-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w41-recovery/page.tsx)
- [`/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-production/page.tsx)
- [`/admin/w41-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w41-production/page.tsx)

Strengths:

- these pages are better operator surfaces for print-specific actions than the generic job console
- they expose preflight, approval, replay safety, and grouped inspection in business terms

Current gap:

- they are curated operational views, not the canonical cross-stage event timeline
- operators still have to mentally join these views with the shared workflow-job history

### 4. Lulu webhook audit log

Lulu lifecycle delivery is durably recorded in:

- [`lulu_webhook_log`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/lulu/status/route.ts)
- webhook handler [`lulu/status/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/lulu/status/route.ts)

Strengths:

- independent proof that webhooks reached the backend
- useful for refresh-vs-webhook debugging

Current gaps:

- this log is parallel to `workflow_job_events`, not part of the same canonical event stream
- single-order `W4` production preflight now surfaces webhook freshness, but grouped `W4.1` production preflight does not yet expose equivalent freshness state

## Audit findings

### What is already strong

1. Repo-centric execution failures are durably logged and operator-visible.
2. Print-specific operator pages are materially better than debugging in `n8n` first.
3. Post-submit Lulu lifecycle can already be reconciled from webhook logs plus admin refresh.

### What is still weak

1. Observability is split across three places:
   - shared `workflow_jobs`
   - dedicated `W4` / `W4.1` admin pages
   - `lulu_webhook_log`
2. The shared workflow-jobs UI is not yet a first-class console for `W4` / `W4.1`.
3. External provider lifecycle changes are not uniformly mirrored into `workflow_job_events`.
4. Correlation is present but not enforced uniformly across:
   - `workflow_job_id`
   - `attempt_id`
   - `order_id`
   - `root_group_id`
   - `n8n` execution id
   - provider request id / Lulu job id
5. There is no clear alerting/watchdog layer for:
   - `retry_waiting`
   - `dead_lettered`
   - stale polling
   - missing/stale Lulu webhooks

## Recommended robust strategy

### 1. Make `workflow_jobs` the canonical event spine

Do not create another parallel logging system.

Use the existing durable control-plane tables as the single canonical run history:

- `workflow_jobs` = logical run
- `workflow_job_attempts` = execution tries
- `workflow_job_events` = append-only timeline

Rule:

- every repo-centric stage transition and every important provider lifecycle change should be representable as a `workflow_job_event`

### 2. Mirror external lifecycle into the same event stream

The most important missing join is post-submit provider lifecycle.

Recommendation:

- when Lulu webhook state changes arrive, keep writing `lulu_webhook_log`, but also append normalized `workflow_job_events`
- use stable event types such as:
  - `provider-status-updated`
  - `provider-status-stale`
  - `provider-webhook-missing`
  - `provider-canceled`
  - `provider-rejected`

That preserves `lulu_webhook_log` as raw audit evidence while making the shared workflow-job timeline the operator-facing source of truth.

### 3. Standardize a correlation envelope for all events

Every important event payload should include the same join keys when available:

- `stage`
- `jobType`
- `workflowJobId`
- `attemptId`
- `orderId`
- `rootGroupId`
- `n8nExecutionId`
- `externalProvider`
- `externalRequestId`
- `luluJobId`
- relevant manifest/artifact keys

This matters more than adding new dashboards. Without a consistent envelope, every UI remains harder to trust.

### 4. Upgrade the shared admin console instead of replacing it

Recommended next UI step:

- extend [`/admin/workflow-jobs`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx) to treat `W4` and `W4.1` as first-class stages
- add deep links from dedicated print pages back to the canonical workflow-job timeline
- keep the dedicated `W4` / `W4.1` pages as curated action surfaces, not as replacements for the shared run history

### 5. Add a watchdog/alerting layer

The current system is inspectable but mostly passive.

Recommendation:

- add a scheduled checker that looks for:
  - jobs stuck in `claimed`, `running`, or `polling` beyond stage-specific thresholds
  - jobs in `retry_waiting` or `dead_lettered`
  - `W4` / `W4.1` orders whose latest Lulu webhook freshness is `missing`, `stale`, or `error`
- route those signals into a small admin alert surface first; later they can also notify Slack/email if desired

### 6. Add grouped webhook freshness parity

Single-order `W4` already exposes webhook freshness in [`w4-production-preflight.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-production-preflight.ts).

Recommendation:

- add the same grouped freshness summary to [`w41-production-preflight.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w41-production-preflight.ts)
- summarize by `rootGroupId`
- explicitly surface whether the latest Lulu webhook was applied, missing, stale, or errored for the grouped run

## Recommended implementation order

1. Extend the shared workflow-jobs UI/API so `W4` and `W4.1` are first-class filters and inspection targets.
2. Mirror Lulu webhook lifecycle changes into `workflow_job_events`.
3. Add grouped `W4.1` webhook freshness parity.
4. Add a scheduled watchdog for stale or terminally unhealthy repo-centric jobs.
5. Publish a short operator runbook that tells people which surface to use first and when to escalate.

## Practical takeaway

The right answer is not “add more logs everywhere.”

The right answer is:

- keep `workflow_jobs` as the canonical durable event spine
- keep `lulu_webhook_log` as raw provider-delivery evidence
- keep dedicated `W4` / `W4.1` pages as curated operational views
- join them with consistent correlation ids and mirrored provider lifecycle events so operators can trust one canonical run history
