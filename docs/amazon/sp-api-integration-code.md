# Amazon SP-API Integration Code
## Ready-to-Use Code for Workflow 1

### 🔑 Credentials Setup (n8n)

When you have your Amazon credentials, add them to n8n:

**Credential Name**: `Amazon SP-API`

**Fields**:
```
Client ID: amzn1.application-oa2-client.xxxxx
Client Secret: xxxxx
Refresh Token: Atzr|xxxxx
Seller ID: A1234567890ABC
Marketplace ID: ATVPDKIKX0DER
Region: na (North America)
```

---

## 📥 Workflow 1: Fetch Amazon Orders

### Replace "Generate Mock Orders" Node

**Current Node** (Mock):
```javascript
// TESTING - Generate mock orders
const mockOrders = [
  {
    amazon_order_id: 'TEST-ORDER-001',
    customer_name: 'Jane Smith',
    // ... mock data
  }
];
return mockOrders.map(order => ({ json: order }));
```

**Production Node** (Real Amazon):

#### Step 1: Get Access Token

**Node Name**: `Get Amazon Access Token`  
**Node Type**: `Code`

```javascript
// Exchange refresh token for access token
const refreshToken = '{{$credentials.amazonSpApi.refreshToken}}';
const clientId = '{{$credentials.amazonSpApi.clientId}}';
const clientSecret = '{{$credentials.amazonSpApi.clientSecret}}';

const tokenResponse = await this.helpers.request({
  method: 'POST',
  url: 'https://api.amazon.com/auth/o2/token',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  form: {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  },
  json: true
});

console.log('✅ Got Amazon access token');

return [{
  json: {
    access_token: tokenResponse.access_token,
    expires_in: tokenResponse.expires_in
  }
}];
```

---

#### Step 2: Fetch Orders

**Node Name**: `Fetch Amazon Orders`  
**Node Type**: `Code`

```javascript
// Fetch unshipped orders from Amazon
const accessToken = $input.first().json.access_token;
const sellerId = '{{$credentials.amazonSpApi.sellerId}}';
const marketplaceId = '{{$credentials.amazonSpApi.marketplaceId}}';
const region = '{{$credentials.amazonSpApi.region}}'; // 'na' for North America

// Calculate time window (last 24 hours to avoid missing orders)
const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

// SP-API endpoint (adjust region)
const spApiEndpoint = region === 'na' 
  ? 'https://sellingpartnerapi-na.amazon.com'
  : `https://sellingpartnerapi-${region}.amazon.com`;

// Fetch orders
const ordersResponse = await this.helpers.request({
  method: 'GET',
  url: `${spApiEndpoint}/orders/v0/orders`,
  headers: {
    'x-amz-access-token': accessToken,
    'Content-Type': 'application/json'
  },
  qs: {
    MarketplaceIds: marketplaceId,
    CreatedAfter: yesterday.toISOString(),
    OrderStatuses: 'Unshipped',
    MaxResultsPerPage: 50
  },
  json: true
});

const orders = ordersResponse.payload?.Orders || [];

console.log(`📦 Found ${orders.length} unshipped orders`);

if (orders.length === 0) {
  console.log('⚠️ No new orders to process');
  return [];
}

// Return orders for processing
return orders.map(order => ({ json: order }));
```

---

#### Step 3: Fetch Order Items (Get Customization)

**Node Name**: `Fetch Order Items`  
**Node Type**: `Code`

```javascript
// Fetch order items to get customization data
const accessToken = $('Get Amazon Access Token').first().json.access_token;
const order = $input.first().json;
const orderId = order.AmazonOrderId;
const region = '{{$credentials.amazonSpApi.region}}';

const spApiEndpoint = region === 'na' 
  ? 'https://sellingpartnerapi-na.amazon.com'
  : `https://sellingpartnerapi-${region}.amazon.com`;

// Fetch order items
const itemsResponse = await this.helpers.request({
  method: 'GET',
  url: `${spApiEndpoint}/orders/v0/orders/${orderId}/orderItems`,
  headers: {
    'x-amz-access-token': accessToken,
    'Content-Type': 'application/json'
  },
  json: true
});

const orderItems = itemsResponse.payload?.OrderItems || [];

console.log(`📋 Order ${orderId}: ${orderItems.length} items`);

// Extract customization from first item
// Amazon Custom data is in CustomizedInfo or BuyerCustomizedInfo
const firstItem = orderItems[0];
const customization = firstItem?.BuyerCustomizedInfo?.CustomizedInfo || {};

return [{
  json: {
    order: order,
    items: orderItems,
    customization: customization
  }
}];
```

---

#### Step 4: Parse Customization Data

**Node Name**: `Parse Customization`  
**Node Type**: `Code`

```javascript
// Parse Amazon customization into our data structure
const data = $input.first().json;
const order = data.order;
const customization = data.customization;

// Amazon Custom fields come as key-value pairs
// Map them to our character_specs structure
const characterSpecs = {
  childName: customization['Child\'s Name'] || 'Hero',
  age: customization['Child\'s Age'] || '5',
  pronouns: customization['Pronouns'] || 'they/them',
  skinTone: customization['Skin Tone']?.toLowerCase() || 'medium',
  hairColor: customization['Hair Color']?.toLowerCase() || 'brown',
  hairStyle: customization['Hair Style']?.toLowerCase() || 'short/straight',
  favoriteColor: customization['Favorite Color']?.toLowerCase() || 'blue',
  animalGuide: customization['Animal Guide']?.toLowerCase() || 'dog',
  clothingStyle: customization['Clothing Style']?.toLowerCase() || 't-shirt and shorts',
  dedication: customization['Dedication Message'] || ''
};

// Extract shipping address
const shippingAddress = order.ShippingAddress || {};

// Create standardized order object
const standardizedOrder = {
  amazon_order_id: order.AmazonOrderId,
  processing_id: `order_${order.AmazonOrderId}_${Date.now()}`,
  status: 'queued_for_processing',
  workflow_step: 'order_intake',
  next_workflow: '2.A.-bria-submit',
  
  // Order info
  order_status: order.OrderStatus,
  purchase_date: order.PurchaseDate,
  order_total: parseFloat(order.OrderTotal?.Amount || 0),
  currency: order.OrderTotal?.CurrencyCode || 'USD',
  marketplace_id: order.MarketplaceId,
  
  // Customer info
  customer_email: order.BuyerInfo?.BuyerEmail || null,
  customer_name: shippingAddress.Name || 'Unknown',
  shipping_address: {
    Name: shippingAddress.Name,
    AddressLine1: shippingAddress.AddressLine1,
    AddressLine2: shippingAddress.AddressLine2,
    City: shippingAddress.City,
    StateOrRegion: shippingAddress.StateOrRegion,
    PostalCode: shippingAddress.PostalCode,
    CountryCode: shippingAddress.CountryCode,
    Phone: shippingAddress.Phone
  },
  
  // Character specs
  character_specs: characterSpecs,
  
  // Generate character hash for caching
  character_hash: require('crypto')
    .createHash('md5')
    .update(JSON.stringify(characterSpecs))
    .digest('hex')
    .substring(0, 8),
  
  // Product info
  product_info: {
    asin: data.items[0]?.ASIN || 'B0LITTLEHERO001',
    sku: data.items[0]?.SellerSKU || 'LITTLE_HERO_BOOK_CUSTOM',
    title: data.items[0]?.Title || 'Little Hero Book',
    quantity: parseInt(data.items[0]?.QuantityOrdered || 1)
  },
  
  // Metadata
  priority: 'normal',
  estimated_processing_time: '30-45 minutes',
  created_at: new Date().toISOString(),
  validated_at: new Date().toISOString(),
  validation_errors: []
};

console.log(`✅ Parsed order ${order.AmazonOrderId} for ${characterSpecs.childName}`);

return [{ json: standardizedOrder }];
```

---

## 📤 Workflow 4: Confirm Shipment to Amazon

### Add After Lulu Shipment

**Node Name**: `Confirm Shipment to Amazon`  
**Node Type**: `Code`

```javascript
// Confirm shipment back to Amazon once tracking is available
const orderData = $input.first().json;
const accessToken = $('Get Amazon Access Token').first().json.access_token;
const region = '{{$credentials.amazonSpApi.region}}';

const spApiEndpoint = region === 'na' 
  ? 'https://sellingpartnerapi-na.amazon.com'
  : `https://sellingpartnerapi-${region}.amazon.com`;

// Prepare shipment confirmation
const shipmentData = {
  marketplaceId: orderData.marketplace_id,
  shipment: {
    shipmentDate: new Date().toISOString(),
    carrierCode: orderData.fulfillment_carrier || 'USPS',
    trackingNumber: orderData.fulfillment_tracking_id
  }
};

try {
  // Confirm shipment with Amazon
  await this.helpers.request({
    method: 'POST',
    url: `${spApiEndpoint}/orders/v0/orders/${orderData.amazon_order_id}/shipmentConfirmation`,
    headers: {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json'
    },
    body: shipmentData,
    json: true
  });
  
  console.log(`✅ Confirmed shipment to Amazon for ${orderData.amazon_order_id}`);
  console.log(`   Tracking: ${orderData.fulfillment_tracking_id}`);
  
  return [{
    json: {
      ...orderData,
      amazon_shipment_confirmed: true,
      amazon_shipment_confirmed_at: new Date().toISOString()
    }
  }];
  
} catch (error) {
  console.error(`❌ Failed to confirm shipment: ${error.message}`);
  
  // Log error but don't fail the workflow
  return [{
    json: {
      ...orderData,
      amazon_shipment_confirmed: false,
      amazon_shipment_error: error.message
    }
  }];
}
```

---

## 🧪 Testing Strategy

### Phase 1: Credential Testing (Before paying $40)
1. **Get test credentials** from Amazon Sandbox (free)
2. **Test authentication** flow
3. **Verify** data parsing logic with sample data

### Phase 2: Live Testing (After account setup)
1. **Place test order** through your own listing
2. **Verify** order appears in workflow
3. **Test** complete flow end-to-end
4. **Confirm** shipment works

### Phase 3: Production Launch
1. **Monitor** first 10 orders closely
2. **Verify** all notifications work
3. **Check** customer satisfaction
4. **Optimize** based on feedback

---

## 🔍 Error Handling

### Common Errors to Handle

```javascript
// Token expired
if (error.code === 'InvalidToken') {
  console.log('🔄 Token expired, getting new token...');
  // Retry logic here
}

// Rate limiting
if (error.code === 'RequestThrottled') {
  console.log('⏳ Rate limited, waiting 60 seconds...');
  await new Promise(resolve => setTimeout(resolve, 60000));
  // Retry logic here
}

// Order not found
if (error.code === 'InvalidInput') {
  console.log('⚠️ Order not found or invalid');
  // Skip this order
}
```

---

## 📋 Environment Variables

Add to n8n or .env file:

```bash
# Amazon SP-API
AMAZON_CLIENT_ID=amzn1.application-oa2-client.xxxxx
AMAZON_CLIENT_SECRET=xxxxx
AMAZON_REFRESH_TOKEN=Atzr|xxxxx
AMAZON_SELLER_ID=A1234567890ABC
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
AMAZON_REGION=na

# For testing
AMAZON_SANDBOX_MODE=false
```

---

## 🚀 Ready to Deploy Checklist

- [ ] Amazon Professional Seller account created
- [ ] Amazon Custom listing created with all fields
- [ ] SP-API credentials obtained
- [ ] Credentials added to n8n
- [ ] Workflow 1 updated with real API calls
- [ ] Workflow 4 updated with shipment confirmation
- [ ] Test order placed and processed successfully
- [ ] Monitoring and alerts configured
- [ ] Customer notification emails tested

---

**STATUS**: ✅ Code ready to drop into workflows when Amazon credentials are available

