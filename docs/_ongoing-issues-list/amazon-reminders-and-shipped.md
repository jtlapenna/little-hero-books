# Amazon: Reminder Messages, Shipped & Sent-to-Print Notifications

**Status:** Implemented. Reminders run inside the router cron; shipped runs from the Lulu webhook; sent-to-print runs when n8n W4 calls the print-submitted webhook.

---

## How shipping notifications work

**Yes — they are automatic.** When Lulu’s API sends a status update to our webhook (`POST /api/webhooks/lulu/status`) and the status is **SHIPPED**, the backend:

1. Updates the order in Supabase (e.g. `lulu_status`, `tracking_number`, `tracking_url`, `carrier`, `shipped_at`).
2. Sends the “your book has shipped” message:
   - **Amazon:** via Amazon Message Center (`confirmOrderDetails`) if `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true`.
   - **D2C:** via Resend email if D2C email is enabled.

So the customer is notified automatically when Lulu reports the item as shipped; we do not poll — Lulu pushes to our webhook.

---

## 1. Reminder messages (day-1, day-2, auto-approval) — now automated

**Current state (implemented)**

- **Initial message** is still sent when you click “Send for Customer Approval” (via `POST /api/orders/[orderId]/final-approval`).
- **Reminder-day-1 (24h), reminder-day-2 (48h), and auto-approval message (72h)** are sent automatically by the **existing router cron** (`GET /api/cron/router`). No extra Vercel cron was added.
- **Database:** `orders.preview_reminder_sent` tracks the last reminder sent. Migration: `database/migration-preview-reminder-sent.sql`.
- **Code:** `back-end/src/lib/notifications/process-preview-reminders.ts`; `processPreviewReminders(supabase)` is called from the router cron. Requires `AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true`.
- **Vercel:** You can have many cron jobs per project; we kept reminders inside the router cron so no new cron is required.

---

## 2. Shipped notification — implemented

**Current state**

- The **Lulu webhook** (`POST /api/webhooks/lulu/status`) runs when Lulu sends status updates.
- When `statusName === 'SHIPPED'`, the backend updates the order with `shipped_at`, `tracking_number`, `tracking_url`, and `carrier`.
- **If `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true`**, the backend now calls **`sendAmazonShippedMessage`** after a successful update: sends a “your book has shipped” message via Amazon Message Center (confirmOrderDetails) with tracking URL or tracking number and child name.

**What you need to do**

1. **Run the migration** for reminder tracking (once):  
   `database/migration-preview-reminder-sent.sql` — adds `orders.preview_reminder_sent`.
2. **Reminders:** No new cron. Ensure `AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true` so the router cron sends initial + reminders.
3. **Shipped:** Set `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true` in your backend env (e.g. Vercel/Cloudflare) to enable “your book has shipped” messages when the Lulu webhook receives SHIPPED.

---

## 3. Sent-to-print notification — implemented

When a book is **submitted to Lulu** (W4 has run and `lulu_job_id` is set), we can send the customer a “your book has been sent to print” message with the **preview/approval link** and a note that **the page will update with order status**.

**Flow**

1. n8n W4 (Print Fulfillment) runs, submits to Lulu, then updates Supabase (“Supabase: mark submitted” with `lulu_job_id`).
2. **After** that update, W4 should call our backend:  
   `POST /api/webhooks/print-submitted`  
   Body: `{ "orderId": "<amazon_order_id>" }`  
   Auth: Bearer token (same as other workflow webhooks).
3. The backend loads the order, gets the active preview token, builds the preview URL, and sends:
   - **Amazon:** Message Center text (confirmOrderDetails) if `AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED=true`.
   - **D2C:** Resend email if D2C email is enabled.

**Message content (conceptually)**

- “Good news — [child]’s book has been sent to the printer!”
- Link to the preview/approval page.
- “This page will update with your order status (e.g. when it ships).”

**What you need to do**

1. **n8n W4:** Add an HTTP Request node **after** “Supabase: mark submitted” that calls:
   - URL: `https://admin.littleherolabs.com/api/webhooks/print-submitted`
   - Method: POST
   - Body: `{ "orderId": "{{ $json.orderId or $json.amazon_order_id }}" }`
   - Header: `Authorization: Bearer <your workflow webhook secret>`
2. **Backend env:** Set `AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED=true` to enable Amazon sent-to-print messages (D2C uses existing `D2C_EMAIL_ENABLED` / Resend).

**Summary**

| Feature              | Auto? | Where |
|----------------------|-------|-------|
| Initial preview      | Yes   | “Send for Customer Approval” → `POST /api/orders/[orderId]/final-approval`. |
| Day-1 / Day-2 / auto-approval reminder | Yes | Router cron (`/api/cron/router`) runs daily and calls `processPreviewReminders`. |
| **Sent to print**    | Yes (if W4 calls webhook) | n8n W4 calls `POST /api/webhooks/print-submitted` after “Supabase: mark submitted”; `AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED=true` for Amazon. |
| Shipped notification | Yes (if enabled) | Lulu webhook (`/api/webhooks/lulu/status`) when status is SHIPPED and `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true`. |
