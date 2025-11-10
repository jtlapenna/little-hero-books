
# W4 (Print Fulfillment) — Supabase Schema Update Instructions

**Owner:** Little Hero Books (Workflow 4)  
**Audience:** Supabase admin  
**Goal:** Apply camelCase schema for W4 and confirm identifiers so we can proceed with PATCH-only updates.

---

## Please proceed with the camelCase plan

### 1) Identifiers
- **Primary:** `"orderId"` (unique index)
- **Secondary:** `"amazonOrderId"` (regular index)
- W4 filters with (PostgREST):
```
or=(orderId.eq.:orderId,amazonOrderId.eq.:orderId)
```

### 2) Add columns (camelCase)
```sql
BEGIN;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS "printFulfillmentStartedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "printFulfillmentFinishedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "printFulfillmentStatus" text,
  ADD COLUMN IF NOT EXISTS "interiorPdfR2Key" text,
  ADD COLUMN IF NOT EXISTS "coverPdfR2Key" text;

-- Recommended indexes
CREATE UNIQUE INDEX IF NOT EXISTS orders_orderId_uidx ON public.orders ((lower("orderId")));
CREATE INDEX IF NOT EXISTS orders_amazonOrderId_idx   ON public.orders ((lower("amazonOrderId")));
COMMIT;
```

> If your naming standards differ, please reply with your exact column names so we can map W4 accordingly.

### 3) Assumptions
- W4 is **PATCH-only**; earlier workflows (W3/backend) **insert the order row**.
- Service-role key is allowed to **PATCH** `public.orders` (RLS already OK). No extra auth work needed.

### 4) Quick test (after columns exist)
Use any REST client or cURL to verify the `PATCH` path works end-to-end:

```
PATCH /rest/v1/orders?or=(orderId.eq.TEST-ORDER-010,amazonOrderId.eq.TEST-ORDER-010)
Headers:
  Content-Type: application/json
  Prefer: return=representation
  apikey: <SERVICE_ROLE_KEY>
  Authorization: Bearer <SERVICE_ROLE_KEY>
Body:
{
  "printFulfillmentStartedAt": "<ISO now>",
  "printFulfillmentStatus": "started"
}
```

Expected: a 200/201 response with the updated row.

### 5) What to confirm back
1. That `orderId` is unique (index created) and `amazonOrderId` is indexed.  
2. That the five fulfillment columns above exist (or provide your preferred names).  
3. That the test `PATCH` succeeded.  
4. Whether you want optional later additions (e.g., `printFulfillmentProvider`, `luluJobId`, webhook/event logs).

---

## Notes
- PostgREST cache usually refreshes quickly after `ALTER TABLE`. If you see a one-off “column not found,” retry the request; in rare cases a metadata refresh is needed.
- W4 stores **R2 keys** (not public URLs) in `interiorPdfR2Key` and `coverPdfR2Key`. If you prefer URLs, let us know the target columns.
