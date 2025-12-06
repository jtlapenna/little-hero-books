# Little Hero Labs - Amazon RDT/CSV Migration Project
## Project Overview & Implementation Plan

**Project Start Date:** December 6, 2024  
**Status:** Planning / Audit Phase  
**Owner:** Jeff (TPB/LHL)

---

## Executive Summary

Due to Amazon's requirement to apply for RDT (Restricted Data Token) access to receive customer PII (name, address, phone) via the SP-API, Little Hero Labs must migrate from a fully-automated API-based order intake system to a semi-automated workflow that uses daily CSV downloads from Amazon Seller Central.

**Current State:** Orders arrive via Amazon API → n8n workflows process everything automatically  
**Future State:** Orders arrive via API (book data only) → CSV uploaded daily → Customer data populated → Workflows continue

**Key Constraint:** We will NOT apply for RDT access. Instead, we use manual CSV uploads to populate customer information.

---

## Problem Statement

### What Changed
Amazon requires sellers to apply for and receive RDT approval before accessing customer PII through the SP-API. Without RDT access:
- We cannot receive customer name via API
- We cannot receive shipping address via API  
- We cannot receive phone number via API

### What This Breaks
- **w0 (Order Intake):** Currently expects to receive complete customer data from Amazon API
- **Print Submission (w4):** Requires shipping address to submit orders to Lulu
- **Any notifications:** May reference customer data that won't exist initially

### Business Impact
- Orders can still be created and processed through character generation
- Print fulfillment will be delayed until CSV is uploaded (max 24-hour delay)
- Manual CSV upload adds operational overhead (once daily)

---

## Current Architecture

### Order Lifecycle (Before Migration)
```
1. Amazon API → LHL API (w0 webhook)
   ├─ Order data received (ALL fields including customer PII)
   ├─ Supabase record created with complete data
   └─ Triggers workflow chain

2. w0 → w1.1 → w2 → w3
   ├─ Character generation
   ├─ Pose creation
   ├─ Book assembly
   └─ QA validation

3. w4 (Print Fulfillment)
   ├─ Reads shipping_address from Supabase
   └─ Submits to Lulu with customer details
```

### Supabase Schema: `orders` Table

**Customer PII Fields (will be NULL initially):**
- `customer_name` - varchar(255), nullable
- `customer_email` - varchar(255), nullable
- `shipping_address` - jsonb, nullable

**Order Matching Field:**
- `amazon_order_id` - varchar(50), nullable, UNIQUE

**Current State:** All nullable, no NOT NULL constraints ✓

---

## Target Architecture

### Order Lifecycle (After Migration)
```
1. Amazon API → LHL API (w0 webhook)
   ├─ Order data received (ONLY book/customization data)
   ├─ Supabase record created (customer fields = NULL)
   └─ Triggers workflow chain

2. w0 → w1.1 → w2 → w3
   ├─ Character generation (proceeds without customer data)
   ├─ Pose creation
   ├─ Book assembly
   └─ QA validation
   └─ Status: ready_for_print (but shipping_address still NULL)

3. CSV Upload (Once Daily)
   ├─ Download CSV from Amazon Seller Central
   ├─ Upload to LHL backend
   ├─ Backend parses CSV
   ├─ Matches amazon_order_id to Supabase records
   ├─ Updates customer_name, customer_email, shipping_address
   └─ Triggers w4 for matched orders

4. w4 (Print Fulfillment) - UPDATED LOGIC
   ├─ Check: Is shipping_address populated?
   ├─ If YES → Submit to Lulu
   ├─ If NO → Skip/queue for retry after CSV upload
   └─ Success → Mark as shipped
```

### CSV Processing Flow
```
┌─────────────────────────────────────────────────────────┐
│  Manual Step: Download CSV from Seller Central          │
│  - Orders → Order Reports → Request Report              │
│  - Download unshipped/all orders CSV                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  LHL Backend: CSV Upload Page                           │
│  - Drag/drop CSV file                                   │
│  - Parse CSV (Papa Parse or similar)                    │
│  - Extract customer data fields                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Backend Processing                                     │
│  For each CSV row:                                      │
│    1. Extract amazon-order-id                           │
│    2. Query Supabase: WHERE amazon_order_id = ?         │
│    3. If match found:                                   │
│       - UPDATE customer_name                            │
│       - UPDATE customer_email (if available)            │
│       - UPDATE shipping_address (as JSONB)              │
│       - Log: SUCCESS                                    │
│    4. If no match:                                      │
│       - Log: PENDING (order hasn't come through API yet)│
│  Generate summary report                                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Display Results to User                                │
│  - Total rows processed: 50                             │
│  - Successfully matched: 45                             │
│  - Not found (pending): 5                               │
│  - Errors: 0                                            │
│  - Download error log (if any)                          │
└─────────────────────────────────────────────────────────┘
```

---

## Amazon CSV Format

### Expected Fields from Seller Central Order Report
Based on Amazon SP-API documentation, the CSV should include:

**Order Matching:**
- `amazon-order-id` - Unique order identifier

**Customer Information:**
- `buyer-name` - Customer full name
- `buyer-email` - Customer email (may not always be available)
- `buyer-phone-number` - Customer phone

**Shipping Address:**
- `recipient-name` - Ship-to name (may differ from buyer)
- `ship-address-1` - Address line 1
- `ship-address-2` - Address line 2 (optional)
- `ship-city` - City
- `ship-state` - State/Province
- `ship-postal-code` - ZIP/Postal code
- `ship-country` - Country code

**Note:** Exact field names will be confirmed upon first CSV download.

### Shipping Address JSONB Structure (Proposed)
```json
{
  "recipient_name": "John Doe",
  "address_line_1": "123 Main St",
  "address_line_2": "Apt 4B",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94102",
  "country": "US",
  "phone": "+1-555-123-4567"
}
```

---

## Implementation Plan

### PHASE 1: AUDIT & DISCOVERY ⏳ Current Phase

**Objective:** Understand exactly what needs to change and where

**Tasks:**
1. ✅ Document current schema (completed)
2. ✅ Identify customer data fields (completed)
3. ⏳ Review w0 workflow
   - Where does it receive customer data from API?
   - Where does it write customer data to Supabase?
   - What validation/processing happens on customer data?
4. ⏳ Review w1.1, w2, w3 workflows
   - Do any of these reference customer data? (should not)
   - Any dependencies on shipping_address being populated?
5. ⏳ Review w4 workflow
   - How does it read shipping_address?
   - What happens if shipping_address is NULL?
   - What format does Lulu API expect?
6. ⏳ Review sub-workflows (sw0, sw1, sw2, sw3)
   - Any customer data references?
7. ⏳ Review API endpoints
   - Any endpoints that return customer data?
   - Any webhooks that include customer data?
8. ⏳ Review notifications/status updates
   - Any emails/webhooks that include customer info?
9. ⏳ Download first Amazon CSV
   - Confirm exact field names
   - Confirm data format
   - Verify amazon-order-id uniqueness

**Deliverables:**
- Complete workflow audit report
- List of all code changes needed
- Confirmed CSV field mapping

---

### PHASE 2: WORKFLOW MODIFICATIONS

**Objective:** Update existing workflows to handle missing customer data gracefully

#### Task 2.1: Modify w0 (Order Intake)
**Changes Needed:**
- Remove API payload parsing for customer_name, customer_email, shipping_address
- Update Supabase INSERT to set these fields to NULL
- Remove any validation that requires customer data
- Ensure order can proceed to w1.1 without customer data

**Testing:**
- Simulate API webhook with no customer data
- Verify order created in Supabase with NULL customer fields
- Verify w1.1 triggers successfully

#### Task 2.2: Verify w1.1, w2, w3 (No Changes Expected)
**Changes Needed:** 
- None expected, but audit to confirm
- These workflows should only handle character/book generation

**Testing:**
- Verify workflows run successfully with NULL customer fields

#### Task 2.3: Modify w4 (Print Fulfillment)
**Changes Needed:**
- Add pre-flight check: `IF shipping_address IS NULL → SKIP`
- Add logging for skipped orders
- Update retry logic to check for populated shipping_address
- Consider: Trigger w4 automatically when CSV populates address

**Testing:**
- Test with NULL shipping_address (should skip)
- Test with populated shipping_address (should submit to Lulu)
- Test Lulu API with new JSONB format

#### Task 2.4: Review & Update Sub-workflows
**Changes Needed:**
- TBD based on audit findings

---

### PHASE 3: CSV UPLOAD SYSTEM - BACKEND

**Objective:** Build the CSV processing system in your existing backend (no n8n)

#### Task 3.1: Create Upload Page UI
**Location:** LHL Backend (existing system)

**Features:**
- File upload (drag/drop or browse)
- File type validation (.csv, .txt only)
- File size limit (reasonable max)
- Upload button with loading state
- Results display area

**Tech Stack:** Your existing backend framework

#### Task 3.2: Build CSV Parser API Endpoint
**Endpoint:** `POST /api/admin/amazon-orders/upload-csv`

**Request:**
- Multipart form data with CSV file
- Authentication required (admin only)

**Processing Logic:**
```javascript
1. Validate file type and size
2. Parse CSV (using Papa Parse or similar)
3. Validate required columns exist:
   - amazon-order-id
   - buyer-name
   - ship-address-1
   - ship-city
   - ship-state
   - ship-postal-code
   - ship-country
4. For each row:
   a. Extract amazon_order_id
   b. Query Supabase: SELECT id FROM orders WHERE amazon_order_id = ?
   c. If found:
      - Build shipping_address JSONB
      - UPDATE orders SET 
          customer_name = ?,
          customer_email = ?,
          shipping_address = ?
        WHERE amazon_order_id = ?
      - Log success
   d. If not found:
      - Log as "pending" (order hasn't arrived via API yet)
   e. Handle errors gracefully
5. Generate summary statistics
6. Store CSV in Supabase for audit trail (optional)
7. Return results
```

**Response:**
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

#### Task 3.3: Create Audit Log Table (Optional but Recommended)
**Table:** `csv_upload_logs`

**Columns:**
- `id` - serial primary key
- `uploaded_at` - timestamp
- `uploaded_by` - user id/name
- `file_name` - varchar
- `total_rows` - integer
- `matched_count` - integer
- `pending_count` - integer
- `error_count` - integer
- `csv_data` - jsonb (store entire CSV for reference)
- `processing_summary` - jsonb

**Benefits:**
- Track when CSVs were uploaded
- Debug issues with specific uploads
- Historical record of customer data population

#### Task 3.4: Optional: Auto-trigger w4 for Updated Orders
**Logic:**
After successfully updating an order with shipping_address:
- Check if order status indicates it's ready for print
- If yes, trigger w4 via webhook or queue
- If no, order will be picked up in next w4 batch run

---

### PHASE 4: TESTING & VALIDATION

#### Task 4.1: Unit Testing
- Test CSV parser with various file formats
- Test Supabase UPDATE logic
- Test error handling (malformed CSV, missing fields, etc.)

#### Task 4.2: Integration Testing
- Test end-to-end flow:
  1. Order arrives via API (no customer data)
  2. Order processes through w0 → w1.1 → w2 → w3
  3. CSV uploaded with customer data
  4. Order updated in Supabase
  5. w4 runs and submits to Lulu
  6. Order marked as shipped

#### Task 4.3: Edge Case Testing
- CSV uploaded before API order arrives (pending orders)
- Duplicate CSVs uploaded (should be idempotent)
- Partial addresses (missing address_line_2, etc.)
- International addresses
- Special characters in names/addresses
- Very long addresses

---

### PHASE 5: DEPLOYMENT & OPERATIONS

#### Task 5.1: Deploy Code Changes
- Deploy modified workflows (w0, w4)
- Deploy new CSV upload system
- Update any affected API endpoints

#### Task 5.2: Create Operations Documentation
**Daily CSV Upload Procedure:**
1. Log into Amazon Seller Central
2. Navigate to: Orders → Order Reports
3. Select: Unshipped Orders (or All Orders)
4. Date range: Last 2 days (or appropriate range)
5. Click: Request Report
6. Wait for report generation
7. Download CSV file
8. Log into LHL Backend
9. Navigate to: Admin → CSV Upload
10. Upload CSV file
11. Review results
12. If errors, investigate and re-upload if needed

#### Task 5.3: Monitoring & Alerts
**Key Metrics to Track:**
- Number of orders with NULL shipping_address
- Time between order creation and shipping_address population
- CSV upload frequency
- Match rate (matched vs pending)

**Alerts:**
- If orders remain without shipping_address for > 48 hours
- If CSV hasn't been uploaded in > 24 hours
- If match rate drops below expected threshold

---

## Open Questions & Decisions Needed

### Questions for Resolution

1. **CSV Download Frequency**
   - Decision needed: How often will CSV be downloaded?
   - Recommendation: Once daily (morning) to minimize print delay
   - Alternative: Twice daily if order volume increases

2. **Unmatched Orders Handling**
   - Question: What to do with CSV rows that don't match any Supabase orders?
   - Scenarios:
     - CSV downloaded before API webhook arrives (timing issue)
     - Order cancelled before webhook sent
     - Test orders in Amazon
   - Decision needed: Log and ignore? Queue for retry? Alert?

3. **Address Validation**
   - Question: Should we validate addresses before submitting to Lulu?
   - Options:
     - Basic validation (required fields present)
     - Format validation (ZIP code format, state codes)
     - API validation (USPS address validation)
   - Decision needed: Level of validation required

4. **Existing Orders**
   - Question: Any existing test orders in system that need customer data?
   - Action: May need to manually populate or clear these orders

5. **Shipping Address JSONB Format**
   - Question: What exact structure will be confirmed after first CSV download
   - Action: Must align with Lulu API requirements
   - Note: Will finalize in Phase 1

6. **Error Recovery**
   - Question: If CSV upload fails mid-process, what's the recovery?
   - Options:
     - Rollback transaction
     - Continue with partial updates
     - Track which orders were updated
   - Recommendation: Use database transaction, rollback on error

7. **Multiple Line Items per Order**
   - Question: Can one amazon_order_id have multiple line items?
   - Impact: If yes, CSV will have multiple rows per order ID
   - Decision needed: How to handle (likely same address for all items)

---

## Success Criteria

**Phase 1 Complete When:**
- [ ] All workflows reviewed and documented
- [ ] All customer data touchpoints identified
- [ ] First Amazon CSV downloaded and format confirmed
- [ ] Detailed task list created for Phase 2

**Phase 2 Complete When:**
- [ ] w0 modified to accept orders without customer data
- [ ] w4 modified to check for NULL shipping_address
- [ ] All workflow tests pass
- [ ] No regressions in existing functionality

**Phase 3 Complete When:**
- [ ] CSV upload page functional
- [ ] CSV parsing working correctly
- [ ] Supabase updates working correctly
- [ ] Results display working
- [ ] Error handling robust

**Phase 4 Complete When:**
- [ ] All unit tests pass
- [ ] End-to-end integration test successful
- [ ] Edge cases handled gracefully

**Phase 5 Complete When:**
- [ ] Code deployed to production
- [ ] Operations documentation created
- [ ] First real CSV successfully processed
- [ ] Monitoring and alerts configured

**Project Complete When:**
- [ ] Orders can flow from API → workflows without customer data
- [ ] CSV can be uploaded and customer data populated
- [ ] Orders with populated addresses successfully submit to Lulu
- [ ] System running smoothly for 1 week with real orders

---

## Risk Assessment

### High Priority Risks

**Risk 1: Timing Mismatch**
- **Issue:** CSV downloaded before API webhook arrives
- **Impact:** Orders won't match, customer data won't populate
- **Mitigation:** 
  - Track "pending" orders separately
  - Allow re-upload of same CSV
  - Set reasonable time window (48 hours)

**Risk 2: CSV Format Changes**
- **Issue:** Amazon changes CSV field names or structure
- **Impact:** Parser breaks, no customer data populated
- **Mitigation:**
  - Flexible parsing with field mapping
  - Validation errors surface immediately
  - Document expected format clearly

**Risk 3: Address Format Issues**
- **Issue:** Address doesn't match Lulu's expected format
- **Impact:** Print submission fails
- **Mitigation:**
  - Test with various address formats
  - Add validation before Lulu submission
  - Graceful error handling with human review

**Risk 4: Operational Overhead**
- **Issue:** Manual CSV upload adds daily task, could be forgotten
- **Impact:** Print fulfillment delayed
- **Mitigation:**
  - Clear documentation
  - Automated reminders/alerts
  - Make process as simple as possible
  - Consider future automation (when RDT approved)

### Medium Priority Risks

**Risk 5: International Orders**
- **Issue:** Different address formats, validation requirements
- **Impact:** May need special handling
- **Mitigation:** Test with international addresses early

**Risk 6: Data Privacy**
- **Issue:** CSV contains PII, needs secure handling
- **Impact:** Compliance/security concerns
- **Mitigation:**
  - Secure file upload (HTTPS)
  - Don't store CSV permanently (or encrypt if stored)
  - Limit access to admin users only

---

## Future Enhancements

### Short-term (After Initial Implementation)
- Automatic CSV download using Amazon SP-API (non-PII endpoints)
- Scheduled batch processing (if CSV can be auto-downloaded)
- Better error reporting and retry mechanisms
- Dashboard showing orders pending customer data

### Long-term (6+ months)
- Apply for RDT access to return to fully automated system
- Real-time address validation
- Customer notification when order is shipped
- Analytics on order processing times

---

## Timeline Estimate

**Aggressive Timeline:**
- Phase 1 (Audit): 2-3 days
- Phase 2 (Workflow Mods): 2-3 days  
- Phase 3 (CSV System): 3-4 days
- Phase 4 (Testing): 2-3 days
- Phase 5 (Deploy): 1 day
- **Total: 10-14 days**

**Conservative Timeline:**
- Phase 1 (Audit): 3-5 days
- Phase 2 (Workflow Mods): 4-5 days
- Phase 3 (CSV System): 5-7 days
- Phase 4 (Testing): 3-5 days
- Phase 5 (Deploy): 2 days
- **Total: 17-24 days**

**Recommended Approach:** Conservative timeline with buffer for unknowns discovered during audit

---

## Document History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2024-12-06 | 1.0 | Initial draft | Claude |

---

## Next Steps

1. **Review this document** - Confirm approach and plan
2. **Begin Phase 1 Audit** - Share workflows for review
3. **Download first CSV** - Confirm exact field format
4. **Refine implementation plan** - Based on audit findings

---

## Notes & Assumptions

- Assuming Little Hero Labs will NOT apply for RDT access
- Assuming CSV upload will be done once daily (morning preferred)
- Assuming customer data in CSV will match order within 24-48 hours
- Assuming shipping_address JSONB structure will match Lulu requirements
- Assuming backend has CSV parsing capability (or can add it easily)
- Assuming admin users will have access to upload CSV
- No changes assumed for character generation, pose creation, or book assembly workflows
