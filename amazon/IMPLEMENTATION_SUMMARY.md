# Amazon SP-API Middleware Implementation Summary

## ✅ Completed Implementation

### 1. Updated Middleware (`amazon/sp-api-middleware.js`)

**Key Changes:**
- ✅ Uses new LWA environment variable names with separate sandbox/production support
- ✅ Removed SigV4 signing (modern SP-API uses LWA tokens only)
- ✅ Added sandbox/production mode switching
- ✅ Implemented token caching with automatic refresh
- ✅ Added all required endpoints

**Environment Variables Required:**

```bash
# Sandbox Credentials
AMZ_LWA_CLIENT_ID_SANDBOX=your_sandbox_client_id
AMZ_LWA_CLIENT_SECRET_SANDBOX=your_sandbox_client_secret
AMZ_LWA_REFRESH_TOKEN_SANDBOX=your_sandbox_refresh_token

# Production Credentials
AMZ_LWA_CLIENT_ID_PROD=your_prod_client_id
AMZ_LWA_CLIENT_SECRET_PROD=your_prod_client_secret
AMZ_LWA_REFRESH_TOKEN_PROD=your_prod_refresh_token

# Configuration
AMAZON_ENV=sandbox|production  # or AMAZON_SANDBOX_MODE=true for sandbox
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER  # US marketplace (default)
AMZ_REGION=na  # North America (default)
BACKEND_API_URL=http://localhost:3000  # Your backend API URL
AMAZON_MIDDLEWARE_PORT=4000  # Port for middleware service (default: 4000)
```

### 2. Endpoints Implemented

#### Health & Testing
- `GET /health` - Service health check with config status
- `GET /test-sandbox` - Sandbox connectivity test with getOrders call

#### Order Endpoints
- `GET /orders` - Poll for orders (supports sandbox/prod via query param)
- `GET /orders/:orderId` - Get single order details
- `GET /orders/:orderId/items` - Get order items
- `GET /orders/:orderId/items/buyer-info` - Get order items buyer info (for customizations)
- `GET /orders/:orderId/buyer-info` - Get order buyer info (PII - may require RDT)
- `GET /orders/:orderId/address` - Get order shipping address (PII - may require RDT)
- `POST /orders/:orderId/process` - **End-to-end processing**: fetches all data, normalizes, and POSTs to backend

### 3. Backend Endpoint (`back-end/src/app/api/amazon/orders/route.ts`)

**Endpoint:** `POST /api/amazon/orders`

**Features:**
- ✅ Idempotent (uses `amazonOrderId` as unique key)
- ✅ Normalizes Amazon order data to internal schema
- ✅ Extracts customization data from items
- ✅ Calculates character hash (includes orderId for uniqueness)
- ✅ Stores in Supabase with `execution_status='pending_w0'`
- ✅ Returns 201 for new orders, 200 for updates (idempotent)

**Payload Format:**
```json
{
  "amazonOrderId": "123-4567890-1234567",
  "orderId": "123-4567890-1234567",
  "purchaseDate": "2024-01-15T10:30:00Z",
  "orderStatus": "Unshipped",
  "marketplaceId": "ATVPDKIKX0DER",
  "buyer": {
    "email": "customer@example.com",
    "name": "John Doe"
  },
  "shippingAddress": {
    "name": "John Doe",
    "address": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102",
    "country": "US",
    "phone": "555-123-4567"
  },
  "items": [
    {
      "orderItemId": "item-123",
      "asin": "B01234567",
      "sku": "LHB-8X10-SOFTCOVER",
      "title": "Little Hero Book - Custom",
      "quantity": 1,
      "price": { "CurrencyCode": "USD", "Amount": "24.99" },
      "customization": {
        "Child's Name": "Alex",
        "Child's Age": "5",
        "Skin Tone": "skin-medium",
        "Hair Color": "brown-light",
        ...
      }
    }
  ],
  "customization": { ... },
  "_raw": { ... }
}
```

## 🧪 Testing

### 1. Test Sandbox Connectivity

```bash
# Start middleware
cd amazon
npm start

# Test sandbox connectivity
curl http://localhost:4000/test-sandbox
```

### 2. Test Order Processing

```bash
# Process a specific order (sandbox)
curl -X POST "http://localhost:4000/orders/123-4567890-1234567/process?useSandbox=true"

# Process a specific order (production)
curl -X POST "http://localhost:4000/orders/123-4567890-1234567/process"
```

### 3. Health Check

```bash
curl http://localhost:4000/health
```

## 📋 Next Steps

1. **Set Environment Variables**
   - Add sandbox credentials to your `.env` file
   - Add production credentials to your production environment (Vercel, etc.)

2. **Test Sandbox First**
   - Run `GET /test-sandbox` to verify connectivity
   - Process a test order in sandbox mode

3. **Production Setup**
   - Switch `AMAZON_ENV=production` or remove `AMAZON_SANDBOX_MODE`
   - Test with a real production order

4. **Handle Restricted Data Token (RDT)**
   - If you get 403 errors on buyer/address endpoints, you may need:
     - Approved restricted roles in SP-API app
     - RDT generation for PII endpoints
     - See Amazon SP-API documentation for RDT setup

5. **Set Up Polling/Notifications**
   - Currently supports manual polling via `GET /orders`
   - For production, consider:
     - Scheduled polling (cron job calling `/orders/:orderId/process`)
     - Amazon Notifications API (webhooks) for real-time order updates

## 🔄 Integration Flow

```
Amazon SP-API Middleware
    ↓
POST /orders/:orderId/process
    ↓
1. Fetch order, items, buyer info, address
2. Normalize to internal format
3. POST to backend /api/amazon/orders
    ↓
Backend API
    ↓
1. Idempotent upsert to Supabase
2. execution_status='pending_w0'
3. Returns orderId and characterHash
    ↓
W0 Webhook (n8n)
    ↓
1. Process order
2. Update execution_status='ready_for_processing'
3. Set next_workflow='2A'
```

## ⚠️ Important Notes

1. **Customization Fields**: Sometimes come back empty even when visible in Seller Central. The middleware handles nulls gracefully and logs warnings.

2. **Idempotency**: The backend endpoint is idempotent - calling it multiple times with the same `amazonOrderId` will update the existing record rather than creating duplicates.

3. **Token Caching**: Access tokens are cached and automatically refreshed when expired. No manual token management needed.

4. **Error Handling**: All endpoints include comprehensive error handling and logging. Failed requests are logged with context.

5. **PII Data**: Buyer info and address endpoints may require Restricted Data Token (RDT) if your SP-API app doesn't have approved restricted roles. Handle 403 errors gracefully.

