# D2C order confirmation email – where to check

## 1. Supabase: notification_logs

**Where:** Supabase Dashboard → **Table Editor** → select table **`notification_logs`**.

- Each row is one attempt to send an email (or other notification).
- **If there is no row for your test order:** the code never called the email sender (webhook skipped send: wrong platform, missing customer_email, or `execution_status` already updated).
- **If there is a row with `status = 'failed'`:** check `error_message` for the reason (e.g. Resend error).
- **If there is a row with `status = 'sent'`:** the backend did send to Resend; then check Resend dashboard or recipient inbox/spam.

**Useful SQL (Supabase → SQL Editor):**

```sql
-- Last 20 email notification attempts (any order)
SELECT id, order_id, notification_type, status, recipient, error_message, sent_at, created_at
FROM notification_logs
WHERE notification_type = 'email'
ORDER BY created_at DESC
LIMIT 20;
```

```sql
-- Replace YOUR_ORDER_ID with your test order id (e.g. from Stripe metadata or orders table)
SELECT id, order_id, notification_type, status, recipient, error_message, sent_at, created_at
FROM notification_logs
WHERE order_id = 'YOUR_ORDER_ID'
ORDER BY created_at DESC;
```

## 2. Backend logs (where the webhook runs)

Logs appear where your **Next.js backend** is running:

- **Local (`npm run dev` or `next dev` in `back-end/`):**  
  The **same terminal** where you started the server. Look for lines like:
  - `[Webhook Stripe] Confirmation email check: platform=... customer_email=...`
  - `[Webhook Stripe] Order already processed (execution_status=...), skipping email and W0`
  - `[Webhook Stripe] Sending order confirmation email to: ...` / `Order confirmation email sent to: ...`
  - `[Webhook Stripe] Order confirmation email failed: ...`
  - `[D2C Email] Order confirmation skipped: ...`

- **Vercel:**  
  **Vercel Dashboard** → your project → **Logs** (or **Runtime Logs**). Filter by time and search for `Webhook Stripe` or `D2C Email`.

- **Other host (e.g. Railway, Render, Docker):**  
  Whatever captures Node/Next.js stdout (e.g. PM2 logs, container logs, host log aggregation).

## 3. Resend dashboard

**Where:** Resend → **Emails** (Sending).

- Confirms whether the **API** received a send request and whether the message was delivered.
- If nothing appears for the test order, the backend either never called Resend or the request failed before Resend (check `notification_logs` and backend logs).

## Quick checklist

1. Run the `notification_logs` SQL for your `order_id`. No row → webhook path skipped sending. Row with `failed` → use `error_message`.
2. Reproduce the test order and watch **backend logs** at the moment Stripe fires the webhook to see which branch ran (send vs skip and why).
3. Check **Resend** for a corresponding delivery or error for that time.
