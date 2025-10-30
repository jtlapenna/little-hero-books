# Workflow 2B Integration - Coordination Document
**Date:** October 29, 2025  
**Purpose:** Align Workflow 2B redesign with existing backend, Supabase, and workflow infrastructure  
**For:** Agent working on Backend, Supabase, and Workflows 1, 3, 4+

---

## 📋 Executive Summary

I'm redesigning **Workflow 2B** (Bria background removal) to integrate with the updated **Workflow 2A** (pose generation with manifest system). Before finalizing the 2B implementation, I need to ensure alignment with:

1. **Existing Supabase schema** (orders, poses, characters)
2. **Backend API endpoints** (webhooks, triggers, status updates)
3. **Workflow 1 outputs** (what does 2A receive from Workflow 1?)
4. **Workflow 3 inputs** (what does Workflow 3 expect from 2B?)
5. **Data flow patterns** already established in other workflows

---

## 🎯 My Recommended Architecture

### **High-Level Flow**

```
Customer Order → Amazon
    ↓
[Workflow 1] Prepare Order
    ↓
Backend creates order in Supabase
    ↓
[Workflow 2A] Generate 12 Poses
    ↓
Uploads manifest to R2
    ↓
Calls backend webhook: "2A Complete"
    ↓
Backend updates DB from manifest
    ↓
Admin reviews poses in dashboard
    ↓
Admin clicks "Approve & Send to Bria"
    ↓
Backend calls Workflow 2B webhook
    ↓
[Workflow 2B] Process via Bria
    ↓
Uploads updated manifest to R2
    ↓
Calls backend webhook: "2B Complete"
    ↓
Backend updates DB from manifest
    ↓
Admin reviews Bria results
    ↓
Admin clicks "Approve & Compile Book"
    ↓
Backend calls Workflow 3 webhook
    ↓
[Workflow 3] Compile Book
    ↓
... continue to printing/fulfillment
```

### **Key Principles**

1. **Backend-Orchestrated:** Backend controls workflow triggers and routing
2. **Supabase = Source of Truth:** Database holds authoritative state
3. **Manifests = Rich Snapshots:** R2 manifests are complete records for debugging
4. **Human-Gated:** Admin approval required at each stage
5. **Webhook-Driven:** Workflows notify backend via webhooks when complete

---

## ❓ Critical Questions About Existing Infrastructure

### **1. Supabase Schema**

**Question:** What's your current Supabase schema for orders and poses?

**I'm Recommending:**
```sql
-- Table: orders
id (uuid, PK)
amazon_order_id (text, unique)
character_hash (text, FK to characters.character_hash)
customer_id (uuid, FK to customers.id)
current_stage (enum: 'workflow_1_pending', '2a_pending', '2a_review', '2b_pending', '2b_review', '3_pending', '3_review', 'printing', 'shipped', 'complete')
manifest_2a_url (text)  -- Link to R2 manifest from 2A
manifest_2b_url (text)  -- Link to R2 manifest from 2B
manifest_3_url (text)   -- Link to R2 manifest from 3
created_at (timestamp)
updated_at (timestamp)

-- Table: order_poses
id (uuid, PK)
order_id (uuid, FK to orders.id)
pose_number (int)
stage_2a_status (enum: 'pending', 'generating', 'approved', 'rejected', 'needs_review', 'failed')
stage_2a_image_url (text)  -- Original generated pose
stage_2a_qa_score (float)
stage_2a_style_score (float)
stage_2b_status (enum: 'pending', 'processing', 'approved', 'rejected', 'needs_review', 'failed')
stage_2b_image_url (text)  -- Background-removed pose
stage_2b_bria_request_id (text)
needs_manual_review (boolean)
manual_review_reason (text)
retry_count (int)
created_at (timestamp)
updated_at (timestamp)

-- Table: characters
id (uuid, PK)
character_hash (text, unique)  -- Stable hash for reuse
customer_id (uuid, FK to customers.id)
specs (jsonb)  -- { childName, age, skinTone, hairColor, etc. }
created_at (timestamp)
```

**Does this align with what you've built?**
- If different, please share your schema
- What additional fields do you have?
- Are you using different naming conventions?

---

### **2. Backend Webhook Endpoints**

**Question:** What webhook endpoints exist for workflow completion?

**I'm Assuming:**
```
POST /api/webhooks/workflow-1-complete
  - Receives: Order details from Amazon
  - Updates: Order status to '2a_pending'
  - Triggers: Workflow 2A

POST /api/webhooks/workflow-2a-complete
  - Receives: { orderId, manifestUrl, characterHash, posesGenerated, needsReview }
  - Updates: Order status to '2a_review'
  - Notifications: Admin dashboard + Slack alert

POST /api/webhooks/workflow-2b-complete
  - Receives: { orderId, manifestUrl, posesProcessed, needsReview }
  - Updates: Order status to '2b_review'
  - Notifications: Admin dashboard

POST /api/webhooks/workflow-3-complete
  - Receives: { orderId, bookUrl, ... }
  - Updates: Order status to '3_review'
```

**Please Confirm:**
- Are these endpoints already built?
- What's the actual URL structure?
- What authentication do webhooks use? (Bearer token? API key? HMAC signature?)
- What should n8n send in webhook headers?

---

### **3. Workflow Trigger Endpoints**

**Question:** How does backend trigger n8n workflows?

**I'm Assuming:**
```
Backend → POST to n8n webhook URLs:
  - /webhook/start-2a
  - /webhook/start-2b
  - /webhook/start-3
```

**Please Confirm:**
- Are you using n8n webhooks for triggers?
- Or are you using the n8n API to start workflows?
- What authentication is required?
- What payload format do you send?

**For Workflow 2B specifically, I need:**
```json
POST /webhook/start-2b
{
  "orderId": "uuid",
  "characterHash": "abc123...",
  "manifestUrl": "https://pub-xxx.r2.dev/.../2a-manifest.json",
  "posesToProcess": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  "webhookUrl": "https://your-backend.com/api/webhooks/workflow-2b-complete",
  "context": {
    "approvedBy": "admin_user_id",
    "approvedAt": "2025-10-29T..."
  }
}
```

**Is this payload structure acceptable?**
- What additional fields do you need?
- Should I include the full order object?
- How should I handle authentication tokens?

---

### **4. Manifest Structure from 2A**

**Question:** What does the 2A manifest currently look like?

**I've Designed This Structure (v2.0):**
```json
{
  "schema": "lhb.run-manifest@v2.0",
  "runStamp": "2025-10-29T14:32:10.123Z",
  "characterHash": "abc123...",
  
  "order": {
    "amazonOrderId": "ORDER-123",
    "childName": "Alex",
    "characterSpecs": { /* ... */ },
    "bookSpecs": { /* ... */ },
    "publicR2Url": "https://pub-xxx.r2.dev",
    "r2BucketName": "little-hero-assets"
  },
  
  "poses": {
    "total": 12,
    "approved": 10,
    "exhausted": 1,
    "retried": 3,
    "failed": 0,
    "needingReview": 2
  },
  
  "entries": [
    {
      "poseNumber": 1,
      "attempts": 0,
      "status": "approved",
      "approved": true,
      "approvedKey": "characters/abc123.../pose01.png",
      "approvedFilename": "pose01.png",
      "publicUrl": "https://pub-xxx.r2.dev/...",
      "correlationId": "uuid",
      "qaScore": 0.95,
      "styleScore": 0.88,
      "needsReview": false,
      "reviewReason": null,
      "qaNotes": { /* optional */ },
      "retryHistory": [ /* optional */ ]
    },
    // ... 11 more entries
  ],
  
  "reviewQueue": [
    {
      "poseNumber": 4,
      "reason": "Exhausted retry attempts",
      "publicUrl": "...",
      "qaScore": 0.62,
      "attempts": 3
    }
  ],
  
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

**Please Confirm:**
- Does this align with what Workflow 2A currently outputs?
- Are there fields I'm missing that Workflow 1 provides?
- Should I add/remove/rename any fields?

---

### **5. What Does Workflow 3 Expect?**

**Question:** What input does Workflow 3 need from 2B?

**I'm Planning 2B to Output:**
```json
{
  "schema": "lhb.run-manifest@v2.0",
  "runStamp": "2025-10-29T14:45:20.123Z",
  "characterHash": "abc123...",
  
  "order": { /* same as 2A */ },
  
  "poses": {
    "total": 12,
    "processed": 12,
    "succeeded": 11,
    "failed": 1,
    "needingReview": 1
  },
  
  "entries": [
    {
      "poseNumber": 1,
      "status": "approved",
      
      // From 2A
      "originalImageUrl": "https://.../pose01.png",
      "originalImageKey": "characters/abc123.../pose01.png",
      
      // From 2B
      "bgRemovedImageUrl": "https://.../pose01_nobg.png",
      "bgRemovedImageKey": "characters/abc123.../pose01_nobg.png",
      "briaRequestId": "bria-request-id",
      "briaProcessedAt": "2025-10-29T14:40:10.123Z",
      
      "needsReview": false
    },
    // ... 11 more
  ],
  
  "reviewQueue": [ /* any that failed Bria */ ],
  
  "summary": {
    "readyForBookCompilation": true,
    "needsHumanReview": true  // if any failed
  },
  
  "workflow": {
    "currentStage": "2B-complete",
    "nextWorkflow": "3-book-compilation",
    "requiresHumanReview": true
  }
}
```

**Does Workflow 3 need:**
- Both original AND background-removed image URLs?
- Just the background-removed URLs?
- Any additional metadata about Bria processing?
- Character specs and book specs (or does it fetch from manifest)?

---

### **6. Character Hash Generation**

**Question:** How is `characterHash` currently generated?

**I'm Recommending:**
```javascript
// Stable hash based on appearance traits
function generateCharacterHash(specs) {
  const stableTraits = {
    skinTone: specs.skinTone,
    hairColor: specs.hairColor,
    hairStyle: specs.hairStyle,
    age: specs.age,
    gender: specs.gender
  };
  
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableTraits))
    .digest('hex')
    .substring(0, 16); // "abc123def456..."
}
```

**Reasoning:** Same character → same hash → can reuse across multiple book orders

**Please Confirm:**
- Is this how it works currently?
- Or is characterHash unique per order?
- Is characterHash generated in Workflow 1, 2A, or backend?

---

### **7. R2 Storage Structure**

**Question:** What's the current R2 folder structure?

**I'm Assuming:**
```
/book-mvp-simple-adventure/order-generated-assets/
  ├─ characters/
  │   ├─ {characterHash}/
  │   │   ├─ orders/
  │   │   │   ├─ {orderId}/
  │   │   │   │   ├─ 2a-manifest.json
  │   │   │   │   ├─ 2b-manifest.json
  │   │   │   │   ├─ 3-manifest.json
  │   │   │   │   ├─ poses/
  │   │   │   │   │   ├─ pose01.png
  │   │   │   │   │   ├─ pose01_nobg.png
  │   │   │   │   │   ├─ pose02.png
  │   │   │   │   │   ├─ ...
```

**OR:**
```
/book-mvp-simple-adventure/order-generated-assets/
  ├─ characters/
  │   ├─ {characterHash}/
  │   │   ├─ pose01.png
  │   │   ├─ pose01_nobg.png
  │   │   ├─ pose02.png
  │   │   ├─ ...
  │   │   ├─ run-manifest.json  (latest)
  ├─ runs/
  │   ├─ {timestamp}/
  │   │   ├─ run-manifest.json  (historical)
```

**Please Clarify:**
- What's the actual folder structure?
- Where should manifests be stored?
- Should we keep historical manifests or just latest?
- How should background-removed images be named?
  - `pose01_nobg.png`?
  - `pose01-bg-removed.png`?
  - Separate folder like `/nobg/pose01.png`?

---

### **8. Admin Dashboard Status**

**Question:** What order statuses does the admin dashboard currently support?

**I Need to Know:**
- What are the possible values for `orders.current_stage`?
- How does the dashboard display "needs review" states?
- Are there separate "approve" buttons for 2A and 2B stages?
- Can admin see individual pose statuses, or just order-level status?

**For My Implementation:**
I need to update `current_stage` to these values:
- `2a_review` → When 2A completes and needs approval
- `2b_pending` → When admin triggers 2B
- `2b_processing` → While 2B is running
- `2b_review` → When 2B completes and needs approval

**Do these match your enum values?**

---

### **9. Error Handling & Notifications**

**Question:** How are errors currently handled in other workflows?

**I Need to Know:**
- When a workflow fails, does it:
  - Call an error webhook?
  - Update order status in DB directly?
  - Send notification to Slack/email?
- What error information should be stored?
  - Just error message?
  - Full stack trace?
  - Retry history?

**For 2B Specifically:**
If Bria processing fails for a pose after max retries:
```json
{
  "poseNumber": 7,
  "status": "failed",
  "error": "Bria API timeout after 5 attempts",
  "needsManualReview": true,
  "briaRequestId": "last-attempt-id",
  "retryHistory": [
    { "attempt": 1, "error": "timeout", "timestamp": "..." },
    { "attempt": 2, "error": "timeout", "timestamp": "..." },
    // ...
  ]
}
```

**Should I:**
1. Call error webhook with partial results?
2. Flag pose in manifest as failed?
3. Continue processing other poses?
4. Send Slack notification immediately?

---

### **10. Workflow 1 → 2A Data Flow**

**Question:** What data does Workflow 1 provide to 2A?

**I Need to Know:**
- Does Workflow 1 pass data via webhook payload?
- Or does 2A read from Supabase using `orderId`?
- What fields are available at the start of 2A?

**Expected Fields for 2A:**
```json
{
  "orderId": "uuid",
  "amazonOrderId": "ORDER-123",
  "characterHash": "abc123..." (if already generated),
  "characterSpecs": {
    "childName": "Alex",
    "age": 4,
    "skinTone": "medium",
    "hairColor": "black",
    "hairStyle": "short",
    // ... other appearance traits
  },
  "bookSpecs": {
    "title": "Alex's Adventure",
    "format": "8.5x8.5_softcover",
    "totalPages": 16
  },
  "poses": [
    { "poseNumber": 1, "description": "standing confidently" },
    { "poseNumber": 2, "description": "jumping with joy" },
    // ... 10 more poses
  ]
}
```

**Does 2A currently receive this?**
- If different, please share the actual structure
- Is characterHash generated in Workflow 1 or 2A?
- Are pose descriptions provided, or hardcoded in 2A?

---

### **11. Authentication Between Services**

**Question:** How are n8n ↔ Backend calls authenticated?

**I Need to Know:**
- **n8n → Backend webhooks:**
  - API key in header?
  - Bearer token?
  - HMAC signature?
  - No auth (private network)?

- **Backend → n8n webhooks:**
  - n8n webhook URLs are public?
  - Protected by secret path?
  - Additional authentication required?

**My Recommendation:**
```javascript
// n8n → Backend
headers: {
  'Authorization': `Bearer ${process.env.BACKEND_API_TOKEN}`,
  'X-Workflow-Signature': generateHMAC(payload)
}

// Backend → n8n
POST https://n8n-instance.com/webhook/{secret-path}/start-2b
headers: {
  'Content-Type': 'application/json'
}
```

**Does this match your setup?**

---

### **12. Real-Time Updates (Optional)**

**Question:** Do you need real-time progress updates during 2B processing?

**Scenario:**
Admin is on dashboard, watching as 2B processes 12 poses. Should they see:
- **Simple:** Just "Processing..." until complete
- **Detailed:** "Processing pose 1/12... Processing pose 2/12..." etc.

**If Detailed Updates Needed:**
I can have 2B call backend webhook after each pose:
```json
POST /api/webhooks/workflow-2b-progress
{
  "orderId": "uuid",
  "poseNumber": 3,
  "status": "completed",
  "imageUrl": "https://..."
}
```

**Your preference:**
- Simple (just start + complete webhooks)?
- Detailed (progress webhooks for each pose)?

---

## 💡 Recommendations & Suggestions

Based on the requirements shared, here are my recommendations:

### **1. Implement Backend Webhook Handler for 2A**

**Purpose:** Sync Supabase DB when 2A completes

**Pseudo-code:**
```javascript
// POST /api/webhooks/workflow-2a-complete
export async function handle2AComplete(req, res) {
  const { orderId, manifestUrl, characterHash } = req.body;
  
  try {
    // 1. Download manifest from R2
    const manifest = await downloadFromR2(manifestUrl);
    
    // 2. Start transaction
    const tx = await db.transaction();
    
    // 3. Update order
    await tx.update('orders', orderId, {
      character_hash: characterHash,
      current_stage: '2a_review',
      manifest_2a_url: manifestUrl
    });
    
    // 4. Upsert character (if new)
    await tx.upsert('characters', {
      character_hash: characterHash,
      specs: manifest.order.characterSpecs
    });
    
    // 5. Insert/update poses
    for (const entry of manifest.entries) {
      await tx.upsert('order_poses', {
        order_id: orderId,
        pose_number: entry.poseNumber,
        stage_2a_status: entry.status,
        stage_2a_image_url: entry.publicUrl,
        stage_2a_qa_score: entry.qaScore,
        stage_2a_style_score: entry.styleScore,
        needs_manual_review: entry.needsReview
      });
    }
    
    // 6. Commit
    await tx.commit();
    
    // 7. Notify admin
    if (manifest.workflow.requiresHumanReview) {
      await sendSlackNotification(`Order ${orderId} needs review`);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    await tx?.rollback();
    console.error('Failed to process 2A webhook:', error);
    res.status(500).json({ error: error.message });
  }
}
```

**Can you implement something like this?**

---

### **2. Backend Trigger for 2B**

**Purpose:** Admin clicks "Send to Bria" → Backend triggers 2B

**Pseudo-code:**
```javascript
// POST /api/orders/:orderId/trigger-bria
export async function triggerBriaProcessing(req, res) {
  const { orderId } = req.params;
  const { approvedPoses } = req.body; // Optional: specific poses
  
  try {
    // 1. Fetch order from DB
    const order = await db.getOrder(orderId);
    
    // 2. Get manifest from R2
    const manifest = await downloadFromR2(order.manifest_2a_url);
    
    // 3. Determine which poses to process
    const posesToProcess = approvedPoses || 
      manifest.entries
        .filter(e => e.status === 'approved')
        .map(e => e.poseNumber);
    
    // 4. Update order status
    await db.update('orders', orderId, {
      current_stage: '2b_pending'
    });
    
    // 5. Call n8n webhook
    const response = await fetch(process.env.N8N_2B_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        characterHash: order.character_hash,
        manifestUrl: order.manifest_2a_url,
        posesToProcess,
        webhookUrl: `${process.env.BACKEND_URL}/api/webhooks/workflow-2b-complete`,
        context: {
          approvedBy: req.user.id,
          approvedAt: new Date().toISOString()
        }
      })
    });
    
    res.json({ success: true, workflowTriggered: true });
    
  } catch (error) {
    console.error('Failed to trigger 2B:', error);
    res.status(500).json({ error: error.message });
  }
}
```

**Is this approach feasible with your setup?**

---

### **3. Implement Backend Webhook Handler for 2B**

**Purpose:** Update DB when 2B completes

**Pseudo-code:**
```javascript
// POST /api/webhooks/workflow-2b-complete
export async function handle2BComplete(req, res) {
  const { orderId, manifestUrl, posesProcessed, posesFailed } = req.body;
  
  try {
    // 1. Download updated manifest
    const manifest = await downloadFromR2(manifestUrl);
    
    // 2. Start transaction
    const tx = await db.transaction();
    
    // 3. Update order
    await tx.update('orders', orderId, {
      current_stage: '2b_review',
      manifest_2b_url: manifestUrl
    });
    
    // 4. Update poses with Bria results
    for (const entry of manifest.entries) {
      await tx.update('order_poses', {
        where: { order_id: orderId, pose_number: entry.poseNumber },
        data: {
          stage_2b_status: entry.status,
          stage_2b_image_url: entry.bgRemovedImageUrl,
          stage_2b_bria_request_id: entry.briaRequestId,
          needs_manual_review: entry.needsReview
        }
      });
    }
    
    // 5. Commit
    await tx.commit();
    
    // 6. Notify admin
    if (manifest.workflow.requiresHumanReview) {
      await sendSlackNotification(
        `Order ${orderId} Bria processing complete - ${posesFailed} poses need review`
      );
    }
    
    res.json({ success: true });
    
  } catch (error) {
    await tx?.rollback();
    console.error('Failed to process 2B webhook:', error);
    res.status(500).json({ error: error.message });
  }
}
```

**Similar pattern to 2A webhook - does this work for you?**

---

### **4. Add Supabase Indexes for Performance**

**Recommendation:** Add indexes for common queries

```sql
-- For finding orders by status
CREATE INDEX idx_orders_current_stage ON orders(current_stage);

-- For finding poses needing review
CREATE INDEX idx_order_poses_needs_review ON order_poses(needs_manual_review) 
WHERE needs_manual_review = true;

-- For finding all poses for an order
CREATE INDEX idx_order_poses_order_id ON order_poses(order_id);

-- For finding all orders for a character (reuse)
CREATE INDEX idx_orders_character_hash ON orders(character_hash);
```

**Are indexes already in place?**

---

### **5. Centralize Environment Variables**

**Recommendation:** Document all required env vars

```bash
# n8n Environment Variables
N8N_WEBHOOK_BASE_URL=https://n8n-instance.com
N8N_2A_WEBHOOK_PATH=/webhook/secret-path/start-2a
N8N_2B_WEBHOOK_PATH=/webhook/secret-path/start-2b
N8N_3_WEBHOOK_PATH=/webhook/secret-path/start-3

# Backend Environment Variables
BACKEND_URL=https://api.yourapp.com
BACKEND_API_TOKEN=secret-token-for-n8n
BACKEND_WEBHOOK_2A_COMPLETE=/api/webhooks/workflow-2a-complete
BACKEND_WEBHOOK_2B_COMPLETE=/api/webhooks/workflow-2b-complete
BACKEND_WEBHOOK_3_COMPLETE=/api/webhooks/workflow-3-complete

# R2 Storage
R2_PUBLIC_URL=https://pub-xxx.r2.dev
R2_BUCKET_NAME=little-hero-assets

# Bria API
BRIA_API_TOKEN=bria-secret-token

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

**Can you confirm all of these exist in your setup?**

---

## 🔄 Workflow 2B Specific Requirements

### **Inputs I Need from You:**

1. **Exact webhook URL** where 2B should call when complete
2. **Authentication method** for backend webhooks
3. **Payload format** you prefer for completion webhook
4. **Error handling** - should 2B call error webhook or just include errors in completion webhook?
5. **Manifest URLs** - should 2B download from R2, or receive manifest in payload?
6. **Pose selection** - should 2B process all poses or accept a list?

### **Outputs I'll Provide:**

1. **Updated 2B manifest** uploaded to R2
2. **Webhook call** to backend with results
3. **Background-removed images** uploaded to R2
4. **Error details** for any failed poses

---

## ✅ Action Items

### **For You (Other Agent):**

- [ ] Review this document and confirm alignment
- [ ] Share actual Supabase schema (tables, columns, types)
- [ ] Share backend webhook endpoints (URLs, auth, payload format)
- [ ] Share backend trigger endpoints (how to start workflows)
- [ ] Confirm R2 folder structure and naming conventions
- [ ] Confirm characterHash generation logic
- [ ] Confirm order status enum values
- [ ] Share any additional fields/metadata I should include
- [ ] Review my webhook handler pseudo-code and suggest improvements
- [ ] Confirm environment variables are all set up

### **For Me (This Agent):**

- [ ] Wait for your responses
- [ ] Adjust 2B implementation based on your feedback
- [ ] Create updated 2B workflow code
- [ ] Test integration with your endpoints (staging)
- [ ] Document final data flow
- [ ] Provide updated 2B workflow JSON file

---

## 📞 Communication

**Preferred Method:**
Please respond to this document with:
1. **Confirmed**: What aligns with existing setup
2. **Different**: What differs (with actual implementation details)
3. **Missing**: What additional info you need from me
4. **Questions**: Any clarifications needed

**Timeline:**
Once I have your feedback, I can finalize Workflow 2B implementation in 1-2 days.

---

## 📎 Appendix: Sample Manifest

For reference, here's a complete sample manifest I expect from 2A:

```json
{
  "schema": "lhb.run-manifest@v2.0",
  "runStamp": "2025-10-29T14:32:10.123Z",
  "characterHash": "1dde0fac84943088",
  "order": {
    "amazonOrderId": "TEST-ORDER-002",
    "childName": "Alex",
    "characterSpecs": {
      "childName": "Alex",
      "hometown": "Seattle",
      "pronouns": "he/him",
      "age": 4,
      "favoriteColor": "yellow",
      "animalGuide": "unicorn",
      "clothingStyle": "t-shirt and shorts"
    },
    "bookSpecs": {
      "title": "Alex and the Adventure Compass",
      "totalPages": 16,
      "format": "8.5x8.5_softcover",
      "bookType": "animal-guide"
    },
    "publicR2Url": "https://pub-92cec53654f84771956bc84dfea65baa.r2.dev",
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
      "approvedKey": "book-mvp-simple-adventure/order-generated-assets/characters/1dde0fac84943088/pose01.png",
      "approvedFilename": "pose01.png",
      "publicUrl": "https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/1dde0fac84943088/pose01.png",
      "correlationId": "550e8400-e29b-41d4-a716-446655440001",
      "qaScore": 0.95,
      "styleScore": 0.88,
      "needsReview": false,
      "reviewReason": null
    },
    {
      "poseNumber": 4,
      "attempts": 3,
      "status": "exhausted",
      "approved": false,
      "approvedKey": null,
      "approvedFilename": null,
      "publicUrl": null,
      "correlationId": "550e8400-e29b-41d4-a716-446655440004",
      "qaScore": 0.62,
      "styleScore": 0.55,
      "needsReview": true,
      "reviewReason": "Exhausted retry attempts",
      "retryHistory": [
        { "attempt": 1, "passed": false, "qaScore": 0.58, "reasons": ["low_quality"] },
        { "attempt": 2, "passed": false, "qaScore": 0.61, "reasons": ["style_mismatch"] },
        { "attempt": 3, "passed": false, "qaScore": 0.62, "reasons": ["low_quality"] }
      ]
    }
    // ... 10 more entries
  ],
  "reviewQueue": [
    {
      "poseNumber": 4,
      "reason": "Exhausted retry attempts",
      "publicUrl": null,
      "qaScore": 0.62,
      "styleScore": 0.55,
      "attempts": 3,
      "correlationId": "550e8400-e29b-41d4-a716-446655440004"
    },
    {
      "poseNumber": 7,
      "reason": "Low style score",
      "publicUrl": "https://...",
      "qaScore": 0.89,
      "styleScore": 0.65,
      "attempts": 1,
      "correlationId": "550e8400-e29b-41d4-a716-446655440007"
    }
  ],
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

---

**Thank you for coordinating! Looking forward to your feedback.**

**— Workflow 2B Agent**
