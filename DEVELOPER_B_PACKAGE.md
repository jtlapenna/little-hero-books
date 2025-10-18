# Developer B Package - Little Hero Books n8n Workflows

## 🎯 **Project Overview**

**Little Hero Labs** (littleherolabs.com) is a personalized children's book service that generates custom stories through Amazon Custom listings and automated print-on-demand fulfillment. The system creates watercolor storybook-style books featuring personalized child characters in 12 different poses across various story scenes.

> **Note**: Codebase currently references "Little Hero Books" - this will be updated post-launch. Not critical for MVP.

## 🤖 **AI Agent Instructions**

**Primary Role**: Assist Developer B in completing the remaining n8n workflows for the Little Hero Books system.

**Key Responsibilities**:
1. **Analyze** existing workflow implementations to understand data flow patterns
2. **Guide** Developer B through implementation decisions and technical choices
3. **Ensure** proper integration points between workflows
4. **Validate** that implementations follow established patterns and standards
5. **Debug** issues and provide solutions during development

**Communication Style**: 
- Be specific and technical in your guidance
- Reference actual code patterns from existing workflows
- Provide step-by-step implementation instructions
- Ask clarifying questions when requirements are unclear

## 🏗️ **Current Workflow Architecture**

### **Developer A (In Progress) - Database Integration Required**
- 🔄 **Workflow 2A**: AI Character Generation (Bria AI Integration) - `2.A.-bria-submit.json`
  - **Status**: Needs database integration
  - **Action**: Replace mock data with database queries
- 🔄 **Workflow 2B**: AI Character Generation (Background Removal) - `2.B.-bria-retrieve.json`
  - **Status**: Needs database status updates
  - **Action**: Add database updates after completion
- 🔄 **Workflow 3**: Book Assembly & PDF Generation - `3-book-assembly-production.json`
  - **Status**: Needs database integration + human review
  - **Action**: Query database, add quality checks

### **Developer B (Your Work) - Implementation Status**
- ✅ **Workflow 1**: Order Intake & Validation - `1-order-intake-validation.json`
  - **Status**: ✅ COMPLETED - Tested and working
  - **Testing**: Successfully storing orders in database with validation
- ✅ **Workflow 4**: Print & Fulfillment - `4-print-fulfillment.json`
  - **Status**: ✅ COMPLETED - Tested and working
  - **Testing**: Successfully processing orders with human approval checks
- ✅ **Workflow 5**: Error Recovery - `5-error-recovery.json`
  - **Status**: ✅ COMPLETED - Tested and working
  - **Testing**: Successfully detecting and retrying failed orders
- ✅ **Workflow 6**: Monitoring & Alerts - `6-monitoring-alerts.json`
  - **Status**: ✅ COMPLETED - Tested and working
  - **Testing**: Successfully monitoring system health, costs, queues, and quality
- ✅ **Workflow 7**: Quality Assurance - `7-quality-assurance.json`
  - **Status**: ✅ COMPLETED - Tested and working
  - **Testing**: Successfully checking character consistency, image quality, PDF quality, and print specs
- ✅ **Workflow 8**: Cost Optimization - `8-cost-optimization.json`
  - **Status**: ✅ COMPLETED - Tested and working
  - **Testing**: Successfully analyzing costs and generating optimization recommendations

---

## 🔍 **Reference Workflow Analysis**

### **Workflow 2A (Bria Submit) - Data Flow Pattern**
**File**: `2.A.-bria-submit.json`

**Key Patterns to Follow**:
1. **Mock Data Generation**: Uses `Generate Mock Order` node for testing
2. **Character Hash Generation**: Creates deterministic hash from character specs
3. **R2 Storage Integration**: Uses S3 nodes with `little-hero-assets` bucket
4. **Bria AI Integration**: Handles rate limiting (10 req/min) with wait nodes
5. **Error Handling**: Comprehensive validation and fallback mechanisms

**Data Structure Example**:
```javascript
{
  amazonOrderId: 'TEST-ORDER-002',
  characterSpecs: {
    childName: 'Alex',
    skinTone: 'medium',
    hairColor: 'brown',
    hairStyle: 'very short/straight',
    age: 4,
    pronouns: 'he/him',
    favoriteColor: 'yellow',
    animalGuide: 'dog',
    clothingStyle: 't-shirt and shorts'
  },
  characterHash: '6ec1cd52dce77992',
  status: 'queued_for_processing'
}
```

### **Workflow 2B (Bria Retrieve) - Polling Pattern**
**File**: `2.B.-bria-retrieve.json`

**Key Patterns to Follow**:
1. **Webhook Trigger**: Receives data from Workflow 2A
2. **Exponential Backoff**: Retry logic with increasing delays
3. **Status Polling**: Checks Bria AI status until completion
4. **Binary Data Handling**: Downloads and processes completed images
5. **Fallback Mechanisms**: Uses original images if Bria AI fails

### **Workflow 3 (Book Assembly) - HTML Generation Pattern**
**File**: `3-book-assembly-production.json`

**Key Patterns to Follow**:
1. **Asset Loading**: Loads characters, backgrounds, and story text
2. **HTML Generation**: Creates complete multi-page HTML document
3. **PDF Generation**: Uses PDFMonkey for final PDF creation
4. **R2 Integration**: Uploads final book to storage
5. **Status Tracking**: Updates order status throughout process

**Critical Data Flow**:
```
Order Data → Load Assets → Generate HTML → Create PDF → Upload to R2 → Update Status
```

---

## 📋 **Workflow 1: Order Intake & Validation**

### **Purpose**
Receive and validate Amazon orders, extract character specifications, and queue for processing.

### **Current Status**
- ✅ Basic structure exists (`1-order-intake-validation.json`)
- ✅ Amazon SP-API integration started
- 🔄 Needs completion and testing

### **Integration Points**
**Input**: Amazon SP-API orders
**Output**: Validated orders for Workflow 2A
**Data Format**: Must match the mock order structure from Workflow 2A

### **Key Requirements**
1. **Amazon SP-API Integration**
   - Connect to Amazon Selling Partner API
   - Fetch orders from Amazon Custom listings
   - Parse order data and extract character specs

2. **Character Specification Extraction**
   - Child name, age, pronouns
   - Physical characteristics (skin tone, hair color, hair style)
   - Preferences (favorite color, animal guide, clothing style)
   - Hometown information

3. **Order Validation**
   - Validate required fields are present
   - Check for valid character specifications
   - Verify shipping address completeness

4. **Queue Management**
   - Add validated orders to processing queue
   - Set appropriate status flags
   - Handle duplicate order prevention

### **Files to Work On**
- `docs/n8n-workflow-files/n8n-new/1-order-intake-validation.json`
- `docs/AMAZON_INTEGRATION.md` (reference)

### **Dependencies**
- Amazon SP-API credentials
- Database for order storage
- Queue system (Redis or database-based)

---

## 🚚 **Workflow 4: Print & Fulfillment**

### **Purpose**
Submit completed books to Lulu Print-on-Demand, track printing progress, and handle shipping.

### **Current Status**
- ✅ Basic structure exists (`4-print-fulfillment.json`)
- ✅ Lulu API integration started
- 🔄 Needs completion and testing

### **Integration Points**
**Input**: Orders with status `book_assembly_completed` from Workflow 3
**Output**: Orders with status `fulfillment_completed`
**Data Format**: Must include `finalBookUrl` from Workflow 3

### **Key Requirements**
1. **Lulu Print-on-Demand Integration**
   - Submit PDF to Lulu for printing
   - Handle print job creation and tracking
   - Manage print specifications (8.5x8.5", softcover)

2. **Order Tracking**
   - Monitor print job progress
   - Track shipping information
   - Update order status throughout process

3. **Amazon Integration**
   - Confirm shipment with Amazon SP-API
   - Update order status in Amazon system
   - Handle tracking number submission

4. **Customer Communication**
   - Send shipping notifications
   - Provide tracking information
   - Handle delivery confirmations

### **Files to Work On**
- `docs/n8n-workflow-files/n8n-new/4-print-fulfillment.json`
- `docs/POD_INTEGRATION.md` (reference)

### **Dependencies**
- Lulu API credentials
- Amazon SP-API credentials
- SendGrid for email notifications

---

## 🔧 **Workflow 5: Error Recovery**

### **Purpose**
Handle **technical failures** and implement retry logic with exponential backoff. This is separate from human quality review.

### **Current Status**
- ✅ Basic structure exists (`5-error-recovery.json`)
- ✅ Error analysis logic implemented
- ✅ Safeguards added to avoid human review interference
- 🔄 Needs completion and testing

### **Integration Points**
**Input**: Failed orders from any workflow (1, 2A, 2B, 3, 4) - **TECHNICAL FAILURES ONLY**
**Output**: Retried orders or escalated orders for tech team review
**Data Format**: Must handle all order statuses and error types

### **🚨 CRITICAL: Distinction from Human Intervention**

| **Error Recovery (Workflow 5)** | **Human Intervention (Between 3 & 4)** |
|--------------------------------|----------------------------------------|
| **Handles**: Technical failures | **Handles**: Quality issues |
| **Examples**: API timeouts, network errors, service crashes | **Examples**: Character inconsistency, poor quality, wrong details |
| **Action**: Automatic retry with backoff | **Action**: Human reviewer approves/rejects |
| **Escalation**: To tech team | **Escalation**: To QA team |
| **Trigger**: Workflow crashes/fails | **Trigger**: Workflow completes but quality low |

### **Key Requirements**
1. **Failed Order Detection**
   - Query database for orders with `status` ending in `_failed`
   - **EXCLUDE** orders with `status: 'book_assembly_completed'` AND `human_approved: null`
   - Identify different error types (API, network, validation)
   - Prioritize orders by age and importance

2. **Error Analysis**
   - Categorize errors (OpenAI API, PDF generation, Lulu API, network)
   - Determine appropriate recovery strategy
   - Calculate retry delays with exponential backoff
   - Determine target workflow for retry

3. **Retry Logic**
   - Retry AI generation failures → Reset to `queued_for_processing`
   - Retry book assembly failures → Reset to `ai_generation_completed`
   - Retry print submission failures → Reset to `book_assembly_completed` (with `human_approved: true`)
   - Apply exponential backoff: 5min → 10min → 20min

4. **Escalation to Tech Team**
   - Escalate after max retries (3 attempts)
   - Send notifications to tech/admin team
   - Add to tech support queue (separate from human review queue)
   - Log all recovery attempts

5. **Safeguards**
   - **Never retry** orders in human review queue
   - **Never modify** `human_approved` status
   - **Only handle** technical failures, not quality issues

### **Error Recovery Strategies**
```javascript
{
  'openai_api_error': {
    strategy: 'retry_with_backoff',
    retryDelay: 300000, // 5 minutes
    targetStatus: 'queued_for_processing',
    targetWorkflow: '2.A.-bria-submit'
  },
  'pdf_generation_error': {
    strategy: 'retry_with_fallback',
    retryDelay: 600000, // 10 minutes
    targetStatus: 'ai_generation_completed',
    targetWorkflow: '3-book-assembly'
  },
  'lulu_api_error': {
    strategy: 'retry_with_auth_refresh',
    retryDelay: 900000, // 15 minutes
    targetStatus: 'book_assembly_completed',
    targetWorkflow: '4-print-fulfillment'
  }
}
```

### **Files to Work On**
- `docs/n8n-workflow-files/n8n-new/5-error-recovery.json`

### **Dependencies**
- Database access for failed orders
- Email notifications for tech team escalations
- Integration with other workflows for retries
- **Awareness of human review queue** (to avoid conflicts)

---

## 📊 **Workflow 6: Monitoring & Alerts**

### **Purpose**
Monitor system health, API costs, queue status, and send alerts for issues.

### **Current Status**
- ✅ Basic structure exists (`6-monitoring-alerts.json`)
- ✅ Health check logic implemented
- 🔄 Needs completion and testing

### **Integration Points**
**Input**: System metrics from all workflows
**Output**: Alerts and status reports
**Data Format**: Must monitor all workflow statuses and API usage

### **Key Requirements**
1. **System Health Monitoring**
   - Check n8n instance health
   - Monitor database connectivity
   - Check external API status (OpenAI, Lulu, Cloudflare R2)

2. **Cost Monitoring**
   - Track API usage and costs
   - Monitor daily budget utilization
   - Alert on cost anomalies

3. **Queue Monitoring**
   - Monitor processing queue status
   - Track average processing times
   - Alert on queue backlogs

4. **Quality Monitoring**
   - Validate generated image quality
   - Track success rates
   - Alert on quality issues

5. **Alert System**
   - Send critical alerts via email
   - Send warning alerts for monitoring
   - Log all monitoring data

### **Files to Work On**
- `docs/n8n-workflow-files/n8n-new/6-monitoring-alerts.json`

### **Dependencies**
- SendGrid for email alerts
- Database for logging
- External API status checks

---

## 🧪 **Workflow 7: Quality Assurance**

### **Purpose**
Validate generated content quality and ensure print specifications compliance.

### **Current Status**
- ✅ Basic structure exists (`7-quality-assurance.json`)
- ✅ Quality check logic implemented
- 🔄 Needs completion and testing

### **Integration Points**
**Input**: Completed orders from Workflow 3 (book assembly)
**Output**: Quality reports and validation results
**Data Format**: Must validate character images, PDFs, and print specs

### **Key Requirements**
1. **Character Consistency Checks**
   - Verify character appearance across all poses
   - Check skin tone, hair color, clothing consistency
   - Validate pose accuracy

2. **Image Quality Validation**
   - Check image resolution and dimensions
   - Verify background removal quality
   - Validate file formats and sizes

3. **PDF Quality Checks**
   - Verify PDF generation success
   - Check page count and layout
   - Validate print specifications

4. **Print Specification Compliance**
   - Verify 8.5x8.5" page size
   - Check 300 DPI resolution
   - Validate color mode and bleed requirements

5. **Quality Reporting**
   - Generate quality reports
   - Flag issues for manual review
   - Track quality metrics over time

### **Files to Work On**
- `docs/n8n-workflow-files/n8n-new/7-quality-assurance.json`

### **Dependencies**
- Image processing libraries
- PDF validation tools
- Quality metrics database

---

## 🔄 **Workflow 8: Cost Optimization**

### **Purpose**
Optimize AI generation costs and identify cost-saving opportunities.

### **Current Status**
- ✅ Basic structure exists (`8-cost-optimization.json`)
- ✅ Cost analysis logic implemented
- 🔄 Needs completion and testing

### **Integration Points**
**Input**: All workflows (monitors costs across entire system)
**Output**: Cost reports and optimization recommendations
**Data Format**: Must track costs from all API calls, storage, and processing

### **Key Requirements**
1. **Cost Analysis**
   - Analyze AI generation costs
   - Track API usage patterns
   - Identify cost optimization opportunities

2. **Character Caching**
   - Check for existing character generations
   - Implement character reuse logic
   - Reduce duplicate generation costs

3. **Prompt Optimization**
   - Analyze prompt effectiveness
   - Optimize prompt usage
   - Reduce generation failures

4. **Asset Cleanup**
   - Clean up old unused assets
   - Manage storage costs
   - Archive completed orders

5. **Cost Reporting**
   - Generate daily cost reports
   - Track cost trends
   - Suggest optimizations

### **Files to Work On**
- `docs/n8n-workflow-files/n8n-new/8-cost-optimization.json`

### **Dependencies**
- Cost tracking database
- Asset management system
- Reporting tools

---

## 🚨 **Current Issues & Debugging Status**

### **✅ RESOLVED ISSUES**

#### **1. Database Integration**
- **Status**: ✅ **COMPLETED** - Supabase database fully configured
- **Achievement**: Successfully integrated Workflow 1 with database
- **Result**: 3 test orders stored and ready for Developer A's workflows

#### **2. Workflow 1 Order Intake**
- **Status**: ✅ **COMPLETED** - Order intake and validation working
- **Achievement**: Mock data generation, validation, and database storage
- **Result**: Orders with `status: 'queued_for_processing'` ready for Workflow 2A

### **🔄 IN PROGRESS**

#### **3. Developer A Integration**
- **Status**: 🟡 **IN PROGRESS** - Developer A updating workflows 2A, 2B, 3
- **Action Required**: Developer A needs to integrate database queries
- **Dependencies**: Developer A's database integration completion

### **⏳ PENDING**

#### **4. Workflow 4: Print & Fulfillment**
- **Status**: 🟡 **READY TO START** - Next priority
- **Requirements**: Lulu POD integration, order tracking, Amazon shipment confirmation
- **Dependencies**: Developer A's Workflow 3 completion

#### **5. Workflows 5-8: Support Systems**
- **Status**: 🟡 **PENDING** - Error recovery, monitoring, quality assurance, cost optimization
- **Timeline**: After Workflow 4 completion

### **Workflow Status Summary**

| Workflow | Status | Critical Issues | Next Actions |
|----------|--------|----------------|--------------|
| **1 (Order Intake)** | ✅ **COMPLETED** | None | Ready for integration |
| **2A (Bria Submit)** | 🔄 **DEVELOPER A** | Database integration needed | Developer A updating |
| **2B (Bria Retrieve)** | 🔄 **DEVELOPER A** | Database integration needed | Developer A updating |
| **3 (Book Assembly)** | 🔄 **DEVELOPER A** | Database + human review needed | Developer A updating |
| **4 (Print Fulfillment)** | 🟡 **READY** | Needs implementation | Start with dummy data |
| **5 (Error Recovery)** | 🟡 **PENDING** | Needs implementation | After Workflow 4 |
| **6 (Monitoring)** | 🟡 **PENDING** | Needs implementation | After Workflow 4 |
| **7 (Quality Assurance)** | 🟡 **PENDING** | Needs implementation | After Workflow 4 |
| **8 (Cost Optimization)** | 🟡 **PENDING** | Needs implementation | After Workflow 4 |

### **Current Priority Order**
1. **Workflow 4: Print & Fulfillment** - Next immediate task
2. **Integration Testing** - Test with Developer A's updated workflows
3. **Workflows 5-8** - Support systems implementation
4. **End-to-End Testing** - Complete system validation

---

## 👥 **Human Intervention Workflow**

> **📖 FULL IMPLEMENTATION GUIDE**: See `docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md` for:
> - 3 implementation options (Manual via Supabase, Notion/Sheets, Custom Dashboard)
> - Complete code examples including a ready-to-deploy HTML dashboard
> - Notification systems (Email, Slack)
> - Security, authentication, and SLA tracking
> - **Quick Start**: Use Supabase dashboard directly for immediate testing (zero setup!)

### **Overview**
Between **Workflow 3 (Book Assembly)** and **Workflow 4 (Print & Fulfillment)**, there is a mandatory **Human Review & Approval** step to ensure quality before printing and shipping.

### **Integration Points**
- **Workflow 3** adds orders to `human_review_queue` when quality score < 0.8
- **Human reviewer** approves/rejects orders via dashboard
- **Workflow 4** only processes `human_approved: true` orders

### **Database Schema**
```sql
-- Human review queue (already created in database)
CREATE TABLE human_review_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    assigned_to VARCHAR(255),
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **Workflow 4 Integration**
Workflow 4 must check for human approval before processing:
```javascript
// Only process human-approved orders
const orders = await getOrdersFromDatabase({
    status: 'book_assembly_completed',
    human_approved: true, // Only human-approved orders
    lulu_job_id: null // Not yet submitted to print
});
```

### **Implementation Status**
- ✅ **Database Schema**: Created and ready
- ✅ **Documentation**: Complete in Developer A and B packages
- 🔄 **Developer A**: Implementing in Workflow 3
- ⏳ **Developer B**: Will integrate in Workflow 4

### **For Developer B: Workflow 4 Start Requirements**
When you begin Workflow 4, it must:
1. **Query only human-approved orders**:
   - `status = 'book_assembly_completed'`
   - `human_approved = true` (not null, specifically true)
   - `print_job_id IS NULL` (not yet submitted)
2. **Handle both auto-approved and manual-approved orders**:
   - High quality orders (score ≥ 0.8) auto-approved
   - Low quality orders (score < 0.8) require manual approval
3. **Skip orders in review queue**:
   - If `requires_human_review = true` AND `human_approved IS NULL`, skip
   - These are waiting for human reviewer

---

## 🗄️ **Database Setup Instructions**

### **Supabase Database Setup (Complete Guide)**

The Human-in-the-Loop Asset Review System requires a PostgreSQL database. We use Supabase for this, which provides a managed PostgreSQL database with a built-in dashboard.

#### **Step 1: Create Supabase Project**

1. **Go to Supabase**: https://supabase.com
2. **Sign up/Login** with your GitHub account
3. **Create New Project**:
   - Organization: Create new or use existing
   - Project Name: `little-hero-books`
   - Database Password: Generate strong password (save it!)
   - Region: Choose closest to your location
   - Pricing: Free tier is sufficient for development

4. **Wait for Setup**: Takes 2-3 minutes

#### **Step 2: Get Database Credentials**

1. **Go to Project Settings** → **API**
2. **Copy these values**:
   - Project URL: `https://[your-project-id].supabase.co`
   - Service Role Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long string)
   - Database Password: (the one you created)

#### **Step 3: Run Database Schema**

1. **Go to SQL Editor** in Supabase dashboard
2. **Create New Query**
3. **Copy and paste this complete schema**:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main orders table
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
    
    -- Human Review fields (for Human-in-the-Loop system)
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

-- Failed orders table (for error recovery)
CREATE TABLE failed_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    workflow_step VARCHAR(50),
    error_type VARCHAR(100),
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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

-- Create indexes for performance
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_amazon_order_id ON orders(amazon_order_id);
CREATE INDEX idx_orders_next_workflow ON orders(next_workflow);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_human_review_queue_status ON human_review_queue(status);
CREATE INDEX idx_human_review_queue_created_at ON human_review_queue(created_at);
CREATE INDEX idx_failed_orders_status ON failed_orders(error_type);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_human_review_queue_updated_at BEFORE UPDATE ON human_review_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert test data
INSERT INTO orders (amazon_order_id, status, next_workflow, character_specs, customer_name, customer_email) VALUES
('TEST-ORDER-001', 'queued_for_processing', '2.A.-bria-submit', 
 '{"childName": "Emma", "age": 5, "pronouns": "she/her", "skinTone": "medium", "hairColor": "brown", "hairStyle": "curly", "favoriteColor": "purple", "animalGuide": "unicorn", "clothingStyle": "dress"}',
 'Emma Johnson', 'emma.johnson@example.com'),
('TEST-ORDER-002', 'queued_for_processing', '2.A.-bria-submit',
 '{"childName": "Alex", "age": 4, "pronouns": "he/him", "skinTone": "light", "hairColor": "blonde", "hairStyle": "short", "favoriteColor": "blue", "animalGuide": "dinosaur", "clothingStyle": "t-shirt and shorts"}',
 'Alex Smith', 'alex.smith@example.com'),
('TEST-ORDER-1760504174618-929', 'queued_for_processing', '2.A.-bria-submit',
 '{"childName": "Adventure Hero", "age": 5, "pronouns": "they/them", "skinTone": "tan", "hairColor": "black", "hairStyle": "braided", "favoriteColor": "green", "animalGuide": "tiger", "clothingStyle": "adventure gear"}',
 'Adventure Hero', 'adventure.hero@example.com');
```

4. **Click "Run"** to execute the schema
5. **Verify tables created**: Check the "Table Editor" tab

#### **Step 4: Configure n8n Integration**

1. **Open n8n** (your n8n instance)
2. **Go to Credentials** → **Add Credential**
3. **Select "Supabase API"**
4. **Fill in**:
   - Host: `https://[your-project-id].supabase.co`
   - Service Role Key: (the long key from Step 2)
5. **Test Connection** and save

#### **Step 5: Test Database Connection**

1. **Create a simple n8n workflow**:
   - Add "Supabase" node
   - Operation: "read"
   - Table: "orders"
   - Click "Execute Node"
2. **Should return** the 3 test orders

#### **Step 6: Configure Environment Variables**

Add to your `.env` file:
```bash
# Supabase Database
SUPABASE_URL=https://[your-project-id].supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### **Database Connection Details**

#### **Supabase Configuration**
- ✅ **Status**: Fully operational and tested
- ✅ **Project URL**: `https://mdnthwpcnphjnnblbvxk.supabase.co`
- ✅ **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs`
- ✅ **n8n Credential**: Already configured and tested

#### **n8n Supabase Node Usage**
```javascript
// Example: Query orders for Workflow 4
// Use Supabase node with these settings:
// - Operation: "read"
// - Table: "orders"
// - Filters: Add using the UI
//   - status: eq.book_assembly_completed
//   - human_approved: eq.true
//   - print_job_id: is.null

// Or use Code node with REST API:
const orders = await this.helpers.request({
  method: 'GET',
  url: 'https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'Content-Type': 'application/json'
  },
  qs: {
    status: 'eq.book_assembly_completed',
    human_approved: 'eq.true',
    print_job_id: 'is.null',
    select: '*'
  },
  json: true
});
```

### **Database Schema Overview**
**Full schema available in**: `docs/database/little-hero-books-schema.sql`

**Key Tables for Developer B**:
```sql
-- Orders table (main table for all workflows)
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  amazon_order_id VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL,
  workflow_step VARCHAR(50) NOT NULL,
  next_workflow VARCHAR(50),
  
  -- Workflow 1 fields
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  shipping_address JSONB,
  character_specs JSONB,
  validated_at TIMESTAMP WITH TIME ZONE,
  
  -- Workflow 3 output (needed by Workflow 4)
  final_book_url TEXT,
  final_cover_url TEXT,
  human_approved BOOLEAN,
  qa_score DECIMAL(3, 2),
  
  -- Workflow 4 fields
  print_job_id VARCHAR(255),
  print_status VARCHAR(50),
  fulfillment_tracking_id VARCHAR(255),
  fulfillment_carrier VARCHAR(100),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Failed orders table (for Workflow 5)
CREATE TABLE failed_orders (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  workflow_step VARCHAR(50),
  error_type VARCHAR(100),
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Human review queue (for Workflow 3 → 4 handoff)
CREATE TABLE human_review_queue (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **API Credentials Needed**
- Amazon SP-API credentials
- Lulu Print-on-Demand API credentials
- SendGrid API credentials
- Cloudflare R2 credentials
- OpenAI API credentials

### **Environment Variables**
```bash
# Amazon SP-API
AMAZON_SP_API_CLIENT_ID=your_client_id
AMAZON_SP_API_CLIENT_SECRET=your_client_secret
AMAZON_SP_API_REFRESH_TOKEN=your_refresh_token

# Lulu Print-on-Demand
LULU_API_KEY=your_api_key
LULU_API_SECRET=your_api_secret

# SendGrid
SENDGRID_API_KEY=your_api_key

# Cloudflare R2
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_key
CLOUDFLARE_R2_BUCKET_NAME=little-hero-assets

# OpenAI
OPENAI_API_KEY=your_api_key
```

---

## 📁 **File Structure**

```
docs/n8n-workflow-files/n8n-new/
├── 1-order-intake-validation.json     # Workflow 1
├── 2-ai-character-generation.json     # Workflow 2A (Developer A)
├── 2.A.-bria-submit.json             # Workflow 2B (Developer A)
├── 2.B.-bria-retrieve.json           # Workflow 2B (Developer A)
├── 3-book-assembly-production.json    # Workflow 3 (Developer A)
├── 4-print-fulfillment.json          # Workflow 4 (Developer B)
├── 5-error-recovery.json             # Workflow 5 (Developer B)
├── 6-monitoring-alerts.json          # Workflow 6 (Developer B)
├── 7-quality-assurance.json          # Workflow 7 (Developer B)
└── 8-cost-optimization.json          # Workflow 8 (Developer B)
```

---

## 🎯 **Priority Order for Development**

### **Phase 1: Core Functionality (Week 1-2)**
1. **Workflow 1** - Order Intake & Validation
2. **Workflow 4** - Print & Fulfillment

### **Phase 2: Error Handling (Week 3)**
3. **Workflow 5** - Error Recovery

### **Phase 3: Monitoring & Quality (Week 4)**
4. **Workflow 6** - Monitoring & Alerts
5. **Workflow 7** - Quality Assurance

### **Phase 4: Optimization (Week 5)**
6. **Workflow 8** - Cost Optimization

---

## 🔗 **Integration Points with Developer A's Work**

### **From Workflow 2A/2B (Character Generation)**
- Receives orders with status `ai_generation_completed`
- Expects character images in R2 storage
- Provides character metadata for book assembly

### **To Workflow 3 (Book Assembly)**
- Sends orders with status `ready_for_book_assembly`
- Provides character image URLs and metadata
- Receives completed book PDFs

### **Data Flow**
```
Workflow 1 → Workflow 2A/2B → Workflow 3 → Workflow 4
     ↓              ↓              ↓           ↓
Workflow 5 ← Workflow 6 ← Workflow 7 ← Workflow 8
```

---

## 📞 **Communication Protocol**

### **Daily Standups**
- Share progress on assigned workflows
- Discuss any blockers or dependencies
- Coordinate integration points

### **Code Reviews**
- Review each other's workflow implementations
- Ensure consistent error handling patterns
- Validate integration points

### **Testing Strategy**
- Test individual workflows in isolation
- Test integration between workflows
- End-to-end testing with sample orders

---

## 🚀 **Getting Started**

1. **Set up development environment**
   - Install n8n locally or use cloud instance
   - Configure API credentials
   - Set up database connections

2. **Review existing workflows**
   - Study Workflow 2A/2B/3 implementations
   - Understand data structures and patterns
   - Review integration points

3. **Start with Workflow 1**
   - Focus on Amazon SP-API integration
   - Implement character specification extraction
   - Test with sample order data

4. **Iterate and test**
   - Test each workflow individually
   - Test integration with Developer A's work
   - Refine based on feedback

---

## 🔍 **Debugging Guide for Developer B**

### **Bria AI Integration Debugging**

#### **Step 1: Test Single Image**
```bash
# Test Bria AI API directly
curl -X POST "https://engine.prod.bria-api.com/v2/remove-background" \
  -H "api_token: eb0fed5156c441148c462a74d3f92f00" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_image_here",
    "format": "png"
  }'
```

#### **Step 2: Check Status URL Format**
- Verify status URL format: `https://engine.prod.bria-api.com/v2/status/{request_id}`
- Check if `request_id` matches between submit and status responses
- Verify API token is passed correctly in headers

#### **Step 3: Debug n8n Workflow**
1. **Enable Debug Mode**: Set `debug: true` in workflow settings
2. **Check Node Outputs**: Review each node's output in n8n interface
3. **Verify Data Flow**: Ensure data is passed correctly between nodes
4. **Check Error Logs**: Review n8n execution logs for errors

#### **Step 4: Test Polling Logic**
```javascript
// Test polling logic in Code node
const testStatus = async (statusUrl, token) => {
  try {
    const response = await this.helpers.request({
      method: 'GET',
      url: statusUrl,
      headers: { api_token: token },
      json: true,
    });
    
    console.log('Status Response:', JSON.stringify(response, null, 2));
    
    const status = response.status || response.data?.status || response.body?.status;
    const completed = ['COMPLETED','SUCCEEDED','DONE'].includes(status?.toUpperCase());
    
    console.log('Status:', status);
    console.log('Completed:', completed);
    
    return { status, completed, response };
  } catch (error) {
    console.error('Polling Error:', error);
    return { status: 'ERROR', completed: false, error: error.message };
  }
};
```

### **Character Positioning Debugging**

#### **Step 1: Test HTML Generation**
1. Open `test-book-complete.html` in browser
2. Check if all 14 pages are visible
3. Verify character positioning on each page
4. Check console for any CSS errors

#### **Step 2: Test PDF Generation**
1. Use PDFMonkey to generate test PDF
2. Verify page count (should be 14 pages)
3. Check character positioning in PDF
4. Verify background image sizing

#### **Step 3: Fix Positioning Issues**
1. Update character positioning in `3-book-assembly-production.json`
2. Apply scaling factors from test results
3. Test with actual PDF generation
4. Iterate until positioning is correct

### **Workflow Integration Testing**

#### **Step 1: Test Data Flow**
1. Start with Workflow 1 (Order Intake)
2. Verify data structure matches expected format
3. Test each workflow in sequence
4. Check data transformations at each step

#### **Step 2: Test Error Handling**
1. Introduce errors at each workflow
2. Verify error handling and recovery
3. Check error notifications and alerts
4. Test retry mechanisms

#### **Step 3: Test End-to-End**
1. Create test order with known data
2. Run complete workflow sequence
3. Verify final PDF output
4. Check all quality requirements

### **Common Issues and Solutions**

#### **Issue: "fetch is not defined"**
- **Solution**: Replace `fetch` with `this.helpers.request()`
- **Location**: All Code nodes making HTTP requests

#### **Issue: "401 Unauthorized"**
- **Solution**: Check API token format and headers
- **Location**: HTTP Request nodes

#### **Issue: "JSON parse error"**
- **Solution**: Add `JSON.parse()` for string responses
- **Location**: Code nodes processing API responses

#### **Issue: "Infinite loop in polling"**
- **Solution**: Add retry limits and proper status checking
- **Location**: Polling and retry nodes

#### **Issue: "Character not visible"**
- **Solution**: Check CSS positioning and z-index
- **Location**: HTML generation nodes

### **Monitoring and Alerts**

#### **Set Up Monitoring**
1. Enable n8n execution logs
2. Set up error notifications
3. Monitor API usage and costs
4. Track workflow performance

#### **Key Metrics to Monitor**
- Workflow execution time
- API call success rate
- Image generation success rate
- PDF generation success rate
- Error frequency and types

#### **Alert Thresholds**
- API error rate > 5%
- Workflow execution time > 5 minutes
- Image generation failure rate > 10%
- PDF generation failure rate > 5%

---

## 📚 **Additional Resources**

- **Project Documentation**: `docs/` directory
- **API Documentation**: Check individual service docs
- **n8n Documentation**: https://docs.n8n.io/
- **Amazon SP-API**: https://developer-docs.amazon.com/sp-api/
- **Lulu API**: https://www.lulu.com/en/help/api
- **SendGrid API**: https://docs.sendgrid.com/

---

## ❓ **Questions for Developer A**

1. What's the expected data structure for orders coming from Workflow 1?
2. Are there any specific error handling patterns I should follow?
3. What's the expected format for character metadata?
4. Are there any specific logging or monitoring requirements?
5. What's the expected timeline for integration testing?

---

## 📝 **Quick Reference Summary for Developer B**

### **✅ What You've Completed**
1. ✅ **Workflow 1**: Order Intake & Validation - COMPLETE
2. ✅ **Human-in-the-Loop Asset Review System** - COMPLETE & OPERATIONAL
   - ✅ Real-time monitoring dashboard at `/monitoring`
   - ✅ Sequential approval workflow (Pre-Bria → Post-Bria → Post-PDF)
   - ✅ R2 asset integration with Cloudflare storage
   - ✅ Error handling and monitoring system
   - ✅ File-based approval persistence
   - ✅ Search functionality with character hash support
   - ✅ Site rebranding to "Little Hero Labs"
   - ✅ UI/UX improvements and text readability
3. ✅ **Workflow 4**: Print & Fulfillment - COMPLETE
4. ✅ **Workflow 5**: Error Recovery - COMPLETE
5. ✅ **Workflow 6**: Monitoring & Alerts - COMPLETE
6. ✅ **Workflow 7**: Quality Assurance - COMPLETE
7. ✅ **Workflow 8**: Cost Optimization - COMPLETE

**ALL DEVELOPER B WORKFLOWS ARE COMPLETE!** 🎉
**HUMAN-IN-THE-LOOP REVIEW SYSTEM IS LIVE!** 🚀

### **🎯 What's Next (Priority Order)**
1. **Pre-Launch Marketing Preparation**: See new section below ⭐ **START NOW**
2. **Amazon Mock Data Testing**: Test complete flow with realistic Amazon order data
3. **Wait for Developer A**: Workflows 2A, 2B, 3 need database integration
4. **End-to-End Integration Testing**: Test complete workflow chain once Developer A completes their work
5. **Production Deployment**: Transition from testing to production (see "Transition from Testing to Production" section below)

### **🔑 Key Information You Need**

**Database Access**:
- URL: `https://mdnthwpcnphjnnblbvxk.supabase.co`
- Service Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs`
- n8n Credential: Already configured

**Workflow Files Location**:
- Your test workflows: `docs/n8n-workflow-files/n8n-new/developer-b-test-workflows/`
- Production workflows: `docs/n8n-workflow-files/n8n-new/`

**Key Integration Points**:
- **From Workflow 3**: `status = 'book_assembly_completed'` AND `human_approved = true`
- **To Workflow 4**: Query database for approved orders, submit to Lulu
- **Error Handling**: Use `failed_orders` table for Workflow 5

### **📞 Communication with Developer A**
- Developer A handling: Workflows 2A, 2B, 3
- Developer A adding: Database integration + human review
- You are ready: Workflow 1 complete, database operational
- Coordination: Once Developer A completes Workflow 3, you can test end-to-end

### **🚨 Important Reminders**
- ✅ Always use Supabase for all database operations
- ✅ Update `status` and `updated_at` fields in every workflow
- ✅ Log all major actions with console.log for debugging
- ✅ Test with dummy data first, then integrate with real data
- ✅ Check `human_approved = true` before processing in Workflow 4
- ⚠️ **TESTING vs PRODUCTION**:
  - **Testing** (now): Use `select: '*'` in Supabase queries to get all fields automatically
  - **Production** (later): Replace with specific field lists for better performance

---

## 🎬 **Pre-Launch Marketing & Preparation (NEW - START NOW)**

> **📖 COMPLETE GUIDE**: See `docs/PRE_LAUNCH_PREPARATION.md` for full competitive analysis, marketing strategy, timeline, and budget.

### **Overview**
While waiting for Developer A to complete Workflows 2A, 2B, and 3, Developer B should prepare all marketing assets and Amazon integration for launch. This work can proceed in parallel and will accelerate time-to-market.

### **Your Responsibilities (Developer B)**

#### **Phase 1: Amazon Mock Data Testing (Week 1)** ⏸️ ON HOLD

**Goal**: Validate entire workflow with realistic Amazon order data

**Status**: ⏸️ **ON HOLD** - Waiting for Developer A to complete Workflows 2A, 2B, 3

**Why on hold**: Workflow 4 needs PDF output from Workflow 3 (`final_book_url`). Can't test end-to-end without completed book generation workflows.

**Tasks** (will resume Week 3-4):
1. **Set Up Mock Amazon Data Workflow**
   - Location: `docs/amazon/mock-amazon-data-generator.js`
   - Follow: `AMAZON_INTEGRATION.md` section "PRE-LAUNCH TESTING"
   - Test: Generate 5 different customer profiles
   - Verify: All data formats match real Amazon SP-API structure

2. **Test Complete Order Flow**
   - Workflow 1: Order intake with mock Amazon data ✅ (already works)
   - ⏳ Wait for Developer A: Workflows 2A, 2B, 3
   - Workflow 4: Print fulfillment with actual PDFs
   - Document: Any issues or format mismatches

3. **Order Sample Books** (Week 3-4 after PDFs ready)
   - Order 3 test books from Lulu
   - Test different character combinations
   - Cost: ~$50-100
   - Use for: Product photography and quality verification

**Deliverables** (Week 3-4):
- [ ] Mock Amazon workflow tested and documented
- [ ] 5 test order profiles validated
- [ ] 3 sample books ordered from Lulu
- [ ] Issues/findings documented

**Current Action**: Focus on marketing tasks that don't require test PDFs (Phases 2-5 below)

#### **Phase 2: Amazon Listing Content (Weeks 1-2)** ✅ COMPLETED

**Goal**: Prepare all text content for Amazon Custom listing

**Status**: ✅ **DONE** - See `docs/AMAZON_LISTING_FINAL.md`

**Completed Tasks**:
1. ✅ **Write Amazon Listing Copy**
   - Product title (2 options, SEO-optimized)
   - 5 bullet points (plus 3 alternates for A/B testing)
   - Complete product description with specifications
   - Backend search terms (450 characters)

2. ✅ **Define Customization Fields**
   - 10 fields with help text and validation
   - Aligned with Workflow 1 parsing requirements
   - Dropdown options specified

3. ✅ **Write FAQ and Policies**
   - 8 FAQ responses ready
   - Return/refund policy included
   - Privacy policy basics included
   - Shipping information (3-5 business days)

**Deliverables**:
- [x] ~~Complete Amazon listing copy document~~ → `AMAZON_LISTING_FINAL.md`
- [x] ~~Customization fields specification~~ → Included in listing doc
- [x] ~~FAQ content (5-7 questions)~~ → 8 questions completed
- [x] ~~Return/refund policy draft~~ → Included in listing doc

#### **Phase 3: Product Images & Video (Weeks 2-3)** 

**Goal**: Coordinate with Developer A for Amazon listing assets

> **Note**: Developer A has design capability and will create product images

**Tasks**:
1. **Coordinate with Developer A**
   - Developer A will create all 7 Amazon product images (Week 3-4)
   - Review specifications together: `docs/AMAZON_LISTING_FINAL.md` (lines 113-152)
   - Provide feedback on drafts
   - Ensure images meet Amazon requirements

2. **Create Product Video** (15-30 seconds) - OPTIONAL
   - Screen recording: Entering child's name on Amazon Custom form
   - Page flips: Show 4-5 pages from sample book
   - Final shot: Printed book close-up
   - Format: Vertical 1080x1920 for social reuse
   - Tool: Phone camera + CapCut/iMovie
   - **Note**: Video is helpful but not required for launch

**Deliverables**:
- [ ] Review and approve Developer A's 7 product images
- [ ] (Optional) Create product video (15-30 sec)
- [ ] Organize assets for Amazon upload

#### **Phase 4: Social Media Content (Weeks 2-4)**
**Goal**: Create library of promotional content for launch

**Tasks**:
1. **Create 10 Short-Form Videos**
   - Format: 9:16 vertical, 12-20 seconds each
   - Complete shot list: `marketing.md` lines 464-537
   - Platforms: TikTok, Instagram Reels, YouTube Shorts
   - Priority videos (make first):
     1. Name reveal magic
     2. How it works (3 steps)
     3. Gift moment unboxing
     4. Personalization options
     5. Birthday/holiday context

2. **Create 15 Static Social Posts**
   - Mix: 5 product features, 5 emotional/lifestyle, 5 seasonal/gift
   - Tool: Canva templates
   - Platforms: Instagram, Facebook, Pinterest

3. **Set Up Social Media Accounts**
   - Instagram: @littleherolabs
   - TikTok: @littleherolabs
   - Facebook: Little Hero Labs
   - Pinterest: Little Hero Labs

**Deliverables**:
- [ ] 10 short-form videos created
- [ ] 15 static posts created
- [ ] Social media accounts created and branded
- [ ] Content calendar for first 2 months

#### **Phase 5: Website Landing Page (HOLDING PATTERN WORK)**
**Goal**: Build simple landing page at littleherolabs.com

**Status**: 🔄 **ACTIVE** - Perfect for holding pattern work while waiting for Developer A. Domain secured (littleherolabs.com).

**Platform**: Cloudflare Pages (free) - Developer B can build now

**Tasks** (Ready to start now):
1. **Set Up Cursor → Git → Cloudflare Automation**
   - Connect Cursor IDE to git repository
   - Set up Cloudflare Pages deployment
   - Configure automatic deploys on git push
   - Test deployment workflow

2. **Build One-Page Site**
   - Complete copy deck: `docs/MARKETING_ASSETS.md` - Website section
   - Sections: Hero, How It Works, Sample Pages, Quality, CTA
   - Email capture: Lead magnet (free printable coloring page)
   - CTA buttons: Link to Amazon listing

3. **Set Up Email Capture** (Optional)
   - Tool: ConvertKit (free up to 1,000 subscribers) or Mailchimp
   - Lead magnet: Personalized coloring page template
   - Welcome email sequence (3 emails)

**Deliverables** (Future):
- [ ] Cloudflare Pages deployment configured
- [ ] Landing page live at littleherolabs.com
- [ ] Email capture working (if implementing)
- [ ] Lead magnet created (if implementing)

**Note**: This is NOT required for MVP launch. Can be added anytime post-launch to build email list and enhance brand presence.

#### **Phase 6: Amazon Account Setup (Week 7 - After Workflow 3 Complete)**
**Goal**: Launch Amazon Custom listing

**Tasks**:
1. **Create Amazon Professional Seller Account**
   - Cost: $40/month
   - Timing: Only when ready to launch (Week 7+)
   - Account setup: 1-2 days

2. **Get SP-API Credentials**
   - Follow: `AMAZON_INTEGRATION.md` sections on SP-API setup
   - Save credentials securely
   - Do NOT implement yet (wait for Week 8)

3. **Create Amazon Custom Listing**
   - Upload all 7 images
   - Add product video
   - Paste listing copy
   - Configure 10 customization fields
   - Set initial price: $27.99 (launch pricing, reassess after sales)
   - Submit for approval (1-3 days)

4. **Set Up Amazon PPC Campaign**
   - Campaign type: Sponsored Products
   - Budget: $10-20/day to start
   - Keywords: 5-10 exact-match keywords
   - Reference: `docs/advertising_strategy.md`

**Deliverables**:
- [ ] Amazon Seller account active
- [ ] SP-API credentials obtained
- [ ] Amazon Custom listing approved
- [ ] Amazon PPC campaign ready

### **Timeline for Developer B Marketing Tasks**

| Week | Focus | Key Deliverables |
|------|-------|-----------------|
| **1** (Now) | Testing & Planning | Mock data tested, sample books ordered, designer hired |
| **2** | Content Writing | Amazon copy done, social accounts created, first 5 videos |
| **3** | Asset Creation | 7 product images, product video, remaining 5 social videos |
| **4** | Website & Polish | Landing page live, email system working, all posts scheduled |
| **5-6** | Integration Testing | Help with end-to-end workflow testing |
| **7** | Amazon Setup | Seller account, listing created and approved |
| **8** | Launch! | Go live, monitor, support first customers |

### **Budget Required (Developer B to Coordinate)**

#### One-Time Costs
- Product images: $300-500 (or $0 if DIY)
- Video content: $200-400 (or $0 if DIY)
- Sample books: $50-100
- **Total One-Time**: $550-1,000 (or $50-100 if all DIY)

#### Monthly Costs (Starting Week 7)
- Amazon Professional Seller: $40/month
- Amazon PPC: $300-600/month
- Website hosting: $5-15/month (Framer/Webflow) or $0 (Cloudflare Pages)
- Email service: $0-15/month
- **Total Monthly**: $345-670/month

### **Resources & References**

**Complete Marketing Guide**:
- 📁 `docs/PRE_LAUNCH_PREPARATION.md` - Master document with competitive analysis and full strategy

**Marketing Research**:
- 📁 `competitive-landscape.md` - Competitor analysis (10+ competitors identified)
- 📁 `marketing.md` - Detailed marketing strategy with ready-to-use copy

**Amazon Integration**:
- 📁 `docs/AMAZON_INTEGRATION.md` - Complete setup guide
- 📁 `docs/amazon/mock-amazon-data-generator.js` - Test data for workflows
- 📁 `docs/amazon/amazon-custom-listing-spec.md` - Complete listing copy
- 📁 `docs/amazon/sp-api-integration-code.md` - Code for Workflows 1 & 4

**Advertising Strategy**:
- 📁 `docs/advertising_strategy.md` - Channel recommendations and budgets

### **Success Criteria for Marketing Preparation**

Before launch (Week 8), Developer B must have:
- ✅ All 7 product images professional and ready
- ✅ Product video created and formatted
- ✅ Amazon listing copy finalized and approved
- ✅ 10+ social videos created and ready to post
- ✅ Landing page live with email capture working
- ✅ Amazon Seller account approved and configured
- ✅ Amazon Custom listing live and approved
- ✅ Sample books received and photographed
- ✅ Social media accounts created and branded

**If any of these are not ready, launch must be delayed.**

---

## 🔄 **HOLDING PATTERN WORK (Week 1-2)**

**Situation**: Waiting for Developer A to complete Workflows 2A, 2B, and 3 (database integration + human review system)

**Developer B Opportunity**: Build littleherolabs.com landing page while waiting

### **Immediate Tasks (This Week)**:

#### **Phase 1: Technical Setup (Days 1-2)**
1. **Set Up Cloudflare Pages Deployment**
   - Connect littleherolabs.com domain to Cloudflare Pages
   - Set up automatic deployment from git repository
   - Configure custom domain with SSL certificate
   - Test deployment workflow

2. **Analytics & Tracking Setup**
   - **Google Analytics 4**: Create property and install tracking code
   - **Google Search Console**: Add and verify domain
   - **Ahrefs**: Set up project and configure keyword tracking
   - **Amazon Attribution**: Set up tracking links for Amazon CTAs

#### **Phase 2: Landing Page Development (Days 3-5)**
3. **Build Landing Page Structure**
   - Create responsive one-page landing page
   - Include hero section with book preview
   - Add "Coming Soon" messaging
   - Include email capture for launch notifications
   - Implement Amazon CTA buttons with attribution tracking

4. **SEO Technical Foundation**
   - Create `robots.txt` and `sitemap.xml` files
   - Implement JSON-LD structured data (Organization, FAQ, Video)
   - Set up Google Analytics 4 custom events
   - Optimize for Core Web Vitals (LCP < 2.5s, CLS < 0.1, INP < 200ms)
   - Add proper meta tags, alt text, and structured data

#### **Phase 3: Content & Marketing Prep (Days 6-7)**
5. **Prepare for Amazon Launch**
   - Review Amazon listing copy (already complete)
   - Plan social media account creation
   - Prepare marketing materials
   - Set up email capture backend (ConvertKit/Mailchimp)

### **Why This Makes Sense**:
- ✅ **Independent work** - doesn't require Developer A's workflows
- ✅ **Domain secured** - littleherolabs.com ready to use
- ✅ **Free hosting** - Cloudflare Pages (no cost)
- ✅ **Future value** - landing page ready for post-launch marketing
- ✅ **Professional presence** - shows project legitimacy

---

## 📊 **Analytics & Tracking Setup Details**

### **Google Analytics 4 Setup**
**Purpose**: Track user behavior, conversions, and traffic sources
**Implementation**:
- Create GA4 property for littleherolabs.com
- Install tracking code in landing page
- Set up custom events: `cta_amazon_click`, `email_signup_submit`, `video_hero_play_6s`
- Configure conversion goals for Amazon clicks and email signups
- Set up enhanced ecommerce for future D2C functionality

### **Google Search Console Setup**
**Purpose**: Monitor search performance and technical SEO issues
**Implementation**:
- Add and verify littleherolabs.com domain
- Submit sitemap.xml
- Monitor Core Web Vitals
- Track keyword rankings and search impressions
- Set up email alerts for technical issues

### **Ahrefs Setup**
**Purpose**: Track keyword rankings and backlink growth
**Implementation**:
- Create Ahrefs project for littleherolabs.com
- Set up keyword tracking for target terms:
  - "personalized kids book"
  - "custom children's book"
  - "name book for kids"
  - "personalized story book"
- Monitor competitor backlinks and content gaps
- Track domain rating growth

### **Amazon Attribution Setup**
**Purpose**: Measure impact of website traffic on Amazon sales
**Implementation**:
- Set up Amazon Attribution account
- Create attribution links for all Amazon CTAs
- Track clicks from website to Amazon
- Measure conversion rates and revenue attribution
- Use UTM parameters for detailed tracking

### **Email Capture Backend Setup**
**Purpose**: Collect leads and build email list
**Options**:
- **ConvertKit**: Recommended for creators, good automation
- **Mailchimp**: Free tier available, easy setup
- **SendGrid**: Developer-friendly, good API integration

**Implementation**:
- Set up email service account
- Create email capture form
- Design welcome email sequence
- Set up lead magnet delivery (coloring page)
- Configure email automation workflows

---

## 🚀 **Transition from Testing to Production**

### **Current State (Testing Phase)**
All workflows currently use:
- ✅ **Manual Triggers**: For independent testing
- ✅ **Mock Data**: Generated within each workflow
- ✅ **Mock API Calls**: No real external API calls
- ✅ **Mock Database Updates**: Logged but not executed

### **Production State (After All Workflows Tested)**

#### **Phase 1: Replace Mock Data with Real Database Queries**
For each workflow, replace mock data generation with Supabase queries:

**Example - Workflow 4**:
```javascript
// CURRENT (Testing):
const mockApprovedOrders = [
  { amazon_order_id: 'TEST-ORDER-001', ... }
];

// PRODUCTION:
// Use Supabase node with:
// - Operation: read
// - Table: orders
// - Filters: status=eq.book_assembly_completed, human_approved=eq.true
```

#### **Phase 2: Change Manual Triggers to Cron Triggers**

| Workflow | Change From | Change To | Schedule |
|----------|------------|-----------|----------|
| **1** | Manual Trigger | Cron Trigger | Every 10 minutes: `*/10 * * * *` |
| **2A** | Manual Trigger | Cron Trigger | Every 5 minutes: `*/5 * * * *` |
| **2B** | Manual Trigger | Cron Trigger | Every 2 minutes: `*/2 * * * *` |
| **3** | Manual Trigger | Cron Trigger | Every 5 minutes: `*/5 * * * *` |
| **4** | Manual Trigger | Cron Trigger | Every 5 minutes: `*/5 * * * *` |
| **5** | Manual Trigger | Cron Trigger | Every 15 minutes: `*/15 * * * *` |
| **6** | Manual Trigger | Cron Trigger | Every 5 minutes: `*/5 * * * *` |
| **7** | Manual Trigger | Cron Trigger | Every 10 minutes: `*/10 * * * *` |
| **8** | Manual Trigger | Cron Trigger | Daily at midnight: `0 0 * * *` |

#### **Phase 3: Replace Mock API Calls with Real APIs**

**Workflow 1**:
- Replace "Generate Mock Orders" → Real Amazon SP-API HTTP Request
- Replace "Generate Order Items" → Real Amazon SP-API HTTP Request
- Keep Supabase storage (already real)

**Workflow 4**:
- Replace "Mock Submit to Lulu" → Real Lulu API HTTP Request
- Replace "Mock Send Confirmation Email" → Real SendGrid HTTP Request
- Replace "Mock Update Database" → Real Supabase update node

**Workflow 5**:
- Replace "Mock Update Database" → Real Supabase update nodes
- Replace "Mock Send Notification" → Real SendGrid HTTP Request

#### **Phase 4: Test End-to-End Integration**

1. **Start with Workflow 1**:
   - Run with real Amazon SP-API (or test order)
   - Verify order stored in Supabase with `status='queued_for_processing'`

2. **Verify Workflow 2A picks it up**:
   - Wait for cron trigger (or run manually)
   - Verify status changes to `ai_generation_in_progress`

3. **Continue through all workflows**:
   - Monitor database status changes
   - Check logs for errors
   - Verify each handoff works correctly

4. **Test Human Intervention**:
   - Create order with low quality score
   - Verify it goes to human review queue
   - Test approve/reject actions

5. **Test Error Recovery**:
   - Simulate API failure
   - Verify Workflow 5 detects and retries
   - Test escalation after max retries

#### **Phase 5: Production Deployment**

**Pre-Deployment Checklist**:
- [ ] All workflows tested individually with mock data
- [ ] All workflows updated with real database queries
- [ ] All workflows updated with cron triggers
- [ ] All mock API calls replaced with real APIs
- [ ] End-to-end test completed successfully
- [ ] Error recovery tested and working
- [ ] Human review process tested and working
- [ ] All API credentials configured in n8n
- [ ] Monitoring and alerts configured
- [ ] Backup and recovery plan in place

**Deployment Steps**:
1. Deploy workflows to production n8n instance
2. Configure all API credentials
3. Enable cron triggers (start with longer intervals)
4. Monitor first few orders closely
5. Gradually reduce cron intervals to target schedules
6. Set up monitoring dashboards
7. Document any issues and resolutions

### **How Workflows Connect in Production**

The **database is the glue** that connects all workflows:

```
Workflow 1 (Order Intake)
    ↓ writes to database
    status: 'queued_for_processing'
    next_workflow: '2.A.-bria-submit'
    ↓
Workflow 2A (AI Generation) - Cron reads database
    ↓ writes to database
    status: 'ai_generation_in_progress'
    ↓
Workflow 2B (Background Removal) - Cron reads database
    ↓ writes to database
    status: 'ai_generation_completed'
    next_workflow: '3-book-assembly'
    ↓
Workflow 3 (Book Assembly) - Cron reads database
    ↓ writes to database
    status: 'book_assembly_completed'
    requires_human_review: true/false
    ↓
Human Review (if needed)
    ↓ writes to database
    human_approved: true
    next_workflow: '4-print-fulfillment'
    ↓
Workflow 4 (Print & Fulfillment) - Cron reads database
    ↓ writes to database
    status: 'print_submission_in_progress'
    ↓
Workflow 5 (Error Recovery) - Cron monitors all *_failed statuses
Workflow 6 (Monitoring) - Cron monitors all statuses
Workflow 7 (Quality Assurance) - Cron checks quality metrics
Workflow 8 (Cost Optimization) - Daily analysis
```

**No direct workflow-to-workflow calls** - everything goes through the database!

---

**Good luck with the development! Let's build an amazing personalized book service together! 🚀📚**
