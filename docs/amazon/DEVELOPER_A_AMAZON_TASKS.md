# Developer A - Amazon Custom Listing Tasks

**Date**: December 2, 2025  
**Status**: 🚨 **BLOCKING PROJECT** - Your tasks are blocking all end-to-end testing  
**Priority**: P0 (Critical)

---

## 🚨 **Why This Is Blocking**

Developer B has completed the Amazon Messaging API implementation, but **we cannot test it without a real Amazon Custom listing**.

### **What's Blocked**:
- ❌ Cannot test Amazon Messaging API with real orders
- ❌ Cannot validate end-to-end flow from Amazon → Lulu
- ❌ Cannot verify customer preview delivery via Amazon Message Center
- ❌ Cannot test complete system integration
- ❌ Cannot launch product to customers

### **What's Complete (Developer B)** ✅:
- ✅ AWS IAM credentials configured
- ✅ Amazon Messaging API implemented and tested
- ✅ API endpoint operational
- ✅ Database and workflows ready
- ✅ Customer preview system operational
- ✅ Lulu integration ready

---

## 🎯 **Your Critical Tasks**

### **Task 1: Create 7 Product Images** 📸

**Estimated Time**: 2-3 days

**Required Images**:
1. **Main Product Image** (WHITE BACKGROUND - REQUIRED)
   - 8.5×8.5 book mockup
   - Professional product shot
   - Minimum 1000×1000px (recommend 2000×2000px)
   - No text overlay on main image

2. **Personalization Options Grid**
   - Show customization choices (name, hair, skin, animal)
   - Visual examples of each option
   - Text overlay allowed

3. **Inside Pages Collage**
   - 4-6 page spreads from test PDFs
   - Character visible in different scenes
   - Name visible in text

4. **How It Works Infographic**
   - 3 steps: Choose Options → We Create → Fast Shipping
   - Simple icons
   - Clean design

5. **Quality Guarantee Badge**
   - "Human-Reviewed Quality" messaging
   - Trust badges
   - Professional appearance

6. **Gift-Ready Context**
   - Book in birthday/holiday setting
   - "Perfect for ages 3-7" callout
   - Emotional connection

7. **Lifestyle Shot**
   - Parent + child reading together
   - Can use stock photo + book overlay
   - Warm, inviting

**Reference**: `docs/AMAZON_LISTING_FINAL.md` (lines 113-152)

---

### **Task 2: Set Up Amazon Custom Listing** 🛒

**Estimated Time**: 2-3 hours (plus 1-3 days Amazon approval)

**Steps**:

1. **Log into Amazon Seller Central**
   - Professional Seller account required ($40/month)
   - Account should already be approved

2. **Create New Custom Product Listing**
   - Navigate to: Inventory → Add a Product → Create a new product
   - Select "Custom" product type

3. **Upload Product Images**
   - Upload all 7 images created in Task 1
   - Main image must have white background
   - Follow Amazon image requirements

4. **Add Product Information**
   - Copy listing text from `docs/AMAZON_LISTING_FINAL.md`
   - Product title, description, bullet points
   - Keywords and search terms

5. **Configure 10 Customization Fields**:
   - Child's Name (text input)
   - Child's Age (dropdown: 3-7)
   - Pronouns (dropdown: he/him, she/her, they/them)
   - Skin Tone (dropdown: light, medium, tan, deep)
   - Hair Color (dropdown: blonde, brown, black, red, gray)
   - Hair Style (dropdown: very short, short, medium, long, curly, straight, wavy)
   - Favorite Color (dropdown: red, blue, green, yellow, purple, pink, orange)
   - Animal Guide (dropdown: dog, cat, rabbit, bird, fox, bear, dragon)
   - Clothing Style (text input)
   - Hometown (text input)

6. **Set Pricing and Shipping**
   - Initial price: $27.99 (adjust based on market research)
   - Configure shipping options
   - Set fulfillment method (merchant-fulfilled)

7. **Submit for Approval**
   - Review all information
   - Submit listing for Amazon approval
   - Wait 1-3 days for approval

**Reference**: `docs/amazon/amazon-custom-listing-spec.md`

---

### **Task 3: Verify/Update SP-API Credentials** 🔑

**Status**: ✅ **COMPLETE** (Developer B completed December 2, 2025)

**What Was Done**:
Developer B created production Amazon SP-API credentials and updated the environment:

**Production App Created**:
- **App Name**: "Little Hero Labs Production"
- **App ID**: `amzn1.sp.solution.3e928368-7705-40e7-806f-d9d25b42516c`
- **Client ID**: `amzn1.application-oa2-client.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
- **Marketplaces**: United States, Canada, Mexico
- **Roles**: Buyer Communication, Inventory and Order Tracking

**Environment Variables Updated** in `back-end/.env.local`:
```bash
# === Amazon SP-API Configuration (PRODUCTION) ===
AMZ_APP_CLIENT_ID=amzn1.application-oa2-client.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AMZ_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AMZ_REFRESH_TOKEN=Atzr|IwEBIMo5pIff5... (production token)
AMZ_SELLER_ID=A2V719MRGLK48O
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
AMAZON_SANDBOX_MODE=false  # ← Set to production mode
```

✅ **No action needed** - Production credentials are configured and ready!

---

### **Task 4: Add HTTP Request Node to Workflow 3** 🔧

**Estimated Time**: 15 minutes

**Purpose**: Send Amazon Message with preview link after PDF generation

**Steps**:

1. **Open n8n** → Workflow 3: `LHB - 3 - PNG Assembly`

2. **Add HTTP Request Node** after "Generate Preview Token"
   - **Name**: `Send Amazon Preview Message`
   - **Method**: `POST`
   - **URL**: `https://admin.littleherolabs.com/api/notifications/preview/amazon`
   - **Authentication**: None
   - **Body**: JSON

3. **Configure Body**:
   ```json
   {
     "orderId": "{{ $json.orderId }}",
     "token": "{{ $json.token }}",
     "reminderType": "initial"
   }
   ```

4. **Add Error Handling**:
   - If message fails, log error but don't block workflow
   - Continue to next step even if message fails
   - Error will be logged in `notification_logs` table

5. **Connect Nodes**:
   ```
   Generate Preview Token
       ↓
   Send Amazon Preview Message
       ↓
   Update Order Status
   ```

6. **Test** with manual trigger

**Reference**: `docs/amazon/AMAZON_MESSAGING_API_SETUP.md`

---

## 🧪 **Testing Strategy (After Listing Created)**

### **Phase 1: Partial Testing (Cancel Before Lulu)**
**Goal**: Validate Amazon integration without print costs

**Steps**:
1. Place 2-3 test orders through Amazon Custom listing
2. Monitor orders flow through Workflows 0 → 1 → 2A → 2B → 3
3. Verify Amazon Messaging API sends preview link
4. Test customer preview page and approval flow
5. **Cancel orders before submitting to Lulu** (avoid print costs)
6. Verify all workflows and database updates work

**Cost**: $0 (orders cancelled before fulfillment)  
**Timeline**: 2-3 days

### **Phase 2: Full End-to-End Testing (Real Print)**
**Goal**: Validate complete system including Lulu print

**Steps**:
1. Place 1 real test order through Amazon Custom listing
2. Complete full workflow including Lulu print submission
3. Monitor Lulu webhook updates (status changes)
4. Verify shipment confirmation sent back to Amazon
5. Receive physical book and verify quality (7-10 days)

**Cost**: ~$30 (book price + shipping)  
**Timeline**: 7-10 days (including shipping)

**Reference**: `docs/amazon/TESTING_STRATEGY.md`

---

## ✅ **Acceptance Criteria**

- [ ] 7 product images created and optimized
- [ ] Amazon Custom listing created
- [ ] All customization fields configured correctly
- [ ] Listing submitted and approved by Amazon
- [x] Production SP-API credentials obtained (Developer B ✅)
- [x] Environment variables updated with production credentials (Developer B ✅)
- [x] Backend server restarted with new credentials (Developer B ✅)
- [ ] HTTP Request node added to Workflow 3
- [ ] Phase 1 testing complete (2-3 cancelled orders)
- [ ] Phase 2 testing complete (1 real order)
- [ ] Physical book received and quality verified
- [ ] System ready for customer launch

---

## 📅 **Timeline**

### **Week 1-2: Your Tasks** (Current)
- Create 7 product images
- Set up Amazon Custom listing
- Configure SP-API credentials
- Wait for Amazon approval (1-3 days)
- Add HTTP Request node to Workflow 3

### **Week 3: Phase 1 Testing** (Both Developers)
- Place 2-3 test orders
- Test Amazon Messaging API
- Verify customer preview flow
- Cancel orders before Lulu
- Fix any issues found

### **Week 4: Phase 2 Testing** (Both Developers)
- Place 1 real test order
- Monitor complete workflow
- Wait for physical book delivery
- Verify print quality
- Confirm all integrations work

### **Week 5: Launch** 🚀
- Final verification
- Make listing public
- Begin accepting customer orders
- Monitor first 10 orders closely

---

## 📚 **Reference Documents**

### **For Amazon Listing**:
- `docs/AMAZON_LISTING_FINAL.md` - Complete listing copy and specifications
- `docs/amazon/amazon-custom-listing-spec.md` - Detailed listing spec
- `docs/amazon/AMAZON_SETUP_GUIDE.md` - Complete setup guide

### **For SP-API**:
- `docs/amazon/AMAZON_INTEGRATION.md` - SP-API integration guide
- `docs/amazon/sp-api-integration-code.md` - Code examples

### **For Testing**:
- `docs/amazon/TESTING_STRATEGY.md` - Complete testing plan
- `docs/amazon/AMAZON_MESSAGING_STATUS.md` - Messaging API status

### **For Workflow Integration**:
- `docs/amazon/AMAZON_MESSAGING_API_SETUP.md` - How to add to Workflow 3
- `DEVELOPER_A_PACKAGE.md` - Your complete task list

---

## 🚨 **Critical Notes**

1. **Product Images Are Blocking**: Cannot create listing without images
2. **Listing Approval Takes Time**: Plan for 1-3 days Amazon approval
3. **Production Credentials Required**: Sandbox won't work for real orders
4. **Testing Costs Money**: Budget ~$30 for one real test order
5. **Physical Book Takes Time**: 7-10 days for delivery

---

## 📞 **Questions?**

If you need help with:
- **Product images**: Use your design tools (same as storybook design)
- **Amazon listing**: Follow `docs/AMAZON_LISTING_FINAL.md`
- **SP-API credentials**: Follow `docs/amazon/AMAZON_SETUP_GUIDE.md`
- **Workflow integration**: See `docs/amazon/AMAZON_MESSAGING_API_SETUP.md`

---

## 🎯 **Summary**

**Your 3 Critical Tasks**:
1. ⏳ Create 7 product images (2-3 days)
2. ⏳ Set up Amazon Custom listing (2-3 hours + approval)
3. ⏳ Add HTTP Request node to Workflow 3 (15 minutes)

**Total Estimated Time**: 3-5 days (including Amazon approval)

**Completed by Developer B**:
- ✅ Production SP-API credentials configured

**Once Complete**: We can immediately begin end-to-end testing with real Amazon orders!

---

**Status**: 🚨 **BLOCKING** - Please prioritize these tasks to unblock testing! 🚀

