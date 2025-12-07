# CSV Upload Implementation Plan
## Backend Feature: Upload Orders CSV to Populate Customer Data

**Date:** December 6, 2024  
**Status:** Planning  
**Objective:** Build CSV upload system to match shipping information to orders via amazon_order_id and populate Supabase

---

## Overview

Create an admin API endpoint that accepts CSV file uploads from Amazon Seller Central, parses customer data, matches orders by `amazon_order_id`, and updates Supabase with missing customer information (`customer_name`, `customer_email`, `shipping_address`).

---

## Implementation Tasks

### Task 1: Add CSV Parsing Library

**File:** `back-end/package.json`

**Action:** Add CSV parsing dependency
- **Option A:** Use `papaparse` (recommended - robust, handles edge cases)
  ```json
  "papaparse": "^5.4.1"
  ```
- **Option B:** Use built-in Node.js (simpler but less robust)
  - No dependency needed, but requires manual parsing

**Recommendation:** Use `papaparse` for better error handling and edge case support.

**Effort:** 5min

---

### Task 2: Create CSV Upload API Endpoint

**File:** `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts` (new file)

**Endpoint:** `POST /api/admin/amazon-orders/upload-csv`

**Authentication:**
- Use same-origin check pattern (like other admin routes)
- Allow requests from same origin without bearer token
- External requests require authentication

**Request Format:**
- Content-Type: `multipart/form-data`
- Field name: `file` (File object)
- File types: `.csv`, `.txt`
- Max file size: 10MB (configurable)

**Processing Flow:**
1. **Validate Request**
   - Check file exists in form data
   - Validate file type (`.csv` or `.txt`)
   - Validate file size (max 10MB)

2. **Parse CSV**
   - Read file as text
   - Parse CSV using papaparse (or manual parser)
   - Handle headers (first row)
   - Support flexible column names (case-insensitive, with/without hyphens)

3. **Validate Required Columns**
   Required columns (case-insensitive, flexible naming):
   - `amazon-order-id` / `amazon_order_id` / `amazonOrderId` / `order-id`
   - `buyer-name` / `buyer_name` / `buyerName` / `recipient-name`
   - `ship-address-1` / `ship_address_1` / `address1` / `address`
   - `ship-city` / `ship_city` / `city`
   - `ship-state` / `ship_state` / `state`
   - `ship-postal-code` / `ship_postal_code` / `zip` / `postal_code`
   - `ship-country` / `ship_country` / `country` (optional, defaults to 'US')

   Optional columns:
   - `buyer-email` / `buyer_email` / `buyerEmail` / `email`
   - `buyer-phone-number` / `buyer_phone_number` / `phone` / `phone_number`
   - `ship-address-2` / `ship_address_2` / `address2` / `address_line_2`
   - `recipient-name` / `recipient_name` / `ship-to-name`

4. **Process Each Row**
   For each CSV row:
   - Extract `amazon_order_id` (normalize/trim)
   - Query Supabase: `SELECT * FROM orders WHERE amazon_order_id = ?`
   - If order found:
     - Build `shipping_address` JSONB object
     - Update order with:
       - `customer_name` (from `buyer-name` or `recipient-name`)
       - `customer_email` (from `buyer-email` if available)
       - `shipping_address` (JSONB with normalized structure)
     - Track as "matched"
   - If order not found:
     - Track as "pending" (order hasn't arrived via API yet)
   - Handle errors gracefully (log but continue processing)

5. **Build Shipping Address JSONB**
   Structure:
   ```json
   {
     "name": "recipient-name or buyer-name",
     "address": "ship-address-1",
     "address2": "ship-address-2" (optional),
     "city": "ship-city",
     "state": "ship-state",
     "zip": "ship-postal-code",
     "country": "ship-country or 'US'",
     "phone": "buyer-phone-number" (optional)
   }
   ```

6. **Generate Summary**
   Track:
   - Total rows processed
   - Matched orders (successfully updated)
   - Pending orders (not found in Supabase)
   - Errors (with details)

7. **Return Response**
   ```json
   {
     "success": true,
     "summary": {
       "total_rows": 50,
       "matched": 45,
       "pending": 5,
       "errors": 0
     },
     "details": {
       "matched_orders": ["111-1234567-1234567", ...],
       "pending_orders": ["111-9999999-9999999", ...],
       "errors": []
     },
     "timestamp": "2024-12-06T10:30:00Z"
   }
   ```

**Error Handling:**
- Invalid file type → 400 error
- File too large → 400 error
- Missing required columns → 400 error with list of missing columns
- CSV parsing errors → 400 error with details
- Supabase errors → 500 error, but continue processing other rows
- Individual row errors → Log but continue, include in errors array

**Effort:** 3-4 hours

---

### Task 3: Create Helper Functions

**File:** `back-end/src/lib/csv-upload-helpers.ts` (new file)

**Functions:**

1. **`normalizeColumnName(name: string): string`**
   - Convert column names to lowercase
   - Replace hyphens with underscores
   - Handle common variations
   - Returns normalized name for lookup

2. **`findColumnIndex(headers: string[], targetNames: string[]): number | null`**
   - Find column index by trying multiple name variations
   - Case-insensitive matching
   - Returns index or null if not found

3. **`extractAmazonOrderId(row: any, headers: string[]): string | null`**
   - Extract and normalize amazon_order_id from row
   - Trim whitespace
   - Return null if missing/invalid

4. **`buildShippingAddress(row: any, headers: string[]): object | null`**
   - Extract shipping fields from CSV row
   - Build JSONB structure
   - Validate required fields (address, city, state, zip)
   - Return null if incomplete

5. **`validateCsvHeaders(headers: string[]): { valid: boolean, missing: string[] }`**
   - Check for required columns
   - Return validation result with missing columns list

**Effort:** 1-2 hours

---

### Task 4: Update Supabase Client (if needed)

**File:** `back-end/src/lib/supabase-client.ts`

**Check:** Does `updateOrderInSupabase` support updating by `amazon_order_id`?

**Current behavior:** Function accepts `orderId` and tries multiple identifier fields including `amazon_order_id`.

**Action:** Verify it works correctly, or add helper function:
- `updateOrderByAmazonOrderId(amazonOrderId: string, updates: any)`

**Effort:** 30min (if changes needed)

---

### Task 5: Optional: Create Audit Log Table

**File:** `database/migration-csv-upload-logs.sql` (new file)

**Table:** `csv_upload_logs`

**Columns:**
```sql
CREATE TABLE IF NOT EXISTS csv_upload_logs (
  id SERIAL PRIMARY KEY,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by VARCHAR(255), -- Optional: user identifier
  file_name VARCHAR(255),
  file_size INTEGER,
  total_rows INTEGER,
  matched_count INTEGER,
  pending_count INTEGER,
  error_count INTEGER,
  csv_data JSONB, -- Store parsed CSV data for reference
  processing_summary JSONB, -- Store summary statistics
  errors JSONB -- Store error details
);
```

**Benefits:**
- Track upload history
- Debug issues
- Audit trail
- Historical reference

**Implementation:**
- Insert log record after processing
- Store summary and error details
- Optional: Store full CSV data (may be large)

**Effort:** 1 hour (optional)

---

### Task 6: Optional: Auto-trigger w4 for Updated Orders

**File:** `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`

**Logic:**
After successfully updating an order with shipping_address:
- Check if order is ready for print:
  - `execution_status` = 'ready_for_processing' OR
  - `next_workflow` = '4' OR
  - Order has completed workflow 3 (book assembly)
- If ready, update `next_workflow` to '4' and `execution_status` to 'ready_for_processing'
- Router will pick it up automatically

**Alternative:** Don't auto-trigger, let manual action or scheduled job handle it.

**Effort:** 30min (optional)

---

## File Structure

```
back-end/
├── src/
│   ├── app/
│   │   └── api/
│   │       └── admin/
│   │           └── amazon-orders/
│   │               └── upload-csv/
│   │                   └── route.ts (NEW)
│   └── lib/
│       ├── csv-upload-helpers.ts (NEW)
│       └── supabase-client.ts (review/update if needed)
├── package.json (add papaparse)
└── database/
    └── migration-csv-upload-logs.sql (NEW, optional)
```

---

## CSV Field Mapping

### Amazon CSV Column Names → Supabase Fields

| CSV Column (flexible) | Supabase Field | Notes |
|----------------------|----------------|-------|
| `amazon-order-id` / `amazon_order_id` | Match key | Used to find order |
| `buyer-name` / `recipient-name | `customer_name` | Use recipient-name if available, else buyer-name |
| `buyer-email` | `customer_email` | Optional |
| `ship-address-1` | `shipping_address.address` | Required |
| `ship-address-2` | `shipping_address.address2` | Optional |
| `ship-city` | `shipping_address.city` | Required |
| `ship-state` | `shipping_address.state` | Required |
| `ship-postal-code` | `shipping_address.zip` | Required |
| `ship-country` | `shipping_address.country` | Defaults to 'US' |
| `buyer-phone-number` | `shipping_address.phone` | Optional |

### Shipping Address JSONB Structure

```json
{
  "name": "John Doe",
  "address": "123 Main St",
  "address2": "Apt 4B",  // optional
  "city": "San Francisco",
  "state": "CA",
  "zip": "94102",
  "country": "US",
  "phone": "+1-555-123-4567"  // optional
}
```

---

## Error Handling Strategy

1. **File Validation Errors** → Return 400 immediately
2. **CSV Parsing Errors** → Return 400 with error details
3. **Missing Required Columns** → Return 400 with list of missing columns
4. **Individual Row Errors** → Log error, continue processing, include in errors array
5. **Supabase Errors** → Log error, continue processing, include in errors array
6. **Partial Success** → Return 200 with summary showing matched/pending/errors

---

## Testing Considerations

### Unit Tests
- CSV parsing with various formats
- Column name normalization
- Shipping address building
- Error handling

### Integration Tests
- End-to-end upload flow
- Supabase updates
- Order matching
- Edge cases (missing fields, special characters, etc.)

### Edge Cases
- CSV uploaded before API order arrives (pending orders)
- Duplicate CSVs (idempotent - should be safe to re-upload)
- Partial addresses (missing address_line_2)
- International addresses
- Special characters in names/addresses
- Very long addresses
- Empty rows
- Malformed CSV
- Missing required columns
- Multiple rows for same order ID (handle gracefully)

---

## Dependencies

### Required
- CSV parsing library (`papaparse` recommended)
- Supabase client (already exists)
- File upload handling (Next.js FormData)

### Optional
- Audit log table (for tracking)
- Auto-trigger w4 logic

---

## Implementation Order

1. ✅ Add CSV parsing library to package.json
2. ✅ Create helper functions (`csv-upload-helpers.ts`)
3. ✅ Create API endpoint (`upload-csv/route.ts`)
4. ✅ Test with sample CSV
5. ⏳ Optional: Create audit log table
6. ⏳ Optional: Add auto-trigger w4 logic

---

## Estimated Effort

- **Task 1:** 5min
- **Task 2:** 3-4 hours
- **Task 3:** 1-2 hours
- **Task 4:** 30min (if needed)
- **Task 5:** 1 hour (optional)
- **Task 6:** 30min (optional)

**Total:** 5-7 hours (core features)  
**With optional features:** 7-9 hours

---

## Success Criteria

- [ ] CSV file can be uploaded via POST endpoint
- [ ] CSV is parsed correctly with flexible column names
- [ ] Orders are matched by `amazon_order_id`
- [ ] Supabase is updated with customer data
- [ ] Shipping address JSONB structure is correct
- [ ] Summary statistics are returned
- [ ] Errors are handled gracefully
- [ ] Pending orders (not found) are tracked
- [ ] End-to-end test passes

---

## Notes

- CSV field names from Amazon may vary - use flexible matching
- First real CSV upload will verify exact field names
- Consider storing first CSV for reference to confirm field mapping
- Idempotent: Safe to re-upload same CSV (will update existing data)
- No authentication required for same-origin requests (matches other admin routes)

