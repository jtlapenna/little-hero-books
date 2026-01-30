# D2C Phase 0: Orders-Only Launch — Implementation Plan

**Purpose:** Full implementation plan for the first D2C ship. Customer can buy one book on the Little Hero Books site (catalog → character → checkout → payment); order is created with `platform = 'd2c'` and flows through the same n8n pipeline to approval and Lulu; D2C notifications use email. No accounts or children tables.

**Master doc:** [D2C-project-overview.md](../D2C-project-overview.md)

**References:**
- [Current system audit](../current-system-audit-findings/current-system-audit-findings.md)
- [API contracts](../lhl_api_contracts_frontend_↔_n_8_n_↔_admin.md)
- [Data schemas](../lhl_data_schemas_accounts_characters_books_orders.md)
- [Scope cutlines](../lhl_scope_cutlines_v_1_launch_vs_v_2_expansion.md)
- [Wireframes](../lhl_wireframe_level_screen_flows_accounts_characters_orders.md)

---

## 1. Implementation Order (Dependencies)

| Step | Workstream | Depends on |
|------|------------|------------|
| 1 | Schema migration (platform, orderId, amazon_order_id nullable) | — |
| 2 | Idempotency storage (table or KV) and middleware | — |
| 3 | Checkout API (create order, no payment yet) | 1, 2 |
| 4 | Stripe webhook (payment success → confirm order, trigger W0) | 1, 2, 3 |
| 5 | W0 payload builder for D2C (used by webhook) | 4 |
| 6 | Notifications: branch on platform; email for D2C | 1 |
| 7 | Storefront UI (catalog → character → customization → checkout) | 3 (API) |
| 8 | Dashboard: My Orders for D2C | 1 (orders with platform) |
| 9 | Admin: filter/label by platform | 1 |

Schema and idempotency can run in parallel. Checkout API and Stripe webhook are the critical path for “order in pipeline.” Notifications and UI can proceed once backend is testable.

---

## 2. Schema / Database

### 2.1 Goals

- Add `platform` to `orders` so backend and notifications can branch (amazon vs d2c).
- Ensure `orderId` exists as business key (D2C uses UUID; Amazon continues to use amazon_order_id as orderId).
- Make `amazon_order_id` nullable for D2C orders (Amazon orders keep it set).

### 2.2 Migration SQL

Create a single migration file (e.g. `database/migration-d2c-phase-0-orders.sql` or under `docs/database/`). Run in order:

```sql
-- D2C Phase 0: Dual-channel orders (platform, orderId, nullable amazon_order_id)
-- Safe to run: ADD COLUMN IF NOT EXISTS; alter constraint only if needed.

-- 2.2.1 Add platform column
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'amazon';

COMMENT ON COLUMN orders.platform IS 'Order origin: amazon | d2c. Used for notifications and reporting.';

-- 2.2.2 Add orderId if not present (business key; D2C = UUID, Amazon = same as amazon_order_id)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "orderId" VARCHAR(100);

COMMENT ON COLUMN orders."orderId" IS 'Business key for order. For Amazon same as amazon_order_id; for D2C use UUID.';

-- 2.2.3 Backfill orderId from amazon_order_id for existing rows (if orderId added)
-- UPDATE orders SET "orderId" = amazon_order_id WHERE "orderId" IS NULL AND amazon_order_id IS NOT NULL;

-- 2.2.4 Make amazon_order_id nullable (required for D2C orders which have no Amazon ID)
-- Only run after confirming unique constraint allows NULL (PostgreSQL allows multiple NULLs on UNIQUE).
ALTER TABLE orders
  ALTER COLUMN amazon_order_id DROP NOT NULL;

-- Optional: unique constraint that allows one NULL (if your PG version supports partial unique index)
-- CREATE UNIQUE INDEX idx_orders_amazon_order_id_not_null ON orders(amazon_order_id) WHERE amazon_order_id IS NOT NULL;
```

**Rollback (if needed):** Re-add NOT NULL to `amazon_order_id` only after ensuring no D2C rows exist (or migrate them). Drop `platform` and `orderId` columns only if unused.

### 2.3 Verification

- [ ] `orders.platform` exists; default `'amazon'`; existing rows unchanged.
- [ ] `orders.orderId` exists; backfilled for existing Amazon orders; new D2C orders get UUID.
- [ ] `orders.amazon_order_id` nullable; existing Amazon rows unchanged; new D2C rows have `amazon_order_id` NULL.
- [ ] Backend `order-mapper` and list/update paths work with `platform` and `orderId` (already coded; confirm Supabase returns new columns).

### 2.4 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T2.1 | Create migration file with above SQL | File in database/ or docs/database/ |
| T2.2 | Run migration on target DB (staging then prod) | Columns exist; no errors |
| T2.3 | Backfill `orderId` for existing orders where null | All Amazon orders have orderId = amazon_order_id |
| T2.4 | Verify backend reads platform/orderId (list + detail) | Admin/API shows platform; D2C orders identifiable |

---

## 3. Idempotency

### 3.1 Goals

- Prevent duplicate order creation when checkout or Stripe webhook is retried.
- Store idempotency keys and return same response for same key within TTL.

### 3.2 Design

- **Endpoints:** Checkout session/create and Stripe webhook handler (payment_intent.succeeded) must be idempotent.
- **Key source:** Checkout: client sends `Idempotency-Key` header (UUID). Stripe: use `payment_intent.id` or `event.id` (Stripe events are idempotent by event ID).
- **Storage:** New table `idempotency_keys` or use existing cache/KV. Recommended: table so backend can reject duplicate key and return stored response.
  - Columns: `key` (text, PK), `response_status` (int), `response_body` (jsonb or text), `created_at` (timestamptz). Optional: `endpoint`, `ttl_hours`.
- **TTL:** 24 hours (keys older than 24h can be purged; same key after 24h is treated as new).
- **Semantics:** First request with key: execute, store 200 + response, return. Subsequent request with same key within TTL: return 200 + stored response (do not re-execute). Optional: 409 if key already used and you want client to distinguish.

### 3.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T3.1 | Create `idempotency_keys` table (key, response_status, response_body, created_at, optional endpoint/ttl) | Migration applied |
| T3.2 | Implement idempotency middleware or helper: check key → if exists return stored; else run handler, store, return | No duplicate order for same key |
| T3.3 | Apply to checkout API (require Idempotency-Key header) | Duplicate POST returns same order_id |
| T3.4 | Apply to Stripe webhook (use event.id or payment_intent.id as key) | Duplicate event does not create second order or double W0 trigger |

---

## 4. Checkout API

### 4.1 Goal

Create a D2C order in Supabase (status: pending payment) and return a Stripe client secret or checkout session URL. After payment, Stripe webhook confirms and triggers W0.

### 4.2 Endpoint

- **POST** `/api/checkout/create` (or `/api/d2c/checkout/create`)
- **Headers:** `Idempotency-Key: <uuid>` (required), `Content-Type: application/json`
- **Request body:**
  - `shipping_address`: { name, address_line1, address_line2?, city, state, postal_code, country }
  - `customer_email`: string
  - `customer_name`: string (optional; can derive from shipping)
  - `character_specs`: object (childName, age, skinTone, hairColor, hairStyle, pronouns, favoriteColor, animalGuide, dedication?, etc.)
  - `dedication`?: string
  - `product_info`?: object (quantity, format, etc.; can default to single book)
- **Response (201):**
  - `order_id`: string (UUID assigned to this order; use as `orderId` in Supabase)
  - `stripe_client_secret` or `stripe_checkout_session_url`: for client to complete payment
  - Optional: `order_id` for display

### 4.3 Behavior

1. Validate body (required: shipping_address, customer_email, character_specs with minimum fields).
2. Check idempotency key; if seen, return stored response.
3. Generate `order_id` = UUID v4.
4. Compute `character_hash` (same algorithm as Amazon path; see existing code).
5. Insert row into `orders`:
   - `orderId` = order_id, `platform` = 'd2c', `amazon_order_id` = NULL
   - `customer_email`, `customer_name`, `shipping_address` (JSONB), `character_specs` (JSONB), `character_hash`, `dedication_text`, `product_info`
   - `status` = 'pending_payment' or 'pending_w0' (choose one; recommend pending_payment until webhook confirms)
   - `execution_status` = 'pending_payment' (or equivalent); `next_workflow` = null until payment confirmed
6. Create Stripe PaymentIntent (or Checkout Session) with amount, currency, metadata { order_id }.
7. Store idempotency key → response (order_id + client_secret or URL).
8. Return 201 with order_id and client_secret (or URL).

### 4.4 Validation Rules

- `customer_email`: valid email format.
- `shipping_address`: required fields present; country = US for Phase 0 (or allow configurable).
- `character_specs`: at least childName, age; recommend skinTone, hairColor, hairStyle, pronouns, favoriteColor, animalGuide.

### 4.5 Error Responses

- 400: validation error (list fields).
- 409: idempotency key already used (optional; or return 200 with stored response).
- 500: Stripe or DB error.

### 4.6 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T4.1 | Implement POST /api/checkout/create (or d2c variant) with validation | 201 + order_id + Stripe secret/URL |
| T4.2 | Persist order with platform='d2c', orderId=UUID, amazon_order_id=NULL | Row in Supabase; router can list it after payment |
| T4.3 | Integrate Stripe SDK (PaymentIntent or Checkout Session) | Client can complete payment |
| T4.4 | Enforce Idempotency-Key; store and replay response | Duplicate key → same response |

---

## 5. Stripe Webhook

### 5.1 Goal

On successful payment, confirm the order in Supabase and trigger n8n W0 with the same normalized payload shape as Amazon (so the rest of the pipeline is unchanged).

### 5.2 Event

- **Event:** `payment_intent.succeeded`
- **Handler:** Verify Stripe signature (use `STRIPE_WEBHOOK_SECRET`), parse body, get `payment_intent`; read `metadata.order_id`; load order from Supabase by `orderId`; if not found or already confirmed, return 200 (idempotent). Otherwise: update order (`status` = pending_w0 or ready_for_processing, `execution_status` = 'pending_w0', `next_workflow` = null, `purchase_date` = now, set any payment fields); build W0 payload; POST to N8N_W0_WEBHOOK_URL; store idempotency by `event.id` and return 200.

### 5.3 Idempotency

- Use `event.id` as idempotency key (Stripe sends same event on retry). If key seen, return 200 without re-running.

### 5.4 Order Update

- Set `execution_status` = 'pending_w0', `next_workflow` = null (W0 will set one_manifest_url and then router will set next_workflow), `status` = 'pending_w0' or 'queued_for_processing', `purchase_date` = now. Optional: store `stripe_payment_intent_id` if column exists.

### 5.5 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T5.1 | Add route POST /api/webhooks/stripe (or similar) | Receives Stripe events |
| T5.2 | Verify signature with STRIPE_WEBHOOK_SECRET | Reject forged requests |
| T5.3 | Handle payment_intent.succeeded: load order by metadata.order_id, update order, build W0 payload, call N8N_W0_WEBHOOK_URL | Order moves to pending_w0; W0 runs |
| T5.4 | Idempotency by event.id | Duplicate event does not double-update or double-trigger W0 |

---

## 6. W0 Payload (D2C)

### 6.1 Goal

The payload sent to n8n W0 for D2C must match the **normalized shape** that W0 already accepts (same as Amazon path), except: no `amazon_order_id`, no `marketplaceId`. n8n uses `orderId` as primary identifier; W0 builds 1-manifest and upserts back to Supabase.

### 6.2 Field-by-Field (D2C)

Build this object in the Stripe webhook handler (or a shared helper) and POST to N8N_W0_WEBHOOK_URL:

| Field | Source (D2C) | Notes |
|-------|--------------|--------|
| orderId | order.orderId (UUID) | Required |
| id | same as orderId | For compatibility |
| orderDate / purchaseDate | new Date().toISOString() | |
| status | 'queued_for_processing' or similar | |
| customerEmail | order.customer_email | |
| buyer | { email: order.customer_email, name: order.customer_name } | |
| characterSpecs / character_specs | order.character_specs | Same shape as Amazon |
| bookSpecs / book_specs | Default or from product_info | e.g. totalPages 16, format 8.5x8.5_softcover |
| orderDetails | { quantity: 1, shippingAddress: order.shipping_address } | |
| dedication | order.dedication_text | |
| characterHash / character_hash | order.character_hash | Pre-computed at checkout |
| items / lineItems | Optional; can be minimal array for W0 | W0 may not require |

Do **not** send: `amazonOrderId`, `marketplaceId`. n8n W0 already treats these as optional and infers “Amazon” only when present.

### 6.3 Where to Build

- In the Stripe webhook handler after updating the order: load the full order row, build the payload object above, POST to `process.env.N8N_W0_WEBHOOK_URL` (same as Amazon cron). Reuse the same URL; no n8n change.

### 6.4 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T6.1 | Implement buildD2CW0Payload(order) helper | Returns object matching table above |
| T6.2 | Call from Stripe webhook after order update; POST to N8N_W0_WEBHOOK_URL | W0 receives payload; 1-manifest created; order gets one_manifest_url |

---

## 7. Notifications (Branch on Platform)

### 7.1 Goal

Preview and shipped notifications: **Amazon** orders → Amazon Message Center (existing). **D2C** orders → email (or other channel). Backend branches on `order.platform` (or `platform` from order record).

### 7.2 Where to Branch

- **Preview (approval link):** Current flow sends via Amazon Message Center when `amazonOrderId` is present. Add: if `platform === 'd2c'`, send email instead (same preview URL and token). Locate the code that sends the initial preview message (e.g. after W3 or when approval is requested); add conditional: if platform === 'd2c', call email sender; else call Amazon Message Center.
- **Reminders (day-1, day-2, auto-approval):** Same: in `process-preview-reminders` (or equivalent), if order.platform === 'd2c', send email; else send Amazon message.
- **Shipped:** Same: in Lulu webhook or shipped-notification code, if platform === 'd2c', send email with tracking; else send Amazon Message Center.

### 7.3 Email for D2C

- **Provider:** Choose one (SendGrid, Resend, Postmark, SES, etc.). Add env vars: e.g. `D2C_EMAIL_FROM`, `D2C_EMAIL_API_KEY` or provider-specific.
- **Templates:** Preview link email (subject, body with approval URL, 3-day copy). Shipped email (subject, body with tracking URL). Optional: reminder emails (day-1, day-2) if you do them for D2C.
- **Storage:** Optional `notification_logs` (already exists) with type = 'email' for D2C.

### 7.4 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T7.1 | Add platform check where preview message is sent; if d2c, send email | D2C orders get email with preview link |
| T7.2 | Add platform check in reminder flow; if d2c, send email | D2C reminders by email |
| T7.3 | Add platform check where shipped message is sent; if d2c, send email | D2C shipped notification by email |
| T7.4 | Implement email sender (provider + templates) and env config | Emails deliver successfully |

---

## 8. Storefront UI

### 8.1 Goal

Customer flow: Catalog → Character (inline, no account) → Book customization → Checkout (Stripe) → Processing screen. Phase 0: single book; character data and shipping collected in funnel; no accounts/children tables.

### 8.2 Screens and Tasks

| Screen | Tasks | Acceptance |
|--------|-------|------------|
| **Catalog** | Single book card; CTA “Create This Book”; link to character step | User can start flow |
| **Character** | Form: child name, age, pronouns, skin tone, hair style, hair color, favorite color, favorite animal, dedication (optional). No “account” or “child profile” persistence; state in memory or session until checkout. Optional: simple character preview (static or link to existing preview tool if available). | Data available for checkout payload |
| **Book customization** | Minimal: dedication, any book-specific fields. “Continue to Checkout.” | character_specs + dedication ready |
| **Checkout** | Order summary; shipping form (name, address, city, state, zip, country, email); Stripe Elements or Stripe Checkout redirect. On “Place Order”: call POST /api/checkout/create with Idempotency-Key + body; get client_secret or session URL; complete payment. | Payment succeeds; user redirected to processing |
| **Processing** | “Your book is being created…” message; order_id for reference; link to support. No dashboard yet if not logged in; optional “View status” link that uses order_id (e.g. public status page by order_id + token later). | User sees confirmation |

### 8.3 Tech Notes

- Frontend can be Next.js (same repo as back-end) or separate (e.g. Astro, React). Use API base URL for checkout and Stripe.
- Idempotency-Key: generate UUID on client (e.g. crypto.randomUUID()) and send on first “Place Order”; retry with same key if request fails to avoid double order.

### 8.4 Tasks (Summary)

| Task | Description | Acceptance |
|------|-------------|------------|
| T8.1 | Catalog page with single book and CTA | Navigates to character |
| T8.2 | Character form (all character_specs fields + dedication) | Data available for API |
| T8.3 | Book customization screen (minimal) and “Continue to Checkout” | |
| T8.4 | Checkout page: shipping form + Stripe; call checkout API with Idempotency-Key; complete payment | Order created; payment succeeds |
| T8.5 | Processing/confirmation page | User sees success and next steps |

---

## 9. Dashboard: My Orders (D2C)

### 9.1 Goal

Customer can see their D2C order(s) status: processing, preview link (when ready), approval status, tracking (when shipped). Phase 0: no login; identify by “order_id + email” or a one-time link (e.g. email link with token). Simplest: “View your order” page that accepts order_id and email (or token) and shows status.

### 9.2 Options

- **A) Order status by order_id + email:** GET /api/orders/d2c/status?order_id=...&email=... (or POST with body). Backend verifies email matches order; returns status, preview_url, tracking_url. Frontend: “Check your order” form (order_id, email) → show status.
- **B) Magic link in email:** After checkout, send email with link containing signed token (order_id + expiry). GET /api/orders/d2c/status?token=... returns status. User clicks link from email.

### 9.3 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T9.1 | Backend: endpoint to fetch order status by order_id + email (or token) | Returns status, preview_url, tracking_url for D2C order |
| T9.2 | Frontend: “My Order” or “Check status” page (order_id + email or token) | Customer can see order status and preview/tracking links |

---

## 10. Admin: Filter / Label by Platform

### 10.1 Goal

Admin can filter or label orders by `platform` so D2C and Amazon orders are distinguishable in the existing admin UI.

### 10.2 Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| T10.1 | Backend: list orders supports query param ?platform=d2c | Only D2C orders returned |
| T10.2 | Admin UI: add platform filter (All / Amazon / D2C) or platform column in table | Admin can see and filter by platform |

---

## 11. Approval (No Change)

Reuse existing approval flow: preview token, approve/revision endpoints, Lulu trigger. No implementation tasks for Phase 0; ensure approval URLs and tokens work for orders identified by `orderId` (existing code already supports multiple identifiers via `getOrderFromSupabase`).

---

## 12. Acceptance Criteria (Phase 0)

- [ ] Schema: `platform`, `orderId`, nullable `amazon_order_id` in place; existing Amazon orders unchanged.
- [ ] Checkout API creates D2C order with platform='d2c', orderId=UUID; returns Stripe client_secret or URL.
- [ ] Stripe webhook on payment_intent.succeeded updates order and triggers W0; W0 runs and 1-manifest is created.
- [ ] Router cron picks up D2C order (execution_status/next_workflow) and routes through 2A → 2B → 3 → 4 same as Amazon.
- [ ] Preview and shipped notifications for D2C go by email; Amazon still uses Message Center.
- [ ] Storefront: catalog → character → customization → checkout → payment → processing screen works end-to-end.
- [ ] Customer can view D2C order status (by order_id + email or token).
- [ ] Admin can filter or see platform column for orders.
- [ ] Idempotency: duplicate checkout or duplicate Stripe event does not create duplicate order or double W0 trigger.

---

## 13. Out of Scope (Phase 0)

- Accounts table, children table, book_projects, character_style_variants.
- Login/signup; “My Characters” or “My Books” dashboard tabs.
- Multiple books in catalog (single book only).
- Amazon flow changes (except adding platform='amazon' to new Amazon orders if desired).
