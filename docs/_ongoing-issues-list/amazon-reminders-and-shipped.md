# Amazon: Reminder Messages & Shipped Notification

**Status:** Implemented. Reminders run inside the existing router cron; shipped notification runs from the Lulu webhook.

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

**Summary**

| Feature              | Auto? | Where |
|----------------------|-------|-------|
| Initial preview      | Yes   | “Send for Customer Approval” → `POST /api/orders/[orderId]/final-approval`. |
| Day-1 / Day-2 / auto-approval reminder | Yes | Router cron (`/api/cron/router`) runs daily and calls `processPreviewReminders`. |
| Shipped notification | Yes (if enabled) | Lulu webhook (`/api/webhooks/lulu/status`) when status is SHIPPED and `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true`. |
