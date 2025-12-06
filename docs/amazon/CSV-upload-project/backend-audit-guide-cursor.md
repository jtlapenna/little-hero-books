# Backend/API Audit Guide for Cursor Agent
## Little Hero Labs - Amazon CSV Migration

---

## Your Mission

Find every place in the backend codebase where these 3 customer fields are used:
- `customer_name`
- `customer_email`
- `shipping_address`

**Why:** Amazon API will stop sending customer data. Orders will be created with these fields = NULL. CSV upload will populate them later.

**Your job:** Find what will break when these fields are NULL initially.

---

## What to Search For

### Search Terms
```
customer_name
customerName
customer_email
customerEmail
shipping_address
shippingAddress
shipping_phone
phone_number
```

### File Types to Check
- API routes/controllers
- Service files
- Database queries (Supabase, SQL, ORM)
- Validation schemas (Joi, Yup, Zod, etc.)
- Webhook handlers
- Email/notification services
- External API integrations (especially Lulu)
- Scheduled jobs/cron tasks

---

## What to Report

For each finding, report:

```json
{
  "file": "src/api/orders.js:45",
  "type": "API endpoint | validation | database | external API | notification",
  "customer_fields": ["customer_name", "customer_email", "shipping_address"],
  "current_behavior": "One sentence what it does now",
  "issue": "What breaks if field is NULL",
  "fix": "What needs to change",
  "priority": "P0 | P1 | P2",
  "effort": "15min | 30min | 1hr | 2hr"
}
```

---

## Priority Guide

**P0 - Critical (Will Break System):**
- Order creation endpoints that REQUIRE customer fields
- Validation that rejects NULL customer fields
- Database queries with NOT NULL checks
- External APIs that crash without customer data

**P1 - High (Important but not blocking):**
- Notifications that assume customer data exists
- Webhooks that include customer data
- Logging/analytics that reference customer fields

**P2 - Medium (Nice to have):**
- Optional notifications
- Non-critical validations
- UI/UX improvements

---

## Key Questions to Answer

1. **Order Creation:** Can an order be created with NULL customer fields?
2. **Validation:** What validation will fail if customer data is missing?
3. **Print Fulfillment:** Does anything besides Lulu need shipping_address?
4. **Notifications:** What emails/webhooks include customer data?
5. **Background Jobs:** Do any cron jobs assume customer data exists?

---

## Common Patterns to Look For

### ✅ Safe Patterns (No Changes Needed)
```javascript
// Uses optional chaining and null coalescing
const email = order.customer_email || 'default@example.com';
const name = order.customer_name ?? 'Guest';
if (order.shipping_address?.city) { ... }
```

### ⚠️ Unsafe Patterns (Needs Changes)
```javascript
// Requires field to exist
if (!order.customer_name) {
  throw new Error('Customer name required');
}

// Validation marks as required
customerEmail: Joi.string().required()

// Direct access without null check
const city = order.shipping_address.city; // Will crash if NULL
```

---

## Example Findings

### Example 1: Order Creation Endpoint
```json
{
  "file": "src/api/orders.js:78",
  "type": "API endpoint",
  "customer_fields": ["customer_email", "shipping_address"],
  "current_behavior": "POST /api/orders validates customer_email is required",
  "issue": "Will reject orders without customer_email",
  "fix": "Change validation to allow NULL, mark as optional",
  "priority": "P0",
  "effort": "15min"
}
```

### Example 2: Lulu Integration
```json
{
  "file": "src/integrations/lulu.js:145",
  "type": "external API",
  "customer_fields": ["shipping_address"],
  "current_behavior": "Sends shipping_address directly to Lulu API",
  "issue": "Will crash if shipping_address is NULL",
  "fix": "Add check: if (!shipping_address) skip/queue order",
  "priority": "P0",
  "effort": "30min"
}
```

### Example 3: Email Notification
```json
{
  "file": "src/services/email.js:56",
  "type": "notification",
  "customer_fields": ["customer_name", "customer_email"],
  "current_behavior": "Sends order confirmation to customer_email",
  "issue": "Will fail if customer_email is NULL",
  "fix": "Add null check, skip email if missing, or delay until CSV upload",
  "priority": "P1",
  "effort": "30min"
}
```

---

## Output Format

Create a JSON file with your findings:

```json
{
  "audit_date": "2024-12-06",
  "findings": [
    {
      "file": "...",
      "type": "...",
      "customer_fields": [...],
      "current_behavior": "...",
      "issue": "...",
      "fix": "...",
      "priority": "...",
      "effort": "..."
    }
  ],
  "summary": {
    "total_findings": 0,
    "p0_critical": 0,
    "p1_high": 0,
    "p2_medium": 0,
    "estimated_total_effort": "Xh"
  }
}
```

---

## Specific Areas to Check

### 1. Order Creation
**Look for:** API endpoints that create orders
**Check:** Are customer_name, customer_email, shipping_address required?
**Expected finding:** These should be made optional/nullable

### 2. Order Validation
**Look for:** Validation schemas (Joi, Yup, Zod)
**Check:** Are customer fields marked as `.required()`?
**Expected finding:** Remove required constraint, allow null

### 3. Database Operations
**Look for:** INSERT/UPDATE to orders table
**Check:** Are customer fields set? Any NOT NULL checks?
**Expected finding:** Should allow NULL values

### 4. Lulu Print API
**Look for:** Integration with Lulu for print fulfillment
**Check:** How is shipping_address used? What happens if NULL?
**Expected finding:** Need to add NULL check before calling Lulu

### 5. Email Services
**Look for:** Order confirmation emails, notifications
**Check:** Do they use customer_name or customer_email?
**Expected finding:** Add null checks or delay until customer data available

### 6. Webhooks
**Look for:** Outgoing webhooks to external systems
**Check:** Do they include customer data in payload?
**Expected finding:** Handle null gracefully or exclude from payload

### 7. Background Jobs
**Look for:** Cron jobs, scheduled tasks
**Check:** Do they assume customer data exists?
**Expected finding:** Add WHERE clause to filter out orders without customer data

---

## What NOT to Flag

**Ignore these:**
- Test files (*.test.js, *.spec.js)
- Mock data generators
- Comments or documentation
- Fields other than the 3 customer fields (product_info, character_specs, etc. will still come from API)

---

## Tips for Efficiency

1. Start with a global search for "customer_email" - this will find most touchpoints
2. Check validation schemas first - these are often the blocker
3. Look at the order creation flow - this is where API data enters the system
4. Check any code that calls external APIs (Lulu, email services, etc.)
5. Don't analyze every occurrence deeply - just flag locations and move on

---

## Success Criteria

Your audit is complete when you've:
- [ ] Searched all customer field variations
- [ ] Checked API endpoints for order creation/update
- [ ] Reviewed validation schemas
- [ ] Found external API integrations
- [ ] Identified notification/email systems
- [ ] Located any background jobs
- [ ] Created JSON output file
- [ ] Estimated total effort

---

## Questions? Red Flags?

**If you find something unexpected:**
- Flag it in your findings
- Note the concern in "issue" field
- Continue scanning - don't block on questions

**Expected pattern:**
Most findings will be in:
- Order creation API endpoint
- Validation schemas
- Lulu integration
- Email services

**Common total findings:** 5-15 locations

---

## Final Notes

- Focus on FACTS, not explanations
- Be thorough but don't overthink
- When in doubt, flag it and move on
- Your output will help prioritize what to fix first
- Estimated time to complete: 30-60 minutes
