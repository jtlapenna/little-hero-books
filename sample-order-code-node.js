// Sample Order Data for Workflow 3 Testing
// Copy this code into a Manual Trigger Code Node in n8n

const sampleOrder = {
  amazonOrderId: 'TEST-ORDER-001',
  characterHash: '6ec1cd52dce77992',
  status: 'ready_for_book_assembly',
  characterSpecs: {
    childName: 'Alex',
    hometown: 'Seattle',
    skinTone: 'medium african-american',
    hairColor: 'black',
    hairStyle: 'pom pom',
    age: 4,
    pronouns: 'they/them',
    favoriteColor: 'green',
    animalGuide: 'dog',
    clothingStyle: 't-shirt and shorts'
  },
  publicR2Url: 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev',
  orderDetails: {
    orderDate: '2024-01-15T10:00:00.000Z',
    customerEmail: 'test@example.com',
    quantity: 1,
    shippingAddress: {
      name: 'Test Customer',
      address: '123 Test Street', 
      city: 'Test City',
      state: 'CA',
      zip: '90210'
    }
  },
  workflowProgress: {
    characterGeneration: 'completed',
    bookAssembly: 'pending',
    pdfGeneration: 'pending',
    shipping: 'pending'
  },
  bookSpecs: {
    title: 'Alex and the Adventure Compass',
    totalPages: 14,
    pageSize: '8.5x8.5',
    dpi: 300,
    format: '8.5x8.5_softcover',
    bookType: 'animal-guide'
  },
  metadata: {
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    version: '1.0',
    testMode: true
  }
};

console.log('Sample order data for Workflow 3 testing:', sampleOrder);
return [{ json: sampleOrder }];
