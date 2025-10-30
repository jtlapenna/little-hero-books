# Workflow 2B Coordination - Backend Response

**Date:** October 29, 2025  
**Response To:** Workflow 2B Integration Coordination Document  
**From:** Backend/Human-in-the-Loop System Team  
**Status:** Ready for Integration Planning

---

## 📋 Executive Summary

Thank you for the comprehensive coordination document and audit report. After reviewing the current backend infrastructure, human-in-the-loop system, and your workflow 2B requirements, this document provides:

1. **Current Infrastructure Reality** - What actually exists vs. assumptions
2. **Direct Answers** - Responses to your 12 critical questions
3. **Integration Strategy** - Recommended approach aligned with existing systems
4. **Implementation Roadmap** - What needs to be built for integration
5. **Recommendations** - Based on audit findings and current architecture

**Key Correction:** ✅ **We ARE using Supabase!** The schema is fully defined (`docs/database/little-hero-books-schema.sql`), n8n workflows are configured with Supabase credentials, and backend integration is in progress (currently using temporary file-based storage for approvals).

---

## 🔍 Critical Infrastructure Clarification

### **✅ We ARE Using Supabase - Dual Architecture with R2**

Your coordination document correctly assumes we're using Supabase. **Supabase is the authoritative database** for order tracking and workflow state.

**Actual Architecture:**
- ✅ **Supabase PostgreSQL** - Primary database for order metadata, workflow state, and approvals
- ✅ **Cloudflare R2** - Storage for assets (images, PDFs) and manifest files
- ⚠️ **File-based approval store** - Currently `approvals.json` (MVP/temporary) - **Will migrate to Supabase**
- ✅ **order.json in R2** - Complementary metadata cache (synced with Supabase)

**Why This Matters:**
- Your Supabase schema recommendations align perfectly with our intended architecture
- Backend database integration is in progress (file-based is temporary MVP)
- We're using the human-in-the-loop system with stage-based approvals (preBria, postBria, postPdf)
- Integration should work with Supabase as source of truth, R2 for assets

**Current State:**
- ✅ **Supabase Schema**: Complete and defined (`docs/database/little-hero-books-schema.sql`)
- ✅ **n8n Integration**: Configured with Supabase credentials (per DEVELOPER packages)
- ✅ **Supabase Credentials**: Available (per DEVELOPER_A_PACKAGE.md and DEVELOPER_B_PACKAGE.md):
  - Project URL: `https://mdnthwpcnphjnnblbvxk.supabase.co`
  - Service Role Key: Configured in n8n workflows
- ⚠️ **Backend Code**: Currently uses file-based storage (`approval-store.ts`), **Supabase client integration needed**
  - Will use `@supabase/supabase-js` when implemented
  - Temporary file-based approach (`back-end/approvals.json`) for MVP
- ✅ **R2 Storage**: Operational for assets and manifests (compliments Supabase)
- ✅ **Backend API Routes**: Next.js 15 API routes exist, need Supabase integration

**Backend Environment Variables Needed:**
```bash
# Supabase (to be added)
SUPABASE_URL=https://mdnthwpcnphjnnblbvxk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=(if needed for client-side operations)

# Existing R2 variables
CLOUDFLARE_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# n8n webhook URLs
N8N_2B_WEBHOOK_URL=https://your-n8n-instance.com/webhook/start-2b
BACKEND_API_TOKEN=secret-token-for-n8n-auth
```

---

## 📝 Direct Answers to Your Questions

### **1. Supabase Schema** ✅ **We Have Supabase Schema Defined**

**Your Question:** What's your current Supabase schema for orders and poses?

**Answer:** ✅ **We ARE using Supabase!** The schema is fully defined and ready. Here's what we have:

**Our Supabase Schema** (from `docs/database/little-hero-books-schema.sql`):

**Key Tables:**
1. **`orders`** - Main order tracking table
   - `id` (SERIAL PRIMARY KEY)
   - `amazon_order_id` (VARCHAR, UNIQUE)
   - `character_hash` (VARCHAR(16))
   - `status` (VARCHAR(50)) - workflow status
   - `workflow_step` (VARCHAR(50))
   - `next_workflow` (VARCHAR(50))
   - `character_specs` (JSONB)
   - `requires_human_review` (BOOLEAN)
   - `human_approved` (BOOLEAN)
   - `final_book_url`, `cover_image_url`, `thumbnail_url` (TEXT)
   - Cost tracking fields

2. **`character_generations`** - Per-pose tracking (matches your `order_poses` idea)
   - `order_id` (FK to orders)
   - `pose_number` (INTEGER)
   - `status` (VARCHAR(50))
   - `bria_request_id` (VARCHAR(100))
   - `original_image_url`, `background_removed_url`, `final_image_url` (TEXT)
   - `quality_score`, `consistency_score`, `character_match_score` (DECIMAL)
   - UNIQUE(order_id, pose_number)

3. **`human_review_queue`** - Review workflow management
   - `order_id` (FK to orders)
   - `review_type` (VARCHAR(50)) - 'quality_check', 'manual_approval', 'error_resolution'
   - `status` (VARCHAR(50)) - 'pending', 'in_progress', 'approved', 'rejected'
   - `review_notes` (TEXT)
   - `decision` (VARCHAR(50))

4. **`failed_orders`** - Error tracking and retry logic
5. **`audit_logs`** - Complete audit trail
6. **`workflow_execution_logs`** - Workflow execution tracking

**Schema Alignment:**

✅ **Your Recommendations** align well with our schema:
- Your `order_poses` table → Our `character_generations` table (same concept)
- Your `current_stage` enum → Our `status` + `workflow_step` + `next_workflow` fields
- Your `manifest_2a_url`, `manifest_2b_url` → We can add these as TEXT fields to `orders`

**Suggested Additions for Manifest URLs:**
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_2a_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_2b_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_3_url TEXT;
```

**Schema File Location:** `docs/database/little-hero-books-schema.sql` (383 lines, complete schema with indexes, triggers, views)

---

### **2. Backend Webhook Endpoints** ❌ Need to Build

**Your Question:** What webhook endpoints exist for workflow completion?

**Answer:** **These endpoints don't exist yet.** They need to be built as part of the integration.

**Current State:**
- ✅ `/api/orders/[orderId]/approve` - Exists (POST endpoint, currently saves to file-based store, will migrate to Supabase)
- ✅ `/api/orders` - GET endpoint (lists orders, currently from R2, will query Supabase)
- ✅ `/api/orders/[orderId]` - GET endpoint (gets order details)
- ✅ `/api/list` - Lists assets from R2 for review
- ✅ `/api/presign-put` - Generates presigned URLs for asset replacement
- ✅ `/api/health` - Health check endpoint
- ❌ `/api/webhooks/workflow-2a-complete` - **Missing (needs to be built)**
- ❌ `/api/webhooks/workflow-2b-complete` - **Missing (needs to be built)**
- ❌ `/api/webhooks/workflow-3-complete` - **Missing (needs to be built)**

**Backend Code Status:**
- Backend is Next.js 15 with TypeScript
- Uses R2 client (`@aws-sdk/client-s3`) for asset storage
- File-based approval store (`back-end/approvals.json`) - temporary MVP
- **Supabase client integration needed** - will use `@supabase/supabase-js` when implemented

**What We'll Build:**
Based on your recommendations, we'll implement:

```typescript
// POST /api/webhooks/workflow-2a-complete
{
  "orderId": "book-001-...",
  "manifestUrl": "https://pub-xxx.r2.dev/.../2a-manifest.json",
  "characterHash": "abc123...",
  "posesGenerated": 12,
  "needsReview": true
}

// POST /api/webhooks/workflow-2b-complete
{
  "orderId": "book-001-...",
  "manifestUrl": "https://pub-xxx.r2.dev/.../2b-manifest.json",
  "posesProcessed": 12,
  "posesSucceeded": 11,
  "posesFailed": 1,
  "needsReview": true
}
```

**Authentication:** Bearer token (API key) - format TBD.

**Timeline:** Will implement as part of Phase 1 integration (see roadmap below).

---

### **3. Workflow Trigger Endpoints** ❌ Need to Build

**Your Question:** How does backend trigger n8n workflows?

**Answer:** **This doesn't exist yet.** Currently, the backend doesn't trigger workflows.

**Current State:**
- ❌ No backend endpoints to trigger n8n workflows
- ❌ No webhook POST logic to n8n

**What We'll Build:**
Based on your requirements, we'll implement:

```typescript
// POST /api/orders/:orderId/trigger-2b
// Triggers Workflow 2B when admin approves preBria stage

{
  "orderId": "uuid",
  "characterHash": "abc123...",
  "manifestUrl": "https://.../2a-manifest.json",
  "posesToProcess": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  "webhookUrl": "https://your-backend.com/api/webhooks/workflow-2b-complete",
  "context": {
    "approvedBy": "admin_user_id",
    "approvedAt": "2025-10-29T..."
  }
}
```

**Integration Point:** This will be called from the approval endpoint (`/api/orders/[orderId]/approve`) when `stage === "preBria"`.

**Environment Variable:** `N8N_2B_WEBHOOK_URL` (global or per-order in order.json)

---

### **4. Manifest Structure from 2A** ✅ Your Structure is Perfect

**Your Question:** What does the 2A manifest currently look like?

**Answer:** Your proposed v2.0 manifest structure **perfectly aligns** with what we need.

**Confirmed:** We support the structure you've designed:
```json
{
  "schema": "lhb.run-manifest@v2.0",
  "runStamp": "2025-10-29T14:32:10.123Z",
  "characterHash": "abc123...",
  "order": { /* ... */ },
  "entries": [ /* ... */ ],
  "reviewQueue": [ /* ... */ ],
  "workflow": {
    "currentStage": "2A-complete",
    "nextWorkflow": "2B-retry",
    "requiresHumanReview": true
  }
}
```

**Recommendations:**
1. ✅ Keep the structure as-is
2. ✅ Store manifest at `{assetPrefix}2a-manifest.json` (or `manifest.json` if just one)
3. ✅ Include `assetPrefix` in manifest so 2B can update it
4. ✅ Use `reviewQueue` to identify poses needing manual review

**Backend Will:**
- Download manifest from R2 URL provided in webhook
- Extract order metadata and pose statuses
- Update `order.json` in R2 with manifest reference
- Display assets in review dashboard

---

### **5. What Does Workflow 3 Expect?** 🤔 Not Yet Defined

**Your Question:** What input does Workflow 3 need from 2B?

**Answer:** Workflow 3 doesn't exist yet, so we need to define this together.

**Your Proposed 2B Output Structure:** ✅ **Looks good**

The structure you've proposed:
```json
{
  "entries": [
    {
      "poseNumber": 1,
      "originalImageUrl": "https://.../pose01.png",
      "bgRemovedImageUrl": "https://.../pose01_nobg.png",
      "briaRequestId": "...",
      "briaProcessedAt": "..."
    }
  ]
}
```

**Recommendation:** **Workflow 3 should receive:**
1. ✅ **Manifest URL** from 2B (not full payload)
2. ✅ **Background-removed URLs only** (for book assembly)
3. ✅ **Character specs and book specs** (from manifest.order)
4. ✅ **Order metadata** (from manifest.order)

**Why manifest-based:**
- Keeps workflows decoupled
- Single source of truth
- Easy to debug (one manifest file per stage)
- Supports selective processing

**Workflow 3 Trigger Format:**
```json
{
  "orderId": "book-001-...",
  "manifestUrl": "https://.../2b-manifest.json",
  "characterHash": "abc123...",
  "webhookUrl": "https://your-backend.com/api/webhooks/workflow-3-complete"
}
```

---

### **6. Character Hash Generation** ✅ Already Implemented

**Your Question:** How is `characterHash` currently generated?

**Answer:** We use the **exact approach** you've recommended.

**Current Implementation:**
```javascript
// Stable hash based on appearance traits
function generateCharacterHash(specs) {
  const stableTraits = {
    skinTone: specs.skinTone,
    hairColor: specs.hairColor,
    hairStyle: specs.hairStyle,
    age: specs.age,
    gender: specs.gender
  };
  
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableTraits))
    .digest('hex')
    .substring(0, 16);
}
```

**Location:** Generated in **Workflow 2A** (not Workflow 1 or backend).

**Storage:** Stored in:
- `order.json.characterHash`
- Manifest `characterHash` field
- Used in R2 folder paths

**Confirmation:** ✅ Your approach is correct and already implemented.

---

### **7. R2 Storage Structure** ⚠️ Needs Finalization

**Your Question:** What's the current R2 folder structure?

**Answer:** The structure is **not yet finalized**, but we have a working pattern.

**Current Pattern (from codebase):**
```
little-hero-assets/
  book-mvp-simple-adventure/
    order-generated-assets/
      characters/
        {characterHash}/
          pose01.png
          pose02.png
          ...
          pose01_nobg.png
          pose02_nobg.png
          ...
        {orderId}/
          order.json
          2a-manifest.json
          2b-manifest.json
```

**Recommended Structure (based on your questions):**
```
little-hero-assets/
  projects/
    personalized-book/
      orders/
        {orderId}/
          order.json                    ← Source of truth
          assets/
            pre-bria/
              characters/
                {characterHash}/
                  pose01.png
                  pose02.png
                  ...
            post-bria/
              characters/
                {characterHash}/
                  pose01_nobg.png
                  pose02_nobg.png
                  ...
            post-pdf/
              compiled.pdf
          manifests/
            2a-manifest.json
            2b-manifest.json
            3-manifest.json
```

**Decision Needed:**
- ✅ Order-by-order structure (easier for review dashboard)
- ✅ Character-hash structure (easier for reuse)
- 🤔 Hybrid approach?

**Background-Removed Naming:**
- ✅ `pose01_nobg.png` - Clear, consistent
- Alternative: `pose01-bg-removed.png` (also acceptable)

**Manifest Storage:**
- ✅ Per-order: `{assetPrefix}manifests/2a-manifest.json`
- ✅ Or root: `{assetPrefix}order.json` + separate manifest files

**Recommendation:** Let's finalize this **before** Workflow 2B implementation to avoid path conflicts.

---

### **8. Admin Dashboard Status** ✅ Stage-Based System

**Your Question:** What order statuses does the admin dashboard currently support?

**Answer:** We use a **stage-based review system**, not enum statuses.

**Current System:**
- ✅ Three stages: `preBria`, `postBria`, `postPdf`
- ✅ Each stage has status: `pending` | `approved` | `rejected`
- ✅ Displayed in dashboard with stage pills/badges

**Your Proposed Statuses:**
```
2a_review → When 2A completes and needs approval
2b_pending → When admin triggers 2B
2b_processing → While 2B is running
2b_review → When 2B completes and needs approval
```

**Compatibility:** ✅ **Fully compatible**

**Implementation:**
- Store in `order.json.reviewStages`:
  ```json
  {
    "preBria": { "status": "pending" | "approved" },
    "postBria": { "status": "pending" | "approved" },
    "postPdf": { "status": "pending" | "approved" }
  }
  ```

**Dashboard Display:**
- Stage selector tabs
- Status badges per stage
- Approve button per stage
- Progress indicator showing current stage

**Recommendation:** Use stage-based system (already implemented) rather than creating separate status enum.

---

### **9. Error Handling & Notifications** ⚠️ Basic Implementation

**Your Question:** How are errors currently handled in other workflows?

**Answer:** Error handling is **minimal** and needs improvement.

**Current State:**
- ✅ Basic try-catch in API routes
- ❌ No structured error webhook
- ❌ No Slack/email notifications
- ✅ Errors logged to console

**For 2B Errors, You Should:**

1. **Include errors in completion webhook:**
   ```json
   {
     "orderId": "...",
     "manifestUrl": "...",
     "posesProcessed": 11,
     "posesFailed": 1,
     "errors": [
       {
         "poseNumber": 7,
         "error": "Bria API timeout after 5 attempts",
         "briaRequestId": "...",
         "retryHistory": [ /* ... */ ]
       }
     ]
   }
   ```

2. **Flag failed poses in manifest:**
   - Update manifest `entries[]` with `status: "failed"`
   - Add to `reviewQueue` if needs manual intervention
   - Include `error` and `retryHistory` in entry

3. **Backend will:**
   - Display failed poses in review dashboard
   - Show error details to admin
   - Allow admin to retry or manually fix

**Recommendation:** Don't create separate error webhook. Include errors in completion webhook payload.

---

### **10. Workflow 1 → 2A Data Flow** 🤔 Workflow 1 Not Yet Defined

**Your Question:** What data does Workflow 1 provide to 2A?

**Answer:** **Workflow 1 doesn't exist yet**, so we need to define this together.

**Assuming Workflow 1 Purpose:**
- Receives Amazon order
- Validates customer data
- Triggers Workflow 2A

**Expected 2A Input:**
```json
{
  "orderId": "book-001-20251016-abc123",
  "amazonOrderId": "ORDER-123",
  "characterSpecs": {
    "childName": "Alex",
    "age": 4,
    "skinTone": "medium",
    "hairColor": "black",
    "hairStyle": "short"
  },
  "bookSpecs": {
    "title": "Alex's Adventure",
    "format": "8.5x8.5_softcover",
    "totalPages": 16
  }
}
```

**Recommendation:** Workflow 1 should:
1. Create `order.json` in R2 at `{assetPrefix}order.json`
2. Call Workflow 2A webhook with order data
3. 2A generates characterHash and uses it for all paths

**Pose Descriptions:** ✅ Hardcode in 2A (consistent across all orders)

---

### **11. Authentication Between Services** ⚠️ Needs Definition

**Your Question:** How are n8n ↔ Backend calls authenticated?

**Answer:** **Not yet implemented.** Need to define before integration.

**Your Recommendation:**
```javascript
// n8n → Backend
headers: {
  'Authorization': `Bearer ${process.env.BACKEND_API_TOKEN}`,
  'X-Workflow-Signature': generateHMAC(payload)  // Optional
}

// Backend → n8n
POST https://n8n-instance.com/webhook/{secret-path}/start-2b
headers: {
  'Content-Type': 'application/json'
  // Additional auth if n8n requires it
}
```

**Our Recommendation:**
1. ✅ **Bearer token** for n8n → Backend (required)
2. ⚠️ **HMAC signature** (optional, but recommended for production)
3. ✅ **Secret webhook paths** for Backend → n8n (required)

**Environment Variables:**
```bash
# Backend
BACKEND_API_TOKEN=your-secret-token-for-n8n
LHL_WEBHOOK_SECRET=secret-for-hmac-signatures  # Optional

# n8n
BACKEND_API_TOKEN=your-secret-token-for-n8n  # Same as backend
N8N_WEBHOOK_SECRET_PATH=random-uuid-string   # For webhook URLs
```

**Implementation:** Will build auth middleware in backend to verify tokens.

---

### **12. Real-Time Updates** ✅ Optional Enhancement

**Your Question:** Do you need real-time progress updates during 2B processing?

**Answer:** **Not required for MVP**, but would be nice to have.

**MVP Approach:** ✅ **Simple (just start + complete webhooks)**
- Backend shows "Processing..." status
- Refresh happens when 2B completes
- Sufficient for initial launch

**Future Enhancement:** ⚠️ **Detailed progress updates**
- `/api/webhooks/workflow-2b-progress` endpoint
- Update dashboard as each pose completes
- Better UX but adds complexity

**Recommendation:** Start with simple approach, add detailed updates in Phase 2.

---

## 🎯 Integration Strategy Recommendation

Based on your coordination document and audit report, here's my recommendation:

### **Option B: Update 2B to Accept Manifest Directly** ✅ **RECOMMENDED**

**Why:**
1. ✅ Single source of truth (manifest in R2)
2. ✅ Less backend transformation logic
3. ✅ Workflows can communicate directly
4. ✅ Easier debugging (one manifest file)
5. ✅ Supports selective processing naturally

**Flow:**
```
[Workflow 2A]
  ↓ Generate assets
  ↓ Upload manifest to R2
  ↓ Call backend webhook: "2A complete"
  ↓
[Backend]
  ↓ Download manifest from R2
  ↓ Update order.json
  ↓ Display in review dashboard
  ↓
[Admin Reviews]
  ↓ Click "Approve & Send to Bria"
  ↓
[Backend]
  ↓ POST to n8n: /webhook/start-2b
  ↓ Payload: { manifestUrl, posesToProcess, ... }
  ↓
[Workflow 2B]
  ↓ Download manifest from R2
  ↓ Extract poses to process
  ↓ Process via Bria
  ↓ Update manifest with results
  ↓ Upload updated manifest to R2
  ↓ Call backend webhook: "2B complete"
  ↓
[Backend]
  ↓ Download updated manifest
  ↓ Update order.json
  ↓ Display results in dashboard
```

**Benefits:**
- Clean separation: Backend orchestrates, workflows process
- No adapter workflow needed
- 2B can read manifest directly (fewer dependencies)
- Easy to extend for future workflows

**Implementation Requirements:**
1. 2B accepts `manifestUrl` in webhook payload
2. 2B downloads and parses manifest
3. 2B updates manifest with Bria results
4. 2B uploads updated manifest to R2
5. 2B calls backend completion webhook

---

## 📋 Implementation Roadmap

### **Phase 1: Backend Webhook Endpoints (Priority: P0)**

**Tasks:**
1. ✅ Build `/api/webhooks/workflow-2a-complete`
   - Download manifest from R2
   - Update `order.json` in R2
   - Set `reviewStages.preBria.status = "pending"`

2. ✅ Build `/api/webhooks/workflow-2b-complete`
   - Download updated manifest from R2
   - Update `order.json` in R2
   - Set `reviewStages.postBria.status = "pending"`

3. ✅ Build `/api/webhooks/workflow-3-complete`
   - Download final manifest/PDF from R2
   - Update `order.json` in R2
   - Set `reviewStages.postPdf.status = "pending"`

4. ✅ Add authentication middleware
   - Verify Bearer token
   - Optional: HMAC signature verification

5. ✅ Update approval endpoint to trigger 2B
   - When `stage === "preBria"` and approved
   - POST to `N8N_2B_WEBHOOK_URL`
   - Pass manifest URL and context

**Estimated Time:** 2-3 days

---

### **Phase 2: Workflow 2B Manifest Integration (Priority: P0)**

**Tasks (Your Side):**
1. ✅ Update 2B webhook to accept manifest URL
2. ✅ Add "Download Manifest" node
3. ✅ Add "Transform Manifest to Submissions" node
4. ✅ Update "Generate BRIA Summary" to include manifest
5. ✅ Add "Update Manifest with Results" node
6. ✅ Add "Upload Updated Manifest" node
7. ✅ Fix hardcoded URL (use env var)
8. ✅ Remove empty "Store Submission Result" node
9. ✅ Add error handling to Bria API calls

**Backend Support:**
- Provide manifest structure documentation
- Test with sample manifests
- Verify R2 upload paths

**Estimated Time:** 2-3 days

---

### **Phase 3: Testing & Validation (Priority: P0)**

**Tasks:**
1. ✅ End-to-end testing:
   - 2A generates manifest → Backend receives → Admin reviews → Approves → 2B processes → Backend receives → Admin reviews

2. ✅ Error scenario testing:
   - Bria API failures
   - Missing manifest
   - Network errors
   - Partial pose failures

3. ✅ Integration validation:
   - Manifest format compatibility
   - R2 path consistency
   - Webhook payload formats
   - Error handling

**Estimated Time:** 1-2 days

---

## ✅ Recommendations Based on Audit Report

### **Critical Issues - Must Fix Before Integration:**

1. ❌ **Fix Hardcoded URL** (Priority: Critical)
   - Replace with `N8N_WEBHOOK_BASE_URL` env var
   - Required for portability

2. ❌ **Remove Empty Node** (Priority: High)
   - Delete "Store Submission Result" (empty)
   - Clean up workflow

3. ⚠️ **Add Error Handling** (Priority: High)
   - Wrap Bria API calls in try-catch
   - Return structured error data

4. ⚠️ **Validate characterHash Early** (Priority: Medium)
   - Fail fast if missing
   - Better error messages

### **Integration Requirements:**

5. ✅ **Design New Webhook Payload** (Priority: Critical)
   ```json
   {
     "trigger": "manual_review",
     "manifestUrl": "https://.../2a-manifest.json",
     "characterHash": "abc123...",
     "posesToProcess": [1, 2, 3],  // Optional
     "context": {
       "approvedBy": "admin_id",
       "approvedAt": "2025-10-29T..."
     }
   }
   ```

6. ✅ **Add Manifest Download/Parse** (Priority: Critical)
   - Download from R2
   - Parse and extract poses
   - Transform to submissions format

7. ✅ **Update Manifest After Processing** (Priority: High)
   - Add Bria results to manifest entries
   - Update workflow status
   - Upload back to R2

### **Long-Term Improvements (Post-Integration):**

8. ⚠️ **Replace Recursive Polling** (Priority: Medium)
   - Use internal loop instead
   - Reduces workflow executions
   - Better performance/cost

9. ⚠️ **Implement Queue System** (Priority: Low)
   - Global rate limiting
   - Better observability
   - Prioritization

---

## 🔧 Specific Implementation Details

### **Backend Webhook Handler for 2A** (Supabase Integration)

```typescript
// POST /api/webhooks/workflow-2a-complete
import { createClient } from '@supabase/supabase-js';

export async function handle2AComplete(request: NextRequest) {
  const { orderId, manifestUrl, characterHash, amazonOrderId } = await request.json();
  
  // Initialize Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // 1. Download manifest from R2 (optional - can also just store URL)
  // const manifest = await downloadFromR2(manifestUrl);
  
  // 2. Update order in Supabase
  const { data: order, error } = await supabase
    .from('orders')
    .update({
      character_hash: characterHash,
      manifest_2a_url: manifestUrl,
      status: 'pre_bria_pending',  // Or '2a_review' per your status enum
      workflow_step: 'ai_generation',
      next_workflow: '2b-retry',
      updated_at: new Date().toISOString()
    })
    .eq('amazon_order_id', amazonOrderId)  // Or use orderId if matching
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to update order: ${error.message}`);
  }
  
  // 3. Update character_generations table with pose data from manifest
  // (Parse manifest entries and update each pose record)
  
  // 4. Add to human_review_queue if needed
  await supabase
    .from('human_review_queue')
    .insert({
      order_id: order.id,
      review_type: 'quality_check',
      status: 'pending',
      review_priority: 'normal'
    });
  
  // 5. Log audit event
  await supabase
    .from('audit_logs')
    .insert({
      order_id: order.id,
      action: 'workflow_2a_complete',
      workflow_step: 'ai_generation',
      performed_by: 'system',
      system_component: 'workflow_2a',
      details: { manifestUrl, characterHash }
    });
  
  return NextResponse.json({ success: true, orderId: order.id });
}
```

### **Backend Trigger for 2B**

```typescript
// Called from /api/orders/[orderId]/approve when stage === "preBria"
export async function trigger2B(orderId: string, manifestUrl: string) {
  const n8nWebhookUrl = process.env.N8N_2B_WEBHOOK_URL;
  
  const payload = {
    trigger: 'manual_review',
    manifestUrl,
    characterHash: order.characterHash,
    posesToProcess: undefined,  // Process all approved poses
    context: {
      approvedBy: currentUser.id,
      approvedAt: new Date().toISOString()
    }
  };
  
  // POST to n8n
  const response = await fetch(n8nWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to trigger 2B: ${response.statusText}`);
  }
}
```

---

## 📊 R2 Storage Structure - Final Recommendation

Based on our discussion, here's the recommended structure:

```
little-hero-assets/
  projects/
    personalized-book/
      orders/
        {orderId}/
          order.json                    ← Source of truth
          manifests/
            2a-manifest.json            ← From Workflow 2A
            2b-manifest.json            ← From Workflow 2B
            3-manifest.json             ← From Workflow 3
          assets/
            pre-bria/
              characters/
                {characterHash}/
                  pose01.png
                  pose02.png
                  ... (12 poses)
            post-bria/
              characters/
                {characterHash}/
                  pose01_nobg.png
                  pose02_nobg.png
                  ... (12 bg-removed poses)
            post-pdf/
              compiled.pdf
```

**Key Points:**
- Order-based structure (easier for review dashboard)
- Stage-based asset folders
- Manifest files in dedicated folder
- Character hash in asset paths (supports reuse)

**Asset Prefix Format:**
```
projects/personalized-book/orders/{orderId}/
```

### R2 Orders Bucket Structure - Alignment with Implementation Request

Referencing `docs/new-planning/R2_Structure_Implementation_Request.md`, we will adopt a hybrid strategy:

- **Images**: remain character-centric in `little-hero-assets/.../characters/{characterHash}/...`
- **Manifests + Metadata**: move to order-centric paths in a dedicated private bucket `little-hero-orders`

Required structure (order-centric manifests/metadata):
```
little-hero-orders/
  book-mvp-simple-adventure/
    orders/
      {orderId}/
        manifests/
          2a-manifest.json
          2b-manifest.json
          3-manifest.json
        metadata/
          order.json
          approvals.json
        logs/                 # optional
          2a-execution.log
          2b-execution.log
          3-execution.log
```

Backend env vars to add:
```bash
R2_ORDERS_BUCKET_NAME=little-hero-orders
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
# Optional public hostname for signed URLs
R2_ORDERS_PUBLIC_URL=https://orders.your-domain.com
```

Helper function contracts for backend:
```typescript
// Upload manifest to orders bucket
async function uploadManifest(orderId: string, stage: '2a'|'2b'|'3', manifest: object): Promise<string>;

// Download manifest from orders bucket
async function downloadManifest(orderId: string, stage: '2a'|'2b'|'3'): Promise<object>;
```

Workflow integration points:
- 2A uploads `2a-manifest.json` to `little-hero-orders/.../orders/{orderId}/manifests/` and calls backend webhook
- Backend updates Supabase from manifest, sets review stage pending
- On approval, backend triggers 2B with `manifestUrl`
- 2B downloads 2A manifest, processes, uploads `2b-manifest.json`, calls backend webhook
- Backend updates Supabase and review stage for Post-Bria

---

## ✅ Action Items Summary

### **For Backend Team:**
- [ ] **Add Supabase client** - Install `@supabase/supabase-js` and configure environment variables
- [ ] **Migrate approval store** - Replace file-based `approval-store.ts` with Supabase `human_review_queue` table
- [ ] **Build `/api/webhooks/workflow-2a-complete` endpoint** - Update Supabase `orders` table, create `character_generations` records
- [ ] **Build `/api/webhooks/workflow-2b-complete` endpoint** - Update `character_generations` with bg-removed URLs
- [ ] **Build `/api/webhooks/workflow-3-complete` endpoint** - Update final PDF URLs
- [ ] **Update `/api/orders/[orderId]/approve` endpoint** - Store in Supabase `human_review_queue`, trigger 2B when preBria approved
- [ ] **Update `/api/orders` GET endpoint** - Query Supabase instead of R2 (R2 can remain for asset listing)
- [ ] **Add authentication middleware** - Verify Bearer tokens for webhook endpoints
- [ ] **Add manifest URL columns** - Run migration to add `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url` to `orders` table
- [ ] **Implement R2 manifest download/upload helpers** - For complementary storage alongside Supabase
- [ ] **Finalize R2 folder structure** - Coordinate with workflow team
- [ ] **Document webhook payload formats** - Share with workflow team

### **For Workflow 2B Team:**
- [ ] Update webhook to accept manifest URL format
- [ ] Add manifest download/parse nodes
- [ ] Add manifest update/upload nodes
- [ ] Fix hardcoded URL (use env var)
- [ ] Remove empty "Store Submission Result" node
- [ ] Add error handling to Bria API calls
- [ ] Implement manifest transformation logic
- [ ] Test with sample manifests

### **Together:**
- [ ] Finalize R2 folder structure
- [ ] Agree on manifest format (v2.0)
- [ ] Define authentication tokens
- [ ] Test end-to-end integration
- [ ] Document final data flow

---

## 📞 Next Steps

1. **Review this response** and confirm alignment
2. **Schedule sync meeting** to finalize:
   - R2 folder structure
   - Manifest format details
   - Authentication approach
   - Testing strategy
3. **Begin Phase 1 implementation** (backend webhooks)
4. **Begin Phase 2 implementation** (2B manifest integration)

**Questions for You:**
1. Does the manifest-based approach work for you?
2. Any concerns about downloading manifests from R2 in 2B?
3. Should we finalize R2 structure now or during implementation?
4. Preferred authentication approach (Bearer token only, or also HMAC)?

---

**Thank you for the comprehensive coordination document! Let's align on these details and move forward with integration.**

**— Backend/Human-in-the-Loop Team**

