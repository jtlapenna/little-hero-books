# Cloudflare R2 Storage Implementation Guide

## Overview

Cloudflare R2 is the recommended solution for storing 275+ MB PDFs for Little Hero Books. This guide covers setup, implementation, and integration with the Lulu API.

## Why Cloudflare R2?

- **Cost Effective**: $0.015/GB/month (vs AWS S3 $0.023/GB)
- **No Egress Fees**: Unlike AWS S3, no charges for data transfer
- **S3-Compatible API**: Easy integration with existing tools
- **Global CDN**: Fast access worldwide
- **Scalable**: Handles high volume without performance issues

## Cost Analysis

### Per PDF (275MB)
- **Storage**: $0.004/month
- **Egress**: $0 (free)
- **API Calls**: ~$0.0001

### Monthly Projections
| Orders | Storage Cost | Egress Cost | Total |
|--------|-------------|-------------|-------|
| 100 | $0.41 | $0 | $0.41 |
| 1,000 | $4.13 | $0 | $4.13 |
| 10,000 | $41.30 | $0 | $41.30 |

## Setup Instructions

### 1. Create R2 Bucket

1. Log into Cloudflare Dashboard
2. Navigate to R2 Object Storage
3. Click "Create bucket"
4. Name: `little-hero-books-pdfs`
5. Location: Choose closest to your users
6. Enable public access for Lulu API

### 2. Generate API Credentials

1. Go to "Manage R2 API tokens"
2. Click "Create API token"
3. Name: `little-hero-books-production`
4. Permissions: `Object:Edit` for your bucket
5. Save the credentials securely

### 3. Environment Variables

Add to your `.env` file:

```bash
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=little-hero-books-pdfs
R2_PUBLIC_URL=https://your-bucket.r2.cloudflarestorage.com
```

## Implementation Code

### 1. Install Dependencies

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 2. R2 Client Setup

```javascript
// lib/r2-client.js
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export { r2Client, getSignedUrl };
```

### 3. PDF Upload Service

```javascript
// services/pdf-storage.js
import { r2Client, getSignedUrl } from '../lib/r2-client.js';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

export class PDFStorageService {
  constructor() {
    this.bucketName = process.env.R2_BUCKET_NAME;
    this.publicUrl = process.env.R2_PUBLIC_URL;
  }

  async uploadPDF(pdfBuffer, orderId) {
    const key = `orders/${orderId}/book.pdf`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        orderId: orderId,
        uploadedAt: new Date().toISOString(),
        fileSize: pdfBuffer.length.toString()
      }
    });

    try {
      await r2Client.send(command);
      
      return {
        success: true,
        key: key,
        publicUrl: `${this.publicUrl}/${key}`,
        size: pdfBuffer.length
      };
    } catch (error) {
      console.error('PDF upload failed:', error);
      throw new Error(`Failed to upload PDF for order ${orderId}`);
    }
  }

  async generateSignedUrl(key, expiresIn = 86400) { // 24 hours default
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const signedUrl = await getSignedUrl(r2Client, command, { 
        expiresIn 
      });
      
      return signedUrl;
    } catch (error) {
      console.error('Failed to generate signed URL:', error);
      throw new Error('Failed to generate download URL');
    }
  }

  async getPDFMetadata(orderId) {
    const key = `orders/${orderId}/book.pdf`;
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      
      const response = await r2Client.send(command);
      
      return {
        size: response.ContentLength,
        lastModified: response.LastModified,
        contentType: response.ContentType,
        metadata: response.Metadata
      };
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return null; // PDF doesn't exist
      }
      throw error;
    }
  }
}
```

### 4. Integration with n8n Workflow

```javascript
// n8n Code Node - PDF Upload
const PDFStorageService = require('./services/pdf-storage');
const storage = new PDFStorageService();

// After PDF generation
const uploadResult = await storage.uploadPDF(
  pdfBuffer, 
  $json.orderId
);

if (uploadResult.success) {
  // Store in database
  await supabase
    .from('orders')
    .update({
      pdf_url: uploadResult.publicUrl,
      pdf_key: uploadResult.key,
      pdf_uploaded_at: new Date().toISOString()
    })
    .eq('id', $json.orderId);

  return {
    success: true,
    pdfUrl: uploadResult.publicUrl,
    orderId: $json.orderId
  };
} else {
  throw new Error('PDF upload failed');
}
```

### 5. Lulu API Integration

```javascript
// n8n Code Node - Lulu Submission
const storage = new PDFStorageService();

// Generate signed URL for Lulu (48 hour expiry)
const signedUrl = await storage.generateSignedUrl(
  $json.pdf_key,
  172800 // 48 hours
);

const luluPayload = {
  line_items: [{
    cover: signedUrl,
    interior: signedUrl,
    pod_package_id: "0600X0900BWSTD080UW444MXX",
    quantity: 1
  }],
  contact_email: $json.customerEmail,
  shipping_address: {
    name: $json.shippingName,
    street1: $json.shippingStreet1,
    city: $json.shippingCity,
    state_code: $json.shippingState,
    country_code: $json.shippingCountry,
    postal_code: $json.shippingPostalCode
  }
};

return luluPayload;
```

## Database Schema Updates

```sql
-- Add PDF storage columns to orders table
ALTER TABLE orders ADD COLUMN pdf_key VARCHAR(255);
ALTER TABLE orders ADD COLUMN pdf_uploaded_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN lulu_job_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN lulu_status VARCHAR(50);

-- Index for efficient queries
CREATE INDEX idx_orders_pdf_key ON orders(pdf_key);
CREATE INDEX idx_orders_lulu_job_id ON orders(lulu_job_id);
```

## Error Handling & Monitoring

### 1. Upload Retry Logic

```javascript
async uploadPDFWithRetry(pdfBuffer, orderId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.uploadPDF(pdfBuffer, orderId);
    } catch (error) {
      console.error(`Upload attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

### 2. Monitoring Setup

```javascript
// Add to your monitoring
const metrics = {
  pdf_upload_success: 0,
  pdf_upload_failure: 0,
  pdf_upload_size_bytes: 0,
  pdf_upload_duration_ms: 0
};

// Track in your upload function
const startTime = Date.now();
// ... upload logic ...
const duration = Date.now() - startTime;

metrics.pdf_upload_success++;
metrics.pdf_upload_size_bytes += pdfBuffer.length;
metrics.pdf_upload_duration_ms += duration;
```

## Security Considerations

### 1. Access Control

```javascript
// Restrict bucket access
const bucketPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: `arn:aws:s3:::${bucketName}/orders/*`,
      Condition: {
        StringEquals: {
          "aws:Referer": "https://yourdomain.com"
        }
      }
    }
  ]
};
```

### 2. Cleanup Strategy

```javascript
// Clean up old PDFs after Lulu processing
async cleanupOldPDFs(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  // Query database for old processed orders
  const oldOrders = await supabase
    .from('orders')
    .select('pdf_key')
    .eq('lulu_status', 'completed')
    .lt('lulu_completed_at', cutoffDate.toISOString());
  
  // Delete from R2
  for (const order of oldOrders.data) {
    await this.deletePDF(order.pdf_key);
  }
}
```

## Testing

### 1. Unit Tests

```javascript
// tests/pdf-storage.test.js
import { PDFStorageService } from '../services/pdf-storage.js';

describe('PDFStorageService', () => {
  test('should upload PDF successfully', async () => {
    const service = new PDFStorageService();
    const mockBuffer = Buffer.from('fake pdf content');
    
    const result = await service.uploadPDF(mockBuffer, 'test-order-123');
    
    expect(result.success).toBe(true);
    expect(result.key).toContain('test-order-123');
  });
});
```

### 2. Integration Tests

```javascript
// Test with actual R2 bucket
test('end-to-end PDF workflow', async () => {
  // 1. Generate PDF
  const pdfBuffer = await generateTestPDF();
  
  // 2. Upload to R2
  const uploadResult = await storage.uploadPDF(pdfBuffer, 'test-order');
  
  // 3. Generate signed URL
  const signedUrl = await storage.generateSignedUrl(uploadResult.key);
  
  // 4. Verify URL works
  const response = await fetch(signedUrl);
  expect(response.ok).toBe(true);
});
```

## Migration Plan

### Phase 1: Setup (Week 1)
- [ ] Create R2 bucket
- [ ] Set up API credentials
- [ ] Implement basic upload service
- [ ] Test with sample PDFs

### Phase 2: Integration (Week 2)
- [ ] Update n8n workflows
- [ ] Modify database schema
- [ ] Implement error handling
- [ ] Add monitoring

### Phase 3: Production (Week 3)
- [ ] Deploy to production
- [ ] Monitor performance
- [ ] Optimize based on usage
- [ ] Set up cleanup processes

## Troubleshooting

### Common Issues

1. **Upload Timeout**: Increase timeout settings
2. **Large File Issues**: Implement multipart upload
3. **Signed URL Expiry**: Monitor and refresh as needed
4. **Cost Monitoring**: Set up billing alerts

### Support Resources

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [AWS S3 SDK Documentation](https://docs.aws.amazon.com/sdk-for-javascript/)
- [Cloudflare Community](https://community.cloudflare.com/)

## Next Steps

1. Set up R2 bucket and credentials
2. Implement basic upload service
3. Test with sample PDFs
4. Integrate with existing n8n workflows
5. Monitor and optimize based on usage
