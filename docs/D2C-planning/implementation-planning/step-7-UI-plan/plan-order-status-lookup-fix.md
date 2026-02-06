# Plan: Fix Order Status Lookup (Task 4 / Task 7)

**Goal:** Make `LH-XXXXX` resolve correctly, use the right Supabase columns, and decide/implement email verification for the customer-facing status lookup.

---

## Current State

### 1. Status API

- **Endpoint:** `GET /api/preview/[orderId]/status`
- **File:** [back-end/src/app/api/preview/[orderId]/status/route.ts](back-end/src/app/api/preview/[orderId]/status/route.ts)
- **Behavior:** Resolves `LH-XXXXX` via `resolveOrderId()`, then loads order with `getOrderFromSupabase(orderId)` and returns status, tracking, preview URL, etc.

### 2. DB Column Mismatch

- **Orders table** (from [database/migration-d2c-phase-0-orders.sql](database/migration-d2c-phase-0-orders.sql) and [database/verify-d2c-preview-hash-migration.sql](database/verify-d2c-preview-hash-migration.sql)):
  - PK: `id` (integer)
  - Business key: **`"orderId"`** (VARCHAR, quoted in SQL)
  - Customer-facing ID: **`display_order_id`** (e.g. `LH-A60AD`)
- **Bug:** `resolveOrderId()` uses `.select('order_id')` and `data.order_id`. The table has **`"orderId"`**, not `order_id`. PostgREST/Supabase will return the column as `orderId` in JSON (or error if `order_id` does not exist). So the primary lookup by `display_order_id` can fail or return undefined, and the fallback uses `.ilike('order_id', ...)` which may also be wrong.

### 3. Frontend

- **File:** [frontend/src/components/create/islands/ProcessingConfirmation.tsx](frontend/src/components/create/islands/ProcessingConfirmation.tsx)
- **Behavior:** "Check order status" collects **Order ID** (LH-XXXXX) and **Email**, but the request is **GET** to `/api/preview/${lookupOrderId}/status` with **no email** sent. So the API currently does not verify email.

### 4. getOrderFromSupabase

- **File:** [back-end/src/lib/supabase-client.ts](back-end/src/lib/supabase-client.ts)
- **Behavior:** Tries `orderId`, then `order_id`, then `amazon_order_id`. Does **not** look up by `display_order_id`. So once we have the correct UUID from `resolveOrderId()`, lookup should work if the column name in the status route is fixed.

---

## Implementation Plan

### Step 1: Fix column names in status route (resolveOrderId)

**File:** [back-end/src/app/api/preview/[orderId]/status/route.ts](back-end/src/app/api/preview/[orderId]/status/route.ts)

- In `resolveOrderId()`:
  - Change `.select('order_id')` to `.select('orderId')` (match DB column `"orderId"`).
  - Use `data.orderId` (and handle Supabase possibly returning snake_case by also reading `data.order_id` for robustness).
- In the fallback branch (match by first 5 chars of UUID):
  - Change `.select('order_id')` to `.select('orderId')`.
  - Change `.ilike('order_id', ...)` to `.ilike('orderId', ...)`.
  - Use `fallbackData?.orderId ?? fallbackData?.order_id ?? null` for the return value.

**Acceptance:** For a D2C order with `display_order_id = 'LH-XXXXX'` and `"orderId"` = UUID, `GET /api/preview/LH-XXXXX/status` returns 200 and the correct status (not 404 or "Order not found").

---

### Step 2: Optional email verification

**Decision:** Implement **optional** email verification: if the client sends an email (e.g. query param), the API verifies it against `order.customer_email` before returning status. If email is provided and does not match, return **404** (do not leak that the order exists).

**File:** [back-end/src/app/api/preview/[orderId]/status/route.ts](back-end/src/app/api/preview/[orderId]/status/route.ts)

- In `GET` handler, after loading the order:
  - Read `email` from query string: `request.nextUrl.searchParams.get('email')?.trim()`.
  - If `email` is present:
    - Get `customer_email` from order (support both `customer_email` and `customerEmail` from mapper/response).
    - If `customer_email` is missing or does not match (case-insensitive compare), return `NextResponse.json({ error: 'Order not found' }, { status: 404 })`.
  - If `email` is not present, skip verification (keep current behavior).

**File:** [frontend/src/components/create/islands/ProcessingConfirmation.tsx](frontend/src/components/create/islands/ProcessingConfirmation.tsx)

- In `handleLookup`, when calling the API:
  - Build URL with optional email:  
    `${API_BASE}/api/preview/${encodeURIComponent(lookupOrderId.trim())}/status${lookupEmail.trim() ? `?email=${encodeURIComponent(lookupEmail.trim())}` : ''}`
  - No change to validation: still require both order ID and email for the button (so we always send email when user fills both).

**Acceptance:**  
- With no email param, behavior unchanged.  
- With correct email param, status returned.  
- With wrong email param, 404.

---

### Step 3: Response shape and field names

The status route returns a mix of camelCase and snake_case (see `trackingNumber` / `tracking_number`, etc.). The frontend already normalizes (e.g. `data.statusMessage || data.status_message`). No change required unless we find a specific field that is wrong; we can leave response shape as-is for this task.

---

### Step 4: Manual test and doc update

- **Test:** Create or use a D2C order with `display_order_id` set (e.g. `LH-A60AD`). Call `GET /api/preview/LH-A60AD/status` (with and without `?email=...`). Confirm 200 and correct payload when ID (and email if provided) are correct, and 404 when email is wrong.
- **Doc:** In [step-7-ui-current-task-list-2026-02-05.md](step-7-ui-current-task-list-2026-02-05.md), mark Task 4 as done and note: "LH-XXXXX resolves via display_order_id; status API uses correct Supabase column (orderId); optional email verification via query param."

---

## Summary

| Step | Action |
|------|--------|
| 1 | Fix `resolveOrderId()` to use `orderId` (and fallback `order_id`) instead of `order_id` only. |
| 2 | Add optional email verification in the status GET handler; frontend passes email as query param when provided. |
| 3 | Leave response shape as-is. |
| 4 | Manual test; update task list. |

**Risks:** None expected. Supabase may expose `"orderId"` as `orderId` in JSON; if your project uses a schema that maps to `order_id` in API responses, use the same pattern as [back-end/src/lib/order-mapper.ts](back-end/src/lib/order-mapper.ts) (e.g. `record.orderId || record.order_id`) when reading the resolved ID.
