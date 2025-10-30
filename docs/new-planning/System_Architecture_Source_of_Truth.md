# Little Hero Books - System Architecture & Integration Source of Truth

**Document Version:** 1.0  
**Last Updated:** October 29, 2025  
**Purpose:** Comprehensive reference for system architecture, data flows, and integration patterns  
**Audience:** Development team, future maintainers, system architects

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Infrastructure & Storage](#infrastructure--storage)
4. [Workflow Orchestration](#workflow-orchestration)
5. [Data Models & Schemas](#data-models--schemas)
6. [Integration Patterns](#integration-patterns)
7. [Manifest System](#manifest-system)
8. [Security & Authentication](#security--authentication)
9. [Error Handling & Recovery](#error-handling--recovery)
10. [Monitoring & Observability](#monitoring--observability)

---

## 🎯 System Overview

### **Product Description**

Little Hero Books creates personalized children's books where the child becomes the main character. The system:
- Receives orders from Amazon
- Generates 12 custom character poses using AI
- Removes backgrounds using Bria API
- Compiles poses into a printed book
- Manages human-in-the-loop review at each stage
- Supports character reuse across multiple orders

### **High-Level System Flow**

```
Amazon Order
    ↓
Workflow 1: Order Preparation
    ↓
Backend: Create Order in Supabase
    ↓
Workflow 2A: Generate 12 Character Poses
    ↓
Backend: Update Database, Notify Admin
    ↓
Admin: Review & Approve (preBria)
    ↓
Backend: Trigger Workflow 2B
    ↓
Workflow 2B: Remove Backgrounds (Bria)
    ↓
Backend: Update Database, Notify Admin
    ↓
Admin: Review & Approve (postBria)
    ↓
Backend: Trigger Workflow 3
    ↓
Workflow 3: Compile Book PDF
    ↓
Backend: Update Database, Notify Admin
    ↓
Admin: Final Approval → Printing/Fulfillment
```

### **Tech Stack**

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend** | Next.js 15 (TypeScript) | API, admin dashboard, orchestration |
| **Database** | Supabase (PostgreSQL) | Order tracking, workflow state, approvals |
| **Storage** | Cloudflare R2 (S3-compatible) | Images, PDFs, manifests, assets |
| **Workflows** | n8n | Workflow automation, API orchestration |
| **AI Generation** | Recraft.ai / Flux | Character pose generation |
| **Background Removal** | Bria.ai API | Background removal processing |
| **Hosting** | Vercel (Backend), Cloudflare (n8n) | Application hosting |

---

## 🏗️ Architecture Principles

### **Core Design Decisions**

#### **1. Backend-Orchestrated Architecture**
- **Decision:** Backend controls all workflow triggers and routing
- **Rationale:** Centralized control, easier debugging, human-gated approvals
- **Impact:** Workflows are stateless, backend maintains state

#### **2. Supabase as Source of Truth**
- **Decision:** Database holds authoritative order state
- **Rationale:** ACID compliance, real-time queries, robust data integrity
- **Impact:** All components query/update Supabase, R2 is complementary

#### **3. Manifest-Based Workflow Communication**
- **Decision:** Workflows communicate via JSON manifests stored in R2
- **Rationale:** Decoupled workflows, debugging visibility, audit trail
- **Impact:** Each workflow reads previous manifest, adds data, uploads updated manifest

#### **4. Hybrid Storage Strategy**
- **Decision:** Images are character-centric, manifests are order-centric
- **Rationale:** Character reuse efficiency + order tracking convenience
- **Impact:** Two R2 buckets with different organizational strategies

#### **5. Human-Gated Workflow Progression**
- **Decision:** Admin approval required between major workflow stages
- **Rationale:** Quality control, error prevention, customer satisfaction
- **Impact:** Workflows don't auto-trigger, backend waits for approval

#### **6. Idempotent Workflows**
- **Decision:** Workflows can be safely retried without side effects
- **Rationale:** Network failures, API timeouts, partial completions
- **Impact:** Check for existing results before processing, use correlation IDs

---

## 🗄️ Infrastructure & Storage

### **R2 Bucket Architecture**

We use **two R2 buckets** with different organizational strategies:

#### **Bucket 1: little-hero-assets** (Public/Semi-Public)

**Purpose:** Static templates + Generated character images  
**Organization:** Character-centric (supports reuse)  
**Access:** Public URLs for customer-facing content

**Structure:**
```
little-hero-assets/
  book-mvp-simple-adventure/              ← Project namespace
    
    # Static Assets (Workflows read from here)
    pose-templates/
      pose_01_template.png
      pose_02_template.png
      ... (12 templates)
    
    background-images/
      forest_bg.png
      beach_bg.png
      mountain_bg.png
      ... (multiple backgrounds)
    
    overlay-files/
      sparkle_overlay.png
      frame_overlay.png
      ...
    
    # Generated Assets (Workflows write here)
    order-generated-assets/
      characters/
        {characterHash}/                   ← Character-specific folder
          pose01.png                      ← Original generated pose (2A)
          pose01_nobg.png                 ← Background removed (2B)
          pose02.png
          pose02_nobg.png
          ... (12 poses + 12 bg-removed)
```

**Example Real Path:**
```
little-hero-assets/
  book-mvp-simple-adventure/
    order-generated-assets/
      characters/
        0ajc4j6vc7m8puagwyac/
          pose01.png
          pose01_nobg.png
          pose02.png
          pose02_nobg.png
          ...
```

**File Naming Conventions:**
- **Original poses:** `pose{##}.png` (e.g., `pose01.png`, `pose12.png`)
- **Background-removed:** `pose{##}_nobg.png` (e.g., `pose01_nobg.png`)
- **Character hash format:** 16-character lowercase alphanumeric (e.g., `0ajc4j6vc7m8puagwyac`)

**Public URL Format:**
```
https://pub-{cloudflare-pub-id}.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/pose01.png
```

---

#### **Bucket 2: little-hero-orders** (Private)

**Purpose:** Order metadata + Workflow manifests + Admin data  
**Organization:** Order-centric (easier admin dashboard)  
**Access:** Backend API and n8n workflows only (private)

**Structure:**
```
little-hero-orders/
  book-mvp-simple-adventure/              ← Project namespace (matches assets bucket)
    orders/
      {orderId}/                          ← Individual order folder
        
        manifests/                        ← Workflow snapshots
          2a-manifest.json               ← From Workflow 2A (pose gen)
          2b-manifest.json               ← From Workflow 2B (Bria)
          3-manifest.json                ← From Workflow 3 (compilation)
        
        metadata/                         ← Order tracking
          order.json                     ← Core order details
          approvals.json                 ← Approval history
        
        logs/                             ← Optional: Execution logs
          2a-execution.log
          2b-execution.log
          3-execution.log
```

**Order ID Format:**
```
book-{sequence}-{timestamp}-{hash}

Examples:
- book-001-1730000000-abc123
- book-042-1730234567-def456
```

**Access Pattern:**
```javascript
// Backend and workflows use R2 API (not public URLs)
const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`;
const manifest = await downloadFromR2('little-hero-orders', manifestKey);
```

---

### **Why Two Buckets? Why Hybrid Organization?**

**Character-Centric Images (little-hero-assets):**
- ✅ **Reuse:** Multiple orders with same character share images
- ✅ **Storage efficiency:** Don't duplicate character poses
- ✅ **Cache-friendly:** CDN can cache character images
- ✅ **Logical grouping:** All poses for a character in one place

**Order-Centric Manifests (little-hero-orders):**
- ✅ **Admin convenience:** Find all order data by orderId
- ✅ **Workflow isolation:** Each order's workflow history is self-contained
- ✅ **Audit trail:** Complete record of order processing
- ✅ **Easier cleanup:** Delete entire order folder if needed

**Example: Two Orders, Same Character**

```
# Order 1: book-001-1730000000-abc123
# Order 2: book-042-1730234567-def456
# Both orders for character hash: 0ajc4j6vc7m8puagwyac

little-hero-assets/
  book-mvp-simple-adventure/
    order-generated-assets/
      characters/
        0ajc4j6vc7m8puagwyac/          ← SHARED by both orders
          pose01.png                   ← Generated once, used twice
          pose01_nobg.png              ← Processed once, used twice
          ...

little-hero-orders/
  book-mvp-simple-adventure/
    orders/
      book-001-1730000000-abc123/      ← Order 1 data
        manifests/
          2a-manifest.json
          2b-manifest.json
      book-042-1730234567-def456/      ← Order 2 data (separate)
        manifests/
          2a-manifest.json
          2b-manifest.json
```

Result: Images stored once, but each order has its own manifest/metadata.

---

### **Environment Variables**

#### **Backend Environment Variables**
```bash
# Supabase
SUPABASE_URL=https://mdnthwpcnphjnnblbvxk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Optional

# R2 Storage
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_ASSETS_BUCKET_NAME=little-hero-assets
R2_ORDERS_BUCKET_NAME=little-hero-orders
R2_PUBLIC_URL=https://pub-{id}.r2.dev

# n8n Integration
N8N_2B_WEBHOOK_URL=https://your-n8n.com/webhook/start-2b
N8N_3_WEBHOOK_URL=https://your-n8n.com/webhook/start-3
BACKEND_API_TOKEN=secret-token-for-n8n-auth  # Generate secure random token

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Application
BACKEND_URL=https://your-app.vercel.app
NODE_ENV=production
```

#### **n8n Environment Variables**
```bash
# Backend Integration
BACKEND_URL=https://your-app.vercel.app
BACKEND_API_TOKEN=secret-token-for-n8n-auth  # Same as backend
BACKEND_WEBHOOK_2A_COMPLETE=/api/webhooks/workflow-2a-complete
BACKEND_WEBHOOK_2B_COMPLETE=/api/webhooks/workflow-2b-complete
BACKEND_WEBHOOK_3_COMPLETE=/api/webhooks/workflow-3-complete

# R2 Storage
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_ASSETS_BUCKET_NAME=little-hero-assets
R2_ORDERS_BUCKET_NAME=little-hero-orders
R2_PUBLIC_URL=https://pub-{id}.r2.dev

# AI Services
RECRAFT_API_KEY=your-recraft-api-key
FLUX_API_KEY=your-flux-api-key  # If using Flux instead
BRIA_API_TOKEN=your-bria-api-token

# Supabase (for direct queries if needed)
SUPABASE_URL=https://mdnthwpcnphjnnblbvxk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🔄 Workflow Orchestration

### **Workflow Architecture Pattern**

All workflows follow the same pattern:

```
┌────────────────────────────────────────────────────────┐
│                    WORKFLOW PATTERN                     │
├────────────────────────────────────────────────────────┤
│                                                         │
│  1. Webhook Trigger (from Backend)                     │
│     ↓                                                   │
│  2. Download Previous Manifest (if not first workflow) │
│     ↓                                                   │
│  3. Validate Input Data                                │
│     ↓                                                   │
│  4. Process (AI, API calls, transformations)           │
│     ↓                                                   │
│  5. Upload Results to R2 (images, PDFs, etc.)          │
│     ↓                                                   │
│  6. Build/Update Manifest                              │
│     ↓                                                   │
│  7. Upload Manifest to R2                              │
│     ↓                                                   │
│  8. Call Backend Webhook with Results                  │
│                                                         │
└────────────────────────────────────────────────────────┘
```

---

### **Workflow 1: Order Preparation**

**Purpose:** Receive Amazon order, create initial order record  
**Trigger:** Amazon webhook or manual entry  
**Output:** Order created in Supabase, triggers Workflow 2A

**Key Responsibilities:**
- Parse Amazon order data
- Generate character hash from character specs
- Create order record in Supabase
- Create initial order.json in R2
- Trigger Workflow 2A

**Does NOT create manifest** (manifests start with 2A)

---

### **Workflow 2A: Pose Generation**

**Purpose:** Generate 12 character poses using AI  
**Trigger:** Workflow 1 completion or Backend trigger  
**Input:** Order details (from Workflow 1)  
**Output:** 12 character images + 2A manifest

**Detailed Flow:**

```
1. Receive Trigger
   - orderId
   - characterHash
   - character specs (name, age, appearance, etc.)
   - book specs (type, format, etc.)

2. For Each of 12 Poses:
   a. Load pose template
   b. Build AI prompt with character details
   c. Call Recraft/Flux API
   d. Download generated image
   e. Run QA checks (quality score, style score)
   f. If QA fails and attempts < 3: Retry
   g. If QA passes: Upload to R2
   h. Record result in pose entry

3. Build 2A Manifest
   - Schema: lhb.run-manifest@v2.0
   - Include all 12 pose entries
   - Mark poses as approved/exhausted/failed
   - Calculate summary stats
   - Identify poses needing review

4. Upload Manifest
   - Path: little-hero-orders/.../orders/{orderId}/manifests/2a-manifest.json

5. Call Backend Webhook
   - POST /api/webhooks/workflow-2a-complete
   - Include: orderId, manifestUrl, characterHash, needsReview
```

**R2 Uploads:**
```
little-hero-assets/
  book-mvp-simple-adventure/
    order-generated-assets/
      characters/
        {characterHash}/
          pose01.png  ← Generated here
          pose02.png
          ... (up to 12)

little-hero-orders/
  book-mvp-simple-adventure/
    orders/
      {orderId}/
        manifests/
          2a-manifest.json  ← Manifest uploaded here
```

**Retry Logic:**
- QA threshold: quality_score ≥ 0.7 AND style_score ≥ 0.7
- Max retries per pose: 3 attempts
- If exhausted: Mark pose as "exhausted", flag for review
- Workflow continues even if some poses fail

**Error Handling:**
- Individual pose failures don't stop workflow
- Failed poses marked in manifest
- Backend notified to queue for human review

---

### **Workflow 2B: Background Removal**

**Purpose:** Remove backgrounds from approved poses using Bria  
**Trigger:** Backend (when admin approves preBria stage)  
**Input:** 2A manifest URL from backend trigger  
**Output:** 12 background-removed images + 2B manifest

**Detailed Flow:**

```
1. Receive Trigger from Backend
   - orderId
   - characterHash
   - manifestUrl (2A manifest)
   - posesToProcess (optional, defaults to all approved)
   - webhookUrl (backend callback)

2. Download 2A Manifest
   - Fetch from manifestUrl
   - Validate schema version
   - Extract approved poses list

3. For Each Approved Pose:
   a. Read original image URL from manifest
   b. Download original image from R2
   c. Call Bria API for background removal
   d. Poll Bria status until complete (or timeout)
   e. Download result from Bria
   f. Upload to R2 with _nobg suffix
   g. Update pose entry with Bria results

4. Build 2B Manifest
   - Start with 2A manifest structure
   - Add bgRemovedKey and bgRemovedImageUrl to each entry
   - Add briaRequestId and briaStatus
   - Add briaProcessing summary section
   - Update workflow section

5. Upload 2B Manifest
   - Path: little-hero-orders/.../orders/{orderId}/manifests/2b-manifest.json

6. Call Backend Webhook
   - POST /api/webhooks/workflow-2b-complete
   - Include: orderId, manifestUrl (2B), characterHash, posesProcessed, posesFailed
```

**R2 Uploads:**
```
little-hero-assets/
  book-mvp-simple-adventure/
    order-generated-assets/
      characters/
        {characterHash}/
          pose01.png       ← Already exists (from 2A)
          pose01_nobg.png  ← Generated here (2B)
          pose02.png
          pose02_nobg.png  ← Generated here (2B)
          ... (12 nobg images)

little-hero-orders/
  book-mvp-simple-adventure/
    orders/
      {orderId}/
        manifests/
          2a-manifest.json  ← Already exists
          2b-manifest.json  ← Manifest uploaded here
```

**Bria API Integration:**
```javascript
// Call Bria API
const response = await fetch('https://engine.prod.bria-api.com/v1/background/remove', {
  method: 'POST',
  headers: {
    'api_token': process.env.BRIA_API_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    file_url: originalImageUrl,
    output_type: 'url'
  })
});

// Poll for result
const { request_id } = await response.json();
let result;
do {
  await sleep(2000);  // Poll every 2 seconds
  const statusResponse = await fetch(`https://engine.prod.bria-api.com/v1/results/${request_id}`, {
    headers: { 'api_token': process.env.BRIA_API_TOKEN }
  });
  result = await statusResponse.json();
} while (result.status === 'pending');

// Download result
const bgRemovedUrl = result.result_url;
```

**Error Handling:**
- Bria API failures marked in manifest entry
- Failed poses don't stop processing of other poses
- Manifest includes all results (success + failures)
- Backend queues failed poses for review

---

### **Workflow 3: Book Compilation**

**Purpose:** Compile final book PDF from background-removed poses  
**Trigger:** Backend (when admin approves postBria stage)  
**Input:** 2B manifest URL from backend trigger  
**Output:** Final book PDF + cover image + 3 manifest

**Key Responsibilities:**
- Download 2B manifest
- Download all background-removed images
- Overlay text, graphics, page numbers
- Compile into multi-page PDF
- Generate cover image and thumbnail
- Upload PDF and images to R2
- Create 3 manifest
- Call backend webhook

*(Full implementation details to be added as Workflow 3 is developed)*

---

## 💾 Data Models & Schemas

### **Supabase Database Schema**

#### **Table: orders**

**Purpose:** Track each book order through the entire workflow

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  amazon_order_id VARCHAR(100) UNIQUE NOT NULL,
  character_hash VARCHAR(16) NOT NULL,
  
  -- Order details
  customer_id UUID,  -- FK to customers table
  character_specs JSONB NOT NULL,
  book_specs JSONB NOT NULL,
  
  -- Workflow tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Values: 'pending', '2a_processing', '2a_review', '2b_processing', 
    --         '2b_review', '3_processing', '3_review', 'complete', 'failed'
  workflow_step VARCHAR(50),
    -- Values: 'order_received', 'ai_generation', 'bria_processing', 
    --         'book_compilation', 'printing', 'shipped'
  next_workflow VARCHAR(50),
    -- Values: '2a', '2b-retry', '3-compile-book', 'fulfillment'
  
  -- Review tracking
  requires_human_review BOOLEAN DEFAULT FALSE,
  human_approved BOOLEAN DEFAULT FALSE,
  
  -- Manifest URLs
  manifest_2a_url TEXT,
  manifest_2b_url TEXT,
  manifest_3_url TEXT,
  
  -- Final outputs
  final_book_url TEXT,
  cover_image_url TEXT,
  thumbnail_url TEXT,
  
  -- Cost tracking
  generation_cost_usd DECIMAL(10, 4),
  bria_cost_usd DECIMAL(10, 4),
  total_cost_usd DECIMAL(10, 4),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_character_hash ON orders(character_hash);
CREATE INDEX idx_orders_amazon_order_id ON orders(amazon_order_id);
```

**Example Row:**
```json
{
  "id": 1,
  "amazon_order_id": "ORDER-123-ABC",
  "character_hash": "0ajc4j6vc7m8puagwyac",
  "customer_id": "uuid-...",
  "character_specs": {
    "childName": "Alex",
    "age": 4,
    "pronouns": "he/him",
    "hometown": "Seattle",
    "favoriteColor": "yellow",
    "animalGuide": "unicorn",
    "clothingStyle": "t-shirt and shorts"
  },
  "book_specs": {
    "title": "Alex and the Adventure Compass",
    "totalPages": 16,
    "format": "8.5x8.5_softcover",
    "bookType": "animal-guide"
  },
  "status": "2b_review",
  "workflow_step": "bria_processing",
  "next_workflow": "3-compile-book",
  "requires_human_review": false,
  "human_approved": false,
  "manifest_2a_url": "book-mvp.../orders/book-001.../manifests/2a-manifest.json",
  "manifest_2b_url": "book-mvp.../orders/book-001.../manifests/2b-manifest.json",
  "manifest_3_url": null,
  "created_at": "2025-10-29T14:00:00Z",
  "updated_at": "2025-10-29T14:45:30Z"
}
```

---

#### **Table: character_generations**

**Purpose:** Track individual pose generation and processing

```sql
CREATE TABLE character_generations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pose_number INTEGER NOT NULL CHECK (pose_number BETWEEN 1 AND 12),
  
  -- Generation tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Values: 'pending', 'generating', 'generated', 'approved', 'failed', 
    --         'needs_review', 'processing', 'processed'
  
  -- Image URLs
  original_image_url TEXT,          -- From 2A (pose with background)
  background_removed_url TEXT,      -- From 2B (pose without background)
  final_image_url TEXT,             -- From 3 (pose in final book layout)
  
  -- Quality metrics (from 2A)
  quality_score DECIMAL(3, 2),      -- 0.00 to 1.00
  consistency_score DECIMAL(3, 2),
  character_match_score DECIMAL(3, 2),
  
  -- Bria tracking (from 2B)
  bria_request_id VARCHAR(100),
  bria_status VARCHAR(50),
  
  -- Review flags
  needs_manual_review BOOLEAN DEFAULT FALSE,
  manual_review_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(order_id, pose_number)
);

CREATE INDEX idx_character_generations_order_id ON character_generations(order_id);
CREATE INDEX idx_character_generations_needs_review 
  ON character_generations(needs_manual_review) 
  WHERE needs_manual_review = TRUE;
```

**Example Row:**
```json
{
  "id": 1,
  "order_id": 1,
  "pose_number": 1,
  "status": "processed",
  "original_image_url": "https://pub-xxx.r2.dev/.../characters/0ajc4j6vc7m8puagwyac/pose01.png",
  "background_removed_url": "https://pub-xxx.r2.dev/.../characters/0ajc4j6vc7m8puagwyac/pose01_nobg.png",
  "final_image_url": null,
  "quality_score": 0.95,
  "consistency_score": 0.88,
  "character_match_score": 0.92,
  "bria_request_id": "bria-req-123456",
  "bria_status": "completed",
  "needs_manual_review": false,
  "manual_review_reason": null,
  "retry_count": 0,
  "created_at": "2025-10-29T14:20:00Z",
  "updated_at": "2025-10-29T14:45:15Z"
}
```

---

#### **Table: human_review_queue**

**Purpose:** Manage human review workflow and approvals

```sql
CREATE TABLE human_review_queue (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Review details
  review_type VARCHAR(50) NOT NULL,
    -- Values: 'quality_check', 'bria_results', 'final_book', 
    --         'manual_approval', 'error_resolution'
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Values: 'pending', 'in_progress', 'approved', 'rejected', 'escalated'
  review_priority VARCHAR(20) DEFAULT 'normal',
    -- Values: 'low', 'normal', 'high', 'urgent'
  
  -- Review content
  review_notes TEXT,
  decision VARCHAR(50),
    -- Values: 'approve', 'reject', 'request_changes', 'escalate'
  rejection_reason TEXT,
  
  -- Assignment
  assigned_to UUID,  -- FK to admin_users
  assigned_at TIMESTAMP,
  reviewed_by UUID,  -- FK to admin_users
  reviewed_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_human_review_queue_status ON human_review_queue(status);
CREATE INDEX idx_human_review_queue_priority ON human_review_queue(review_priority);
CREATE INDEX idx_human_review_queue_assigned_to ON human_review_queue(assigned_to);
```

---

#### **Table: audit_logs**

**Purpose:** Complete audit trail of all system actions

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Action details
  action VARCHAR(100) NOT NULL,
    -- Examples: 'order_created', 'workflow_2a_complete', 'admin_approved', 
    --           'status_changed', 'manifest_uploaded'
  workflow_step VARCHAR(50),
  
  -- Actor
  performed_by VARCHAR(100),  -- 'system', 'admin-uuid', 'workflow_2a', etc.
  system_component VARCHAR(50),  -- 'backend', 'workflow_2a', 'workflow_2b', etc.
  
  -- Changes
  previous_state JSONB,
  new_state JSONB,
  details JSONB,  -- Flexible field for additional context
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_order_id ON audit_logs(order_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

---

### **Character Hash Generation**

**Purpose:** Create unique identifier for character specs to enable reuse

**Algorithm:**
```javascript
function generateCharacterHash(characterSpecs) {
  const {
    childName,
    age,
    pronouns,
    hometown,
    favoriteColor,
    animalGuide,
    clothingStyle,
    skinTone,
    hairColor,
    hairStyle
  } = characterSpecs;
  
  // Normalize inputs
  const normalized = {
    childName: childName.toLowerCase().trim(),
    age: parseInt(age),
    pronouns: pronouns.toLowerCase().trim(),
    hometown: hometown.toLowerCase().trim(),
    favoriteColor: favoriteColor.toLowerCase().trim(),
    animalGuide: animalGuide.toLowerCase().trim(),
    clothingStyle: clothingStyle.toLowerCase().trim(),
    skinTone: skinTone?.toLowerCase().trim() || '',
    hairColor: hairColor?.toLowerCase().trim() || '',
    hairStyle: hairStyle?.toLowerCase().trim() || ''
  };
  
  // Create canonical string
  const canonical = JSON.stringify(normalized, Object.keys(normalized).sort());
  
  // Hash using crypto
  const hash = crypto
    .createHash('sha256')
    .update(canonical)
    .digest('hex')
    .substring(0, 16);  // First 16 characters
  
  return hash;
}

// Example output: "0ajc4j6vc7m8puagwyac"
```

**Character Reuse Logic:**
```javascript
// When processing new order:
const characterHash = generateCharacterHash(order.characterSpecs);

// Check if character already exists
const existingOrder = await supabase
  .from('orders')
  .select('id, manifest_2a_url, manifest_2b_url')
  .eq('character_hash', characterHash)
  .eq('status', 'complete')  // Only reuse from completed orders
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (existingOrder) {
  // Character exists! Reuse images from R2
  console.log('Reusing character images from:', characterHash);
  
  // Images are already in:
  // little-hero-assets/.../characters/{characterHash}/pose##.png
  // little-hero-assets/.../characters/{characterHash}/pose##_nobg.png
  
  // Skip Workflow 2A and 2B, go directly to Workflow 3
} else {
  // New character, run full pipeline
  console.log('New character, running full generation');
}
```

---

## 🔗 Integration Patterns

### **Webhook Communication**

All workflows communicate with backend via webhooks:

#### **Pattern: Workflow → Backend Webhook**

**Request Format:**
```javascript
// Workflow calls backend webhook
const response = await fetch(`${BACKEND_URL}/api/webhooks/workflow-${stage}-complete`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${BACKEND_API_TOKEN}`
  },
  body: JSON.stringify({
    orderId: 'book-001-...',
    manifestUrl: 'https://.../.../manifests/2a-manifest.json',
    characterHash: '0ajc4j6vc7m8puagwyac',
    // Stage-specific fields...
    posesGenerated: 12,
    needsReview: true
  })
});

if (!response.ok) {
  throw new Error(`Webhook failed: ${response.status}`);
}

const result = await response.json();
// { success: true, orderId: '...', message: '...' }
```

**Backend Handler Pattern:**
```typescript
// app/api/webhooks/workflow-2a-complete/route.ts
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.BACKEND_API_TOKEN}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse payload
    const { orderId, manifestUrl, characterHash } = await request.json();

    // 3. Download manifest from R2
    const manifest = await downloadFromR2(manifestUrl);

    // 4. Update Supabase
    await updateOrderFromManifest(orderId, manifest);

    // 5. Add to review queue if needed
    if (manifest.workflow.requiresHumanReview) {
      await addToReviewQueue(orderId, 'quality_check');
    }

    // 6. Log audit event
    await logAuditEvent(orderId, 'workflow_2a_complete', manifest);

    // 7. Send notifications
    await sendSlackNotification(`Order ${orderId} ready for review`);

    return NextResponse.json({ success: true, orderId });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

#### **Pattern: Backend → Workflow Trigger**

**Request Format:**
```javascript
// Backend triggers workflow
const response = await fetch(N8N_WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    trigger: 'manual_review',  // or 'auto_trigger'
    orderId: 'book-001-...',
    characterHash: '0ajc4j6vc7m8puagwyac',
    manifestUrl: 'https://.../.../manifests/2a-manifest.json',
    posesToProcess: undefined,  // null/undefined = process all
    webhookUrl: `${BACKEND_URL}/api/webhooks/workflow-2b-complete`,
    context: {
      approvedBy: adminUserId,
      approvedAt: new Date().toISOString()
    }
  })
});

if (!response.ok) {
  throw new Error(`Failed to trigger workflow: ${response.status}`);
}
```

**n8n Workflow Trigger:**
```
[Webhook Trigger Node]
    ↓
[Parse Trigger Data]
    ↓
[Validate Inputs]
    ↓
[Download Manifest from manifestUrl]
    ↓
... continue workflow
```

---

### **Manifest Passing Pattern**

**Key Principle:** Manifests are always passed via R2 URLs, never in request payloads

**Why?**
- ✅ Manifests can be large (10-50KB)
- ✅ R2 provides durable storage
- ✅ Manifests available for debugging/audit
- ✅ No payload size limits

**Flow:**
```
Workflow 2A
  ↓
Uploads manifest to R2
  ↓
Calls backend webhook with manifestUrl
  ↓
Backend downloads manifest from R2
  ↓
Backend updates database
  ↓
Backend triggers Workflow 2B with manifestUrl
  ↓
Workflow 2B downloads manifest from R2
  ↓
... continues
```

**Code Pattern:**
```javascript
// Workflow uploads manifest
const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`;
await uploadToR2('little-hero-orders', manifestKey, manifest);

// Construct public/internal URL
const manifestUrl = `https://internal-r2-access.com/${manifestKey}`;
// Or use signed URL if needed

// Pass URL to backend
await callBackendWebhook({
  orderId,
  manifestUrl,  // ← URL, not manifest object
  ...
});

// Backend downloads manifest
const manifest = await fetch(manifestUrl).then(r => r.json());
```

---

## 📄 Manifest System

### **Manifest Schema v2.0**

All manifests use the same schema version for compatibility:

```json
{
  "schema": "lhb.run-manifest@v2.0",
  "runStamp": "2025-10-29T14:32:10.123Z",
  "characterHash": "0ajc4j6vc7m8puagwyac",
  
  "order": {
    "orderId": "book-001-1730000000-abc123",
    "amazonOrderId": "ORDER-123",
    "childName": "Alex",
    "characterSpecs": { /* complete specs */ },
    "bookSpecs": { /* complete specs */ },
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
  
  "entries": [ /* array of 12 pose entries */ ],
  "reviewQueue": [ /* poses needing review */ ],
  
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

### **Pose Entry Structure (Evolves Across Workflows)**

**After Workflow 2A:**
```json
{
  "poseNumber": 1,
  "attempts": 0,
  "status": "approved",
  "approved": true,
  "approvedKey": "book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/pose01.png",
  "approvedFilename": "pose01.png",
  "publicUrl": "https://pub-xxx.r2.dev/.../pose01.png",
  "correlationId": "uuid",
  "qaScore": 0.95,
  "styleScore": 0.88,
  "needsReview": false,
  "reviewReason": null
}
```

**After Workflow 2B (adds Bria fields):**
```json
{
  "poseNumber": 1,
  
  // 2A fields (unchanged)
  "status": "approved",
  "approvedKey": "book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/pose01.png",
  "publicUrl": "https://pub-xxx.r2.dev/.../pose01.png",
  "qaScore": 0.95,
  "styleScore": 0.88,
  
  // NEW 2B fields
  "bgRemovedKey": "book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/pose01_nobg.png",
  "bgRemovedImageUrl": "https://pub-xxx.r2.dev/.../pose01_nobg.png",
  "briaRequestId": "bria-req-123456",
  "briaStatus": "completed",
  "briaProcessingTimeMs": 3421
}
```

**After Workflow 3 (adds compilation fields):**
```json
{
  "poseNumber": 1,
  
  // 2A + 2B fields (unchanged)
  "approvedKey": "...",
  "bgRemovedKey": "...",
  "publicUrl": "...",
  "bgRemovedImageUrl": "...",
  
  // NEW 3 fields
  "usedInBook": true,
  "bookPageNumber": 3,
  "finalCompositeUrl": "https://pub-xxx.r2.dev/.../page03.png"
}
```

**Design Principle:** Each workflow adds fields without removing previous ones. This creates a complete audit trail.

---

### **Manifest Evolution Across Workflows**

```
2A Manifest
  ├── Original generation data
  ├── QA scores
  └── Pose URLs (with background)

2B Manifest (extends 2A)
  ├── All 2A data
  ├── Background-removed URLs
  ├── Bria request IDs
  └── Processing metrics

3 Manifest (extends 2B)
  ├── All 2A + 2B data
  ├── Book layout details
  ├── Final PDF URL
  └── Compilation metrics
```

---

## 🔐 Security & Authentication

### **Authentication Methods**

#### **Backend ↔ n8n Webhooks**

**Method:** Bearer Token  
**Format:** `Authorization: Bearer {BACKEND_API_TOKEN}`

**Token Generation:**
```javascript
// Generate secure random token (do once, store in env vars)
const crypto = require('crypto');
const token = crypto.randomBytes(32).toString('hex');
console.log(token);
// Example: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"

// Store in both backend and n8n environment variables:
// BACKEND_API_TOKEN=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Verification:**
```typescript
// Backend endpoint
const authHeader = request.headers.get('authorization');
const expectedAuth = `Bearer ${process.env.BACKEND_API_TOKEN}`;

if (authHeader !== expectedAuth) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

#### **R2 Access**

**Method:** AWS Signature V4  
**Library:** `@aws-sdk/client-s3`

```javascript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});
```

#### **Supabase Access**

**Method:** Service Role Key (server-side only)  
**Library:** `@supabase/supabase-js`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // NEVER expose to client!
);
```

---

### **Security Best Practices**

1. ✅ **Never expose service keys to client-side code**
2. ✅ **Use environment variables for all secrets**
3. ✅ **Rotate tokens periodically (every 90 days)**
4. ✅ **Use HTTPS only for all API communication**
5. ✅ **Validate all webhook signatures**
6. ✅ **Log all authentication failures**
7. ✅ **Implement rate limiting on webhook endpoints**
8. ✅ **Use separate credentials for dev/staging/production**

---

## 🚨 Error Handling & Recovery

### **Error Categories**

#### **1. Network/API Errors**

**Examples:** Timeouts, 429 rate limits, 503 unavailable

**Strategy:** Retry with exponential backoff

```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.min(1000 * (2 ** i), 10000);  // Cap at 10s
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
  }
}

// Usage
const result = await retryWithBackoff(() => 
  fetch('https://api.bria.com/...', { ... })
);
```

#### **2. Data Validation Errors**

**Examples:** Missing fields, invalid formats, schema mismatches

**Strategy:** Fail fast with clear error messages

```javascript
function validateManifest(manifest) {
  if (manifest.schema !== 'lhb.run-manifest@v2.0') {
    throw new Error(`Invalid manifest schema: ${manifest.schema}`);
  }
  
  if (!manifest.characterHash || manifest.characterHash.length !== 16) {
    throw new Error(`Invalid characterHash: ${manifest.characterHash}`);
  }
  
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== 12) {
    throw new Error(`Expected 12 poses, got ${manifest.entries.length}`);
  }
  
  // All validation passed
  return true;
}
```

#### **3. Partial Failures**

**Examples:** Some poses succeed, others fail

**Strategy:** Continue processing, mark failures in manifest

```javascript
// In Workflow 2B
const results = [];

for (const pose of approvedPoses) {
  try {
    const bgRemovedImage = await processPoseWithBria(pose);
    results.push({
      poseNumber: pose.poseNumber,
      status: 'success',
      bgRemovedUrl: bgRemovedImage.url
    });
  } catch (error) {
    console.error(`Pose ${pose.poseNumber} failed:`, error);
    results.push({
      poseNumber: pose.poseNumber,
      status: 'failed',
      error: error.message,
      needsReview: true
    });
  }
}

// Upload manifest with all results (success + failures)
await uploadManifest(orderId, '2b', {
  ...manifest,
  entries: results,
  workflow: {
    currentStage: '2B-complete',
    requiresHumanReview: results.some(r => r.status === 'failed')
  }
});
```

#### **4. Workflow Timeout/Abandonment**

**Examples:** Workflow hangs, n8n restarts, network disconnects

**Strategy:** Database status tracking + automatic cleanup

```sql
-- Find abandoned workflows (stuck in processing for > 1 hour)
SELECT id, amazon_order_id, status, updated_at
FROM orders
WHERE status IN ('2a_processing', '2b_processing', '3_processing')
  AND updated_at < NOW() - INTERVAL '1 hour';

-- Cleanup job (runs every hour)
UPDATE orders
SET status = 'failed',
    workflow_step = workflow_step || '_timeout',
    requires_human_review = TRUE
WHERE status IN ('2a_processing', '2b_processing', '3_processing')
  AND updated_at < NOW() - INTERVAL '1 hour';
```

---

### **Recovery Patterns**

#### **Idempotent Retry**

Workflows should check for existing results before reprocessing:

```javascript
// In Workflow 2A - check if pose already exists
const existingKey = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/pose${poseNum}.png`;

try {
  await headObject(R2_ASSETS_BUCKET, existingKey);
  console.log(`Pose ${poseNum} already exists, skipping generation`);
  return { existing: true, url: constructPublicUrl(existingKey) };
} catch (error) {
  if (error.code === 'NotFound') {
    // Pose doesn't exist, generate it
    return await generatePose(poseNum, characterSpecs);
  }
  throw error;
}
```

#### **Manual Intervention Points**

Some failures require human intervention:

```javascript
// In backend webhook handler
if (manifest.workflow.requiresHumanReview) {
  // Add to review queue
  await supabase
    .from('human_review_queue')
    .insert({
      order_id: orderId,
      review_type: 'error_resolution',
      status: 'pending',
      review_notes: `${failedCount} poses failed processing`
    });
  
  // Notify admin
  await sendSlackNotification(
    `⚠️ Order ${orderId} needs manual review - ${failedCount} poses failed`
  );
  
  // Pause workflow progression
  await supabase
    .from('orders')
    .update({
      status: '2b_review',
      requires_human_review: true,
      next_workflow: null  // Don't auto-trigger next workflow
    })
    .eq('id', orderId);
}
```

#### **Admin Dashboard Actions**

Admin can take these actions on failed orders:

1. **Retry Individual Poses:** Re-run specific poses that failed
2. **Retry Entire Workflow:** Restart from Workflow 2A/2B/3
3. **Manual Upload:** Replace failed poses with manually edited images
4. **Skip Workflow:** Move to next stage with current results
5. **Cancel Order:** Mark as failed, refund customer

---

## 📊 Monitoring & Observability

### **Key Metrics to Track**

#### **Workflow Performance**
- Workflow execution time (2A, 2B, 3)
- Success rate per workflow
- Retry rate per pose
- Average QA scores

#### **System Health**
- R2 upload/download latency
- Supabase query performance
- Webhook delivery success rate
- API failure rates (Bria, Recraft/Flux)

#### **Business Metrics**
- Orders in each stage
- Average time from order to completion
- Manual review queue length
- Cost per order (generation + Bria + storage)

### **Logging Standards**

**Structured Logging Format:**
```javascript
// Good logging
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  workflow: '2b',
  orderId: 'book-001-...',
  action: 'pose_processing',
  poseNumber: 3,
  duration: 3421,
  result: 'success'
}));

// Bad logging
console.log('Processed pose 3'); // Not enough context
```

**Log Levels:**
- **ERROR:** Failures requiring attention
- **WARN:** Retries, degraded performance
- **INFO:** Normal operations, workflow steps
- **DEBUG:** Detailed internal state (dev only)

---

## 📚 Appendix

### **Glossary of Terms**

| Term | Definition |
|------|------------|
| **Character Hash** | Unique 16-char identifier for character specs, enables reuse |
| **Manifest** | JSON file capturing complete workflow state and results |
| **Pose** | Single character illustration (12 per book) |
| **QA Score** | Quality assessment score from AI generation (0-1) |
| **Style Score** | Consistency score with book style (0-1) |
| **Bria Request ID** | Unique identifier for background removal job |
| **Review Queue** | List of orders/poses needing human approval |
| **Character-centric** | Storage organized by character hash |
| **Order-centric** | Storage organized by order ID |

### **Common orderId Formats**

```
book-{seq}-{timestamp}-{hash}

Examples:
- book-001-1730000000-abc123
- book-042-1730234567-def456
- book-100-1730345678-xyz789
```

### **Common characterHash Examples**

```
16-character lowercase alphanumeric:
- 0ajc4j6vc7m8puagwyac
- 1dde0fac84943088
- a3f7c2e1b9d04512
```

### **Quick Reference: Key Environment Variables**

```bash
# Backend
SUPABASE_URL=https://mdnthwpcnphjnnblbvxk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...
BACKEND_API_TOKEN=a1b2c3...
N8N_2B_WEBHOOK_URL=https://...

# n8n
BACKEND_URL=https://...
BACKEND_API_TOKEN=a1b2c3...  (same as backend)
BRIA_API_TOKEN=bria-...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

---

## 🔄 Document Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-10-29 | 1.0 | Initial comprehensive document | Workflow Integration Agent |

---

**End of Source of Truth Document**

*This document should be updated whenever architectural decisions change or new patterns are established.*
