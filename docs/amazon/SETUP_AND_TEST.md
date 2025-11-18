# Amazon Integration - Setup and Testing Guide
## Step-by-Step Instructions to Get Amazon Orders Working

> **See Also**: `AMAZON_SETUP_GUIDE.md` - Main setup guide with complete overview

---

## 🎯 **Overview**

We're adding 4 new Code nodes to Workflow 0 to fetch orders from Amazon SP-API. The workflow will look like:

```
Manual Trigger
    ↓
CONFIG (PRODUCTION) [Keep existing]
    ↓
Get Amazon Access Token [NEW]
    ↓
Fetch Amazon Orders [NEW]
    ↓
Fetch Order Items [NEW] [Split by order]
    ↓
Parse Amazon Customization [NEW]
    ↓
Normalize Payload [Existing - keep]
    ↓
Extract & Validate Dedication [Existing - keep]
    ↓
... rest of workflow
```

---

## 📋 **Step 1: Add Amazon Credentials to CONFIG Node**

Since Variables require Pro plan, we'll add Amazon credentials to your existing CONFIG node:

1. **Open Workflow 0** → Find "CONFIG (PRODUCTION)" node
2. **Edit the node** and add Amazon credentials to the config object:

```javascript
// Central config (fill tokens/keys after import)
return [{ json: {
  supabase: {
    url: "https://mdnthwpcnphjnnblbvxk.supabase.co",
    serviceKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs"
  },
  r2: {
    bucket: "little-hero-orders",
    signedUrlEndpoint: "https://admin.littleherolabs.com/api/r2/signed-url",
    apiToken: "e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646",
    expiresIn: 600,
    keyPrefix: "book-mvp-simple-adventure/orders",
    useBackendSignedUpload: true
  },
  s3: {
    endpoint: "https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com",
    accessKeyId: "b0a481f17d8641a232e0aae8a3efeb7a",
    secretAccessKey: "745ade64f37a8def63e44ae9bfb2fb286c23a500b437c722461a33c7820d43cd",
    accountId: "3daae940fcb6fc5b8bbd9bb8fcc62854"
  },
  // === Amazon SP-API Configuration ===
  amazon: {
    clientId: "YOUR_AMAZON_CLIENT_ID_HERE",
    clientSecret: "YOUR_AMAZON_CLIENT_SECRET_HERE",
    refreshToken: "YOUR_AMAZON_REFRESH_TOKEN_HERE",
    sellerId: "YOUR_SELLER_ID_HERE",
    marketplaceId: "ATVPDKIKX0DER",
    region: "na",
    sandboxMode: true
  }
} }];
```

3. **Save** the CONFIG node

---

## 🔧 **Step 2: Add Amazon Nodes to Workflow 0**

### **2.1: Open Workflow 0**

1. Go to n8n → Workflows
2. Open: `LHB - 0 - ORDER INTAKE VALIDATION`

### **2.2: Disable Mock Order Node (Temporarily)**

1. Find "Mock Order (Testing)" node
2. **Disable it** (click the node → toggle "Active" off)
   - We'll test Amazon first, then you can switch back if needed

### **2.3: Add Node 1: Get Amazon Access Token**

1. **Add Code node** after "CONFIG (PRODUCTION)"
2. **Name it**: `Get Amazon Access Token`
3. **Position**: Between CONFIG and where Mock Order was
4. **Copy this code** (from `AMAZON_N8N_CODE.md`):

// Exchange refresh token for access token
// Get config from CONFIG node
const config = $item(0).$node['CONFIG (PRODUCTION)']?.json || {};
const amazon = config.amazon || {};

const refreshToken = amazon.refreshToken;
const clientId = amazon.clientId;
const clientSecret = amazon.clientSecret;

if (!refreshToken || !clientId || !clientSecret) {
  throw new Error('Amazon credentials not found in CONFIG node. Check CONFIG (PRODUCTION) node has amazon config.');
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

5. **Connect**: CONFIG (PRODUCTION) → Get Amazon Access Token

---

### **2.4: Add Node 2: Fetch Amazon Orders**

1. **Add Code node** after "Get Amazon Access Token"
2. **Name it**: `Fetch Amazon Orders`
3. **Copy this code**:

// Fetch unshipped orders from Amazon SP-API
const accessToken = $('Get Amazon Access Token').first().json.access_token;
const config = $item(0).$node['CONFIG (PRODUCTION)']?.json || {};
const amazon = config.amazon || {};

const sellerId = amazon.sellerId || 'A2V719MRGLK48O';
const marketplaceId = amazon.marketplaceId || 'ATVPDKIKX0DER';
const region = amazon.region || 'na';

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

4. **Connect**: Get Amazon Access Token → Fetch Amazon Orders

---

### **2.5: Add Node 3: Fetch Order Items**

1. **Add Code node** after "Fetch Amazon Orders"
2. **Name it**: `Fetch Order Items`
3. **Important**: Set this node to **"Split by order"** mode:
   - Click the node
   - Find "Mode" or "Execution" settings
   - Set to "Execute Once for Each Item" or "Split by Item"
   - This processes each order separately
4. **Copy this code**:

```javascript
// Fetch order items to get customization data
const order = $input.first().json;
const orderId = order.AmazonOrderId;

if (!orderId) {
  throw new Error('Order ID not found in input');
}

const accessToken = order.access_token || $('Get Amazon Access Token').first().json.access_token;
const config = $item(0).$node['CONFIG (PRODUCTION)']?.json || {};
const amazon = config.amazon || {};
const region = order.region || amazon.region || 'na';

// SP-API endpoint (automatically detects sandbox mode)
const isSandbox = amazon.sandboxMode === true;
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

5. **Connect**: Fetch Amazon Orders → Fetch Order Items

---

### **2.6: Add Node 4: Parse Amazon Customization**

1. **Add Code node** after "Fetch Order Items"
2. **Name it**: `Parse Amazon Customization`
3. **Copy this code**:

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

4. **Connect**: Fetch Order Items → Parse Amazon Customization → **Normalize Payload** (existing node)

---

## ✅ **Step 3: Final Workflow Structure**

Your workflow should now look like:

```
Manual Trigger
    ↓
CONFIG (PRODUCTION)
    ↓
Get Amazon Access Token [NEW]
    ↓
Fetch Amazon Orders [NEW]
    ↓
Fetch Order Items [NEW] [Split by order]
    ↓
Parse Amazon Customization [NEW]
    ↓
Normalize Payload [EXISTING]
    ↓
Extract & Validate Dedication [EXISTING]
    ↓
Build 1-manifest.json [EXISTING]
    ↓
... rest of workflow
```

**Mock Order (Testing)** should be **disabled** for now.

---

## 🧪 **Step 4: Testing**

### **4.1: Test Authentication First**

1. **Run only**: Manual Trigger → CONFIG → Get Amazon Access Token
2. **Check output**: Should see `✅ Got Amazon access token`
3. **If error**: Check environment variables in n8n

### **4.2: Test Order Fetching**

1. **Run**: Complete workflow up to "Fetch Amazon Orders"
2. **Check output**: 
   - If sandbox has no orders: `⚠️ No new orders to process` (this is OK!)
   - If orders found: Should see order data

### **4.3: Test Full Workflow**

1. **Run complete workflow** from Manual Trigger
2. **Check Supabase**: Verify order appears in `orders` table
3. **Check logs**: Look for any errors or warnings

---

## 🐛 **Troubleshooting**

### **"Amazon credentials not found in CONFIG node"**
- Check CONFIG (PRODUCTION) node has `amazon` section with all required fields
- Verify the CONFIG node runs before Get Amazon Access Token

### **"Amazon authentication failed"**
- Verify Refresh Token in CONFIG node is correct (starts with `Atzr|` - get from Solution Provider Portal)
- Check Client ID and Secret in CONFIG node are correct
- Ensure `sandboxMode: true` is set in CONFIG node

### **"No orders returned"**
- **This is normal in sandbox!** Sandbox may have no test orders
- Check Amazon Seller Central for actual orders
- Verify order status is "Unshipped"

### **"No customization data found"**
- Sandbox orders may not have customization data
- Check the "Fetch Order Items" node output to see actual structure
- Field names may need adjustment based on your Amazon Custom listing

---

## 🔄 **Step 5: Switch Between Mock and Amazon**

### **To Use Amazon Orders:**
- **Disable**: Mock Order (Testing)
- **Enable**: All 4 Amazon nodes

### **To Use Mock Orders:**
- **Enable**: Mock Order (Testing)
- **Disable**: Get Amazon Access Token (or disconnect it)

### **To Use Both (for testing):**
- Keep both paths active
- Use a Switch node to choose which path to use

---

## 🎯 **Step 6: Set Up Cron Trigger (After Testing)**

Once everything works:

1. **Replace Manual Trigger** with **Cron Trigger**
2. **Cron Expression**: `*/10 * * * *` (every 10 minutes)
3. **Save workflow**

---

## ✅ **Success Checklist**

- [ ] Amazon credentials added to CONFIG (PRODUCTION) node
- [ ] All 4 Amazon nodes added and connected
- [ ] Mock Order node disabled
- [ ] Authentication test passes
- [ ] Order fetching works (even if no orders found)
- [ ] Full workflow completes successfully
- [ ] Orders appear in Supabase

---

**You're ready to test!** Start with Step 1 (environment variables) and work through each step. 🚀

