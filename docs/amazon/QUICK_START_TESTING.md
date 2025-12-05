# Quick Start: Testing Your Approved Amazon Listing

**Status**: ✅ Listing Approved - Ready to Test  
**Goal**: Get to your first Amazon sale with minimal cost  
**Time**: 2-3 hours (Phase 1), then 2-3 hours (Phase 2)  
**Cost**: $0 (if you cancel before Lulu prints)

---

## 🎯 **Your Immediate Next Steps**

### **RIGHT NOW: Phase 1 - Mock Order Testing**

**What**: Test complete workflow with mock order (no real Amazon order needed)  
**Why**: Verify everything works before placing real orders  
**Cost**: $0 (if you cancel Lulu job in time)  
**Time**: 2-3 hours

**Steps**:
1. ✅ Update mock order in Workflow 0 with YOUR email
2. ✅ Run Workflow 0 → verify order in Supabase
3. ✅ Run Workflows 2A, 2B, 3 → verify PDF generated
4. ✅ Test Amazon Messaging API → check your Amazon Message Center
5. ✅ Click preview link → test approval flow
6. ✅ Run Workflow 4 → **IMMEDIATELY cancel in Lulu dashboard**

**Full Guide**: See `docs/amazon/POST_APPROVAL_TESTING_CHECKLIST.md` - Phase 1

---

### **NEXT: Phase 2 - Real Amazon Order**

**What**: Place real test order through Amazon (temporarily reactivate listing)  
**Why**: Validate real Amazon integration end-to-end  
**Cost**: $0 (if cancelled before Lulu submission)  
**Time**: 2-3 hours

**Prerequisites**:
- ✅ Phase 1 successful
- ⚠️ Workflow 0 configured for real Amazon orders (see note below)

**Steps**:
1. ✅ Temporarily reactivate listing
2. ✅ Place test order on Amazon.com
3. ✅ Deactivate listing again
4. ✅ Monitor workflow execution (60-90 min)
5. ✅ Receive Amazon Message with preview link
6. ✅ Approve order
7. ✅ **Cancel BEFORE Workflow 4 submits to Lulu**

**Full Guide**: See `docs/amazon/POST_APPROVAL_TESTING_CHECKLIST.md` - Phase 2

---

### **OPTIONAL: Phase 3 - Full Print Test**

**What**: Let one order print completely (don't cancel)  
**Why**: Validate physical book quality  
**Cost**: ~$30  
**Time**: 7-10 days (delivery)

**Only do this when**:
- ✅ Phases 1 and 2 successful
- ✅ Confident in system
- ✅ Ready to validate physical quality

**Full Guide**: See `docs/amazon/POST_APPROVAL_TESTING_CHECKLIST.md` - Phase 3

---

## ⚠️ **CRITICAL: Workflow 0 Configuration**

**IMPORTANT**: Your Workflow 0 currently uses a **mock order generator**.

### **For Phase 1** (TODAY):
- ✅ Use existing mock order generator
- ✅ No changes needed
- ✅ Perfect for initial testing

### **For Phase 2** (Real Orders):
- ⚠️ Need to add Amazon SP-API order fetching
- ⚠️ Replace mock generator with SP-API call
- ⚠️ See `docs/amazon/AMAZON_INTEGRATION.md` for details

**Who Should Do This**: Developer A (workflow owner) or both of you together

---

## 🚀 **Quick Commands**

### **Check Order in Database**:
```sql
SELECT 
  amazon_order_id,
  status,
  execution_status,
  next_workflow,
  final_book_url,
  customer_approval_status,
  lulu_job_id,
  updated_at
FROM orders
WHERE amazon_order_id = 'YOUR_ORDER_ID'
ORDER BY created_at DESC;
```

### **Test Amazon Messaging API**:
```bash
cd /Users/johncapogna/Sites/little-hero-books/back-end

curl -X POST http://localhost:3000/api/notifications/preview/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "YOUR_ORDER_ID",
    "token": "YOUR_PREVIEW_TOKEN",
    "reminderType": "initial"
  }'
```

### **Check Notification Logs**:
```sql
SELECT 
  notification_type,
  status,
  message_id,
  error_message,
  created_at
FROM notification_logs
ORDER BY created_at DESC
LIMIT 10;
```

---

## ✅ **Success Checklist**

### **Phase 1 Complete When**:
- [x] Mock order processed through all workflows
- [x] Amazon Message received in your Message Center
- [x] Preview link works and shows PDF
- [x] Approval flow functional
- [x] Lulu job submitted and cancelled (no cost)

### **Phase 2 Complete When**:
- [x] Real Amazon order fetched from SP-API
- [x] Complete workflow execution
- [x] Amazon Message received
- [x] Order cancelled before Lulu print

### **Ready to Launch When**:
- [x] Phases 1 and 2 successful
- [x] No critical errors
- [x] Confident in system reliability
- [x] Optional: Phase 3 complete (physical book validated)

---

## 🚨 **Common Issues**

### **1. Mock Order Not in Database**
- Check CONFIG node has Supabase credentials
- Verify service_role key (not anon key)
- Check "Supabase: upsert order" node logs

### **2. Amazon Message Not Sent**
- Check `back-end/.env.local` has production credentials
- Verify `AMAZON_SANDBOX_MODE=false`
- Check `notification_logs` table for errors

### **3. Preview Link 404**
- Verify token in `preview_tokens` table
- Check order exists in database
- Verify backend server running

### **4. Lulu API Fails**
- Check Lulu credentials in Workflow 4
- Verify shipping address has phone number
- Check PDF meets Lulu specs (16 pages, 8.5×8.5")

**Full Troubleshooting**: See `docs/amazon/POST_APPROVAL_TESTING_CHECKLIST.md` - Troubleshooting section

---

## 📚 **Key Documentation**

- **Complete Testing Guide**: `docs/amazon/POST_APPROVAL_TESTING_CHECKLIST.md` ⭐ **START HERE**
- **Amazon Integration**: `docs/amazon/AMAZON_INTEGRATION.md`
- **Messaging API Status**: `docs/amazon/AMAZON_MESSAGING_STATUS.md`
- **Customer Preview System**: `docs/CUSTOMER_PREVIEW_APPROVAL_SYSTEM.md`
- **Developer Packages**: `DEVELOPER_A_PACKAGE.md`, `DEVELOPER_B_PACKAGE.md`

---

## 📅 **Timeline to First Sale**

**Accelerated Path** (Skip Phase 3):
- **Day 1** (TODAY): Phase 1 testing (2-3 hours)
- **Day 2**: Phase 2 testing (2-3 hours)
- **Day 3**: Reactivate listing and LAUNCH! 🚀

**Recommended Path** (Include Phase 3):
- **Day 1** (TODAY): Phase 1 testing (2-3 hours)
- **Day 2**: Phase 2 testing (2-3 hours)
- **Day 3**: Place Phase 3 order (don't cancel)
- **Day 10-13**: Receive physical book, inspect quality
- **Day 14**: Reactivate listing and LAUNCH! 🚀

---

## 🎊 **You're Almost There!**

**What You've Accomplished**:
- ✅ Amazon listing approved
- ✅ Production credentials configured
- ✅ All workflows ready
- ✅ Amazon Messaging API implemented
- ✅ Customer preview system live
- ✅ Lulu integration ready

**What's Left**:
- 🧪 2-3 hours of testing (Phase 1)
- 🧪 2-3 hours of testing (Phase 2)
- 🚀 Reactivate listing and get your first sale!

---

**Next Action**: Open `docs/amazon/POST_APPROVAL_TESTING_CHECKLIST.md` and start Phase 1 testing NOW! 🚀

**Questions?** Check the troubleshooting section or review the complete documentation.

**CONGRATULATIONS ON YOUR AMAZON APPROVAL! LET'S GET YOUR FIRST SALE! 🎉**

