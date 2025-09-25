# Little Hero Books - Amazon Integration & Customer Experience

## 🎯 Current Status

**Amazon Integration**: ✅ **COMPLETE & READY**  
**Middleware**: Built and tested, ready for use  
**Next Step**: Set up Amazon Professional Seller account when ready to pay $40/month

## 💰 Cost Considerations

- **Amazon Professional Seller Account**: $40/month
- **Amazon Custom Program**: Additional fees per order
- **SP-API Usage**: ~$0.01 per order

**Recommendation**: Build and test complete system first, then add Amazon when ready to commit to monthly fees.

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

**Next Steps**: Once Amazon integration is working, proceed to n8n workflow setup for complete automation.
