# Human-in-the-Loop Integration Checklist

**Quick reference for implementing the backend ↔ n8n integration**

---

## ✅ Pre-Implementation Checklist

### Documentation Review
- [x] Review all technical specs
- [x] Review UI/UX requirements
- [x] Review n8n workflow structure
- [x] Identify integration gaps
- [x] Create implementation plan

### Decisions Needed
- [ ] **Finalize R2 folder structure** (confirm exact path hierarchy)
- [ ] **Confirm n8n webhook URL** (global or per-order?)
- [ ] **Choose approval waiting mechanism** (webhook vs polling)

---

## 🔨 Implementation Tasks

### Phase 1: Backend Webhook Integration

**File: `back-end/src/lib/n8n-webhook.ts`** (NEW)
- [ ] Create file with `notifyN8nApproval()` function
- [ ] Implement exponential backoff retry logic
- [ ] Add error handling and logging
- [ ] Export interface `ApprovalWebhookPayload`

**File: `back-end/src/app/api/orders/[orderId]/approve/route.ts`** (UPDATE)
- [ ] Import `notifyN8nApproval`
- [ ] Load `order.json` from R2 to get webhook URL
- [ ] Call `notifyN8nApproval()` after `approveStage()`
- [ ] Handle webhook failures gracefully (log but don't fail approval)
- [ ] Return success response

**File: `back-end/src/lib/r2-service.ts`** (UPDATE or CREATE helper)
- [ ] Add `loadOrderFromR2(orderId: string)` function
- [ ] Parse and return `order.json` structure
- [ ] Handle missing order.json gracefully

**File: `back-end/env.example`** (UPDATE)
- [ ] Add `N8N_APPROVE_WEBHOOK=https://your-n8n-instance.com/webhook/approve`
- [ ] Optionally: Add `LHL_WEBHOOK_SECRET=` for HMAC signatures

**Testing**
- [ ] Unit test `notifyN8nApproval()` with mock fetch
- [ ] Test retry logic with failing webhooks
- [ ] Test successful webhook call
- [ ] Test fallback when webhook URL missing

---

### Phase 2: n8n Webhook Endpoint

**New n8n Webhook Node**
- [ ] Create webhook node: `/webhook/approve`
- [ ] Configure HTTP Method: POST
- [ ] Configure Response Mode: Last Node (or separate Respond node)

**New n8n Code Node: Branch by Stage**
- [ ] Extract `stage` from webhook payload
- [ ] Branch logic:
  - [ ] IF `stage === "preBria"` → Route to Workflow 2A continuation
  - [ ] IF `stage === "postBria"` → Route to Workflow 2B continuation
  - [ ] IF `stage === "postPdf"` → Route to Workflow 3 / Finalize
- [ ] Load `order.json` from R2 using `prefix`
- [ ] Pass order context to next workflow node

**n8n Environment Variables**
- [ ] Set `N8N_APPROVE_WEBHOOK_URL` in n8n env
- [ ] Optionally: Set `LHL_WEBHOOK_SECRET` for signature verification

**Testing**
- [ ] Test webhook receives POST from backend
- [ ] Test stage branching logic
- [ ] Test workflow continuation for each stage
- [ ] Verify webhook response format

---

### Phase 3: n8n order.json Management

**Workflow 2A: After Asset Generation**
- [ ] Add code node to create `order.json`
- [ ] Structure order data:
  ```json
  {
    "orderId": "...",
    "assetPrefix": "...",
    "reviewStages": {
      "preBria": { "status": "pending" },
      "postBria": { "status": "pending" },
      "postPdf": { "status": "pending" }
    },
    "webhooks": {
      "onApprove": "{webhook_url}"
    }
  }
  ```
- [ ] Upload `order.json` to R2 at `{assetPrefix}order.json`

**Workflow 2B: After Bria Processing**
- [ ] Add code node to update `order.json`
- [ ] Read existing `order.json` from R2
- [ ] Update: `reviewStages.postBria.status = "pending"`
- [ ] Upload updated `order.json` back to R2

**Workflow 3: After PDF Compilation**
- [ ] Add code node to update `order.json`
- [ ] Update: `reviewStages.postPdf.status = "pending"`
- [ ] Upload updated `order.json` back to R2

**Testing**
- [ ] Verify `order.json` created correctly in R2
- [ ] Verify `order.json` updates at each stage
- [ ] Verify backend can read `order.json` for webhook URL

---

### Phase 4: End-to-End Testing

**Full Flow Test**
- [ ] Run Workflow 2A → Verify assets in review dashboard
- [ ] Approve preBria → Verify n8n receives webhook
- [ ] Verify Workflow 2B continues → Verify post-bria assets appear
- [ ] Approve postBria → Verify n8n receives webhook
- [ ] Verify Workflow 3 compiles PDF → Verify PDF in review dashboard
- [ ] Approve postPdf → Verify order finalized

**Error Scenario Tests**
- [ ] Webhook URL invalid → Verify error logged, approval still saved
- [ ] n8n timeout → Verify retry logic activates
- [ ] Invalid stage → Verify backend rejects
- [ ] Missing order.json → Verify graceful fallback
- [ ] Network failure → Verify retry with backoff

---

### Phase 5: Monitoring & Documentation

**Monitoring**
- [ ] Add logging for all approval events
- [ ] Add logging for webhook POST attempts (success/failure)
- [ ] Add metrics for webhook success rate
- [ ] Set up alerts for webhook failures

**Documentation**
- [ ] Update workflow documentation with approval flow
- [ ] Document webhook payload format
- [ ] Document troubleshooting steps
- [ ] Create runbook for common issues

---

## 🐛 Troubleshooting Guide

### Issue: Backend approval doesn't trigger n8n workflow

**Check:**
1. Verify `N8N_APPROVE_WEBHOOK` env var is set
2. Check backend logs for webhook POST attempts
3. Verify n8n webhook node is active and listening
4. Check n8n execution logs for received webhooks
5. Verify webhook payload format matches n8n expectations

### Issue: n8n doesn't continue workflow after approval

**Check:**
1. Verify webhook payload includes `stage` field
2. Check code node branching logic
3. Verify workflow nodes are connected correctly
4. Check n8n execution logs for errors
5. Verify `order.json` can be loaded from R2

### Issue: order.json missing or incorrect

**Check:**
1. Verify Workflow 2A creates `order.json` after asset generation
2. Check R2 path: `{assetPrefix}order.json`
3. Verify JSON structure matches spec
4. Check file permissions in R2

---

## 📝 Quick Reference

### Webhook Payload Format
```json
{
  "prefix": "projects/personalized-book/orders/{orderId}/",
  "stage": "preBria" | "postBria" | "postPdf",
  "approvedAt": "2025-10-16T19:30:00Z",
  "reviewer": "email@example.com",
  "orderId": "book-001-20251016-abc123"
}
```

### order.json Structure
```json
{
  "orderId": "book-001-20251016-abc123",
  "assetPrefix": "projects/personalized-book/orders/book-001-20251016-abc123/",
  "reviewStages": {
    "preBria": { "status": "pending" | "approved" },
    "postBria": { "status": "pending" | "approved" },
    "postPdf": { "status": "pending" | "approved" }
  },
  "webhooks": {
    "onApprove": "https://your-n8n-instance.com/webhook/approve"
  }
}
```

### Environment Variables

**Backend (.env)**
```env
N8N_APPROVE_WEBHOOK=https://your-n8n-instance.com/webhook/approve
LHL_WEBHOOK_SECRET=your-secret-key-here  # Optional
```

**n8n**
```env
N8N_APPROVE_WEBHOOK_URL=https://your-n8n-instance.com/webhook/approve
LHL_WEBHOOK_SECRET=your-secret-key-here  # Optional
```

---

## ✅ Completion Criteria

The integration is complete when:

1. ✅ Backend sends webhook to n8n when stage is approved
2. ✅ n8n receives webhook and branches by stage
3. ✅ Each stage approval triggers correct workflow continuation
4. ✅ `order.json` is created/updated at each workflow stage
5. ✅ Backend can read `order.json` to get webhook URL
6. ✅ All three stages work end-to-end (preBria → postBria → postPdf)
7. ✅ Error handling works (webhook failures don't break approvals)
8. ✅ Monitoring/logging is in place

---

**Last Updated**: October 2025  
**Status**: Ready for Implementation





