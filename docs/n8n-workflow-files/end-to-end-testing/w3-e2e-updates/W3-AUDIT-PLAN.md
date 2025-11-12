# Workflow 3 (PNG Assembly) - End-to-End Updates Audit Plan

**Date:** 2025-01-12  
**Purpose:** Audit and plan updates for Workflow 3 to:
1. Ensure dedication message is passed from Router (W1.1) to W3
2. Verify dedication message is added to page00 HTML/CSS
3. Add Supabase upsert node to properly update order status after W3 completion

**Status:** ⏸️ **AWAITING APPROVAL** - Do not proceed with implementation until approved

---

## Current State Analysis

### 1. Router (W1.1) - Dedication Message Passing

**Location:** `docs/n8n-workflow-files/finals/LHB - 1.1- Queue Manager and Router.json`

**Current State:**
- **"Prep Workflow 3 Orders" node** (lines 380-392):
  - Currently passes: `orderId`, `oneManifestKey`, `characterHash`, `orderDbId`, `workflow: '3'`
  - **MISSING:** `dedication_text` field
  - The node receives order data from "Route Orders by Workflow" which includes all order fields from Supabase

**Findings:**
- The "Fetch Ready Orders" node queries Supabase and returns full order objects
- The order objects include `dedication_text` field (from database schema)
- However, "Prep Workflow 3 Orders" does NOT extract or pass `dedication_text` to W3

**Required Changes:**
- Update "Prep Workflow 3 Orders" to extract `dedication_text` from order object
- Add `dedicationText` or `dedication_text` to the payload sent to W3
- Consider: Should we pass it directly OR rely on 1-manifest.json? (Current code suggests 1-manifest.json approach)

---

### 2. Workflow 3 - Dedication Message Handling

**Location:** `docs/n8n-workflow-files/finals/LHB - 3 -PNG Assembly.json`

**Current State:**

#### A. "Normalize Inputs (3A Phase 1)" node (line 684+):
- **Finds dedication from:** `od.dedicationMessage ?? bs.dedicationMessage ?? ''`
- Looks in: `orderDetails.dedicationMessage` or `bookSpecs.dedicationMessage`
- **Issue:** Router doesn't pass `orderDetails` or `bookSpecs` - only minimal fields

#### B. "Generate Complete HTML" node (line 84+):
- **Already has dedication support:**
  - Extracts: `const dedicationMessageRaw = String(inputs.dedicationMessage || '').trim();`
  - Generates page00 HTML with dedication:
    ```javascript
    const p0 = `
    <div class="book-page" id="page-0">
      ${pre0}
      ${bgLayerHTML(bg0)}
      ${dedText ? `<div class="dedication-wrap"><div class="dedication-text">${dedText}</div></div>` : ''}
    </div>`;
    ```
  - **CSS already included:**
    ```css
    .dedication-wrap {
      position: absolute;
      left: ${int(0.15 * PX)}px;
      right: ${int(0.15 * PX)}px;
      top: ${int(0.20 * PX)}px;
      bottom: ${int(0.20 * PX)}px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 5;
    }
    .dedication-text {
      width: 100%;
      text-align: center;
      font-size: ${(26/72) * PX_PER_IN}px;
      line-height: 1.4;
      letter-spacing: 1px;
      color: #312116;
      font-family: 'CustomBook', Arial, sans-serif;
    }
    ```

**Findings:**
- ✅ HTML/CSS for dedication page00 is **already implemented**
- ❌ Dedication message is not being passed from Router
- ❌ "Normalize Inputs" looks in wrong places (`orderDetails`, `bookSpecs`) - Router doesn't pass these

**Required Changes:**
- Option 1: Pass `dedication_text` directly from Router → W3 webhook payload
- Option 2: W3 fetches `dedication_text` from 1-manifest.json (if stored there)
- Option 3: W3 fetches `dedication_text` from Supabase using `orderId`
- **Recommendation:** Option 1 (direct pass) is simplest and most reliable

---

### 3. Workflow 3 - Supabase Upsert

**Location:** `docs/n8n-workflow-files/finals/LHB - 3 -PNG Assembly.json`

**Current State:**
- ❌ **NO Supabase upsert node found** in Workflow 3
- Workflow 3 completes but doesn't update order status in Supabase
- This means:
  - `execution_status` stays `'processing'` (should be `'ready_for_processing'` for W4)
  - `next_workflow` not set to `'4'`
  - `workflow_step` not updated to `'3-complete'` or similar
  - `manifest_3_url` not stored
  - `review_stages.postPdf` not initialized (if needed)

**Findings:**
- Workflow 3 generates manifest and uploads to R2
- But no database update happens
- Router (W1.1) won't pick up orders for W4 because `execution_status` is still `'processing'`

**Required Changes:**
- Add Supabase upsert node after W3 completes successfully
- Should be similar to W2B's "Supabase Upsert 2B" node pattern
- Location: After manifest upload/validation, before final response

---

## Audit Questions to Resolve

### Question 1: Dedication Message Source
**Where should W3 get the dedication message from?**

**Options:**
- **A.** Direct field in webhook payload from Router (`dedicationText` or `dedication_text`)
- **B.** From 1-manifest.json (fetched via `oneManifestUrl` from Router)
- **C.** From Supabase query using `orderId` (W3 queries database itself)

**Current Evidence:**
- Router passes `oneManifestUrl` (signed URL to 1-manifest.json)
- W3's "Extract Manifest URL (3)" node handles manifest URLs
- "Normalize Inputs" currently looks in `orderDetails.dedicationMessage` or `bookSpecs.dedicationMessage`

**Recommendation:** **Option A** - Pass directly from Router for simplicity and reliability

---

### Question 2: Supabase Upsert Location
**Where in W3 workflow should the Supabase upsert node be placed?**

**Options:**
- **A.** After "Build 3A Manifest" (before page generation)
- **B.** After "Collect Page Preview Images" (after all pages generated)
- **C.** After "QA Gate (3A Phase 4)" (after validation passes)
- **D.** After "Acceptance Tests (3A Phase 5)" (final validation)
- **E.** After manifest upload to R2 (final step)

**Current Workflow Flow (from code analysis):**
1. Extract Manifest URL (3)
2. Download 2B Manifest
3. Build Assembly Input From Manifest
4. Get Order Ready for Assembly
5. Load Story & Character Poses (3A)
6. Normalize Inputs (3A Phase 1)
7. Resolve Asset Paths (3A Phase 1)
8. Generate Complete HTML
9. Generate Page Preview Images
10. Poll PDFMonkey Image until ready
11. Collect Page Preview Images
12. Build 3A Manifest
13. QA Gate (3A Phase 4)
14. Acceptance Tests (3A Phase 5)
15. Upload Manifest to R2
16. (No Supabase update)

**Recommendation:** **Option E** - After manifest upload to R2, ensuring we have the manifest URL to store

---

### Question 3: Supabase Upsert Fields
**What fields should be updated in the Supabase upsert?**

**Based on W2B pattern, should include:**
- `orderId` / `amazon_order_id` (for matching)
- `manifest_3_url` (URL to 3-manifest.json in R2)
- `workflow_step` (e.g., `'3-complete'` or `'png-assembly-complete'`)
- `next_workflow` (set to `'4'` for print fulfillment)
- `execution_status`:
  - If review needed: `'processing'` (stays until approval)
  - If no review needed: `'ready_for_processing'` (router picks up for W4)
- `status` (overall order status, e.g., `'pending_pdf_review'` or `'pending_print'`)
- `updated_at` (timestamp)
- `review_stages.postPdf` (if review system is used):
  - `status`: `'in-review'` or `'ready'`
  - `needsHumanReview`: boolean
  - Other review metadata

**Additional Considerations:**
- Should we preserve `review_stages.preBria` and `review_stages.postBria`? (Yes - use fetch-and-merge pattern like W2B)
- Should we clear `started_at` and `current_workflow` when ready for next workflow?
- Should we set `queued_at` when ready for W4?

---

## Implementation Plan (Pending Approval)

### Phase 1: Router Updates (W1.1)

**File:** `docs/n8n-workflow-files/finals/LHB - 1.1- Queue Manager and Router.json`

**Node to Update:** "Prep Workflow 3 Orders" (lines 380-392)

**Changes:**
```javascript
// Current code extracts minimal fields
// ADD: Extract dedication_text from order object
return orders3.map(order => ({
  json: {
    orderId: order.amazon_order_id,
    oneManifestKey: `${prefix}/${order.amazon_order_id}/manifests/1-manifest.json`,
    characterHash: order.character_hash,
    orderDbId: order.id,
    workflow: '3',
    // NEW: Add dedication text
    dedicationText: order.dedication_text || null
  }
}));
```

**Verification:**
- Test that `dedicationText` appears in webhook payload to W3
- Verify it's available in W3's webhook trigger node

---

### Phase 2: Workflow 3 - Dedication Message Integration

**File:** `docs/n8n-workflow-files/finals/LHB - 3 -PNG Assembly.json`

**Node to Update:** "Normalize Inputs (3A Phase 1)" (line 684+)

**Changes:**
```javascript
// Current code:
const dedicationRaw = od.dedicationMessage ?? bs.dedicationMessage ?? '';

// UPDATE to also check top-level dedicationText from Router:
const dedicationRaw = 
  order.dedicationText ??           // NEW: From Router webhook payload
  od.dedicationMessage ?? 
  bs.dedicationMessage ?? 
  '';
```

**Verification:**
- Test that dedication appears in `inputs.dedicationMessage`
- Verify page00 HTML includes dedication text
- Check that CSS formatting is correct

**Note:** The "Generate Complete HTML" node already handles dedication correctly - no changes needed there.

---

### Phase 3: Workflow 3 - Supabase Upsert Node

**File:** `docs/n8n-workflow-files/finals/LHB - 3 -PNG Assembly.json`

**New Node:** "Supabase Upsert 3" (similar to W2B's pattern)

**Location:** After "Upload Manifest to R2" node, before final response

**Implementation Pattern (based on W2B):**
1. **"Fetch and Merge Review Stages" node** (if review_stages need updating):
   - Fetch existing `review_stages` from Supabase
   - Merge new `postPdf` data with existing stages
   - Preserve `preBria` and `postBria` stages

2. **"Supabase Upsert 3" node:**
   - Update order with:
     - `manifest_3_url`: URL to uploaded manifest
     - `workflow_step`: `'3-complete'` or `'png-assembly-complete'`
     - `next_workflow`: `'4'`
     - `execution_status`: Based on review needs
     - `status`: Overall order status
     - `review_stages`: Merged review stages (if applicable)
     - `updated_at`: Current timestamp
     - Clear `started_at`, `current_workflow` if ready for next workflow
     - Set `queued_at` if ready for next workflow

**Verification:**
- Test that order status updates correctly in Supabase
- Verify `next_workflow` is set to `'4'`
- Verify `execution_status` is correct based on review needs
- Verify Router (W1.1) can pick up order for W4

---

## Testing Checklist

### Pre-Implementation
- [ ] Review current Router (W1.1) "Prep Workflow 3 Orders" node
- [ ] Review current W3 "Normalize Inputs" node
- [ ] Review current W3 "Generate Complete HTML" node (verify dedication CSS)
- [ ] Check if 1-manifest.json contains dedication_text
- [ ] Verify Supabase `dedication_text` column exists and has data

### Post-Implementation
- [ ] Test Router passes `dedicationText` to W3
- [ ] Test W3 receives `dedicationText` in webhook payload
- [ ] Test "Normalize Inputs" extracts dedication correctly
- [ ] Test page00 HTML includes dedication text
- [ ] Test page00 CSS formatting is correct
- [ ] Test Supabase upsert updates order correctly
- [ ] Test `next_workflow` is set to `'4'`
- [ ] Test `execution_status` is set correctly
- [ ] Test Router (W1.1) picks up order for W4 after W3 completes

---

## Answers to Open Questions

### Question 1: Dedication Message Source
**Answer:** Pass directly from Router (Option A) - Most reliable and simple

**Rationale:**
- Router already has access to `dedication_text` from Supabase query
- No need to fetch 1-manifest.json just for dedication
- Direct pass is faster and more reliable
- Can still use 1-manifest.json as fallback if needed

### Question 2: Does W3 need review_stages.postPdf?
**Answer:** **YES** - W3 should set `review_stages.postPdf` similar to W2B pattern

**Findings from codebase:**
- `review_stages.postPdf` is part of the review system
- Status values: `'pending'`, `'in-review'`, `'ready'`, `'approved'`, `'rejected'`, `'flagged'`
- When `postPdf.status === 'approved'`: Order goes to `PENDING_CUSTOMER_APPROVAL` or `PENDING_PRINT`
- When `postPdf.status === 'ready'` or `'in-review'`: Order goes to `PENDING_ASSEMBLY_REVIEW`
- **Important:** postPdf approval doesn't trigger router - goes directly to print (per `approval-store.ts` line 102)

**Required Fields:**
- `status`: `'in-review'` (if review needed) or `'ready'` (if no review needed)
- `needsHumanReview`: boolean (determines if admin review is required)
- Preserve existing `preBria` and `postBria` stages (use fetch-and-merge pattern like W2B)

### Question 3: What should `workflow_step` be set to after W3?
**Answer:** `'book_assembly_completed'` (matches existing backend webhook pattern)

**Evidence:**
- `back-end/src/app/api/webhooks/workflow-3-complete/route.ts` sets `workflow_step: 'book_assembly_completed'`
- `back-end/src/constants/statuses.ts` has `WorkflowStep.BOOK_ASSEMBLY_COMPLETED = 'book_assembly_completed'`
- `back-end/src/lib/status-service.ts` maps `'book_assembly_completed'` → `PENDING_ASSEMBLY_REVIEW`

### Question 4: What should `status` be set to after W3?
**Answer:** Based on review needs:
- If review needed: `'pending_assembly_review'` (from `OrderStatus.PENDING_ASSEMBLY_REVIEW`)
- If no review needed: `'pending_customer_approval'` or `'pending_print'` (depends on customer approval requirement)

**Evidence from status-service.ts:**
- `workflow_step === 'book_assembly_completed'` → `PENDING_ASSEMBLY_REVIEW`
- `postPdf.status === 'approved'` → `PENDING_CUSTOMER_APPROVAL` or `PENDING_PRINT`
- `postPdf.status === 'ready'` or `'in-review'` → `PENDING_ASSEMBLY_REVIEW`

**Recommendation:** Set `status` based on `review_stages.postPdf.status`:
- If `postPdf.status === 'ready'` (no review): `'pending_customer_approval'` or `'pending_print'`
- If `postPdf.status === 'in-review'` (review needed): `'pending_assembly_review'`

### Question 5: Should W3 set `review_stages.postPdf` even if no review is needed?
**Answer:** **YES** - Always set it, similar to W2B pattern

**Rationale:**
- Consistent with W2B behavior (always sets `postBria`)
- Status can be `'ready'` if no review needed, `'in-review'` if review needed
- This allows the status service to correctly calculate order status
- Approval system expects `postPdf` to exist before approval can happen

---

## Additional Findings

### Router Node Analysis

#### 1. "Get Signed URL (1‑manifest)" Node
**Purpose:** Fetches a signed URL for 1-manifest.json from R2 private bucket

**How it works:**
- Takes `oneManifestKey` (e.g., `book-mvp-simple-adventure/orders/E2E-002/manifests/1-manifest.json`)
- Calls backend API: `https://admin.littleherolabs.com/api/r2/signed-url`
- Returns signed URL with TTL (default 600 seconds)
- Used by W3 and W4 to access private manifest files

**For W3:**
- Currently used to get 1-manifest.json (may contain dedication_text)
- **Recommendation:** Still use this for 1-manifest.json, but ALSO pass `dedication_text` directly from Router for reliability

#### 2. "Verify Order Claimed (2B)" Node
**Purpose:** Prevents duplicate workflow triggers (race condition protection)

**How it works:**
- After "Mark as Processing (2B)" PATCH, checks if it succeeded
- If PATCH returns empty array → order was already claimed by another router cycle
- Returns empty output → stops execution (prevents duplicate trigger)
- If PATCH succeeded → passes through data to trigger workflow

**For W3:**
- **YES, we need this** - Add "Verify Order Claimed (3)" node after "Mark as Processing (3)"
- Prevents duplicate W3 triggers if multiple router cycles run simultaneously
- Same pattern as 2B

---

## Updated Implementation Plan

### Phase 1: Router Updates (W1.1)

**File:** `docs/n8n-workflow-files/finals/LHB - 1.1- Queue Manager and Router.json`

#### Update 1: "Prep Workflow 3 Orders" node (lines 380-392)
**Add `dedication_text` to payload:**
```javascript
return orders3.map(order => ({
  json: {
    orderId: order.amazon_order_id,
    oneManifestKey: `${prefix}/${order.amazon_order_id}/manifests/1-manifest.json`,
    characterHash: order.character_hash,
    orderDbId: order.id,
    workflow: '3',
    // NEW: Add dedication text
    dedicationText: order.dedication_text || null
  }
}));
```

#### Update 2: Add "Verify Order Claimed (3)" node
**Location:** After "Mark as Processing (3)", before "Trigger Workflow 3"

**Code:**
```javascript
// Verify Order Claimed (3)
// Check if the PATCH succeeded - if empty array, order was already claimed

const markResult = $input.first().json || {};
const isArray = Array.isArray(markResult);
const hasData = isArray ? markResult.length > 0 : (markResult && Object.keys(markResult).length > 0);

if (!hasData) {
  console.log('⚠️ Order already claimed by another router cycle - skipping trigger');
  return []; // Empty output stops execution
}

console.log('✅ Order successfully claimed - proceeding to trigger');
const orderData = isArray ? markResult[0] : markResult;

// Pass through original routing data
const prepData = $('Prep Workflow 3 Orders').first().json;
return [{
  json: {
    ...prepData,
    orderDbId: orderData.id || prepData.orderDbId,
    claimedAt: orderData.started_at
  }
}];
```

**Update connections:**
- "Mark as Processing (3)" → "Verify Order Claimed (3)"
- "Verify Order Claimed (3)" → "Get Signed URL (1‑manifest)"
- "Get Signed URL (1‑manifest)" → "Trigger Workflow 3"

---

### Phase 2: Workflow 3 - Dedication Message Integration

**File:** `docs/n8n-workflow-files/finals/LHB - 3 -PNG Assembly.json`

#### Update: "Normalize Inputs (3A Phase 1)" node (line 684+)
**Add top-level `dedicationText` check:**
```javascript
// Current code:
const dedicationRaw = od.dedicationMessage ?? bs.dedicationMessage ?? '';

// UPDATE to also check top-level dedicationText from Router:
const dedicationRaw = 
  order.dedicationText ??           // NEW: From Router webhook payload
  od.dedicationMessage ?? 
  bs.dedicationMessage ?? 
  '';
```

**Note:** "Generate Complete HTML" node already handles dedication correctly - no changes needed.

---

### Phase 3: Workflow 3 - Supabase Upsert Node

**File:** `docs/n8n-workflow-files/finals/LHB - 3 -PNG Assembly.json`

#### New Node 1: "Fetch and Merge Review Stages (3)"
**Location:** After "Upload Manifest to R2", before Supabase upsert

**Purpose:** Preserve `preBria` and `postBria` stages when updating `postPdf`

**Code Pattern:** Same as W2B's "Fetch and Merge Review Stages" node, but:
- Fetches existing `review_stages` from Supabase
- Merges new `postPdf` data with existing stages
- Preserves `preBria` and `postBria` stages

#### New Node 2: "Supabase Upsert 3"
**Location:** After "Fetch and Merge Review Stages (3)", before final response

**Fields to Update:**
```javascript
{
  orderId: amazonOrderId,
  amazon_order_id: amazonOrderId,
  manifest_3_url: manifestUrl,
  workflow_step: 'book_assembly_completed',
  next_workflow: '4',  // Always set to '4' (approval triggers W4, not router)
  status: needsReview ? 'pending_assembly_review' : 'pending_customer_approval',
  review_stages: mergedReviewStages,  // From Fetch and Merge node
  execution_status: needsReview ? 'processing' : 'ready_for_processing',
  // Clear processing state when ready for next workflow
  ...(needsReview ? {} : {
    started_at: null,
    current_workflow: null,
    queued_at: new Date().toISOString(),
  }),
  updated_at: new Date().toISOString(),
}
```

**Important Notes:**
- `next_workflow` is always `'4'`, but Router won't pick it up automatically
- `postPdf` approval triggers W4 directly (doesn't use router)
- If review needed: `execution_status = 'processing'` (stays until approval)
- If no review: `execution_status = 'ready_for_processing'` (but Router won't pick up - approval button triggers W4)

---

## Key Insights

1. **1-manifest.json signed URL:** Used for accessing private manifest files, but dedication should be passed directly from Router for reliability

2. **Verify Order Claimed:** Critical for preventing duplicate triggers - needed for W3

3. **review_stages.postPdf:** Always set it (like W2B does with postBria), status determines if review is needed

4. **Status flow after W3:**
   - W3 completes → `workflow_step: 'book_assembly_completed'`
   - Sets `review_stages.postPdf.status: 'in-review'` or `'ready'`
   - Status calculated: `PENDING_ASSEMBLY_REVIEW` (if review) or `PENDING_CUSTOMER_APPROVAL` (if no review)
   - Admin/customer approval → triggers W4 (not via router)

5. **W4 trigger:** postPdf approval doesn't use router - goes directly to print workflow

---

## Next Steps (After Approval)

1. **Get answers to open questions** from user
2. **Update Router (W1.1)** - Add dedication_text to payload
3. **Update W3 "Normalize Inputs"** - Extract dedication from Router payload
4. **Add Supabase upsert to W3** - Based on answers to open questions
5. **Test end-to-end flow** - Router → W3 → Supabase → Router → W4
6. **Update documentation** - Session summary and workflow docs

---

**Status:** ⏸️ **AWAITING USER APPROVAL TO PROCEED**

