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

| Step | Workstream | Depends on | Status |
|------|------------|------------|--------|
| 1 | Schema migration (platform, orderId, amazon_order_id nullable) | — | Done |
| 2 | Idempotency storage (table or KV) and middleware | — | Done |
| 3 | Checkout API (create order, no payment yet) | 1, 2 | Done |
| 4 | Stripe webhook (payment success → confirm order, trigger W0) | 1, 2, 3 | Done |
| 5 | W0 payload builder for D2C (used by webhook) | 4 | Done |
| 6 | Notifications: branch on platform; email for D2C | 1 | Done |
| 7 | Storefront UI (catalog → character → customization → checkout) | 3 (API) | |
| 8 | Dashboard: My Orders for D2C | 1 (orders with platform) | |
| 9 | Admin: filter/label by platform | 1 | |

**Progress:** Steps 1–6 complete. Schema, idempotency, Checkout API, Stripe webhook, W0 payload, Notifications (branch on platform; D2C email via Resend). Next: Step 7 (Storefront UI) or Step 8 (My Orders).

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

- [x] `orders.platform` exists; default `'amazon'`; existing rows unchanged.
- [x] `orders.orderId` exists; backfilled for existing Amazon orders; new D2C orders get UUID.
- [x] `orders.amazon_order_id` nullable; existing Amazon rows unchanged; new D2C rows have `amazon_order_id` NULL.
- [x] Backend `order-mapper` and list/update paths work with `platform` and `orderId` (already coded; confirm Supabase returns new columns).

### 2.4 Tasks

Completed: T2.1, T2.2, T2.3, T2.4.

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

Implemented: database/migration-idempotency-keys.sql, back-end/src/lib/idempotency.ts.

### 3.3 Tasks

Completed: T3.1, T3.2, T3.3, T3.4. (T3.3 applied in Checkout API; T3.4 applied in Stripe webhook.)

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

Implemented: back-end/src/app/api/checkout/create/route.ts; requires Idempotency-Key; uses back-end/src/lib/character-hash.ts, Stripe PaymentIntent, env STRIPE_SECRET_KEY and optional D2C_CHECKOUT_AMOUNT_CENTS.

### 4.6 Tasks

Completed: T4.1, T4.2, T4.3, T4.4.

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

Implemented: back-end/src/app/api/webhooks/stripe/route.ts; raw body + STRIPE_WEBHOOK_SECRET; idempotency by event.id; calls buildD2CW0Payload and N8N_W0_WEBHOOK_URL.

### 5.5 Tasks

Completed: T5.1, T5.2, T5.3, T5.4.

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

Implemented: back-end/src/lib/w0-payload.ts (buildD2CW0Payload); used by Stripe webhook route.

### 6.4 Tasks

Completed: T6.1, T6.2.

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

Implemented: Resend with `RESEND_API_KEY`, `D2C_EMAIL_FROM`, optional `D2C_EMAIL_ENABLED`. [back-end/src/lib/notifications/d2c-email.ts](back-end/src/lib/notifications/d2c-email.ts) (`sendD2CPreviewEmail`, `sendD2CShippedEmail`). Logs to `notification_logs` with `notification_type: 'email'` when `orderId` is provided.

### 7.4 Tasks

Completed: T7.1, T7.2, T7.3, T7.4.

| Task | Description | Acceptance |
|------|-------------|------------|
| T7.1 | Add platform check where preview message is sent; if d2c, send email | D2C orders get email with preview link |
| T7.2 | Add platform check in reminder flow; if d2c, send email | D2C reminders by email |
| T7.3 | Add platform check where shipped message is sent; if d2c, send email | D2C shipped notification by email |
| T7.4 | Implement email sender (provider + templates) and env config | Emails deliver successfully |

---

## 8. Storefront UI (Step 7)

**UI plan (visual / layout):** See [D2C-phase-0-step-7-ui-plan.md](../D2C-phase-0-step-7-ui-plan.md) for layout, component structure, trait picker UI, visual style, responsive behavior, progress/wayfinding, copy, and decisions to make.

### 8.1 Goal

Customer flow: Catalog → Character (inline, no account) → Book customization → Checkout (Stripe) → Processing screen. Phase 0: single book; character data and shipping collected in funnel; no accounts/children tables.

### 8.2 Decisions / Intent (aligned with product)

- **Where to build:** Existing **Astro** site (`frontend/`). Customer storefront stays in Astro; admin stays in Next.js back-end.
- **Stripe:** Use **Stripe Checkout** (redirect to Stripe-hosted page) for Phase 0: less front-end surface, Stripe handles PCI, faster to ship. Back-end must support creating a Checkout Session and returning `stripe_checkout_session_url` (in addition to or instead of PaymentIntent `stripe_client_secret`).
- **Catalog:** Reuse/adapt existing **“Our books”** page (`frontend/src/pages/our-books.astro`) for the single book; CTA links to character step instead of Amazon.
- **Dedication:** On a **separate “Book customization”** step (book-specific), not on the character step.
- **Processing page:** Include a **“View status”** link (order_id + email or token → Step 8 status page). Existing **customer approval page** (`frontend/src/pages/approve/[token].astro`) shows preview from email link, then converts to order status once sent to print; preserve that behavior.
- **API base URL:** Frontend reads back-end URL from env (e.g. `PUBLIC_API_URL` in `frontend/.env`). Back-end allows CORS for the frontend origin when frontend and back-end are on different domains.

---

### 8.3 Screen-by-screen specification

#### 8.3.1 Catalog (entry point)

| Item | Specification |
|------|----------------|
| **Route** | `/our-books` (existing). No new route. |
| **Source** | [frontend/src/pages/our-books.astro](frontend/src/pages/our-books.astro). |
| **Changes** | Replace “Create Your Book” button href from Amazon link with internal link to character step (e.g. `/create/character` or `/create?step=character`). Keep single book card (e.g. “[Your Child's] Inner Voice”), cover image(s), description, age range, format. Optionally add price if shown. |
| **State** | None; stateless entry. |
| **Transition** | CTA → Character step (next route). |

**Acceptance:** User lands on Our books, clicks “Create This Book,” and is taken to the character step.

---

#### 8.3.2 Character (trait selection + preview choice)

| Item | Specification |
|------|----------------|
| **Route** | New page, e.g. `/create/character` or `/create` with step=character. |
| **Purpose** | Collect all character traits via **image-based pickers**; at end, user chooses “Wait for preview” or “Submit for processing.” |
| **State** | In-memory or session (e.g. `sessionStorage`) until checkout. No account; data is lost if user leaves and returns unless we add a simple “resume” token later. |
| **Required fields** | Child’s name (text, 1–20 chars, letters/spaces/hyphens), age (3–8), hair style, hair color, skin tone, favorite color, animal guide. All trait options and image sources from [Customization_Source_of_Truth.md](../../new-planning/Customization_Source_of_Truth.md). |
| **Optional fields** | Pronouns (she/her, he/him, they/them; default they/them), clothing style (tee-shorts, dress), favorite food (≤30 chars), hometown (default “Adventure City”), occasion (birthday, holiday, milestone, general). |
| **Trait pickers** | Use **customization image examples** for each trait: hair style (images from `assets/hair-references/`: afro, bun, curly-long, curly-medium, curly-short, pigtails, pom-poms, ponytail, side-part, straight-long, straight-medium, straight-short), hair color (8 swatches or refs), skin tone (5: light, medium, tan, olive, dark → map to R2 canonical in API), favorite color (9 options per source of truth), animal guide (8: dog, cat, owl, lion, tiger, penguin, t-rex, unicorn). Where assets live: hair in repo `assets/hair-references/`; skin/color/animal may need mapping to existing asset paths or static image set in `frontend/public/`. |
| **End-of-step choice** | Two CTAs: (1) **“Wait X to preview my character”** — optional preview path (e.g. call preview endpoint, show loading then preview; X = estimated time in copy). (2) **“Submit for processing”** — skip preview, go to Book customization. Either path leads to same Book customization step with same `character_specs` in state. |
| **Validation** | Name length and charset; age in 3–8; all required traits selected. Show inline errors before allowing “Continue” or “Submit for processing.” |
| **Transition** | → Book customization step (same session state; add dedication next). |

**Acceptance:** User selects all required traits via image pickers, optionally waits for preview or skips; data is available for checkout payload; navigating to Book customization preserves character_specs.

---

#### 8.3.3 Book customization (book-specific fields)

| Item | Specification |
|------|----------------|
| **Route** | New page, e.g. `/create/customize` or `/create?step=customize`. |
| **Purpose** | Collect **book-specific** fields only (dedication and any others). Dedication is not character-specific. |
| **State** | Receives character_specs from previous step (via session/state); adds dedication (and any other per-book fields). |
| **Fields** | Dedication: free text, ≤200 chars recommended (source of truth allows 200–500; UI cap 200). Any other per-book fields per product. |
| **Validation** | Dedication length; optional. |
| **Transition** | “Continue to Checkout” → Checkout step (order summary + shipping + payment). |

**Acceptance:** User sees character summary (read-only) and enters dedication; character_specs + dedication are ready for the checkout API.

---

#### 8.3.4 Checkout (order summary, shipping, payment)

| Item | Specification |
|------|----------------|
| **Route** | New page, e.g. `/create/checkout` or `/create?step=checkout`. |
| **Purpose** | Show order summary; collect shipping address and email; create order via API; redirect to Stripe Checkout; handle return. |
| **Order summary** | Book title, child name, price (e.g. from env or fixed Phase 0 price). |
| **Shipping form** | Name, address_line1, address_line2 (optional), city, state, postal_code, country. Phase 0: country = US only (validate in UI and API). |
| **Email** | customer_email (required); used for order record and D2C notifications. |
| **Payment** | **Stripe Checkout (redirect).** Flow: (1) User clicks “Place Order.” (2) Frontend validates form; generates Idempotency-Key (UUID); POST to back-end `/api/checkout/create` with body (shipping_address, customer_email, customer_name, character_specs, dedication). (3) Back-end creates order (pending payment), creates Stripe **Checkout Session** with success_url and cancel_url pointing back to frontend (e.g. success_url = `{frontendOrigin}/create/processing?order_id={order_id}`, cancel_url = `{frontendOrigin}/create/checkout`), returns `stripe_checkout_session_url` (and order_id). (4) Frontend redirects browser to session URL; user completes payment on Stripe. (5) Stripe redirects to success_url with order_id (or session_id); frontend shows Processing page. (6) Back-end webhook (`checkout.session.completed` or existing `payment_intent.succeeded`) confirms payment and triggers W0. |
| **Idempotency** | Generate UUID once per “Place Order” click; send in header `Idempotency-Key`. On retry (e.g. network error), reuse same key so back-end returns same order_id and session URL. |
| **Validation** | All required shipping fields; US only; valid email. |

**Acceptance:** Order is created; user is sent to Stripe and returns to processing page; payment succeeds and webhook triggers W0.

---

#### 8.3.5 Processing (confirmation + View status)

| Item | Specification |
|------|----------------|
| **Route** | New page, e.g. `/create/processing?order_id=...` or `/create/processing` with order_id in state. |
| **Purpose** | Confirm order placed; show order_id; link to support; **“View status”** link. |
| **Content** | “Your book is being created…” (or similar); order_id for reference; support link; **“View status”** button/link. View status: navigates to Step 8 status page (order_id + email or token). Until Step 8 exists, link can point to placeholder or “Check your order” form (order_id + email). |
| **Existing approval page** | `frontend/src/pages/approve/[token].astro`: customer opens preview link from email; after approving (or auto-approval), that page converts to show order status once sent to print. No change required; ensure D2C approval emails use same approve URL pattern so this page continues to work. |

**Acceptance:** User sees confirmation and order_id; “View status” is present and (once Step 8 is built) leads to order status by order_id + email or token.

---

### 8.4 Character and book fields (source of truth)

- **Required (character):** Child’s name (1–20 chars), age (3–8), hair style (from hair-references list), hair color (8 options), skin tone (light/medium/tan/olive/dark → map to R2 canonical skin-* in API), favorite color (renderer map), animal guide (8 options). See [Customization_Source_of_Truth.md](../../new-planning/Customization_Source_of_Truth.md).
- **Optional (character):** Pronouns, clothing style (tee-shorts, dress), favorite food, hometown, occasion.
- **Book-specific (Book customization step):** Dedication (≤200 chars recommended), any other per-book fields.
- **API mapping:** Checkout API expects `character_specs` with keys compatible with backend/n8n (e.g. childName, age, hairStyle, hairColor, skinTone, favoriteColor, animalGuide; optional: pronouns, clothingStyle, favoriteFood, hometown, occasion). Use camelCase for request body; backend/order-mapper already accept snake_case from DB. Dedication sent as top-level `dedication` in checkout body.

---

### 8.5 API contract (checkout)

**Endpoint:** `POST {API_BASE_URL}/api/checkout/create`  
**Headers:** `Content-Type: application/json`, `Idempotency-Key: <uuid>`

**Request body (existing + alignment for Stripe Checkout):**

- `shipping_address`: { name, address_line1, address_line2?, city, state, postal_code, country }
- `customer_email`: string (email)
- `customer_name`: string (optional)
- `character_specs`: object with required/optional fields per §8.4 (childName, age, hairStyle, hairColor, skinTone, favoriteColor, animalGuide; optional pronouns, clothingStyle, favoriteFood, hometown, occasion). Names match Customization_Source_of_Truth canonical where applicable (e.g. skinTone: "light" | "medium" | "tan" | "olive" | "dark" for customer-facing; backend maps to R2 canonical).
- `dedication`: string (optional, ≤200 chars recommended)
- `product_info`: object (optional)

**Response (current):** `201` with `{ order_id, stripe_client_secret }` (PaymentIntent).

**Response (for Stripe Checkout redirect):** `201` with `{ order_id, stripe_checkout_session_url }`. Back-end creates a Stripe Checkout Session with:
- `success_url`: e.g. `{frontend_origin}/create/processing?order_id={order_id}` (or from request body)
- `cancel_url`: e.g. `{frontend_origin}/create/checkout`
- `metadata`: { order_id }
- Line item(s) for the book (amount from D2C_CHECKOUT_AMOUNT_CENTS or default).
- `mode: 'payment'`.

Frontend then redirects the browser to `stripe_checkout_session_url`. After payment, Stripe redirects to success_url. Back-end must handle either `payment_intent.succeeded` (current) or `checkout.session.completed` (if using Checkout Session) to confirm order and trigger W0; session metadata contains order_id.

---

### 8.6 Backend changes required for Step 7

| Change | Description |
|--------|-------------|
| **Checkout Session support** | In `back-end/src/app/api/checkout/create/route.ts`: optionally or exclusively create a Stripe **Checkout Session** (with success_url, cancel_url from request body or env), return `stripe_checkout_session_url`. Keep idempotency and order creation as today. |
| **Success/cancel URLs** | Accept optional `success_url` and `cancel_url` in request body (or derive from env FRONTEND_ORIGIN + paths). Use them when creating the Checkout Session. |
| **Webhook** | If using Checkout Session: handle `checkout.session.completed` (retrieve session, read metadata.order_id, same confirm-order + trigger W0 logic as payment_intent.succeeded). Alternatively keep using PaymentIntent from session and keep existing webhook. |
| **CORS** | Allow frontend origin (e.g. from env ALLOWED_ORIGINS or FRONTEND_ORIGIN) for POST /api/checkout/create and GET/POST for future order status endpoint. |

---

### 8.7 Frontend env and assets

| Item | Specification |
|------|----------------|
| **Env** | In `frontend/.env` (or Cloudflare Pages env): `PUBLIC_API_URL` = back-end base URL (e.g. `https://admin.littleherolabs.com` or Vercel backend URL). Use for all API calls (checkout, future status). |
| **Assets for trait pickers** | Hair: `assets/hair-references/` in repo (e.g. afro.png, bun.png, curly-long.png, …). Frontend may need these copied to `frontend/public/` or served via back-end; document where images are loaded from. Skin tone, favorite color, animal guide: use source-of-truth lists; images can be swatches or existing asset paths (e.g. assets/poses/animals/). |

---

### 8.8 Implementation order and dependencies

1. **T8.1** — Catalog: change Our books CTA to link to character step. (No dependency.)
2. **T8.2** — Character page: routes, state, trait pickers with images, required/optional fields, validation, “preview” vs “submit for processing” choice. (Depends on T8.1 for entry.)
3. **T8.3** — Book customization page: route, dedication (and any other book fields), “Continue to Checkout.” (Depends on T8.2 for character_specs in state.)
4. **Backend** — Checkout Session + success_url/cancel_url; CORS. (Can be done in parallel with T8.1–T8.3.)
5. **T8.4** — Checkout page: order summary, shipping form, call checkout API with Idempotency-Key, redirect to Stripe Checkout, handle return to processing. (Depends on backend Checkout Session and T8.3.)
6. **T8.5** — Processing page: confirmation, order_id, support link, “View status” link. (Depends on T8.4; View status target can be placeholder until Step 8.)

---

### 8.9 Tasks (summary with acceptance criteria)

| Task | Description | Acceptance |
|------|-------------|------------|
| **T8.1** | Reuse/adapt Our books page: single book card; “Create This Book” CTA links to character step (not Amazon). | User clicks CTA and lands on character step. |
| **T8.2** | Character step: new route; trait pickers with image examples for all required + optional traits per source of truth; validation; end-of-step choice: “Wait for preview” or “Submit for processing”; state carried to Book customization. | character_specs available; optional preview path or skip; data reaches next step. |
| **T8.3** | Book customization step: new route; dedication (≤200 chars) and any other book-specific fields; “Continue to Checkout”; character_specs + dedication ready for API. | Payload complete for checkout. |
| **T8.4** | Checkout page: order summary; shipping form (US); customer email; Idempotency-Key; POST checkout API; redirect to Stripe Checkout; return to processing with order_id. Backend: Checkout Session + success/cancel URLs; CORS. | Order created; payment succeeds; user returns to processing page. |
| **T8.5** | Processing page: “Your book is being created…”, order_id, support link, “View status” link (to Step 8 when available). | User sees confirmation and can open status; approval page flow unchanged. |

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

- [x] Schema: `platform`, `orderId`, nullable `amazon_order_id` in place; existing Amazon orders unchanged.
- [x] Checkout API creates D2C order with platform='d2c', orderId=UUID; returns Stripe client_secret or URL.
- [x] Stripe webhook on payment_intent.succeeded updates order and triggers W0; W0 runs and 1-manifest is created.
- [ ] Router cron picks up D2C order (execution_status/next_workflow) and routes through 2A → 2B → 3 → 4 same as Amazon.
- [x] Preview and shipped notifications for D2C go by email; Amazon still uses Message Center.
- [ ] Storefront: catalog → character → customization → checkout → payment → processing screen works end-to-end.
- [ ] Customer can view D2C order status (by order_id + email or token).
- [ ] Admin can filter or see platform column for orders.
- [x] Idempotency: duplicate checkout or duplicate Stripe event does not create duplicate order or double W0 trigger.

---

## 13. Next Steps

Backend path for D2C orders (schema → checkout → payment → W0) and **notifications** are complete (Steps 1–6). Remaining Phase 0 work is storefront, customer status, and admin visibility.

**Recommended order:**

| Priority | Step | What to do |
|----------|------|------------|
| **1** | **6 – Notifications** | Branch on `order.platform` where preview, reminders, and shipped messages are sent. For D2C: send email (preview link, reminders, shipped + tracking) instead of Amazon Message Center. Add email provider (SendGrid, Resend, Postmark, SES), env vars, and templates. See §7. |
| **2** | **7 – Storefront UI** | Build customer flow: catalog → character form → customization → checkout (Stripe) → processing screen. Call POST `/api/checkout/create` with `Idempotency-Key` and complete payment. See §8. |
| **3** | **8 – My Orders (D2C)** | Let customers view order status: backend endpoint (e.g. by `order_id` + email or token) and a "Check your order" / "View status" page. See §9. |
| **4** | **9 – Admin filter** | Backend: support `?platform=d2c` (and `amazon`) on orders list. Admin UI: platform filter or platform column. Can be done in parallel with 6–8. See §10. |

**Verification (optional early check):** Confirm the router cron and n8n pipeline treat D2C orders like Amazon after W0 (execution_status / next_workflow → 2A → 2B → 3 → 4). No code change required if W0 payload and columns are correct; one end-to-end test is enough.

**Ordering flexibility:** If you want a testable storefront before email, do Step 7 before Step 6; D2C orders will still reach the pipeline and approval, and you can add notifications once the flow is stable.

---

## 14. Out of Scope (Phase 0)

- Accounts table, children table, book_projects, character_style_variants.
- Login/signup; “My Characters” or “My Books” dashboard tabs.
- Multiple books in catalog (single book only).
- Amazon flow changes (except adding platform='amazon' to new Amazon orders if desired).
