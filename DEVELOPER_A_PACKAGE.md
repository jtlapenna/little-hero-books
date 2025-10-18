# Developer A Package - Little Hero Books n8n Workflows

## 🎯 **Project Overview**

**Little Hero Labs** (littleherolabs.com) is a personalized children's book service that generates custom stories through Amazon Custom listings and automated print-on-demand fulfillment. The system creates watercolor storybook-style books featuring personalized child characters in 12 different poses across various story scenes.

> **Note**: Codebase currently references "Little Hero Books" - this will be updated post-launch. Not critical for MVP.

## 🤖 **AI Agent Instructions**

**Primary Role**: Assist Developer A in updating existing workflows (2A, 2B, 3) to integrate with the new database system and implement human intervention workflow.

**Key Responsibilities**:
1. **Update existing workflows** to use database instead of mock data
2. **Implement human intervention** step between Workflow 3 and 4
3. **Ensure proper data flow** between all workflows
4. **Maintain existing functionality** while adding database integration
5. **Test integration** with Developer B's workflows

**Communication Style**: 
- Be specific and technical in your guidance
- Reference actual code patterns from existing workflows
- Provide step-by-step implementation instructions
- Ask clarifying questions when requirements are unclear

## 🏗️ **Current Workflow Status**

### **Developer A (Your Work) - Database Integration Required**
**Note**: Developer B is in holding pattern working on littleherolabs.com landing page while waiting for your workflows.
- 🔄 **Workflow 2A**: AI Character Generation (Bria AI Integration) - `2.A.-bria-submit.json`
- 🔄 **Workflow 2B**: AI Character Generation (Background Removal) - `2.B.-bria-retrieve.json`  
- 🔄 **Workflow 3**: Book Assembly & PDF Generation - `3-book-assembly-production.json`

### **Developer B (Completed) - Ready for Integration**
- ✅ **Workflow 1**: Order Intake & Validation - `1-order-intake-validation.json`
- 🔄 **Workflow 4**: Print & Fulfillment - `4-print-fulfillment.json` (starting soon)
- 🔄 **Workflow 5**: Error Recovery - `5-error-recovery.json`
- 🔄 **Workflow 6**: Monitoring & Alerts - `6-monitoring-alerts.json`
- 🔄 **Workflow 7**: Quality Assurance - `7-quality-assurance.json`
- 🔄 **Workflow 8**: Cost Optimization - `8-cost-optimization.json`

---

## 🔄 **CRITICAL: Feedback-Driven Regeneration System**

### **⚠️ Important Update - Must Implement**

Your Workflow 2A **MUST** be updated to handle feedback from rejected orders. Without this, rejected orders will regenerate with the same prompt and produce the same poor result.

### **What You Need to Do**

When an order is rejected by human review, it goes back to Workflow 2A with:
- `status = 'ai_generation_required'`
- `regeneration_attempt = 1` (or 2, 3)
- `regeneration_instructions = 'CRITICAL: [Specific feedback on what to fix]'`

**Your Workflow 2A must**:
1. Check if `regeneration_attempt > 0`
2. If yes, read `regeneration_instructions` field
3. Enhance the AI prompt with this feedback
4. Use different seed/parameters for a new result

### **Code Example**

```javascript
// At the start of Workflow 2A - Check for regeneration
const order = await getOrderFromDatabase(orderId);

if (order.regeneration_attempt > 0) {
  console.log(`🔄 Regeneration attempt ${order.regeneration_attempt} for ${order.amazon_order_id}`);
  console.log(`📝 Feedback: ${order.regeneration_instructions}`);
  
  // Build enhanced prompt with feedback
  const basePrompt = generateCharacterPrompt(order.character_specs);
  const enhancedPrompt = `${basePrompt}

IMPORTANT CORRECTIONS FROM PREVIOUS ATTEMPT:
${order.regeneration_instructions}

Please ensure these corrections are applied to ALL character poses.`;

  // Generate with enhanced prompt and new seed
  const aiResponse = await generateCharacterWithBria({
    prompt: enhancedPrompt,
    characterSpecs: order.character_specs,
    seed: Date.now(), // New seed for different result
    qualityBoost: true
  });
  
} else {
  // First attempt - use standard prompt
  const prompt = generateCharacterPrompt(order.character_specs);
  const aiResponse = await generateCharacterWithBria({
    prompt,
    characterSpecs: order.character_specs
  });
}
```

### **Database Migration Required**

Run this migration to add feedback fields:
```bash
# In Supabase SQL Editor:
docs/database/migration-add-feedback-fields.sql
```

This adds:
- `regeneration_attempt` (tracks how many times regenerated)
- `regeneration_instructions` (detailed feedback from reviewer)
- `qa_notes` (reviewer's notes)
- `quality_issues` (categorized issues)
- `rejection_history` (full history of rejections)

### **Full Documentation**

See complete implementation guide with all code examples:
📖 **`docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md`** (search for "Workflow 2A Integration")

---

## 🗄️ **Database Integration Requirements**

### **Database Setup Status**
- ✅ **Supabase Database**: Fully configured and operational
- ✅ **Schema**: Complete with all required tables
- ✅ **Credentials**: n8n Supabase node configured
- ✅ **Sample Data**: 3 test orders ready for processing
- ⚠️ **Migration Needed**: Run `migration-add-feedback-fields.sql` to add regeneration fields

### **Database Schema Overview**
```sql
-- Main orders table with all workflow statuses
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    amazon_order_id VARCHAR(255) UNIQUE NOT NULL,
    processing_id VARCHAR(255) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_validation',
    workflow_step VARCHAR(50) NOT NULL DEFAULT 'order_intake',
    next_workflow VARCHAR(50),
    
    -- Order information
    order_status VARCHAR(50),
    purchase_date TIMESTAMP WITH TIME ZONE,
    order_total DECIMAL(10, 2),
    currency VARCHAR(10),
    marketplace_id VARCHAR(50),
    
    -- Customer information
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    shipping_address JSONB,
    
    -- Character specifications
    character_specs JSONB,
    character_hash VARCHAR(255),
    product_info JSONB,
    
    -- Priority and timing
    priority VARCHAR(20) DEFAULT 'normal',
    estimated_processing_time VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validated_at TIMESTAMP WITH TIME ZONE,
    validation_errors JSONB DEFAULT '[]'::jsonb,
    queued_at TIMESTAMP WITH TIME ZONE,
    
    -- AI Generation tracking
    ai_generation_started_at TIMESTAMP WITH TIME ZONE,
    ai_generation_completed_at TIMESTAMP WITH TIME ZONE,
    character_images_generated INTEGER DEFAULT 0,
    total_poses_required INTEGER DEFAULT 12,
    ai_generation_cost DECIMAL(10, 2) DEFAULT 0.00,
    character_consistency_score DECIMAL(3, 2),
    
    -- Book Assembly tracking
    book_assembly_started_at TIMESTAMP WITH TIME ZONE,
    book_assembly_completed_at TIMESTAMP WITH TIME ZONE,
    final_book_url TEXT,
    final_cover_url TEXT,
    pdf_generation_cost DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Human Review fields
    requires_human_review BOOLEAN DEFAULT FALSE,
    human_approved BOOLEAN DEFAULT NULL,
    human_reviewed_at TIMESTAMP WITH TIME ZONE,
    human_reviewer VARCHAR(100),
    qa_status VARCHAR(50) DEFAULT 'pending',
    qa_score DECIMAL(3, 2),
    qa_notes TEXT,
    
    -- Print & Fulfillment tracking
    print_submission_in_progress BOOLEAN DEFAULT FALSE,
    print_job_id VARCHAR(255),
    print_status VARCHAR(50),
    print_submission_started_at TIMESTAMP WITH TIME ZONE,
    print_submission_completed_at TIMESTAMP WITH TIME ZONE,
    fulfillment_tracking_id VARCHAR(255),
    fulfillment_carrier VARCHAR(100),
    fulfillment_completed_at TIMESTAMP WITH TIME ZONE,
    fulfillment_cost DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Cost optimization
    cost_optimization_applied BOOLEAN DEFAULT FALSE,
    cost_savings DECIMAL(10, 2) DEFAULT 0.00
);

-- Human review queue for quality control
CREATE TABLE human_review_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    review_type VARCHAR(50),
    review_priority VARCHAR(20),
    assigned_to VARCHAR(255),
    reviewed_by VARCHAR(100),
    review_notes TEXT,
    decision VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Audit logs for tracking all actions
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    user_id VARCHAR(255),
    details JSONB
);
```

### **Current Database Status**
```sql
-- Check orders ready for processing
SELECT amazon_order_id, status, next_workflow, character_specs 
FROM orders 
WHERE status = 'queued_for_processing';
```

**Result**: 3 orders ready with `status: 'queued_for_processing'` and `next_workflow: '2.A.-bria-submit'`

---

## 🔄 **Workflow 2A: Database Integration Required**

### **Current Status**
- ✅ **Workflow exists**: `2.A.-bria-submit.json`
- ❌ **Uses mock data**: Still generating test orders instead of querying database
- ❌ **Manual trigger**: Needs cron trigger for automatic processing
- ❌ **No database updates**: Not updating order status after processing

### **Required Changes**

#### **1. Replace Mock Order Generation**
**Current Code** (lines 6-16 in `2.A.-bria-submit.json`):
```javascript
// Generate a mock order for testing the AI character generation workflow
const mockOrder = {
  amazonOrderId: 'TEST-ORDER-002',
  status: 'queued_for_processing',
  // ... mock data
};
```

**Replace With Supabase Node**:
- **Node Type**: Supabase
- **Operation**: `read` (get rows)
- **Table**: `orders`
- **Filters**:
  ```json
  {
    "status": "eq.queued_for_processing",
    "next_workflow": "eq.2.A.-bria-submit"
  }
  ```

**Or use Code Node**:
```javascript
// Query database for orders ready for AI generation
const orders = await this.helpers.request({
  method: 'GET',
  url: 'https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Content-Type': 'application/json'
  },
  qs: {
    status: 'eq.queued_for_processing',
    next_workflow: 'eq.2.A.-bria-submit',
    select: '*'
  },
  json: true
});

if (!orders || orders.length === 0) {
  console.log('No orders ready for AI generation');
  return [];
}

console.log(`✅ Found ${orders.length} orders ready for AI generation`);
return orders.map(order => ({ json: order }));
```

#### **2. Add Cron Trigger**
**Replace Manual Trigger** with:
- **Trigger Type**: Cron Trigger
- **Schedule**: Every 5 minutes
- **Expression**: `*/5 * * * *`

#### **3. Update Order Status After Processing**
**Add Supabase Update Node** after successful character generation start:
- **Operation**: `update`
- **Table**: `orders`
- **Filter**: `amazon_order_id=eq.{{ $json.amazon_order_id }}`
- **Fields to Update**:
  ```json
  {
    "status": "ai_generation_in_progress",
    "ai_generation_started_at": "{{ $now }}",
    "updated_at": "{{ $now }}"
  }
  ```

**Or use Code Node**:
```javascript
// Update order status to ai_generation_in_progress
const orderData = $input.first().json;

await this.helpers.request({
  method: 'PATCH',
  url: `https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders?amazon_order_id=eq.${orderData.amazon_order_id}`,
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: {
    status: 'ai_generation_in_progress',
    ai_generation_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  json: true
});

console.log(`✅ Updated order ${orderData.amazon_order_id} to ai_generation_in_progress`);
return [{ json: orderData }];
```

---

## 🔄 **Workflow 2B: Database Integration Required**

### **Current Status**
- ✅ **Workflow exists**: `2.B.-bria-retrieve.json`
- ❌ **Webhook trigger**: Needs to be triggered by Workflow 2A completion
- ❌ **No database updates**: Not updating order status after completion

### **Required Changes**

#### **1. Update Trigger Mechanism**
**Current**: Webhook trigger
**Options**:
- **Option A**: Keep webhook, triggered by Workflow 2A at end
- **Option B**: Use cron trigger + database polling for `status = 'ai_generation_in_progress'`

#### **2. Add Database Status Updates**
**After successful image retrieval**, add Supabase Update Node:
- **Operation**: `update`
- **Table**: `orders`
- **Filter**: `amazon_order_id=eq.{{ $json.amazon_order_id }}`
- **Fields to Update**:
  ```json
  {
    "status": "ai_generation_completed",
    "ai_generation_completed_at": "{{ $now }}",
    "character_images_generated": 12,
    "next_workflow": "3-book-assembly",
    "updated_at": "{{ $now }}"
  }
  ```

**Or use Code Node**:
```javascript
// Update order status to ai_generation_completed
const orderData = $input.first().json;

await this.helpers.request({
  method: 'PATCH',
  url: `https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders?amazon_order_id=eq.${orderData.amazon_order_id}`,
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: {
    status: 'ai_generation_completed',
    ai_generation_completed_at: new Date().toISOString(),
    character_images_generated: 12,
    next_workflow: '3-book-assembly',
    updated_at: new Date().toISOString()
  },
  json: true
});

console.log(`✅ Updated order ${orderData.amazon_order_id} to ai_generation_completed`);
return [{ json: orderData }];
```

---

## 🔄 **Workflow 3: Database Integration + Human Intervention**

### **Current Status**
- ✅ **Workflow exists**: `3-book-assembly-production.json`
- ❌ **Uses mock data**: Needs to query database for completed AI generation
- ❌ **No human intervention**: Missing quality review step

### **Required Changes**

#### **1. Replace Mock Data with Database Query**
**Add Supabase Query Node** at the beginning:
- **Operation**: `read`
- **Table**: `orders`
- **Filters**:
  ```json
  {
    "status": "eq.ai_generation_completed",
    "next_workflow": "eq.3-book-assembly"
  }
  ```

**Or use Code Node**:
```javascript
// Query database for orders ready for book assembly
const orders = await this.helpers.request({
  method: 'GET',
  url: 'https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Content-Type': 'application/json'
  },
  qs: {
    status: 'eq.ai_generation_completed',
    next_workflow: 'eq.3-book-assembly',
    select: '*'
  },
  json: true
});

if (!orders || orders.length === 0) {
  console.log('No orders ready for book assembly');
  return [];
}

console.log(`✅ Found ${orders.length} orders ready for book assembly`);
return orders.map(order => ({ json: order }));
```

#### **2. Add Quality Check and Human Review Logic**
**At the end of Workflow 3**, before final completion, add this Code Node:

```javascript
// Quality check and human review logic
const orderData = $input.first().json;
const pdfUrl = orderData.final_book_url || $('Generate PDF').first().json.pdf_url;

// Simulate quality check (in production, this would be AI-powered)
const qualityCheck = {
  overallQuality: 0.85,
  characterConsistency: 0.90,
  contentAppropriateness: 0.95,
  technicalQuality: 0.80
};

const avgQuality = Object.values(qualityCheck).reduce((a, b) => a + b) / Object.keys(qualityCheck).length;

// Determine if human review is required
const requiresHumanReview = avgQuality < 0.8 || orderData.priority === 'high';

const finalOrderData = {
  status: 'book_assembly_completed',
  book_assembly_completed_at: new Date().toISOString(),
  final_book_url: pdfUrl,
  qa_score: avgQuality,
  requires_human_review: requiresHumanReview,
  next_workflow: requiresHumanReview ? 'human_review' : '4-print-fulfillment',
  updated_at: new Date().toISOString()
};

// Update order in database
await this.helpers.request({
  method: 'PATCH',
  url: `https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders?amazon_order_id=eq.${orderData.amazon_order_id}`,
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: finalOrderData,
  json: true
});

// If requires review, add to human review queue
if (requiresHumanReview) {
  await this.helpers.request({
    method: 'POST',
    url: 'https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/human_review_queue',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs',
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: {
      order_id: orderData.id,
      review_type: 'quality_check',
      review_priority: orderData.priority || 'normal',
      status: 'pending'
    },
    json: true
  });
  
  console.log(`📋 Order ${orderData.amazon_order_id} requires human review (quality: ${avgQuality})`);
} else {
  console.log(`✅ Order ${orderData.amazon_order_id} approved automatically (quality: ${avgQuality})`);
}

return [{ json: { ...orderData, ...finalOrderData } }];
```

---

## 👥 **Human Intervention Workflow - Complete Guide**

> **📖 FULL IMPLEMENTATION GUIDE**: See `docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md` for:
> - 3 implementation options (Manual, Notion/Sheets, Custom Dashboard)
> - Complete code examples for each option
> - Simple HTML dashboard you can deploy immediately
> - Notification systems (Email, Slack)
> - Security and authentication guidance
> - Metrics and SLA tracking

### **Purpose**
Ensure quality control before printing and shipping by requiring human approval for:
- Low quality scores (< 0.8)
- High priority orders
- Manual flagging
- Customer complaints

### **Workflow Sequence**
```
Workflow 1: Order Intake & Validation
    ↓ (status: 'queued_for_processing')
    
Workflow 2A: AI Character Generation (Bria Submit)
    ↓ (status: 'ai_generation_in_progress')
    
Workflow 2B: AI Character Generation (Bria Retrieve) 
    ↓ (status: 'ai_generation_completed')
    
Workflow 3: Book Assembly & PDF Generation
    ↓ (status: 'book_assembly_completed')
    ↓ (requires_human_review: true/false)
    
👥 HUMAN INTERVENTION: Quality Review & Approval
    ↓ (human_approved: true/false)
    
Workflow 4: Print & Fulfillment
    ↓ (only if human_approved: true)
```

### **What Triggers Human Review?**
1. **Automatic Quality Check Fails** (Quality Score < 0.8)
2. **Character Consistency Issues** (Inconsistent character appearance)
3. **Content Issues** (Inappropriate content, wrong character details)
4. **Technical Issues** (PDF generation problems, missing assets)
5. **Manual Flagging** (System flags for manual review)
6. **High Priority Orders** (VIP customers, time-sensitive orders)

### **Review Actions**

| Action | Result | Next Status | Database Update |
|--------|--------|-------------|-----------------|
| ✅ **Approve** | Book ready for printing | `human_approved: true` → Workflow 4 | Update `orders.human_approved = true` |
| ❌ **Reject** | Book needs regeneration | `human_approved: false` → Back to Workflow 2A | Update `orders.status = 'ai_generation_required'` |
| 🔄 **Request Changes** | Specific issues noted | `human_approved: false` + detailed notes | Add notes to `orders.qa_notes` |
| 🚨 **Escalate** | Needs senior review | `status: 'escalated'` | Update `human_review_queue.status = 'escalated'` |

### **🚨 CRITICAL: Human Review vs Error Recovery**

**Human Review (Your Workflow 3)** handles **quality issues**:
- Character doesn't match specifications
- Poor image quality or consistency
- Layout problems in PDF
- **Action**: Human approves or rejects based on quality

**Error Recovery (Developer B's Workflow 5)** handles **technical failures**:
- API timeouts or rate limits
- Network connectivity issues
- Service crashes or unavailability
- **Action**: Automatic retry with exponential backoff

**Key Safeguard**: Workflow 5 will **NEVER** touch orders with:
- `status: 'book_assembly_completed'`
- `requires_human_review: true`
- `human_approved: null`

This ensures error recovery doesn't interfere with your human review process.

### **Review Dashboard Requirements**
- **URL**: `/admin/review-queue` (to be built)
- **Features**:
  - PDF preview of generated book
  - Character specifications display
  - All 12 character poses display
  - Quality scores visualization
  - Approve/Reject buttons
  - Review notes text area
  - Order history and previous reviews

### **Database Queries for Review Dashboard**

**Get pending reviews**:
```sql
SELECT 
  o.id,
  o.amazon_order_id,
  o.final_book_url,
  o.character_specs,
  o.qa_score,
  hrq.review_priority,
  hrq.created_at
FROM orders o
JOIN human_review_queue hrq ON o.id = hrq.order_id
WHERE hrq.status = 'pending'
ORDER BY hrq.review_priority DESC, hrq.created_at ASC;
```

**Approve order**:
```sql
-- Update order
UPDATE orders 
SET human_approved = true,
    human_reviewed_at = NOW(),
    human_reviewer = 'reviewer_name',
    next_workflow = '4-print-fulfillment',
    updated_at = NOW()
WHERE id = 'order_uuid';

-- Update review queue
UPDATE human_review_queue
SET status = 'completed',
    decision = 'approve',
    completed_at = NOW()
WHERE order_id = 'order_uuid';

-- Add audit log
INSERT INTO audit_logs (event_type, entity_type, entity_id, user_id, details)
VALUES ('order_approved', 'order', 'order_uuid', 'reviewer_name', '{"qa_score": 0.85}');
```

**Reject order**:
```sql
-- Update order
UPDATE orders 
SET human_approved = false,
    human_reviewed_at = NOW(),
    human_reviewer = 'reviewer_name',
    qa_notes = 'Rejection reason here',
    status = 'ai_generation_required',
    next_workflow = '2.A.-bria-submit',
    updated_at = NOW()
WHERE id = 'order_uuid';

-- Update review queue
UPDATE human_review_queue
SET status = 'completed',
    decision = 'reject',
    review_notes = 'Rejection reason here',
    completed_at = NOW()
WHERE order_id = 'order_uuid';

-- Add audit log
INSERT INTO audit_logs (event_type, entity_type, entity_id, user_id, details)
VALUES ('order_rejected', 'order', 'order_uuid', 'reviewer_name', '{"reason": "Character inconsistency"}');
```

### **Success Metrics**
- **Review Completion Time**: < 15 minutes average
- **Quality Approval Rate**: > 85%
- **Customer Satisfaction**: > 4.5/5 stars
- **Print Error Rate**: < 2% (after human review)

---

## 🔗 **Integration Points with Developer B**

### **From Workflow 1 (Order Intake)**
- **Receives**: Orders with `status: 'queued_for_processing'`
- **Data Format**: Full order data with character specifications
- **Next Step**: Workflow 2A processes these orders

### **To Workflow 4 (Print & Fulfillment)**
- **Sends**: Orders with `status: 'book_assembly_completed'` and `human_approved: true`
- **Data Format**: Final book PDF URL and complete order details
- **Next Step**: Developer B's Workflow 4 submits to Lulu for printing

### **Data Flow**
```
Workflow 1 (Dev B) → Database → Workflow 2A (Dev A)
     ↓                  ↓              ↓
Database ← Database ← Database ← Database
     ↓                  ↓              ↓
Workflow 2B (Dev A) → Database → Workflow 3 (Dev A)
     ↓                  ↓              ↓
Database ← Database ← Database ← Database
     ↓                  ↓              ↓
Human Review → Database → Workflow 4 (Dev B)
```

---

## 🛠️ **Implementation Steps**

### **Phase 1: Database Integration (Week 1)**

#### **Day 1-2: Workflow 2A**
1. Replace mock data generator with Supabase query node
2. Change manual trigger to cron trigger (every 5 minutes)
3. Add database update at start of processing
4. Test with 3 existing orders in database
5. Verify status updates correctly

#### **Day 3-4: Workflow 2B**
1. Add database status update at completion
2. Test complete AI generation flow
3. Verify handoff to Workflow 3

#### **Day 5-7: Workflow 3**
1. Replace mock data with database query
2. Add quality check logic
3. Add human review queue integration
4. Test book assembly with database orders

### **Phase 2: Human Intervention (Week 2)**

#### **Day 1-3: Review Dashboard**
1. Create simple web interface for order review
2. Add PDF preview functionality
3. Implement approve/reject actions
4. Connect to Supabase database

#### **Day 4-5: Testing**
1. Test complete workflow with database
2. Test human review process
3. Test handoff to Developer B's Workflow 4
4. Fix any integration issues

### **Phase 3: Testing & Refinement (Week 3)**

#### **Day 1-3: Integration Testing**
1. End-to-end test with Developer B
2. Test error handling and recovery
3. Test with multiple orders simultaneously

#### **Day 4-5: Performance Optimization**
1. Optimize database queries
2. Improve error handling
3. Add monitoring and alerts
4. Document any issues found

---

## 📊 **Database Credentials**

### **Supabase Connection Details**
- **Project URL**: `https://mdnthwpcnphjnnblbvxk.supabase.co`
- **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs`
- **Database**: PostgreSQL (via Supabase)

### **n8n Supabase Node Configuration**
1. **Add Credential**:
   - Type: `Supabase API`
   - Host: `https://mdnthwpcnphjnnblbvxk.supabase.co`
   - Service Role Key: (see above)

2. **Node Operations**:
   - **Read (GET)**: `read` operation with filters
   - **Create (POST)**: `create` operation with data
   - **Update (PATCH)**: `update` operation with filters + data
   - **Delete**: `delete` operation with filters

3. **Common Patterns**:
   - Always use `amazon_order_id` as the unique identifier filter
   - Always set `updated_at` when updating orders
   - Always return full order data for next steps

---

## 🚨 **Important Notes**

### **Critical Issues to Address First**
1. **Bria AI Integration**: Ensure image generation is working before database integration
2. **Character Positioning**: Fix positioning issues in Workflow 3 before adding quality checks
3. **Database Connection**: Test Supabase connection thoroughly before replacing mock data

### **Testing Strategy**
1. **Test Each Workflow Individually**: Ensure each workflow works with database before integration
2. **Use Existing Test Data**: 3 orders already in database for testing
3. **Monitor Database Updates**: Check database after each workflow run to verify updates
4. **Test Error Handling**: Simulate failures to ensure proper error handling

### **Common Pitfalls to Avoid**
1. **Don't Delete Mock Data Yet**: Keep mock data as fallback during testing
2. **Use Transactions**: Ensure database updates are atomic
3. **Handle Race Conditions**: Multiple workflows may try to update same order
4. **Log Everything**: Add comprehensive logging for debugging

---

## 📈 **Success Metrics**

- ✅ **Database Integration**: All workflows using database instead of mock data
- ✅ **Human Review**: Quality control implemented and functional
- ✅ **End-to-End Testing**: Complete workflow from order intake to print submission
- ✅ **Error Handling**: Robust error handling and recovery mechanisms
- ✅ **Performance**: Workflows complete within expected time frames

---

## 🎯 **Next Steps**

1. **Start with Workflow 2A**: Replace mock data with database query
2. **Add cron trigger**: Enable automatic processing every 5 minutes
3. **Update Workflow 2B**: Add database status updates after image retrieval
4. **Update Workflow 3**: Add quality check and human review integration
5. **Test integration**: Ensure smooth handoff to Developer B's Workflow 4
6. **Build review dashboard**: Create simple interface for human reviewers

---

## 📚 **Additional Resources**

- **Database Schema**: `docs/database/little-hero-books-schema.sql`
- **Developer B Package**: `DEVELOPER_B_PACKAGE.md`
- **Workflow Files**: `docs/n8n-workflow-files/n8n-new/`
- **Supabase Documentation**: https://supabase.com/docs
- **n8n Supabase Node**: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/

---

## 📝 **Quick Reference Summary for Developer A**

### **🎯 Your Mission**
Integrate your existing workflows (2A, 2B, 3) with the Supabase database and implement human review workflow.

### **✅ What's Already Done (by Developer B)**
1. **Supabase Database**: Fully operational with schema
2. **n8n Credentials**: Configured and tested
3. **Workflow 1**: Complete and storing 3 test orders
4. **Test Data**: 3 orders in database with `status = 'queued_for_processing'` waiting for you

### **🔧 Your Tasks (Priority Order)**

#### **Phase 1: Workflow 2A (Days 1-2)**
1. Replace `Generate Mock Order` node with Supabase query
2. Query: `status = 'queued_for_processing'` AND `next_workflow = '2.A.-bria-submit'`
3. **🔄 CRITICAL: Add Feedback Loop Logic**:
   - Check if `regeneration_attempt > 0` (this is a regeneration)
   - If yes: Read `regeneration_instructions` field
   - Enhance AI prompt with feedback instructions
   - Use different seed/parameters for new result
   - See full code example in `docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md` (search for "Workflow 2A Integration")
4. Change Manual Trigger → Cron Trigger (every 5 minutes: `*/5 * * * *`)
5. Add database update after processing starts: `status = 'ai_generation_in_progress'`

#### **Phase 2: Workflow 2B (Days 3-4)**
1. Add database update after completion: `status = 'ai_generation_completed'`
2. Set `next_workflow = '3-book-assembly'`
3. Test complete AI generation flow

#### **Phase 3: Workflow 3 (Days 5-7)**
1. Replace mock data with Supabase query
2. Query: `status = 'ai_generation_completed'` AND `next_workflow = '3-book-assembly'`
3. Add quality check logic at the end
4. Calculate quality score (0-1)
5. If score < 0.8: Add to `human_review_queue`, set `requires_human_review = true`
6. If score ≥ 0.8: Auto-approve, set `human_approved = true`
7. Update order status: `status = 'book_assembly_completed'`

### **🔑 Key Information**

**Database Credentials**:
```
URL: https://mdnthwpcnphjnnblbvxk.supabase.co
Service Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs
```

**Orders in Database (Ready for You)**:
- `TEST-ORDER-001`: Emma (5 years, she/her)
- `TEST-ORDER-002`: Alex (4 years, he/him)
- `TEST-ORDER-1760504174618-929`: Adventure Hero (5 years, they/them)

**Database Operations**:
- **Query orders**: Use Supabase node with `read` operation
- **Update status**: Use Supabase node with `update` operation
- **Filter syntax**: `status=eq.queued_for_processing`
- **Always update**: `updated_at` field whenever you modify an order
- **⚠️ TESTING vs PRODUCTION**:
  - **Testing** (now): Use `select: '*'` to get all fields automatically
  - **Production** (later): Use specific field lists for better performance (e.g., `select: 'id,status,amazon_order_id,character_specs'`)

**Quality Check Thresholds**:
- Score ≥ 0.8: Auto-approve (`human_approved = true`)
- Score < 0.8: Human review required (`requires_human_review = true`)
- High priority orders: Always require human review

### **📊 Expected Data Flow**

```
Your Workflow 2A:
  Input: orders WHERE status = 'queued_for_processing'
  Output: status = 'ai_generation_in_progress'
  
Your Workflow 2B:
  Input: orders WHERE status = 'ai_generation_in_progress'
  Output: status = 'ai_generation_completed', next_workflow = '3-book-assembly'
  
Your Workflow 3:
  Input: orders WHERE status = 'ai_generation_completed'
  Output: status = 'book_assembly_completed'
          + human_approved = true/false
          + requires_human_review = true/false
          
Developer B's Workflow 4:
  Input: orders WHERE status = 'book_assembly_completed' AND human_approved = true
```

### **📞 Communication with Developer B**
- Developer B completed: Workflow 1 (Order Intake)
- Developer B waiting: For your Workflow 3 completion
- Developer B ready: To start Workflow 4 once you're done
- Database ready: Supabase fully operational

### **🚨 Critical Notes**
1. **Don't delete mock data yet**: Keep as fallback during testing
2. **Test incrementally**: Test each workflow individually before integration
3. **Use existing orders**: 3 orders already in database for testing
4. **Update timestamps**: Always update `updated_at` when modifying orders
5. **Log everything**: Add console.log statements for debugging
6. **Human review is key**: Quality control before printing

### **✅ Success Criteria**
- [ ] Workflow 2A queries database and updates status
- [ ] **Workflow 2A implements feedback loop for regenerations**
- [ ] **Workflow 2A reads `regeneration_instructions` and enhances AI prompt**
- [ ] Workflow 2B updates status after completion
- [ ] Workflow 3 queries database, generates book, checks quality
- [ ] Quality check determines auto-approve vs human review
- [ ] Low quality orders added to `human_review_queue`
- [ ] High quality orders auto-approved
- [ ] **Rejected orders include detailed `regeneration_instructions`**
- [ ] All status updates reflected in database
- [ ] Integration tested with Developer B's Workflow 1
- [ ] **Test regeneration flow: reject order → verify feedback used in 2A**
- [ ] **Generate test PDFs for Developer B's marketing assets** (Week 2-3)

---

## 📅 **Pre-Launch Marketing Timeline (FYI)**

> **📖 COMPLETE GUIDE**: See `docs/PRE_LAUNCH_PREPARATION.md` for full timeline and responsibilities

### **How Your Work Enables Marketing (Developer A)**

Your completed workflows generate the test books that Developer B needs for marketing assets:

**Week 2-3: Your Deliverables Enable Marketing**
- Once Workflow 3 is complete and generating test PDFs
- Developer B will use these test books to:
  - Order physical sample books from Lulu (~$50-100)
  - Create 7 product images for Amazon listing
  - Film product video and social media content
  - Build landing page with real book examples

**Target Timeline**:
- **Weeks 1-2**: Complete Workflow 2A and 2B database integration
- **Week 3**: Complete Workflow 3 + human review integration
- **Week 3-4**: Generate 5-10 test PDFs with different character combinations
- **Weeks 5-6**: End-to-end integration testing with Developer B
- **Week 7**: Production deployment
- **Week 8**: Launch!

**Critical for Marketing**: Developer B needs test PDFs by Week 3 to stay on schedule for Week 8 launch.

### **Test PDFs Needed for Marketing**
Generate these character combinations for marketing assets:
1. **Emma** - Medium skin, brown/curly hair, purple theme, unicorn
2. **Alex** - Light skin, blonde/short hair, blue theme, dinosaur
3. **Jordan** - Dark skin, black/braided hair, green theme, tiger
4. **Sam** - Tan skin, red/wavy hair, yellow theme, dragon
5. **Riley** - Olive skin, brown/straight hair, pink theme, bunny

**Why These?** Showcase diversity and personalization options for Amazon listing images.

---

## 🎨 **Product Images for Amazon Listing** (Week 3-4)

**Owner**: Developer A (you have design capability)

### **Your Responsibility**
Create the 7 required Amazon product images using the test PDFs you generate from Workflow 3.

### **Required Images** (Specifications in `docs/AMAZON_LISTING_FINAL.md`)

1. **Main Product Image** (WHITE BACKGROUND - REQUIRED)
   - 8.5×8.5 book mockup
   - Professional product shot
   - Minimum 1000×1000px (recommend 2000×2000px)
   - No text overlay on main image

2. **Personalization Options Grid**
   - Show customization choices (name, hair, skin, animal)
   - Visual examples of each option
   - Text overlay allowed

3. **Inside Pages Collage**
   - 4-6 page spreads from test PDFs
   - Character visible in different scenes
   - Name visible in text

4. **How It Works Infographic**
   - 3 steps: Choose Options → We Create → Fast Shipping
   - Simple icons
   - Clean design

5. **Quality Guarantee Badge**
   - "Human-Reviewed Quality" messaging
   - Trust badges
   - Professional appearance

6. **Gift-Ready Context**
   - Book in birthday/holiday setting
   - "Perfect for ages 3-7" callout
   - Emotional connection

7. **Lifestyle Shot**
   - Parent + child reading together
   - Can use stock photo + book overlay
   - Warm, inviting

### **Timeline**
- **Week 3**: Generate test PDFs
- **Week 3-4**: Create all 7 images
- **Week 4**: Deliver to Developer B for Amazon listing

### **Tools/Resources**
- Use your design tools (same as storybook design)
- Mockup generators if needed
- Stock photos for lifestyle shots (Unsplash, Pexels)
- Reference: `docs/AMAZON_LISTING_FINAL.md` (lines 113-152)

### **🎯 Testing Commands**

```sql
-- Check orders ready for Workflow 2A
SELECT amazon_order_id, status, next_workflow, regeneration_attempt
FROM orders 
WHERE status = 'queued_for_processing';

-- Check orders needing regeneration (with feedback)
SELECT 
    amazon_order_id, 
    status, 
    regeneration_attempt,
    regeneration_instructions,
    qa_notes
FROM orders 
WHERE status = 'ai_generation_required' 
AND regeneration_attempt > 0;

-- Check orders in AI generation
SELECT amazon_order_id, status, ai_generation_started_at, regeneration_attempt
FROM orders 
WHERE status = 'ai_generation_in_progress';

-- Check completed books
SELECT amazon_order_id, status, human_approved, qa_score, regeneration_attempt
FROM orders 
WHERE status = 'book_assembly_completed';

-- Check rejection history for an order
SELECT 
    amazon_order_id,
    regeneration_attempt,
    rejection_history,
    previous_character_images
FROM orders 
WHERE amazon_order_id = 'TEST-ORDER-001';

-- Check human review queue
SELECT o.amazon_order_id, hrq.status, hrq.created_at
FROM human_review_queue hrq
JOIN orders o ON hrq.order_id = o.id
WHERE hrq.status = 'pending';

-- Check regeneration success rate
SELECT 
    regeneration_attempt,
    COUNT(*) as total_orders,
    SUM(CASE WHEN human_approved = true THEN 1 ELSE 0 END) as approved,
    ROUND(SUM(CASE WHEN human_approved = true THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as approval_rate
FROM orders
WHERE regeneration_attempt >= 0
GROUP BY regeneration_attempt
ORDER BY regeneration_attempt;
```

---

**Ready to integrate with the database system and implement human intervention! Let's make this amazing personalized book service a reality! 🚀📚**

