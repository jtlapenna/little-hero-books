# Little Hero Books - n8n Handoff Guide

## 🎯 **Project Status: Ready for n8n Implementation**

**Last Updated**: January 2025  
**Handoff Status**: All core components complete and tested  
**Next Phase**: n8n workflow implementation and Amazon integration  

---

## 📋 **Quick Start for New Developer**

### **1. Project Overview**
Little Hero Books is a personalized children's book service that creates custom stories through Amazon Custom listings. Customers never visit our website - everything happens through Amazon Custom → n8n automation → Renderer → POD → Delivery.

### **2. Current Status**
- ✅ **All core services built and tested**
- ✅ **Renderer service**: PDF generation working perfectly
- ✅ **Template system**: Story personalization ready
- ✅ **POD integration**: Complete with Lulu Print API
- ✅ **Amazon middleware**: Ready for SP-API integration
- 🔧 **n8n workflows**: Ready for you to implement

### **3. Your Mission**
Implement n8n workflows to orchestrate the complete pipeline:
**Amazon Custom Order → n8n → Template System → Renderer → POD → Customer Delivery**

---

## 🏗️ **Architecture Overview**

```
Amazon Custom Listing → n8n Workflows → Template System → Renderer → POD → Customer
```

### **Customer Flow (No Website Required)**
1. **Customer discovers book** on Amazon (search, ads, seasonal gift guides)
2. **Customer customizes** directly on Amazon Custom listing
3. **Customer purchases** through Amazon checkout
4. **n8n workflows** automatically process the order
5. **Renderer + POD** generate and ship the book
6. **Customer receives** their personalized book

### **System Components**
- **Amazon Custom**: Collects personalization data from customers
- **n8n Automation**: Orchestrates the entire pipeline
- **Template System**: Generates personalized stories from base template
- **Renderer Service**: Assembles prefab components into print-ready PDFs
- **POD Provider**: Handles printing and shipping (Lulu Print API)

---

## ✅ **Completed Components (Ready for Integration)**

### **1. Template-Based Story System** ✅
- **Location**: `templates/story-template.js`
- **Status**: Complete and tested
- **Function**: `generatePersonalizedStory(childData, options)`
- **Output**: 14-page personalized story with placeholders replaced
- **Note**: Consistent quality, no API costs, instant generation

### **2. Renderer Service** ✅
- **Location**: `renderer/` directory
- **Status**: Complete and n8n-compatible
- **Endpoint**: `POST http://localhost:8787/render`
- **Input**: Order data with manuscript, assets, child info, options
- **Output**: `{orderId, bookPdfUrl, coverPdfUrl, thumbUrl, status, duration, timestamp}`
- **Test**: `curl http://localhost:8787/health`

### **3. Amazon SP-API Middleware** ✅
- **Location**: `amazon/` directory
- **Status**: Complete and ready
- **Endpoints**: 
  - `GET /health` - Health check
  - `GET /orders` - Fetch Amazon orders
  - `POST /orders/process` - Process specific order
- **Test**: `curl http://localhost:4000/health`

### **4. POD Service** ✅
- **Location**: `pod/pod-service.js`
- **Status**: Complete and ready
- **Function**: `createOrder(orderData)` - Submit to Lulu Print API
- **Features**: Order creation, status tracking, cancellation
- **Test**: `cd pod && npm test`

### **5. Asset Management System** ✅
- **Location**: `assets/asset-manager.js`
- **Status**: Complete
- **Function**: `generateBookAssets(personalization)` - Generates complete asset configuration
- **Features**: Prefab backgrounds, character overlays, magical elements
- **Important**: Zero AI art generation - purely assembly of pre-made components

---

## 🔧 **n8n Workflow Implementation Requirements**

### **Flow A: Order Intake & Job Creation (Primary)**

#### **Trigger**: Cron (5-10 minute intervals)
#### **Purpose**: Process new Amazon Custom orders

#### **Steps**:

1. **Get Amazon Orders**
   - **Node**: HTTP Request
   - **URL**: `http://localhost:4000/orders`
   - **Method**: GET
   - **Expected Response**: Array of unshipped orders

2. **Process Each Order**
   - **Node**: Split In Batches
   - **Batch Size**: 1
   - **Purpose**: Process orders individually

3. **Get Order Items**
   - **Node**: HTTP Request
   - **URL**: `http://localhost:4000/orders/{{$json.orderId}}/items`
   - **Method**: GET
   - **Purpose**: Get customization data

4. **Validate & Normalize Order Data**
   - **Node**: Code
   - **Script**: Use `validateOrder()` from `data/order-model.js`
   - **Purpose**: Ensure data integrity

5. **Generate Personalized Story**
   - **Node**: Code
   - **Script**: Use `generatePersonalizedStory()` from `templates/story-template.js`
   - **Purpose**: Create personalized story from template

6. **Generate Asset Configuration**
   - **Node**: Code
   - **Script**: Use `generateBookAssets()` from `assets/asset-manager.js`
   - **Purpose**: Create asset configuration for each page

7. **Call Renderer Service**
   - **Node**: HTTP Request
   - **URL**: `http://localhost:8787/render`
   - **Method**: POST
   - **Body**: Complete order data with manuscript
   - **Expected Response**: `{orderId, bookPdfUrl, coverPdfUrl, thumbUrl, status}`

8. **Submit to POD Provider**
   - **Node**: HTTP Request
   - **URL**: POD provider API endpoint
   - **Method**: POST
   - **Body**: PDF URLs + shipping info
   - **Expected Response**: `{podOrderId, status}`

9. **Persist Order Data**
   - **Node**: Database or Google Sheets
   - **Purpose**: Store order tracking information
   - **Data**: Order ID, POD ID, status, timestamps

10. **Send Notification**
    - **Node**: Slack/Email
    - **Purpose**: Notify team of successful order processing

### **Flow B: Tracking & Shipment Confirmation**

#### **Trigger**: Cron (30-60 minute intervals)
#### **Purpose**: Track POD orders and confirm shipments

#### **Steps**:

1. **Fetch In-Flight Jobs**
   - **Node**: Database Query
   - **Query**: Orders with status 'submitted' or 'in_production'

2. **Check POD Status**
   - **Node**: HTTP Request
   - **URL**: POD provider status endpoint
   - **Purpose**: Get tracking information

3. **When Tracking Available**
   - **Node**: IF condition
   - **Condition**: `{{$json.trackingNumber}}` exists

4. **Confirm Shipment with Amazon**
   - **Node**: HTTP Request
   - **URL**: `http://localhost:4000/orders/{{$json.orderId}}/confirm-shipment`
   - **Method**: POST
   - **Body**: Tracking information

5. **Update Order Status**
   - **Node**: Database Update
   - **Purpose**: Mark order as shipped

6. **Send Notification**
   - **Node**: Slack/Email
   - **Purpose**: Notify team of shipment confirmation

### **Flow C: Exception Handling**

#### **Trigger**: On Error (Global)
#### **Purpose**: Handle failures and retries

#### **Steps**:

1. **Log Error**
   - **Node**: Code
   - **Purpose**: Log error details

2. **Retry Logic**
   - **Node**: Wait
   - **Duration**: Exponential backoff

3. **Dead Letter Queue**
   - **Node**: Database/Notion
   - **Purpose**: Store failed orders for manual review

4. **Alert Team**
   - **Node**: Slack
   - **Purpose**: Notify operations team

---

## 📊 **Required Environment Variables**

### **Amazon SP-API**
```bash
AMAZON_ACCESS_KEY=your_access_key
AMAZON_SECRET_KEY=your_secret_key
AMAZON_REFRESH_TOKEN=your_refresh_token
AMAZON_CLIENT_ID=your_client_id
AMAZON_CLIENT_SECRET=your_client_secret
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
```

### **POD Provider**
```bash
POD_PROVIDER=lulu
POD_API_KEY=your_pod_api_key
POD_CONTACT_EMAIL=ops@littleherobooks.com
LULU_API_URL=https://api.lulu.com/v1
```

### **Storage**
```bash
STORAGE_PROVIDER=cloudflare_r2
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=little-hero-books-pdfs
R2_PUBLIC_URL=https://pub-your-id.r2.dev
```

### **Notifications**
```bash
SLACK_WEBHOOK_URL=your_slack_webhook
EMAIL_SERVICE_API_KEY=your_email_api_key
```

---

## 🧪 **Testing Checklist**

### **Before n8n Implementation**:
- [ ] Renderer service running and responding
- [ ] Amazon middleware running and responding
- [ ] Template system generating stories correctly
- [ ] POD service connection working
- [ ] All environment variables configured

### **After n8n Implementation**:
- [ ] Flow A processes test order successfully
- [ ] Flow B tracks and confirms shipment
- [ ] Flow C handles errors gracefully
- [ ] Notifications sent correctly
- [ ] Order data persisted correctly
- [ ] End-to-end test with real Amazon order

---

## 📁 **File Structure for n8n**

```
little-hero-books/
├── n8n/
│   ├── workflows/
│   │   ├── flow-a-order-intake.json
│   │   ├── flow-b-tracking.json
│   │   └── flow-c-exceptions.json
│   ├── credentials/
│   │   ├── amazon-sp-api.json
│   │   ├── pod-provider.json
│   │   └── storage.json
│   └── custom-nodes/
│       ├── story-generator.js
│       ├── asset-generator.js
│       └── order-validator.js
├── templates/
│   ├── story-template.js
│   └── image-templates.js
├── assets/
│   └── asset-manager.js
├── data/
│   └── order-model.js
├── renderer/
│   └── (complete service)
├── amazon/
│   └── (complete middleware)
└── pod/
    └── (complete service)
```

---

## 🚀 **Implementation Steps**

### **Step 1: Set Up n8n Environment**
1. Install n8n (cloud or self-hosted)
2. Configure credentials for all services
3. Set up webhook endpoints
4. Configure environment variables

### **Step 2: Import Workflow Templates**
1. Create Flow A (Order Intake)
2. Create Flow B (Tracking)
3. Create Flow C (Exceptions)
4. Configure triggers and schedules

### **Step 3: Test Individual Components**
1. Test Amazon SP-API connection
2. Test renderer service
3. Test POD provider connection
4. Test notification systems

### **Step 4: End-to-End Testing**
1. Create test Amazon order
2. Run Flow A manually
3. Verify PDF generation
4. Verify POD submission
5. Test tracking and confirmation

### **Step 5: Go Live**
1. Enable cron triggers
2. Monitor workflow execution
3. Set up alerts and monitoring
4. Document any issues

---

## 📞 **Support & Resources**

### **Key Files for Reference**:
- `templates/story-template.js` - Story generation
- `assets/asset-manager.js` - Asset management
- `data/order-model.js` - Data validation
- `renderer/src/index.ts` - PDF generation
- `amazon/sp-api-middleware.js` - Amazon integration
- `pod/pod-service.js` - POD integration

### **Testing Commands**:
```bash
# Test renderer
curl http://localhost:8787/health

# Test Amazon middleware
curl http://localhost:4000/health

# Test POD service
cd pod && npm test

# Test complete pipeline
node test-renderer-pod-pipeline.js
```

### **Development Commands**:
```bash
# Start all services
npm run dev:all

# Start individual services
npm run dev           # Renderer (port 8787)
npm run dev:amazon    # Amazon middleware (port 4000)
npm run dev:templates # Template system
npm run dev:pod       # POD service
```

### **Monitoring**:
- n8n execution logs
- Service health endpoints
- Error notifications
- Order tracking database

---

## 🎯 **Success Criteria**

### **Flow A Success**:
- Orders processed within 30 minutes
- PDFs generated successfully
- POD orders submitted correctly
- Notifications sent

### **Flow B Success**:
- Tracking information retrieved
- Amazon shipments confirmed
- Status updates sent
- Customer notifications triggered

### **Flow C Success**:
- Errors caught and logged
- Retries attempted
- Failed orders queued for review
- Team alerted

---

## 💡 **Important Notes**

### **Customer Experience Flow**:
- **No customer website** in MVP - everything through Amazon Custom
- **Customer discovers** book on Amazon
- **Customer customizes** on Amazon Custom listing
- **Customer purchases** through Amazon checkout
- **n8n handles** everything automatically
- **Customer receives** personalized book

### **Prefab-Only System**:
- **Zero AI art generation** at runtime
- **Pure assembly** of pre-made components
- **Backgrounds**: Fixed prefab scenes
- **Character overlays**: Modular PNG layers
- **Animals/Accents**: Pre-made "stickers"
- **Story text**: Template-generated text

### **Cost Considerations**:
- **No Amazon fees** until system is proven
- **Build everything first**, then add Amazon when ready
- **POD costs**: Only when books are actually printed
- **n8n costs**: Free tier available

---

## 🚀 **Ready for Implementation!**

**All core components are built, tested, and ready for n8n integration. The system is designed to handle the complete Amazon Custom → POD delivery pipeline without requiring a customer website.**

**Your mission**: Implement the n8n workflows to orchestrate this complete automation pipeline.

**Questions?** Reference the comprehensive documentation in the `/docs` folder or contact the team.

**Good luck with the implementation!** 🎉📚✨
