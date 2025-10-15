# Developer B Package - Little Hero Books n8n Workflows

## 🎯 **Project Overview**

**Little Hero Books** is a personalized children's book service that generates custom stories through Amazon Custom listings and automated print-on-demand fulfillment. The system creates watercolor storybook-style books featuring personalized child characters in 12 different poses across various story scenes.

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

## 🛠️ **Technical Implementation Guide**

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
2. ✅ **Workflow 4**: Print & Fulfillment - COMPLETE
3. ✅ **Workflow 5**: Error Recovery - COMPLETE
4. ✅ **Workflow 6**: Monitoring & Alerts - COMPLETE
5. ✅ **Workflow 7**: Quality Assurance - COMPLETE
6. ✅ **Workflow 8**: Cost Optimization - COMPLETE

**ALL DEVELOPER B WORKFLOWS ARE COMPLETE!** 🎉

### **🎯 What's Next (Priority Order)**
1. **Wait for Developer A**: Workflows 2A, 2B, 3 need database integration
2. **End-to-End Integration Testing**: Test complete workflow chain once Developer A completes their work
3. **Production Deployment**: Transition from testing to production (see "Transition from Testing to Production" section below)

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
