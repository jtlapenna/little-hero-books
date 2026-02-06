# D2C Stripe + Backend + Frontend setup verification

Use this to confirm backend, frontend, and Stripe are aligned so checkout and the confirmation email work.

---

## 1. Backend (`back-end/`)

**Env (e.g. `.env.local`):**

| Variable | Purpose | Example (local) |
|----------|---------|-----------------|
| `SUPABASE_URL` | Order storage | from Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Order insert / webhook read | from Supabase |
| `STRIPE_SANDBOX_SECRET_KEY` or `STRIPE_SECRET_KEY` | Create Checkout Session | `sk_test_...` |
| `STRIPE_SANDBOX_WEBHOOK_SECRET` or `STRIPE_WEBHOOK_SECRET` | Verify webhook signature | From Stripe CLI or Dashboard |
| `D2C_FRONTEND_ORIGIN` | Success/cancel URLs + CORS | `http://localhost:4323` (Astro dev) or `https://www.littleherolabs.com` |
| `RESEND_API_KEY` | Send confirmation email | `re_...` from Resend |
| `D2C_EMAIL_ENABLED` | Allow sending D2C emails | `true` (required in local dev) |

- Checkout creates the order and Stripe session; success/cancel URLs are built as  
  `{D2C_FRONTEND_ORIGIN}/create/processing?order_id=...` and `{D2C_FRONTEND_ORIGIN}/create/checkout`.
- Webhook route: **POST** `{BACKEND_BASE}/api/webhooks/stripe`  
  (BACKEND_BASE = where the Next app runs, e.g. `http://localhost:3001` or `https://admin.littleherolabs.com`).

---

## 2. Frontend (`frontend/`)

**Env (e.g. `.env`):**

| Variable | Purpose | Must match |
|----------|---------|------------|
| `PUBLIC_BACKEND_URL` | Base URL for `/api/checkout/create` and status/processing APIs | Backend base URL and port |

- **Local:** Backend dev runs on **3001**; use `PUBLIC_BACKEND_URL=http://localhost:3001`. Frontend dev runs on **4323**; backend `D2C_FRONTEND_ORIGIN` must be `http://localhost:4323`.
- **Production:** Set to your backend origin (e.g. `https://admin.littleherolabs.com`).

Checkout flow: frontend calls `POST {PUBLIC_BACKEND_URL}/api/checkout/create`, then redirects to `data.stripe_checkout_session_url`. After payment, Stripe redirects to `{D2C_FRONTEND_ORIGIN}/create/processing?order_id=...`.

---

## 3. Stripe – where the webhook should point

The backend expects Stripe to send **checkout.session.completed** (and optionally **payment_intent.succeeded**) to:

- **URL:** `{BACKEND_BASE}/api/webhooks/stripe`
- **Method:** POST
- **Signing secret:** Must match `STRIPE_SANDBOX_WEBHOOK_SECRET` (test) or `STRIPE_WEBHOOK_SECRET` (live) in the **backend** env.

### Local development (Stripe CLI)

- No Dashboard webhook needed for test mode; the CLI forwards events to your machine.
- Run (backend is on port **3001**):

  ```bash
  stripe listen --forward-to http://localhost:3001/api/webhooks/stripe
  ```

- Copy the **webhook signing secret** printed by the CLI (`whsec_...`) into the **backend** `.env.local` as `STRIPE_SANDBOX_WEBHOOK_SECRET`.
- Restart the backend after changing the secret.

### Production

- **Stripe Dashboard** → Developers → Webhooks → Add endpoint.
- **Endpoint URL:** `https://<your-backend-host>/api/webhooks/stripe`  
  e.g. `https://admin.littleherolabs.com/api/webhooks/stripe`.
- **Events:** at least `checkout.session.completed`.
- Copy the **Signing secret** into the backend’s production env as `STRIPE_WEBHOOK_SECRET`.

---

## 4. Quick verification checklist

- [ ] **Backend** runs on **port 3001** (`npm run dev` in `back-end/`) and env has: Supabase, Stripe secret + webhook secret, `D2C_FRONTEND_ORIGIN=http://localhost:4323`, `RESEND_API_KEY`, `D2C_EMAIL_ENABLED=true` (for local).
- [ ] **Frontend** runs on **port 4323** (`npm run dev` in `frontend/`) and `PUBLIC_BACKEND_URL=http://localhost:3001`.
- [ ] **Stripe (local):** `stripe listen --forward-to http://localhost:<BACKEND_PORT>/api/webhooks/stripe`; backend has the CLI’s `whsec_...` as `STRIPE_SANDBOX_WEBHOOK_SECRET`.
- [ ] **Stripe (production):** Webhook endpoint = `https://<backend-host>/api/webhooks/stripe`; backend has Dashboard signing secret as `STRIPE_WEBHOOK_SECRET`.
- [ ] After a test payment, backend logs show `[Webhook Stripe]` and either “Sending order confirmation email to: …” or the reason it was skipped (e.g. “Order already processed” or “platform/customer_email”).
- [ ] Supabase `notification_logs` has a row for the test order (if the send was attempted).

---

## 5. Common mismatches

| Symptom | Check |
|--------|--------|
| Checkout fails or wrong redirect | `D2C_FRONTEND_ORIGIN` (backend) = frontend origin; `PUBLIC_BACKEND_URL` (frontend) = backend URL + port. |
| Webhook 401 / signature errors | Backend `STRIPE_SANDBOX_WEBHOOK_SECRET` = secret from Stripe CLI (local) or Dashboard (prod). |
| Webhook never hits backend | Stripe CLI: `--forward-to` port = backend port. Production: endpoint URL = backend `/api/webhooks/stripe`. |
| No confirmation email | Backend: `D2C_EMAIL_ENABLED=true` (local), `RESEND_API_KEY` set. Check logs for “Skipping confirmation email” or “Order already processed”. |
