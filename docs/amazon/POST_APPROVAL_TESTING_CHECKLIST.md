# Post-Approval Testing Checklist

**Status**: Waiting for Amazon listing approval  
**Date Created**: December 2, 2025  
**Listing Status**: Pending Approval

---

## 🎯 **Immediate Actions After Approval**

### **Phase 1: Initial Verification (5 minutes)**

Once you receive the approval email from Amazon:

- [ ] **Verify listing is live**
  - Go to Amazon and search for your product
  - Confirm it appears in search results
  - Verify all 7 images are displaying correctly
  - Check that customization fields are working

- [ ] **Test the order form**
  - Click "Customize" or "Personalize"
  - Fill in all 10 customization fields
  - Verify dropdown options are correct
  - DO NOT complete the purchase yet

- [ ] **Screenshot everything**
  - Take screenshots of the live listing
  - Screenshot the customization form
  - Save for documentation

---

## 🧪 **Phase 2: Cancelled Order Testing (Day 1-2)**

**Goal**: Test the complete workflow WITHOUT incurring print costs

**Cost**: $0 (orders cancelled before Lulu submission)

### **Test Order 1: Basic Flow**

- [ ] **Place test order #1**
  - Use your own Amazon account
  - Fill in test character specs:
    - Name: "TestKid1"
    - Age: 5
    - Pronouns: they/them
    - Skin: medium
    - Hair: brown/curly
    - Color: purple
    - Animal: unicorn
  - Complete the purchase
  - Note the Amazon Order ID

- [ ] **Monitor Workflow 0 (Order Intake)**
  - Check n8n: Should fetch order within 10 minutes
  - Verify order appears in Supabase `orders` table
  - Check `status = 'queued_for_processing'`

- [ ] **Monitor Workflow 1 (Validation)**
  - Verify character specs extracted correctly
  - Check validation passed
  - Confirm `next_workflow = '2.A.-bria-submit'`

- [ ] **Monitor Workflows 2A → 2B → 3**
  - Watch character generation progress
  - Check human review stages (if applicable)
  - Verify PDF generation completes

- [ ] **Test Amazon Messaging API**
  - Verify message sent to your Amazon account
  - Check Amazon Message Center for the preview link
  - Click the link and verify preview page loads
  - Test the customer approval flow

- [ ] **Cancel the order**
  - Go to Amazon Orders
  - Cancel the order BEFORE it reaches Workflow 4
  - Verify cancellation in database

### **Test Order 2: Different Character**

- [ ] **Place test order #2**
  - Use different character specs:
    - Name: "TestKid2"
    - Age: 4
    - Pronouns: she/her
    - Skin: light
    - Hair: blonde/short
    - Color: blue
    - Animal: dragon
  - Complete the purchase

- [ ] **Repeat monitoring steps**
  - Verify all workflows execute
  - Test messaging API again
  - Confirm preview link works
  - Cancel before Workflow 4

### **Test Order 3: Edge Cases**

- [ ] **Place test order #3**
  - Use edge case character:
    - Name: "Très-Long-Name-Test"
    - Age: 7
    - Pronouns: he/him
    - Skin: deep
    - Hair: black/curly
    - Color: red
    - Animal: bear
  - Test special characters in name
  - Complete the purchase

- [ ] **Monitor and cancel**
  - Verify special characters handled correctly
  - Test messaging API
  - Cancel before Workflow 4

---

## 💰 **Phase 3: Real Print Test (Day 3-4)**

**Goal**: Test complete end-to-end flow including Lulu print

**Cost**: ~$30 (1 real book)

### **Test Order 4: Full End-to-End**

- [ ] **Place real test order**
  - Use your own specs or a friend's
  - Complete character customization
  - Complete the purchase
  - DO NOT CANCEL THIS ONE

- [ ] **Monitor complete workflow**
  - Verify Workflows 0 → 1 → 2A → 2B → 3
  - Test Amazon Messaging API
  - Approve the preview (or wait for auto-approval)
  - Verify Workflow 4 submits to Lulu
  - Check `lulu_job_id` stored in database

- [ ] **Monitor Lulu webhook updates**
  - Watch for status changes in database
  - Verify `lulu_status` updates automatically
  - Check tracking number appears when shipped

- [ ] **Receive and verify physical book**
  - Wait 7-10 days for delivery
  - Inspect print quality
  - Check character consistency
  - Verify story text is correct
  - Test binding and paper quality

---

## 📊 **Verification Checklist**

### **Amazon Integration**
- [ ] Orders fetched automatically from Amazon
- [ ] Character specs extracted correctly
- [ ] Order data stored in Supabase
- [ ] Amazon Messaging API sends preview links
- [ ] Messages appear in Amazon Message Center
- [ ] Customer receives email notification from Amazon

### **Workflow Execution**
- [ ] Workflow 0: Order intake working
- [ ] Workflow 1: Validation working
- [ ] Workflow 2A: Character generation working
- [ ] Workflow 2B: Background removal working
- [ ] Workflow 3: PDF assembly working
- [ ] Workflow 4: Lulu submission working
- [ ] Workflow 5: Error recovery working (if errors occur)

### **Customer Preview System**
- [ ] Preview tokens generated correctly
- [ ] Preview page loads with correct order
- [ ] PDF displays correctly
- [ ] Customer can approve/request changes
- [ ] Approval triggers Workflow 4
- [ ] Auto-approval works after 72 hours

### **Database & Tracking**
- [ ] All order data stored correctly
- [ ] Status updates working
- [ ] Lulu job ID stored
- [ ] Tracking number stored
- [ ] Webhook updates working

### **Print Quality**
- [ ] Character looks correct
- [ ] Colors are accurate
- [ ] Text is readable
- [ ] Binding is secure
- [ ] Paper quality acceptable
- [ ] Overall quality meets standards

---

## 🚨 **Issues to Watch For**

### **Common Issues**

1. **Order Not Fetched**
   - Check Workflow 0 is running (every 10 minutes)
   - Verify SP-API credentials are correct
   - Check `AMAZON_SANDBOX_MODE=false`

2. **Message Not Sent**
   - Check Amazon Message Center API response
   - Verify order status is correct
   - Check `notification_logs` table for errors

3. **Preview Link Broken**
   - Verify token is valid and not expired
   - Check preview page is deployed
   - Verify order exists in database

4. **Lulu Submission Failed**
   - Check Lulu API credentials
   - Verify PDF meets Lulu specs
   - Check `failed_orders` table

### **How to Debug**

1. **Check n8n Execution Logs**
   - Go to n8n dashboard
   - View execution history
   - Look for errors or warnings

2. **Check Supabase Database**
   ```sql
   -- Check order status
   SELECT amazon_order_id, status, next_workflow, updated_at
   FROM orders
   ORDER BY created_at DESC
   LIMIT 10;
   
   -- Check notification logs
   SELECT order_id, notification_type, status, error_message
   FROM notification_logs
   ORDER BY created_at DESC
   LIMIT 10;
   
   -- Check failed orders
   SELECT order_id, error_type, error_message
   FROM failed_orders
   ORDER BY created_at DESC;
   ```

3. **Check Backend Logs**
   - View Next.js logs for API errors
   - Check for authentication issues
   - Look for database connection errors

---

## 📝 **Documentation Updates After Testing**

After completing all tests, update these documents:

- [ ] `TESTING_STRATEGY.md` - Mark phases complete
- [ ] `AMAZON_MESSAGING_STATUS.md` - Update with test results
- [ ] `PRODUCTION_CREDENTIALS_COMPLETE.md` - Add testing notes
- [ ] `DEVELOPER_A_PACKAGE.md` - Mark Amazon listing complete
- [ ] `DEVELOPER_B_PACKAGE.md` - Update integration status

---

## 🎯 **Success Criteria**

### **Phase 1 Success** (Cancelled Orders)
- ✅ 3 test orders placed and cancelled
- ✅ All workflows executed successfully
- ✅ Amazon Messaging API working
- ✅ Preview links delivered and functional
- ✅ No errors in database or logs

### **Phase 2 Success** (Real Print)
- ✅ 1 real order completed end-to-end
- ✅ Physical book received
- ✅ Print quality acceptable
- ✅ Customer experience smooth
- ✅ All integrations working

### **Ready for Launch**
- ✅ All tests passed
- ✅ No critical issues found
- ✅ Documentation updated
- ✅ Team confident in system
- ✅ Ready to accept customer orders

---

## 📅 **Timeline**

**Day 0**: Listing approved (waiting)  
**Day 1**: Phase 1 testing (3 cancelled orders)  
**Day 2**: Review results, fix any issues  
**Day 3**: Phase 2 testing (1 real order)  
**Day 4-10**: Wait for physical book delivery  
**Day 11**: Review physical book quality  
**Day 12**: Launch to customers 🚀

---

## 🎊 **After Launch**

Once testing is complete and you're ready to launch:

- [ ] Remove test orders from database
- [ ] Update listing with any improvements
- [ ] Enable Amazon PPC campaign
- [ ] Monitor first 10 customer orders closely
- [ ] Collect customer feedback
- [ ] Iterate and improve

---

**Status**: ⏳ Waiting for Amazon approval  
**Next Action**: Monitor email for approval notification  
**Estimated Approval Time**: 1-3 business days

