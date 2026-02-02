# Notifications and fulfillment fields not updating

This doc covers why **approval reminder** and **shipping notification** messages might not send, and why Supabase fields like `print_submitted_at`, `print_fulfillment_started_at`, `print_fulfillment_finished_at`, `tracking_number`, `carrier`, and `shipped_at` stay empty.

---

## FAQ

### 1. What does the migration SQL do?

The file `database/migration-print-fulfillment-timestamps.sql` **adds five columns** to your `orders` table (only if they don’t already exist):

| Column | Purpose |
|--------|--------|
| `tracking_url` | Stores the shipping tracking URL Lulu sends when status is SHIPPED. |
| `print_fulfillment_started_at` | Set by W4 “Supabase: mark start” when print fulfillment begins. |
| `print_fulfillment_finished_at` | Set by the Lulu webhook when status becomes SHIPPED. |
| `print_submitted_at` | Set by W4 “Supabase: mark submitted” when the job is sent to Lulu. |
| `amazon_shipment_service_level` | Amazon shipping tier so W4 can set Lulu shipping_level. |

It uses `ADD COLUMN IF NOT EXISTS`, so it’s safe to run more than once. Run it in the **Supabase SQL Editor** (Dashboard → SQL Editor → New query → paste the file contents → Run).

---

### 2. Where do I configure the Lulu webhook?

Lulu doesn’t have a “webhook URL” field in a dashboard. **Option A – Backend admin route (easiest):** POST your backend URL + `/api/admin/lulu-webhook-subscribe` (e.g. `https://admin.littleherolabs.com/api/admin/lulu-webhook-subscribe`). No body needed. The route uses `LULU_CLIENT_ID` / `LULU_CLIENT_SECRET`, gets a Lulu token, and subscribes your webhook URL. Set `LULU_WEBHOOK_URL` or `BACKEND_URL` if your webhook URL should differ.

**Option B – Call Lulu's API yourself:** You **register** your URL via their **API** (one-time per environment):

1. **Endpoint:** `POST https://api.lulu.com/webhooks/`  
   (Use your Lulu API base URL, e.g. production vs sandbox.)
2. **Auth:** Your Lulu API credentials (e.g. Bearer token from Lulu OAuth).
3. **Body:**
   ```json
   {
     "url": "https://admin.littleherolabs.com/api/webhooks/lulu/status",
     "topics": ["PRINT_JOB_STATUS_CHANGED"]
   }
   ```
4. After that, Lulu will POST to that URL whenever a print job’s status changes (e.g. to SHIPPED).

See `docs/lulu/LULU_WEBHOOK_AND_W4_PRINT_NOTIFY.md` and `docs/lulu/LULU_ERROR_HANDLING.md` (Webhook Setup) for more detail.

---

### 4. Cron job and router configuration

- **What runs:** The **router** cron calls `GET /api/cron/router`. That route:
  - Checks Supabase for ready orders and capacity.
  - Runs **Amazon orders** processing and **preview reminders** (approval reminder messages).
  - Calls the n8n router webhook when there’s work to do.

- **Where it’s configured:**  
  - **Schedule:** `back-end/vercel.json` — the router is set to `*/1 * * * *` (every minute).  
  - **Auth:** Vercel sends `Authorization: Bearer <CRON_SECRET>` when it invokes the cron. You must set **`CRON_SECRET`** in the Vercel project: **Project → Settings → Environment Variables** (for Production/Preview as needed). The route returns 401 if the header doesn’t match.

- **Vercel plan note:** On the **Hobby** plan, cron can run at most **once per day**. If you’re on Hobby, change the router schedule in `vercel.json` to `"0 0 * * *"` (daily) or `"0 * * * *"` (hourly). On **Pro**, every-minute (`*/1 * * * *`) is allowed.

- **Health monitor:** The other cron, `/api/cron/health-monitor`, is set to run hourly (`0 * * * *`). No change needed unless you want a different schedule.

---

### 5. Where do I look for logs?

- **Backend (Vercel):**  
  - **Vercel Dashboard** → your project → **Logs** (or **Deployments** → select a deployment → **Functions**).  
  - Filter or search for `[LULU WEBHOOK]` for Lulu status callbacks, and `[Cron Router]` for router/preview-reminder runs.
- **Lulu webhook:** Search logs for `[LULU WEBHOOK]` to see “Received payload”, “Order not found”, “Successfully updated order”, or “Update failed”.
- **Preview reminders:** Search for `[Cron Router]` and “Preview reminders” to see processed/sent counts and errors.

---

## Summary of fixes applied

1. **Backend (Lulu webhook)**  
   - Sets `print_fulfillment_finished_at` when status is `SHIPPED`.  
   - Uses only snake_case columns and `tracking_url` so the Supabase update doesn’t fail.

2. **Database**  
   - Run `database/migration-print-fulfillment-timestamps.sql` so the `orders` table has:  
     `tracking_url`, `print_fulfillment_started_at`, `print_fulfillment_finished_at`, and (if missing) `print_submitted_at`.

3. **W4 (n8n)**  
   - **Supabase: mark start** – PATCH only `print_fulfillment_started_at` (snake_case).  
   - **Supabase: mark submitted** – Include `print_submitted_at` in the PATCH body.  
   - Re-import the updated W4 workflow JSON (PRODUCTION and/or SANDBOX) into n8n so these changes are active.

---

## Why shipping fields stay NULL

- **Lulu webhook not called**  
  When Lulu marks a job as SHIPPED, they must POST to your backend. If the webhook URL isn’t set in Lulu’s dashboard or is wrong, your app never receives the event, so `tracking_number`, `carrier`, `shipped_at`, and `print_fulfillment_finished_at` are never updated.

- **Order lookup fails**  
  The webhook looks up the order by `lulu_job_id`. If W4 didn’t save `lulu_job_id` (e.g. “Supabase: mark submitted” failed) or Lulu sends a different job ID format, the lookup returns no row and the update is skipped (webhook still returns 200).

- **Supabase update failed (e.g. wrong column names)**  
  If the webhook sent a column name that doesn’t exist (e.g. camelCase vs snake_case), PostgREST can return 400 and the whole update fails. The code now uses only snake_case and the migration adds any missing columns.

**What to do**

1. Run `database/migration-print-fulfillment-timestamps.sql` on your Supabase DB.  
2. In Lulu, set the webhook URL to:  
   `https://admin.littleherolabs.com/api/webhooks/lulu/status`  
   (or your production backend URL + `/api/webhooks/lulu/status`).  
3. Confirm W4 “Supabase: mark submitted” runs successfully and that `lulu_job_id` is stored on the order.  
4. Check backend logs for `[LULU WEBHOOK]` to see incoming payloads and any “Order not found” or “Update failed” messages.

---

## Why approval reminder messages don’t send

- **Cron not running**  
  Preview reminders run from the **cron router** (`GET /api/cron/router`). If Vercel cron (or your scheduler) doesn’t call this URL with the correct `Authorization: Bearer <CRON_SECRET>`, reminder logic never runs.

- **No eligible orders**  
  Reminders are sent only for orders where:  
  - `customer_approval_status = 'pending'`  
  - `customer_approval_requested_at` is not null  
  - There is an active preview token for the order  

  If `customer_approval_requested_at` is never set (e.g. the step that requests approval doesn’t write it), no reminders are sent.

- **Feature flag / env**  
  Amazon preview messages respect `AMAZON_PREVIEW_NOTIFICATIONS_ENABLED` (or production env). If that’s off and you’re not in production, reminders can be skipped.

**What to do**

1. Ensure the cron job for the router runs every minute (or as intended) with the right `CRON_SECRET`.  
2. Ensure the workflow that sends the initial “approve your preview” message also sets `customer_approval_requested_at` (and `customer_approval_status = 'pending'`) in Supabase.  
3. Set `AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true` if you want Amazon preview reminders in non-production.

---

## Why shipping notification messages don’t send

- **Lulu webhook not received or order not updated**  
  Shipping notifications are sent **from the Lulu webhook** when it receives status `SHIPPED` and successfully updates the order. If the webhook isn’t called or the update fails (see above), no notification is sent.

- **Feature flags**  
  - **Amazon:** “Your book has shipped” via Message Center only runs if  
    `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true`.  
  - **D2C:** Shipped email is sent when `platform === 'd2c'` and `customer_email` is set; no extra env flag.

**What to do**

1. Fix Lulu webhook delivery and Supabase updates (see “Why shipping fields stay NULL”).  
2. Set `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true` for Amazon shipped messages.  
3. For “sent to print” (print-submitted) messages, set `AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED=true` and ensure W4 calls `POST /api/webhooks/print-submitted` after “Supabase: mark submitted”.

---

## Why print_submitted_at and print_fulfillment_started_at stay NULL

- **print_submitted_at**  
  Set by W4 in the **Supabase: mark submitted** node. The workflow JSON was updated to include `print_submitted_at` in the PATCH body. Re-import the updated W4 workflow so this node is used.

- **print_fulfillment_started_at**  
  Set by W4 in the **Supabase: mark start** node. The workflow was changed to send only `print_fulfillment_started_at` (snake_case). The migration adds this column if it’s missing. Re-import the updated W4 workflow.

If your `orders` table uses **camelCase** column names (e.g. `printFulfillmentStartedAt`) instead of snake_case, either:

- Run the migration (it adds snake_case columns) and use the updated W4 (snake_case), or  
- Keep your current schema and revert the “mark start” node to send the camelCase field name your table expects.

---

## W4 and Amazon faster shipping

W4 is set up to send **faster Lulu shipping** when the customer paid for it on Amazon. The **Build Lulu Print Job Payload** node maps Amazon `ShipmentServiceLevelCategory` / `ShipServiceLevel` to Lulu `shipping_level` (e.g. Expedited → EXPEDITED, Priority/Overnight → EXPRESS). The cron Amazon-orders flow stores that value in `orders.amazon_shipment_service_level`, the router passes it to n8n, and the W1.1 **Prep Workflow 4 Orders** node sends it to W4 as `ShipmentServiceLevelCategory` / `ShipServiceLevel`. Run the migration that adds `amazon_shipment_service_level` so the router can select it.

---

## Env vars reference

| Variable | Purpose |
|----------|--------|
| `CRON_SECRET` | Auth for `GET /api/cron/router` (needed for preview reminders). |
| `AMAZON_PREVIEW_NOTIFICATIONS_ENABLED` | Send Amazon preview reminder / auto-approval messages. |
| `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED` | Send “your book has shipped” via Amazon Message Center. |
| `AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED` | Send “your book has been sent to print” via Amazon Message Center. |
