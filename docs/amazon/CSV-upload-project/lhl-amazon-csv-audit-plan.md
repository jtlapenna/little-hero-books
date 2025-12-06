# Little Hero Labs - Amazon CSV Migration Audit Plan
## Comprehensive Audit & Documentation Strategy

**Document Version:** 1.0  
**Date:** December 6, 2024  
**Project:** Amazon RDT/CSV Migration  
**Reference:** lhl-amazon-csv-migration-plan.md

---

## Table of Contents

1. [Audit Objectives](#audit-objectives)
2. [Audit Scope](#audit-scope)
3. [Audit Methodology](#audit-methodology)
4. [Part A: n8n Workflow Audit](#part-a-n8n-workflow-audit)
5. [Part B: Backend/API Audit](#part-b-backendapi-audit)
6. [Documentation Standards](#documentation-standards)
7. [Audit Deliverables](#audit-deliverables)
8. [Timeline & Resources](#timeline--resources)

---

## Audit Objectives

### Primary Objectives

1. **Identify all touchpoints** where customer PII (name, email, shipping address) is currently received, processed, stored, or transmitted
2. **Map dependencies** to understand which components require customer data vs. which can operate without it
3. **Document current behavior** to establish baseline before making changes
4. **Create change requirements** with specific code/workflow modifications needed
5. **Identify risks** where removing customer data from API could cause failures

### Success Criteria

- [ ] 100% of customer data touchpoints identified and documented
- [ ] All workflows analyzed and categorized (needs changes / no changes)
- [ ] All API endpoints that handle customer data documented
- [ ] Complete list of required code changes with priority levels
- [ ] Risk assessment for each identified change
- [ ] Clear testing plan for validation

---

## Audit Scope

### In Scope

**n8n Workflows:**
- w0 - Order Intake Workflow
- w1.1 - Character Setup/Generation
- w2 - Book Creation/Assembly
- w3 - Finalization/QA
- w4 - Print Fulfillment
- All sub-workflows (sw0, sw1, sw2, sw3)
- Any additional workflows that interact with the orders table

**Backend/API:**
- Order creation API endpoints
- Order update API endpoints
- Order retrieval/query endpoints
- Webhook handlers (Amazon, Lulu, etc.)
- Any scheduled jobs/cron tasks related to orders
- Email notification systems
- Status update webhooks
- Database queries and stored procedures
- Any middleware that touches order data

**Data Structures:**
- Current API request/response formats
- Supabase `orders` table interactions
- JSONB field structures
- Data validation rules

### Out of Scope

- Character generation logic (unless it references customer data)
- Image processing workflows (unless they include customer info)
- Payment processing (not affected by this change)
- User authentication/authorization
- Non-order related features

---

## Audit Methodology

### Three-Phase Approach

```
Phase 1: Discovery & Mapping (n8n + Backend)
    ↓
Phase 2: Analysis & Documentation
    ↓
Phase 3: Change Requirements & Risk Assessment
```

### Documentation Standards

All audit findings will use standardized templates (see Documentation Standards section below) and be compiled into a master findings document.

---

## Part A: n8n Workflow Audit

### Overview

**Objective:** Examine all n8n workflows to identify where customer PII is expected, processed, or referenced.

**Method:** Manual review of each workflow with Jeff providing access to workflow exports or screenshots.

**Tools:** n8n workflow JSON exports or visual workflow diagrams.

---

### A.1: Workflow Audit Checklist

For each workflow, we will examine:

#### Information to Collect

1. **Workflow Metadata**
   - Workflow name and ID
   - Purpose/description
   - Trigger type (webhook, schedule, manual, etc.)
   - Position in order processing chain

2. **Customer Data Touchpoints**
   - [ ] Does it receive customer_name?
   - [ ] Does it receive customer_email?
   - [ ] Does it receive shipping_address?
   - [ ] Does it read these fields from Supabase?
   - [ ] Does it write these fields to Supabase?
   - [ ] Does it validate these fields?
   - [ ] Does it transform/format these fields?
   - [ ] Does it send these fields to external APIs?
   - [ ] Does it include these fields in notifications?
   - [ ] Does it use these fields in conditional logic?

3. **Data Flow Analysis**
   - Input: What data comes into the workflow?
   - Processing: What operations are performed?
   - Output: What data is passed to next workflow or stored?
   - External calls: What APIs/services are called with what data?

4. **Dependencies**
   - Does the workflow require customer data to function?
   - Can it proceed if customer data is NULL?
   - What happens if shipping_address is missing?
   - Are there validation rules that would fail?

5. **Error Handling**
   - What errors occur if customer data is missing?
   - Are there try/catch blocks around customer data operations?
   - What happens to the order if this workflow fails?

---

### A.2: Specific Workflow Audit Plans

#### Workflow: w0 (Order Intake)

**Priority:** CRITICAL - Entry point for all orders

**Quick Checklist:**
- [ ] Webhook payload structure - what fields come in?
- [ ] Where does it parse customer_name, customer_email, shipping_address?
- [ ] Supabase INSERT - which customer fields are set?
- [ ] Can workflow complete if customer data is NULL?

**Focus:** This is where API data enters the system. Must handle missing customer PII gracefully.

---

#### Workflows: w1.1, w2, w3 (Character/Book Processing)

**Priority:** MEDIUM - Should not need customer data

**Quick Check:**
- [ ] Any nodes reading customer_name, customer_email, shipping_address?
- [ ] Any personalizations using customer name?
- [ ] Can proceed if customer fields are NULL?

**Expected:** No changes needed (verify only)

---

#### Workflow: w4 (Print Fulfillment)

**Priority:** CRITICAL - Needs shipping address

**Quick Check:**
- [ ] How does it read shipping_address?
- [ ] What happens if shipping_address is NULL?
- [ ] Lulu API call - what address fields required?

**Expected Change:** Add IF shipping_address IS NULL → SKIP/QUEUE

---

#### Sub-workflows (sw0, sw1, sw2, sw3)

**Priority:** LOW - Verify no customer data references

**Quick Check:** Any nodes touching customer fields?

---

### A.3: n8n Audit Execution Process

**Step-by-Step Procedure:**

1. **Preparation**
   - Jeff exports each workflow as JSON or provides access to n8n instance
   - Create audit workspace folder
   - Set up documentation templates

2. **Workflow Review Session**
   - Review one workflow at a time
   - Screen share or export review
   - Fill out audit template in real-time
   - Ask clarifying questions
   - Take screenshots of critical nodes

3. **Documentation**
   - Complete audit template for each workflow
   - Create data flow diagrams
   - Compile findings into master document

4. **Review & Validation**
   - Jeff reviews findings
   - Correct any misunderstandings
   - Confirm change requirements

---

### A.4: Data Flow Mapping

Create visual maps showing:

```
Current State Data Flow:
Amazon API → w0 [receives ALL data including PII] → Supabase [stores ALL fields]
             ↓
           w1.1 [reads what?] → w2 [reads what?] → w3 [reads what?]
                                                      ↓
                                                    w4 [reads shipping_address] → Lulu API

Future State Data Flow:
Amazon API → w0 [receives ONLY book/customization data] → Supabase [customer fields NULL]
             ↓
           w1.1 [unchanged] → w2 [unchanged] → w3 [unchanged]
                                                 ↓
CSV Upload → Backend → Supabase [UPDATE customer fields]
                           ↓
                         w4 [checks if shipping_address populated]
                           ↓ YES
                         Lulu API
```

---

## Part B: Backend/API Audit

### Overview

**Objective:** Examine all backend code and API endpoints that interact with customer PII in the orders table.

**Method:** Cursor agent will analyze codebase using provided instructions.

**Output:** Structured findings document following the template provided.

---

### B.1: Instructions for Cursor Agent

```markdown
# Backend/API Audit Instructions

## Your Task
Find everywhere customer PII is handled in the orders system:
- `customer_name`
- `customer_email`
- `shipping_address`

## What to Find
1. API endpoints that expect/return customer data
2. Database queries inserting/updating customer fields
3. Validation requiring customer fields
4. External APIs receiving customer data (especially Lulu)
5. Webhooks/notifications including customer data

## Output Format
For each finding:
```json
{
  "location": "file.js:123",
  "type": "API endpoint | DB query | validation | external API | notification",
  "customer_fields": ["customer_name", "customer_email", "shipping_address"],
  "change_needed": "One sentence description",
  "priority": "P0 | P1 | P2 | P3",
  "effort": "15min | 30min | 1hr | 2hr"
}
```

## Search Terms
- customer_name, customerName
- customer_email, customerEmail
- shipping_address, shippingAddress

## Focus Areas
- Order creation endpoints
- Supabase INSERT/UPDATE
- Validation schemas
- Lulu API integration
- Email services

## Keep It Simple
- List facts only
- Don't explain what things do
- Just: location, what customer data it touches, what needs to change
```

---

### B.2: Backend Audit Execution Process

**Step-by-Step:**

1. **Provide Cursor agent with instructions** (section B.1 above)

2. **Cursor agent scans codebase** and generates findings

3. **Review Cursor findings** for accuracy and completeness

4. **Cross-reference with n8n audit** to ensure no gaps

5. **Compile into master findings document**

---

### B.3: Backend Audit Deliverables

Cursor agent should produce:

1. **JSON Audit Report** - Structured findings following the template
2. **Summary Document** - Human-readable overview of findings
3. **Change Requirements List** - Prioritized list of code changes needed
4. **Risk Assessment** - What could go wrong with each change
5. **Testing Plan** - How to validate each change

---

## Documentation Standards

### LEAN Documentation Principles

**Only include:**
1. What touches customer data
2. Specific code changes needed
3. Priority (P0/P1/P2/P3) and effort estimate
4. Testing checklist

**DO NOT include:**
- Long descriptions of current behavior (just state the facts)
- Multiple data flow diagrams (one simple one if needed)
- Repetitive explanations
- Extensive risk analysis (brief notes only)
- Document history tables
- Multiple versions of same information

### Simple Finding Format

```markdown
### [Node/Component Name]

**Customer Data:** customer_name | customer_email | shipping_address | none
**Change Needed:** [Specific change in 1-2 sentences]
**Priority:** P0 | P1 | P2 | P3
**Effort:** 15min | 30min | 1hr | 2hr
**Code Change:** [Brief snippet or description]
```

---

## Audit Deliverables

### Single Consolidated Document

**File:** `lhl-amazon-csv-audit-findings.md`

**Structure:**
```markdown
# Amazon CSV Migration - Audit Findings

## n8n Workflows

### w0 - Order Intake
[Node]: [customer data] | [change needed] | [priority] | [effort]
[Node]: [customer data] | [change needed] | [priority] | [effort]

### w1.1 - Character Setup
[Brief findings]

[etc. for all workflows]

## Backend/API
[Component]: [customer data] | [change needed] | [priority] | [effort]

## Summary
- Total changes: X
- P0 critical: X
- Total effort: Xh

## Testing Checklist
- [ ] Test 1
- [ ] Test 2
```

**That's it.** One lean document with essential facts only.

---

## Timeline & Resources

### Estimated Timeline

**n8n Workflow Audit:**
- Preparation: 0.5 days
- w0 audit: 1 day
- w1.1, w2, w3 audit: 1 day
- w4 audit: 1 day
- Sub-workflows: 0.5 days
- Documentation: 1 day
- **Total: 5 days**

**Backend/API Audit:**
- Cursor agent scan: 0.5 days
- Review findings: 1 day
- Documentation: 0.5 days
- **Total: 2 days**

**Consolidation & Review:**
- Merge findings: 0.5 days
- Create change requirements: 1 day
- Risk assessment: 0.5 days
- **Total: 2 days**

**Overall Audit Timeline: 9 days (aggressive) to 12 days (conservative)**

### Resource Requirements

**For n8n Audit:**
- Jeff: Export workflows, review findings
- Claude: Analyze workflows, document findings
- Tools: n8n access, documentation templates

**For Backend Audit:**
- Cursor agent: Codebase scanning
- Jeff: Review agent findings, answer questions
- Tools: Code access, search tools

**For Documentation:**
- Shared document repository
- Markdown editor
- Diagram tools (optional)

---

## Success Criteria

Audit is complete when:

- [ ] All workflows (w0, w1.1, w2, w3, w4, sub-workflows) reviewed
- [ ] All customer data touchpoints identified
- [ ] All API endpoints analyzed
- [ ] All database queries documented
- [ ] All webhook handlers examined
- [ ] All notification systems reviewed
- [ ] Master audit findings document completed
- [ ] Change requirements matrix created
- [ ] Data flow diagrams completed
- [ ] Testing checklist created
- [ ] Risk assessment completed
- [ ] Implementation roadmap created
- [ ] Jeff has reviewed and approved all findings

---

## Next Steps After Audit

Once audit is complete:

1. **Review findings** with Jeff
2. **Prioritize changes** based on risk and dependencies
3. **Create detailed implementation plan** (Phase 2 of main project)
4. **Begin modifications** starting with P0 critical items
5. **Build CSV upload system** (Phase 3 of main project)

---

## Appendix: Quick Reference

### Customer PII Fields in orders Table
- `customer_name` (varchar 255, nullable)
- `customer_email` (varchar 255, nullable)
- `shipping_address` (jsonb, nullable)

### Key Questions for Every Component
1. Does it receive customer PII?
2. Does it store customer PII?
3. Does it read customer PII?
4. Does it send customer PII?
5. Does it validate customer PII?
6. Can it function if customer PII is NULL?

### Priority Definitions
- **P0-Critical:** System breaks without this fix
- **P1-High:** Important for proper operation
- **P2-Medium:** Nice to have, improves UX
- **P3-Low:** Minor improvements

### Risk Definitions
- **Critical:** Could cause data loss or system failure
- **High:** Could cause significant issues or errors
- **Medium:** Could cause minor issues
- **Low:** Minimal risk

---

**Document Version:** 1.0  
**Last Updated:** December 6, 2024  
**Next Review:** After audit completion
