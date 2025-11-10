
# Little Hero Books — W4 Print Fulfillment: Supabase Schema Check & Setup

**Owner:** Little Hero Books (W4 workflow)  
**Audience:** Supabase admin  
**Purpose:** Confirm whether the existing Supabase schema supports the W4 (Print Fulfillment) workflow. If not, apply the minimal changes below or provide your preferred column names so we can adapt the workflow to your schema.

---

## What the workflow does (from n8n / PostgREST)

W4 uses Supabase’s REST endpoint to update a single row in `public.orders` identified by an **order ID**. We query by either:

- `amazon_order_id = :orderId` **OR**
- `orderId = :orderId`

### Endpoints the workflow hits
- **PATCH** `/rest/v1/orders?or=(amazon_order_id.eq.:orderId,orderId.eq.:orderId)`  
  Sets “started/finished” timestamps and status.
- **PATCH** `/rest/v1/orders?or=(amazon_order_id.eq.:orderId,orderId.eq.:orderId)`  
  Sets file locations for the interior/cover PDFs (R2 keys).

> The workflow uses the **service role** context to perform these updates.

### Headers (service role context)
```
Content-Type: application/json
Prefer: return=representation
apikey: <SERVICE_ROLE_KEY>
Authorization: Bearer <SERVICE_ROLE_KEY>
```

If you prefer we **upsert** when the row doesn’t exist, we can switch to a **POST** with `Prefer: resolution=merge-duplicates` and `?on_conflict=<unique_column>`—see “Upsert option” below.

---

## Please confirm what’s already in place

1) **Table & IDs**
- Is there a `public.orders` table already?
- Which column(s) uniquely identify an order that W4 should target?
  - `orderId` (text/varchar)?
  - `amazon_order_id` (text/varchar)?
  - Something else (please specify).
- Are there **unique indexes** on these identifiers?  
  _(Recommended: unique on `orderId`; optional: index on `amazon_order_id`.)_

2) **Fulfillment tracking columns**  
Do these exist (names and types) on `public.orders`?
- `print_fulfillment_started_at timestamptz`
- `print_fulfillment_finished_at timestamptz`
- `print_fulfillment_status text`  _(values expected: `started | completed | error`)_

> If you already track similar fields under different names, please list the exact names so we can map our workflow accordingly (e.g., `fulfillment_started_at`, `prod_started_at`, etc.).

3) **PDF storage columns**
Do these exist?
- `interior_pdf_r2_key text`
- `cover_pdf_r2_key text`

> If you prefer URLs over keys, tell us which columns to write to (e.g., `interior_pdf_url`, `cover_pdf_url`).

4) **RLS & access**
- RLS is enabled by default in Supabase; the **service_role** bypasses RLS. Please confirm our service role key is permitted to **PATCH** `public.orders`.
- If you enforce additional policies, let us know so we can align.

5) **Upsert vs. pre-seeded rows**
- Do you expect the `orders` row to already exist (inserted earlier by W3 or your backend)?  
  **or**
- Should W4 be allowed to create the order if it doesn’t exist (via POST upsert)?  
  Please advise which you prefer; we can support either.

---

## If the columns don’t exist yet (proposed minimal schema)

```sql
BEGIN;

-- Core identifiers (create if missing)
-- (Only run these if the columns don't already exist)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS orderId text,
  ADD COLUMN IF NOT EXISTS amazon_order_id text;

-- Fulfillment tracking
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS print_fulfillment_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_fulfillment_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_fulfillment_status text;

-- PDF storage locations (R2 keys or URLs if you prefer)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS interior_pdf_r2_key text,
  ADD COLUMN IF NOT EXISTS cover_pdf_r2_key text;

-- Recommended indexes (adjust to your conventions)
CREATE UNIQUE INDEX IF NOT EXISTS orders_orderid_uidx ON public.orders ((lower(orderId)));
CREATE INDEX IF NOT EXISTS orders_amazon_order_id_idx ON public.orders ((lower(amazon_order_id)));

COMMENT ON COLUMN public.orders.print_fulfillment_started_at  IS 'W4: timestamp when print fulfillment started';
COMMENT ON COLUMN public.orders.print_fulfillment_finished_at IS 'W4: timestamp when print fulfillment finished';
COMMENT ON COLUMN public.orders.print_fulfillment_status      IS 'W4: status marker (started|completed|error)';
COMMENT ON COLUMN public.orders.interior_pdf_r2_key           IS 'W4: R2 key for interior PDF';
COMMENT ON COLUMN public.orders.cover_pdf_r2_key              IS 'W4: R2 key for cover PDF';

COMMIT;
```

> If your naming standard is different (snake vs camel, prefixes, etc.), please reply with your preferred exact column names and we’ll update the workflow to match.

---

## Upsert option (only if you want W4 to create rows)

**Option A (preferred if you want us to upsert on `orderId`):**

- Add a **unique** constraint/index on `orderId` (see above).
- We will call:
  - **POST** `/rest/v1/orders?on_conflict=orderId`
  - Headers: `Prefer: resolution=merge-duplicates, return=representation`
  - Body:
    ```json
    {
      "orderId": ":orderId",
      "amazon_order_id": ":orderId",
      "print_fulfillment_started_at": "2025-01-01T00:00:00Z",
      "print_fulfillment_status": "started"
    }
    ```
  - (Then subsequent PATCHes will update the same row.)

**Option B:** If you want a different unique column (e.g., `amazon_order_id`), tell us which one to use in `on_conflict`.

---

## What the workflow will write, step-by-step

1) **Mark start** (PATCH):
```json
{
  "print_fulfillment_started_at": "<ISO now>",
  "print_fulfillment_status": "started"
}
```

2) **Set interior PDF** (PATCH):
```json
{
  "interior_pdf_r2_key": "book-mvp-simple-adventure/orders/:orderId/interior_:orderId.pdf"
}
```

3) **Set cover PDF** (PATCH):
```json
{
  "cover_pdf_r2_key": "book-mvp-simple-adventure/orders/:orderId/cover_:orderId.pdf"
}
```

4) **Mark finish** (PATCH):
```json
{
  "print_fulfillment_finished_at": "<ISO now>",
  "print_fulfillment_status": "completed"
}
```

> If you’d like to also store Lulu submission IDs, tracking, or error payloads, we can add columns like `lulu_job_id text`, `lulu_order_id text`, `print_fulfillment_error jsonb`. Let us know.

---

## Quick cURL test (run after columns exist)

```bash
curl -X PATCH \
  "$PROJECT_URL/rest/v1/orders?or=(amazon_order_id.eq.TEST-ORDER-010,orderId.eq.TEST-ORDER-010)" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -d '{
    "print_fulfillment_started_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "print_fulfillment_status": "started"
  }'
```

If this returns a row, the workflow will be able to proceed.

---

## What we need back from you

1) **Confirm** the exact identifier column(s) we should filter by (`orderId`, `amazon_order_id`, other?).  
2) **Confirm** the exact column names you want us to use for:
   - started/finished timestamps
   - status
   - interior/cover PDF locations (keys or URLs)
3) **Tell us** whether you want **pre-seeded rows** or **allow upsert** from W4.  
4) If you prefer different names/types, please list them and we’ll update the workflow accordingly.


---

## Later-phase W4 (recommended / optional) — additional setup

These items aren’t required to get W4 running, but they’ll be useful as we expand to full production (job references, webhooks, tracking, richer audit). If you already have equivalents, please share exact names so we can map to them.

### A) Additional columns on `public.orders`

```sql
BEGIN;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS print_fulfillment_provider text DEFAULT 'lulu',
  ADD COLUMN IF NOT EXISTS lulu_job_id text,
  ADD COLUMN IF NOT EXISTS lulu_order_id text,
  ADD COLUMN IF NOT EXISTS print_fulfillment_error jsonb,
  ADD COLUMN IF NOT EXISTS print_fulfillment_last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_tracking_numbers text[],
  ADD COLUMN IF NOT EXISTS print_tracking_urls text[],
  ADD COLUMN IF NOT EXISTS print_est_ship_date date;
COMMIT;
```

**How these are used (later in W4):**
- `print_fulfillment_provider`: identifies the external print service (“lulu” by default).
- `lulu_job_id` / `lulu_order_id`: set after we submit to Lulu so we can cross‑reference later.
- `print_fulfillment_error`: JSON payload from any error we choose to persist (submission/response.
- `print_fulfillment_last_webhook_at`: last time we processed a provider webhook for this order.
- `print_tracking_numbers` / `print_tracking_urls`: carrier data once available.
- `print_est_ship_date`: any ETA surfaced by the provider.

### B) Event log table for webhooks / audit

If you want to capture provider callbacks or internal state transitions, this light‑weight table is sufficient:

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.print_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orderId text,
  provider text NOT NULL DEFAULT 'lulu',
  event_type text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_events_order_idx   ON public.print_events ((lower(orderId)));
CREATE INDEX IF NOT EXISTS print_events_created_idx ON public.print_events (created_at DESC);
COMMIT;
```

> n8n (or an Edge Function) can insert rows here on major steps (submitted, accepted, shipped) or when webhooks arrive from Lulu, allowing us to debug and build timelines.

### C) Optional: separate `print_jobs` table (one‑to‑many with orders)

If you’d like a normalized job record per submission:

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orderId text NOT NULL,
  provider text NOT NULL DEFAULT 'lulu',
  job_id text,              -- provider job id
  status text,              -- submitted/queued/processing/completed/error
  submitted_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  error jsonb
);
CREATE INDEX IF NOT EXISTS print_jobs_order_idx ON public.print_jobs ((lower(orderId)));
COMMIT;
```

> W4 can `INSERT` here after submission, then `PATCH` as status changes or webhooks arrive.

### D) Policies & access

- Current workflow uses **service_role**; it bypasses RLS. No extra policies required for W4.
- If you want a limited client role to read status, we can add **read‑only RLS** for selected columns (e.g., allow an authenticated user to read only their own `orders` row fields: status/timestamps/keys or public URLs).

### E) Webhook handling (if you want provider callbacks)

If Lulu webhooks are desired later:
1. Create a Supabase **Edge Function** (or use n8n webhook) to receive provider events.
2. Handler upserts into `public.print_events` and updates `public.orders`:
   - Update `print_fulfillment_status`, `print_fulfillment_last_webhook_at`.
   - Optionally set `print_tracking_numbers`, `print_tracking_urls`, `print_est_ship_date`.
3. Secure the endpoint (provider secret, signed HMAC header, allow‑list).

---

## Quick reference — bodies W4 sends (later steps)

- **Set interior PDF (PATCH)**  
  `{"interior_pdf_r2_key":"book-mvp-simple-adventure/orders/:orderId/interior_:orderId.pdf"}`

- **Set cover PDF (PATCH)**  
  `{"cover_pdf_r2_key":"book-mvp-simple-adventure/orders/:orderId/cover_:orderId.pdf"}`

- **Store provider IDs (PATCH, optional)**  
  `{"lulu_job_id":"...", "lulu_order_id":"..."}`

- **Record error (PATCH, optional)**  
  `{"print_fulfillment_status":"error","print_fulfillment_error":{...}}`

---

## Final checklist for the Supabase admin

- [ ] Confirm primary identifier(s) for orders (`orderId`, `amazon_order_id`, other?).  
- [ ] Confirm/adjust names for: started/finished timestamps, status, interior/cover PDF keys.  
- [ ] (If upsert desired) Confirm unique column for `on_conflict` (e.g., `orderId`) and allow POST upsert.  
- [ ] Apply minimal schema (core columns + indexes) — or reply with your preferred names.  
- [ ] Decide which **later‑phase** fields you want now vs. later (provider IDs, tracking, webhooks).  
- [ ] (If webhooks) Approve event table and outline Edge Function endpoint/secret.

