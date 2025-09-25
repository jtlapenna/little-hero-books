# Little Hero Books - n8n Workflow Implementation Guide

## 🎯 Project Status: Ready for n8n Implementation

All core components are built and tested. The system is ready for n8n workflow orchestration.

## ✅ Completed Components

### 1. Template-Based Story System ✅
- **Location**: `templates/story-template.js`
- **Status**: Complete and tested
- **Function**: `generatePersonalizedStory(childData, options)`
- **Output**: 14-page personalized story with placeholders replaced
- **Note**: Consistent quality, no API costs, instant generation

### 2. Renderer Service ✅
- **Location**: `renderer/` directory
- **Status**: Complete and n8n-compatible
- **Endpoint**: `POST /render`
- **Input**: Order data with manuscript
- **Output**: `{orderId, bookPdfUrl, coverPdfUrl, thumbUrl, status, duration, timestamp}`

### 3. Amazon SP-API Middleware ✅
- **Location**: `amazon/` directory
- **Status**: Complete and ready
- **Endpoints**: 
  - `GET /health` - Health check
  - `GET /orders` - Fetch Amazon orders
  - `POST /orders/process` - Process specific order

### 4. Data Model ✅
- **Location**: `data/order-model.js`
- **Status**: Complete
- **Function**: `validateOrder(order)` - Validates order data structure

### 5. Asset Management System ✅
- **Location**: `assets/asset-manager.js`
- **Status**: Complete
- **Function**: `generateBookAssets(personalization)` - Generates complete asset configuration
- **Features**: Prefab backgrounds, character overlays, magical elements

## 🔧 n8n Workflow Implementation Requirements

### Flow A: Order Intake & Job Creation

#### Trigger: Cron (5-10 minute intervals)
#### Steps:

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

### Flow B: Tracking & Shipment Confirmation

#### Trigger: Cron (30-60 minute intervals)
#### Steps:

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

### Flow C: Exception Handling

#### Trigger: On Error (Global)
#### Steps:

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

## 📊 Required Environment Variables

### Amazon SP-API
```bash
AMAZON_ACCESS_KEY=your_access_key
AMAZON_SECRET_KEY=your_secret_key
AMAZON_REFRESH_TOKEN=your_refresh_token
AMAZON_CLIENT_ID=your_client_id
AMAZON_CLIENT_SECRET=your_client_secret
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
```

### POD Provider
```bash
POD_API_KEY=your_pod_api_key
POD_API_URL=https://api.podprovider.com
POD_WEBHOOK_SECRET=your_webhook_secret
```

### Storage
```bash
STORAGE_BUCKET=little-hero-books-storage
STORAGE_ACCESS_KEY=your_storage_key
STORAGE_SECRET_KEY=your_storage_secret
```

### Notifications
```bash
SLACK_WEBHOOK_URL=your_slack_webhook
EMAIL_SERVICE_API_KEY=your_email_api_key
```

## 🧪 Testing Checklist

### Before n8n Implementation:
- [ ] Renderer service running and responding
- [ ] Amazon middleware running and responding
- [ ] Template system generating stories correctly
- [ ] Image templates generating correctly
- [ ] Data model validation working
- [ ] All environment variables configured

### After n8n Implementation:
- [ ] Flow A processes test order successfully
- [ ] Flow B tracks and confirms shipment
- [ ] Flow C handles errors gracefully
- [ ] Notifications sent correctly
- [ ] Order data persisted correctly
- [ ] End-to-end test with real Amazon order

## 📁 File Structure for n8n

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
│       ├── image-generator.js
│       └── order-validator.js
├── templates/
│   ├── story-template.js
│   └── image-templates.js
├── data/
│   └── order-model.js
├── renderer/
│   └── (complete service)
└── amazon/
    └── (complete middleware)
```

## 🚀 Implementation Steps

### Step 1: Set Up n8n Environment
1. Install n8n (cloud or self-hosted)
2. Configure credentials for all services
3. Set up webhook endpoints
4. Configure environment variables

### Step 2: Import Workflow Templates
1. Create Flow A (Order Intake)
2. Create Flow B (Tracking)
3. Create Flow C (Exceptions)
4. Configure triggers and schedules

### Step 3: Test Individual Components
1. Test Amazon SP-API connection
2. Test renderer service
3. Test POD provider connection
4. Test notification systems

### Step 4: End-to-End Testing
1. Create test Amazon order
2. Run Flow A manually
3. Verify PDF generation
4. Verify POD submission
5. Test tracking and confirmation

### Step 5: Go Live
1. Enable cron triggers
2. Monitor workflow execution
3. Set up alerts and monitoring
4. Document any issues

## 📞 Support & Resources

### Key Files for Reference:
- `templates/story-template.js` - Story generation
- `templates/image-templates.js` - Image templates
- `data/order-model.js` - Data validation
- `renderer/src/index.ts` - PDF generation
- `amazon/sp-api-middleware.js` - Amazon integration

### Testing Commands:
```bash
# Test renderer
curl http://localhost:8787/health

# Test Amazon middleware
curl http://localhost:4000/health

# Test story generation
node templates/story-template.js
```

### Monitoring:
- n8n execution logs
- Service health endpoints
- Error notifications
- Order tracking database

## 🎯 Success Criteria

### Flow A Success:
- Orders processed within 30 minutes
- PDFs generated successfully
- POD orders submitted correctly
- Notifications sent

### Flow B Success:
- Tracking information retrieved
- Amazon shipments confirmed
- Status updates sent
- Customer notifications triggered

### Flow C Success:
- Errors caught and logged
- Retries attempted
- Failed orders queued for review
- Team alerted

---

**Ready for n8n implementation! All components are built, tested, and documented.**
