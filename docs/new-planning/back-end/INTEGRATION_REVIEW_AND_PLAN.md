# Human-in-the-Loop Integration Review & Implementation Plan

**Date**: October 2025  
**Status**: Ready for Implementation  
**Priority**: P0 - Critical for workflow automation

---

## 📋 Executive Summary

After reviewing all documentation and current codebase, this document outlines:
1. **Current State Analysis** - What exists vs. what's needed
2. **Critical Integration Gaps** - Missing pieces between backend and n8n
3. **Implementation Requirements** - Detailed specs for finalizing integration
4. **n8n Workflow Requirements** - What n8n needs to handle
5. **Step-by-Step Implementation Plan**

---

## 1. Current State Analysis

### ✅ What's Already Built

**Backend (Next.js)**
- ✅ Approval store (`approval-store.ts`) - File-based tracking of stage approvals
- ✅ API endpoint `/api/orders/[orderId]/approve` - Accepts approval requests
- ✅ Stage validation (`preBria`, `postBria`, `postPdf`)
- ✅ R2 integration for asset listing/preview
- ✅ Frontend dashboard for reviewing assets by stage
- ✅ Order management UI (`/orders`, `/orders/[orderId]`)

**n8n Workflows**
- ✅ Workflow 2A - Character generation with pose loop
- ✅ Workflow 2B - Background removal (Bria integration)
- ✅ Workflow 3 - PDF compilation (referenced)
- ✅ R2 upload infrastructure in place

### ❌ Critical Missing Pieces

**Backend → n8n Webhook Integration**
- ❌ **Missing**: Webhook POST to n8n when stage is approved
- ❌ **Missing**: Environment variable `N8N_APPROVE_WEBHOOK`
- ❌ **Missing**: Payload construction matching technical spec
- ❌ **Missing**: Error handling and retry logic for webhook calls
- ❌ **Missing**: HMAC signature verification (optional but recommended)

**n8n → Backend Integration**
- ❌ **Missing**: n8n webhook endpoints to receive approvals
- ❌ **Missing**: Stage-aware workflow branching (`preBria` → 2A continuation, `postBria` → 2B, `postPdf` → 3)
- ❌ **Missing**: `order.json` file creation/update in R2 after asset generation
- ❌ **Missing**: Status updates to backend when assets are ready for review

**Storage Structure**
- ⚠️ **Unclear**: Final R2 folder structure (spec says "not finalized")
- ⚠️ **Missing**: Consistent `order.json` file creation by n8n workflows
- ⚠️ **Missing**: `assetPrefix` standardization across workflows

---

## 2. Integration Gaps - Detailed Breakdown

### Gap 1: Backend Approval → n8n Webhook Trigger

**Current State:**
```typescript
// back-end/src/app/api/orders/[orderId]/approve/route.ts
// Only saves approval locally, doesn't notify n8n
const approval = await approveStage(orderId, stage);
return NextResponse.json({ success: true, ... });
```

**Required State:**
```typescript
// Should POST to n8n webhook after approval
const approval = await approveStage(orderId, stage);

// Get webhook URL from order.json or env var
const webhookUrl = order.webhooks?.onApprove || process.env.N8N_APPROVE_WEBHOOK;

// POST to n8n with stage-aware payload
await fetch(webhookUrl, {
  method: 'POST',
  body: JSON.stringify({
    prefix: order.assetPrefix,
    stage: stage,
    approvedAt: approval.approvedAt,
    reviewer: approval.reviewer
  })
});
```

### Gap 2: n8n Workflow Approval Endpoints

**Required n8n Webhook Nodes:**

1. **Pre-Bria Approval Webhook** (`/webhook/approve/pre-bria`)
   - Receives: `{ prefix, stage: "preBria", approvedAt, reviewer }`
   - Triggers: Continue Workflow 2A → Send to Bria

2. **Post-Bria Approval Webhook** (`/webhook/approve/post-bria`)
   - Receives: `{ prefix, stage: "postBria", approvedAt, reviewer }`
   - Triggers: Continue Workflow 2B → PDF Compilation

3. **Post-PDF Approval Webhook** (`/webhook/approve/post-pdf`)
   - Receives: `{ prefix, stage: "postPdf", approvedAt, reviewer }`
   - Triggers: Finalize order / Notify fulfillment

**OR Single Endpoint with Stage Branching:**
- Single webhook: `/webhook/approve`
- Code node branches on `stage` field:
  ```js
  const stage = $json.stage;
  if (stage === 'preBria') { /* route to 2A continuation */ }
  if (stage === 'postBria') { /* route to 2B continuation */ }
  if (stage === 'postPdf') { /* route to 3/finalize */ }
  ```

### Gap 3: n8n → Backend Order Status Updates

**Current State:**
- n8n workflows upload assets to R2
- No `order.json` file creation
- Backend doesn't know when assets are ready for review

**Required:**
After Workflow 2A completes:
```json
// Upload to R2: {assetPrefix}/order.json
{
  "orderId": "book-001-20251016-abc123",
  "assetPrefix": "projects/personalized-book/orders/book-001-20251016-abc123/",
  "reviewStages": {
    "preBria": { "status": "pending" },
    "postBria": { "status": "pending" },
    "postPdf": { "status": "pending" }
  },
  "webhooks": {
    "onApprove": "https://your-n8n-instance.com/webhook/approve"
  }
}
```

After Workflow 2B completes:
- Update `order.json`: `reviewStages.postBria.status = "pending"`

After Workflow 3 completes:
- Update `order.json`: `reviewStages.postPdf.status = "pending"`

---

## 3. Implementation Requirements

### 3.1 Backend Implementation

**File: `back-end/src/lib/n8n-webhook.ts`** (NEW)
```typescript
interface ApprovalWebhookPayload {
  prefix: string;
  stage: 'preBria' | 'postBria' | 'postPdf';
  approvedAt: string;
  reviewer: string;
  orderId?: string; // optional, can derive from prefix
}

export async function notifyN8nApproval(
  webhookUrl: string,
  payload: ApprovalWebhookPayload
): Promise<void> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`n8n webhook returned ${response.status}`);
      }

      console.log(`✅ n8n webhook notified: ${payload.stage} for ${payload.prefix}`);
      return;
    } catch (error) {
      lastError = error as Error;
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      console.warn(`⚠️ n8n webhook attempt ${attempt} failed, retrying in ${delay}ms...`);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to notify n8n after ${maxRetries} attempts: ${lastError?.message}`);
}
```

**File: `back-end/src/app/api/orders/[orderId]/approve/route.ts`** (UPDATE)
```typescript
import { notifyN8nApproval } from '@/lib/n8n-webhook';

async function approveOrderStage(...) {
  // ... existing validation ...

  const approval = await approveStage(orderId, stage);

  // Get order to retrieve webhook URL and assetPrefix
  const order = await getOrderFromR2(orderId); // Implement this
  const webhookUrl = order?.webhooks?.onApprove || process.env.N8N_APPROVE_WEBHOOK;

  if (!webhookUrl) {
    console.warn(`No webhook URL configured for order ${orderId}, approval saved locally only`);
  } else {
    try {
      await notifyN8nApproval(webhookUrl, {
        prefix: order.assetPrefix,
        stage: stage as 'preBria' | 'postBria' | 'postPdf',
        approvedAt: approval.approvedAt,
        reviewer: approval.reviewer,
        orderId: orderId
      });
    } catch (error) {
      // Log error but don't fail the approval
      console.error(`Failed to notify n8n webhook: ${error}`);
      // Optionally: Store failed webhook for retry queue
    }
  }

  return NextResponse.json({ 
    success: true, 
    message: `Stage ${stage} approved successfully`,
    orderId,
    stage,
    approvedAt: approval.approvedAt,
    reviewer: approval.reviewer
  });
}
```

**File: `back-end/env.example`** (UPDATE)
```env
# n8n Integration
N8N_APPROVE_WEBHOOK=https://your-n8n-instance.com/webhook/approve

# Optional: HMAC secret for webhook verification
LHL_WEBHOOK_SECRET=your-secret-key-here
```

### 3.2 n8n Workflow Requirements

#### Workflow 2A Modifications

**After asset generation completes:**

1. **Create/Update order.json** (Code Node)
   ```js
   // Upload order.json to R2
   const orderJson = {
     orderId: $json.amazonOrderId || $json.orderId,
     assetPrefix: `projects/personalized-book/orders/${orderId}/`,
     reviewStages: {
       preBria: { status: "pending" },
       postBria: { status: "pending" },
       postPdf: { status: "pending" }
     },
     webhooks: {
       onApprove: $env.N8N_APPROVE_WEBHOOK_URL
     },
     // ... other order metadata
   };
   
   // Upload to R2 at {assetPrefix}order.json
   ```

2. **Wait for Approval** (Webhook Node or Polling)
   - **Option A**: Webhook node waits for POST from backend
     - Path: `/webhook/approve/pre-bria`
     - HTTP Method: POST
     - Expected payload: `{ prefix, stage, approvedAt, reviewer }`
   
   - **Option B**: Polling (check R2 order.json status)
     - Interval: Every 30-60 seconds
     - Check: `order.json.reviewStages.preBria.status === "approved"`
     - Continue when approved

3. **After Approval → Continue to Bria**
   - Send assets to Bria for background removal
   - Proceed with Workflow 2B

#### Workflow 2B Modifications

**After Bria processing completes:**

1. **Update order.json** (Code Node)
   ```js
   // Read existing order.json from R2
   // Update: reviewStages.postBria.status = "pending"
   // Upload back to R2
   ```

2. **Wait for Approval** (Webhook or Polling)
   - Path: `/webhook/approve/post-bria`
   - Or poll `order.json.reviewStages.postBria.status`

3. **After Approval → Continue to PDF Compilation**
   - Trigger Workflow 3

#### Workflow 3 Modifications

**After PDF compilation:**

1. **Update order.json**
   ```js
   // Update: reviewStages.postPdf.status = "pending"
   ```

2. **Wait for Approval**
   - Path: `/webhook/approve/post-pdf`

3. **After Approval → Finalize**
   - Mark order complete
   - Trigger fulfillment/publishing

### 3.3 Single Webhook vs. Multiple Webhooks

**Recommended: Single Webhook with Branching**

**Advantages:**
- Simpler backend implementation (one URL)
- Easier to manage in n8n
- Centralized logging/debugging

**Implementation:**
```
n8n Webhook Node: /webhook/approve
  ↓
Code Node: Branch by Stage
  ├─ IF stage === "preBria" → Continue 2A → Bria
  ├─ IF stage === "postBria" → Continue 2B → PDF
  └─ IF stage === "postPdf" → Finalize Order
```

**Code Node:**
```js
const stage = $json.stage;
const prefix = $json.prefix;
const approvedAt = $json.approvedAt;

// Load order.json from R2 to get order context
const orderData = await loadOrderFromR2(prefix);

switch (stage) {
  case 'preBria':
    // Continue Workflow 2A → Send to Bria
    return [{ json: { ...orderData, nextAction: 'sendToBria' } }];
  
  case 'postBria':
    // Continue Workflow 2B → Compile PDF
    return [{ json: { ...orderData, nextAction: 'compilePdf' } }];
  
  case 'postPdf':
    // Finalize order
    return [{ json: { ...orderData, nextAction: 'finalize' } }];
  
  default:
    throw new Error(`Unknown stage: ${stage}`);
}
```

---

## 4. R2 Storage Structure - Final Recommendation

Based on the documentation, here's the recommended structure:

```
little-hero-assets/
  projects/
    personalized-book/
      orders/
        {orderId}/
          order.json                          ← Single source of truth
          assets/
            pre-bria/
              characters/
                {characterHash}/
                  pose01.png
                  pose02.png
                  ...
              base-character.png
            post-bria/
              characters/
                {characterHash}/
                  pose01.png
                  pose02.png
                  ...
            post-pdf/
              compiled.pdf
```

**Key Points:**
- `order.json` at root of order folder
- Stage-based subfolders under `assets/`
- Consistent `assetPrefix`: `projects/personalized-book/orders/{orderId}/`

---

## 5. Step-by-Step Implementation Plan

### Phase 1: Backend Webhook Integration (Priority: P0)

**Tasks:**
1. ✅ Create `back-end/src/lib/n8n-webhook.ts` with `notifyN8nApproval()` function
2. ✅ Add `N8N_APPROVE_WEBHOOK` to `env.example` and environment
3. ✅ Update `/api/orders/[orderId]/approve` route to call webhook
4. ✅ Add helper function to load `order.json` from R2
5. ✅ Implement error handling and retry logic
6. ✅ Add logging/monitoring for webhook calls

**Estimated Time**: 2-3 hours

### Phase 2: n8n Webhook Endpoint Setup (Priority: P0)

**Tasks:**
1. ✅ Create webhook node in n8n: `/webhook/approve`
2. ✅ Create code node to branch by `stage`
3. ✅ Connect branches to appropriate workflow continuations
4. ✅ Test webhook receives approval payloads

**Estimated Time**: 1-2 hours

### Phase 3: n8n order.json Management (Priority: P0)

**Tasks:**
1. ✅ Add code node in Workflow 2A to create `order.json` after asset generation
2. ✅ Add code node in Workflow 2B to update `order.json` when post-bria assets ready
3. ✅ Add code node in Workflow 3 to update `order.json` when PDF ready
4. ✅ Ensure `assetPrefix` is consistent across all workflows

**Estimated Time**: 2-3 hours

### Phase 4: Testing & Validation (Priority: P0)

**Tasks:**
1. ✅ End-to-end test: Generate assets → Review → Approve → Verify n8n continues
2. ✅ Test all three stages: preBria → postBria → postPdf
3. ✅ Test error scenarios: webhook failures, retries, invalid stages
4. ✅ Verify `order.json` updates correctly at each stage

**Estimated Time**: 2-3 hours

### Phase 5: Documentation & Monitoring (Priority: P1)

**Tasks:**
1. ✅ Update workflow documentation with new approval flow
2. ✅ Add monitoring/alerting for failed webhook calls
3. ✅ Document troubleshooting steps

**Estimated Time**: 1-2 hours

**Total Estimated Time**: 8-13 hours (1-2 days)

---

## 6. Testing Strategy

### Unit Tests
- ✅ `notifyN8nApproval()` with mock fetch
- ✅ Webhook payload construction
- ✅ Error handling and retry logic

### Integration Tests
- ✅ Backend approval → n8n webhook (mock n8n)
- ✅ n8n webhook → workflow continuation
- ✅ order.json creation/updates in R2

### End-to-End Tests
1. **Full Flow Test:**
   - Workflow 2A generates assets
   - Assets appear in backend review dashboard
   - Approve preBria stage
   - Verify n8n receives webhook and continues
   - Workflow 2B processes
   - Approve postBria
   - Workflow 3 compiles PDF
   - Approve postPdf
   - Order marked complete

2. **Error Scenarios:**
   - Webhook URL invalid → logs error, approval still saved
   - n8n timeout → retry logic activates
   - Invalid stage → backend rejects
   - Missing order.json → graceful fallback

---

## 7. Security Considerations

### Webhook Authentication (Optional but Recommended)

**Option 1: HMAC Signature**
```typescript
// Backend: Sign payload
const signature = createHmac('sha256', process.env.LHL_WEBHOOK_SECRET!)
  .update(JSON.stringify(payload))
  .digest('hex');

// n8n: Verify signature
const expected = createHmac('sha256', $env.LHL_WEBHOOK_SECRET)
  .update(JSON.stringify($json))
  .digest('hex');

if (signature !== expected) {
  throw new Error('Invalid signature');
}
```

**Option 2: API Key / Bearer Token**
- Backend sends `Authorization: Bearer {token}`
- n8n validates token

**Option 3: n8n Webhook Authentication**
- Use n8n's built-in webhook auth if available

---

## 8. Monitoring & Observability

### Key Metrics to Track
- ✅ Webhook success/failure rates
- ✅ Approval → workflow continuation latency
- ✅ Failed webhook retry counts
- ✅ Stage approval times

### Logging
- ✅ Log all approval events with orderId, stage, reviewer
- ✅ Log webhook POST attempts (success/failure)
- ✅ Log order.json updates

### Alerts
- ✅ Alert if webhook failure rate > 10%
- ✅ Alert if approval → workflow continuation > 5 minutes
- ✅ Alert on repeated webhook failures for same order

---

## 9. Open Questions & Decisions Needed

1. **Webhook URL Configuration:**
   - Single global URL (`N8N_APPROVE_WEBHOOK`) vs. per-order URL?
   - **Recommendation**: Global URL with stage branching

2. **Approval Waiting Mechanism:**
   - Webhook-based (n8n waits) vs. Polling (n8n checks R2)?
   - **Recommendation**: Webhook-based for real-time, polling as fallback

3. **order.json Location:**
   - Finalize exact path structure before implementation
   - **Recommendation**: `{assetPrefix}order.json`

4. **Error Recovery:**
   - If webhook fails, should approval be saved for retry?
   - **Recommendation**: Yes, add retry queue for failed webhooks

5. **Multiple Approvals:**
   - Can a stage be approved multiple times?
   - **Recommendation**: Idempotent - multiple approvals = single webhook call

---

## 10. Next Steps

### Immediate Actions (This Week)
1. **Finalize R2 storage structure** - Confirm folder hierarchy
2. **Implement backend webhook integration** - Phase 1
3. **Set up n8n approval webhook** - Phase 2
4. **Update Workflow 2A to create order.json** - Phase 3

### Short-term (Next Week)
1. Complete testing and validation - Phase 4
2. Add monitoring and alerts
3. Update documentation

### Future Enhancements
- Retry queue for failed webhooks
- Real-time status updates via WebSockets
- Multi-reviewer support
- Approval history/audit logs

---

## 11. Reference: Expected Payload Format

### Backend → n8n Webhook
```json
{
  "prefix": "projects/personalized-book/orders/book-001-20251016-abc123/",
  "stage": "preBria",
  "approvedAt": "2025-10-16T19:30:00Z",
  "reviewer": "jeff@thepeakbeyond.com",
  "orderId": "book-001-20251016-abc123"
}
```

### n8n → Backend (if using API to check status)
```json
{
  "orderId": "book-001-20251016-abc123",
  "stage": "postBria",
  "assetsReady": true,
  "assetCount": 12,
  "assetPrefix": "projects/personalized-book/orders/book-001-20251016-abc123/"
}
```

---

## Summary

The integration is **85% complete**. The main missing piece is the **webhook communication** between backend approval and n8n workflow continuation. With the implementation plan above, this can be completed in **1-2 days** of focused development.

**Priority Order:**
1. ⚠️ **P0**: Backend webhook POST to n8n (Phase 1)
2. ⚠️ **P0**: n8n webhook endpoint and branching (Phase 2)
3. ⚠️ **P0**: order.json management in n8n (Phase 3)
4. ✅ **P1**: Testing and monitoring (Phase 4-5)

Once these are implemented, the full human-in-the-loop review system will be operational end-to-end.







