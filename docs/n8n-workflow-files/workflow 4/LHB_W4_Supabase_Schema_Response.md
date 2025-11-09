# Little Hero Books — W4 Supabase Schema Response

**Date:** 2025-01-XX  
**Responding to:** `LHB_W4_Supabase_Schema_Check_and_Setup.md`

---

## 1) Table & IDs

✅ **Table exists:** `public.orders` table exists

⚠️ **Schema inconsistency:** The codebase shows multiple schema variations. The actual Supabase schema may use one of these patterns:

### Pattern A (from `database/supabase-schema.sql`):
- **Primary Key:** `orderId VARCHAR(50) PRIMARY KEY` (camelCase)
- **Amazon ID:** `amazonOrderId VARCHAR(50)` (camelCase)
- **Indexes:** 
  - `idx_orders_amazonOrderId` on `amazonOrderId`
  - Primary key on `orderId` (unique by default)

### Pattern B (from `docs/database/little-hero-books-schema.sql`):
- **Primary Key:** `id SERIAL PRIMARY KEY` (integer)
- **Amazon ID:** `amazon_order_id VARCHAR(50) UNIQUE NOT NULL` (snake_case)
- **Order ID:** May have `orderId` or `order_id` as separate text field

### Current Code Behavior:
The `supabase-client.ts` file tries multiple approaches in this order:
1. If `orderId` is numeric → tries `id` (integer)
2. Then tries `orderId` (camelCase)
3. Then tries `order_id` (snake_case)
4. Finally tries `amazon_order_id` (snake_case)

**Recommendation for W4:**
- Use the same flexible query pattern: `or=(amazon_order_id.eq.:orderId,orderId.eq.:orderId)`
- This matches what the codebase already does and will work regardless of which schema pattern is in use

---

## 2) Fulfillment Tracking Columns

❌ **Missing:** The following columns do NOT exist in the current schemas:
- `print_fulfillment_started_at`
- `print_fulfillment_finished_at`
- `print_fulfillment_status`

**Similar fields that exist:**
- `lulu_status VARCHAR(50)` (exists in some schemas, may be used for production status)
- `lulu_job_id VARCHAR(100)` (exists in some schemas)
- `print_submitted_at TIMESTAMP` (exists in `little-hero-books-schema.sql`)

**Recommendation:**
- Add the three missing columns as specified in the document
- OR map to existing fields if preferred:
  - `print_fulfillment_status` → could use `lulu_status` (but this is provider-specific)
  - `print_fulfillment_started_at` → could use `print_submitted_at` (but this is submission time, not fulfillment start)

**Preferred approach:** Add the new columns for clarity and to avoid confusion with provider-specific fields.

---

## 3) PDF Storage Columns

⚠️ **Partially exists:** Similar fields exist but with different names:

**Existing fields:**
- `bookPdfUrl TEXT` (camelCase, in `supabase-schema.sql`)
- `coverPdfUrl TEXT` (camelCase, in `supabase-schema.sql`)
- `final_book_url TEXT` (snake_case, in `little-hero-books-schema.sql`)
- `cover_image_url TEXT` (snake_case, in `little-hero-books-schema.sql`)

**W4 needs:**
- `interior_pdf_r2_key text` (R2 key, not URL)
- `cover_pdf_r2_key text` (R2 key, not URL)

**Recommendation:**
- **Option A (Preferred):** Add new columns `interior_pdf_r2_key` and `cover_pdf_r2_key` to store R2 keys
  - Keep existing URL fields for backward compatibility
  - R2 keys can be converted to URLs via `/api/assets/{r2Key}` proxy endpoint
- **Option B:** Use existing URL fields and store full URLs (e.g., `https://pub-xxx.r2.dev/path/to/file.pdf`)
  - Less flexible if R2 bucket structure changes
  - Requires constructing URLs in workflow

**Preferred:** Add new R2 key columns for better flexibility.

---

## 4) RLS & Access

✅ **RLS enabled:** Based on `supabase-schema.sql`, RLS is enabled on `orders` table

✅ **Service role access:** The schema includes policies for service role:
```sql
CREATE POLICY "Service role can manage orders" ON orders
FOR ALL USING (auth.role() = 'service_role');
```

**Confirmation:** Service role key should be able to PATCH `public.orders` without issues.

---

## 5) Upsert vs. Pre-seeded Rows

**Current behavior:** The codebase expects orders to exist in Supabase (inserted by earlier workflows or backend).

**Recommendation:** 
- **Pre-seeded rows (preferred):** Orders should already exist from Workflow 3 or earlier
- W4 should only PATCH existing rows, not create new ones
- If order doesn't exist, W4 should log an error (order should have been created earlier)

**Rationale:** 
- Orders are created when they first enter the system (Workflow 1 or order intake)
- W4 is a fulfillment step, not order creation
- If order doesn't exist, that's a data integrity issue that should be investigated

---

## Recommended Schema Changes

Based on the analysis, here's the minimal migration needed:

```sql
BEGIN;

-- Add fulfillment tracking columns (if they don't exist)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS print_fulfillment_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_fulfillment_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_fulfillment_status text;

-- Add PDF storage columns (R2 keys)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS interior_pdf_r2_key text,
  ADD COLUMN IF NOT EXISTS cover_pdf_r2_key text;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.print_fulfillment_started_at  IS 'W4: timestamp when print fulfillment started';
COMMENT ON COLUMN public.orders.print_fulfillment_finished_at IS 'W4: timestamp when print fulfillment finished';
COMMENT ON COLUMN public.orders.print_fulfillment_status        IS 'W4: status marker (started|completed|error)';
COMMENT ON COLUMN public.orders.interior_pdf_r2_key           IS 'W4: R2 key for interior PDF (use /api/assets/{key} for URL)';
COMMENT ON COLUMN public.orders.cover_pdf_r2_key              IS 'W4: R2 key for cover PDF (use /api/assets/{key} for URL)';

COMMIT;
```

**Note:** This migration uses `IF NOT EXISTS` so it's safe to run even if some columns already exist.

---

## Column Name Mapping (if schema uses camelCase)

If your actual Supabase schema uses **camelCase** (like `database/supabase-schema.sql`), the workflow should use:

- `printFulfillmentStartedAt` instead of `print_fulfillment_started_at`
- `printFulfillmentFinishedAt` instead of `print_fulfillment_finished_at`
- `printFulfillmentStatus` instead of `print_fulfillment_status`
- `interiorPdfR2Key` instead of `interior_pdf_r2_key`
- `coverPdfR2Key` instead of `cover_pdf_r2_key`

**However:** PostgREST (Supabase REST API) typically converts camelCase to snake_case automatically, so using snake_case in the API calls should work regardless.

---

## Final Answers

1. **Identifier columns:** Use `or=(amazon_order_id.eq.:orderId,orderId.eq.:orderId)` to handle both patterns
2. **Fulfillment columns:** Add new columns (`print_fulfillment_started_at`, `print_fulfillment_finished_at`, `print_fulfillment_status`)
3. **PDF columns:** Add new columns (`interior_pdf_r2_key`, `cover_pdf_r2_key`) for R2 keys
4. **Upsert:** **No upsert needed** - orders should already exist (pre-seeded)
5. **RLS:** Service role should have access (verify policy exists)

---

## Next Steps

1. **Run the migration** above to add missing columns
2. **Verify identifier columns** - check which pattern your actual Supabase uses (`orderId` vs `id` + `amazon_order_id`)
3. **Test the query pattern** - verify `or=(amazon_order_id.eq.TEST-ORDER-010,orderId.eq.TEST-ORDER-010)` works
4. **Update workflow** if column names need to be different (camelCase vs snake_case)

---

## Questions for You

1. **Which schema pattern is actually in use?** (camelCase `orderId` PK, or integer `id` PK with `amazon_order_id`?)
2. **Should we use existing URL fields** (`bookPdfUrl`, `coverPdfUrl`) or add new R2 key fields?
3. **Do you want to reuse `lulu_status`** for fulfillment status, or keep it separate for provider-specific status?

