# Errors, Visibility, Resolution, and Supabase Status Updates (Merged)

**Merged from:**
- #04 `docs/_ongoing-issues-list/04-fix-orders-not-showing-with-errors.md`
- #05 `docs/_ongoing-issues-list/05-audit-error-resolution-system.md`
- #12 `docs/_ongoing-issues-list/12-supabase-status-updates-investigation.md`

**Status:** 🟡 Needs Audit / In Progress
**Priority:** High
**Created:** 2026-01-27
**Last Updated:** 2026-02-05

---

## Overview

We need one coherent system where:
- Errors are **detected** consistently (workflows + backend + cron)
- Errors are **stored** with sufficient context (Supabase + manifests/logs)
- Errors are **visible** in the admin UI (orders list + order detail)
- Errors are **actionable** (clear recovery/resolution paths)
- Workflow “status fields” in Supabase are **updated reliably**, so the router + UI don’t misclassify orders (e.g., “Not Picked Up” when W4 already created a Lulu job).

---

## Part A — #04 Orders with errors not showing (visibility)

### Problem
Orders with identified errors do not appear on the orders page, creating an operational blind spot.

### Impact
- Critical visibility issue
- Error resolution blocked
- Orders may be stuck without awareness

### Likely root causes
- **Filter logic too restrictive** (orders with `execution_status='error'` excluded)
- **Error state not properly set** (errors exist but aren’t stored in expected columns)
- **Query/pagination/sorting** hides error orders
- **UI choice** hides error states (bad default)

### Affected areas
- `back-end/src/app/orders/page.tsx`
- `back-end/src/app/orders/[orderId]/page.tsx`
- `back-end/src/lib/order-mapper.ts`
- Supabase list/query logic

### Proposed fixes
- Show error orders by default OR add a toggle/filter
- Ensure Supabase queries include error states
- Make error orders visually distinct
- Provide quick access to error details + resolution actions

---

## Part B — #05 Audit error + resolution system (end-to-end)

### Audit checklist

#### 1) Error detection
- [ ] Inventory where errors can occur (n8n, backend API routes, cron router, webhooks)
- [ ] Enumerate error types and ensure coverage
- [ ] Distinguish transient vs permanent errors

#### 2) Error storage
- [ ] Identify canonical fields (`execution_status`, `error_type`, `error_message`, retry metadata, flags)
- [ ] Ensure context is preserved (timestamps, request IDs, workflow IDs)
- [ ] Ensure errors are queryable/searchable

#### 3) Error visibility
- [ ] Verify errors appear in orders list + detail
- [ ] Ensure errors aren’t filtered/hidden accidentally
- [ ] Add aggregation (counts by error type) where useful

#### 4) Error resolution
- [ ] Document current recovery actions (reset, regenerate 2A/2B/3/4, manifest repair, shipping normalize, etc.)
- [ ] Ensure resolution is tracked (who/when/how)
- [ ] Ensure resolved errors don’t linger in “action required”

#### 5) Notifications
- [ ] Confirm who gets notified (email/Slack/etc.) and when
- [ ] Avoid alert fatigue; make alerts actionable

#### 6) Patterns & prevention
- [ ] Identify recurring failures
- [ ] Add guardrails / preflight checks

### Known issues (from original docs)
- 🔴 Orders with errors not showing (see Part A)
- 🔴 Resolution paths unclear
- 🟡 Error context may be lost
- 🟡 No error aggregation/reporting

---

## Part C — #12 Supabase status updates not set (routing + fulfillment fields)

### What you’re seeing
- Orders stuck in `ready_for_processing` with “Not Picked Up” (31 min → 6+ days), often `next_workflow: 4`.
- Many Supabase fields remain NULL/empty: `print_submitted_at`, `print_fulfillment_started_at`, `tracking_number`, `carrier`, `shipped_at`, `final_book_url`, `cover_image_url`, `human_reviewed_at`, `validated_at`, `quality_score`.
- Some orders have `lulu_job_id` and `lulu_status: CREATED`, but `print_submitted_at` stays NULL.

### Source of truth: who sets what
| Field(s) | Set by | When |
|---|---|---|
| `lulu_job_id`, initial `lulu_status` | W4 (n8n) | When W4 creates Lulu job + PATCHes Supabase |
| `print_submitted_at` | W4 (n8n) (or a backend webhook W4 calls) | When job is submitted |
| `print_fulfillment_started_at` | W4 (n8n) | At fulfillment start |
| `lulu_status` (later), `tracking_number`, `carrier`, `shipped_at`, `tracking_url`, `print_fulfillment_finished_at` | Backend `POST /api/webhooks/lulu/status` | When Lulu sends status updates |
| `final_book_url`, `cover_image_url` | Backend `POST /api/webhooks/workflow-3-complete` | When W3 completes |
| `execution_status`, `current_workflow`, `started_at` | Router (cron) + n8n “Mark as Processing” | Queue claim + workflow start |
| `validated_at`, `quality_score`, `validation_errors` | (Unclear / legacy) | Not set by current backend routes |

### Why “Not Picked Up” happens for W4 orders
Router cron filters W4 eligibility so orders with `lulu_job_id` or `lulu_status` are **not routed to W4 again**. If `execution_status` remains `ready_for_processing`, the UI flags them as “Not Picked Up” even though they’re intentionally excluded.

### Why fulfillment fields stay NULL
- W4 nodes may not PATCH the correct snake_case columns
- Webhooks may not be registered/called, or fail to match the order (e.g., can’t find by `lulu_job_id`)
- W3 complete webhook may not be called

### Recommended fixes
- [ ] Ensure W4 sets `execution_status` out of `ready_for_processing` once Lulu job is created (or call a backend webhook that does)
- [ ] Confirm W4 PATCH bodies include `print_submitted_at` and `print_fulfillment_started_at` (snake_case)
- [ ] Verify Lulu webhook subscription points to the deployed backend URL (`/api/webhooks/lulu/status`)
- [ ] Verify workflow-3-complete webhook is being called and succeeds
- [ ] Ensure required columns exist (apply print fulfillment timestamp migrations if needed)
- [ ] One-time cleanup: set `execution_status='done'` (or a dedicated state) for orders that have `lulu_job_id` but are stuck as “Not Picked Up”

### Quick checks
- W4 workflow: does “Supabase: mark submitted/start” include the correct columns?
- Backend logs: Lulu webhook received + successfully updated?
- Router logs: is the order excluded because `lulu_job_id`/`lulu_status` exists?

---

## Implementation notes / pointers
- Router W4 eligibility filter: `back-end/src/app/api/cron/router/route.ts` (W4 orders with Lulu fields are filtered)
- Orders list fetch: `back-end/src/app/api/orders/route.ts` and `back-end/src/app/orders/page.tsx`
- Status derivation: `back-end/src/lib/status-service.ts` and `back-end/src/lib/status-display.ts`

---

## Next steps (single consolidated checklist)
- [ ] Confirm error orders are always visible (or add toggle)
- [ ] Define canonical error schema + where each error type is written
- [ ] Ensure every workflow completion updates `execution_status` appropriately
- [ ] Ensure W4 sets print timestamps (either directly or via backend webhook)
- [ ] Add/verify webhooks (Lulu status + workflow complete)
- [ ] Add minimal reporting (counts by error_type, stuck processing, not picked up)
