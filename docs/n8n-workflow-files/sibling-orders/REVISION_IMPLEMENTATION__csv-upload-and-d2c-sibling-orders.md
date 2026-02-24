## Purpose

This document is a **revision implementation plan** for the work around:

- **Amazon Admin CSV Upload tool** (multi-item / sibling orders)
- **D2C multi-book (sibling) checkout + downstream pipeline compatibility**

It is written so **any agent** can pick it up and complete the work safely.

## Current status (as of 2026-02-24)

### Completed work (implemented in repo)

- ✅ **Workstream 1 — D2C processing status lookup contract fix**
  - Implemented: frontend now treats API `status` as a **customer-facing label** and prefers `statusLong` for the long message; supports `trackingUrls` array with fallback to `trackingUrl`.
  - Files:
    - `frontend/src/components/create/islands/ProcessingConfirmation.tsx`
    - (Contract reference) `back-end/src/app/api/preview/[orderId]/status/route.ts`

- ✅ **Workstream 6 — D2C effective idempotency on retries**
  - Implemented: frontend persists an idempotency key + timestamp in sessionStorage-backed create-flow state and **reuses it for 30 minutes** on retries; clears it after a successful checkout create (before Stripe redirect).
  - Files:
    - `frontend/src/components/create/islands/CheckoutForm.tsx`
    - `frontend/src/lib/createFlow/createFlowSchema.ts` (types for `checkout.idempotencyKey` + `checkout.idempotencyKeyCreatedAt`)

## Ground truth (current product + identity rules)

- **Book format**: **8.5×8.5 softcover** (MVP single format).
- **Per-book identifier**: `orderId` (synthetic for siblings).
- **Sibling group/root identifier**:
  - Amazon: `amazonOrderId` in workflow payloads; `amazon_order_id` in Supabase should represent the **root group id** for sibling groups.
  - D2C: may not have an Amazon order id; still needs a stable **root group id** for multi-book orders.

## Canonical data contract (must be explicit)

This work is only safe if we lock down one coherent meaning for key columns across:
CSV upload, admin APIs, D2C checkout/webhook, Supabase queries, and n8n workflows.

### Orders table identity fields (contract)

- **`orderId`**
  - Always the **per-book** unique identifier used for:
    - all per-book R2 paths (`.../orders/<orderId>/...`)
    - all per-book manifests (`1-manifest.json`, 2A/2B/3/4)
    - all per-book workflow runs (W0/W2A/W2B/W3/W4)
  - Amazon:
    - primary: `orderId = <amazonRootOrderId>`
    - sibling: `orderId = <amazonRootOrderId>-item-<orderItemId-or-deterministic-fallback>`
  - D2C:
    - single-book: `orderId = <root_order_id UUID>`
    - multi-book: `orderId = <root_order_id UUID>-item-<1..N>`

- **`amazon_order_id`**
  - Reserved for the **Amazon root group id**.
  - Amazon:
    - primary + all siblings: `amazon_order_id = <amazonRootOrderId>`
  - D2C:
    - `amazon_order_id = null` (always)
  - Rationale: this avoids overloading `amazon_order_id` with per-book identity and makes sibling grouping stable.

- **D2C root group id**
  - Store as `product_info._root_order_id = <root_order_id UUID>` for multi-book checkouts.
  - For single-book D2C, `_root_order_id` may be omitted (or set equal to `orderId` if useful).

### Admin/API auth for admin endpoints (contract)

Admin endpoints must fail closed unless one of these is true:
- **Same-origin allowlist** check passes (strict), OR
- A valid **admin token** header is present (recommended for CLI/curl + server-to-server).

### Key invariant

All **per-book** storage paths and per-book processing must be keyed by **`orderId`**, never the group/root id.

## What to read first (context)

- CSV sibling order issue doc: `docs/_ongoing-issues-list/12-second-item-sibling-order-from-csv.md`
- D2C shipping tier mapping issue: `docs/_ongoing-issues-list/_needs-review/22-map-d2c-shipping-options-through-w4.md`
- Amazon Orders API v2026 migration issue: `docs/_ongoing-issues-list/28-amazon-orders-api-v2026-migration.md`
- Sibling workflows folder (exports under QA): `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/`

## Issues confirmed by code review (and why they matter)

### A) D2C processing status lookup: frontend ↔ API contract mismatch (HIGH)

**Symptoms**
- The processing page lookup almost always shows fallback “Processing” labeling even when the API has real status text.

**Cause**
- Frontend expects:
  - `status` = a status **code** (e.g. `pending_w0`, `shipped`)
  - `statusMessage` / `status_message` = long text
- Backend returns:
  - `status` = customer-facing **label** (e.g. `"Preparing for Print"`)
  - `statusLong` = long text

**Files**
- Frontend: `frontend/src/components/create/islands/ProcessingConfirmation.tsx`
- Backend: `back-end/src/app/api/preview/[orderId]/status/route.ts`

**Status**
- ✅ Fixed (see “Current status” section above).

### B) CSV upload existing-order detection is brittle and can create duplicates (HIGH)

**Symptoms**
- Re-uploading the same CSV after W0 runs can fail to “match” existing sibling rows, leading to duplicate inserts.

**Cause**
- CSV upload checks existence via:
  - `orders.amazon_order_id == effectiveOrderId`
- Meanwhile the sibling-order workflow W0 export is designed to treat `amazon_order_id` as the **root group id** for siblings.
- If W0 patches/normalizes `amazon_order_id` to root group id, the CSV upload’s later lookup no longer matches.

**Files**
- CSV route: `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`
- Shared helper used by CSV: `back-end/src/lib/sibling-order-helpers.ts`
- W0 export (for intended semantics): `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/w0-Order_Intake_Validation.json`

### C) Non-deterministic sibling IDs when `order-item-id` is missing (HIGH)

**Symptoms**
- A “missing order-item-id” row will generate a different synthetic sibling id on each run, breaking idempotency/dedupe.

**Cause**
- `buildSiblingOrderId()` falls back to `Date.now()` when suffix missing.

**File**
- `back-end/src/lib/sibling-order-helpers.ts`

### D) Admin CSV endpoint security footgun (HIGH)

**Symptoms**
- Depending on deployment env vars, the origin check can degrade into “allow all”.

**Cause**
- `origin?.includes(process.env.NEXT_PUBLIC_SITE_URL || '')` is always true when the env is blank.

**File**
- `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`

### E) D2C shipping address compatibility + phone requirement (HIGH)

**Symptoms**
- D2C orders can fail downstream if the pipeline expects a phone number for Lulu.

**Cause**
- D2C checkout schema does not collect a phone number:
  - `back-end/src/app/api/checkout/create/route.ts` `ShippingAddressSchema` has no phone
  - `frontend/src/components/create/islands/CheckoutForm.tsx` has no phone field
- W4 workflow (Lulu submission) ultimately requires `shipping_address.phone_number` (or equivalent).

**Files**
- Frontend checkout: `frontend/src/components/create/islands/CheckoutForm.tsx`
- Backend checkout create: `back-end/src/app/api/checkout/create/route.ts`
- W4 export: `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/w4-PRODUCTION-Print_Fulfillment.json`

### F) D2C idempotency is not effective in the browser (MED/HIGH)

**Symptoms**
- If the user retries submit after a transient failure, the browser generates a new idempotency key and can create duplicate pending orders.

**Cause**
- Frontend generates a fresh UUID each submit and does not persist it.

**Files**
- Frontend checkout: `frontend/src/components/create/islands/CheckoutForm.tsx`
- Backend idempotency: `back-end/src/app/api/checkout/create/route.ts` (expects `Idempotency-Key`)

**Status**
- ✅ Fixed on the frontend (see “Current status” section above).

### G) Format/SKU references inconsistent with 8.5×8.5 (MED)

**Symptoms**
- Some examples/tools reference an outdated POD SKU/trim size that doesn’t match 8.5×8.5.

**Cause**
- Legacy POD examples/constants not updated after format decision.

**Files to audit**
- `pod/pod-service.js`
- `pod/lulu_example.http`
- `pod/onpress_example.http`
- Any docs/examples that still mention the old trim size

### H) `updateOrderInSupabase()` can silently update 0 rows (HIGH)

**Symptoms**
- Stripe webhook (and other callers) can attempt to update a D2C order (e.g. `pending_payment` → `pending_w0`) but the DB row remains unchanged.

**Cause**
- `back-end/src/lib/supabase-client.ts` `updateOrderInSupabase()` tries `.eq('amazon_order_id', orderId)` first.
- If that UPDATE matches **0 rows**, PostgREST commonly returns `data: []` and `error: null` (not an error).
- Current code only tries fallback identifiers (`orderId`, `order_id`, `id`) when `error` is set, so it may never try the correct field.

**Impact**
- D2C Stripe webhook may not reliably move orders to `pending_w0` / trigger routing readiness.
- Any future “amazon_order_id is root group id” migration makes this worse.

**Files**
- `back-end/src/lib/supabase-client.ts`
- Stripe webhook caller: `back-end/src/app/api/webhooks/stripe/route.ts`

### I) `getOrderFromSupabase()` assumes `amazon_order_id` is unique (HIGH if `amazon_order_id` becomes group key)

**Symptoms**
- Fetch by root Amazon order id may start throwing errors once siblings share the same `amazon_order_id`.

**Cause**
- `getOrderFromSupabase()` uses `.eq('amazon_order_id', trimmedOrderId).single()`.
- If `amazon_order_id` is repurposed to mean **root group id shared by multiple rows**, `.single()` can error due to multiple rows.

**Files**
- `back-end/src/lib/supabase-client.ts`

### J) Stripe multi-book webhook order resolution / email selection (MED)

**Symptoms**
- Multi-book checkout confirmation email may show the “wrong” per-book display id or preview image depending on which sibling row is returned first.

**Cause**
- Multi-book webhook loads sibling rows with a `.like('orderId', rootOrderId + '-item-%')` query without explicit ordering and uses the first iterated order to populate email preview.

**Files**
- `back-end/src/app/api/webhooks/stripe/route.ts`

### K) Idempotency helper stores response after handler completes (MED)

**Symptoms**
- If checkout-create inserts some rows but throws before returning a response, the idempotency key might not be stored, and a retry could insert duplicates.

**Cause**
- `withIdempotency()` stores `idempotency_keys` only after handler returns; partial failures inside handler are not recorded as “in-progress”.

**Files**
- `back-end/src/lib/idempotency.ts`

## Implementation plan (by workstream)

### Workstream 1 — Fix D2C processing status lookup contract

#### Pseudocode
```text
read frontend ProcessingConfirmation lookup mapping
read backend status API response shape
choose ONE contract:
  option A: change frontend to use backend fields (statusLong, trackingUrls)
  option B: change API to return status/statusMessage in the shape frontend expects
implement chosen change
verify lookup renders meaningful label + long message for known statuses
```

#### Recommended approach (min-risk)
- Update `ProcessingConfirmation.tsx` to:
  - treat `data.status` as a **label** (display directly when present)
  - prefer `data.statusLong` for long message
  - support `trackingUrls` array from API (fallback to `trackingUrl`)

#### Acceptance checks
- When API returns `status="Preparing for Print"` + `statusLong="..."`, UI shows both (no fallback).

#### Status
- ✅ Completed (see “Current status” section above).

---

### Workstream 2 — CSV upload: security hardening

#### Implementation order (do these in sequence)

To avoid chasing bugs caused by inconsistent identity semantics, implement Workstreams **2–4** in this exact order:

1) **WS2 (Security hardening)**: lock down admin endpoints first (fail closed).
2) **WS4 Step 1 (Supabase helpers correctness)**:
   - fix `updateOrderInSupabase()` so fallbacks occur on “0 rows updated”, not only on errors
   - fix `getOrderFromSupabase()` so `amazon_order_id` can safely be a group key
3) **WS4 Step 2 (Identity semantics alignment)**:
   - align `buildSiblingOrderRow()` + admin `create-sibling` route to the Canonical contract
4) **WS3 (CSV deterministic ids + safe dedupe)**:
   - deterministic sibling suffixes
   - existence checks by per-book `orderId` (not `amazon_order_id`)
   - W0 specs fetch by per-book `orderId`
5) **WS4 Step 4–5 (Backfill + audit pass)**:
   - normalize legacy Amazon sibling rows (`amazon_order_id` → root group id)
   - search/update any remaining codepaths that assume `amazon_order_id == orderId`

#### Pseudocode
```text
fail closed if allowlist env is missing/misconfigured
accept request if either:
  - strict same-origin allowlist check passes, OR
  - admin token header is valid (preferred for CLI/curl + server-to-server)
do not treat missing Origin as same-origin (unless admin token is valid)
```

#### Implementation notes
- Replace `includes(env || '')` pattern with strict allowlist logic (no empty-string matches).
- Recommended:
  - If allowlist env missing → return **500** with an actionable message (configuration error).
  - If Origin/Referer missing or not allowed → require **admin token** header; otherwise return **401**.

#### Proposed implementation plan (concrete)

**Goal**: eliminate fail-open behavior and allow safe non-browser admin use.

1) **Introduce a shared admin auth helper** (avoid copy/paste drift)
   - Location options:
     - `back-end/src/lib/admin-auth.ts` (preferred), or
     - colocate in `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts` first and reuse later.
   - Behavior:
     - **Configured allowlist**: `NEXT_PUBLIC_SITE_URL` must be present and parseable; otherwise return **500**.
     - **Same-origin**: accept if `Origin` or `Referer` matches the allowlisted host exactly (not substring match).
     - **Token**: accept if header token matches env (for CLI/curl + server-to-server):
       - Suggested headers:
         - `Authorization: Bearer <token>` OR
         - `X-Admin-Token: <token>`
       - Suggested env var (choose one and standardize): `BACKEND_API_TOKEN` (already referenced in n8n docs) or `ADMIN_API_TOKEN`.
     - **No Origin + no token**: reject with **401**.

2) **Apply helper to admin endpoints handling sibling creation**
   - Required:
     - `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`
   - Strongly recommended (same security class):
     - `back-end/src/app/api/admin/orders/[orderId]/create-sibling/route.ts`
     - any other admin APIs that currently rely on origin/referrer heuristics.

3) **Logging**
   - Log whether request was accepted via `same_origin` vs `token` for auditability.
   - Never log the token value.

#### Acceptance checks
- Without correct Origin/Referer, endpoint returns 401.
- With env missing, endpoint returns 500 and does not accept requests.
- With `Authorization: Bearer <token>` (or `X-Admin-Token`) set correctly, endpoint accepts requests even when Origin is missing (curl/server-to-server).

---

### Workstream 3 — CSV upload: deterministic sibling ids + safe dedupe

#### Pseudocode
```text
for each amazonOrderId group:
  for each row:
    determine sibling suffix:
      if order-item-id present -> use it
      else -> use stable fallback in this priority order:
        1) hash(customized-url) if present
        2) index within group (last resort; depends on CSV ordering)
    effectiveOrderId = root for first row; root-item-suffix for siblings

when checking existing rows:
  query by orderId (preferred) OR a stable key in product_info (_parent + _order_item_id/_row_index)
avoid existence lookup by amazon_order_id if that column is reserved for group id
```

#### Concrete changes
- `back-end/src/lib/sibling-order-helpers.ts`
  - Change `buildSiblingOrderId()` usage in CSV path to always provide a **deterministic suffix**:
    - orderItemId when present
    - else `sha256(customizedUrl).slice(0, 12)` when present
    - else `${idx+1}` as last resort
  - Remove `Date.now()` fallback (or keep only for truly manual operations that cannot be retried).
- `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`
  - Stop using `.eq('amazon_order_id', effectiveOrderId)` as the existence check.
  - Prefer a lookup by `orderId` (if present in schema) or by a stable composite in `product_info`.
  - Ensure inserted rows follow the Canonical data contract:
    - `orderId` = per-book id
    - `amazon_order_id` = root Amazon order id for all rows in the group

#### Acceptance checks
- Re-upload the same CSV twice → no duplicate sibling rows; same effective IDs.
- Missing `order-item-id` on row 2 → rerun produces **same sibling orderId**.

#### Proposed implementation plan (concrete)

**Implementation order matters**: do Workstream 4’s Supabase helper fixes (and identity semantics) first, then refactor CSV, otherwise you’ll encode the wrong identifier again.

1) **Deterministic sibling suffix derivation**
   - In `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`:
     - Capture `customizationUrl` per row (you already have it in the row loop).
     - Define a stable `suffix` for each row:
       - if `orderItemId` exists: `suffix = orderItemId`
       - else if `customizationUrl` exists: `suffix = sha256(customizationUrl).slice(0, 12)`
       - else: `suffix = String(idx + 1)` (last resort)
     - Build `effectiveOrderId` deterministically:
       - primary row: `effectiveOrderId = amazonOrderId`
      - sibling row: `effectiveOrderId = amazonOrderId + '-item-' + suffix`
   - Keep `buildSiblingOrderId()` for other contexts, but CSV must never rely on `Date.now()` for a retryable identifier.

2) **Fix existence check to use per-book identity**
   - Replace `.eq('amazon_order_id', effectiveOrderId)` with a per-book lookup:
     - prefer `.eq('orderId', effectiveOrderId)` (this is the field used by router + D2C)
   - For backward compatibility (existing rows created with older semantics), the matcher can also try:
     - `.eq('amazon_order_id', effectiveOrderId)` only as a fallback (temporary bridge), but do not keep this as the primary match once `amazon_order_id` is the group key.

3) **Fix W0 “specs fetch” query**
   - CSV route currently fetches specs via `.eq('amazon_order_id', effectiveOrderId)` when it needs to reload `character_specs`.
   - Update to query by `orderId` (per-book).

4) **Ensure inserted rows follow the Canonical contract**
   - When inserting new rows from CSV:
     - `orderId = effectiveOrderId` (per-book id)
     - `amazon_order_id = amazonOrderId` (root group id) for **all** rows in the group (primary + siblings)
   - Write stable dedupe keys into `product_info` for debug/recovery:
     - `_sibling_order: true` for siblings
     - `_parent_amazon_order_id: <amazonOrderId>`
     - `_order_item_id: <orderItemId|null>`
     - `_csv_sibling_index: <idx>` (0 for primary, 1..N for siblings)
     - `_customized_url_hash: <sha256(customizationUrl).slice(0,12)|null>`

5) **Re-upload safety**
   - Re-upload should update existing rows (shipping/name/email/specs) rather than inserting new rows.
   - If an existing row has a different `amazon_order_id` (legacy/soup), normalize it to root group id during update.

---

### Workstream 4 — Align identifier semantics across backend + workflows

#### Goal
One coherent rule set so sibling grouping works and no component “undoes” another.

#### Pseudocode
```text
decide canonical meaning for orders table columns:
  orderId: per-book unique id (required)
  amazon_order_id:
    for Amazon: root group id (amazonOrderId)
    for D2C: either null OR root group id for multi-book (choose one)
update:
  CSV upload inserts/updates
  create-sibling API behavior
  any query sites that assume amazon_order_id == orderId
```

#### Files to audit/update
- CSV upload route: `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`
- Shared sibling helpers: `back-end/src/lib/sibling-order-helpers.ts`
- Create sibling API (if used): `back-end/src/app/api/admin/orders/[orderId]/create-sibling/route.ts`
- Cron router selects both: `back-end/src/app/api/cron/router/route.ts` (already selects `"orderId"`)
- Supabase helper semantics:
  - `back-end/src/lib/supabase-client.ts` (`getOrderFromSupabase`, `updateOrderInSupabase`) must not assume `amazon_order_id == orderId` for siblings.

#### Concrete changes (required)
- Fix `updateOrderInSupabase()` fallback logic:
  - If an UPDATE returns `data: []` (0 rows) with `error: null`, treat that as “not found by this identifier” and try the next identifier.
  - Do not rely on `error` codes to decide whether to attempt fallbacks.
- Fix `getOrderFromSupabase()` when querying by `amazon_order_id`:
  - If `amazon_order_id` is a group key (multiple rows), avoid `.single()` and either:
    - return the “primary” row deterministically (e.g. where `orderId == amazon_order_id`), OR
    - require callers to use `orderId` for per-book operations and provide a separate “list siblings by group id” helper.

#### Proposed implementation plan (concrete, safe rollout)

##### Step 0 — Decide & lock the contract (already defined above)
- Use the Canonical data contract in this document:
  - `orderId` = per-book id
  - `amazon_order_id` = Amazon root group id (Amazon only)
  - D2C: `amazon_order_id = null`, root group stored in `product_info._root_order_id`

##### Step 1 — Fix Supabase helper correctness first (prevents hidden failures)

1) **Patch `updateOrderInSupabase()`**
   - File: `back-end/src/lib/supabase-client.ts`
   - Change strategy from “fallback only on error” → “fallback when 0 rows updated”.
   - Implementation sketch:
     - attempt update by `amazon_order_id`
     - if result has `error`: handle/throw as today
     - if `error == null` but `data` is empty: try next identifier (`orderId`, `order_id`, numeric id)
   - Acceptance: updating a D2C order by `orderId` must work even when `amazon_order_id` is null.

2) **Patch `getOrderFromSupabase()`**
   - File: `back-end/src/lib/supabase-client.ts`
   - Avoid `.single()` on `amazon_order_id` lookups if it can represent a group.
   - Recommended approach:
     - Keep `getOrderFromSupabase(orderId)` primarily as “get by per-book id”.
     - Add new helpers:
       - `getOrderByOrderId(orderId: string)` (strict per-book)
       - `listOrdersByAmazonRootId(amazonOrderId: string)` (returns array, not single)
     - Update call sites that pass root ids to use the list helper (router/admin tools/exports).

##### Step 2 — Align order row builders + admin sibling creation

1) **Fix CSV sibling row builder semantics**
   - File: `back-end/src/lib/sibling-order-helpers.ts`
   - `buildSiblingOrderRow()` currently sets `amazon_order_id: opts.orderId` which conflicts with the Canonical contract.
   - Update to set:
     - `amazon_order_id = opts.parentOrderId` (root group id), not the per-book synthetic id.

2) **Fix admin create-sibling API**
   - File: `back-end/src/app/api/admin/orders/[orderId]/create-sibling/route.ts`
   - Currently inserts sibling rows with `amazon_order_id = syntheticOrderId`; update to:
     - `amazon_order_id = <root parent order id>`
     - `orderId = syntheticOrderId` (per-book)
   - Also update W0 payload it triggers:
     - Ensure `orderId` is synthetic per-book id
     - Ensure `amazonOrderId` (payload field) is the root group id (not synthetic)

##### Step 3 — Update CSV uploader to follow contract + dedupe (Workstream 3)
- Apply Workstream 3 plan after helper + builder fixes are in.

##### Step 4 — Migration/backfill (to avoid breaking existing orders)

This can be done as a one-time script (preferred) or an admin endpoint. Keep it non-destructive and rerunnable.

- **Backfill rule** (Amazon only):
  - For any row where:
    - `orderId` matches the pattern `<root>-item-<suffix>` AND
    - `amazon_order_id` currently equals the synthetic per-book id
  - Set `amazon_order_id = <root>` (derived from `orderId` by stripping `-item-...`).
- **Do not** change D2C rows (`platform == d2c`): keep `amazon_order_id = null`.

##### Step 5 — Tighten dependent query sites (audit pass)
- Search and update any code assuming `amazon_order_id == orderId`:
  - CSV uploader (existence/specs fetch)
  - admin tools
  - any webhook routes that fetch by `amazon_order_id` expecting uniqueness
  - n8n exports (Supabase upsert logic already intends group semantics; ensure it remains consistent)

#### Acceptance checks
- For an Amazon sibling group:
  - All siblings share the same `amazon_order_id` = root id.
  - Each sibling’s `orderId` is unique and used in `orders/<orderId>/...` paths.
- D2C Stripe webhook reliably updates the order’s `execution_status` to `pending_w0` (no silent 0-row updates).
- CSV re-upload after W0: no duplicate sibling rows.

---

### Workstream 5 — D2C: shipping address normalization + phone capture

#### Pseudocode
```text
add phone field to frontend checkout form
validate phone in backend checkout schema
persist phone in orders.shipping_address (and/or a top-level phone field)
ensure W0 payload builder includes shippingAddress.phone (or phone_number) in a consistent spot
ensure W4 shipping normalization reads D2C shipping address shape (address_line1/postal_code) too
```

#### Files
- Frontend: `frontend/src/components/create/islands/CheckoutForm.tsx`
- Backend: `back-end/src/app/api/checkout/create/route.ts`
- D2C W0 payload: `back-end/src/lib/w0-payload.ts`
- W4 export: `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/w4-PRODUCTION-Print_Fulfillment.json`

#### Acceptance checks
- D2C order can reach W4 Lulu payload build without “missing phone_number”.

---

### Workstream 6 — D2C: effective idempotency on retries

#### Pseudocode
```text
on first checkout submit:
  generate idempotency key
  persist it in sessionStorage (with timestamp)
on retry:
  reuse existing key if it is "fresh" (e.g. <30 minutes)
on success redirect:
  clear persisted key
```

#### Files
- Frontend: `frontend/src/components/create/islands/CheckoutForm.tsx`

#### Acceptance checks
- Simulate network failure after POST → retry does not create duplicate Supabase orders.

#### Status
- ✅ Completed on the frontend (see “Current status” section above).

---

### Workstream 7 — 8.5×8.5 format/SKU consistency sweep

#### Pseudocode
```text
search repo for old 8×10 trim/SKU references
replace with:
  - correct 8.5x8.5 SKU (confirm exact value), OR
  - config/env-driven SKU variable (preferred) + update docs/examples
```

#### Files to update
- `pod/pod-service.js`
- `pod/lulu_example.http`
- `pod/onpress_example.http`
- Any docs/examples referencing the old trim size or hardcoded SKU.

#### Acceptance checks
- No remaining hardcoded old trim/SKU references in active codepaths/docs unless explicitly marked as legacy.

## QA test checklist (what to run after implementing)

### CSV Upload
- 2 rows with same `amazon-order-id`, both with customization URLs:
  - expects 2 Supabase rows (primary + sibling), W0 triggered twice.
- Re-upload same file:
  - expects updates, no duplicates.
- Missing `order-item-id` on sibling row:
  - expects deterministic sibling id across runs.

### D2C
- Multi-book checkout (2–5 books):
  - one Stripe session, all orders inserted, one confirmation email, Stripe webhook triggers W0 per book.
- Processing page status lookup:
  - shows correct label + long message from status API.
- Stripe webhook DB update:
  - after `checkout.session.completed`, each book row moves from `pending_payment` → `pending_w0` and W0 is triggered for each book (no stuck orders).

