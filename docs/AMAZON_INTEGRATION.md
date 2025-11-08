# Little Hero Books - Amazon Integration & Customer Experience

## 🎯 Current Status

**Amazon Integration**: ✅ **COMPLETE & READY**  
**Pre-Launch Testing**: ✅ **TEST BEFORE AMAZON ACCOUNT**  
**Next Step**: Test with mock data → Set up Amazon account when ready ($40/month)

---

## 🧪 **PRE-LAUNCH TESTING (Do This First - $0)**

### Overview
Before paying $40/month for an Amazon Professional Seller account, you can test the entire order processing workflow using **mock Amazon data**. All preparation work is complete and documented in the `docs/amazon/` folder.

### Test Now (No Amazon Account Required)

#### 1. **Mock Data Testing**
Use the mock Amazon data generator to simulate real orders:

📁 **File**: `docs/amazon/mock-amazon-data-generator.js`

```javascript
// Drop this into your n8n Workflow 1 "Generate Orders" node
const orders = [
  {
    AmazonOrderId: `AMZ-${Date.now()}-001`,
    PurchaseDate: new Date().toISOString(),
    OrderStatus: 'Unshipped',
    OrderTotal: { Amount: '29.99', CurrencyCode: 'USD' },
    ShippingAddress: {
      Name: 'Jane Smith',
      AddressLine1: '123 Main St',
      City: 'Portland',
      StateOrRegion: 'OR',
      PostalCode: '97201',
      CountryCode: 'US'
    },
    BuyerInfo: { BuyerEmail: 'test@example.com' }
  }
];

// Mock customization data (exactly as Amazon Custom returns it)
const customization = {
  'Child\'s Name': 'Emma',
  'Child\'s Age': '5',
  'Pronouns': 'she/her',
  'Skin Tone': 'Medium',
  'Hair Color': 'Brown',
  'Hair Style': 'Short/Curly',
  'Favorite Color': 'Purple',
  'Animal Guide': 'Unicorn',
  'Clothing Style': 'Dress',
  'Dedication Message': 'To Emma, with love!'
};

return orders.map(order => ({
  json: {
    order: order,
    items: {
      OrderItems: [{
        ASIN: 'B0LITTLEHERO001',
        SellerSKU: 'LITTLE_HERO_BOOK_CUSTOM',
        BuyerCustomizedInfo: {
          CustomizedInfo: customization
        }
      }]
    }
  }
}));
```

#### 2. **Test Complete Flow**
- ✅ Workflow 1: Order intake with mock Amazon data
- ✅ Workflow 2A: Character generation (Bria AI)
- ✅ Workflow 2B: Character backup processing
- ✅ Workflow 3: Book assembly
- ✅ Human Review: Manual quality check
- ✅ Workflow 4: Print submission (mock Lulu)
- ✅ All workflows work with Amazon-formatted data

#### 3. **Pre-Launch Preparation Resources**

📁 **Complete Documentation in `docs/amazon/`**:

1. **`amazon-custom-listing-spec.md`** (265 lines)
   - Complete Amazon listing copy (ready to copy/paste)
   - All 10 customization fields defined
   - Product description, bullets, FAQ
   - Search keywords and backend terms
   - Product images checklist

2. **`sp-api-integration-code.md`** (420 lines)
   - Complete code for Workflow 1 (fetch orders from Amazon)
   - Complete code for Workflow 4 (confirm shipment to Amazon)
   - Ready to drop into n8n when you have credentials
   - Error handling and retry logic included

3. **`mock-amazon-data-generator.js`** (345 lines)
   - Generates realistic Amazon order data
   - Test with 5 different customer profiles
   - Matches exact Amazon API response format
   - Use in n8n Code nodes for testing

4. **`pre-launch-checklist.md`** (272 lines)
   - Everything you can do before Amazon account
   - Cost breakdown ($0 now vs $40/month later)
   - Timeline: 1-4 weeks to launch
   - You're already 90% ready!

#### 4. **Testing Workflow**

**Current State**: All workflows use mock data and can be tested end-to-end

**Replace This** (in Workflow 1 - Generate Mock Orders):
```javascript
// Simple mock data
const mockOrders = [{
  amazon_order_id: 'TEST-ORDER-001',
  customer_name: 'Jane Smith',
  // ...
}];
```

**With This** (Mock Amazon-formatted data):
```javascript
// Import from mock-amazon-data-generator.js
const { generateTestOrderBatch } = require('./mock-amazon-data-generator');
const orders = generateTestOrderBatch(3); // Generate 3 realistic orders
```

**Result**: Test your entire workflow with data that matches exactly what Amazon will send!

---

## 💰 Cost Considerations

- **Amazon Professional Seller Account**: $40/month
- **Amazon Custom Program**: Additional fees per order
- **SP-API Usage**: ~$0.01 per order

**Recommendation**: 
1. ✅ **Test complete system with mock data** (Do now - $0)
2. ✅ **Prepare all content and images** (See `pre-launch-checklist.md`)
3. ✅ **Order sample books from Lulu** (~$50-100)
4. ⏳ **Create Amazon account when ready to launch** ($40/month commitment)

### Pre-Launch Costs (One-Time)
- Product images (professional): $100-500 OR DIY free
- Sample books from Lulu: $50-100
- Domain name: $15/year
- Business formation (optional): $0-100
- **Total**: ~$150-700 one-time

### What You Can Test Now (FREE)
- ✅ Complete order processing workflow
- ✅ Character generation and customization
- ✅ PDF generation and book assembly
- ✅ Human review queue
- ✅ Error recovery and monitoring
- ✅ All workflows with Amazon-formatted data

---

## 🚀 **When You're Ready to Launch**

### Step 1: Amazon Account Setup (Day 1 - $40)
1. Create Amazon Professional Seller account
2. Get SP-API credentials (see setup below)
3. Create Amazon Custom listing (copy/paste from `amazon-custom-listing-spec.md`)
4. Upload product images

### Step 2: Connect to Workflows (Day 1 - 2 hours)
1. Add Amazon credentials to n8n
2. Replace Workflow 1 mock data with real API code (from `sp-api-integration-code.md`)
3. Add Workflow 4 shipment confirmation code
4. Test with one real order

### Step 3: Go Live! (Day 2)
1. Place test order yourself
2. Verify complete flow works
3. Make listing public
4. Start marketing!

---

## 🛒 Customer Experience Flow

### 1. Discovery & Consideration
- **Customer Action**: Sees book on Amazon (via search, ads, seasonal gift guides)
- **Emotional State**: Curious, hopeful about finding a unique gift
- **Trust Signals**: Amazon Prime badge, reviews, clear delivery timelines, sample images
- **Magical Moment**: Realizing the book can feature *their child's name* and favorite things

### 2. Customization & Checkout
- **Customer Action**: Fills in Amazon Custom fields
- **Emotional State**: Excited, imagining their child in the story
- **Trust Signals**: Simple dropdowns, preview thumbnails, reassurance that inputs are saved
- **Magical Moment**: Entering a personal dedication and seeing examples of personalized pages

### 3. Purchase & Confirmation
- **Customer Action**: Completes checkout on Amazon
- **Emotional State**: Confident — Amazon is familiar and secure
- **Trust Signals**: Amazon confirmation email + order ID
- **Magical Moment**: Anticipating the surprise reaction when the child sees themselves in the book

### 4. Processing & Production
- **Customer Action**: Waits while n8n workflows orchestrate generation → POD printing
- **Emotional State**: Neutral → slightly impatient during waiting
- **Trust Signals**: Optional buyer‑seller message: "We're preparing [Child's Name]'s adventure book — estimated ship date X."
- **Magical Moment**: Behind‑the‑scenes magic — child's favorite color, food, and animal are woven into the story

### 5. Shipment & Delivery
- **Customer Action**: Receives Amazon shipment notification with tracking
- **Emotional State**: Excited, anticipatory
- **Trust Signals**: Amazon shipping email, reliable tracking
- **Magical Moment**: Book arrives in the mail — tangible, keepsake quality

### 6. Unboxing & Reading
- **Customer Action**: Opens package, reads book with child
- **Emotional State**: Joy, pride, bonding
- **Trust Signals**: Quality print, durable feel, polished design
- **Magical Moment**: Child sees themselves as the hero: "That's me!"

### 7. Post‑Purchase & Loyalty
- **Customer Action**: Leaves review, shares photos/videos on social media
- **Emotional State**: Proud gift‑giver, delighted parent
- **Trust Signals**: Follow‑up thank you message, review request
- **Magical Moment**: Discovering option to upgrade to premium hardcover edition or buy another book for sibling

## 🔧 Amazon SP-API Setup

### Prerequisites

#### Amazon Developer Account
1. Create an Amazon Developer account at [developer.amazon.com](https://developer.amazon.com)
2. Complete the developer verification process
3. Accept the SP-API terms and conditions

#### Amazon Seller Account
1. Create an Amazon Seller account
2. Enroll in Amazon Custom program
3. Create your personalized book listing

### Step-by-Step Setup

#### Step 1: Create SP-API Application

1. **Navigate to SP-API Developer Console**
   - Go to [developer.amazon.com/sp-api](https://developer.amazon.com/sp-api)
   - Sign in with your developer account

2. **Create New Application**
   - Click "Create new application"
   - Application name: "Little Hero Books"
   - Description: "Personalized children's books with automated fulfillment"

3. **Configure Application**
   - Application Type: "Web application"
   - Redirect URL: `http://localhost:4000/auth/callback`
   - Note: This is for development; update for production

4. **Save Credentials**
   ```bash
   AMZ_APP_CLIENT_ID=your_client_id_here
   AMZ_APP_CLIENT_SECRET=your_client_secret_here
   ```

#### Step 2: Get Refresh Token

1. **Generate Authorization URL**
   ```bash
   # Replace with your actual client ID and redirect URL
   https://sellercentral.amazon.com/apps/authorize/consent?application_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:4000/auth/callback&version=beta
   ```

2. **Authorize Application**
   - Visit the URL in your browser
   - Sign in with your seller account
   - Grant permissions to the application
   - Copy the authorization code from the redirect URL

3. **Exchange for Refresh Token**
   ```bash
   curl -X POST https://api.amazon.com/auth/o2/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=YOUR_AUTHORIZATION_CODE&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
   ```

4. **Save Refresh Token**
   ```bash
   AMZ_REFRESH_TOKEN=your_refresh_token_here
   ```

#### Step 3: Configure Seller Information

```bash
# Your Amazon Seller ID (found in Seller Central)
AMZ_SELLER_ID=your_seller_id_here

# Marketplace (US for North America)
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
```

## 📋 Amazon Custom Listing Setup

### Create Product Listing

1. **Access Amazon Custom**
   - Go to [sellercentral.amazon.com/custom](https://sellercentral.amazon.com/custom)
   - Sign in with your seller account

2. **Create Product Listing**
   - Product name: "Personalized Children's Book - The Adventure Compass"
   - Category: Books > Children's Books
   - Price: $29.99 (or your preferred price)

### Configure Customization Fields

```
Child's Name (Required): Text input, max 20 characters
Child's Age (Required): Dropdown, 3-7 years
Hair Color (Required): Dropdown (Black, Brown, Blonde, Red, Other)
Skin Tone (Required): Dropdown (Light, Medium, Dark, Olive, Tan)
Favorite Animal (Optional): Text input
Favorite Food (Optional): Text input
Favorite Color (Optional): Dropdown
Hometown (Optional): Text input
Dedication Message (Optional): Text area, max 500 characters
```

### Product Images

- Cover image: 1000x1000px minimum
- Additional images showing personalization options
- Comply with Amazon image requirements

### Processing Time

- Processing time: 3-5 business days
- This allows time for book generation and printing

## 🔄 Order Processing Flow

### Backend Flow Overview (Event Timeline)

**T0**: Amazon order placed → customization captured → order enters **Unshipped**  
**T0+5m**: n8n Flow A polls SP‑API → fetches order & items → extracts customization JSON  
**T0+10m**: Renderer called with manuscript + assets → returns book.pdf & cover.pdf URLs  
**T0+15m**: n8n submits POD order (ship method = Economy by default)  
**T0+15m → D+X**: Flow B polls POD for status → when tracking appears, confirm shipment on SP‑API  
**D+X**: Customer receives Amazon shipping email + optional buyer‑seller message

### n8n Workflows (Detailed)

#### Flow A — Order Intake & Job Creation (Cron 5–10 min)

1. **Trigger**: Cron
2. **Get Orders** (SP‑API ListOrders, Unshipped/PartiallyShipped, since last poll)
3. **Get Order Items** (pull customization fields)
4. **Validate & Normalize** (schema: child, options, shipping)
5. **Generate Story**: Use template system for personalization
6. **Assets**: Select prefab backgrounds; map overlays (hair/skin/clothes/colors/animal)
7. **Renderer**: POST /render → returns `bookPdfUrl`, `coverPdfUrl`, `thumbUrl`
8. **POD Order**: POST POD /orders with PDFs + ship‑to; receive `podOrderId`
9. **Persist**: Upsert to DB/Sheet: `orderId, podOrderId, status=submitted, pdfs, inputs`
10. **Notify**: Slack/Email: "Created POD job for Amazon order …"
11. **Preview Messaging**: Trigger Next.js `/api/notifications/preview/amazon` once preview is approved → Amazon Message Center sends secure link (single send for MVP) → customer submits structured correction (1 allowed) via preview page contact form (see `docs/CUSTOMER_PREVIEW_APPROVAL_SYSTEM.md`)

---

## 📦 Friends & Family Soft Launch Checklist

Use this when the seller account is pending or newly active. These steps should be completed before inviting friends and family to order.

### 1. Listing Content & Assets
- [ ] Finalize listing title, bullets, description, and backend keywords (`docs/AMAZON_LISTING_FINAL.md`, `docs/amazon/amazon-custom-listing-spec.md`)
- [ ] Gather 7 product images (main cover + interior spreads/customization callouts)
- [ ] Draft/record a 15–30 second product video walkthrough
- [ ] Confirm all assets meet Amazon image/video requirements (1000x1000px min, white background main image)

### 2. Customization Field QA
- [ ] Review `Customization_Source_of_Truth.md` and build a quick reference sheet of:
  - Field labels, input types (text, dropdown), and allowed options
  - Help text/tooltips you’ll paste into Amazon’s customization UI
- [ ] Prepare validation checklist to verify Amazon Custom field mapping during listing creation

### 3. Manual Fulfillment SOP (Temporary)
- [ ] Write step-by-step SOP for processing early orders:
  1. Monitor Seller Central for new order email/notifications
  2. Run existing n8n workflow or manual script to generate PDFs
  3. Submit PDFs to Lulu (or chosen POD) manually
  4. Log progress in a shared sheet (order ID, customer name, status, tracking)
- [ ] Create a simple spreadsheet template (columns: Amazon Order ID, Child Name, Status, Proof Sent, Print Submitted, Tracking, Notes)

### 4. Messaging Templates
- [ ] Draft Amazon Message Center templates:
  - Initial proof ready notification (for friends & family phase)
  - Follow-up / reminder script (manual until automations return)
  - Out-of-policy response (when a request is outside preset options)
- [ ] Draft a friends & family onboarding email explaining:
  - How to order (step-by-step)
  - Expected timeline (proof, printing, shipping)
  - How to reach out if something looks off

### 5. Preview Page Forward Work (Optional)
- [ ] Sketch structured correction form (reason dropdown, preset values) for later implementation
- [ ] List the canonical option arrays (hair styles, colors, etc.) so UI implementation is quick when prioritized

Keep this checklist updated as we learn from the initial orders; migrate recurring tasks into SOP docs once the seller account is live.

#### Flow B — Tracking & Shipment Confirmation (Cron 30–60 min)

1. **Trigger**: Cron
2. **Fetch in‑flight jobs** (status ∈ submitted/in_production)
3. **Get POD Status** (check tracking)
4. **When tracking**: SP‑API ConfirmShipment (carrier, tracking, ship date)
5. **Update**: DB status → shipped; store tracking
6. **Notify**: Slack and optional buyer‑seller message

#### Flow C — Exceptions & Retries (On‑Error globally)

- Automatic retries w/ exponential backoff on HTTP nodes
- Dead‑letter to Notion/Sheet: orders needing manual review (bad fields, render fail)
- Alert channel: `#ops-personalized-books`

## 📊 Data Model (MVP)

**Order**: orderId, orderDate, marketplaceId, buyerMaskedEmail  
**CustomerInputs**: name, age, hair, skin, favColor, favAnimal, hometown, dedication, occasion  
**Files**: bookPdfUrl, coverPdfUrl, thumbUrl  
**POD**: podOrderId, status, shipMethod  
**Shipping**: name, address1, address2, city, state, zip, country, phone  
**Tracking**: carrier, trackingNumber, shipDate, deliveredDate?  
**Ops**: createdAt, updatedAt, errorState, notes

## 🧪 Testing the Integration

### Test Health Check
```bash
curl http://localhost:4000/health
```

### Test Order Fetching
```bash
curl http://localhost:4000/orders
```

### Place Test Order
- Create a test order through Amazon Custom
- Use your development environment
- Verify the order appears in your system

## 🔍 Troubleshooting

### Common Issues

**"Invalid client credentials"**
- Verify Client ID and Client Secret are correct
- Ensure application is approved for SP-API access

**"Refresh token expired"**
- Generate a new refresh token
- Update the token in your environment variables

**"Order not found"**
- Check that the order ID is correct
- Verify the order exists in your seller account
- Ensure the order is from the correct marketplace

**"Customization data missing"**
- Verify your Amazon Custom listing fields
- Check that customers filled out all required fields
- Review the customization parsing logic

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG_MODE=true
LOG_LEVEL=debug
```

## 📈 SLAs & Policies

- **Order to POD submit**: ≤ 30 minutes average
- **Proofing**: 1 manual test per template change
- **Reprints**: If POD defect or layout error → auto reprint at cost
- **Cutoffs**: Holiday deadline banner on Amazon listing

## 🔐 Security Considerations

1. **Environment Variables**
   - Never commit API keys to version control
   - Use secure secret management in production
   - Rotate credentials regularly

2. **API Security**
   - Use HTTPS in production
   - Implement rate limiting
   - Monitor for suspicious activity

3. **Data Privacy**
   - Handle customer data according to privacy laws
   - Implement data retention policies
   - Secure data transmission and storage

## 📞 Support

- **Amazon SP-API Documentation**: [developer-docs.amazon.com/sp-api](https://developer-docs.amazon.com/sp-api)
- **Amazon Seller Support**: [sellercentral.amazon.com/help](https://sellercentral.amazon.com/help)
- **Little Hero Books Support**: hello@littleherobooks.com

---

## 📚 **Quick Reference: All Amazon Resources**

### Pre-Launch Testing (Use Now - $0)
- 📁 `docs/amazon/mock-amazon-data-generator.js` - Test data generator for n8n workflows
- 📁 `docs/amazon/pre-launch-checklist.md` - Complete checklist of what to do before Amazon account

### When Ready to Launch (After Amazon Account Setup)
- 📁 `docs/amazon/amazon-custom-listing-spec.md` - Copy/paste product listing content
- 📁 `docs/amazon/sp-api-integration-code.md` - Drop-in code for Workflows 1 & 4

### Documentation
- 📁 `DEVELOPER_A_PACKAGE.md` - Complete guide for Workflows 2A, 2B, 3 (includes Amazon integration points)
- 📁 `DEVELOPER_B_PACKAGE.md` - Complete guide for Workflows 4, 5, 6, 7, 8 (includes Amazon shipment confirmation)
- 📁 `docs/AMAZON_INTEGRATION.md` - This document (complete Amazon integration guide)

### Database
- 📁 `docs/database/little-hero-books-schema.sql` - Complete database schema with all Amazon order fields
- 📁 `docs/database/migration-add-feedback-fields.sql` - Migration for human review feedback system

### Workflows (n8n)
- 📁 `docs/n8n-workflow-files/n8n-new/` - All production-ready workflows
- 📁 `docs/n8n-workflow-files/n8n-new/developer-b-test-workflows/` - Test versions with mock data

---

## ✅ **Current Project Status**

### Completed (Ready to Use)
- ✅ All 8 n8n workflows built and tested
- ✅ Supabase database configured with complete schema
- ✅ Human review workflow with feedback regeneration system
- ✅ Mock data generator for testing Amazon integration
- ✅ Complete Amazon listing specification ready
- ✅ SP-API integration code ready to deploy
- ✅ Error recovery, monitoring, QA, and cost optimization workflows

### Ready When You Are (Requires Amazon Account - $40/month)
- ⏳ Connect to Amazon SP-API for real orders
- ⏳ Create Amazon Custom listing
- ⏳ Test with real Amazon order
- ⏳ Go live and start selling!

### Pre-Launch Tasks (Do at Your Own Pace - ~$150-700 one-time)
- 📸 Create product images (7 images)
- 📦 Order sample books from Lulu
- 💼 Set up business entity and bank account
- 🌐 Create website/landing page
- 📱 Set up social media accounts

---

**Next Steps**: 
1. **NOW**: Test complete workflow with mock Amazon data (see above)
2. **SOON**: Prepare content and images (see `docs/amazon/pre-launch-checklist.md`)
3. **WHEN READY**: Set up Amazon account and go live!
