# Little Hero Books - POD Integration Guide

## 🖨️ **Print-on-Demand Integration**

This guide covers the complete integration with Print-on-Demand (POD) providers for automated book printing and shipping.

## 🎯 **Supported Providers**

### **Lulu Print API** (Recommended)
- **Pros**: Excellent book quality, reliable shipping, good API
- **Cons**: Slightly higher costs than some competitors
- **Best for**: High-quality children's books with consistent results

### **OnPress** (Alternative)
- **Pros**: Competitive pricing, good API documentation
- **Cons**: Newer provider, less established track record
- **Best for**: Cost-conscious operations

## 🔧 **Setup & Configuration**

### **1. Environment Variables**

Add these to your `.env` file:

```bash
# POD Provider Configuration
POD_PROVIDER=lulu                    # or 'onpress'
POD_API_KEY=your_pod_api_key_here
POD_CONTACT_EMAIL=ops@littleherobooks.com

# Lulu-specific
LULU_API_URL=https://api.lulu.com/v1

# OnPress-specific  
ONPRESS_API_URL=https://api.onpress.com/v1
```

### **2. Install Dependencies**

```bash
cd pod
npm install
```

### **3. Test Connection**

```bash
npm test
```

## 📦 **POD Service Usage**

### **Basic Integration**

```javascript
import PODService, { createPODOrderFromRenderer } from './pod-service.js';

// Initialize POD service
const podService = new PODService('lulu');

// Create order from renderer output
const rendererOutput = {
  orderId: 'AMZ-1234',
  bookPdfUrl: 'https://storage.example.com/AMZ-1234/book.pdf',
  coverPdfUrl: 'https://storage.example.com/AMZ-1234/cover.pdf',
  thumbUrl: 'https://storage.example.com/AMZ-1234/thumb.jpg'
};

const shippingAddress = {
  name: 'Jane Smith',
  address1: '123 Main Street',
  city: 'Portland',
  state: 'OR',
  zip: '97201',
  country: 'US'
};

const childName = 'Emma';

// Create POD order
const podOrder = createPODOrderFromRenderer(rendererOutput, shippingAddress, childName);
const result = await podService.createOrder(podOrder);

console.log('POD Order Created:', result);
```

### **Order Management**

```javascript
// Check order status
const status = await podService.getOrderStatus(result.podOrderId);
console.log('Order Status:', status);

// Cancel order (if needed)
await podService.cancelOrder(result.podOrderId, 'Customer request');
```

## 🏗️ **Integration with Renderer Service**

### **Updated Renderer Response**

The renderer service should return signed URLs that POD providers can access:

```json
{
  "orderId": "AMZ-1234",
  "bookPdfUrl": "https://cdn.littleherobooks.com/orders/AMZ-1234/book.pdf",
  "coverPdfUrl": "https://cdn.littleherobooks.com/orders/AMZ-1234/cover.pdf",
  "thumbUrl": "https://cdn.littleherobooks.com/orders/AMZ-1234/thumb.jpg",
  "status": "success",
  "duration": 1250,
  "timestamp": "2025-01-XX"
}
```

### **POD Order Creation Flow**

1. **Renderer generates PDFs** → Returns signed URLs
2. **POD Service creates order** → Submits to POD provider
3. **Store POD order ID** → For tracking and management
4. **Monitor order status** → Track through production and shipping

## 📋 **Book Specifications**

### **Physical Specifications**
- **Size**: 8×10 inches (portrait)
- **Pages**: 16 total (14 story + 1 dedication + 1 keepsake)
- **Binding**: Softcover (MVP)
- **Paper**: 60# white text, 80# cover
- **Color**: Full color, CMYK

### **File Requirements**
- **Book PDF**: 8×10 inches, 16 pages, 300 DPI
- **Cover PDF**: 8×10 inches, single page, 300 DPI
- **Bleed**: 0.125 inches on all sides
- **Format**: PDF/A-1b (print-ready)

## 🚚 **Shipping Options**

### **Available Methods**
- **ECONOMY**: 7-14 business days, lowest cost
- **STANDARD**: 5-7 business days, moderate cost
- **EXPRESS**: 2-3 business days, highest cost

### **Shipping Costs** (Approximate)
- **ECONOMY**: $3.50-$4.50 per book
- **STANDARD**: $5.50-$6.50 per book
- **EXPRESS**: $8.50-$12.50 per book

## 💰 **Cost Structure**

### **Lulu Pricing** (Approximate)
- **Print Cost**: $3.50-$4.50 per book
- **Shipping**: $3.50-$12.50 (depending on method)
- **Total Cost**: $7.00-$17.00 per book

### **OnPress Pricing** (Approximate)
- **Print Cost**: $2.50-$3.50 per book
- **Shipping**: $3.00-$10.00 (depending on method)
- **Total Cost**: $5.50-$13.50 per book

## 🧪 **Testing & Validation**

### **Test Order Process**

1. **Generate test PDFs** using renderer service
2. **Create test POD order** with your address
3. **Monitor order through production**
4. **Validate print quality** and shipping time
5. **Test different shipping methods**

### **Quality Checklist**

- [ ] **Print Quality**: Colors accurate, text crisp, no artifacts
- [ ] **Binding**: Pages properly bound, no loose pages
- [ ] **Paper Quality**: Appropriate weight and finish
- [ ] **Shipping**: Arrives on time, packaging intact
- [ ] **Customer Experience**: Professional presentation

## 🔄 **n8n Integration**

### **Flow A: Order Processing**
```javascript
// After renderer service completes
const podOrder = createPODOrderFromRenderer(rendererOutput, shippingAddress, childName);
const podResult = await podService.createOrder(podOrder);

// Store POD order ID for tracking
await storePODOrderId(orderId, podResult.podOrderId);
```

### **Flow B: Status Tracking**
```javascript
// Check status of in-flight orders
const podStatus = await podService.getOrderStatus(podOrderId);

// Update Amazon with tracking when available
if (podStatus.trackingNumber) {
  await confirmAmazonShipment(orderId, podStatus.trackingNumber);
}
```

## 🚨 **Error Handling**

### **Common Issues**

**PDF Access Issues**
- Ensure signed URLs are publicly accessible
- Check URL expiration times
- Verify PDF file format and specifications

**Order Creation Failures**
- Validate shipping address format
- Check API key permissions
- Verify account status with POD provider

**Production Issues**
- Monitor order status regularly
- Have manual override process for failed orders
- Maintain customer communication during delays

### **Fallback Procedures**

1. **Manual Order Creation**: POD provider dashboard
2. **Alternative Provider**: Switch to backup POD provider
3. **Customer Communication**: Proactive updates on delays
4. **Refund Process**: For orders that cannot be fulfilled

## 📊 **Monitoring & Analytics**

### **Key Metrics**
- **Order Success Rate**: Percentage of successful POD orders
- **Average Production Time**: From order to shipping
- **Print Quality Score**: Customer feedback on quality
- **Shipping Performance**: On-time delivery rates
- **Cost per Order**: Total POD costs including shipping

### **Health Checks**
```javascript
// Test POD service health
const health = await podService.testConnection();
console.log('POD Service Status:', health);
```

## 🔐 **Security Considerations**

### **API Key Management**
- Store API keys securely in environment variables
- Rotate keys regularly
- Monitor API usage for anomalies

### **File Access**
- Use signed URLs with expiration times
- Implement proper access controls
- Monitor file access patterns

## 📞 **Support & Resources**

### **Lulu Resources**
- **API Documentation**: [developers.lulu.com](https://developers.lulu.com)
- **Support**: [support.lulu.com](https://support.lulu.com)
- **Community**: [community.lulu.com](https://community.lulu.com)

### **OnPress Resources**
- **API Documentation**: [docs.onpress.com](https://docs.onpress.com)
- **Support**: [support.onpress.com](https://support.onpress.com)

### **Little Hero Books Support**
- **Technical Issues**: hello@littleherobooks.com
- **POD Integration**: Reference this documentation
- **Emergency Contacts**: Include in operational procedures

---

**Next Steps**: After POD integration is complete, proceed to customer website development and end-to-end testing.
