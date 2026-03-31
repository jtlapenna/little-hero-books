# Repo-Centric Workflow Operations Runbook

Last updated: March 30, 2026

## Purpose

Use this guide to operate the repo-centric workflow system end to end.

This is the default operating sequence for:

- inspecting repo-centric jobs
- running the repo watchdog
- reviewing alerts
- acknowledging historical noise
- verifying `W4` and `W4.1` Lulu/provider convergence

This guide is intentionally written for fast use during real operations. It is not a design document.

## Start here

If you are actively investigating a workflow issue right now:

1. Open `/admin/workflow-jobs`.
2. Run the watchdog.
3. Review only `open` alerts first.
4. Repair active customer-impacting issues.
5. Acknowledge only historical noise you understand.
6. For print work, confirm `W4` / `W4.1` provider convergence before you stop.

## The short version

If you only remember one thing, remember this:

1. Start in `/admin/workflow-jobs`.
2. Run the watchdog.
3. Review `open` alerts.
4. Acknowledge only historical noise you understand.
5. For print jobs, verify provider convergence in the shared run console first, then use the `W4` / `W4.1` pages for curated print-specific detail.

Do not start in `n8n` unless the shared console and print pages are missing the information you need.

## Quick links

- Shared repo-centric run console: `/admin/workflow-jobs`
- Single-order print inspection: `/admin/w4-production`
- Grouped print inspection: `/admin/w41-production`
- Single-order recovery view: `/admin/w4-recovery`
- Grouped recovery view: `/admin/w41-recovery`

## Which page to use first

| Situation | Start here | Why |
| --- | --- | --- |
| Something seems stuck or failed | `/admin/workflow-jobs` | This is the canonical repo-centric run history and alert surface. |
| You need to inspect a single paid `W4` order | `/admin/w4-production` | Best print-specific preflight and provider detail for single-order print. |
| You need to inspect a single paid `W4.1` sibling group | `/admin/w41-production` | Best grouped print-specific preflight and provider detail. |
| You need to inspect a sandbox-safe `W4` replay candidate | `/admin/w4-recovery` | Curated recovery page, then link back to the shared run console. |
| You need to inspect a sandbox-safe `W4.1` replay candidate | `/admin/w41-recovery` | Curated recovery page, then link back to the shared run console. |
| You are wondering whether to debug in `n8n` | `/admin/workflow-jobs` first | Repo-centric runs should be understood from the backend console before falling back to orchestration traces. |

## What each status means

### Shared alert status

| Alert status | Meaning | Normal operator action |
| --- | --- | --- |
| `open` | Needs review right now | Inspect and decide whether it is real or historical |
| `acknowledged` | Reviewed and intentionally kept visible as known noise/history | Leave it acknowledged unless the situation changes |
| `resolved` | The condition no longer exists | No action needed |

### Shared job status

| Job status | Meaning | Normal operator interpretation |
| --- | --- | --- |
| `queued` | Waiting to start | Usually healthy if recent |
| `claimed` | A worker has claimed the job | Watch only if stale |
| `running` | Worker is actively executing | Watch only if stale |
| `polling` | Waiting on provider progress | Watch only if stale |
| `retry_waiting` | Waiting for retry window | Healthy only if `next_retry_at` is still in the future |
| `succeeded` | Terminal success | Healthy |
| `failed` | Terminal failure | Needs inspection |
| `dead_lettered` | Exhausted retries / terminal unhealthy | Needs inspection |
| `canceled` | Intentionally stopped | Usually healthy if expected |

## Standard operating procedure

### 1. Open the shared run console first

Go to:

- `/admin/workflow-jobs`

Use it as the source of truth for:

- recent runs
- recent event timeline
- provider summary
- open alert summary
- stage-specific filtering

If you know the order id or sibling group id, use the order search in the shared console first.

### 2. Run the watchdog

Use the watchdog control in `/admin/workflow-jobs`.

This refreshes the repo-centric alert picture for:

- stale `claimed`
- stale `running`
- stale `polling`
- overdue `retry_waiting`
- `dead_lettered`
- missing / stale / errored Lulu lifecycle state for real `W4` / `W4.1` submissions

Important:

- the watchdog summary now distinguishes:
  - `condition count`: how many unhealthy conditions it detected during this run
  - `open alert count`: how many alerts are still unresolved after the run
- the `open alerts` list tells you how many issues still require review
- those numbers are not always the same

Example:

- the watchdog may detect 7 historical stale jobs
- but if those 7 alerts are already `acknowledged`, the `open` list should still be `0`

### 3. Review `open` alerts before touching anything else

Filter the alert panel to `open`.

For each alert, answer these questions in order:

1. Is this a real customer-impacting run?
2. Is the job still active now, or is it just an old stale row?
3. Does the order/group state already show a correct terminal outcome?
4. Is this a known historical proof/test/pilot row?

If you cannot answer those questions from the shared console alone, open the order/group-specific page next.

### 4. Decide: repair or acknowledge

#### Repair the job when:

- the job is still active and should not be
- the order/group is still waiting on that run
- provider state has not converged
- a customer-facing workflow is blocked
- the job is `failed` or `dead_lettered` and still matters

#### Acknowledge the alert when:

- the run is historical and already understood
- the job belongs to an old proof/test/pilot sequence
- the order/group already reflects the correct terminal state
- there is no remaining customer impact
- the issue would only create noise if left `open`

Acknowledging is correct when the operator has already reviewed the issue and decided there is nothing left to repair.

Acknowledging is not “ignoring.” It is the formal way to say:

- this was reviewed
- this is known
- this should not stay in the `open` list

### 5. Verify print-provider convergence for `W4` and `W4.1`

After a real or dry-run print event, always check the shared run console first.

Then use:

- `/admin/w4-production` for single-order `W4`
- `/admin/w41-production` for grouped `W4.1`

What you want to see in the shared run console:

- the correct `provider`
- the correct latest Lulu status
- the correct Lulu job id when relevant
- a sensible webhook delivery state
- no unexpected `provider-error`, `provider-missing`, or `provider-stale` left in `open`

#### Healthy non-production print examples

For sandbox or dry-run print jobs:

- provider may be `lulu-sandbox`
- `luluJobId` may be absent or non-production
- webhook delivery should normally show `not_applicable`

#### Healthy real print examples

For real paid print jobs:

- provider should be `lulu`
- `luluJobId` should be present
- latest Lulu status should match the latest known provider state
- webhook delivery should usually show `received`

#### Important current refinement

The watchdog now intentionally suppresses historical `provider-error` alerts for terminal `W4` / `W4.1` jobs when:

- the workflow job is already terminal
- the latest Lulu status is terminal
- the repo-side provider snapshot already matches that terminal Lulu state

That means:

- old rejected/canceled paid pilots should not keep a permanent critical alert open forever
- real unresolved provider errors should still remain visible

## How to inspect a single issue end to end

### A. Shared console path

1. Open `/admin/workflow-jobs`.
2. Search by order id or group id.
3. Read the top inspection summary:
   - order/group row
   - active count
   - failed count
   - stage counts
   - status counts
4. Read the most recent workflow jobs in reverse time order.
5. Check:
   - `status`
   - `latestEvent`
   - `recentEventTypes`
   - `providerSummary`
   - `openAlertSummary`

### B. Print-specific path

If the issue is print-related:

1. Open the matching `W4` or `W4.1` production page.
2. Inspect the order/group.
3. Confirm:
   - whether the run is a real submission or not
   - the latest Lulu status
   - webhook freshness state
   - whether the row is a true paid-pilot candidate or now inspect-only
4. Use the built-in link back to the shared run console to confirm the canonical job history.

## Historical noise patterns that are usually safe to acknowledge

The shared console should stay focused on actionable work.

These patterns are usually historical noise once reviewed:

- old `W2A-TOP-PROD-*` proof/test rows left in `running` or `queued`
- old `W2B-TOP-PROD-*` proof/test rows left in `polling`
- old paid pilot rows whose final order state already converged to:
  - `action_required` after `REJECTED`
  - `cancelled` after `CANCELED`

Do not acknowledge on pattern match alone. First confirm:

- the order/group is old
- the shared console shows no current customer-impacting active path
- the order/group already reflects the expected terminal business state

Important:

- the March 25 `W2A` / `W2B` zombie proof rows now have a dedicated one-time cleanup path in [`ops-cleanup-historical-workflow-zombies.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/ops-cleanup-historical-workflow-zombies.ts)
- do not manually “repair” those rows ad hoc in SQL or by editing alerts first
- if those rows are still present, use the scripted cleanup path so the workflow history stays auditable

## When not to acknowledge

Do not acknowledge an alert if:

- the order/group is current and customer-facing
- the workflow is still actively blocked
- the provider state is still moving and has not converged
- you do not understand what the alert means
- the issue looks new rather than historical

If in doubt, leave it `open`.

## What good looks like

At the end of a clean operator review:

- `open` alerts represent only real unresolved work
- historical proof/test noise is `acknowledged`
- terminal print jobs show converged provider state
- `W4` / `W4.1` pages agree with the shared run console
- you do not need `n8n` to understand what happened in normal cases

## Escalation checklist

Escalate to engineering when any of these are true:

- the shared console and the print-specific page disagree
- a real paid print row shows `provider-error`, `provider-missing`, or `provider-stale` and does not self-heal after watchdog
- an alert keeps reopening after correct acknowledgement
- the order/group state does not reflect the provider’s terminal state
- the shared console cannot explain the issue without dropping to raw database inspection

## Operator checklist

Use this checklist every time:

1. Open `/admin/workflow-jobs`.
2. Run the watchdog.
3. Review `open` alerts.
4. Inspect any order/group still unclear.
5. Repair real active failures.
6. Acknowledge historical noise.
7. For `W4` / `W4.1`, confirm provider convergence.
8. Stop only when the `open` list reflects real unresolved work.

## Related docs

- [Repo Job Control Foundation Plan](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)
- [Repo-Centric Observability Hardening Plan](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-centric-observability-hardening-plan.md)
- [W4 Production Lulu Cutover Plan](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/w4-production-lulu-cutover-plan.md)
- [W41 Production Lulu Cutover Plan](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/w41-production-lulu-cutover-plan.md)
