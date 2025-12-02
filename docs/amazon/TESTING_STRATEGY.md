# Amazon Integration Testing Strategy

**Date**: December 2, 2025  
**Status**: Waiting on Developer A to create Amazon Custom listing

---

## 🎯 **Overview**

This document outlines the testing strategy for validating the complete Amazon → Lulu integration once the Amazon Custom listing is created.

---

## 🚨 **Current Blocker**

**Blocking Task**: Amazon Custom listing creation (Developer A)

**What's Needed**:
1. ✅ Amazon Seller account approved
2. ⏳ 7 product images created
3. ⏳ Amazon Custom listing set up
4. ⏳ SP-API credentials configured
5. ⏳ Listing approved by Amazon

**Why This Blocks Testing**:
- ❌ Cannot test Amazon Messaging API with real orders
- ❌ Cannot validate end-to-end flow from Amazon → Lulu
- ❌ Cannot verify customer preview delivery via Amazon Message Center
- ❌ Cannot test complete system integration

---

## ✅ **What's Already Complete (Developer B)**

### **Amazon Messaging API** ✅
- ✅ AWS IAM user created: `little-hero-labs-sp-api`
- ✅ Custom IAM policy created: `LittleHeroLabsSpApiAccess`
- ✅ Access keys generated and configured
- ✅ Environment variables updated
- ✅ API endpoint tested: `/api/notifications/preview/amazon`
- ✅ Backend server operational

**Test Result**:
```json
{
  "success": false,
  "error": "Order TEST-ORDER-123 not found"
}
```
✅ This confirms credentials are working correctly!

### **Database & Workflows** ✅
- ✅ Supabase database operational
- ✅ Workflow 1 (Order Intake) complete
- ✅ Workflows 4-8 (Print, Error Recovery, etc.) complete
- ✅ Lulu webhook endpoint deployed
- ✅ Customer preview system operational

---

## 🧪 **Testing Strategy**

### **Phase 1: Partial Testing (Cancel Before Lulu)**

**Goal**: Validate Amazon integration and messaging without incurring print costs

**Steps**:
1. **Place Test Order #1** through Amazon Custom listing
   - Use real shipping address
   - Fill in all customization fields
   - Complete checkout (will be charged, then refunded)

2. **Monitor Workflow Progress**:
   - ✅ Order appears in Workflow 0 (within 10 minutes)
   - ✅ Order stored in Supabase database
   - ✅ Workflows 2A → 2B → 3 complete
   - ✅ PDF generated successfully

3. **Test Amazon Messaging API**:
   - ✅ Preview token generated
   - ✅ Amazon Message sent via Message Center
   - ✅ Check Amazon Message Center for customer message
   - ✅ Click preview link and verify it loads
   - ✅ Test customer approval flow

4. **Cancel Order**:
   - Cancel order in Amazon Seller Central **before** Workflow 4 submits to Lulu
   - Verify order status updates correctly
   - Request refund if already charged

5. **Repeat 2-3 Times**:
   - Test different character combinations
   - Verify consistency across orders
   - Test error handling and edge cases

**Cost**: $0 (orders cancelled before fulfillment, refunds issued)

**Timeline**: 2-3 days

---

### **Phase 2: Full End-to-End Testing (Real Print)**

**Goal**: Validate complete system including Lulu print and shipment

**Steps**:
1. **Place Real Test Order** through Amazon Custom listing
   - Use real shipping address
   - Complete checkout
   - **Do not cancel** - let it go through full workflow

2. **Monitor Complete Flow**:
   - ✅ Workflows 0 → 1 → 2A → 2B → 3 complete
   - ✅ Amazon Message sent with preview link
   - ✅ Customer preview and approval tested
   - ✅ Workflow 4 submits to Lulu
   - ✅ `lulu_job_id` stored in database

3. **Monitor Lulu Webhook Updates**:
   - ✅ Lulu webhook sends status updates
   - ✅ Database updates with `lulu_status`
   - ✅ Tracking number appears when shipped
   - ✅ Shipment confirmation sent to Amazon

4. **Receive Physical Book**:
   - Wait 7-10 days for delivery
   - Verify print quality
   - Check personalization accuracy
   - Validate book meets specifications

5. **Verify Amazon Integration**:
   - Check order status in Amazon Seller Central
   - Verify tracking number appears
   - Confirm customer receives all notifications

**Cost**: ~$30 (book price + shipping)

**Timeline**: 7-10 days (including shipping)

---

## 📋 **Test Cases**

### **Test Case 1: Basic Order Flow**
- **Character**: Emma, 5 years, she/her, medium skin, brown curly hair
- **Goal**: Verify basic order processing
- **Expected**: Order completes successfully, book arrives as expected

### **Test Case 2: Edge Case Testing**
- **Character**: Long name (15+ characters), special characters
- **Goal**: Test name handling and edge cases
- **Expected**: System handles gracefully, no errors

### **Test Case 3: Customer Revision**
- **Character**: Any
- **Goal**: Test customer requests revision via preview page
- **Expected**: Revision captured, workflow handles correctly

---

## ✅ **Success Criteria**

### **Phase 1 (Partial Testing)**
- [ ] Orders appear in Workflow 0 within 10 minutes
- [ ] All customization fields parsed correctly
- [ ] Workflows 2A → 2B → 3 complete successfully
- [ ] Amazon Message sent via Message Center
- [ ] Customer preview link works
- [ ] Preview page loads correctly
- [ ] Approval flow works
- [ ] Orders can be cancelled before Lulu submission

### **Phase 2 (Full Testing)**
- [ ] Workflow 4 submits to Lulu successfully
- [ ] `lulu_job_id` stored in database
- [ ] Lulu webhook updates received
- [ ] Database updates with status changes
- [ ] Tracking number appears when shipped
- [ ] Shipment confirmation sent to Amazon
- [ ] Physical book received within 10 days
- [ ] Print quality meets expectations
- [ ] Personalization is accurate

---

## 🚧 **Known Limitations**

### **Cannot Test Until Listing Created**
- Amazon Messaging API requires real Amazon order IDs
- Cannot send messages to arbitrary email addresses
- Sandbox environment has limited messaging support
- Must have actual Amazon Custom listing to test

### **Workarounds**
- ✅ API configuration tested (credentials work)
- ✅ Database integration tested (with manual orders)
- ✅ Customer preview page tested (with manual tokens)
- ⏳ Waiting for real Amazon orders to test messaging

---

## 📊 **Testing Timeline**

### **Week 1-2: Developer A Creates Listing**
- Create 7 product images
- Set up Amazon Custom listing
- Configure SP-API credentials
- Wait for Amazon approval (1-3 days)

### **Week 3: Phase 1 Testing**
- Place 2-3 test orders
- Test Amazon Messaging API
- Verify customer preview flow
- Cancel orders before Lulu
- Fix any issues found

### **Week 4: Phase 2 Testing**
- Place 1 real test order
- Monitor complete workflow
- Wait for physical book delivery
- Verify print quality
- Confirm all integrations work

### **Week 5: Launch**
- Final verification
- Make listing public
- Begin accepting customer orders
- Monitor first 10 orders closely

---

## 🎯 **Next Steps**

### **Immediate (Developer A)**
1. Create 7 product images for Amazon listing
2. Set up Amazon Custom listing
3. Configure SP-API credentials
4. Submit listing for approval

### **Once Listing Approved (Developer B)**
1. Begin Phase 1 testing (cancelled orders)
2. Verify Amazon Messaging API with real orders
3. Test customer preview flow
4. Proceed to Phase 2 (real print test)

---

## 📞 **Communication**

### **Developer A Responsibilities**
- Amazon Custom listing creation
- Product images
- SP-API credentials
- Workflow 2A, 2B, 3 integration (if needed)

### **Developer B Responsibilities**
- Amazon Messaging API (complete ✅)
- Testing coordination
- Customer preview system (complete ✅)
- Workflow 0, 1, 4-8 (complete ✅)

---

## 📚 **Reference Documents**

- `docs/amazon/AMAZON_MESSAGING_API_SETUP.md` - Messaging API setup (complete)
- `docs/amazon/AMAZON_SELLER_APPROVED_NEXT_STEPS.md` - What's now unlocked
- `docs/amazon/DEVELOPER_B_AMAZON_CHECKLIST.md` - Developer B tasks (complete)
- `docs/amazon/WHATS_NOW_POSSIBLE.md` - Testing capabilities
- `DEVELOPER_A_PACKAGE.md` - Developer A tasks and responsibilities

---

**Status**: ⏳ Waiting on Developer A to create Amazon Custom listing

**Once listing is created, we can begin comprehensive testing!** 🚀

