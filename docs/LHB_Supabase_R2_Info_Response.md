# Little Hero Labs — Supabase & R2 Information Response

**Date:** 2025-01-09  
**Responding To:** LHB_Supabase_R2_Info_Request.md  
**Status:** Complete

---

## 1) Supabase — Configuration Details

### 1.1 Project & Auth

- **Project REST URL:** `https://mdnthwpcnphjnnblbvxk.supabase.co`
- **Service Role Key (server key):** 
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs
  ```
  > **Note:** This is the full service role key. It bypasses RLS restrictions. Store securely in n8n credentials only.

### 1.2 Tables & Columns (Orders workflow)

- **Table name:** `orders` ✅ (confirmed)

- **Current Schema Structure:**
  The actual `orders` table in our Supabase database uses this structure (from `docs/database/little-hero-books-schema.sql`):

  ```sql
  CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      amazon_order_id VARCHAR(50) UNIQUE NOT NULL,
      processing_id VARCHAR(100) UNIQUE,
      
      -- Order Status & Workflow Tracking
      status VARCHAR(50) DEFAULT 'pending_validation',
      workflow_step VARCHAR(50) DEFAULT 'order_intake',
      next_workflow VARCHAR(50),
      
      -- Amazon Order Data
      order_status VARCHAR(20),
      purchase_date TIMESTAMP,
      order_total DECIMAL(10,2),
      currency VARCHAR(3) DEFAULT 'USD',
      marketplace_id VARCHAR(20),
      
      -- Customer Information
      customer_email VARCHAR(255),
      customer_name VARCHAR(255),
      shipping_address JSONB,
      
      -- Character Specifications
      character_specs JSONB,
      character_hash VARCHAR(16),
      
      -- Product Information
      product_info JSONB,
      
      -- Processing Metadata
      priority VARCHAR(20) DEFAULT 'normal',
      estimated_processing_time VARCHAR(50),
      
      -- Timestamps
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      queued_at TIMESTAMP,
      validated_at TIMESTAMP,
      
      -- Validation & Quality
      validation_errors JSONB DEFAULT '[]',
      quality_score DECIMAL(3,2),
      requires_human_review BOOLEAN DEFAULT FALSE,
      human_approved BOOLEAN DEFAULT NULL,
      human_reviewed_at TIMESTAMP,
      human_reviewer VARCHAR(100),
      qa_notes TEXT,
      
      -- File URLs & Storage
      final_book_url TEXT,
      cover_image_url TEXT,
      thumbnail_url TEXT,
      
      -- Manifest URLs (added via migration)
      manifest_2a_url TEXT,
      manifest_2b_url TEXT,
      manifest_3_url TEXT
  );
  ```

- **Schema Alignment with Your Request:**
  
  **✅ Columns that exist:**
  - `id` — `SERIAL` (PK) ✅
  - `amazon_order_id` — `VARCHAR(50)` UNIQUE ✅
  - `next_workflow` — `VARCHAR(50)` ✅
  - `queued_at` — `TIMESTAMP` ✅
  - `priority` — `VARCHAR(20)` (not `int`, but can be used for priority) ✅
  
  **⚠️ Columns that need to be added:**
  - `execution_status` — **NOT CURRENTLY IN SCHEMA** (needs migration)
  - `started_at` — **NOT CURRENTLY IN SCHEMA** (needs migration)
  - `current_workflow` — **NOT CURRENTLY IN SCHEMA** (needs migration)
  - `one_manifest_url` — **NOT CURRENTLY IN SCHEMA** (we have `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url` instead)
  - `twoa_manifest_url` — **EXISTS as `manifest_2a_url`** ✅
  - `twob_manifest_url` — **EXISTS as `manifest_2b_url`** ✅
  - `dedication_text` — **NOT CURRENTLY IN SCHEMA** (needs migration or use `character_specs->>'dedication'`)

- **Recommended Migration:**
  ```sql
  -- Add missing columns for W0/W1.1 workflow
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) DEFAULT 'ready_for_processing';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_workflow VARCHAR(50);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS one_manifest_url TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS dedication_text TEXT;
  
  -- Create index for execution_status queries
  CREATE INDEX IF NOT EXISTS idx_orders_execution_status ON orders(execution_status, priority DESC NULLS LAST, queued_at ASC);
  
  -- Partial index for ready_for_processing (optimization)
  CREATE INDEX IF NOT EXISTS idx_orders_ready_for_processing 
    ON orders(priority DESC NULLS LAST, queued_at ASC) 
    WHERE execution_status = 'ready_for_processing';
  ```

- **Column Mapping Notes:**
  - `priority`: Currently `VARCHAR(20)` with values like `'normal'`, `'high'`, `'urgent'`. For numeric sorting, you may want to add a computed column or use a CASE statement.
  - `one_manifest_url`: We can use this for the 1-manifest URL. Our existing `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url` are for later workflow stages.
  - `dedication_text`: Can be extracted from `character_specs` JSONB or added as a dedicated column.

### 1.3 Row Level Security (RLS)

- **Is RLS enabled on `orders`?** **Yes** ✅
- **Service Role Key Bypass:** ✅ **Confirmed** — The service role key bypasses RLS restrictions. The policy is:
  ```sql
  CREATE POLICY "Service role can manage orders" ON orders
  FOR ALL USING (auth.role() = 'service_role');
  ```
- **Headers Required:** Use the service role key in both `apikey` and `Authorization: Bearer` headers (see 1.5).

### 1.4 RPCs or Pure PostgREST

- **RPC for queue metrics:** ❌ **Not currently implemented**
  - We can create `get_queue_status()` if needed, or use PostgREST queries

- **RPC for atomic claim of orders:** ❌ **Not currently implemented**
  - **Recommendation:** Use PostgREST conditional PATCH (as you suggested) for now
  - We can create `claim_orders(limit int)` RPC if you prefer atomic operations

- **PostgREST Queries (Confirmed Acceptable):**
  
  **Fetch ready orders:**
  ```
  GET /rest/v1/orders?execution_status=eq.ready_for_processing&order=priority.desc,queued_at.asc&limit={slots}
  Headers:
    apikey: {serviceKey}
    Authorization: Bearer {serviceKey}
  ```
  
  **Mark as processing (conditional):**
  ```
  PATCH /rest/v1/orders?id=eq.{id}&execution_status=eq.ready_for_processing
  Headers:
    apikey: {serviceKey}
    Authorization: Bearer {serviceKey}
    Prefer: return=representation
  Body:
    {
      "execution_status": "processing",
      "started_at": "2025-01-09T17:00:00.000Z",
      "current_workflow": "3"
    }
  ```

### 1.5 Headers & Limits

- **Confirmed Headers for All Supabase Calls:**
  ```
  apikey: {serviceKey}
  Authorization: Bearer {serviceKey}
  Prefer: return=representation  (for PATCH/POST that return rows)
  Content-Type: application/json  (for POST/PATCH with body)
  ```

- **Rate Limits:** 
  - Supabase free tier: 500 requests/second
  - No specific limits documented for our usage level
  - **Recommendation:** Add retry logic with exponential backoff for production

### 1.6 Sample Row (for reference)

**Current Schema Sample:**
```json
{
  "id": 1,
  "amazon_order_id": "TEST-ORDER-020",
  "status": "queued_for_processing",
  "workflow_step": "order_intake",
  "next_workflow": "2A",
  "priority": "normal",
  "queued_at": "2025-01-09T17:00:00.000Z",
  "created_at": "2025-01-09T16:55:00.000Z",
  "character_specs": {
    "childName": "Avery",
    "dedication": "To Avery\nDream big!\nLove, Mom & Dad"
  },
  "manifest_2a_url": null,
  "manifest_2b_url": null,
  "manifest_3_url": null
}
```

**After Migration (with new columns):**
```json
{
  "id": 1,
  "amazon_order_id": "TEST-ORDER-020",
  "execution_status": "ready_for_processing",
  "priority": 0,
  "queued_at": "2025-01-09T17:00:00.000Z",
  "started_at": null,
  "next_workflow": "3",
  "current_workflow": null,
  "one_manifest_url": "https://admin.littleherolabs.com/api/r2/signed-url?key=book-mvp-simple-adventure/orders/TEST-ORDER-020/manifests/1-manifest.json&bucket=little-hero-orders&expiresIn=600",
  "dedication_text": "To Avery\nDream big!\nLove, Mom & Dad"
}
```

---

## 2) Cloudflare R2 — Public vs. Signed URLs

### 2.1 Current Status: **PRIVATE (Signed URLs Required)**

**⚠️ Important:** The `little-hero-orders` bucket is **private** and requires **signed URLs** for access. We have implemented a backend API endpoint for generating signed URLs.

### 2.2 Integration Pattern: **B) Backend Service Returns Pre-signed URLs**

**Endpoint:**
```
POST https://admin.littleherolabs.com/api/r2/signed-url
```

**Request:**
```json
GET /api/r2/signed-url?key={r2Key}&bucket={bucketName}&expiresIn={seconds}
```

**Query Parameters:**
- `key` (required): R2 object key (e.g., `book-mvp-simple-adventure/orders/TEST-ORDER-020/manifests/1-manifest.json`)
- `bucket` (optional): Bucket name (defaults to `little-hero-assets`, use `little-hero-orders` for manifests)
- `expiresIn` (optional): Expiration in seconds (default: 3600, range: 60-604800)

**Headers Required:**
```
Authorization: Bearer {BACKEND_API_TOKEN}
```

**Response Shape:**
```json
{
  "url": "https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}?X-Amz-Algorithm=...&X-Amz-Expires=600&...",
  "expiresIn": 600,
  "bucket": "little-hero-orders",
  "key": "book-mvp-simple-adventure/orders/TEST-ORDER-020/manifests/1-manifest.json",
  "generatedAt": "2025-01-09T17:00:00.000Z"
}
```

**Auth:**
- **Header:** `Authorization: Bearer {BACKEND_API_TOKEN}`
- **Token:** Will be provided separately (out of band, via password manager)
- **Rate Limits:** No specific limits, but recommend caching signed URLs for at least 5 minutes

**Alternative: Direct S3-Style Presigning in n8n (Pattern A)**

If you prefer n8n to generate signed URLs directly (without backend call), you can use:

- **Access Key ID:** `{R2_ACCESS_KEY_ID}` (from n8n env vars)
- **Secret Access Key:** `{R2_SECRET_ACCESS_KEY}` (from n8n env vars)
- **S3 Endpoint:** `https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
- **Region:** `auto`
- **URL Style:** Path-style (required for R2): `https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}`
- **TTL:** 10 minutes (600 seconds) recommended for manifests
- **Key Prefix Restrictions:** None (bucket policies not configured)

**Implementation in n8n (Pattern A):**
```javascript
// In n8n Code node, using aws4fetch or similar
const { AwsClient } = require('aws4fetch');
const client = new AwsClient({
  accessKeyId: $env.R2_ACCESS_KEY_ID,
  secretAccessKey: $env.R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

const accountId = $env.CLOUDFLARE_ACCOUNT_ID;
const bucket = 'little-hero-orders';
const key = `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`;
const url = new URL(`https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`);
url.searchParams.set('X-Amz-Expires', '600');

const signedRequest = await client.sign(
  new Request(url.toString(), { method: 'GET' }),
  { aws: { signQuery: true } }
);

return { json: { signedUrl: signedRequest.url } };
```

**Recommendation:** Use **Pattern B (Backend API)** for consistency and centralized auth, but **Pattern A** is also viable if you prefer n8n-native signing.

### 2.3 Test Artifact

**Test URL (Signed, expires in 10 minutes):**
```
GET https://admin.littleherolabs.com/api/r2/signed-url?key=book-mvp-simple-adventure/orders/TEST-ORDER-020/manifests/1-manifest.json&bucket=little-hero-orders&expiresIn=600
Authorization: Bearer {BACKEND_API_TOKEN}
```

**Expected Response:**
```json
{
  "url": "https://little-hero-orders.{account_id}.r2.cloudflarestorage.com/book-mvp-simple-adventure/orders/TEST-ORDER-020/manifests/1-manifest.json?X-Amz-Algorithm=...",
  "expiresIn": 600,
  "bucket": "little-hero-orders",
  "key": "book-mvp-simple-adventure/orders/TEST-ORDER-020/manifests/1-manifest.json",
  "generatedAt": "2025-01-09T17:00:00.000Z"
}
```

**Note:** The signed URL will be valid for 10 minutes. If you need a longer TTL for testing, increase `expiresIn` (max: 604800 seconds = 1 week).

---

## 3) Required Database Migration

To fully support W0 and W1.1 workflows, the following migration is needed:

```sql
-- Add execution_status column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) DEFAULT 'ready_for_processing';

-- Add started_at column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

-- Add current_workflow column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_workflow VARCHAR(50);

-- Add one_manifest_url column (for 1-manifest from W0)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS one_manifest_url TEXT;

-- Add dedication_text column (extracted from character_specs for easier access)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dedication_text TEXT;

-- Create index for execution_status queries (optimized for W1.1 router)
CREATE INDEX IF NOT EXISTS idx_orders_execution_status_priority_queued 
  ON orders(execution_status, priority DESC NULLS LAST, queued_at ASC);

-- Create partial index for ready_for_processing (faster queries)
CREATE INDEX IF NOT EXISTS idx_orders_ready_for_processing 
  ON orders(priority DESC NULLS LAST, queued_at ASC) 
  WHERE execution_status = 'ready_for_processing';

-- Add helpful comments
COMMENT ON COLUMN orders.execution_status IS 'Order execution status: ready_for_processing, processing, done, error';
COMMENT ON COLUMN orders.started_at IS 'Timestamp when order started processing (set when execution_status changes to processing)';
COMMENT ON COLUMN orders.current_workflow IS 'Currently executing workflow (2A, 2B, 3, etc.)';
COMMENT ON COLUMN orders.one_manifest_url IS 'URL to 1-manifest.json (from Workflow 0)';
COMMENT ON COLUMN orders.dedication_text IS 'Dedication text from order (extracted from character_specs for easier access)';
```

**Migration File Location:** This migration can be saved as `database/migration-w0-w1-support.sql`

---

## 4) Summary Checklist

### Supabase ✅
- **REST URL:** `https://mdnthwpcnphjnnblbvxk.supabase.co`
- **Service Role Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (full key provided above)
- **Table name:** `orders` ✅
- **Columns different from request:** 
  - Need to add: `execution_status`, `started_at`, `current_workflow`, `one_manifest_url`, `dedication_text`
  - Existing: `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url` (for later workflows)
- **Indexes:** Need to add index on `(execution_status, priority DESC, queued_at ASC)` and partial index for `ready_for_processing`
- **RLS enabled:** Yes, but service role key bypasses it ✅
- **RPCs available:** Not currently, but PostgREST queries are acceptable ✅
- **Rate limits:** 500 req/sec (free tier), no specific limits for our usage

### R2 ✅
- **Signing Pattern:** **B) Backend presign service** (recommended)
  - **Endpoint:** `GET https://admin.littleherolabs.com/api/r2/signed-url`
  - **Request:** Query params: `key`, `bucket`, `expiresIn`
  - **Response:** `{ url, expiresIn, bucket, key, generatedAt }`
  - **Auth:** `Authorization: Bearer {BACKEND_API_TOKEN}`
  - **TTL:** 600 seconds (10 minutes) recommended, max 604800 (1 week)
- **Alternative Pattern A:** Direct S3-style presigning in n8n (details provided above)

### Test URL ✅
- **Endpoint:** `GET https://admin.littleherolabs.com/api/r2/signed-url?key=book-mvp-simple-adventure/orders/TEST-ORDER-020/manifests/1-manifest.json&bucket=little-hero-orders&expiresIn=600`
- **Auth:** `Authorization: Bearer {BACKEND_API_TOKEN}` (will be provided separately)
- **Response:** Signed URL valid for 10 minutes

---

## 5) Next Steps

1. **Run Database Migration:** Execute the migration SQL above to add missing columns
2. **Get BACKEND_API_TOKEN:** Will be provided separately (out of band) for the signed URL endpoint
3. **Test Supabase Connection:** Verify PostgREST queries work with service role key
4. **Test Signed URL Endpoint:** Verify signed URL generation works for 1-manifest.json
5. **Update W0:** Use new columns (`execution_status`, `one_manifest_url`, `dedication_text`)
6. **Update W1.1:** Use PostgREST queries with `execution_status` filtering

---

## 6) Questions or Clarifications Needed

1. **Priority Field:** Should we convert `priority` from `VARCHAR(20)` to `INTEGER` for numeric sorting, or use a CASE statement in queries?
2. **Dedication Text:** Should we extract from `character_specs->>'dedication'` or add as a dedicated column?
3. **RPC Functions:** Do you want us to create `get_queue_status()` and `claim_orders(limit int)` RPCs, or use PostgREST queries?
4. **Signed URL Pattern:** Do you prefer Pattern A (n8n direct) or Pattern B (backend API)?

---

**Document Status:** Ready for review and implementation  
**Contact:** If any information is missing or incorrect, please let us know and we'll update this document.

