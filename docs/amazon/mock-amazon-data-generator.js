/**
 * Mock Amazon Order Data Generator
 * Use this to test your workflows before connecting to real Amazon SP-API
 * 
 * This generates realistic Amazon order data that matches the exact format
 * you'll receive from Amazon Custom orders
 */

/**
 * Generate a mock Amazon order with customization data
 */
function generateMockAmazonOrder(overrides = {}) {
  const timestamp = new Date().toISOString();
  const orderId = `AMZ-${Math.floor(Math.random() * 1000000)}-${Math.floor(Math.random() * 100000)}`;
  
  // Sample child names for variety
  const childNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason'];
  const randomName = childNames[Math.floor(Math.random() * childNames.length)];
  
  const order = {
    // Amazon order basics
    AmazonOrderId: orderId,
    SellerOrderId: `LHB-${Date.now()}`,
    PurchaseDate: timestamp,
    LastUpdateDate: timestamp,
    OrderStatus: 'Unshipped',
    FulfillmentChannel: 'MFN', // Merchant Fulfilled Network
    SalesChannel: 'Amazon.com',
    OrderChannel: '',
    ShipServiceLevel: 'Std US D2D Dom',
    OrderTotal: {
      CurrencyCode: 'USD',
      Amount: '29.99'
    },
    NumberOfItemsShipped: 0,
    NumberOfItemsUnshipped: 1,
    PaymentMethod: 'Other',
    PaymentMethodDetails: ['Standard'],
    MarketplaceId: 'ATVPDKIKX0DER',
    ShipmentServiceLevelCategory: 'Standard',
    OrderType: 'StandardOrder',
    EarliestShipDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    LatestShipDate: new Date(Date.now() + 259200000).toISOString(), // 3 days
    EarliestDeliveryDate: new Date(Date.now() + 432000000).toISOString(), // 5 days
    LatestDeliveryDate: new Date(Date.now() + 864000000).toISOString(), // 10 days
    IsBusinessOrder: false,
    IsPrime: Math.random() > 0.5, // 50% Prime
    IsGlobalExpressEnabled: false,
    IsPremiumOrder: false,
    IsSoldByAB: false,
    IsIBA: false,
    
    // Buyer info (masked for privacy)
    BuyerInfo: {
      BuyerEmail: 'test-buyer@marketplace.amazon.com',
      BuyerName: 'Amazon Customer',
      BuyerTaxInfo: null
    },
    
    // Shipping address
    ShippingAddress: {
      Name: 'Jane Smith',
      AddressLine1: '123 Main Street',
      AddressLine2: 'Apt 4B',
      City: 'Portland',
      StateOrRegion: 'OR',
      PostalCode: '97201',
      CountryCode: 'US',
      Phone: '555-123-4567',
      AddressType: 'Residential'
    },
    
    // Allow overrides
    ...overrides
  };
  
  return order;
}

/**
 * Generate mock order items with customization data
 */
function generateMockOrderItems(orderId, customization = {}) {
  const defaultCustomization = {
    childName: 'Emma',
    age: '5',
    pronouns: 'she/her',
    skinTone: 'Medium',
    hairColor: 'Brown',
    hairStyle: 'Short/Curly',
    favoriteColor: 'Purple',
    animalGuide: 'Unicorn',
    clothingStyle: 'Dress',
    dedication: 'To my amazing Emma, may your adventures never end! Love, Mom & Dad'
  };
  
  const finalCustomization = { ...defaultCustomization, ...customization };
  
  return {
    OrderItems: [
      {
        ASIN: 'B0LITTLEHERO001',
        SellerSKU: 'LITTLE_HERO_BOOK_CUSTOM',
        OrderItemId: `${orderId}-001`,
        Title: 'Personalized Children\'s Book - The Adventure Compass',
        QuantityOrdered: 1,
        QuantityShipped: 0,
        ProductInfo: {
          NumberOfItems: 1
        },
        ItemPrice: {
          CurrencyCode: 'USD',
          Amount: '29.99'
        },
        ItemTax: {
          CurrencyCode: 'USD',
          Amount: '0.00'
        },
        ShippingPrice: {
          CurrencyCode: 'USD',
          Amount: '0.00'
        },
        ShippingTax: {
          CurrencyCode: 'USD',
          Amount: '0.00'
        },
        
        // CRITICAL: Amazon Custom data
        BuyerCustomizedInfo: {
          CustomizedInfo: {
            'Child\'s Name': finalCustomization.childName,
            'Child\'s Age': finalCustomization.age,
            'Pronouns': finalCustomization.pronouns,
            'Skin Tone': finalCustomization.skinTone,
            'Hair Color': finalCustomization.hairColor,
            'Hair Style': finalCustomization.hairStyle,
            'Favorite Color': finalCustomization.favoriteColor,
            'Animal Guide': finalCustomization.animalGuide,
            'Clothing Style': finalCustomization.clothingStyle,
            'Dedication Message': finalCustomization.dedication
          }
        },
        
        ConditionId: 'New',
        IsGift: false,
        IsTransparency: false
      }
    ]
  };
}

/**
 * Generate multiple test orders with variety
 */
function generateTestOrderBatch(count = 5) {
  const orders = [];
  
  const testCases = [
    // Test Case 1: Basic girl character
    {
      childName: 'Emma',
      age: '5',
      pronouns: 'she/her',
      skinTone: 'Medium',
      hairColor: 'Brown',
      hairStyle: 'Short/Curly',
      favoriteColor: 'Purple',
      animalGuide: 'Unicorn',
      clothingStyle: 'Dress'
    },
    // Test Case 2: Basic boy character
    {
      childName: 'Liam',
      age: '4',
      pronouns: 'he/him',
      skinTone: 'Light',
      hairColor: 'Blonde',
      hairStyle: 'Very short/Buzz cut',
      favoriteColor: 'Blue',
      animalGuide: 'Dog',
      clothingStyle: 'T-shirt and shorts'
    },
    // Test Case 3: Diverse skin tone
    {
      childName: 'Amara',
      age: '6',
      pronouns: 'she/her',
      skinTone: 'Dark',
      hairColor: 'Black',
      hairStyle: 'Braids',
      favoriteColor: 'Yellow',
      animalGuide: 'Cat',
      clothingStyle: 'Overalls'
    },
    // Test Case 4: Non-binary child
    {
      childName: 'River',
      age: '7',
      pronouns: 'they/them',
      skinTone: 'Tan',
      hairColor: 'Red',
      hairStyle: 'Medium/Curly',
      favoriteColor: 'Green',
      animalGuide: 'Fox',
      clothingStyle: 'Hoodie and pants'
    },
    // Test Case 5: Edge case - long name
    {
      childName: 'Alexander James',
      age: '3',
      pronouns: 'he/him',
      skinTone: 'Olive',
      hairColor: 'Auburn',
      hairStyle: 'Long/Straight',
      favoriteColor: 'Orange',
      animalGuide: 'Dragon',
      clothingStyle: 'T-shirt and pants'
    }
  ];
  
  for (let i = 0; i < Math.min(count, testCases.length); i++) {
    const order = generateMockAmazonOrder();
    const items = generateMockOrderItems(order.AmazonOrderId, testCases[i]);
    
    orders.push({
      order: order,
      items: items
    });
  }
  
  return orders;
}

/**
 * Generate complete API response format (as Amazon returns it)
 */
function generateMockAPIResponse() {
  const orders = generateTestOrderBatch(3);
  
  return {
    payload: {
      Orders: orders.map(o => o.order),
      NextToken: null,
      LastUpdatedBefore: null,
      CreatedBefore: new Date().toISOString()
    }
  };
}

/**
 * Export for use in n8n Code nodes
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateMockAmazonOrder,
    generateMockOrderItems,
    generateTestOrderBatch,
    generateMockAPIResponse
  };
}

// ============================================
// USAGE IN N8N CODE NODE
// ============================================

/*
// Copy this into an n8n Code node to simulate Amazon orders:

// Generate 3 test orders
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
    MarketplaceId: 'ATVPDKIKX0DER',
    BuyerInfo: { BuyerEmail: 'test@example.com' }
  }
];

// Generate items with customization
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

// Return as if from Amazon API
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
*/

// ============================================
// TESTING EXAMPLES
// ============================================

// Example 1: Generate a single order
console.log('Example 1: Single Order');
const singleOrder = generateMockAmazonOrder();
console.log(JSON.stringify(singleOrder, null, 2));

// Example 2: Generate order with items
console.log('\nExample 2: Order with Items');
const orderWithItems = generateMockAmazonOrder();
const items = generateMockOrderItems(orderWithItems.AmazonOrderId);
console.log(JSON.stringify({ order: orderWithItems, items }, null, 2));

// Example 3: Generate batch of test orders
console.log('\nExample 3: Batch of Orders');
const batch = generateTestOrderBatch(3);
console.log(`Generated ${batch.length} test orders`);

// Example 4: Complete API response
console.log('\nExample 4: Complete API Response (as Amazon returns it)');
const apiResponse = generateMockAPIResponse();
console.log(JSON.stringify(apiResponse, null, 2));

