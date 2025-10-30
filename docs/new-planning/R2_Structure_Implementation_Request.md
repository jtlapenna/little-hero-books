# R2 Structure Implementation Request

**Date:** October 29, 2025  
**To:** Backend/Workflow Team  
**From:** Workflow Integration Agent  
**Priority:** High (Required for 2B Integration)  
**Status:** Ready for Implementation

---

## 📋 Executive Summary

We need to establish the **little-hero-orders** R2 bucket structure for order-centric manifest storage. This will support the manifest-based workflow coordination system while keeping generated images in their current character-centric location.

**Key Decision:** We're adopting a **hybrid storage strategy**:
- ✅ **Images stay character-centric** in `little-hero-assets` (no changes to existing structure)
- ✅ **Manifests become order-centric** in `little-hero-orders` (new structure)

---

## 🎯 What We're Building

### **Purpose:**
Create a structured folder hierarchy in the `little-hero-orders` R2 bucket to store:
1. Order manifests from each workflow stage (2A, 2B, 3)
2. Order metadata and tracking information
3. Admin-specific data and approval history

### **Why:**
- Backend can easily find manifests by orderId
- Clear separation between public assets and private order data
- Supports workflow coordination and debugging
- Enables order history and audit trails

---

## 📁 Required R2 Bucket Structure

### **Bucket: little-hero-orders**

```
little-hero-orders/
  book-mvp-simple-adventure/           ← Project namespace (matches existing)
    orders/                             ← All orders go here
      {orderId}/                        ← Individual order folder
        manifests/                      ← Workflow manifests
          2a-manifest.json             ← From Workflow 2A (pose generation)
          2b-manifest.json             ← From Workflow 2B (Bria processing)
          3-manifest.json              ← From Workflow 3 (book compilation)
        metadata/                       ← Order tracking data
          order.json                   ← Order details (from Workflow 1)
          approvals.json               ← Approval history (from backend)
        logs/                           ← Optional: Workflow execution logs
          2a-execution.log
          2b-execution.log
          3-execution.log
```

### **Example with Real Order ID:**

```
little-hero-orders/
  book-mvp-simple-adventure/
    orders/
      book-001-1730000000-abc123/      ← Order ID format
        manifests/
          2a-manifest.json
          2b-manifest.json
          3-manifest.json
        metadata/
          order.json
          approvals.json
```

---

## 🔧 Implementation Details

### **1. Folder Structure Rules**

**Order ID Format:**
```
book-{sequenceNumber}-{timestamp}-{randomHash}

Examples:
- book-001-1730000000-abc123
- book-002-1730123456-def456
```

**Path Construction:**
```javascript
// Standard path template
const orderBasePath = `book-mvp-simple-adventure/orders/${orderId}`;

// Manifest paths
const manifest2APath = `${orderBasePath}/manifests/2a-manifest.json`;
const manifest2BPath = `${orderBasePath}/manifests/2b-manifest.json`;
const manifest3Path = `${orderBasePath}/manifests/3-manifest.json`;

// Metadata paths
const orderMetadataPath = `${orderBasePath}/metadata/order.json`;
const approvalsPath = `${orderBasePath}/metadata/approvals.json`;
```

---

### **2. Bucket Configuration**

**Access Control:**
- **Bucket Type:** Private (not public)
- **Access:** Backend API, n8n workflows, Admin dashboard only
- **CORS:** Configure for backend domain if needed

**Environment Variables Needed:**
```bash
# R2 Configuration for little-hero-orders bucket
R2_ORDERS_BUCKET_NAME=little-hero-orders
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_ACCOUNT_ID=your-cloudflare-account-id

# Public URL (if making manifests accessible via signed URLs)
R2_ORDERS_PUBLIC_URL=https://orders.your-domain.com  # Optional
```

---

### **3. Manifest File Specifications**

#### **2a-manifest.json** (From Workflow 2A)

**Purpose:** Complete record of pose generation results  
**Created By:** Workflow 2A  
**Read By:** Backend webhook, Workflow 2B, Admin dashboard

**Structure:**
```json
{
  "schema": "lhb.run-manifest@v2.0",
  "runStamp": "2025-10-29T14:32:10.123Z",
  "characterHash": "0ajc4j6vc7m8puagwyac",
  
  "order": {
    "orderId": "book-001-1730000000-abc123",
    "amazonOrderId": "ORDER-123",
    "childName": "Alex",
    "characterSpecs": { },
    "bookSpecs": { },
    "publicR2Url": "https://pub-xxx.r2.dev",
    "r2BucketName": "little-hero-assets"
  },
  
  "poses": {
    "total": 12,
    "approved": 10,
    "exhausted": 1,
    "retried": 3,
    "failed": 1,
    "needingReview": 2
  },
  
  "entries": [
    {
      "poseNumber": 1,
      "attempts": 0,
      "status": "approved",
      "approved": true,
      "approvedKey": "book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/pose01.png",
      "approvedFilename": "pose01.png",
      "publicUrl": "https://pub-xxx.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/pose01.png",
      "correlationId": "uuid",
      "qaScore": 0.95,
      "styleScore": 0.88,
      "needsReview": false,
      "reviewReason": null
    }
    // ... 11 more entries
  ],
  
  "reviewQueue": [ ],
  
  "summary": {
    "percentComplete": 83,
    "readyForBook": false,
    "needsHumanReview": true
  },
  
  "workflow": {
    "currentStage": "2A-complete",
    "nextWorkflow": "2B-retry",
    "requiresHumanReview": true
  },
  
  "generatedAt": "2025-10-29T14:32:15.456Z"
}
```

**File Size:** ~10-50 KB per manifest

---

#### **2b-manifest.json** (From Workflow 2B)

**Purpose:** Record of Bria background removal results  
**Created By:** Workflow 2B  
**Read By:** Backend webhook, Workflow 3, Admin dashboard

**Structure:** Extends 2A manifest with Bria results:
```json
{
  "schema": "lhb.run-manifest@v2.0",
  "runStamp": "2025-10-29T14:45:20.123Z",
  "characterHash": "0ajc4j6vc7m8puagwyac",
  
  "order": { /* same as 2A */ },
  "poses": { /* updated counts */ },
  
  "entries": [
    {
      "poseNumber": 1,
      
      // Original 2A data
      "status": "approved",
      "approvedKey": "book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/pose01.png",
      "publicUrl": "https://pub-xxx.r2.dev/.../pose01.png",
      "qaScore": 0.95,
      "styleScore": 0.88,
      
      // NEW: 2B Bria data
      "bgRemovedKey": "book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/pose01_nobg.png",
      "bgRemovedImageUrl": "https://pub-xxx.r2.dev/.../pose01_nobg.png",
      "briaRequestId": "bria-req-123",
      "briaStatus": "completed",
      "briaProcessingTimeMs": 3421
    }
    // ... 11 more entries
  ],
  
  "briaProcessing": {
    "totalProcessed": 12,
    "succeeded": 11,
    "failed": 1,
    "processingTimeMs": 45230,
    "completedAt": "2025-10-29T14:45:30.123Z"
  },
  
  "workflow": {
    "currentStage": "2B-complete",
    "nextWorkflow": "3-compile-book",
    "requiresHumanReview": false
  },
  
  "generatedAt": "2025-10-29T14:45:30.456Z"
}
```

---

#### **3-manifest.json** (From Workflow 3)

**Purpose:** Record of final book compilation  
**Created By:** Workflow 3  
**Read By:** Backend webhook, Admin dashboard, Fulfillment system

**Structure:** Extends 2B manifest with PDF results:
```json
{
  "schema": "lhb.run-manifest@v2.0",
  "runStamp": "2025-10-29T15:00:00.123Z",
  
  "order": { /* same */ },
  "poses": { /* same */ },
  "entries": [ /* same as 2B */ ],
  
  "bookCompilation": {
    "finalPdfUrl": "https://pub-xxx.r2.dev/.../final-book.pdf",
    "coverImageUrl": "https://pub-xxx.r2.dev/.../cover.png",
    "thumbnailUrl": "https://pub-xxx.r2.dev/.../thumbnail.png",
    "pageCount": 16,
    "fileSize": 15728640,
    "compilationTimeMs": 8234,
    "completedAt": "2025-10-29T15:00:08.123Z"
  },
  
  "workflow": {
    "currentStage": "3-complete",
    "nextWorkflow": "fulfillment",
    "requiresHumanReview": false
  },
  
  "generatedAt": "2025-10-29T15:00:08.456Z"
}
```

---

### **4. Metadata Files**

#### **order.json** (Order Details)

**Purpose:** Core order information from Workflow 1  
**Created By:** Workflow 1 or Backend  
**Updated By:** Backend (as order progresses)

```json
{
  "orderId": "book-001-1730000000-abc123",
  "amazonOrderId": "ORDER-123",
  "characterHash": "0ajc4j6vc7m8puagwyac",
  
  "customer": {
    "id": "cust-uuid",
    "email": "customer@example.com",
    "name": "Parent Name"
  },
  
  "character": {
    "childName": "Alex",
    "age": 4,
    "pronouns": "he/him",
    "hometown": "Seattle",
    "favoriteColor": "yellow",
    "animalGuide": "unicorn",
    "clothingStyle": "t-shirt and shorts"
  },
  
  "book": {
    "title": "Alex and the Adventure Compass",
    "totalPages": 16,
    "format": "8.5x8.5_softcover",
    "bookType": "animal-guide"
  },
  
  "workflow": {
    "currentStage": "2b_complete",
    "nextStage": "3_pending",
    "requiresReview": false
  },
  
  "manifests": {
    "2a": "book-mvp-simple-adventure/orders/book-001-1730000000-abc123/manifests/2a-manifest.json",
    "2b": "book-mvp-simple-adventure/orders/book-001-1730000000-abc123/manifests/2b-manifest.json",
    "3": null
  },
  
  "timestamps": {
    "orderReceived": "2025-10-29T14:00:00.000Z",
    "workflow1Complete": "2025-10-29T14:10:00.000Z",
    "workflow2aComplete": "2025-10-29T14:32:15.000Z",
    "workflow2bComplete": "2025-10-29T14:45:30.000Z",
    "workflow3Complete": null
  },
  
  "createdAt": "2025-10-29T14:00:00.000Z",
  "updatedAt": "2025-10-29T14:45:30.000Z"
}
```

---

#### **approvals.json** (Approval History)

**Purpose:** Track human review decisions  
**Created By:** Backend (when admin approves/rejects)  
**Updated By:** Backend (each approval action)

```json
{
  "orderId": "book-001-1730000000-abc123",
  "approvals": [
    {
      "stage": "preBria",
      "reviewType": "quality_check",
      "decision": "approved",
      "reviewedBy": "admin-user-id",
      "reviewedAt": "2025-10-29T14:35:00.000Z",
      "notes": "All poses look good, ready for Bria"
    },
    {
      "stage": "postBria",
      "reviewType": "bria_results",
      "decision": "approved",
      "reviewedBy": "admin-user-id",
      "reviewedAt": "2025-10-29T14:50:00.000Z",
      "notes": "Background removal successful"
    }
  ],
  "currentStage": "postBria",
  "lastReviewedAt": "2025-10-29T14:50:00.000Z"
}
```

---

## 🔄 Workflow Integration Points

### **When Workflow 2A Completes:**

```javascript
// Workflow 2A uploads manifest to little-hero-orders
const manifestPath = `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`;
await uploadToR2('little-hero-orders', manifestPath, manifest2A);

// Workflow 2A calls backend webhook with manifest URL
const manifestUrl = `https://orders-internal.your-domain.com/${manifestPath}`;
await fetch('https://backend/api/webhooks/workflow-2a-complete', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${BACKEND_API_TOKEN}`
  },
  body: JSON.stringify({
    orderId,
    manifestUrl,
    characterHash,
    posesGenerated: 12,
    needsReview: true
  })
});
```

### **When Workflow 2B Starts:**

```javascript
// Workflow 2B receives trigger from backend
const { orderId, manifestUrl } = triggerPayload;

// Workflow 2B downloads 2A manifest
const manifest2A = await fetch(manifestUrl).then(r => r.json());

// Workflow 2B processes poses...

// Workflow 2B uploads updated manifest
const manifest2BPath = `book-mvp-simple-adventure/orders/${orderId}/manifests/2b-manifest.json`;
await uploadToR2('little-hero-orders', manifest2BPath, manifest2B);
```

### **When Backend Receives Webhook:**

```javascript
// Backend downloads manifest to update database
const { manifestUrl } = webhookPayload;
const manifest = await fetch(manifestUrl).then(r => r.json());

// Backend updates Supabase from manifest data
await updateOrderFromManifest(orderId, manifest);
```

---

## ✅ Implementation Checklist

### **Phase 1: Bucket Setup (Your Team)**

- [ ] **Verify little-hero-orders bucket exists**
  - If not, create it in Cloudflare R2
  
- [ ] **Create initial folder structure**
  ```
  little-hero-orders/
    book-mvp-simple-adventure/
      orders/
        .gitkeep  (or create with first order)
  ```

- [ ] **Configure bucket access**
  - Set bucket to private (not public)
  - Generate R2 access credentials (if not already done)
  - Configure CORS if needed for backend access

- [ ] **Add environment variables to backend**
  ```bash
  R2_ORDERS_BUCKET_NAME=little-hero-orders
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_ACCOUNT_ID=...
  ```

- [ ] **Test R2 upload/download**
  - Test uploading a sample manifest
  - Test downloading manifest by URL
  - Verify folder structure is created correctly

---

### **Phase 2: Backend Integration (Your Team)**

- [ ] **Create R2 helper functions**
  ```typescript
  // Upload manifest to orders bucket
  async function uploadManifest(
    orderId: string, 
    stage: '2a' | '2b' | '3',
    manifest: object
  ): Promise<string> {
    const key = `book-mvp-simple-adventure/orders/${orderId}/manifests/${stage}-manifest.json`;
    await uploadToR2('little-hero-orders', key, manifest);
    return key;
  }
  
  // Download manifest from orders bucket
  async function downloadManifest(
    orderId: string,
    stage: '2a' | '2b' | '3'
  ): Promise<object> {
    const key = `book-mvp-simple-adventure/orders/${orderId}/manifests/${stage}-manifest.json`;
    return await downloadFromR2('little-hero-orders', key);
  }
  ```

- [ ] **Update webhook handlers to use manifests**
  - `/api/webhooks/workflow-2a-complete` downloads 2A manifest
  - `/api/webhooks/workflow-2b-complete` downloads 2B manifest
  - Update Supabase records from manifest data

- [ ] **Create order.json on order creation**
  - When Workflow 1 completes, create initial order.json
  - Store in `orders/{orderId}/metadata/order.json`

- [ ] **Create approvals.json on first approval**
  - When admin approves preBria stage, create approvals.json
  - Update on each subsequent approval

---

### **Phase 3: Workflow Updates (Workflow Team)**

- [ ] **Update Workflow 2A** (minimal change)
  - Change manifest upload path from character-centric to order-centric
  - Old: `little-hero-assets/.../characters/{characterHash}/manifest.json`
  - New: `little-hero-orders/book-mvp-simple-adventure/orders/{orderId}/manifests/2a-manifest.json`
  - ⚠️ **DO NOT change image upload paths** - images stay in character folders

- [ ] **Update Workflow 2B**
  - Add manifest download from little-hero-orders
  - Add manifest upload to little-hero-orders
  - Update webhook to include manifestUrl

- [ ] **Update Workflow 3** (future)
  - Download 2B manifest from little-hero-orders
  - Upload 3 manifest to little-hero-orders

---

## 📊 Testing Plan

### **Test Case 1: New Order Flow**

1. **Workflow 1** creates order, generates orderId
2. **Backend** creates `orders/{orderId}/metadata/order.json`
3. **Workflow 2A** generates poses, uploads to:
   - Images: `little-hero-assets/.../characters/{characterHash}/pose##.png`
   - Manifest: `little-hero-orders/.../orders/{orderId}/manifests/2a-manifest.json`
4. **Backend** downloads 2A manifest, updates Supabase
5. **Admin** approves, backend creates `approvals.json`
6. **Backend** triggers 2B with manifestUrl
7. **Workflow 2B** downloads 2A manifest, processes, uploads:
   - Images: `little-hero-assets/.../characters/{characterHash}/pose##_nobg.png`
   - Manifest: `little-hero-orders/.../orders/{orderId}/manifests/2b-manifest.json`
8. **Backend** downloads 2B manifest, updates Supabase

**Expected Result:**
```
little-hero-orders/
  book-mvp-simple-adventure/
    orders/
      book-001-test-abc123/
        manifests/
          2a-manifest.json  ✅
          2b-manifest.json  ✅
        metadata/
          order.json        ✅
          approvals.json    ✅
```

### **Test Case 2: Character Reuse**

1. Order 1 with character hash `0ajc4j6vc7m8puagwyac`
2. Order 2 with same character hash `0ajc4j6vc7m8puagwyac`

**Expected Result:**
- Images stored once in `little-hero-assets/.../characters/0ajc4j6vc7m8puagwyac/`
- Two separate manifest folders in `little-hero-orders`:
  - `orders/book-001-../manifests/`
  - `orders/book-002-../manifests/`

### **Test Case 3: Error Recovery**

1. Workflow 2B fails midway through processing
2. Backend should still have:
   - `2a-manifest.json` (complete)
   - `2b-manifest.json` (partial or missing)
3. Retry workflow should:
   - Download 2A manifest
   - Reprocess failed poses
   - Upload complete 2B manifest

---

## 🚨 Important Notes

### **⚠️ What NOT to Change:**

1. **DO NOT move existing images** from `little-hero-assets/order-generated-assets/characters/`
2. **DO NOT change Workflow 2A image upload logic** - only manifest location changes
3. **DO NOT modify character hash folder structure**
4. **DO NOT make little-hero-orders bucket public**

### **✅ What to Change:**

1. ✅ **DO** upload manifests to little-hero-orders (new location)
2. ✅ **DO** use order-based paths for manifests
3. ✅ **DO** keep bucket private with API access only
4. ✅ **DO** download manifests in webhooks for database updates

---

## 📞 Questions & Support

**Questions for Backend Team:**

1. Do you need signed URLs for manifest access, or is API-based access sufficient?
2. Should we implement manifest versioning (e.g., multiple 2B manifests if reprocessed)?
3. Do you want to store additional metadata files (logs, execution traces)?
4. Should we implement automatic cleanup of old manifests (retention policy)?
5. Do you need a manifest listing endpoint (GET /api/orders/{orderId}/manifests)?

**Next Steps:**

1. Review this document and confirm structure
2. Create little-hero-orders folder structure
3. Test R2 upload/download with sample manifests
4. Update backend to use new manifest locations
5. Coordinate with workflow team for 2A/2B updates

---

**Ready to proceed? Please confirm structure and let me know if any adjustments are needed!**

**— Workflow Integration Team**
