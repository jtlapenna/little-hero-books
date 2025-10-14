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

### **Developer A (Completed) - Reference Implementation**
- ✅ **Workflow 2A**: AI Character Generation (Bria AI Integration) - `2.A.-bria-submit.json`
- ✅ **Workflow 2B**: AI Character Generation (Background Removal) - `2.B.-bria-retrieve.json`  
- ✅ **Workflow 3**: Book Assembly & PDF Generation - `3-book-assembly-production.json`

### **Developer B (This Package) - To Complete**
- 🔄 **Workflow 1**: Order Intake & Validation - `1-order-intake-validation.json`
- 🔄 **Workflow 4**: Print & Fulfillment - `4-print-fulfillment.json`
- 🔄 **Workflow 5**: Error Recovery - `5-error-recovery.json`
- 🔄 **Workflow 6**: Monitoring & Alerts - `6-monitoring-alerts.json`
- 🔄 **Workflow 7**: Quality Assurance - `7-quality-assurance.json`
- 🔄 **Workflow 8**: Cost Optimization - `8-cost-optimization.json`

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
Handle failed orders and implement retry logic with exponential backoff.

### **Current Status**
- ✅ Basic structure exists (`5-error-recovery.json`)
- ✅ Error analysis logic implemented
- 🔄 Needs completion and testing

### **Integration Points**
**Input**: Failed orders from any workflow (1, 2A, 2B, 3, 4)
**Output**: Retried orders or escalated orders for manual review
**Data Format**: Must handle all order statuses and error types

### **Key Requirements**
1. **Failed Order Detection**
   - Query database for failed orders
   - Identify different error types
   - Prioritize orders by age and importance

2. **Error Analysis**
   - Categorize errors (API, network, validation, etc.)
   - Determine appropriate recovery strategy
   - Calculate retry delays with exponential backoff

3. **Retry Logic**
   - Retry AI generation failures
   - Retry book assembly failures
   - Retry print submission failures
   - Handle immediate retries for transient errors

4. **Escalation**
   - Escalate to manual review after max retries
   - Send notifications to admin team
   - Log all recovery attempts

### **Files to Work On**
- `docs/n8n-workflow-files/n8n-new/5-error-recovery.json`

### **Dependencies**
- Database access for failed orders
- Email notifications for escalations
- Integration with other workflows for retries

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

### **Critical Issues Requiring Immediate Attention**

#### **1. Bria AI Image Retrieval Failure**
- **Status**: 🔴 **CRITICAL** - No images successfully retrieved from Bria AI
- **Symptoms**: All items marked as `_STATUS: "FAILED"` despite `briaStatus: "IN_PROGRESS"`
- **Root Cause**: Status checking logic incorrectly marking `IN_PROGRESS` items as `FAILED`
- **Files Affected**: `2.A.-bria-submit.json`, `2.B.-bria-retrieve.json`
- **Debugging Steps Taken**:
  - ✅ Fixed `fetch` → `this.helpers.request()` conversion
  - ✅ Fixed API token authentication
  - ✅ Fixed JSON response parsing
  - ✅ Added proper retry counting mechanism
  - ✅ Implemented exponential backoff
  - ✅ Added comprehensive debugging logs
- **Next Steps**: 
  - Verify Bria AI API response format
  - Check status URL format and authentication
  - Test with single image to isolate issue

#### **2. Pose-to-Page Mapping Issues**
- **Status**: 🟡 **MEDIUM** - Some poses incorrectly mapped to pages
- **Symptoms**: 
  - `sitting-eating.png` saved as `pose07.png` instead of `pose09.png`
  - `pose09.png` contains two layered poses instead of single crouching pose
  - Beach scene (page 9) using incorrect images
- **Root Cause**: Image generation and naming logic in Workflow 2A
- **Files Affected**: `2.A.-bria-submit.json`
- **Next Steps**:
  - Fix pose sorting in "Prepare for S3 Upload" node
  - Strengthen AI prompts to prevent multiple poses
  - Verify pose-to-page mapping logic

#### **3. Character Positioning Issues**
- **Status**: 🟡 **MEDIUM** - Characters not positioned correctly in PDF
- **Symptoms**: Characters appearing off-page or incorrectly sized
- **Root Cause**: Scaling mismatch between test environment (612px) and PDF target (2550px)
- **Files Affected**: `3-book-assembly-production.json`, `test-book-complete.html`
- **Next Steps**:
  - Apply corrected positioning values to all pages
  - Test with actual PDF generation
  - Verify character visibility and sizing

### **Workflow Status Summary**

| Workflow | Status | Critical Issues | Next Actions |
|----------|--------|----------------|--------------|
| **2A (Bria Submit)** | 🔴 **BROKEN** | Bria AI retrieval failing | Debug API integration |
| **2B (Bria Retrieve)** | 🔴 **BROKEN** | Status checking logic broken | Fix status evaluation |
| **3 (Book Assembly)** | 🟡 **PARTIAL** | Character positioning issues | Apply positioning fixes |
| **1 (Order Intake)** | 🟡 **DRAFT** | Needs completion | Implement Amazon SP-API |
| **4 (Print Fulfillment)** | 🟡 **DRAFT** | Needs completion | Implement Lulu POD |
| **5 (Error Recovery)** | 🟡 **DRAFT** | Needs completion | Implement retry logic |
| **6 (Monitoring)** | 🟡 **DRAFT** | Needs completion | Implement alerting |
| **7 (Quality Assurance)** | 🟡 **DRAFT** | Needs completion | Implement validation |
| **8 (Cost Optimization)** | 🟡 **DRAFT** | Needs completion | Implement cost tracking |

### **Immediate Priority Order**
1. **Fix Bria AI integration** (Workflows 2A & 2B) - Blocking all image generation
2. **Fix character positioning** (Workflow 3) - Affecting final output quality
3. **Complete Order Intake** (Workflow 1) - Required for end-to-end testing
4. **Complete Print Fulfillment** (Workflow 4) - Required for production deployment

---

## 🛠️ **Technical Implementation Guide**

### **Database Schema**
```sql
-- Orders table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  amazon_order_id VARCHAR(50) UNIQUE,
  child_name VARCHAR(100),
  skin_tone VARCHAR(20),
  hair_color VARCHAR(20),
  hair_style VARCHAR(20),
  status VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Character generations table
CREATE TABLE character_generations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER,
  pose_number INTEGER,
  image_url VARCHAR(500),
  quality_score DECIMAL(3,2),
  created_at TIMESTAMP
);

-- Failed orders table
CREATE TABLE failed_orders (
  id SERIAL PRIMARY KEY,
  order_id INTEGER,
  error_type VARCHAR(100),
  error_message TEXT,
  retry_count INTEGER,
  next_retry_at TIMESTAMP
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

**Good luck with the development! Let's build an amazing personalized book service together! 🚀📚**
