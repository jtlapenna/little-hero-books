# Human-in-the-Loop Integration Summary

**Quick Overview** | Last Updated: October 2025

---

## 🎯 Status: Ready for Implementation

The human-in-the-loop review system is **85% complete**. The main gap is webhook communication between the backend approval system and n8n workflow automation.

---

## 📊 Current State

### ✅ What Works
- Backend approval dashboard with stage-based review
- Asset preview and replacement in R2
- Stage approval tracking (preBria, postBria, postPdf)
- n8n workflows for asset generation (2A, 2B, 3)
- R2 storage integration

### ❌ What's Missing
- Backend → n8n webhook notification on approval
- n8n webhook endpoints to receive approvals
- Stage-aware workflow branching in n8n
- `order.json` file creation/updates in n8n workflows

---

## 🔗 Integration Flow

```
┌─────────────────┐
│  n8n Workflow   │
│  Generate Assets│
└────────┬────────┘
         │ Uploads to R2
         ▼
┌─────────────────┐
│  Cloudflare R2   │
│  (Assets Stored) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Preview/Replace      ┌─────────────────┐
│  Backend        │◄──────────────────────────│  Reviewer      │
│  Dashboard      │                            │  Dashboard     │
└────────┬────────┘                            └────────────────┘
         │
         │ Approve Stage
         │ (preBria/postBria/postPdf)
         ▼
┌─────────────────┐      Webhook POST         ┌─────────────────┐
│  Backend        │───────────────────────────►│  n8n Webhook    │
│  Approval API   │   {prefix, stage, ...}     │  Endpoint       │
└─────────────────┘                            └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  n8n Workflow   │
                                              │  Continue to     │
                                              │  Next Stage     │
                                              └─────────────────┘
```

---

## 🔨 Implementation Required

### 1. Backend Webhook Integration (2-3 hours)
**File**: `back-end/src/lib/n8n-webhook.ts` (NEW)
- Function to POST approval to n8n webhook
- Retry logic with exponential backoff
- Error handling

**File**: `back-end/src/app/api/orders/[orderId]/approve/route.ts` (UPDATE)
- Call webhook after approval
- Load webhook URL from `order.json`
- Graceful failure handling

### 2. n8n Webhook Endpoint (1-2 hours)
**New Webhook Node**: `/webhook/approve`
- Receive POST from backend
- Branch by `stage` field:
  - `preBria` → Continue Workflow 2A → Bria
  - `postBria` → Continue Workflow 2B → PDF
  - `postPdf` → Finalize order

### 3. n8n order.json Management (2-3 hours)
**Workflow 2A**: Create `order.json` after asset generation
**Workflow 2B**: Update `order.json` when post-bria assets ready
**Workflow 3**: Update `order.json` when PDF ready

### 4. Testing (2-3 hours)
- End-to-end flow verification
- Error scenario testing
- Webhook failure recovery

**Total Estimated Time**: 8-13 hours (1-2 days)

---

## 📋 Quick Implementation Checklist

- [ ] Create `back-end/src/lib/n8n-webhook.ts`
- [ ] Update approval route to call webhook
- [ ] Add `N8N_APPROVE_WEBHOOK` env var
- [ ] Create n8n webhook endpoint `/webhook/approve`
- [ ] Add stage branching logic in n8n
- [ ] Update Workflow 2A to create `order.json`
- [ ] Update Workflow 2B to update `order.json`
- [ ] Update Workflow 3 to update `order.json`
- [ ] Test end-to-end approval flow
- [ ] Add monitoring/logging

---

## 📚 Documentation

- **Full Review**: `INTEGRATION_REVIEW_AND_PLAN.md` - Complete technical analysis
- **Implementation Checklist**: `INTEGRATION_CHECKLIST.md` - Step-by-step tasks
- **Technical Spec**: `human_in_loop_technical_spec.md` - API specifications
- **UI/UX Spec**: `ui_ux_specification.md` - Frontend requirements

---

## ⚠️ Open Questions

1. **R2 Folder Structure** - Finalize exact path hierarchy
2. **Webhook URL** - Global (`N8N_APPROVE_WEBHOOK`) or per-order?
3. **Approval Mechanism** - Webhook wait vs. polling?

**Recommendations:**
- Use global webhook URL with stage branching
- Use webhook-based (real-time) with polling as fallback
- Finalize R2 structure before implementation

---

## 🎯 Success Criteria

Integration is complete when:
1. ✅ Backend → n8n webhook works
2. ✅ All three stages trigger correct workflows
3. ✅ `order.json` managed correctly
4. ✅ Error handling works
5. ✅ End-to-end flow tested

---

## 🚀 Next Steps

1. **Review and finalize** R2 folder structure
2. **Implement backend webhook** (Phase 1)
3. **Set up n8n webhook** (Phase 2)
4. **Add order.json management** (Phase 3)
5. **Test and validate** (Phase 4)

**Priority**: P0 - Critical for workflow automation


