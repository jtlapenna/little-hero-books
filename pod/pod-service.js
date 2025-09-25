import axios from 'axios';
import { z } from 'zod';

// POD Order Schema
const PODOrderSchema = z.object({
  orderId: z.string(),
  contactEmail: z.string().email(),
  shippingAddress: z.object({
    name: z.string(),
    address1: z.string(),
    address2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string().default('US')
  }),
  items: z.array(z.object({
    title: z.string(),
    printFileUrl: z.string().url(),
    coverFileUrl: z.string().url(),
    sku: z.string(),
    quantity: z.number().int().positive().default(1)
  })),
  shippingMethod: z.enum(['ECONOMY', 'STANDARD', 'EXPRESS']).default('ECONOMY')
});

const PODResponseSchema = z.object({
  orderId: z.string(),
  podOrderId: z.string(),
  status: z.enum(['submitted', 'in_production', 'shipped', 'delivered', 'cancelled']),
  trackingNumber: z.string().optional(),
  estimatedDeliveryDate: z.string().optional(),
  totalCost: z.number().optional(),
  createdAt: z.string()
});

class PODService {
  constructor(provider = 'lulu') {
    this.provider = provider;
    this.baseURL = this.getBaseURL();
    this.apiKey = process.env.POD_API_KEY;
    this.contactEmail = process.env.POD_CONTACT_EMAIL || 'ops@littleherobooks.com';
    
    if (!this.apiKey) {
      throw new Error('POD_API_KEY environment variable is required');
    }
  }

  getBaseURL() {
    switch (this.provider) {
      case 'lulu':
        return process.env.LULU_API_URL || 'https://api.lulu.com/v1';
      case 'onpress':
        return process.env.ONPRESS_API_URL || 'https://api.onpress.com/v1';
      default:
        throw new Error(`Unsupported POD provider: ${this.provider}`);
    }
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
      'User-Agent': 'Little-Hero-Books/1.0'
    };
  }

  async createOrder(orderData) {
    try {
      // Validate input data
      const validatedOrder = PODOrderSchema.parse(orderData);
      
      // Prepare POD-specific payload
      const payload = this.formatOrderPayload(validatedOrder);
      
      console.log(`📦 Creating POD order for ${validatedOrder.orderId}...`);
      
      // Submit to POD provider
      const response = await axios.post(`${this.baseURL}/orders`, payload, {
        headers: this.getHeaders(),
        timeout: 30000
      });

      // Validate and format response
      const podResponse = PODResponseSchema.parse({
        orderId: validatedOrder.orderId,
        podOrderId: response.data.id || response.data.order_id,
        status: 'submitted',
        trackingNumber: response.data.tracking_number,
        estimatedDeliveryDate: response.data.estimated_delivery_date,
        totalCost: response.data.total_cost,
        createdAt: new Date().toISOString()
      });

      console.log(`✅ POD order created: ${podResponse.podOrderId}`);
      return podResponse;

    } catch (error) {
      console.error(`❌ POD order creation failed for ${orderData.orderId}:`, error.message);
      
      if (error.response) {
        console.error('POD API Error:', error.response.data);
      }
      
      throw new Error(`POD order creation failed: ${error.message}`);
    }
  }

  formatOrderPayload(order) {
    switch (this.provider) {
      case 'lulu':
        return {
          contact_email: this.contactEmail,
          shipping_address: {
            name: order.shippingAddress.name,
            address1: order.shippingAddress.address1,
            address2: order.shippingAddress.address2,
            city: order.shippingAddress.city,
            state: order.shippingAddress.state,
            zip: order.shippingAddress.zip,
            country: order.shippingAddress.country
          },
          items: order.items.map(item => ({
            title: item.title,
            print_file_url: item.printFileUrl,
            cover_file_url: item.coverFileUrl,
            sku: item.sku,
            quantity: item.quantity
          })),
          shipping_method: order.shippingMethod
        };
      
      case 'onpress':
        return {
          contactEmail: this.contactEmail,
          shippingAddress: order.shippingAddress,
          lineItems: order.items.map(item => ({
            title: item.title,
            interiorFileUrl: item.printFileUrl,
            coverFileUrl: item.coverFileUrl,
            sku: item.sku,
            quantity: item.quantity
          })),
          shippingMethod: order.shippingMethod
        };
      
      default:
        throw new Error(`Unknown POD provider: ${this.provider}`);
    }
  }

  async getOrderStatus(podOrderId) {
    try {
      console.log(`📊 Checking status for POD order: ${podOrderId}`);
      
      const response = await axios.get(`${this.baseURL}/orders/${podOrderId}`, {
        headers: this.getHeaders(),
        timeout: 15000
      });

      const status = PODResponseSchema.parse({
        orderId: response.data.external_order_id || podOrderId,
        podOrderId: podOrderId,
        status: this.mapStatus(response.data.status),
        trackingNumber: response.data.tracking_number,
        estimatedDeliveryDate: response.data.estimated_delivery_date,
        totalCost: response.data.total_cost,
        createdAt: response.data.created_at
      });

      console.log(`📋 POD order ${podOrderId} status: ${status.status}`);
      return status;

    } catch (error) {
      console.error(`❌ Failed to get POD order status for ${podOrderId}:`, error.message);
      throw new Error(`POD status check failed: ${error.message}`);
    }
  }

  mapStatus(podStatus) {
    const statusMap = {
      'submitted': 'submitted',
      'processing': 'in_production',
      'in_production': 'in_production',
      'shipped': 'shipped',
      'delivered': 'delivered',
      'cancelled': 'cancelled',
      'failed': 'cancelled'
    };
    
    return statusMap[podStatus] || 'submitted';
  }

  async cancelOrder(podOrderId, reason = 'Customer request') {
    try {
      console.log(`🚫 Cancelling POD order: ${podOrderId}`);
      
      await axios.delete(`${this.baseURL}/orders/${podOrderId}`, {
        headers: this.getHeaders(),
        data: { reason },
        timeout: 15000
      });

      console.log(`✅ POD order cancelled: ${podOrderId}`);
      return { success: true, podOrderId, reason };

    } catch (error) {
      console.error(`❌ Failed to cancel POD order ${podOrderId}:`, error.message);
      throw new Error(`POD cancellation failed: ${error.message}`);
    }
  }

  // Test connection to POD provider
  async testConnection() {
    try {
      console.log(`🔍 Testing POD connection to ${this.provider}...`);
      
      const response = await axios.get(`${this.baseURL}/health`, {
        headers: this.getHeaders(),
        timeout: 10000
      });

      console.log(`✅ POD connection successful: ${this.provider}`);
      return {
        provider: this.provider,
        status: 'connected',
        baseURL: this.baseURL,
        response: response.data
      };

    } catch (error) {
      console.error(`❌ POD connection failed: ${this.provider}`, error.message);
      return {
        provider: this.provider,
        status: 'error',
        error: error.message
      };
    }
  }
}

// Helper function to create order from renderer output
export function createPODOrderFromRenderer(rendererOutput, shippingAddress, childName) {
  return {
    orderId: rendererOutput.orderId,
    contactEmail: process.env.POD_CONTACT_EMAIL || 'ops@littleherobooks.com',
    shippingAddress: shippingAddress,
    items: [{
      title: `${childName} and the Adventure Compass`,
      printFileUrl: rendererOutput.bookPdfUrl,
      coverFileUrl: rendererOutput.coverPdfUrl,
      sku: 'PB-8x10-16p-SC', // Personalized Book - 8x10 - 16 pages - Soft Cover
      quantity: 1
    }],
    shippingMethod: 'ECONOMY'
  };
}

// Export the service
export default PODService;

// Test function
export async function testPODService() {
  console.log('🧪 Testing POD Service\n');

  try {
    const podService = new PODService('lulu');
    
    // Test connection
    const connectionTest = await podService.testConnection();
    console.log('Connection test:', connectionTest);

    // Test order creation (mock data)
    const testOrder = {
      orderId: 'TEST-' + Date.now(),
      contactEmail: 'test@littleherobooks.com',
      shippingAddress: {
        name: 'Test Customer',
        address1: '123 Test Street',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        country: 'US'
      },
      items: [{
        title: 'Test Book',
        printFileUrl: 'https://example.com/book.pdf',
        coverFileUrl: 'https://example.com/cover.pdf',
        sku: 'TEST-SKU',
        quantity: 1
      }],
      shippingMethod: 'ECONOMY'
    };

    console.log('\n📦 Test order payload:', JSON.stringify(testOrder, null, 2));
    
    // Note: Uncomment to actually create test order
    // const result = await podService.createOrder(testOrder);
    // console.log('✅ Test order created:', result);

  } catch (error) {
    console.error('❌ POD service test failed:', error.message);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPODService();
}
