# Supabase status updates not being set — investigation

## What you’re seeing

- **Orders needing attention:** 7 orders with status `ready_for_processing`, reason **“Not Picked Up”**, `next_workflow: 4`, stuck 31 min–6+ days.
- **Supabase columns often NULL/empty:**  
  `print_submitted_at`, `print_fulfillment_started_at`, `tracking_number`, `carrier`, `shipped_at`, `final_book_url`, `cover_image_url`, `human_reviewed_at`, `validated_at`, `quality_score`.
- **Lulu:** Some orders have `lulu_job_id` and `lulu_status: CREATED`, but `print_submitted_at` (and sometimes tracking fields) stay NULL.

This doc maps **who is supposed to set each field** and **why updates might not be happening**, then suggests concrete fixes.

---

## 1. Who sets what (source of truth)

| Field(s) | Set by | When |
|----------|--------|------|
| `lulu_job_id`, `lulu_status` (initial) | **W4 (n8n)** | When W4 creates the Lulu print job and runs “Supabase: mark submitted” (or equivalent PATCH). |
| `print_submitted_at` | **W4 (n8n)** | Same PATCH when job is sent to Lulu. **Backend does not set this** — only the W4 workflow PATCH. |
| `print_fulfillment_started_at` | **W4 (n8n)** | “Supabase: mark start” node at start of print fulfillment. |
| `lulu_status` (later), `tracking_number`, `carrier`, `shipped_at`, `print_fulfillment_finished_at`, `tracking_url` | **Backend** `/api/webhooks/lulu/status` | When Lulu sends status updates (e.g. SHIPPED). |
| `final_book_url`, `cover_image_url` | **Backend** `/api/webhooks/workflow-3-complete` | When W3 calls the webhook after book assembly. |
| `execution_status`, `current_workflow`, `started_at` | **Router (cron)** + **n8n “Mark as Processing”** | Router marks queued; n8n marks processing; workflow-complete webhooks often set back to `done` or leave as-is. |
| `validated_at`, `quality_score`, `validation_errors` | **Not set by current backend** | No routes in the repo update these; may be legacy or n8n-only. |
| `human_reviewed_at`, `human_reviewer` | **Backend (admin/review flows)** | When a human approves a stage; if those flows don’t call the update, these stay NULL. |

So “statuses not updating” can mean:

1. **n8n workflows** not sending the right PATCH (e.g. W4 not including `print_submitted_at` or not setting `execution_status`).
2. **Webhooks** not being called (W3 complete, Lulu status) or failing (auth, 404, wrong column names).
3. **Router** intentionally not picking up some orders (e.g. W4 with `lulu_job_id` already set) while the order is still `ready_for_processing`, so they appear “Not Picked Up”.

---

## 2. Why “Not Picked Up” for W4 orders

The router cron **excludes** an order from being sent to W4 if:

- `lulu_job_id` is set, or  
- `lulu_status` is set  

So:

- If W4 already ran and set `lulu_job_id` / `lulu_status`, the router **correctly** never sends that order to W4 again.
- But if we **never** set `execution_status` to something other than `ready_for_processing` after W4 creates the job, the order stays in the “ready” pool. It then shows up in “orders needing attention” as **Not Picked Up** (queued > 60 min) even though it’s intentionally not supposed to be picked up again.

So one fix is: **when W4 (or the backend) sets `lulu_job_id` (and optionally `lulu_status`), also set `execution_status`** to e.g. `'done'` or a dedicated value like `'print_fulfillment'` so the order is no longer treated as “ready for processing” and doesn’t appear as “Not Picked Up.”

---

## 3. Why fulfillment and Lulu fields stay NULL

- **print_submitted_at**  
  - Set only by **W4** in n8n (Supabase PATCH when job is submitted to Lulu).  
  - If the W4 “Supabase: mark submitted” node doesn’t run, or doesn’t include `print_submitted_at` in the body, it stays NULL.  
  - **Action:** Confirm W4 workflow JSON includes `print_submitted_at` in that PATCH and re-import if needed (see `docs/troubleshooting/notifications-and-fulfillment-fields.md`).

- **print_fulfillment_started_at**  
  - Set by W4 “Supabase: mark start” node.  
  - Same idea: ensure that node runs and uses the correct column name (snake_case).

- **tracking_number, carrier, shipped_at, print_fulfillment_finished_at**  
  - Set by **Lulu webhook** `POST /api/webhooks/lulu/status` when Lulu sends status (e.g. SHIPPED).  
  - If the webhook isn’t registered with Lulu, or Lulu doesn’t call it, or the order can’t be found by `lulu_job_id`, these stay NULL.  
  - **Action:** Verify Lulu webhook URL and subscription; check backend logs for `[LULU WEBHOOK]` and “Order not found” / “Update failed”.

- **final_book_url / cover_image_url**  
  - Set by **workflow-3-complete** webhook when W3 finishes.  
  - If W3 doesn’t call the webhook or the call fails, they stay NULL.

---

## 4. Recommended fixes (concise)

1. **Backend (implemented)**  
   - **Print-submitted webhook** (`POST /api/webhooks/print-submitted`) now updates Supabase when W4 calls it: sets `execution_status = 'done'`, `print_submitted_at = now()`, and clears `started_at` / `current_workflow`. So the order no longer shows as “Not Picked Up” and has a submitted timestamp even if W4’s own Supabase PATCH didn’t include it. W4 must call this webhook after the Lulu job is created (same as before for the customer notification).

2. **W4 (n8n)**  
   - Ensure W4 calls `POST /api/webhooks/print-submitted` after “Supabase: mark submitted” (or after Lulu job is created). The backend now sets `execution_status` and `print_submitted_at`; W4 can still send its own PATCH for `lulu_job_id` / `lulu_status`.

3. **Lulu webhook**  
   - Ensure Lulu is configured to POST to `https://admin.littleherolabs.com/api/webhooks/lulu/status` (or your backend URL) and that the route is deployed.  
   - Ensure `lulu_job_id` is stored when W4 creates the job so the webhook can find the order.

4. **Database**  
   - Run `database/migration-print-fulfillment-timestamps.sql` if not already done so columns like `print_submitted_at`, `print_fulfillment_started_at`, `print_fulfillment_finished_at`, `tracking_url` exist and match what the backend uses (snake_case).

5. **Orders already stuck (W4, lulu_job_id set, “Not Picked Up”)**  
   - For those 7 orders: either  
     - **One-time:** Update in Supabase `execution_status = 'done'` (or your chosen value) where `next_workflow = '4'` and `lulu_job_id IS NOT NULL`, so they drop off “Not Picked Up,” or  
     - **Ongoing:** Implement the W4/backend change above so new orders get `execution_status` set when the Lulu job is created.

---

## 5. Existing docs

- **Fulfillment / Lulu / print timestamps:**  
  `docs/troubleshooting/notifications-and-fulfillment-fields.md`  
  Covers migration, W4 nodes, Lulu webhook setup, and why `print_submitted_at` / tracking fields stay NULL.

- **Router and W4 eligibility:**  
  `back-end/src/app/api/cron/router/route.ts` (around line 319):  
  W4 orders with `lulu_job_id` or `lulu_status` are filtered out and never sent to W4 again.

- **Lulu webhook update logic:**  
  `back-end/src/app/api/webhooks/lulu/status/route.ts`  
  Updates `lulu_status`, `tracking_number`, `carrier`, `shipped_at`, `print_fulfillment_finished_at`, etc., when Lulu sends status changes.

---

## 6. Quick checks

- **W4 workflow:** Inspect the “Supabase: mark submitted” (and “mark start”) node: does the PATCH body include `print_submitted_at`, `print_fulfillment_started_at`, and `execution_status`?
- **Lulu:** Backend logs for `[LULU WEBHOOK]` — “Received payload”, “Order not found”, “Successfully updated”.
- **Router:** Logs for `[Cron Router]` — “No eligible ready orders” vs “Successfully triggered n8n”; confirm whether W4 orders are excluded because of `lulu_job_id`/`lulu_status`.
- **Supabase:** For one order that has `lulu_job_id` but still “Not Picked Up”, set `execution_status = 'done'` and confirm it disappears from the 7; then enforce the same via W4/backend for new orders.
