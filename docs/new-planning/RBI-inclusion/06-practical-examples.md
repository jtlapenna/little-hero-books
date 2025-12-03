# Practical RBI Examples for Little Hero Books

**Real use cases with concrete examples from your actual system**

---

## Example 1: Catch Invalid Orders Before Expensive AI Calls

### The Problem
You've had issues with orders getting stuck because of invalid data:
- Missing required fields (name, age, hair color)
- Invalid field names (`orderId` vs `amazon_order_id`)
- Incomplete character specs
- Orders proceed to expensive Bria AI generation even with bad data

### How RBI Helps
**Before Bria AI call (Workflow 2A):**
```javascript
// In n8n workflow, after order intake, before character generation:

// 1. Validate order with RBI
const rbiValidation = await fetch('http://localhost:3001/field/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: {
      amazon_order_id: order.amazon_order_id,
      character_specs: order.character_specs,
      shipping_address: order.shipping_address
    }
  })
}).then(r => r.json());

// 2. Check if valid
if (!rbiValidation.verified || rbiValidation.confidence < 0.8) {
  // Skip expensive Bria AI call
  // Mark order for manual review
  await updateOrderStatus(order.amazon_order_id, 'requires_human_review');
  return; // Don't proceed to character generation
}

// 3. Only proceed if RBI says it's good
// Continue to Bria AI generation...
```

**Real Value:**
- **Cost Savings:** Skip $6 Bria AI call for invalid orders
- **Time Savings:** Don't waste 30-60 seconds on bad data
- **Error Prevention:** Catch issues before they cause workflow failures

**Real Example from Your System:**
- Order `JOHN-TEST3` had invalid `orderId` field → Would have been caught by RBI
- Orders with missing `character_specs` → RBI would flag before Bria AI

---

## Example 2: Find Similar Orders (Beyond Exact Hash Match)

### The Problem
Your `characterHash` only finds **exact** matches. But what about:
- "Emma" vs "Emmy" (same order, different spelling)
- Age 4 vs Age 5 (very similar, could reuse assets)
- Same hair/skin but different name (could share base character)

### How RBI Helps
**Before generating new character:**
```javascript
// After calculating characterHash, check for similar orders:

const similarOrders = await fetch('http://localhost:3001/field/neighbors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: {
      text: {
        name: order.character_specs.childName,
        age: order.character_specs.age,
        hairColor: order.character_specs.hairColor,
        skinTone: order.character_specs.skinTone
      }
    },
    candidates: existingOrders.map(o => ({
      id: o.amazon_order_id,
      text: {
        name: o.character_specs.childName,
        age: o.character_specs.age,
        hairColor: o.character_specs.hairColor,
        skinTone: o.character_specs.skinTone
      }
    })),
    topN: 3
  })
}).then(r => r.json());

// Check if any are similar enough to reuse
const verySimilar = similarOrders.neighbors.find(n => n.score > 0.90);
if (verySimilar) {
  // Reuse existing character from similar order
  console.log(`Found similar order: ${verySimilar.id} (similarity: ${verySimilar.score})`);
  // Reuse characterHash from similar order
  order.characterHash = existingOrders.find(o => o.amazon_order_id === verySimilar.id).characterHash;
  // Skip character generation, proceed to pose generation
} else {
  // No similar order found, generate new character
  // Continue with Bria AI...
}
```

**Real Value:**
- **Cost Savings:** Reuse existing characters for similar orders (save $6 per reuse)
- **Consistency:** Similar orders get similar characters
- **Efficiency:** Don't regenerate what you already have

**Real Example:**
- Order for "Emma" age 4, blonde, fair → Find existing "Emmy" age 4, blonde, fair (score: 0.95)
- Reuse existing character instead of generating new one

---

## Example 3: Detect Recurring Workflow Errors

### The Problem
You've had recurring issues:
- Invalid field names (`orderId` vs `amazon_order_id`) causing silent failures
- Supabase upsert failures
- Workflow trigger failures (webhook inactive)
- Orders stuck in `processing` state

### How RBI Helps
**Collect errors and analyze patterns:**
```javascript
// In error handler node, collect error data:

const errors = [
  {
    error: "Supabase upsert failed",
    workflow: "W0",
    node: "Supabase Upsert",
    orderId: "JOHN-TEST3",
    details: "Invalid field: orderId"
  },
  {
    error: "Supabase upsert failed",
    workflow: "W0",
    node: "Supabase Upsert",
    orderId: "JESSICA-CUNT",
    details: "Invalid field: orderId"
  },
  // ... more errors
];

// Send to RBI for pattern detection
const patterns = await fetch('http://localhost:3001/field/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: errors.map(e => `${e.workflow}:${e.node}:${e.error}:${e.details}`).join('\n')
  })
}).then(r => r.json());

// RBI identifies: "Invalid field: orderId" appears in 15 errors
// Action: Fix the field name issue
```

**Real Value:**
- **Proactive:** Catch patterns before they affect many orders
- **Root Cause:** Identify common issues (like `orderId` field problem)
- **Prevention:** Fix patterns instead of individual errors

**Real Example from Your System:**
- `orderId` field issue affected multiple orders → RBI would detect pattern
- Webhook inactive errors → RBI would group them together

---

## Example 4: Validate Customer Corrections

### The Problem
Customer corrections come in various formats:
- Some have clear reasons, some don't
- Some need urgent attention, some don't
- Manual review is time-consuming

### How RBI Helps
**Categorize and prioritize corrections:**
```javascript
// When customer submits correction:

const correction = {
  reason: "wrong_character_appearance",
  message: "The hair color is wrong, it should be darker",
  orderId: "ORDER-123"
};

// Validate correction quality
const validation = await fetch('http://localhost:3001/field/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: correction.message,
    categoryAssociations: [1] // Customer correction category
  })
}).then(r => r.json());

// Check if correction is coherent and actionable
if (validation.verified && validation.confidence > 0.8) {
  // High-quality correction, prioritize
  correction.priority = 'high';
  correction.actionable = true;
} else {
  // Low-quality correction, needs review
  correction.priority = 'low';
  correction.actionable = false;
}

// Find similar past corrections
const similar = await fetch('http://localhost:3001/field/neighbors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: { text: correction.message },
    candidates: pastCorrections.map(c => ({
      id: c.id,
      text: c.message
    })),
    topN: 3
  })
}).then(r => r.json());

// If similar correction was resolved before, use same solution
if (similar.neighbors[0]?.score > 0.85) {
  const pastCorrection = pastCorrections.find(c => c.id === similar.neighbors[0].id);
  correction.suggestedSolution = pastCorrection.resolution;
}
```

**Real Value:**
- **Efficiency:** Prioritize urgent corrections
- **Consistency:** Reuse solutions for similar corrections
- **Quality:** Filter out incoherent corrections

---

## Example 5: Validate Story Content Before PDF Generation

### The Problem
LLM-generated stories might have:
- Name not used naturally
- Age-inappropriate content
- Too long/short for page limits
- Missing required elements

### How RBI Helps
**Before PDF generation (Workflow 3):**
```javascript
// After story generation, validate before PDF:

const storyValidation = await fetch('http://localhost:3001/field/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: {
      story: generatedStory.text,
      childName: order.character_specs.childName,
      age: order.character_specs.age,
      pageCount: generatedStory.pages.length,
      wordCount: generatedStory.totalWords
    }
  })
}).then(r => r.json());

// Check coherence
if (!storyValidation.verified || storyValidation.confidence < 0.75) {
  // Story has issues, regenerate or flag for review
  await flagOrderForReview(order.amazon_order_id, 'story_quality_issue');
  // Regenerate story or send to human review
}
```

**Real Value:**
- **Quality:** Catch bad stories before PDF generation
- **Cost:** Avoid regenerating PDFs for bad stories
- **Consistency:** Ensure stories meet quality standards

---

## Example 6: Validate Manifest Structure

### The Problem
Manifests can have:
- Missing required fields
- Invalid pose numbers
- Missing image URLs
- Inconsistent structure

### How RBI Helps
**After manifest creation:**
```javascript
// Validate manifest before storing:

const manifestValidation = await fetch('http://localhost:3001/field/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: manifest, // Full manifest JSON
    categoryAssociations: [2] // Manifest category
  })
}).then(r => r.json());

// Check if manifest is coherent
if (!manifestValidation.verified) {
  // Manifest has issues, check decisionTrail
  console.error('Manifest validation failed:', manifestValidation.decisionTrail);
  // Fix manifest or flag for review
}
```

**Real Value:**
- **Error Prevention:** Catch manifest issues before they cause downstream failures
- **Quality:** Ensure manifests are complete and consistent

---

## Summary: Most Valuable Examples

### High Value (Implement First)
1. **Pre-AI Validation** - Save $6 per invalid order
2. **Similar Order Detection** - Save $6 per similar order reuse
3. **Error Pattern Detection** - Prevent recurring issues

### Medium Value (Implement After)
4. **Customer Correction Analysis** - Improve response time
5. **Story Validation** - Improve quality
6. **Manifest Validation** - Prevent errors

### Cost-Benefit Analysis

**Example 1 (Pre-AI Validation):**
- **Cost:** $0.00001 per validation
- **Savings:** $6 per invalid order caught (skip Bria AI)
- **Break-even:** If 1 in 600,000 orders is invalid (practically always worth it)
- **Realistic:** If 5% of orders are invalid → Save $0.30 per 10 orders

**Example 2 (Similar Order Detection):**
- **Cost:** $0.00001 per similarity search
- **Savings:** $6 per similar order found (reuse character)
- **Break-even:** If 1 in 600,000 orders is similar (practically always worth it)
- **Realistic:** If 10% of orders are similar → Save $0.60 per 10 orders

**Example 3 (Error Pattern Detection):**
- **Cost:** $0.00001 per error analysis
- **Savings:** Time saved fixing root causes vs. individual errors
- **Value:** Hard to quantify, but high (prevent future issues)

---

**Bottom Line:** Examples 1 and 2 have clear, measurable cost savings. Example 3 has high value for preventing future issues. Start with these three.


