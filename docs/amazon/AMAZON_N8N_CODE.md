# Amazon n8n Workflow Code
## Ready-to-Copy Code for Workflow 0 Integration

All code snippets for connecting Workflow 0 to Amazon SP-API.

---

## 🔄 **Workflow Structure**

```
Manual Trigger
    ↓
Get Amazon Access Token (Code Node)
    ↓
Fetch Amazon Orders (Code Node)
    ↓
Fetch Order Items (Code Node) [Split by order]
    ↓
Parse Amazon Customization (Code Node)
    ↓
Normalize Payload (Existing Node)
```

---

## 📝 **Node 1: Get Amazon Access Token**

**Node Type**: Code  
**Node Name**: `Get Amazon Access Token`  
**Position**: After Manual Trigger

### **Code**:

```javascript
// Exchange refresh token for access token
const refreshToken = process.env.AMZ_REFRESH_TOKEN || '{{$env.AMZ_REFRESH_TOKEN}}';
const clientId = process.env.AMZ_APP_CLIENT_ID || '{{$env.AMZ_APP_CLIENT_ID}}';
const clientSecret = process.env.AMZ_APP_CLIENT_SECRET || '{{$env.AMZ_APP_CLIENT_SECRET}}';

if (!refreshToken || refreshToken === '{{$env.AMZ_REFRESH_TOKEN}}') {
  throw new Error('AMZ_REFRESH_TOKEN not set. Check your environment variables.');
}

const tokenResponse = await this.helpers.request({
  method: 'POST',
  url: 'https://api.amazon.com/auth/o2/token',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  }).toString(),
  json: true
});

if (!tokenResponse.access_token) {
  throw new Error('Failed to get Amazon access token: ' + JSON.stringify(tokenResponse));
}

console.log('✅ Got Amazon access token (expires in ' + tokenResponse.expires_in + 's)');

return [{
  json: {
    access_token: tokenResponse.access_token,
    expires_in: tokenResponse.expires_in,
    token_type: tokenResponse.token_type || 'bearer'
  }
}];
```

---

## 📦 **Node 2: Fetch Amazon Orders**

**Node Type**: Code  
**Node Name**: `Fetch Amazon Orders`  
**Position**: After Get Access Token

### **Code**:

```javascript
// Fetch unshipped orders from Amazon SP-API
const accessToken = $('Get Amazon Access Token').first().json.access_token;
const sellerId = process.env.AMZ_SELLER_ID || '{{$env.AMZ_SELLER_ID}}';
const marketplaceId = process.env.AMZ_MARKETPLACE_ID || '{{$env.AMZ_MARKETPLACE_ID}}' || 'ATVPDKIKX0DER';
const region = process.env.AMZ_REGION || '{{$env.AMZ_REGION}}' || 'na';

if (!accessToken) {
  throw new Error('Access token not found. Make sure "Get Amazon Access Token" node ran successfully.');
}

// Calculate time window (last 24 hours to avoid missing orders)
const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

// SP-API endpoint (automatically detects sandbox mode)
const isSandbox = process.env.AMAZON_SANDBOX_MODE === 'true' || '{{$env.AMAZON_SANDBOX_MODE}}' === 'true';
const baseUrl = isSandbox 
  ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
  : (region === 'na' 
      ? 'https://sellingpartnerapi-na.amazon.com'
      : `https://sellingpartnerapi-${region}.amazon.com`);
const spApiEndpoint = baseUrl;

try {
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

  // Return orders for processing (pass token for downstream nodes)
  return orders.map(order => ({ 
    json: {
      ...order,
      access_token: accessToken,
      sellerId,
      marketplaceId,
      region
    }
  }));
  
} catch (error) {
  console.error('❌ Error fetching Amazon orders:', error.message);
  
  // Handle common errors
  if (error.response?.status === 401) {
    throw new Error('Amazon authentication failed. Check your credentials.');
  }
  if (error.response?.status === 429) {
    throw new Error('Amazon rate limit exceeded. Wait 60 seconds and retry.');
  }
  if (error.response?.status === 403) {
    throw new Error('Amazon access forbidden. Check your SP-API permissions.');
  }
  
  throw error;
}
```

---

## 📋 **Node 3: Fetch Order Items**

**Node Type**: Code  
**Node Name**: `Fetch Order Items`  
**Position**: After Fetch Orders (split by order)

### **Code**:

```javascript
// Fetch order items to get customization data
const order = $input.first().json;
const orderId = order.AmazonOrderId;

if (!orderId) {
  throw new Error('Order ID not found in input');
}

const accessToken = order.access_token || $('Get Amazon Access Token').first().json.access_token;
const region = order.region || process.env.AMZ_REGION || '{{$env.AMZ_REGION}}' || 'na';

// SP-API endpoint (automatically detects sandbox mode)
const isSandbox = process.env.AMAZON_SANDBOX_MODE === 'true' || '{{$env.AMAZON_SANDBOX_MODE}}' === 'true';
const baseUrl = isSandbox 
  ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
  : (region === 'na' 
      ? 'https://sellingpartnerapi-na.amazon.com'
      : `https://sellingpartnerapi-${region}.amazon.com`);
const spApiEndpoint = baseUrl;

try {
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
  // Amazon Custom data can be in multiple locations
  const firstItem = orderItems[0];
  
  // Try multiple locations for customization data
  const customization = 
    firstItem?.BuyerCustomizedInfo?.CustomizedInfo || 
    firstItem?.CustomizedInfo ||
    firstItem?.BuyerInfo?.BuyerCustomizedInfo ||
    firstItem?.CustomizationInfo ||
    {};

  // Log what we found for debugging
  if (Object.keys(customization).length === 0) {
    console.warn(`⚠️ No customization data found for order ${orderId}`);
    console.log('First item structure:', JSON.stringify(firstItem, null, 2));
  } else {
    console.log(`✅ Found customization fields: ${Object.keys(customization).join(', ')}`);
  }

  return [{
    json: {
      order: order,
      items: orderItems,
      customization: customization,
      access_token: accessToken,
      sellerId: order.sellerId,
      marketplaceId: order.marketplaceId,
      region: order.region
    }
  }];
  
} catch (error) {
  console.error(`❌ Error fetching items for order ${orderId}:`, error.message);
  
  if (error.response?.status === 404) {
    throw new Error(`Order ${orderId} not found or items not available yet.`);
  }
  
  throw error;
}
```

---

## 🔄 **Node 4: Parse Amazon Customization**

**Node Type**: Code  
**Node Name**: `Parse Amazon Customization`  
**Position**: After Fetch Order Items

### **Code**:

```javascript
// Parse Amazon customization into our data structure
const data = $input.first().json;
const order = data.order;
const customization = data.customization || {};

// Amazon Custom fields come as key-value pairs
// Field names may vary - adjust based on your Amazon Custom listing setup
// Common variations: "Child's Name" vs "Child Name" vs "childName"

const getField = (keys) => {
  for (const key of keys) {
    if (customization[key] !== undefined && customization[key] !== null && customization[key] !== '') {
      return customization[key];
    }
  }
  return null;
};

const characterSpecs = {
  childName: getField(['Child\'s Name', 'Child Name', 'childName', 'ChildName']) || 'Hero',
  age: parseInt(getField(['Child\'s Age', 'Child Age', 'age', 'Age']) || '5'),
  pronouns: getField(['Pronouns', 'pronouns']) || 'they/them',
  skinTone: (getField(['Skin Tone', 'skinTone', 'SkinTone']) || 'medium').toLowerCase(),
  hairColor: (getField(['Hair Color', 'hairColor', 'HairColor']) || 'brown').toLowerCase(),
  hairStyle: (getField(['Hair Style', 'hairStyle', 'HairStyle']) || 'short/straight').toLowerCase(),
  favoriteColor: (getField(['Favorite Color', 'favoriteColor', 'FavoriteColor']) || 'blue').toLowerCase(),
  animalGuide: (getField(['Animal Guide', 'animalGuide', 'AnimalGuide']) || 'dog').toLowerCase(),
  clothingStyle: (getField(['Clothing Style', 'clothingStyle', 'ClothingStyle']) || 't-shirt and shorts').toLowerCase(),
  dedication: getField(['Dedication Message', 'dedication', 'Dedication']) || ''
};

// Extract shipping address
const shippingAddress = order.ShippingAddress || {};

// Create standardized order object matching your existing format
const standardizedOrder = {
  amazonOrderId: order.AmazonOrderId,
  orderId: order.AmazonOrderId,
  id: order.AmazonOrderId,
  orderDate: order.PurchaseDate || new Date().toISOString(),
  purchaseDate: order.PurchaseDate || new Date().toISOString(),
  createdAt: new Date().toISOString(),
  status: 'queued_for_processing',
  marketplaceId: order.MarketplaceId || data.marketplaceId,
  customerEmail: order.BuyerInfo?.BuyerEmail || null,
  buyer: {
    email: order.BuyerInfo?.BuyerEmail || null,
    name: shippingAddress.Name || 'Unknown'
  },
  characterSpecs: characterSpecs,
  bookSpecs: {
    title: `${characterSpecs.childName} and the Adventure Compass`,
    totalPages: 16,
    format: '8.5x8.5_softcover',
    bookType: 'adventure'
  },
  orderDetails: {
    quantity: parseInt(order.NumberOfItemsShipped || order.NumberOfItemsUnshipped || 1),
    shippingAddress: {
      name: shippingAddress.Name,
      address: shippingAddress.AddressLine1,
      address2: shippingAddress.AddressLine2 || '',
      city: shippingAddress.City,
      state: shippingAddress.StateOrRegion,
      zip: shippingAddress.PostalCode,
      phone: shippingAddress.Phone || '',
      country: shippingAddress.CountryCode || 'US'
    }
  },
  dedication: characterSpecs.dedication,
  items: [{
    sku: order.OrderItems?.[0]?.SellerSKU || data.items?.[0]?.SellerSKU || 'LHB-8X10-SOFTCOVER',
    quantity: 1,
    customizations: Object.entries(customization).map(([name, value]) => ({
      name: name,
      label: name,
      type: 'text',
      value: String(value)
    }))
  }],
  lineItems: [{
    customizationFields: Object.entries(customization).map(([name, value]) => ({
      name: name,
      text: String(value)
    }))
  }]
};

console.log(`✅ Parsed order ${order.AmazonOrderId} for ${characterSpecs.childName}`);
console.log(`   Age: ${characterSpecs.age}, Pronouns: ${characterSpecs.pronouns}`);
console.log(`   Skin: ${characterSpecs.skinTone}, Hair: ${characterSpecs.hairColor} ${characterSpecs.hairStyle}`);

return [{ json: standardizedOrder }];
```

---

## ⚙️ **Cron Trigger Setup**

Once testing is complete, replace `Manual Trigger` with a Cron Trigger:

**Cron Expression**: `*/10 * * * *` (every 10 minutes)

---

## 🧪 **Testing**

1. **Test Authentication**: Run "Get Amazon Access Token" node
2. **Test Order Fetching**: Run "Fetch Amazon Orders" node
3. **Test Full Flow**: Place test order, run complete workflow
4. **Verify**: Check Supabase for order data

---

**Copy these code blocks into your n8n nodes!** 🚀

