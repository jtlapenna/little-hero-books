// Mock Order Generator Node for End-to-End Testing
// Add this as a Code node in W0 (before CONFIG node) or as a separate test workflow
// This generates realistic test data that can be traced through all workflows

// Configuration: Modify these values for different test scenarios
const TEST_CONFIG = {
  orderId: "TEST-ORDER-E2E-001", // Change for each test run
  childName: "Emma",
  childAge: 5,
  skinTone: "light",
  hairColor: "blonde",
  hairStyle: "long",
  pronouns: "she/her",
  favoriteColor: "purple",
  animalGuide: "dragon",
  clothingStyle: "adventure",
  customerEmail: "test@littleherolabs.com",
  shippingName: "Jane Smith",
  shippingAddress: "123 Main Street",
  shippingCity: "Portland",
  shippingState: "OR",
  shippingZip: "97201",
  shippingPhone: "+1-555-123-4567", // CRITICAL: Required for Lulu API
  dedication: "For our little adventurer on her 5th birthday!"
};

// Generate mock order matching W0 expected input format
const mockOrder = {
  // Amazon order identifiers
  amazonOrderId: TEST_CONFIG.orderId,
  orderId: TEST_CONFIG.orderId,
  id: TEST_CONFIG.orderId,
  
  // Order metadata
  orderDate: new Date().toISOString(),
  purchaseDate: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  status: "queued_for_processing",
  marketplaceId: "ATVPDKIKX0DER",
  
  // Customer information
  customerEmail: TEST_CONFIG.customerEmail,
  buyer: {
    email: TEST_CONFIG.customerEmail,
    name: TEST_CONFIG.shippingName
  },
  
  // Character specifications (for character generation)
  characterSpecs: {
    childName: TEST_CONFIG.childName,
    age: TEST_CONFIG.childAge,
    skinTone: TEST_CONFIG.skinTone,
    hairColor: TEST_CONFIG.hairColor,
    hairStyle: TEST_CONFIG.hairStyle,
    pronouns: TEST_CONFIG.pronouns,
    favoriteColor: TEST_CONFIG.favoriteColor,
    animalGuide: TEST_CONFIG.animalGuide,
    clothingStyle: TEST_CONFIG.clothingStyle
  },
  
  // Book specifications
  bookSpecs: {
    title: `${TEST_CONFIG.childName} and the Adventure Compass`,
    totalPages: 16,
    format: "8.5x8.5_softcover",
    bookType: "adventure"
  },
  
  // Order details including shipping
  orderDetails: {
    quantity: 1,
    shippingAddress: {
      name: TEST_CONFIG.shippingName,
      address: TEST_CONFIG.shippingAddress,
      city: TEST_CONFIG.shippingCity,
      state: TEST_CONFIG.shippingState,
      zip: TEST_CONFIG.shippingZip,
      phone: TEST_CONFIG.shippingPhone, // CRITICAL: For Lulu API
      phoneNumber: TEST_CONFIG.shippingPhone, // Alternative field name
      phone_number: TEST_CONFIG.shippingPhone, // Lulu expects this format
      country: "US"
    }
  },
  
  // Dedication message
  dedication: TEST_CONFIG.dedication,
  
  // Amazon order items (for compatibility)
  items: [
    {
      sku: "LHB-8X10-SOFTCOVER",
      quantity: 1,
      customizations: [
        {
          name: "dedication",
          label: "Dedication Message",
          type: "text",
          value: TEST_CONFIG.dedication
        },
        {
          name: "childName",
          label: "Child's Name",
          type: "text",
          value: TEST_CONFIG.childName
        }
      ]
    }
  ],
  
  // Legacy field support
  lineItems: [
    {
      customizationFields: [
        {
          name: "dedication",
          text: TEST_CONFIG.dedication
        }
      ]
    }
  ]
};

// Output for n8n
return [{
  json: mockOrder
}];

// Usage Notes:
// 1. Add this as a Code node in W0 workflow (before CONFIG node)
// 2. Or create a separate test workflow that triggers W0 webhook
// 3. Change TEST_CONFIG.orderId for each test run to avoid conflicts
// 4. Verify phone number appears in:
//    - 1-manifest.json (R2)
//    - Supabase orders table (if stored)
//    - W4 Lulu payload
// 5. Use unique order IDs to track test orders through all workflows

